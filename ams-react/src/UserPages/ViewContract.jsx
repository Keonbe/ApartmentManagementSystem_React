import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPrint, faArrowLeft, faHourglassHalf } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';

export default function ViewContract() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [contractData, setContractData] = useState(null);

    const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "null");
    const activeEmail = loggedInUser ? loggedInUser.email_address : "";

    useEffect(() => {
        const fetchContractDetails = async () => {
            if (!activeEmail) {
                setError("No active user session found.");
                setLoading(false);
                return;
            }

            try {
                const res = await api.get(`/my_room.php?email=${encodeURIComponent(activeEmail)}`);

                if (res.data.success && res.data.data) {
                    const data = res.data.data;
                    
                    const creationDate = new Date(data.created_at);
                    const startDateString = creationDate.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
                    
                    const rentDay = creationDate.getDate();

                    // Stripped out the raw "Room " prefix to avoid duplicating "Room Room C"
                    const cleanRoomName = data.room_name ? data.room_name.replace(/^Room\s+/i, '') : 'C';

                    setContractData({
                        tenantName: `${loggedInUser.first_name || ""} ${loggedInUser.last_name || ""}`.trim(),
                        tenantEmail: activeEmail,
                        tenantPhone: data.contact_no || "____________________",
                        roomName: cleanRoomName,
                        monthlyRent: parseFloat(data.monthly_rent),
                        entryDate: startDateString,
                        dueDateDay: rentDay
                    });
                } else {
                    setError("No active room lease agreements found for this account.");
                }
            } catch (err) {
                console.error("Failed to fetch contract details:", err);
                setError("Failed to connect to the server.");
            } finally {
                setLoading(false);
            }
        };

        fetchContractDetails();
    }, [activeEmail]);

    const handlePrintAction = () => {
        window.print();
    };

    if (loading) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-900 text-white">
                <div className="flex flex-col items-center space-y-4">
                    <FontAwesomeIcon icon={faHourglassHalf} className="text-4xl text-indigo-500 animate-spin" />
                    <h2 className="text-xl font-bold">Loading Contract Details...</h2>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-900 text-white">
                <div className="bg-slate-800/80 p-8 rounded-3xl border border-white/10 text-center max-w-md space-y-4 shadow-2xl">
                    <h2 className="text-2xl font-bold text-rose-500">Error</h2>
                    <p className="text-slate-400 text-sm">{error}</p>
                    <button
                        onClick={() => navigate('/my-room')}
                        className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-xl transition-all border-0 cursor-pointer text-xs"
                    >
                        Back to My Room
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-100 py-10 px-4 md:px-12 box-border flex flex-col items-center print:bg-white print:py-0 print:px-0">
            
            {/*Control Actions Toolbar Bar Panel Layout (Hidden on Print)*/}
            <div className="w-full max-w-3xl flex justify-between items-center mb-6 print:hidden select-none">
                <button
                    onClick={() => navigate('/my-room')}
                    className="flex items-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs border border-slate-200 shadow-sm cursor-pointer transition-all"
                >
                    <FontAwesomeIcon icon={faArrowLeft} />
                    <span>Back to My Room</span>
                </button>
                
                <button
                    onClick={handlePrintAction}
                    className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs border-0 shadow-md cursor-pointer transition-all"
                >
                    <FontAwesomeIcon icon={faPrint} />
                    <span>Print / Save as PDF</span>
                </button>
            </div>

            <style>
                {`
                    @media print {
                        nav, footer, .print\\:hidden, button {
                            display: none !important;
                        }
                        body {
                            background-color: #fff !important;
                            color: #000 !important;
                            font-size: 12pt !important;
                        }
                        .print\\:shadow-none {
                            box-shadow: none !important;
                            border: none !important;
                            padding: 0 !important;
                            margin: 0 !important;
                        }
                        .print\\:page-break {
                            page-break-inside: avoid;
                        }
                    }
                `}
            </style>

            {/*Official Legal Document Wrapper Layout Sheet Container*/}
            <div className="w-full max-w-3xl bg-white border border-slate-200 shadow-xl rounded-2xl p-8 md:p-12 box-border text-left text-slate-800 leading-relaxed font-serif text-base print:shadow-none print:border-none print:p-0">
                
                {/*Forced high-contrast header text sizing to avoid CSS tint inheritance washing out the text color*/}
                <div className="text-center space-y-1 mb-8 border-b-2 border-slate-800 pb-4">
                    <h1 className="text-3xl font-black tracking-tight m-0 !text-[#1e293b] opacity-100 uppercase">KASUNDUAN SA PAGPAPAUPA</h1>
                    <p className="text-slate-500 font-sans text-xs uppercase tracking-widest m-0">Apartment Management System (AMS)</p>
                </div>

                <div className="space-y-6">
                    <p className="m-0 font-bold !text-[#1e293b]">SA PAGITAN NG:</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans text-sm bg-slate-50 p-4 rounded-xl border border-slate-100 print:bg-white print:p-0 print:border-none">
                        <div className="space-y-1">
                            <p className="m-0"><strong>Pangalan ng May-ari ng Apartment:</strong> Elizabeth Angcanan</p>
                            <p className="m-0"><strong>Tirahan ng May-ari:</strong> Tamak, Maguyam, Silang, Cavite</p>
                            <p className="m-0"><strong>Telepono ng May-ari:</strong> ******9552 (Smart)</p>
                        </div>
                        <div className="space-y-1">
                            <p className="m-0"><strong>Pangalan ng Nangungupahan:</strong> {contractData.tenantName}</p>
                            <p className="m-0"><strong>Tirahan ng Nangungupahan:</strong> Sitio Engkanto, Brgy. Maguyam, Silang, Cavite</p>
                            <p className="m-0"><strong>Telepono ng Nangungupahan:</strong> {contractData.tenantPhone}</p>
                            <p className="m-0"><strong>Letra ng Napiling Kwarto:</strong> Room {contractData.roomName}</p>
                        </div>
                    </div>

                    <div>
                        <p className="font-bold !text-[#1e293b] uppercase tracking-wide border-b border-slate-200 pb-1 mb-2 text-sm">PAKSA: PAGPAPAUPA NG APARTMENT</p>
                        <p className="m-0">Sa ilalim ng mga sumusunod na kondisyon, ang May-ari at ang Nangungupahan ay nagkasunduan sa mga sumusunod na tuntunin ng pagrenta ng apartment:</p>
                    </div>

                    {/*Section I*/}
                    <div className="space-y-2">
                        <h4 className="font-bold !text-[#1e293b] m-0 text-base">I. PAGLALARAWAN NG APARTMENT</h4>
                        <p className="m-0"><strong>1. Lokalidad at Adres ng Apartment:</strong><br />Sitio Engkanto, Brgy. Maguyam, Silang, Cavite</p>
                        <p className="m-0"><strong>2. Deskripsyon ng Apartment:</strong><br />Ang apartment ay may isang (1) kwarto, isang (1) palikuran, at may sapat na espasyo para sa kusina at sala. Ang unit ay may tamang laki para sa isang maliit na pamilya, grupo, o indibidwal na naghahanap ng simpleng tirahan. May mga bintana na nagbibigay liwanag at hangin, at ang apartment ay nasa maayos na kondisyon.</p>
                        <p className="m-0"><strong>3. Maximum Capacity ng Apartment:</strong><br />Ang maximum kapasidad ng apartment ay 4 na tao lamang. Kung sakaling lalagpas sa apat (4) na tao, kinakailangan ng Nangungupahan na magbayad ng karagdagang P1,000 kada tao na lalagpas sa itinakdang kapasidad. Ang mga dagdag na bayad na ito ay dapat bayaran kasama ng buwanang upa at hindi maaaring gamitin bilang parte ng security deposit.</p>
                        <p className="m-0"><strong>4. Petsa ng Pagpasok:</strong> {contractData.entryDate}</p>
                    </div>

                    {/*Section II*/}
                    <div className="space-y-2 print:page-break">
                        <h4 className="font-bold !text-[#1e293b] m-0 text-base">II. HATING SA PAGBAYAD NG UPANG</h4>
                        <p className="m-0"><strong>1. Halaga ng Buwanang Upa:</strong><br />Ang buwanang halaga ng upa ay nakadepende sa lokasyon ng unit:<br />• Para sa unit na matatagpuan sa 3rd floor, ang buwanang renta ay P3,500.<br />• Para sa unit na matatagpuan sa 1st at 2nd floor, ang buwanang renta ay P4,000.</p>
                        <p className="m-0"><strong>2. Pangunahing Paraan ng Pagbabayad:</strong><br />Ang pagbabayad ng renta ay maaaring gawin sa alinman sa mga sumusunod na paraan:<br />• <strong>GCash:</strong> ******9552 (Elizabeth A.)<br />• <strong>Banko (BDO):</strong> ********6293 (Savings account)<br />• <strong>Banko (BPI):</strong> ******4206 (Savings account)<br />• <strong>Cash:</strong> Maaaring iabot nang direkta sa May-ari ng apartment.</p>
                        <p className="m-0"><strong>3. Hulog ng Security Deposit:</strong><br />Ang Nangungupahan ay magbabayad ng isang hindi refundable security deposit na nagkakahalaga ng isang buwan na renta (P3,500 o P4,000 base sa upa ng unit). Ang deposito ay magsisilbing garantiya para sa mga posibleng pagkasira o hindi pagkakabayad sa mga gastusin.</p>
                        <p className="m-0"><strong>Pagtukoy sa Paggamit ng Security Deposit:</strong><br />Ang security deposit ay maaaaring gamitin para sa huling buwan ng pagrenta, sa kondisyon na ang lahat ng utility bills (kuryente at tubig) ay bayad na, at walang pinsala o sira sa mga gamit o kagamitan sa apartment. Kung may mga hindi nabayarang utility bills o may sira sa mga kagamitan, ang May-ari ay may karapatang ibawas ang kaukulang halaga mula sa security deposit bago ito gamitin para sa huling buwan ng renta.</p>
                        <p className="m-0"><strong>4. Due Date Reminder:</strong><br />Ang bayad sa renta ay dapat maibigay bago o sa huling araw ng bawat buwan. Ang buwanang due date para sa pagbabayad ng renta ay tuwing ika-<strong>{contractData.dueDateDay}</strong> ng buwan.</p>
                        <p className="m-0 text-slate-600 italic text-sm">Tandaan: Kung sakaling hindi makapagbayad bago ang itinakdang due date, hinihikayat ang Nangungupahan na agad makipag-ugnayan sa May-ari vanished upang mapag-usapan ang posibilidad ng palugit o alternatibong paraan ng pagbayad.</p>
                        <p className="m-0"><strong>5. Payo sa Pagbabayad ng Renta:</strong><br />Walang multa ang ipinapataw sa huling araw ng pagbabayad ng renta. Subalit, hinihikayat ang Nangungupahan na magbayad sa tamang oras at araw ng bawat buwan upang maiwasan ang mga aberya na maaaring magresulta sa pagpapawalang bisa ng kontrata o pagpapalayas sa apartment.</p>
                        <p className="m-0"><strong>6. Pagpapatunay ng Pagbabayad:</strong><br />Kung ang Nangungupahan ay nagbayad sa GCash o Bank transfer, kinakailangan nilang magpadala ng screenshot ng kanilang pagbabayad sa May-ari sa pamamagitan ng Facebook Messenger sa account na <strong>Elizabeth Angcanan</strong> bilang patunay.</p>
                    </div>

                    {/*Section III*/}
                    <div className="space-y-2 print:page-break">
                        <h4 className="font-bold !text-[#1e293b] m-0 text-base">III. MGA RESPONSIBILIDAD NG MAY-ARI</h4>
                        <p className="m-0"><strong>1. Pag-aalaga at Pag-maintenance:</strong><br />Ang May-ari ay responsable sa pagpapagawa ng mga pangunahing sira at pagkumpuni ng apartment na may kinalaman sa mga sistema ng tubig, kuryente, at estruktura ng apartment.</p>
                        <p className="m-0"><strong>2. Pagbibigay ng Maayos na Tirahan:</strong><br />Tinitiyak ng May-ari na ang apartment ay malinis, maayos, at ligtas gamitin bago magpatuloy ang pagrenta.</p>
                    </div>

                    {/*Section IV*/}
                    <div className="space-y-2 print:page-break">
                        <h4 className="font-bold !text-[#1e293b] m-0 text-base">IV. MGA RESPONSIBILIDAD NG NANGUNGUPAHAN</h4>
                        <p className="m-0"><strong>1. Pag-aalaga ng Apartment:</strong><br />Ang Nangungupahan ay dapat mag-ingat at mag-maintain ng kalinisan at kaayusan ng apartment, pati na ang mga kagamitan na kasama sa unit.</p>
                        <p className="m-0"><strong>2. Hindi Pagpapabago ng Estruktura:</strong><br />Hindi maaaring baguhin, sirain, o gawing permanenteng gamit ang anumang bahagi ng apartment (halimbawa, magbutas ng pader o magdikit ng pandikit na mahirap alisin) nang walang pahintulot.</p>
                        <p className="m-0"><strong>3. Pagbabayad ng Utility Bills:</strong><br />Ang Nangungupahan ay mananagot sa lahat ng mga gastusin sa kuryente, tubig, internet, at iba pang utility services.</p>
                        <p className="m-0"><strong>4. Hindi Pagbabayad ng Kuryente at Tubig:</strong><br />Kung sakaling maputulan ng kuryente at tubig dahil sa hindi pagbabayad ng utility bills, hindi magiging responsibilidad ng May-ari ang muling pagkonekta. Ang May-ari ay hindi mananagot para sa anumang abala o inconvenience dulot nito.</p>
                        <p className="m-0"><strong>5. Pagtanggap sa Pagsusuri ng Unit:</strong><br />Ang Nangungupahan ay papayag na magsagawa ng pagsusuri o inspeksyon ang May-ari sa unit para tiyakin na ito ay nasa tamang kondisyon.</p>
                    </div>

                    {/*Section V*/}
                    <div className="space-y-2 print:page-break">
                        <h4 className="font-bold !text-[#1e293b] m-0 text-base">V. PAGWAWAKAS NG KONTRATA</h4>
                        <p className="m-0"><strong>1. Paglabag sa Mga Tuntunin ng Kontrata:</strong><br />Ang May-ari o ang Nangungupahan ay may karapatan na tapusin ang kontrata kung may malubhang paglabag sa mga kondisyon ng kasunduan.</p>
                        <p className="m-0"><strong>2. Pagtatapos ng Kontrata:</strong><br />Kung nais ng alinmang panig na tapusin ang kontrata, kinakailangan na magbigay ng paunang abiso sa kabilang panig ng hindi bababa sa 15 na araw bago ang aktwal na paglabas.</p>
                    </div>

                    {/*Section VI*/}
                    <div className="space-y-2 print:page-break">
                        <h4 className="font-bold !text-[#1e293b] m-0 text-base">VI. IBA PANG MGA TUNTUNIN</h4>
                        <p className="m-0"><strong>1. Pagpapamana ng Karapatan:</strong><br />Hindi maaaring ipamana ng Nangungupahan ang mga karapatan o responsibilidad na nakasaad sa kontratang ito sa iba nang walang pahintulot mula sa May-ari.</p>
                        <p className="m-0"><strong>2. Pagbabago ng Kasunduan:</strong><br />Ang anumang pagbabago o karagdagan sa kontratang ito ay magiging epektibo lamang kapag nakasulat at pinirmahan ng parehong partido.</p>
                    </div>

                    {/*Section VII & Blank Signatures Footer*/}
                    <div className="space-y-12 pt-8 print:page-break">
                        <div>
                            <h4 className="font-bold !text-[#1e293b] m-0 text-base">VII. PAGPIRMA</h4>
                            <p className="m-0">Pinagtibay at pinirmahan ng dalawang partido ang kontratang ito bilang patunay ng kanilang kasunduan.</p>
                        </div>

                        {/*Blank physical signing lines block setup*/}
                        <div className="grid grid-cols-2 gap-12 text-center text-sm font-sans pt-4">
                            <div className="space-y-6">
                                <p className="m-0 text-slate-400">Lalagdaan ng May-ari:</p>
                                <div className="space-y-1">
                                    <div className="w-4/5 border-b border-slate-400 mx-auto h-8"></div>
                                    <p className="m-0 font-bold text-slate-800">Elizabeth Angcanan</p>
                                    <p className="m-0 text-xs text-slate-400">Petsa: ____________________</p>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <p className="m-0 text-slate-400">Lalagdaan ng Nangungupahan:</p>
                                <div className="space-y-1">
                                    <div className="w-4/5 border-b border-slate-400 mx-auto h-8"></div>
                                    <p className="m-0 font-bold text-slate-800">{contractData.tenantName}</p>
                                    <p className="m-0 text-xs text-slate-400">Petsa: ____________________</p>
                                </div>
                            </div>
                        </div>

                        <p className="text-[11px] font-sans text-slate-400 text-center m-0 pt-6 leading-relaxed select-none">
                            <strong>Paalala:</strong> Ang pagpirma ng Nangungupahan sa bawat pahina ng kontrata ay nangangahulugang tinanggap niya at naunawaan ang bawat nakasaad na kondisyon at tuntunin. Ang kontratang ito ay magiging epektibo lamang kapag ganap nang napirmahan ng parehong panig.
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
}