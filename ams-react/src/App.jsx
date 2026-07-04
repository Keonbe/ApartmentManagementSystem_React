import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate } from 'react-router-dom';

//Components
import TopBar from './Components/TopBar';
import LogInModal from './Components/LogInModal';

//User Pages
import Home from './UserPages/Home';
import Preview from './UserPages/Preview';
import Login from './UserPages/Login';
import Registration from './UserPages/Registration';
import Services from './UserPages/Services';
import ParkingReservation from './UserPages/ParkingReservation';
import CctvRequest from './UserPages/CctvRequest'; 
import MaintenanceRequest from './UserPages/MaintenanceRequest'; 
import RentApplication from './UserPages/RentApplication';
import ProfileSettings from './UserPages/ProfileSettings';

//Admin Pages
import AdminDashboard from './AdminPages/AdminDashboard';
import AdminUnits from './AdminPages/AdminUnits';
import AdminTenants from './AdminPages/AdminTenants';
import AdminPayments from './AdminPages/AdminPayments';
import AdminMaintainance from './AdminPages/AdminMaintainance';
import AdminAnnouncements from './AdminPages/AdminAnnouncements';
import AdminReports from './AdminPages/AdminReports';
import AdminNotifications from './AdminPages/AdminNotifications';
import AdminContracts from './AdminPages/AdminContracts';

//Conditional Layout Wrapper Framework Component
function BaseAppLayout({ children, hasRentedRoom }) {
  const navigate = useNavigate();
  const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "null");
  const isLoggedIn = loggedInUser !== null;
  const username = isLoggedIn ? `${loggedInUser.first_name || ""} ${loggedInUser.last_name || ""}`.trim() : null;

  return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col text-slate-600 selection:bg-indigo-500 selection:text-white">
      <TopBar 
        hasRentedRoom={hasRentedRoom} 
        isLoggedIn={isLoggedIn} 
        username={username || "Guest"} 
        onLoginClick={() => navigate('/login')} 
      />
      <main className="w-full flex-grow flex flex-col">
        {children}
      </main>
    </div>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  //Toggle true/false manually to verify navigation element states visibility changes
  const [hasRentedRoom, setHasRentedRoom] = useState(true);

  //Global Route Action Protection Layer
  const handleRentActionTrigger = (roomId) => {
    const loggedInUser = sessionStorage.getItem("loggedInUser");
    
    if (!loggedInUser) {
      //Intercept guests and prompt login popup
      setIsModalOpen(true);
    } else {
      //Forward authenticated tenants directly to the application workspace
      navigate('/rent-application', { state: { selectedRoomId: roomId } });
    }
  };

  return (
    <>
      <Routes>
        {/*UNIFIED PUBLIC PATHWAYS*/}
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<BaseAppLayout hasRentedRoom={hasRentedRoom}><Home onCardClick={() => navigate('/preview')} username={JSON.parse(sessionStorage.getItem("loggedInUser") || "{}").first_name} /></BaseAppLayout>} />
        <Route path="/preview" element={<BaseAppLayout hasRentedRoom={hasRentedRoom}><Preview onRentClick={handleRentActionTrigger} /></BaseAppLayout>} />
        
        {/*SECURED TENANT DASHBOARDS SERVICES*/}
        <Route path="/services" element={<BaseAppLayout hasRentedRoom={hasRentedRoom}><Services /></BaseAppLayout>} />
        <Route path="/parking-reservation" element={<BaseAppLayout hasRentedRoom={hasRentedRoom}><ParkingReservation /></BaseAppLayout>} />
        <Route path="/cctv-request" element={<BaseAppLayout hasRentedRoom={hasRentedRoom}><CctvRequest /></BaseAppLayout>} />
        <Route path="/maintenance-request" element={<BaseAppLayout hasRentedRoom={hasRentedRoom}><MaintenanceRequest /></BaseAppLayout>} />
        <Route path="/rent-application" element={<BaseAppLayout hasRentedRoom={hasRentedRoom}><RentApplication /></BaseAppLayout>} />
        <Route path="/profile-settings" element={<BaseAppLayout hasRentedRoom={hasRentedRoom}><ProfileSettings /></BaseAppLayout>} />

        {/*SECURITY AUTH TARGET SCHEMAS*/}
        <Route path="/login" element={<Login onRegisterRedirect={() => navigate('/register')} onAdminRedirect={() => navigate('/admin-dashboard')} onHomeRedirect={() => navigate('/home')}/>} />
        <Route path="/register" element={<Registration onLoginRedirect={() => navigate('/login')} />} />

        {/*ADMIN OPERATION PANEL WORKSPACES*/}
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
        <Route path="/admin-units" element={<AdminUnits />} />
        <Route path="/admin-tenants" element={<AdminTenants />} />
        <Route path="/admin-payments" element={<AdminPayments />} />
        <Route path="/admin-maintenance" element={<AdminMaintainance />} />
        <Route path="/admin-announcements" element={<AdminAnnouncements />} />
        <Route path="/admin-reports" element={<AdminReports />} />
        <Route path="/admin-notifications" element={<AdminNotifications />} />
        <Route path="/admin-contracts" element={<AdminContracts />} />
      </Routes>

      {/*Global Authenticate Prompt Intercept Popup*/}
      <LogInModal 
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