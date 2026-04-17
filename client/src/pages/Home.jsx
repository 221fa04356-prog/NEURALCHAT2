import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { User, Shield, Lock, Mail, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import logo from '../assets/logo.png';
import LandingBackground from '../components/LandingBackground';
import Snackbar from '../components/Snackbar';
import HumanVerification from '../components/HumanVerification';
import '../styles/Home.css';

export default function Home() {
    const [isAdmin, setIsAdmin] = useState(false);
    const [showLoginForm, setShowLoginForm] = useState(false);
    const [showForceLogout, setShowForceLogout] = useState(false);
    const [isHumanVerified, setIsHumanVerified] = useState(false);

    // Separate state for Admin and User
    const [adminEmail, setAdminEmail] = useState('');
    const [adminPassword, setAdminPassword] = useState('');

    const [userLoginId, setUserLoginId] = useState('');
    const [userPassword, setUserPassword] = useState('');

    const [showPassword, setShowPassword] = useState(false);

    // Replaced separate error/msg state with Snackbar state
    const [snackbar, setSnackbar] = useState({ open: false, message: '', type: 'info' });
    const [isExpired, setIsExpired] = useState(false);

    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        // Handle State-based navigation
        if (location.state?.showLogin) {
            setShowLoginForm(true);
            if (location.state?.showAdmin) setIsAdmin(true);
            else setIsAdmin(false);
            window.history.replaceState({}, document.title);
        }

        // Handle Query Param-based navigation (for email links)
        const params = new URLSearchParams(location.search);
        // Handle Logout param from Chat
        if (params.get('logout') === 'true') {
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            localStorage.removeItem('lastActiveChat');
            sessionStorage.clear();
            // Remove the param from URL for a clean look
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        if (params.get('showLogin') === 'true') {
            setShowLoginForm(true);
            if (params.get('role') === 'admin') setIsAdmin(true);
            else setIsAdmin(false);

            // Verify Token if present (from success email)
            const token = params.get('token');
            const userId = params.get('id');

            if (token && userId) {
                axios.post('/api/auth/verify-link-token', { userId, token })
                    .then(() => {
                        // Valid - remove query params
                        window.history.replaceState({}, document.title, window.location.pathname);
                    })
                    .catch(() => {
                        setIsExpired(true);
                        setShowLoginForm(false); // Hide login form to show expired popup
                    });
            }
        }
    }, [location]);

    const handleLogin = async (e, forceParams = false) => {
        if (e) e.preventDefault();

        if (!isHumanVerified) {
            setSnackbar({ open: true, message: 'Please complete the Human Verification first.', type: 'error' });
            return;
        }

        try {
            const payload = isAdmin
                ? { email: adminEmail, password: adminPassword, force: forceParams }
                : { loginId: userLoginId, password: userPassword, force: forceParams };

            const res = await axios.post('/api/auth/login', payload);
            const user = res.data.user;
            const token = res.data.token;
            const normalizedUser = user ? {
                ...user,
                id: user.id || user._id,
                _id: user._id || user.id
            } : user;

            localStorage.setItem('user', JSON.stringify(normalizedUser));
            localStorage.setItem('token', token);

            // Force reload to ensure socket and state are clean
            localStorage.removeItem('lastActiveChat');
            sessionStorage.clear();
            window.dispatchEvent(new Event('authChange'));
            window.location.href = isAdmin && normalizedUser?.role === 'admin' ? '/admin' : '/chat';
        } catch (err) {
            if (err.response?.status === 409 && err.response?.data?.needsForce) {
                setShowForceLogout(true);
            } else {
                setSnackbar({
                    open: true,
                    message: err.response?.data?.error || 'Login failed',
                    type: 'error'
                });
            }
        }
    };

    const handleForgotPassword = async () => {
        if (isAdmin && !adminEmail) {
            setSnackbar({ open: true, message: 'Please enter your email to reset password', type: 'warning' });
            return;
        }
        if (!isAdmin && !userLoginId) {
            setSnackbar({ open: true, message: 'Please enter your Login ID to request password reset', type: 'warning' });
            return;
        }

        try {
            const payload = isAdmin ? { email: adminEmail } : { loginId: userLoginId };
            const res = await axios.post('/api/auth/forgot-password', payload);
            const displayName = res.data.name || 'User';
            const userIdentifier = `${displayName} (${isAdmin ? adminEmail : userLoginId})`;
            setSnackbar({
                open: true,
                message: 'Password reset request sent to Admin.',
                type: 'success',
                senderName: userIdentifier
            });
        } catch (err) {
            setSnackbar({
                open: true,
                message: err.response?.data?.error || 'Request failed',
                type: 'error'
            });
        }
    };

    const handlePasswordKeyDown = (e) => {
        if (e.key === ' ') {
            e.preventDefault();
        }
    };






    if (isExpired) {
        return (
            <div className="home-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LandingBackground />
                <style>
                    {`
                        @keyframes dropIn {
                            0% { transform: translateY(-50px); opacity: 0; }
                            100% { transform: translateY(0); opacity: 1; }
                        }
                    `}
                </style>
                <div
                    className="login-card"
                    style={{
                        textAlign: 'center',
                        maxWidth: '420px',
                        padding: '3rem',
                        position: 'relative',
                        zIndex: 10,
                        background: 'rgba(255, 255, 255, 0.4)', // More transparent
                        backdropFilter: 'blur(10px)',
                        animation: 'dropIn 0.6s cubic-bezier(0.22, 1, 0.36, 1)', // Drop effect
                        border: '1px solid rgba(255, 255, 255, 0.4)'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <Shield size={32} color=" #0D9BB3" />
                        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0D9BB3', margin: 0, letterSpacing: '-0.02em' }}>Link Expired</h2>
                    </div>
                    <p style={{ fontSize: '1rem', color: '#64748b', lineHeight: 1.6, marginBottom: '0' }}>
                        This login link has expired because your password has been changed. Please refer recent mails.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="home-container">
            <LandingBackground />

            {snackbar.open && (
                <Snackbar
                    message={snackbar.message}
                    type={snackbar.type}
                    variant="default"
                    senderName={snackbar.senderName || "Admin"}
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                />
            )}

            {/* Interactive Content Container */}
            <div className="home-content-wrapper">

                {!showLoginForm ? (
                    /* Hero Landing View */
                    <div className="hero-view fade-in">
                        <div className="hero-left">
                            <div className="logo-container">
                                <img src={logo} alt="Neural Chat Logo" />
                            </div>
                            <p className="tagline">
                                Secure AI-Powered Communication
                            </p>
                        </div>

                        <div className="hero-right">
                            <h1 className="brand-title">
                                Neural Chat
                            </h1>

                            <div className="button-group">
                                <button
                                    onClick={() => { setIsAdmin(false); setShowLoginForm(true); }}
                                    className="btn-primary-neural"
                                    style={{
                                        padding: '1.2rem 2rem',
                                        borderRadius: '1rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    <User size={20} /> User Login
                                </button>
                                <button
                                    onClick={() => { setIsAdmin(true); setShowLoginForm(true); }}
                                    className="btn-outline-neural"
                                    style={{
                                        padding: '1.2rem 2rem',
                                        borderRadius: '1rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    <Shield size={20} /> Admin Login
                                </button>
                            </div>
                        </div>
                    </div>
                ) : showForceLogout ? (
                    /* Force Logout Warning View */
                    <div className="login-card-container fade-in-scale">
                        <div className="login-card">
                            <div className="login-header" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                                <div style={{ display: 'inline-flex', padding: '16px', background: '#fee2e2', borderRadius: '50%', marginBottom: '1rem' }}>
                                    <Lock size={32} color="#ef4444" />
                                </div>
                                <h2 className="login-title" style={{ color: '#ef4444', fontSize: '1.5rem', marginBottom: '8px' }}>Active Session Found</h2>
                                <p className="login-subtitle" style={{ fontSize: '1rem', color: '#64748b' }}>
                                    The user is already signed in on another device.
                                </p>
                            </div>

                            <p style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '24px', textAlign: 'center', lineHeight: '1.6' }}>
                                Logging in here will disconnect your other session. Do you want to sign out from the other device and continue?
                            </p>

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    onClick={() => setShowForceLogout(false)}
                                    className="btn-outline-neural"
                                    style={{ flex: 1, padding: '1rem', borderRadius: '1rem', fontWeight: 'bold' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleLogin(null, true)}
                                    className="btn-primary-neural"
                                    style={{ flex: 1, padding: '1rem', borderRadius: '1rem', background: '#ef4444', border: 'none', fontWeight: 'bold', color: 'white' }}
                                >
                                    Signout
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Login Portal View */
                    <div className="login-card-container fade-in-scale">
                        <div className="login-card">
                            <button
                                onClick={() => setShowLoginForm(false)}
                                className="back-button"
                            >
                                <ArrowLeft size={18} /> Back
                            </button>

                            <div className="login-header">
                                <h2 className="login-title">
                                    {isAdmin ? 'Admin Login' : 'User Login'}
                                </h2>
                                <p className="login-subtitle">Access your Neural Portal</p>
                            </div>

                            <form onSubmit={handleLogin} className="login-form">
                                {/* Inline alerts removed to prevent layout shift */}

                                <div className="form-group-custom">
                                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '700', color: '#475569', marginBottom: '0.6rem' }}>
                                        {isAdmin ? 'Email' : 'Login ID'}
                                    </label>
                                    <div style={{ position: 'relative', width: '100%' }}>
                                        {isAdmin ? <Mail size={18} style={{ position: 'absolute', top: '14px', left: '14px', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                            : <User size={18} style={{ position: 'absolute', top: '14px', left: '14px', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />}
                                        <input
                                            type={isAdmin ? "email" : "text"}
                                            value={isAdmin ? adminEmail : userLoginId}
                                            onChange={(e) => {
                                                if (isAdmin) {
                                                    setAdminEmail(e.target.value.replace(/\s/g, ''));
                                                } else {
                                                    const val = e.target.value;
                                                    if (/^\d*$/.test(val)) {
                                                        setUserLoginId(val.replace(/\s/g, ''));
                                                    }
                                                }
                                            }}
                                            placeholder={isAdmin ? "your@email.com" : "Enter Login ID"}
                                            required
                                            className="input-neural"
                                        />
                                    </div>
                                </div>

                                <div className="form-group-custom">
                                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '700', color: '#475569', marginBottom: '0.6rem' }}>Password</label>
                                    <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '10px' }}>
                                        <div style={{ position: 'relative', flex: 1 }}>
                                            <Lock size={18} style={{ position: 'absolute', top: '50%', left: '14px', transform: 'translateY(-50%)', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                value={isAdmin ? adminPassword : userPassword}
                                                onChange={(e) => isAdmin ? setAdminPassword(e.target.value.replace(/\s/g, '')) : setUserPassword(e.target.value.replace(/\s/g, ''))}
                                                onKeyDown={handlePasswordKeyDown}
                                                placeholder="Enter Password"
                                                required
                                                style={{ paddingLeft: '44px', paddingRight: '14px', width: '100%' }}
                                                className="input-neural"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="password-toggle-btn"
                                        >
                                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                        </button>
                                    </div>
                                </div>

                                <div style={{ marginTop: '1.5rem' }}>
                                    <HumanVerification
                                        onVerified={(status) => setIsHumanVerified(status)}
                                        context={isAdmin ? 'admin_login' : 'user_login'}
                                        identifier={isAdmin ? adminEmail : userLoginId}
                                    />
                                </div>

                                <button type="submit" className="btn-primary-neural" style={{ width: '100%', padding: '1.2rem', borderRadius: '1rem', border: 'none', fontWeight: '800', fontSize: '1.1rem', cursor: 'pointer', marginTop: '0.5rem' }}>
                                    Log In Now
                                </button>

                                <div className="login-footer">
                                    <button type="button" onClick={() => isAdmin ? navigate('/admin-reset') : handleForgotPassword()}>Forgot Password?</button>
                                    <Link to={isAdmin ? "/admin-register" : "/register"} className="secondary-link">Create Account</Link>
                                </div>
                            </form>
                        </div>
                    </div >
                )
                }
            </div>
        </div>
    );
}
