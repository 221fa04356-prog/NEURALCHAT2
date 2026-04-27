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

class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Route render error:', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#0b141a',
        color: '#e2e8f0'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '520px',
          background: 'rgba(15, 23, 42, 0.96)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          borderRadius: '20px',
          padding: '28px'
        }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '24px', color: '#f8fafc' }}>Chat failed to load</h2>
          <p style={{ margin: '0 0 16px', lineHeight: 1.5, color: '#cbd5e1' }}>
            The chat page hit a render error. This replaces the white screen so the app stays usable.
          </p>
          {this.state.error?.message && (
            <pre style={{
              margin: '0 0 16px',
              padding: '12px',
              borderRadius: '12px',
              overflowX: 'auto',
              background: 'rgba(2, 6, 23, 0.7)',
              color: '#fda4af',
              whiteSpace: 'pre-wrap'
            }}>
              {this.state.error.message}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.reload()}
              style={{ border: 'none', borderRadius: '999px', padding: '10px 18px', background: '#0ea5be', color: '#fff', cursor: 'pointer' }}
            >
              Reload chat
            </button>
            <button
              onClick={() => window.location.assign('/')}
              style={{ border: '1px solid rgba(148, 163, 184, 0.35)', borderRadius: '999px', padding: '10px 18px', background: 'transparent', color: '#e2e8f0', cursor: 'pointer' }}
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function AppContent() {
  const location = useLocation();
  const showNeural = ['/chat', '/reset', '/admin-reset', '/admin'].some(path => 
    location.pathname === path || location.pathname.startsWith(path + '/')
  );

  return (
    <>
      {showNeural ? (
        <style>{`
          body { background-color: transparent !important; }
          #root { background-color: transparent !important; }
          .app-main-wrapper { position: relative; z-index: 1; height: 100vh; width: 100vw; overflow: hidden; background: transparent; }
        `}</style>
      ) : (
        <style>{`
          .app-main-wrapper { position: relative; z-index: 1; height: 100vh; width: 100vw; overflow: hidden; background: var(--app-bg); }
        `}</style>
      )}
      
      {showNeural && <NeuralBackground />}
      
      <div className="app-main-wrapper">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<Register />} />
          <Route path="/admin-register" element={<AdminRegister />} />
          <Route path="/admin-reset" element={<AdminReset />} />
          <Route path="/reset" element={<UserReset />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/chat" element={<RouteErrorBoundary><Chat /></RouteErrorBoundary>} />
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
