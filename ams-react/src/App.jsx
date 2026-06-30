import React, {useState} from 'react';
import {BrowserRouter as Router, Routes, Route, useNavigate} from 'react-router-dom';

//Components
import GuestTopBar from './Components/GuestTopBar';
import UserTopBar from './Components/UserTopBar';
import GuestLogInModal from './Components/GuestLogInModal';

//Pages
import GuestHome from './GuestPages/GuestHome';
import GuestPreview from './GuestPages/GuestPreview';
import Login from './UserPages/Login';
import Registration from './UserPages/Registration';
import UserHome from './UserPages/UserHome';
import UserPreview from './UserPages/UserPreview';

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
  return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col text-slate-600 selection:bg-indigo-500 selection:text-white">
      {/*Pass state down dynamically to the unified header*/}
      <UserTopBar hasRentedRoom={hasRentedRoom} username="Username" />
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
  const [hasRentedRoom, setHasRentedRoom] = useState(false);

  //Route Controls
  const handleRentClick = () => setIsModalOpen(true);
  
  const handleUserRentAction = (roomId) => {
    alert(`Processing apartment room ${roomId} system assignment workflow...`);
    setHasRentedRoom(true); {/*Dynamically unlocks topbar links upon click mock action*/}
  };

  return (
    <>
      <Routes>
        {/*GUEST PAGES*/}
        <Route path="/" element={<GuestLayout onLoginClick={() => navigate('/login')}><GuestHome onCardClick={() => navigate('/preview')} /></GuestLayout>} />
        <Route path="/preview" element={<GuestLayout onLoginClick={() => navigate('/login')}><GuestPreview onRentClick={handleRentClick} /></GuestLayout>} />

        {/*USER PAGES*/}
        <Route path="/home" element={<UserLayout hasRentedRoom={hasRentedRoom}><UserHome onCardClick={() => navigate('/user-preview')} /></UserLayout>} />
        <Route path="/user-preview" element={<UserLayout hasRentedRoom={hasRentedRoom}><UserPreview onRentClick={handleUserRentAction} /></UserLayout>} />

        {/*AUTH PAGES*/}
        <Route path="/login" element={<Login onRegisterRedirect={() => navigate('/register')} />} />
        <Route path="/register" element={<Registration onLoginRedirect={() => navigate('/login')} />} />
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