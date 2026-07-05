import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate } from 'react-router-dom';

//Components
import TopBar from './Components/TopBar';
import LogInModal from './Components/LogInModal';
import Footer from './Components/Footer';

//User Pages
import Home from './UserPages/Home';
import Preview from './UserPages/Preview';
import Login from './UserPages/Login';
import Registration from './UserPages/Registration';
import Services from './UserPages/Services';
import PayBills from './UserPages/PayBills';
import ParkingReservation from './UserPages/ParkingReservation';
import CctvRequest from './UserPages/CctvRequest'; 
import MaintenanceRequest from './UserPages/MaintenanceRequest'; 
import RentApplication from './UserPages/RentApplication';
import ProfileSettings from './UserPages/ProfileSettings';
import MyRoom from './UserPages/MyRoom';

//Admin Pages
import AdminDashboard from './AdminPages/AdminDashboard';
import AdminUnits from './AdminPages/AdminUnits';
import AdminTenants from './AdminPages/AdminTenants';
import AdminPayments from './AdminPages/AdminPayments';
import AdminMaintenance from './AdminPages/AdminMaintainance';
import AdminAnnouncements from './AdminPages/AdminAnnouncements';
import AdminReports from './AdminPages/AdminReports';
import AdminNotifications from './AdminPages/AdminNotifications';
import AdminContracts from './AdminPages/AdminContracts';

//Client-side access controller middleware component block
function ProtectedRoute({ children }) {
  const loggedInUser = sessionStorage.getItem("loggedInUser");
  
  if (!loggedInUser) {
    {/*Redirect unauthenticated users immediately back to login window path*/}
    return <Navigate to="/login" replace />;
  }
  return children;
}

//Conditional Layout Wrapper Framework Component containing universal global Footer injection
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
      {/*Flex container expands to push footer to bottom flawlessly on shorter page view nodes*/}
      <main className="w-full flex-grow flex flex-col justify-start">
        {children}
      </main>
      <Footer /> {/*Enforces structural blue uniform layout footer area block tracking element rules universally*/}
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
      setIsModalOpen(true);
    } else {
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
        
        {/*SECURED TENANT DASHBOARDS SERVICES (WRAPPED IN PROTECTED ROUTE CONTROLLERS)*/}
        <Route path="/services" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><Services /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/pay-bills" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><PayBills /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/parking-reservation" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><ParkingReservation /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/cctv-request" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><CctvRequest /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/maintenance-request" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><MaintenanceRequest /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/rent-application" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><RentApplication /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/profile-settings" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><ProfileSettings /></BaseAppLayout></ProtectedRoute>} />
        <Route path="/my-room" element={<ProtectedRoute><BaseAppLayout hasRentedRoom={hasRentedRoom}><MyRoom /></BaseAppLayout></ProtectedRoute>} />

        {/*SECURITY AUTH TARGET SCHEMAS*/}
        <Route path="/login" element={<Login onRegisterRedirect={() => navigate('/register')} onAdminRedirect={() => navigate('/admin-dashboard')} onHomeRedirect={() => navigate('/home')}/>} />
        <Route path="/register" element={<Registration onLoginRedirect={() => navigate('/login')} />} />

        {/*ADMIN OPERATION PANEL WORKSPACES*/}
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
        <Route path="/admin-units" element={<AdminUnits />} />
        <Route path="/admin-tenants" element={<AdminTenants />} />
        <Route path="/admin-payments" element={<AdminPayments />} />
        <Route path="/admin-maintenance" element={<AdminMaintenance />} />
        <Route path="/admin-announcements" element={<AdminAnnouncements />} />
        <Route path="/admin-reports" element={<AdminReports />} />
        <Route path="/admin-notifications" element={<AdminNotifications />} />
        <Route path="/admin-contracts" element={<AdminContracts />} />
      </Routes>

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