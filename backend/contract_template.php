<?php
// Admin-editable lease contract (Admin → Edit Contract).
//
// The contract is one JSON document, versioned in contract_template_versions
// (highest version in force). Shape, as produced by contract_template_sanitize():
//
//   details          landlord_name, landlord_address, landlord_contact, property_address
//   payment_accounts [{ id, type: gcash|bank|ewallet|cash|other, label, account_number,
//                       account_name, note: {en, tl} }]
//   variables        [{ key, label, value }]            custom {{key}} placeholders
//   terms            { title, copy_label, subject, intro, signature_intro,
//                      closing_note: {en, tl},
//                      sections: [{ id, title: {en, tl},
//                                   clauses: [{ id, title: {en, tl}, body: {en, tl} }] }] }
//
// Clause text is plain text: **bold**, line breaks, and {{placeholder}} tokens
// (CONTRACT_BUILTIN_PLACEHOLDERS plus the custom variables). The frontend
// renders it as text nodes — no HTML is ever stored or interpreted.
//
// Requires config.php (for $conn helpers) to be loaded first.

// Filled in per tenant/contract by the renderer (ams-react/src/Components/contract/contractRender.js).
const CONTRACT_BUILTIN_PLACEHOLDERS = [
    'landlord_name', 'landlord_address', 'landlord_contact', 'property_address',
    'tenant_name', 'tenant_phone', 'tenant_previous_address', 'room', 'monthly_rent', 'advance_rent', 'security_deposit',
    'move_in_date', 'lease_start', 'lease_end', 'due_day', 'payment_methods',
];

const CONTRACT_PAYMENT_TYPES = ['gcash', 'bank', 'ewallet', 'cash', 'other'];

const CONTRACT_LIMITS = [
    'sections'        => 20,
    'clauses'         => 30,   // per section
    'accounts'        => 10,
    'variables'       => 30,
    'heading'         => 200,  // titles, labels
    'body'            => 5000, // clause body / intro / notes
    'detail'          => 150,  // landlord details
    'account_number'  => 40,
    'account_name'    => 100,
    'account_label'   => 60,
    'account_note'    => 150,
    'variable_label'  => 60,
    'variable_value'  => 200,
    'note'            => 255,  // version change note
];

function ct_text($en, $tl) {
    return ['en' => $en, 'tl' => $tl];
}

function ct_clause($id, $title, $body) {
    return ['id' => $id, 'title' => $title, 'body' => $body];
}

// The contract as it was hardcoded in ViewContract.jsx before it became
// editable. Landlord details come from the legacy system_settings keys, so an
// install that already set them keeps them.
function contract_template_default($conn) {
    return [
        'details' => [
            'landlord_name'    => (string)get_setting($conn, 'landlord_name', 'Elizabeth Angcanan'),
            'landlord_address' => (string)get_setting($conn, 'landlord_address', 'Tamak, Maguyam, Silang, Cavite'),
            'landlord_contact' => (string)get_setting($conn, 'landlord_contact', ''),
            'property_address' => (string)get_setting($conn, 'property_address', 'Sitio Engkanto, Brgy. Maguyam, Silang, Cavite'),
        ],
        'payment_accounts' => [
            ['id' => 'acct-gcash', 'type' => 'gcash', 'label' => 'GCash', 'account_number' => '*********', 'account_name' => '', 'note' => ct_text('', '')],
            ['id' => 'acct-bdo', 'type' => 'bank', 'label' => 'BDO', 'account_number' => '*********', 'account_name' => '', 'note' => ct_text('Savings account', 'Savings account')],
            ['id' => 'acct-bpi', 'type' => 'bank', 'label' => 'BPI', 'account_number' => '*********', 'account_name' => '', 'note' => ct_text('Savings account', 'Savings account')],
            ['id' => 'acct-cash', 'type' => 'cash', 'label' => 'Cash', 'account_number' => '', 'account_name' => '', 'note' => ct_text('May be handed directly to the apartment Owner.', 'Maaaring iabot nang direkta sa May-ari ng apartment.')],
        ],
        'variables' => [
            ['key' => 'occupancy_limit', 'label' => 'Occupancy limit (people)', 'value' => '4'],
            ['key' => 'excess_occupant_fee', 'label' => 'Fee per extra occupant', 'value' => '₱1,000'],
            ['key' => 'move_out_notice_days', 'label' => 'Move-out notice (days)', 'value' => '15'],
        ],
        'terms' => [
            'title'      => ct_text('APARTMENT RENT AGREEMENT', 'KONTRATA SA PAGPAPAUPA NG APARTMENT'),
            'copy_label' => ct_text('(Tenant Copy)', '(Kopya ng Nangungupahan)'),
            'subject'    => ct_text('SUBJECT: APARTMENT RENT', 'PAKSA: PAGPAPAUPA NG APARTMENT'),
            'intro'      => ct_text(
                'Under the following conditions, the Owner and the Tenant have agreed on the following rental terms for the apartment:',
                'Sa ilalim ng mga sumusunod na kondisyon, ang May-ari at ang Nangungupahan ay nagkasunduan sa mga sumusunod na tuntunin ng pagrenta ng apartment:'
            ),
            'sections' => [
                [
                    'id' => 'sec-description',
                    'title' => ct_text('DESCRIPTION OF THE APARTMENT', 'PAGLALARAWAN NG APARTMENT'),
                    'clauses' => [
                        ct_clause('cl-location', ct_text('Location and Address of the Apartment', 'Lokasyon at Adres ng Apartment'),
                            ct_text('{{property_address}}', '{{property_address}}')),
                        ct_clause('cl-description', ct_text('Description of the Apartment', 'Deskripsyon ng Apartment'), ct_text(
                            'The apartment has one (1) bedroom, one (1) bathroom, and sufficient space for a kitchen and living room. The unit is an appropriate size for a small family, group, or individual looking for simple housing. It has windows that provide light and air, and the apartment is in good condition.',
                            'Ang apartment ay may isang (1) kwarto, isang (1) palikuran, at may sapat na espasyo para sa kusina at sala. Ang unit ay may tamang laki para sa isang maliit na pamilya, grupo, o indibidwal na naghahanap ng simpleng tirahan. May mga bintana na nagbibigay liwanag at hangin, at ang apartment ay nasa maayos na kondisyon.'
                        )),
                        ct_clause('cl-capacity', ct_text('Maximum Capacity of the Apartment', 'Pinakamataas na Kapasidad ng Apartment'), ct_text(
                            'The maximum capacity of the apartment is {{occupancy_limit}} people only. Should the number of occupants exceed {{occupancy_limit}} people, the Tenant is required to pay an additional {{excess_occupant_fee}} per person exceeding the set capacity. These additional fees must be paid together with the monthly rent and cannot be deducted from the security deposit.',
                            'Ang pinakamataas na kapasidad ng apartment ay {{occupancy_limit}} na tao lamang. Kung sakaling lalagpas sa {{occupancy_limit}} na tao, kinakailangan ng Nangungupahan na magbayad ng karagdagang {{excess_occupant_fee}} kada tao na lalagpas sa itinakdang kapasidad. Ang mga dagdag na bayad na ito ay dapat bayaran kasama ng buwanang upa at hindi maaaring kunin mula sa security deposit.'
                        )),
                        ct_clause('cl-move-in', ct_text('Move-in Date', 'Petsa ng Pagpasok'),
                            ct_text('{{move_in_date}}', '{{move_in_date}}')),
                        ct_clause('cl-term', ct_text('Rent Term', 'Panahon ng Pag-upa'),
                            ct_text('{{lease_start}} to {{lease_end}}', '{{lease_start}} hanggang {{lease_end}}')),
                    ],
                ],
                [
                    'id' => 'sec-rent',
                    'title' => ct_text('RENT PAYMENT TERMS', 'MGA TUNTUNIN SA PAGBABAYAD NG UPA'),
                    'clauses' => [
                        ct_clause('cl-rent', ct_text('Amount of Monthly Rent', 'Halaga ng Buwanang Upa'), ct_text(
                            'The monthly rent for Room {{room}} is {{monthly_rent}} per month.',
                            'Ang buwanang upa para sa Room {{room}} ay {{monthly_rent}} kada buwan.'
                        )),
                        ct_clause('cl-methods', ct_text('Primary Payment Methods', 'Pangunahing Paraan ng Pagbabayad'), ct_text(
                            "Rent payment may be made through any of the following methods:\n{{payment_methods}}",
                            "Ang pagbabayad ng renta ay maaaring gawin sa alinman sa mga sumusunod na paraan:\n{{payment_methods}}"
                        )),
                        ct_clause('cl-advance', ct_text('Advance Rent', 'Paunang Bayad sa Upa (Advance Rent)'), ct_text(
                            "Before moving in, the Tenant shall pay one (1) month's advance rent amounting to {{advance_rent}}. This is credited to the rent for the first month of occupancy and is separate from the security deposit.",
                            'Bago pumasok sa unit, ang Nangungupahan ay magbabayad ng paunang upa para sa unang buwan na nagkakahalaga ng {{advance_rent}}. Ito ay ibinibilang sa upa ng unang buwan ng pananatili at hindi bahagi ng security deposit.'
                        )),
                        ct_clause('cl-deposit', ct_text('Security Deposit', 'Security Deposit'), ct_text(
                            "In addition to the advance rent, the Tenant shall pay a security deposit amounting to {{security_deposit}}, equivalent to one month's rent. The deposit shall serve as a guarantee against possible damages or unpaid expenses.",
                            "Bukod sa paunang upa, ang Nangungupahan ay magbabayad ng security deposit na nagkakahalaga ng {{security_deposit}}, katumbas ng isang buwang upa. Ang deposito ay magsisilbing garantiya para sa mga posibleng pinsala o hindi nabayarang gastusin."
                        )),
                        ct_clause('cl-due-date', ct_text('Due Date Reminder', 'Paalala sa Takdang Araw ng Bayad'), ct_text(
                            "Rent payment must be given on or before the due date each month. The monthly due date for rent payment is day {{due_day}} of the month.\n**Note:** Should the Tenant be unable to pay before the set due date, the Tenant is encouraged to immediately contact the Owner to discuss the possibility of an extension or alternative payment arrangement.",
                            "Ang bayad sa upa ay dapat maibigay bago o sa takdang araw ng bawat buwan. Ang buwanang takdang araw ng pagbabayad ay ang ika-{{due_day}} ng buwan.\n**Tandaan:** Kung sakaling hindi makapagbayad bago ang itinakdang due date, hinihikayat ang Nangungupahan na agad makipag-ugnayan sa May-ari upang mapag-usapan ang posibilidad ng palugit o alternatibong paraan ng pagbabayad."
                        )),
                        ct_clause('cl-advice', ct_text('Advice on Rent Payment', 'Payo sa Pagbabayad ng Upa'), ct_text(
                            "No penalty is imposed for payment made on the due date itself. However, **the Tenant is encouraged to pay on the correct time and day** each month. Under RA 9653 Sec. 9, **rent left unpaid for a total of three (3) months is a ground for ejectment**.\nShould the Tenant experience difficulty in payment, **they may contact the Owner** to request an **extension**. The Owner is considerate and may grant an extension based on the Tenant's situation.",
                            "Walang multang ipinapataw kung magbabayad sa mismong takdang araw. Subalit, **hinihikayat ang Nangungupahan na magbayad sa tamang oras at araw** ng bawat buwan. Ayon sa RA 9653 Sek. 9, **ang upa na hindi nabayaran nang may kabuuang tatlong (3) buwan ay batayan ng pagpapaalis**.\nKung sakaling nahirapan sa pagbabayad, **maaaring makipag-ugnayan sa May-ari** upang humiling ng **palugit sa pagbabayad**. Ang May-ari ay may konsiderasyon at maaaring magbigay ng palugit batay sa sitwasyon ng Nangungupahan."
                        )),
                        ct_clause('cl-proof', ct_text('Proof of Payment', 'Pagpapatunay ng Pagbabayad'), ct_text(
                            'If the Tenant pays via **GCash or bank transfer**, they are required to send a **screenshot** of their payment to the Owner via **Facebook Messenger** to the account of **{{landlord_name}}**. The payment screenshot shall serve as proof of their rent payment obligation for the current month.',
                            'Kung ang Nangungupahan ay nagbayad sa pamamagitan ng **GCash o bank transfer**, kinakailangan nilang magpadala ng **larawan ng resibo (screenshot)** ng kanilang pagbabayad sa May-ari sa pamamagitan ng **Facebook Messenger** sa account na **{{landlord_name}}**. Ang larawang ito ng pagbabayad ay magsisilbing patunay ng kanilang obligasyon sa pagbabayad ng upa para sa kasalukuyang buwan.'
                        )),
                    ],
                ],
                [
                    'id' => 'sec-owner',
                    'title' => ct_text('RESPONSIBILITIES OF THE OWNER', 'MGA RESPONSIBILIDAD NG MAY-ARI'),
                    'clauses' => [
                        ct_clause('cl-owner-maintenance', ct_text('Care and Maintenance', 'Pag-aalaga at Pag-maintenance'), ct_text(
                            "The Owner is responsible for repairing major damages and maintaining the apartment. Major damages pertain to the apartment's water, electrical, and structural systems.",
                            'Ang May-ari ay responsable sa pagpapagawa ng mga pangunahing sira at pagkukumpuni ng apartment. Ang mga pangunahing sira ay may kinalaman sa mga sistema ng tubig, kuryente, at estruktura ng apartment.'
                        )),
                        ct_clause('cl-owner-housing', ct_text('Providing Proper Housing', 'Pagbibigay ng Maayos na Tirahan'), ct_text(
                            'The Owner ensures that the apartment is clean, well-maintained, and safe to use before the rent term begins.',
                            'Tinitiyak ng May-ari na ang apartment ay malinis, maayos, at ligtas gamitin bago magpatuloy ang pagrenta.'
                        )),
                    ],
                ],
                [
                    'id' => 'sec-tenant',
                    'title' => ct_text('RESPONSIBILITIES OF THE TENANT', 'MGA RESPONSIBILIDAD NG NANGUNGUPAHAN'),
                    'clauses' => [
                        ct_clause('cl-tenant-care', ct_text('Care of the Apartment', 'Pag-aalaga ng Apartment'), ct_text(
                            'The Tenant must take care of and maintain the cleanliness and orderliness of the apartment, including the items and fixtures included in the unit.',
                            'Ang Nangungupahan ay dapat mag-ingat at mag-maintain ng kalinisan at kaayusan ng apartment, pati na ang mga gamit at kagamitan na kasama sa unit.'
                        )),
                        ct_clause('cl-tenant-alterations', ct_text('No Structural Alterations', 'Hindi Pagpapabago ng Estruktura'), ct_text(
                            "No part of the apartment may be altered, damaged, or made permanent use of (for example, drilling holes in the wall, attaching hard-to-remove adhesives to the wall) without the Owner's permission.",
                            'Hindi maaaring baguhin, sirain, o gawing permanenteng gamit ang anumang bahagi ng apartment (halimbawa, magbutas ng pader, magdikit sa pader gamit ang pandikit na mahirap alisin) nang walang pahintulot ng May-ari.'
                        )),
                        ct_clause('cl-tenant-utilities', ct_text('Payment of Utility Bills', 'Pagbabayad ng mga Singil sa Serbisyo'), ct_text(
                            'The Tenant shall be responsible for all expenses related to electricity, water, internet, and other utility services, unless otherwise agreed.',
                            'Ang Nangungupahan ay mananagot sa lahat ng mga gastusin sa kuryente, tubig, internet, at iba pang serbisyo maliban kung magkakaroon ng ibang kasunduan.'
                        )),
                        ct_clause('cl-tenant-disconnection', ct_text('Non-Payment of Electricity and Water', 'Hindi Pagbabayad ng Kuryente at Tubig'), ct_text(
                            "Should the apartment's **electricity and water** be disconnected due to non-payment of utility bills, the Owner shall not be **responsible** for the cost of reconnecting these services. The Tenant **must pay** the overdue bills and ensure prompt payment to avoid delays in these services. The Owner shall not be liable for any inconvenience caused by the lack of electricity and water.",
                            'Kung sakaling maputulan ng **kuryente at tubig** ang apartment dahil sa hindi pagbabayad ng mga singil, hindi magiging **responsibilidad** ng May-ari ang pagbabayad para sa muling pagkonekta sa mga serbisyong ito. Ang Nangungupahan ay **dapat magbayad** ng mga nakaraang singil at tiyakin ang agarang pagbabayad upang maiwasan ang pagkaantala sa mga serbisyong ito. Ang May-ari ay hindi mananagot para sa anumang abala o istorbong dulot ng hindi pagkakaroon ng kuryente at tubig.'
                        )),
                        ct_clause('cl-tenant-inspection', ct_text('Acceptance of Unit Inspection', 'Pagtanggap sa Pagsusuri ng Unit'), ct_text(
                            'The Tenant agrees to allow the Owner to conduct an inspection of the unit to ensure that it is in proper condition and that there is no damage to the fixtures.',
                            'Ang Nangungupahan ay papayag na magsagawa ng pagsusuri o inspeksyon ang May-ari sa unit para tiyakin na ito ay nasa tamang kondisyon at walang sira o pinsala sa mga kagamitan.'
                        )),
                    ],
                ],
                [
                    'id' => 'sec-termination',
                    'title' => ct_text('TERMINATION OF THE CONTRACT', 'PAGWAWAKAS NG KONTRATA'),
                    'clauses' => [
                        ct_clause('cl-violation', ct_text('Violation of Contract Terms', 'Paglabag sa Mga Tuntunin ng Kontrata'), ct_text(
                            'Either the Owner or the Tenant has the right to terminate the contract in case of a serious violation of the terms of the agreement.',
                            'Ang May-ari o ang Nangungupahan ay may karapatan na tapusin ang kontrata kung may malubhang paglabag sa mga kondisyon ng kasunduan.'
                        )),
                        ct_clause('cl-ending', ct_text('Ending the Contract', 'Pagtatapos ng Kontrata'), ct_text(
                            "Should either party wish to end the contract, prior notice must be given to the other party at least {{move_out_notice_days}} days before the Tenant's actual move-out.",
                            'Kung nais ng alinmang panig na tapusin ang kontrata, kinakailangan na magbigay ng paunang abiso sa kabilang panig ng hindi bababa sa {{move_out_notice_days}} na araw bago ang aktwal na paglabas ng Nangungupahan.'
                        )),
                        ct_clause('cl-ejectment', ct_text('Grounds for Ejectment (RA 9653)', 'Mga Batayan ng Pagpapaalis (RA 9653)'), ct_text(
                            "The Owner may ask the Tenant to leave only on the grounds in Section 9 of the Rent Control Act of 2009 (RA 9653): (a) subleasing or assigning the unit without the Owner's written consent; (b) rent unpaid for a total of three (3) months; (c) the Owner or an immediate family member needs the unit, after the rent term has expired and with formal notice three (3) months in advance; (d) an order of condemnation requiring repairs; or (e) the expiry of the rent term. The sale or mortgage of the property is not a ground. If the Tenant does not agree to leave, only a court can order it; the Owner will not lock the Tenant out or cut off the Tenant's utilities.",
                            'Maaari lamang paalisin ng May-ari ang Nangungupahan batay sa mga dahilan sa Seksyon 9 ng Rent Control Act of 2009 (RA 9653): (a) pagpapaupa muli o paglilipat ng unit nang walang nakasulat na pahintulot ng May-ari; (b) upa na hindi nabayaran nang may kabuuang tatlong (3) buwan; (c) kailangan ng May-ari o ng malapit na kapamilya ang unit, matapos ang panahon ng pag-upa at may pormal na abiso tatlong (3) buwan bago nito; (d) kautusan ng pagkondena na nangangailangan ng pagkukumpuni; o (e) pagtatapos ng panahon ng pag-upa. Ang pagbebenta o pagsasangla ng ari-arian ay hindi batayan. Kung hindi pumayag ang Nangungupahan na umalis, hukuman lamang ang maaaring mag-utos nito; hindi ikakandado ng May-ari ang Nangungupahan sa labas o puputulan ng mga serbisyo.'
                        )),
                    ],
                ],
                [
                    'id' => 'sec-other',
                    'title' => ct_text('OTHER TERMS', 'IBA PANG MGA TUNTUNIN'),
                    'clauses' => [
                        ct_clause('cl-transfer', ct_text('Transfer of Rights', 'Paglilipat ng Karapatan'), ct_text(
                            "The Tenant may not transfer, assign, or sublease to another person the rights or responsibilities stated in this contract without the Owner's written permission.",
                            'Hindi maaaring ilipat, isalin, o ipaupa muli ng Nangungupahan sa iba ang mga karapatan o responsibilidad na nakasaad sa kontratang ito nang walang nakasulat na pahintulot mula sa May-ari.'
                        )),
                        ct_clause('cl-amendment', ct_text('Amendment of the Agreement', 'Pagbabago ng Kasunduan'), ct_text(
                            'Any change or addition to this contract shall only take effect once it is put in writing and signed by both parties.',
                            'Ang anumang pagbabago o karagdagan sa kontratang ito ay magiging epektibo lamang kapag nakasulat at pinirmahan ng parehong partido.'
                        )),
                    ],
                ],
            ],
            'signature_intro' => ct_text(
                'This contract has been affirmed and signed by both parties as proof of their agreement.',
                'Pinagtibay at pinirmahan ng dalawang partido ang kontratang ito bilang patunay ng kanilang kasunduan.'
            ),
            'closing_note' => ct_text(
                "The Tenant's signature on each page of the contract signifies that they have accepted and understood every condition and term stated. This contract shall only take effect once it has been fully signed by both parties.",
                'Ang pagpirma ng Nangungupahan sa bawat pahina ng kontrata ay nangangahulugang tinanggap niya at naunawaan ang bawat nakasaad na kondisyon at tuntunin. Ang kontratang ito ay magiging epektibo lamang kapag ganap nang napirmahan ng parehong panig.'
            ),
        ],
    ];
}

// ── Reading ──

function contract_template_row($conn, $version_id = null) {
    $sql = "SELECT v.id, v.version, v.content, v.note, v.created_at, v.created_by,
                   TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), ''))) AS created_by_name
            FROM contract_template_versions v LEFT JOIN users u ON u.id = v.created_by ";
    if ($version_id !== null) {
        $stmt = $conn->prepare($sql . "WHERE v.id = ?");
        $stmt->bind_param("i", $version_id);
    } else {
        $stmt = $conn->prepare($sql . "ORDER BY v.version DESC LIMIT 1");
    }
    if (!$stmt) return null;
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) return null;
    $content = json_decode($row['content'], true);
    if (!is_array($content)) return null;
    $row['content'] = $content;
    return $row;
}

// The template in force: the latest saved version, else the built-in default.
// Returns ['content', 'id', 'version', 'note', 'created_at', 'created_by_name', 'is_default'].
function contract_template_current($conn) {
    $row = contract_template_row($conn);
    if ($row) {
        $row['is_default'] = false;
        return $row;
    }
    return [
        'content' => contract_template_default($conn), 'id' => null, 'version' => 0,
        'note' => null, 'created_at' => null, 'created_by_name' => null, 'is_default' => true,
    ];
}

// Id of the version a newly issued contract should pin. The first contract
// issued before any admin save writes the default as version 1, so its terms
// stay fixed even after the template is later edited. Returns null only if the
// table is missing (migration not run) — the contract then shows the latest terms.
function contract_template_pin_version_id($conn) {
    $row = contract_template_row($conn);
    if ($row) return (int)$row['id'];

    $content = json_encode(contract_template_default($conn), JSON_UNESCAPED_UNICODE);
    $note = 'Built-in default';
    $stmt = $conn->prepare("INSERT IGNORE INTO contract_template_versions (version, content, note, created_by) VALUES (1, ?, ?, NULL)");
    if (!$stmt) return null;
    $stmt->bind_param("ss", $content, $note);
    $stmt->execute();
    $stmt->close();

    $row = contract_template_row($conn);
    return $row ? (int)$row['id'] : null;
}

// ── Validation ──

// Trimmed string, or an error message if it is too long / required and empty.
function ct_clean_string($value, $max, $label, $required, &$error) {
    if ($value === null) $value = '';
    if (!is_string($value) && !is_numeric($value)) {
        $error = "$label must be text.";
        return '';
    }
    // Normalise line endings; keep interior newlines (they are paragraph breaks).
    $value = trim(str_replace(["\r\n", "\r"], "\n", (string)$value));
    if ($required && $value === '') {
        $error = "$label is required.";
        return '';
    }
    if (mb_strlen($value) > $max) {
        $error = "$label is longer than $max characters.";
        return '';
    }
    return $value;
}

// Bilingual field: at least one language when required; the renderer falls
// back to the other language when one is blank.
function ct_clean_bilingual($value, $max, $label, $required, &$error) {
    $value = is_array($value) ? $value : [];
    $en = ct_clean_string($value['en'] ?? '', $max, "$label (English)", false, $error);
    if ($error) return null;
    $tl = ct_clean_string($value['tl'] ?? '', $max, "$label (Tagalog)", false, $error);
    if ($error) return null;
    if ($required && $en === '' && $tl === '') {
        $error = "$label is required in at least one language.";
        return null;
    }
    return ['en' => $en, 'tl' => $tl];
}

function ct_clean_id($value, $prefix, $index) {
    return (is_string($value) && preg_match('/^[A-Za-z0-9_-]{1,40}$/', $value)) ? $value : $prefix . '-' . ($index + 1);
}

// Rebuilds the document from whitelisted fields only. Returns the clean array,
// or null with $error set to a message naming the offending field.
function contract_template_sanitize($input, &$error) {
    $error = null;
    if (!is_array($input)) { $error = 'Contract template is missing.'; return null; }
    $L = CONTRACT_LIMITS;
    $out = [];

    // Details
    $d = is_array($input['details'] ?? null) ? $input['details'] : [];
    $labels = [
        'landlord_name' => 'Owner name', 'landlord_address' => "Owner's address",
        'landlord_contact' => 'Owner contact number', 'property_address' => 'Property address',
    ];
    foreach ($labels as $key => $label) {
        $out['details'][$key] = ct_clean_string($d[$key] ?? '', $L['detail'], $label, $key === 'landlord_name', $error);
        if ($error) return null;
    }

    // Payment accounts
    $accounts = is_array($input['payment_accounts'] ?? null) ? array_values($input['payment_accounts']) : [];
    if (count($accounts) > $L['accounts']) { $error = "At most {$L['accounts']} payment accounts are allowed."; return null; }
    $out['payment_accounts'] = [];
    foreach ($accounts as $i => $a) {
        if (!is_array($a)) { $error = 'Invalid payment account.'; return null; }
        $n = $i + 1;
        $type = in_array($a['type'] ?? '', CONTRACT_PAYMENT_TYPES, true) ? $a['type'] : null;
        if (!$type) { $error = "Payment account #$n has an unknown type."; return null; }
        $label = ct_clean_string($a['label'] ?? '', $L['account_label'], "Payment account #$n name", true, $error);
        if ($error) return null;
        $number = ct_clean_string($a['account_number'] ?? '', $L['account_number'], "Payment account #$n number", false, $error);
        if ($error) return null;
        if ($number !== '' && !preg_match('/^[0-9A-Za-z *#().+\/-]+$/', $number)) {
            $error = "Payment account #$n number may only contain letters, digits, spaces and - ( ) + / * #.";
            return null;
        }
        $name = ct_clean_string($a['account_name'] ?? '', $L['account_name'], "Payment account #$n account name", false, $error);
        if ($error) return null;
        $note = ct_clean_bilingual($a['note'] ?? [], $L['account_note'], "Payment account #$n note", false, $error);
        if ($error) return null;
        $out['payment_accounts'][] = [
            'id' => ct_clean_id($a['id'] ?? null, 'acct', $i), 'type' => $type, 'label' => $label,
            'account_number' => $number, 'account_name' => $name, 'note' => $note,
        ];
    }

    // Custom variables
    $vars = is_array($input['variables'] ?? null) ? array_values($input['variables']) : [];
    if (count($vars) > $L['variables']) { $error = "At most {$L['variables']} custom values are allowed."; return null; }
    $out['variables'] = [];
    $seen = [];
    foreach ($vars as $i => $v) {
        if (!is_array($v)) { $error = 'Invalid custom value.'; return null; }
        $n = $i + 1;
        $key = is_string($v['key'] ?? null) ? strtolower(trim($v['key'])) : '';
        if (!preg_match('/^[a-z][a-z0-9_]{1,39}$/', $key)) {
            $error = "Custom value #$n needs a placeholder name of 2-40 lowercase letters, digits or underscores, starting with a letter.";
            return null;
        }
        if (in_array($key, CONTRACT_BUILTIN_PLACEHOLDERS, true)) { $error = "{{{$key}}} is a built-in placeholder; choose another name for custom value #$n."; return null; }
        if (isset($seen[$key])) { $error = "The placeholder {{{$key}}} is defined twice."; return null; }
        $seen[$key] = true;
        $label = ct_clean_string($v['label'] ?? '', $L['variable_label'], "Custom value #$n label", true, $error);
        if ($error) return null;
        $value = ct_clean_string($v['value'] ?? '', $L['variable_value'], "Custom value #$n", false, $error);
        if ($error) return null;
        $out['variables'][] = ['key' => $key, 'label' => $label, 'value' => $value];
    }

    // Terms
    $t = is_array($input['terms'] ?? null) ? $input['terms'] : [];
    $heads = ['title' => ['Contract title', true], 'copy_label' => ['Copy label', false], 'subject' => ['Subject heading', false]];
    foreach ($heads as $key => [$label, $required]) {
        $out['terms'][$key] = ct_clean_bilingual($t[$key] ?? [], $L['heading'], $label, $required, $error);
        if ($error) return null;
    }
    foreach (['intro' => 'Introduction', 'signature_intro' => 'Signature statement', 'closing_note' => 'Closing reminder'] as $key => $label) {
        $out['terms'][$key] = ct_clean_bilingual($t[$key] ?? [], $L['body'], $label, false, $error);
        if ($error) return null;
    }

    $sections = is_array($t['sections'] ?? null) ? array_values($t['sections']) : [];
    if (!$sections) { $error = 'The contract needs at least one section.'; return null; }
    if (count($sections) > $L['sections']) { $error = "At most {$L['sections']} sections are allowed."; return null; }
    $out['terms']['sections'] = [];
    foreach ($sections as $si => $s) {
        if (!is_array($s)) { $error = 'Invalid section.'; return null; }
        $sn = $si + 1;
        $title = ct_clean_bilingual($s['title'] ?? [], $L['heading'], "Section $sn title", true, $error);
        if ($error) return null;
        $clauses = is_array($s['clauses'] ?? null) ? array_values($s['clauses']) : [];
        if (!$clauses) { $error = "Section $sn has no clauses; add one or remove the section."; return null; }
        if (count($clauses) > $L['clauses']) { $error = "Section $sn has more than {$L['clauses']} clauses."; return null; }
        $clean_clauses = [];
        foreach ($clauses as $ci => $c) {
            if (!is_array($c)) { $error = 'Invalid clause.'; return null; }
            $cn = $ci + 1;
            $ctitle = ct_clean_bilingual($c['title'] ?? [], $L['heading'], "Section $sn, clause $cn title", false, $error);
            if ($error) return null;
            $cbody = ct_clean_bilingual($c['body'] ?? [], $L['body'], "Section $sn, clause $cn text", true, $error);
            if ($error) return null;
            $clean_clauses[] = ['id' => ct_clean_id($c['id'] ?? null, "cl-$sn", $ci), 'title' => $ctitle, 'body' => $cbody];
        }
        $out['terms']['sections'][] = ['id' => ct_clean_id($s['id'] ?? null, 'sec', $si), 'title' => $title, 'clauses' => $clean_clauses];
    }

    return $out;
}

// Short description of what changed between two documents, for the activity log.
function contract_template_change_summary($old, $new) {
    $parts = [];
    if (($old['details'] ?? null) != $new['details']) $parts[] = 'landlord details';
    if (($old['payment_accounts'] ?? null) != $new['payment_accounts']) $parts[] = 'payment accounts';
    if (($old['variables'] ?? null) != $new['variables']) $parts[] = 'custom values';
    if (($old['terms'] ?? null) != $new['terms']) $parts[] = 'clauses/terms';
    return $parts ? implode(', ', $parts) : 'no content changes';
}
