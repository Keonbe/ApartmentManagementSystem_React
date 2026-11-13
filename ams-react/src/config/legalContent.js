// Terms of Service and Privacy Notice shown at registration (LegalModal).
// Every statement describes what the system does today: when archiving,
// retention, file access or data sharing changes, update this file in the same task.
// Shape: LEGAL[lang][doc] = { title, updated, intro, sections: [{ h, p?: [], li?: [] }] }

const UPDATED_EN = 'Last updated: November 3, 2026';
const UPDATED_FIL = 'Huling na-update: Nobyembre 3, 2026';

const en = {
  terms: {
    title: 'Terms of Service',
    updated: UPDATED_EN,
    intro: 'These Terms govern your use of the Apartment Management System ("AMS", "the System"), operated by the property management ("Management"). By creating an account you agree to them. If you do not agree, do not register.',
    sections: [
      {
        h: '1. Your account',
        p: ['Registration creates a tenant account. You must give accurate information and keep your sign-in details to yourself; you are responsible for activity under your account.'],
        li: [
          'Passwords must be 8 to 72 characters and include an uppercase letter, a lowercase letter, a number and a symbol.',
          'After repeated failed sign-in attempts the account is locked out for 15 minutes.',
          'A sign-in session lasts up to 7 days. Changing your password, or archiving of your account, signs out your other sessions.',
        ],
      },
      {
        h: '2. Applications and move-in',
        p: [
          'A rent application is reviewed by Management against the documents you upload (for example a valid government ID). Management may approve, reject or ask you to resubmit.',
          'You may cancel an application before move-in. Cancellation is not available once part of the move-in bill has been paid; in that case Management handles any refund with you.',
          'A unit may be held for you for a limited number of days while the move-in bill is settled. An unpaid hold is released.',
        ],
      },
      {
        h: '3. Rent, payments and charges',
        li: [
          'Your balance is the amount invoiced less the amount already paid. Rent, advance rent, services, maintenance charges and parking are billed as invoices.',
          'Payments are submitted with proof and are checked by Management. A payment that cannot be verified may be rejected or voided.',
          'When enabled by Management, a late fee (a flat amount or a percentage) is applied once per overdue invoice, is never more than 5% (of the overdue balance, or of the month\'s rent for a flat fee), and may be waived by Management.',
          'Under the Rent Control Act (RA 9653 Sec. 9), Management may ask you to leave only for: subleasing without written consent, rent unpaid for a total of three months, the owner\'s or immediate family\'s own use after your rent term ends (with three months\' formal notice), a condemnation order requiring repairs, or the end of your rent term. The sale or mortgage of the property is not a ground. If you do not agree to leave, only a court can order it; Management never locks you out or cuts your utilities.',
          'For a unit renting at ₱10,000 a month or less, your rent may rise by no more than the yearly rent-control cap while you stay (1% in 2026, NHSB Resolution 2024-01).',
          'Damage caused by negligence or misuse is billed to the responsible tenant.',
        ],
      },
      {
        h: '4. Rent contract',
        p: ['Your rent contract is generated from Management\'s contract template and is pinned to the version in force when it was created. The standard terms include:'],
        li: [
          'an occupancy limit per unit, with a fee for each person above it;',
          'a move-out notice of 15 days;',
          'a security deposit of one month\'s rent, applied to unpaid rent, utilities or damage, with the remainder returned to you (see Refunds and your security deposit);',
          'no sublease or transfer without Management\'s written permission;',
          'the owner\'s right to inspect the unit;',
          'termination by either party for a serious violation.',
        ],
      },
      {
        h: '5. House rules, visitors, parking and CCTV',
        li: [
          'House rules (such as quiet hours and smoke-free areas) are published in the System and apply to all tenants and household members.',
          'Visitors are pre-registered by the tenant, who is responsible for them. A visitor who stays beyond the allowed time is flagged.',
          'Parking is by permit for the available slots and vehicle types only, requires vehicle registration documents, and is limited to a fixed permit term.',
          'CCTV footage can be requested only by a tenant with an active rental, for a genuine incident, with a stated reason and consent to the privacy terms of the request. Footage is available for a limited time and may be withheld to protect other people\'s privacy.',
        ],
      },
      {
        h: '6. Maintenance and repairs',
        p: ['These points follow the standard rent contract. If your signed rent contract words something differently, the contract has the final say.'],
        li: [
          'Management is responsible for repairing major damage and for maintaining the building. Major damage means the unit\'s water, electrical and structural systems.',
          'You keep the unit and the fixtures and items included in it clean and in good order, and you allow Management to inspect the unit to check its condition.',
          'You may not alter, damage or make permanent use of any part of the unit (for example drilling into walls or using hard-to-remove adhesives) without Management\'s permission.',
          'Report a problem by sending a maintenance request in the System, with a photo or short video if you can. Management reviews it, decides whether the repair is Management\'s or yours, and schedules the work.',
          'Repairs that are your responsibility, such as damage caused by negligence or misuse, are billed to you as a maintenance charge on an invoice. The security deposit may also be applied to damage.',
          'Electricity, water, internet and other utility services are your expense unless you and Management agreed otherwise. Management does not pay to reconnect a service that was cut for unpaid bills.',
        ],
      },
      {
        h: '7. Ending a tenancy and archiving of accounts',
        p: ['Only Management can archive or restore a tenant record. When a rent term ends, or for another recorded reason, Management archives the tenancy. This has the following effects:'],
        li: [
          'the unit is marked vacant and your household record is ended;',
          'unpaid invoices are cancelled, and unpaid advance months are cancelled;',
          'advance rent that was paid for months not yet reached is marked for refund, and Management is notified;',
          'your parking permit is released and pending visitor pre-registrations are cancelled;',
          'your active contract is terminated with the recorded reason;',
          'your account can no longer sign in.',
        ],
      },
      {
        h: '',
        p: [
          'Archiving does not erase your records. They are kept as described in the Privacy Notice. If an archive was made in error, Management can restore the tenancy to its previous status, and the above is reversed where the unit is still vacant.',
          'An account cannot be archived while its holder has an approved, active or pending move-out tenancy.',
        ],
      },
      {
        h: '8. Refunds and your security deposit',
        p: ['What is paid back, and when, depends on the case:'],
        li: [
          'a rejected application: everything you paid is refunded in full;',
          'cancelling before move-in with nothing paid: no charge. Once part of the move-in bill is paid, cancellation is handled by Management, who refunds what you paid, less the cancellation fee if Management has set one;',
          'advance rent for months not yet reached when your tenancy ends: refunded;',
          'a payment above what you owed, or a charge that was removed after you paid it: refunded in full;',
          'the security deposit: what is left after the deductions below is always returned.',
        ],
      },
      {
        h: '',
        p: ['The security deposit is kept in a bank account in the owner\'s name during your rent (RA 9653 Sec. 7). At move-out it covers only unpaid rent, utilities and damage beyond normal wear, each listed with a reason. The rest, with any interest the deposit earned, is returned to you within the number of days shown on your refund (30 by default), counted from the move-out clearance. You can follow it under My Refunds.'],
        li: [
          'if you move out without the required move-out notice, rent for the notice days may also be deducted; nothing else is kept;',
          'if what you owe is more than the deposit, the deposit is used up and the difference stays payable;',
          'if you disagree with a deduction, you can ask Management to review it under My Refunds within the refund period; Management answers with a reason.',
        ],
      },
      {
        h: '9. Notifications',
        p: ['The System sends notices in the app and, depending on your preferences, by email and SMS. Notices about bills, overdue accounts, payments, application and rent decisions, maintenance, contracts and move-out cannot be switched off, because they affect your tenancy. Other categories can be turned off in your notification settings.'],
      },
      {
        h: '10. Acceptable use',
        p: ['You must not misuse the System: no false documents or payment proofs, no attempts to access another person\'s data, no interference with the service, and no uploading of unlawful content. Management may restrict or archive an account that breaches these Terms.'],
      },
      {
        h: '11. Liability and changes',
        p: [
          'The System is provided to support the management of the property. Management is not liable for losses caused by interruptions, third-party services (such as SMS or email delivery) or events outside its control, to the extent allowed by law.',
          'These Terms may be updated. The date above shows the current version; continued use after an update means you accept it.',
          'These Terms are governed by the laws of the Republic of the Philippines.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy Notice',
    updated: UPDATED_EN,
    intro: 'This notice explains what personal information the Apartment Management System collects, why, who can see it and how long it is kept, in line with the Data Privacy Act of 2012 (Republic Act No. 10173). Management is the personal information controller.',
    sections: [
      {
        h: '1. What we collect',
        li: [
          'At registration: your name, email address and password. The password is stored only as a one-way hash and cannot be read by anyone.',
          'In your profile and application: contact number, gender, current and previous address, preferred move-in date, number of occupants, and the names, ages and contact numbers of household members.',
          'Documents and images you upload: government ID (front and back) and other required documents, payment proofs, signatures and signed contract copies, parking registration documents, maintenance and service photos, a profile photo, and chat attachments.',
          'Visitor records you enter: the visitor\'s name, contact details, ID type and number, ID photo, purpose and vehicle plate.',
          'Activity data: payments, requests, messages with Management, and an activity log that records sign-ins and failed sign-ins together with the IP address.',
        ],
      },
      {
        h: '2. Why we use it',
        p: ['We use your information to verify and manage your application and tenancy, prepare your contract, issue and reconcile bills, handle maintenance, visitors, parking and CCTV requests, keep the property secure, send notices, and meet legal and accounting obligations. We do not sell your information or use it for advertising.'],
      },
      {
        h: '3. Contracts',
        p: ['Your rent contract contains your name, contact number, email address, current and previous address, the unit, rent, advance and deposit amounts, dates, and signatures. Only you and Management can open your contract; a request for another tenant\'s contract is refused. Contract files are opened through the System after sign-in and never through public links.'],
      },
      {
        h: '4. Uploaded images and files',
        li: [
          'Files are stored on the System\'s server and cannot be opened by their web address directly. Each file is released only after the System checks who is asking.',
          'Your own documents, payment proofs, signatures and photos can be opened by you and by Management only.',
          'A visitor\'s ID photo can be opened by Management only, because it belongs to a third party.',
          'Chat attachments can be opened by the people in that conversation and Management.',
          'The only publicly viewable images are room photos, payment QR codes and site images.',
          'Files are protected by access control. They are not individually encrypted on the server.',
        ],
      },
      {
        h: '5. CCTV footage',
        p: ['Footage you request is released to you and Management only, for the period set by Management (14 days by default), and is then deleted automatically. When a tenant opens footage, the viewing is recorded in the activity log. Submitting a request means you confirm it is for a legitimate security or investigation purpose.'],
      },
      {
        h: '6. How long we keep information',
        li: [
          'CCTV footage: deleted automatically when its availability period ends.',
          'Notification delivery logs: deleted after the retention period set by Management (90 days by default).',
          'Password-reset requests, sign-in attempt counters and expired sessions: deleted within about a day after they are no longer needed.',
          'Accounts, applications, contracts, invoices and payments, uploaded documents and photos, visitor records, messages and the activity log: kept while your account exists, and kept after archiving, because they are the property\'s billing, contract and legal records. We have not set a fixed deletion period for these.',
        ],
      },
      {
        h: '7. Who receives your information',
        li: [
          'Management and authorised staff, as needed to run the property.',
          'The SMS provider (Semaphore) receives your mobile number and the text of messages we send, when SMS is switched on.',
          'The email service receives your email address and the content of emails, including password-reset links.',
          'The payment provider (PayMongo) receives checkout details only if Management enables online payment.',
          'Google Fonts is loaded by the registration page, so your browser contacts Google to fetch the typeface.',
          'We may disclose information when required by law or to protect the safety of residents.',
        ],
      },
      {
        h: '8. Security',
        p: ['We use hashed passwords, limits on repeated sign-in, password-reset and registration attempts, expiring sign-in sessions that end when you change your password or your account is archived, access-controlled file delivery, and an activity log of administrative changes. No system is completely secure, so please keep your password private.'],
      },
      {
        h: '9. Your choices and rights',
        p: ['You may ask Management to access or correct your information, object to certain uses, or request that information be blocked or erased where the law allows. Some records must be kept for billing, contract and legal reasons, so a request may be limited to what the law requires. Accounts are archived rather than erased. You can change your contact details and photo in your profile, and turn optional email and SMS categories on or off in your notification settings. You also have the right to lodge a complaint with the National Privacy Commission.'],
      },
      {
        h: '10. Contact and changes',
        p: [
          'Send privacy requests to Management through the Inquiry form or chat in the System.',
          'We may update this notice. The date above shows the current version.',
        ],
      },
    ],
  },
};

const fil = {
  terms: {
    title: 'Mga Tuntunin ng Serbisyo',
    updated: UPDATED_FIL,
    intro: 'Pinamamahalaan ng mga Tuntuning ito ang paggamit mo ng Apartment Management System ("AMS", "ang System"), na pinatatakbo ng pamunuan ng property ("Pamunuan"). Sa paggawa ng account, sumasang-ayon ka rito. Kung hindi ka sang-ayon, huwag magparehistro.',
    sections: [
      {
        h: '1. Ang iyong account',
        p: ['Ang pagpaparehistro ay lumilikha ng tenant account. Dapat tama ang ibibigay mong impormasyon at ikaw lang ang may alam ng iyong sign-in details; ikaw ang responsable sa lahat ng gawain sa iyong account.'],
        li: [
          'Ang password ay 8 hanggang 72 character at may malaking titik, maliit na titik, numero at simbolo.',
          'Pagkatapos ng paulit-ulit na maling sign-in, naka-lock ang account sa loob ng 15 minuto.',
          'Ang sign-in session ay tumatagal ng hanggang 7 araw. Kapag nagpalit ka ng password, o na-archive ang account, masa-sign out ang iba mong session.',
        ],
      },
      {
        h: '2. Aplikasyon at paglipat',
        p: [
          'Sinusuri ng Pamunuan ang rent application batay sa mga dokumentong in-upload mo (halimbawa, valid na government ID). Maaaring aprubahan, tanggihan, o hilingin ng Pamunuan na isumite mo ulit.',
          'Maaari mong kanselahin ang aplikasyon bago lumipat. Hindi na ito maaari kapag may bahagi nang nabayaran sa move-in bill; sa ganitong kaso, ang Pamunuan ang aayos ng anumang refund kasama mo.',
          'Maaaring i-hold ang unit para sa iyo sa limitadong bilang ng araw habang binabayaran ang move-in bill. Ang hindi nabayarang hold ay ire-release.',
        ],
      },
      {
        h: '3. Upa, bayad at singil',
        li: [
          'Ang balanse mo ay ang na-invoice na halaga bawas ang nabayaran na. Ang upa, advance, serbisyo, maintenance at parking ay sinisingil sa pamamagitan ng invoice.',
          'Ang mga bayad ay isinusumite kasama ang patunay at sinusuri ng Pamunuan. Ang bayad na hindi ma-verify ay maaaring tanggihan o i-void.',
          'Kapag pinagana ng Pamunuan, ang late fee (takdang halaga o porsyento) ay ipinapataw nang minsan kada overdue na invoice, hindi lalampas sa 5% (ng overdue na balanse, o ng buwanang upa kung takdang halaga), at maaaring i-waive ng Pamunuan.',
          'Ayon sa Rent Control Act (RA 9653 Sek. 9), maaari ka lamang paalisin ng Pamunuan dahil sa: pagpapaupa muli nang walang nakasulat na pahintulot, upa na hindi nabayaran nang may kabuuang tatlong buwan, sariling paggamit ng may-ari o malapit na kapamilya matapos ang panahon ng upa mo (may pormal na abiso tatlong buwan bago), kautusan ng pagkondena na nangangailangan ng pagkukumpuni, o pagtatapos ng panahon ng upa mo. Ang pagbebenta o pagsasangla ng ari-arian ay hindi batayan. Kung hindi ka pumayag na umalis, hukuman lamang ang maaaring mag-utos nito; hindi ka ikakandado sa labas o puputulan ng serbisyo ng Pamunuan.',
          'Para sa unit na may upa na ₱10,000 o mas mababa kada buwan, ang upa mo ay hindi maaaring tumaas nang higit sa taunang limitasyon ng rent control habang ikaw ay nananatili (1% sa 2026, NHSB Resolution 2024-01).',
          'Ang pinsalang dulot ng kapabayaan o maling paggamit ay sisingilin sa responsableng tenant.',
        ],
      },
      {
        h: '4. Kontrata sa pag-upa',
        p: ['Ang kontrata mo sa pag-upa ay mula sa contract template ng Pamunuan at nakatali sa bersyong umiiral nang likhain ito. Kabilang sa karaniwang tuntunin:'],
        li: [
          'limitasyon sa bilang ng nakatira sa bawat unit, na may bayad sa bawat sobra;',
          'abiso sa paglipat-labas na 15 araw;',
          'security deposit na katumbas ng isang buwang upa, na ginagamit sa hindi nabayarang upa, utilities o pinsala, at ibinabalik sa iyo ang matitira (tingnan ang Mga refund at ang iyong security deposit);',
          'bawal ang sublease o paglilipat nang walang nakasulat na pahintulot ng Pamunuan;',
          'karapatan ng may-ari na siyasatin ang unit;',
          'pagwawakas ng alinmang panig dahil sa malubhang paglabag.',
        ],
      },
      {
        h: '5. Patakaran sa bahay, bisita, parking at CCTV',
        li: [
          'Ang mga patakaran sa bahay (tulad ng quiet hours at bawal manigarilyo) ay nakalathala sa System at para sa lahat ng tenant at kasambahay.',
          'Ang mga bisita ay ipinapa-pre-register ng tenant, na responsable sa kanila. Ang bisitang lumampas sa pinapayagang oras ay ma-fa-flag.',
          'Ang parking ay sa pamamagitan ng permit para sa mga available na slot at uri ng sasakyan lamang, nangangailangan ng dokumento ng rehistro ng sasakyan, at may takdang haba ng permit.',
          'Ang CCTV footage ay maaari lamang hilingin ng tenant na may aktibong paupahan, para sa totoong insidente, may nakasaad na dahilan, at pagsang-ayon sa privacy terms ng request. Limitado ang panahon ng footage at maaaring hindi ibigay upang protektahan ang privacy ng iba.',
        ],
      },
      {
        h: '6. Maintenance at pagkukumpuni',
        p: ['Sinusunod ng mga punto rito ang karaniwang kontrata sa pag-upa. Kung iba ang nakasulat sa nilagdaang kontrata mo, ang kontrata ang masusunod.'],
        li: [
          'Ang Pamunuan ang responsable sa pagpapagawa ng mga pangunahing sira at sa pagpapanatili ng gusali. Ang pangunahing sira ay may kinalaman sa mga sistema ng tubig, kuryente at estruktura ng unit.',
          'Ikaw ang mag-iingat at magpapanatiling malinis at maayos ng unit at ng mga kagamitang kasama rito, at pinapayagan mo ang Pamunuan na suriin ang unit upang tingnan ang kondisyon nito.',
          'Hindi mo maaaring baguhin, sirain o gawing permanenteng gamit ang anumang bahagi ng unit (halimbawa, pagbutas sa pader o paggamit ng pandikit na mahirap alisin) nang walang pahintulot ng Pamunuan.',
          'Mag-ulat ng problema sa pamamagitan ng maintenance request sa System, may kasamang larawan o maikling video kung maaari. Susuriin ito ng Pamunuan, pagpapasyahan kung kanino ang pagkukumpuni, at iiskedyul ang gawain.',
          'Ang mga pagkukumpuning ikaw ang may pananagutan, tulad ng pinsalang dulot ng kapabayaan o maling paggamit, ay sisingilin sa iyo bilang maintenance charge sa invoice. Maaari ring gamitin ang security deposit para sa pinsala.',
          'Ang kuryente, tubig, internet at iba pang serbisyo ay gastos mo maliban kung may ibang napagkasunduan kayo ng Pamunuan. Hindi babayaran ng Pamunuan ang muling pagkonekta ng serbisyong naputol dahil sa hindi nabayarang singil.',
        ],
      },
      {
        h: '7. Pagtatapos ng paninirahan at pag-archive ng account',
        p: ['Ang Pamunuan lamang ang makakapag-archive o makakapag-restore ng tenant record. Kapag natapos ang termino ng upa, o dahil sa ibang naitalang dahilan, ina-archive ng Pamunuan ang paninirahan. Narito ang epekto:'],
        li: [
          'ang unit ay mamarkahang bakante at tatapusin ang household record mo;',
          'kakanselahin ang mga hindi nabayarang invoice at hindi nabayarang advance months;',
          'ang advance na nabayaran para sa mga buwang hindi pa dumarating ay mamamarkahang refund-due, at aabisuhan ang Pamunuan;',
          'ire-release ang parking permit mo at kakanselahin ang mga nakabinbing pre-registration ng bisita;',
          'wawakasan ang aktibong kontrata mo kasama ang naitalang dahilan;',
          'hindi na makaka-sign in ang account mo.',
        ],
      },
      {
        h: '',
        p: [
          'Hindi binubura ng pag-archive ang iyong mga record. Iniimbak ang mga ito ayon sa Paunawa sa Privacy. Kung nagkamali ang pag-archive, maaaring ibalik ng Pamunuan ang paninirahan sa dating status, at babawiin ang nabanggit kung bakante pa ang unit.',
          'Hindi maaaring i-archive ang account habang ang may-ari nito ay may approved, active o pending move-out na paninirahan.',
        ],
      },
      {
        h: '8. Mga refund at ang iyong security deposit',
        p: ['Kung ano ang ibabalik at kailan, ay depende sa kaso:'],
        li: [
          'tinanggihang aplikasyon: ibabalik nang buo ang lahat ng binayaran mo;',
          'pagkansela bago lumipat na wala pang bayad: walang singil. Kapag may bahagi nang nabayaran sa move-in bill, ang Pamunuan ang aayos ng pagkansela at ibabalik ang binayaran mo, bawas ang cancellation fee kung may itinakda ang Pamunuan;',
          'advance na upa para sa mga buwang hindi pa dumarating sa pagtatapos ng paninirahan: ibabalik;',
          'bayad na lampas sa utang mo, o singil na inalis matapos mong bayaran: ibabalik nang buo;',
          'ang security deposit: palaging ibinabalik ang matitira matapos ang mga kaltas sa ibaba.',
        ],
      },
      {
        h: '',
        p: ['Ang security deposit ay itinatago sa isang bank account sa pangalan ng may-ari habang ikaw ay umuupa (RA 9653 Sek. 7). Sa paglipat, ito ay ikinakaltas lamang sa hindi nabayarang upa, utilities at pinsalang lampas sa karaniwang pagkasira, na may nakalistang dahilan. Ang matitira, kasama ang anumang interes ng deposit, ay ibabalik sa iyo sa loob ng bilang ng araw na nakasaad sa refund mo (30 bilang default), mula sa move-out clearance. Masusubaybayan mo ito sa My Refunds.'],
        li: [
          'kung lilipat ka nang walang kinakailangang abiso, maaari ring ikaltas ang upa para sa mga araw ng abiso; wala nang ibang itatago;',
          'kung mas malaki ang utang mo kaysa sa deposit, mauubos ang deposit at ang kulang ay babayaran mo pa rin;',
          'kung hindi ka sang-ayon sa isang kaltas, maaari mong hilingin sa Pamunuan na suriin ito sa My Refunds sa loob ng panahon ng refund; sasagot ang Pamunuan na may dahilan.',
        ],
      },
      {
        h: '9. Mga abiso',
        p: ['Nagpapadala ang System ng abiso sa app at, ayon sa iyong kagustuhan, sa email at SMS. Ang mga abiso tungkol sa bill, overdue, bayad, desisyon sa aplikasyon at upa, maintenance, kontrata at paglipat-labas ay hindi maaaring patayin dahil nakaaapekto ito sa iyong paninirahan. Ang ibang kategorya ay maaaring patayin sa notification settings.'],
      },
      {
        h: '10. Wastong paggamit',
        p: ['Huwag abusuhin ang System: walang pekeng dokumento o patunay ng bayad, walang pagtatangkang makuha ang data ng iba, walang panggugulo sa serbisyo, at walang pag-upload ng labag sa batas. Maaaring higpitan o i-archive ng Pamunuan ang account na lumabag sa mga Tuntuning ito.'],
      },
      {
        h: '11. Pananagutan at mga pagbabago',
        p: [
          'Ibinibigay ang System upang suportahan ang pamamahala ng property. Hindi mananagot ang Pamunuan sa pagkalugi dahil sa pagkaantala, third-party services (tulad ng SMS o email) o mga pangyayaring wala sa kontrol nito, hanggang sa pinapayagan ng batas.',
          'Maaaring baguhin ang mga Tuntuning ito. Ang petsa sa itaas ang kasalukuyang bersyon; ang patuloy na paggamit pagkatapos ng pagbabago ay pagsang-ayon dito.',
          'Ang mga Tuntuning ito ay pinamamahalaan ng mga batas ng Republika ng Pilipinas.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Paunawa sa Privacy',
    updated: UPDATED_FIL,
    intro: 'Ipinapaliwanag ng paunawang ito kung anong personal na impormasyon ang kinokolekta ng Apartment Management System, bakit, sino ang makakakita, at gaano katagal itong iniingatan, alinsunod sa Data Privacy Act of 2012 (Republic Act No. 10173). Ang Pamunuan ang personal information controller.',
    sections: [
      {
        h: '1. Ano ang kinokolekta namin',
        li: [
          'Sa pagpaparehistro: pangalan, email address at password. Ang password ay iniimbak lamang bilang one-way hash at hindi mababasa ninuman.',
          'Sa profile at aplikasyon: contact number, kasarian, kasalukuyan at dating tirahan, gustong petsa ng paglipat, bilang ng titira, at pangalan, edad at contact number ng mga kasambahay.',
          'Mga dokumento at larawang in-upload mo: government ID (harap at likod) at iba pang kailangang dokumento, patunay ng bayad, pirma at pirmadong kopya ng kontrata, dokumento ng rehistro ng sasakyan, larawan para sa maintenance at serbisyo, profile photo, at attachment sa chat.',
          'Mga talaan ng bisitang inilagay mo: pangalan, contact, uri at numero ng ID, larawan ng ID, layunin at plaka ng sasakyan.',
          'Datos ng aktibidad: bayad, request, mensahe sa Pamunuan, at activity log na nagtatala ng sign-in at nabigong sign-in kasama ang IP address.',
        ],
      },
      {
        h: '2. Bakit namin ito ginagamit',
        p: ['Ginagamit namin ang impormasyon mo upang beripikahin at pamahalaan ang aplikasyon at paninirahan, ihanda ang kontrata, mag-isyu at mag-reconcile ng bill, asikasuhin ang maintenance, bisita, parking at CCTV request, panatilihing ligtas ang property, magpadala ng abiso, at tuparin ang mga obligasyong legal at accounting. Hindi namin ibinebenta ang impormasyon mo ni ginagamit sa advertising.'],
      },
      {
        h: '3. Mga kontrata',
        p: ['Ang kontrata mo sa pag-upa ay naglalaman ng pangalan, contact number, email, kasalukuyan at dating tirahan, unit, upa, advance at deposit, mga petsa at pirma. Ikaw at ang Pamunuan lamang ang makakabukas ng kontrata mo; tinatanggihan ang request para sa kontrata ng ibang tenant. Ang mga contract file ay binubuksan sa System pagkatapos mag-sign in at hindi sa pampublikong link.'],
      },
      {
        h: '4. Mga na-upload na larawan at file',
        li: [
          'Iniimbak ang mga file sa server ng System at hindi mabubuksan sa mismong web address. Ibinibigay lamang ang bawat file matapos suriin ng System kung sino ang humihiling.',
          'Ang sarili mong dokumento, patunay ng bayad, pirma at larawan ay mabubuksan lamang mo at ng Pamunuan.',
          'Ang larawan ng ID ng bisita ay mabubuksan lamang ng Pamunuan dahil pag-aari ito ng ibang tao.',
          'Ang attachment sa chat ay mabubuksan ng mga kalahok sa usapan at ng Pamunuan.',
          'Ang tanging pampublikong larawan ay ang larawan ng kuwarto, payment QR code at site image.',
          'Pinoprotektahan ang mga file sa pamamagitan ng access control. Hindi sila isa-isang naka-encrypt sa server.',
        ],
      },
      {
        h: '5. CCTV footage',
        p: ['Ang footage na hiniling mo ay ibinibigay lamang sa iyo at sa Pamunuan, sa panahong itinakda ng Pamunuan (14 araw bilang default), at kusa itong buburahin pagkatapos. Kapag binuksan ng tenant ang footage, itinatala ang panonood sa activity log. Sa pagsusumite ng request, kinukumpirma mong para ito sa lehitimong seguridad o imbestigasyon.'],
      },
      {
        h: '6. Gaano katagal namin iniingatan',
        li: [
          'CCTV footage: kusang binubura pagkatapos ng panahon ng availability.',
          'Delivery logs ng abiso: binubura pagkatapos ng retention period na itinakda ng Pamunuan (90 araw bilang default).',
          'Password-reset request, bilang ng sign-in attempt at expired na session: binubura sa loob ng halos isang araw matapos hindi na kailangan.',
          'Account, aplikasyon, kontrata, invoice at bayad, na-upload na dokumento at larawan, talaan ng bisita, mensahe at activity log: iniingatan habang umiiral ang account, at pagkatapos ng pag-archive, dahil ito ang billing, kontrata at legal na talaan ng property. Wala pa kaming itinakdang takdang panahon ng pagbura para dito.',
        ],
      },
      {
        h: '7. Sino ang tumatanggap ng impormasyon mo',
        li: [
          'Ang Pamunuan at awtorisadong staff, kung kinakailangan sa pagpapatakbo ng property.',
          'Ang SMS provider (Semaphore) ay tumatanggap ng mobile number mo at teksto ng mensahe, kapag naka-on ang SMS.',
          'Ang email service ay tumatanggap ng email address mo at nilalaman ng email, kasama ang password-reset link.',
          'Ang payment provider (PayMongo) ay tumatanggap ng checkout details kung pinagana ng Pamunuan ang online payment.',
          'Ang Google Fonts ay nilo-load ng registration page, kaya kumokonekta ang browser mo sa Google para kunin ang font.',
          'Maaari kaming magbahagi ng impormasyon kapag hinihingi ng batas o upang protektahan ang kaligtasan ng mga residente.',
        ],
      },
      {
        h: '8. Seguridad',
        p: ['Gumagamit kami ng hashed na password, limitasyon sa paulit-ulit na sign-in, password-reset at pagpaparehistro, mga sign-in session na nawawalan ng bisa at nagtatapos kapag nagpalit ka ng password o na-archive ang account, access-controlled na paghahatid ng file, at activity log ng mga pagbabago ng admin. Walang sistemang ganap na ligtas, kaya ingatan ang iyong password.'],
      },
      {
        h: '9. Iyong mga pagpipilian at karapatan',
        p: ['Maaari mong hilingin sa Pamunuan na ma-access o maitama ang impormasyon mo, tumutol sa ilang paggamit, o humiling na i-block o burahin ang impormasyon kung pinapayagan ng batas. Ang ilang record ay kailangang itago para sa billing, kontrata at legal na dahilan, kaya ang request ay maaaring limitado sa hinihingi ng batas. Ina-archive ang account sa halip na burahin. Maaari mong baguhin ang contact details at larawan sa profile, at i-on o i-off ang mga opsyonal na kategorya ng email at SMS sa notification settings. May karapatan ka ring maghain ng reklamo sa National Privacy Commission.'],
      },
      {
        h: '10. Pakikipag-ugnayan at mga pagbabago',
        p: [
          'Ipadala ang privacy request sa Pamunuan sa pamamagitan ng Inquiry form o chat sa System.',
          'Maaari naming baguhin ang paunawang ito. Ang petsa sa itaas ang kasalukuyang bersyon.',
        ],
      },
    ],
  },
};

export const LEGAL = { en, fil };
