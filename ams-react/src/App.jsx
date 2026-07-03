import React, {useState} from 'react';
import {BrowserRouter as Router, Routes, Route, useNavigate} from 'react-router-dom';

//Components
import GuestTopBar from './Components/GuestTopBar';
import UserTopBar from './Components/UserTopBar';
import GuestLogInModal from './Components/GuestLogInModal';

//User Pages
import GuestHome from './GuestPages/GuestHome';
import GuestPreview from './GuestPages/GuestPreview';
import Login from './UserPages/Login';
import Registration from './UserPages/Registration';
import UserHome from './UserPages/UserHome';
import UserPreview from './UserPages/UserPreview';
import Services from './UserPages/Services';
import ParkingReservation from './UserPages/ParkingReservation';
import CctvRequest from './UserPages/CctvRequest'; 
import MaintenanceRequest from './UserPages/MaintenanceRequest'; 
import RentApplication from './UserPages/RentApplication';

//Admin Pages
import AdminDashboard from './AdminPages/AdminDashboard';
import AdminUnits from './AdminPages/AdminUnits';
import AdminTenants from './AdminPages/AdminTenants';
import AdminPayments from './AdminPages/AdminPayments';
import AdminMaintainance from './AdminPages/AdminMaintainance';
import AdminAnnouncements from './AdminPages/AdminAnnouncements';
import AdminReports from './AdminPages/AdminReports';

//Layout Formats:
function GuestLayout({children, onLoginClick}) {
  return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col text-slate-600 selection:bg-indigo-500 selection:text-white">
      <GuestTopBar onLoginClick={onLoginClick} />
      <main className="w-full flex-grow flex flex-col">
        {children}
      </main>
    </div>
  );
}

function UserLayout({children, hasRentedRoom}) {
  const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");
  const username = `${loggedInUser.first_name || ""} ${loggedInUser.last_name || ""}`.trim() || "Username";
  return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col text-slate-600 selection:bg-indigo-500 selection:text-white">
      <UserTopBar hasRentedRoom={hasRentedRoom} username={username} />
      <main className="w-full flex-grow flex flex-col">
        {children}
      </main>
    </div>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  {/*Change this toggle to true/false manually to verify navigation visibility changes before attaching backend databases*/}
  const [hasRentedRoom, setHasRentedRoom] = useState(true);

  //Route Controls
  const handleRentClick = () => setIsModalOpen(true);
  
  const handleUserRentAction = (roomId) => {
    //Captures the room configuration ID selected from the available listings card deck grid
    navigate('/rent-application', { state: { selectedRoomId: roomId } });
  };

  return (
    <>
      <Routes>
        {/*GUEST PAGES*/}
        <Route path="/" element={<GuestLayout onLoginClick={() => navigate('/login')}><GuestHome onCardClick={() => navigate('/preview')} /></GuestLayout>} />
        <Route path="/preview" element={<GuestLayout onLoginClick={() => navigate('/login')}><GuestPreview onRentClick={handleRentClick} /></GuestLayout>} />

        {/*USER PAGES*/}
        <Route path="/home" element={<UserLayout hasRentedRoom={hasRentedRoom}><UserHome onCardClick={() => navigate('/user-preview')} username={JSON.parse(sessionStorage.getItem("loggedInUser") || "{}").first_name || "Username"}/></UserLayout>} />
        <Route path="/user-preview" element={<UserLayout hasRentedRoom={hasRentedRoom}><UserPreview onRentClick={handleUserRentAction} /></UserLayout>} />
        <Route path="/services" element={<UserLayout hasRentedRoom={hasRentedRoom}><Services /></UserLayout>} />
        <Route path="/parking-reservation" element={<UserLayout hasRentedRoom={hasRentedRoom}><ParkingReservation /></UserLayout>} />
        <Route path="/cctv-request" element={<UserLayout hasRentedRoom={hasRentedRoom}><CctvRequest /></UserLayout>} />
        <Route path="/maintenance-request" element={<UserLayout hasRentedRoom={hasRentedRoom}><MaintenanceRequest /></UserLayout>} />
        <Route path="/rent-application" element={<UserLayout hasRentedRoom={hasRentedRoom}><RentApplication /></UserLayout>} />

        {/*AUTH PAGES*/}
        <Route path="/login" element={<Login onRegisterRedirect={() => navigate('/register')} onAdminRedirect={() => navigate('/admin-dashboard')} onHomeRedirect={() => navigate('/home')}/>} />
        <Route path="/register" element={<Registration onLoginRedirect={() => navigate('/login')} />} />

        {/*ADMIN PAGES*/}
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
        <Route path="/admin-units" element={<AdminUnits />} />
        <Route path="/admin-tenants" element={<AdminTenants />} />
        <Route path="/admin-payments" element={<AdminPayments />} />
        <Route path="/admin-maintenance" element={<AdminMaintainance />} />
        <Route path="/admin-announcements" element={<AdminAnnouncements />} />
        <Route path="/admin-reports" element={<AdminReports />} />
      </Routes>

      {/*Global Components*/}
      <GuestLogInModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onLoginRedirect={() => {
          setIsModalOpen(false);
          navigate('/login');
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}