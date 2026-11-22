<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";
require_once __DIR__ . '/../followups.php';

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

// Release any holds that lapsed since the last look, so the board is accurate.
$expired_count = release_expired_reservations($conn);
// Inquiries and reports that went quiet (Inquiry settings; backend/followups.php).
run_followup_sweep($conn);

$inquiries = [];
$query = "SELECT i.id,
                 i.id AS rawId,
                 i.user_id AS userId,
                 i.full_name AS fullName,
                 i.email,
                 i.contact_no AS contactNo,
                 i.room_name AS unit,
                 i.occupants,
                 i.preferred_move_in AS preferredMoveIn,
                 i.message,
                 i.source,
                 i.status,
                 i.viewing_date AS viewingDate,
                 i.admin_notes AS adminNotes,
                 i.closed_reason AS closedReason,
                 i.created_at AS createdAt,
                 i.thread_type AS threadType,
                 i.matched_thread_id AS matchedThreadId,
                 i.admin_seen_at AS adminSeenAt,
                 i.guest_chat_ended_at AS chatEndedAt,
                 -- Unread prospect messages in the inquiry's chat (guest thread, or the
                 -- account conversation since the inquiry), for the list's red chat count.
                 -- An account counts only while it never applied: an applicant's or a
                 -- tenant's chat is answered in the chat widget / Messages, not here
                 -- (same rule as dashboard_stats.php inquiry_messages).
                 CASE WHEN i.thread_type = 'guest'
                      THEN (SELECT COUNT(*) FROM guest_messages g WHERE g.inquiry_id = i.id AND g.sender_role = 'guest' AND g.is_read = 0)
                      WHEN i.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM rent_applications ra WHERE ra.user_id = i.user_id)
                      THEN (SELECT COUNT(*) FROM messages m JOIN users a ON a.id = m.receiver_id AND a.role = 'admin'
                            WHERE m.sender_id = i.user_id AND m.is_read = 0 AND m.created_at >= i.created_at)
                      ELSE 0 END AS unreadCount,
                 r.type AS roomType,
                 r.monthly_rent AS monthlyRent,
                 r.status AS roomStatus,
                 ur.id AS activeReservationId,
                 ur.hold_expires_at AS holdExpiresAt
          FROM inquiries i
          LEFT JOIN rooms r ON r.id = i.room_name
          LEFT JOIN unit_reservations ur ON ur.inquiry_id = i.id AND ur.status = 'Active'
          ORDER BY i.id DESC";

$res = $conn->query($query);
while ($row = $res->fetch_assoc()) {
    // guest / account / none: where the Inquiries chat window can reply (backend/inquiries.php).
    $row['channel'] = inquiry_channel(['thread_type' => $row['threadType'], 'user_id' => $row['userId']]);
    $row['unreadCount'] = (int)$row['unreadCount'];
    $inquiries[] = $row;
}

$reservations = [];
$res_query = "SELECT ur.id,
                     ur.id AS rawId,
                     ur.inquiry_id AS inquiryId,
                     ur.user_id AS userId,
                     ur.room_name AS unit,
                     ur.reserved_for_name AS reservedFor,
                     ur.contact_no AS contactNo,
                     ur.email,
                     ur.hold_expires_at AS holdExpiresAt,
                     ur.reservation_fee AS reservationFee,
                     ur.status,
                     ur.notes,
                     ur.released_at AS releasedAt,
                     ur.released_reason AS releasedReason,
                     ur.created_at AS createdAt,
                     DATEDIFF(ur.hold_expires_at, CURDATE()) AS daysRemaining,
                     r.type AS roomType,
                     r.monthly_rent AS monthlyRent
              FROM unit_reservations ur
              LEFT JOIN rooms r ON r.id = ur.room_name
              ORDER BY ur.id DESC";

$res2 = $conn->query($res_query);
while ($row = $res2->fetch_assoc()) {
    $reservations[] = $row;
}

echo json_encode([
    "success" => true,
    "inquiries" => $inquiries,
    "reservations" => $reservations,
    "expiredReleased" => $expired_count
]);

$conn->close();
?>
