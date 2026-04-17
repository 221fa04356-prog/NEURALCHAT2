import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Register from './pages/Register';
import AdminRegister from './pages/AdminRegister';
import AdminReset from './pages/AdminReset';
import UserReset from './pages/UserReset';
import AdminDashboard from './pages/AdminDashboard';
import Chat from './pages/Chat';
import AIChatWidget from './components/AIChatWidget';
import NeuralBackground from './components/NeuralBackground';
import './styles/index.css';

function AppContent() {
  const location = useLocation();
  const showNeural = ['/chat', '/admin', '/reset', '/admin-reset'].some(path => 
    location.pathname === path || location.pathname.startsWith(path + '/')
  );

  return (
    <>
      <style>{`
        body { background-color: transparent !important; }
        #root { background-color: transparent !important; }
        .app-main-wrapper { position: relative; z-index: 1; height: 100vh; width: 100vw; overflow: hidden; background: transparent; }
      `}</style>
      
      {showNeural && <NeuralBackground />}
      
      <div className="app-main-wrapper">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<Register />} />
          <Route path="/admin-register" element={<AdminRegister />} />
          <Route path="/admin-reset" element={<AdminReset />} />
          <Route path="/reset" element={<UserReset />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        <AIChatWidget />
      </div>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
