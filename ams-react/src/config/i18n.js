import { useState, useEffect } from 'react';

// ==========================================
// AMS i18n — English / Filipino translations
// ==========================================
// ponytail: flat key-value map — upgrade to react-i18next when > 3 languages

const translations = {
  en: {
    // --- TopBar / Nav ---
    'nav.home': 'Home',
    'nav.trackApp': 'Track Application',
    'nav.services': 'Services',
    'nav.myRoom': 'My Room',
    'nav.notifications': 'Notifications',
    'nav.viewAll': 'View All',
    'nav.settings': 'Settings',
    'nav.logout': 'Sign Out',
    'nav.login': 'Sign In',

    // --- Login ---
    'login.backHome': 'Back to Home',
    'login.tagline': 'Apartment Management System',
    'login.heading': 'Welcome Back',
    'login.subtitle': 'Please enter your credentials to access your account.',
    'login.email': 'Email Address',
    'login.password': 'Password',
    'login.forgot': 'Forgot Password?',
    'login.submit': 'Sign In',
    'login.noAccount': "Don't have an account?",
    'login.createAccount': 'Create Account',
    'login.error': 'Unable to log in. Please try again.',

    // --- Registration ---
    'reg.backHome': 'Back to Home',
    'reg.heading': 'Create Account',
    'reg.subtitle': 'Register your personal details to begin leasing.',
    'reg.firstName': 'First Name *',
    'reg.middleName': 'Middle Name',
    'reg.lastName': 'Last Name *',
    'reg.suffix': 'Suffix',
    'reg.email': 'Email Address *',
    'reg.password': 'Password *',
    'reg.confirmPassword': 'Confirm Password *',
    'reg.submit': 'Register Account',
    'reg.hasAccount': 'Already have an account?',
    'reg.signIn': 'Sign In',
    'reg.error': 'Unable to register account. Please try again.',

    // --- Home ---
    'home.badge': 'Premium Rental Property',
    'home.heading': 'Renting, Made Easy',
    'home.welcomeBack': 'Welcome Back,',
    'home.location': 'Maguyam Silang, Cavite',
    'home.description': 'Convenient housing situated perfectly for your daily commute. Enjoy a restful, reliable utilities, and accessible support services designed around your shift schedule.',
    'home.totalUnits': 'Total Units',
    'home.availableRooms': 'Available Rooms',
    'home.cta': 'Explore Available Rooms',

    // --- Preview ---
    'preview.featured': 'Featured Listing',
    'preview.title': 'Apartment in Silang',
    'preview.location': 'Maguyam Silang, Cavite',
    'preview.parking': 'Motorcycle Parking',
    'preview.bathroom': 'Bathroom per Room',
    'preview.availableRooms': 'Available Rooms',
    'preview.loading': 'Loading available rooms...',
    'preview.noRooms': 'No rooms are currently available for lease. Please check back later!',
    'preview.viewLayout': 'View Layout',
    'preview.rentNow': 'Rent Now',

    // --- Rent Application ---
    'rent.heading': 'Rent Application Form',
    'rent.subtitle': 'Complete the required documentation onboarding framework below to process your lease application.',
    'rent.statusLabel': 'Application Status',
    'rent.pendingReview': 'Pending Review',
    'rent.approved': 'Approved',
    'rent.personalDetails': 'Personal Details',
    'rent.firstName': 'First Name',
    'rent.middleName': 'Middle Name',
    'rent.lastName': 'Last Name',
    'rent.suffix': 'Suffix',
    'rent.suffixPlaceholder': 'e.g. Jr, Sr, III',
    'rent.contactNo': 'Contact No.',
    'rent.email': 'Email Address',
    'rent.gender': 'Gender',
    'rent.selectGender': 'Select gender...',
    'rent.male': 'Male',
    'rent.female': 'Female',
    'rent.other': 'Other',
    'rent.occupants': 'No. Occupants (Max 4)',
    'rent.occupantsSurcharge': 'Exceeding 4 adds ₱1,000/person surcharge',
    'rent.monthsOfRent': 'Months of Rent',
    'rent.monthsMax': '(Max 24 months / 2 years)',
    'rent.roomDetails': 'Room Details',
    'rent.roomType': 'Room Type',
    'rent.assignedRoom': 'Assigned Room',
    'rent.monthlyRent': 'Monthly Rent',
    'rent.extraOccupantFee': 'Includes ₱{amount} extra occupant fee',
    'rent.verificationDocs': 'Verification Documents',
    'rent.acceptedFormats': 'Accepted formats: JPEG, PNG, PDF (Max 10MB per file)',
    'rent.validIdFront': 'Valid ID Card (Front Side)',
    'rent.validIdBack': 'Valid ID Card (Back Side)',
    'rent.nbiClearance': 'NBI Clearance Form Document Attachment',
    'rent.dropFront': 'Drop ID card front view here, or',
    'rent.dropBack': 'Drop ID card back view here, or',
    'rent.dropNbi': 'Drop your valid NBI clearance form here, or',
    'rent.browse': 'browse',
    'rent.removeRetake': 'Remove / Retake',
    'rent.viewPdf': 'View PDF Document',
    'rent.agreeTerms': 'By ticking this box, I agree that I have read the',
    'rent.termsLink': 'terms and privacy policy',
    'rent.submitApp': 'Submit Application',
    'rent.proceedPayment': 'Proceed to Payment',
    'rent.pendingMsg': 'Your lease request data is currently under review by building management. Submissions cannot be edited at this time.',
    'rent.docsLocked': 'Your verification file assets have been uploaded securely and are locked while undergoing review.',
    'rent.closePdf': 'Close PDF',
    'rent.tenancyConfirmed': 'Tenancy Confirmed',
    'rent.tenancyDesc': 'You are already an active tenant with an approved lease application. You do not need to fill out a new application. Manage your room, utility bills, and maintenance requests directly from your portal.',
    'rent.goMyRoom': 'Go to My Room',
    'rent.payBills': 'Pay Bills',
    'rent.requestMaint': 'Request Maintenance',
    'rent.goHome': 'Go to Home',
    'rent.applicationActive': 'Application Active',
    'rent.applicationActiveDesc': 'You currently have an active or pending lease application (Status: {status}). Submitting another application is not allowed unless your current one is rejected or declined.',
    'rent.trackApp': 'Track Application',
    'rent.backServices': 'Back to Services',
    'rent.termsTitle': 'Terms and Services',
    'rent.terms1Title': '1. Apartment Occupancy Regulations',
    'rent.terms1Body': 'The maximum occupancy layout configuration is strictly restricted to a limit of 4 tenants per studio apartment room setup. Exceeding this calculation capacity bounds violates asset unit safety compliance guidelines.',
    'rent.terms2Title': '2. Verification Paperwork Protocols',
    'rent.terms2Body': 'Applicants are legally required to submit clear authentic record documentation copies of both a valid government issued ID layout file asset and a recent NBI Clearance verification page.',
    'rent.terms3Title': '3. Data Privacy Statement',
    'rent.terms3Body': 'All uploaded file artifacts, text names, contact phone keys, and communication metrics are encrypted and safely stored solely within the Apartment Management System (AMS) data records platform securely.',
    'rent.acceptAgree': 'Accept & Agree',
    'rent.successMsg': 'Application Submitted Successfully',
  },

  fil: {
    // --- TopBar / Nav ---
    'nav.home': 'Home',
    'nav.trackApp': 'Subaybayan ang Aplikasyon',
    'nav.services': 'Mga Serbisyo',
    'nav.myRoom': 'Aking Kwarto',
    'nav.notifications': 'Mga Notipikasyon',
    'nav.viewAll': 'Tingnan Lahat',
    'nav.settings': 'Mga Setting',
    'nav.logout': 'Mag-sign Out',
    'nav.login': 'Mag-sign In',

    // --- Login ---
    'login.backHome': 'Bumalik sa Home',
    'login.tagline': 'Apartment Management System',
    'login.heading': 'Maligayang Pagbabalik',
    'login.subtitle': 'Ilagay ang iyong mga kredensyal para ma-access ang iyong account.',
    'login.email': 'Email Address',
    'login.password': 'Password',
    'login.forgot': 'Nakalimutan ang Password?',
    'login.submit': 'Mag-sign In',
    'login.noAccount': 'Wala ka pang account?',
    'login.createAccount': 'Gumawa ng Account',
    'login.error': 'Hindi makapag-log in. Pakisubukang muli.',

    // --- Registration ---
    'reg.backHome': 'Bumalik sa Home',
    'reg.heading': 'Gumawa ng Account',
    'reg.subtitle': 'Irehistro ang iyong mga personal na detalye para magsimulang mag-upa.',
    'reg.firstName': 'Pangalan *',
    'reg.middleName': 'Gitnang Pangalan',
    'reg.lastName': 'Apelyido *',
    'reg.suffix': 'Suffix',
    'reg.email': 'Email Address *',
    'reg.password': 'Password *',
    'reg.confirmPassword': 'Kumpirmahin ang Password *',
    'reg.submit': 'Irehistro ang Account',
    'reg.hasAccount': 'May account ka na?',
    'reg.signIn': 'Mag-sign In',
    'reg.error': 'Hindi mairehistro ang account. Pakisubukang muli.',

    // --- Home ---
    'home.badge': 'Premium na Pag-aarkila',
    'home.heading': 'Pag-upa, Pinadali',
    'home.welcomeBack': 'Maligayang Pagbabalik,',
    'home.location': 'Maguyam Silang, Cavite',
    'home.description': 'Maginhawang tirahan na perpektong malapit sa iyong trabaho. Mag-enjoy ng maayos na pahinga, maaasahang utilities, at mga serbisyong naaayon sa iyong schedule.',
    'home.totalUnits': 'Kabuuang Yunit',
    'home.availableRooms': 'Mga Bakanteng Kwarto',
    'home.cta': 'Tingnan ang mga Bakanteng Kwarto',

    // --- Preview ---
    'preview.featured': 'Tampok na Listahan',
    'preview.title': 'Apartment sa Silang',
    'preview.location': 'Maguyam Silang, Cavite',
    'preview.parking': 'Paradahan ng Motor',
    'preview.bathroom': 'Banyo sa Bawat Kwarto',
    'preview.availableRooms': 'Mga Bakanteng Kwarto',
    'preview.loading': 'Nilo-load ang mga bakanteng kwarto...',
    'preview.noRooms': 'Walang bakanteng kwarto ngayon. Bumalik na lang mamaya!',
    'preview.viewLayout': 'Tingnan ang Layout',
    'preview.rentNow': 'Upa Na',

    // --- Rent Application ---
    'rent.heading': 'Form ng Aplikasyon sa Pag-upa',
    'rent.subtitle': 'Kumpletuhin ang mga kinakailangang dokumento sa ibaba para maproseso ang iyong aplikasyon sa pag-upa.',
    'rent.statusLabel': 'Status ng Aplikasyon',
    'rent.pendingReview': 'Sinusuri Pa',
    'rent.approved': 'Aprubado',
    'rent.personalDetails': 'Mga Personal na Detalye',
    'rent.firstName': 'Pangalan',
    'rent.middleName': 'Gitnang Pangalan',
    'rent.lastName': 'Apelyido',
    'rent.suffix': 'Suffix',
    'rent.suffixPlaceholder': 'hal. Jr, Sr, III',
    'rent.contactNo': 'Numero ng Telepono',
    'rent.email': 'Email Address',
    'rent.gender': 'Kasarian',
    'rent.selectGender': 'Pumili ng kasarian...',
    'rent.male': 'Lalaki',
    'rent.female': 'Babae',
    'rent.other': 'Iba Pa',
    'rent.occupants': 'Bilang ng Titira (Max 4)',
    'rent.occupantsSurcharge': 'Lagpas sa 4 ay may dagdag na ₱1,000/tao',
    'rent.monthsOfRent': 'Buwan ng Upa',
    'rent.monthsMax': '(Max 24 na buwan / 2 taon)',
    'rent.roomDetails': 'Detalye ng Kwarto',
    'rent.roomType': 'Uri ng Kwarto',
    'rent.assignedRoom': 'Nakatalagang Kwarto',
    'rent.monthlyRent': 'Buwanang Upa',
    'rent.extraOccupantFee': 'Kasama ang ₱{amount} dagdag na bayad sa sobrang titira',
    'rent.verificationDocs': 'Mga Dokumento para sa Beripikasyon',
    'rent.acceptedFormats': 'Tinatanggap na format: JPEG, PNG, PDF (Max 10MB bawat file)',
    'rent.validIdFront': 'Valid ID (Harap)',
    'rent.validIdBack': 'Valid ID (Likod)',
    'rent.nbiClearance': 'NBI Clearance na Dokumento',
    'rent.dropFront': 'I-drop ang harap ng ID dito, o',
    'rent.dropBack': 'I-drop ang likod ng ID dito, o',
    'rent.dropNbi': 'I-drop ang iyong NBI clearance dito, o',
    'rent.browse': 'mag-browse',
    'rent.removeRetake': 'Alisin / Ulitin',
    'rent.viewPdf': 'Tingnan ang PDF',
    'rent.agreeTerms': 'Sa pag-tick ng kahon na ito, sumasang-ayon ako na nabasa ko ang',
    'rent.termsLink': 'mga tuntunin at patakaran sa privacy',
    'rent.submitApp': 'Isumite ang Aplikasyon',
    'rent.proceedPayment': 'Magpatuloy sa Bayaran',
    'rent.pendingMsg': 'Kasalukuyang sinusuri ng building management ang iyong aplikasyon. Hindi maaaring baguhin ang mga detalye sa ngayon.',
    'rent.docsLocked': 'Ang iyong mga dokumento ay na-upload na nang maayos at naka-lock habang sinusuri.',
    'rent.closePdf': 'Isara ang PDF',
    'rent.tenancyConfirmed': 'Nakumpirma ang Pag-upa',
    'rent.tenancyDesc': 'Ikaw ay isang aktibong nangungupahan na may aprubadong aplikasyon. Hindi mo na kailangang mag-fill out ng bagong aplikasyon. Pamahalaan ang iyong kwarto, mga utility bill, at maintenance request mula sa iyong portal.',
    'rent.goMyRoom': 'Pumunta sa Aking Kwarto',
    'rent.payBills': 'Magbayad ng Bills',
    'rent.requestMaint': 'Mag-request ng Maintenance',
    'rent.goHome': 'Pumunta sa Home',
    'rent.applicationActive': 'Aktibo ang Aplikasyon',
    'rent.applicationActiveDesc': 'Mayroon kang aktibo o pending na aplikasyon sa pag-upa (Status: {status}). Hindi pinapayagan ang pagsumite ng isa pang aplikasyon maliban kung na-reject o na-decline ang kasalukuyan.',
    'rent.trackApp': 'Subaybayan ang Aplikasyon',
    'rent.backServices': 'Bumalik sa Mga Serbisyo',
    'rent.termsTitle': 'Mga Tuntunin at Serbisyo',
    'rent.terms1Title': '1. Mga Regulasyon sa Paninirahan',
    'rent.terms1Body': 'Ang maximum na bilang ng titira ay limitado sa 4 na tao bawat studio apartment. Ang paglampas sa limitasyong ito ay labag sa mga alituntunin sa kaligtasan.',
    'rent.terms2Title': '2. Mga Protokol sa Beripikasyon',
    'rent.terms2Body': 'Ang mga aplikante ay kinakailangang magsumite ng malinaw na kopya ng valid na government-issued ID at kamakailang NBI Clearance.',
    'rent.terms3Title': '3. Pahayag sa Privacy ng Data',
    'rent.terms3Body': 'Lahat ng na-upload na mga file, pangalan, numero ng telepono, at iba pang impormasyon ay naka-encrypt at ligtas na nakaimbak sa loob ng Apartment Management System (AMS).',
    'rent.acceptAgree': 'Tanggapin at Sumang-ayon',
    'rent.successMsg': 'Matagumpay na Naisumite ang Aplikasyon',
  },
};

// --- Core functions ---

export function getLang() {
  return localStorage.getItem('ams_lang') || 'en';
}

export function setLang(lang) {
  localStorage.setItem('ams_lang', lang);
  window.dispatchEvent(new CustomEvent('ams_lang_changed', { detail: lang }));
}

export function t(key) {
  const lang = getLang();
  return translations[lang]?.[key] ?? translations.en[key] ?? key;
}

// --- React hook ---

export function useLang() {
  const [lang, setLangState] = useState(getLang);

  useEffect(() => {
    const handler = (e) => setLangState(e.detail || getLang());
    window.addEventListener('ams_lang_changed', handler);
    return () => window.removeEventListener('ams_lang_changed', handler);
  }, []);

  return {
    lang,
    setLang,
    t,
  };
}
