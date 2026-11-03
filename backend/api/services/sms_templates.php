<?php
/**
 * AMS SMS templates. Each function returns the plain text of one SMS.
 *
 * The SMS counterpart of email_templates.php, one function per event, built to
 * Semaphore's rules (semaphore.co/docs, /faq, /terms) and the PH carrier rules
 * in docs/features/sms_email_implementation.md §0.4:
 *
 *   R1  One credit per 160 ASCII characters; a longer text is split and billed
 *       per 153. Every template is at most 160 characters AFTER gsm7_safe(), so
 *       the length measured here is the length Semaphore bills.
 *   R2  Non-ASCII switches the message to Unicode (70 per segment). Fixed text is
 *       plain ASCII (PHP 5,490.00, "-", straight quotes); free text goes through
 *       gsm7_safe() before it is measured.
 *   R3  A message that starts with "TEST" is silently dropped. Every template
 *       starts with "AMS"; sms_avoid_ignored_prefix() remains the backstop.
 *   R4  No impersonation: "AMS" names the real sender even while messages go out
 *       under Semaphore's shared sender name.
 *   R5  No links: carriers filter A2P SMS with URLs and block shorteners. No
 *       template contains one, and sms_fit() strips any from free text.
 *   R6  Transactional only: each text is a fact about the tenant's own account
 *       or request, never an advertisement.
 *   R7  No sensitive data: no passwords, OTPs, invoice or payment references.
 *       The amount and unit are fine; the invoice ID stays in email and in-app.
 *   R8  No repeated sends: templates never add a send; the callers' daily
 *       claims and the SMS cap decide how often a tenant is texted.
 *
 * Only the free-text part of a message (a title, label, reason or body) is ever
 * shortened, at a word boundary with "...". The facts around it (status,
 * amount, date, unit) are kept whole, so a long reason can no longer push the
 * status off the end the way a blind 160-character cut did.
 *
 * config.php must already be loaded (gsm7_safe(), sms_single_segment()).
 */

const SMS_LIMIT = 160;

// Links in admin- or tenant-written text (R5): scheme URLs, www. hosts, a
// domain with a path, and bare domains on the TLDs shorteners and scams use.
// The sentence's own punctuation after a link is kept.
function sms_strip_links($text) {
    $text = preg_replace('~\b(?:https?://|www\.)\S*[^\s.,;:!?)]~i', '', (string)$text);
    $text = preg_replace('~\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/\S*[^\s.,;:!?)]~i', '', $text);
    $text = preg_replace('~\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|ph|io|ly|co|me|gl|to|xyz|link|app|info|site|online)\b~i', '', $text);
    return preg_replace('/\s+([.,;:!?])/', '$1', $text);
}

// Free text on one line, ASCII only, links removed.
function sms_clean($text) {
    $text = gsm7_safe(sms_strip_links($text));
    return trim(preg_replace('/\s+/', ' ', $text));
}

// Shorten to $max characters at a word boundary, ending with "...".
function sms_shorten($text, $max) {
    if (mb_strlen($text) <= $max) return $text;
    if ($max < 4) return '';
    $cut = mb_substr($text, 0, $max - 3);
    $space = mb_strrpos($cut, ' ');
    if ($space !== false && $space >= ($max - 3) / 2) $cut = mb_substr($cut, 0, $space);
    return rtrim($cut, " ,.;:-") . '...';
}

/**
 * $head . $flex . $tail in one segment, shortening only $flex. $head and $tail
 * are template text and pass through gsm7_safe(); $flex is free text and is
 * cleaned with sms_clean(). An empty $flex drops the separator $head ends with.
 */
function sms_fit($head, $flex, $tail = '', $limit = SMS_LIMIT) {
    $head = gsm7_safe($head);
    $tail = gsm7_safe($tail);
    $flex = sms_clean($flex);
    $room = $limit - mb_strlen($head) - mb_strlen($tail);
    $flex = $room > 0 ? sms_shorten($flex, $room) : '';
    $text = $flex === '' ? rtrim($head, ' -:') . $tail : $head . $flex . $tail;
    // Only reachable with absurd fixed parts; still never more than one segment.
    return sms_single_segment($text, $limit);
}

// "Unit A", or "your unit" when the invoice or lease has none.
function sms_unit($room) {
    $room = sms_shorten(sms_clean($room), 20);
    return ($room === '' || strcasecmp($room, 'no unit') === 0) ? 'your unit' : "Unit $room";
}

function sms_amount($amount) {
    return 'PHP ' . number_format((float)$amount, 2);
}

function sms_date($date) {
    $ts = strtotime((string)$date);
    return $ts ? date('M j, Y', $ts) : sms_clean($date);
}

function sms_days($n) {
    return $n === 1 ? '1 day' : "$n days";
}

function sms_announcement_template($title, $body, $tag = 'General') {
    $tag = sms_shorten(sms_clean($tag), 12);
    $prefix = ($tag === '' || strcasecmp($tag, 'General') === 0) ? 'AMS: ' : "AMS $tag: ";
    $title = sms_shorten(sms_clean($title), 60);
    return sms_fit($prefix . $title . ' - ', $body);
}

/**
 * Rent due or overdue. $event is 'overdue' or 'rent_due', as for
 * email_payment_template(). A custom admin message replaces the wording but
 * keeps the amount and due date.
 */
function sms_payment_template($amount, $room, $due_date, $event, $custom_message = '', ?DateTime $today = null) {
    $today = $today ?? new DateTime(date('Y-m-d'));
    $due = new DateTime(date('Y-m-d', strtotime((string)$due_date) ?: time()));
    $amt = sms_amount($amount);
    $unit = sms_unit($room);
    $due_text = $due->format('M j, Y');

    if (trim((string)$custom_message) !== '') {
        return sms_fit('AMS: ', $custom_message, " ($amt due $due_text)");
    }
    if ($event === 'overdue') {
        $days = (int)$due->diff($today)->format('%a');
        return sms_fit("AMS: Payment of $amt for $unit was due $due_text (" . sms_days($days) . " overdue). Please pay now to avoid further penalties.", '');
    }
    $days = (int)$today->diff($due)->format('%r%a');
    if ($days <= 0) {
        return sms_fit("AMS: Payment of $amt for $unit is due today, $due_text. Please pay via your tenant portal.", '');
    }
    return sms_fit("AMS: Payment of $amt for $unit is due $due_text (" . sms_days($days) . " left). Please pay via your tenant portal.", '');
}

/**
 * A request changed status. $request_type names the module ("maintenance",
 * "parking"); pass '' when $request_label already reads as the whole request
 * ("lease extension request"). $details is the reason or the one fact the
 * status does not say, and takes whatever room is left.
 */
function sms_status_update_template($request_type, $request_label, $new_status, $details = '') {
    $type = sms_shorten(sms_clean($request_type), 20);
    $status = sms_shorten(sms_clean($new_status), 20);
    if ($type !== '') {
        $label = sms_shorten(sms_clean($request_label), 40);
        $head = "AMS: Your $type request" . ($label !== '' ? " \"$label\"" : '');
    } else {
        $label = sms_shorten(sms_clean($request_label), 70);
        $head = 'AMS: Your ' . ($label !== '' ? $label : 'request');
    }
    return sms_fit("$head is now $status. ", $details);
}

// $deadline: the last day to ask for an extension (Settings → Contract End), or null.
function sms_lease_reminder_template($room, $lease_end, $days_left, $deadline = null) {
    $days_left = max(0, (int)$days_left);
    $when = $days_left === 0 ? 'today' : sms_days($days_left) . ' left';
    $ask = $deadline
        ? ' To stay, request an extension in My Room by ' . sms_date($deadline) . '.'
        : ' To stay, request an extension in My Room or contact the office.';
    return sms_fit('AMS: Your rent for ' . sms_unit($room) . ' ends ' . sms_date($lease_end) . " ($when)." . $ask, '');
}

function sms_test_template($stamp) {
    return sms_fit("AMS: Test message sent $stamp. If you received this, SMS notifications are working.", '');
}
