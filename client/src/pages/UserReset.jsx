import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Lock, Eye, EyeOff, ArrowLeft, ShieldAlert } from 'lucide-react';
import HumanVerification from '../components/HumanVerification';
import Snackbar from '../components/Snackbar';
import '../styles/Home.css';
import '../styles/ConfirmModal.css';

export default function UserReset() {
    const [searchParams] = useSearchParams();
    const urlLoginId = searchParams.get('loginId');
    const urlTempPassword = searchParams.get('tempPassword');
    const urlToken = searchParams.get('token');
    const urlUserId = searchParams.get('id');

    // Initialize state from URL params OR Session Storage (for refresh persistence)
    const [loginId, setLoginId] = useState(() => {
        return urlLoginId || sessionStorage.getItem('reset_loginId') || '';
    });

    const [tempPassword, setTempPassword] = useState(() => {
        return urlTempPassword || sessionStorage.getItem('reset_tempPassword') || '';
    });

    // Check if we have a locked/verified session
    const hasVerifiedSession = !!sessionStorage.getItem('reset_tempPassword');
    const isTempLocked = !!urlTempPassword || hasVerifiedSession;

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showTempPassword, setShowTempPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', type: 'info' });
    const [isExpired, setIsExpired] = useState(() => {
        return sessionStorage.getItem('reset_expired') === 'true';
    });
    const [isHumanVerified, setIsHumanVerified] = useState(false);
    const [resetSuccessful, setResetSuccessful] = useState(false);
    const [passwordRequirements, setPasswordRequirements] = useState({
        minLength: false,
        startsWithCapital: false,
        hasSpecialChar: false,
        hasNumber: false
    });
    const [showSamePasswordConfirm, setShowSamePasswordConfirm] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [allowSamePassword, setAllowSamePassword] = useState(false);

    // Only show verifying screen if we have URL params and haven't already established a session type
    const [verifying, setVerifying] = useState(!!(urlLoginId && urlTempPassword));

    const navigate = useNavigate();

    useEffect(() => {
        const verifyLink = async () => {
            // 1. Verify Token (Link Expiry Check)
            if (urlToken && urlUserId) {
                try {
                    await axios.post('/api/auth/verify-link-token', { userId: urlUserId, token: urlToken });
                    // Token Valid - Continue
                } catch (err) {
                    console.error('Token verification failed:', err);
                    setIsExpired(true);
                    return; // Stop further checks
                }
            }

            // 2. Verify Temp Password (Legacy/Direct Check) - Only if params exist
            if (urlLoginId && urlTempPassword) {
                try {
                    console.log('Verifying link for:', { loginId: urlLoginId, tempPassword: urlTempPassword });
                    const res = await axios.post('/api/auth/verify-temp', {
                        loginId: urlLoginId,
                        tempPassword: urlTempPassword
                    });
                    console.log('Verification success:', res.data);

                    // SUCCESS: Store valid credentials in session
                    sessionStorage.setItem('reset_loginId', urlLoginId);
                    sessionStorage.setItem('reset_tempPassword', urlTempPassword);
                    sessionStorage.removeItem('reset_expired');

                    // If successful, clear URL parameters
                    setVerifying(false);
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, document.title, newUrl);
                } catch (err) {
                    console.error('Verification failed:', err);
                    setVerifying(false); // Stop verifying

                    // FAILURE: Store expired state
                    sessionStorage.setItem('reset_expired', 'true');
                    sessionStorage.removeItem('reset_loginId');
                    sessionStorage.removeItem('reset_tempPassword');

                    // Clear keys from URL even on failure for security
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, document.title, newUrl);

                    setIsExpired(true);  // Show expired screen
                }
            } else {
                // If no URL params, check if we are already in a valid session state
                if (!sessionStorage.getItem('reset_tempPassword') && !sessionStorage.getItem('reset_expired')) {
                    // Normal manual reset - do nothing
                }
                setVerifying(false);
            }
        };

        verifyLink();
    }, [urlLoginId, urlTempPassword, urlToken, urlUserId]);

    if (isExpired) {
        return (
            <div className="home-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '0.8rem' }}>
                        <ShieldAlert size={32} color=" #0D9BB3" />
                        <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0D9BB3', margin: 0, letterSpacing: '-0.02em' }}>Link Expired</h2>
                    </div>
                    <p style={{ fontSize: '1rem', color: '#64748b', lineHeight: 1.6, marginBottom: '0' }}>
                        This password reset link has expired or is invalid. Please check your inbox for the most recent link.
                    </p>
                </div>
            </div>
        );
    }

    if (verifying) {
        return (
            <div className="home-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                
                <div style={{ color: '#334155', fontSize: '1.5rem', fontWeight: '600', zIndex: 10, background: 'rgba(255,255,255,0.9)', padding: '2rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    Verifying Link...
                </div>
            </div>
        );
    }

    const handlePasswordKeyDown = (e) => {
        if (e.key === ' ') {
            e.preventDefault();
        }
    };

    const checkPasswordRequirements = (password) => {
        setPasswordRequirements({
            minLength: password.length >= 8,
            startsWithCapital: /^[A-Z]/.test(password),
            hasSpecialChar: /[@#$&*]/.test(password),
            hasNumber: /\d/.test(password)
        });
    };

    const executeReset = async () => {
        try {
            await axios.post('/api/auth/reset-password-temp', {
                loginId,
                tempPassword,
                newPassword,
                allowSamePassword
            });

            setSnackbar({
                open: true,
                message: 'Password reset successful! Redirecting...',
                type: 'success'
            });

            // Redirect to login after short delay
            setTimeout(() => {
                localStorage.clear();
                sessionStorage.clear();
                navigate('/', { state: { showLogin: true } });
            }, 1500);

        } catch (err) {
            setSnackbar({
                open: true,
                message: err.response?.data?.error || 'Password reset failed',
                type: 'error'
            });
            setShowSamePasswordConfirm(false);
        }
    };

    const handleReset = async (e) => {
        e.preventDefault();

        if (!isHumanVerified) {
            setSnackbar({ open: true, message: 'Please complete the Human Verification first', type: 'warning' });
            return;
        }

        // Validation
        if (newPassword !== confirmPassword) {
            setSnackbar({
                open: true,
                message: 'Passwords do not match',
                type: 'error'
            });
            return;
        }

        if (newPassword === tempPassword && !allowSamePassword) {
            setShowSamePasswordConfirm(true);
            return;
        }

        if (newPassword.length < 8) {
            setSnackbar({
                open: true,
                message: 'Password must be at least 8 characters',
                type: 'warning'
            });
            return;
        }

        const passwordRegex = /^[A-Z][a-z]*(?=.*\d)(?=.*[@#$&*])[a-z\d@#$&*]{7,}$/;
        if (!passwordRegex.test(newPassword)) {
            setSnackbar({
                open: true,
                message: 'Password must start with uppercase letter, followed by lowercase letters, and include numbers and special characters (@,#,$,&,*)',
                type: 'warning'
            });
            return;
        }

        // Show Confirmation Modal instead of executing immediately
        setShowConfirmModal(true);
    };

    return (
        <div className="home-container">
            

            {snackbar.open && snackbar.type !== 'success' && (
                <Snackbar
                    message={snackbar.message}
                    type={snackbar.type}
                    duration={3000}
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                />
            )}

            {/* Same Password Confirmation Modal */}
            {showSamePasswordConfirm && (
                <div className="confirm-modal-overlay">
                    <div className="confirm-modal">
                        <div className="confirm-modal-header">
                            <div className="confirm-modal-icon-wrapper">
                                <ShieldAlert size={24} color="#f59e0b" />
                            </div>
                            <h3>Confirm Password</h3>
                        </div>
                        <div className="confirm-modal-body">
                            <p>Are you sure to proceed with same temporary password?</p>
                        </div>
                        <div className="confirm-modal-footer">
                            <button
                                className="btn-secondary"
                                onClick={() => setShowSamePasswordConfirm(false)}
                            >
                                Change
                            </button>
                            <button
                                className="btn-primary-neural"
                                style={{ padding: '0.6rem 1.2rem', borderRadius: '0.5rem', fontSize: '0.9rem' }}
                                onClick={() => {
                                    setAllowSamePassword(true);
                                    setShowSamePasswordConfirm(false);
                                }}
                            >
                                Accepted
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* General Confirmation Modal before Reset */}
            {showConfirmModal && (
                <div className="confirm-modal-overlay">
                    <div className="confirm-modal">
                        <div className="confirm-modal-header">
                            <div className="confirm-modal-icon-wrapper">
                                <Lock size={24} color="#0D9BB3" />
                            </div>
                            <h3>Confirm Password Reset</h3>
                        </div>
                        <div className="confirm-modal-body">
                            <p>Are you sure you want to reset your password with the new credentials?</p>
                        </div>
                        <div className="confirm-modal-footer">
                            <button
                                className="btn-secondary"
                                onClick={() => setShowConfirmModal(false)}
                            >
                                Stay Here
                            </button>
                            <button
                                className="btn-primary-neural"
                                style={{ padding: '0.6rem 1.2rem', borderRadius: '0.5rem', fontSize: '0.9rem' }}
                                onClick={() => {
                                    setShowConfirmModal(false);
                                    executeReset();
                                }}
                            >
                                Accepted
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="home-content-wrapper">
                <div className="login-card-container fade-in-scale">
                    <div className="login-card" style={{ maxWidth: '410px', padding: '1.2rem 1.8rem' }}>
                        <Link to="/" className="back-button" style={{ marginBottom: '0.6rem' }}>
                            <ArrowLeft size={18} /> Back
                        </Link>

                        <div className="login-header" style={{ marginBottom: '1rem' }}>
                            <h2 className="login-title" style={{ fontSize: '1.5rem', marginBottom: '0.2rem' }}>Reset Here</h2>
                            <p className="login-subtitle">Enter your temporary password to create a new one</p>
                        </div>

                        <form onSubmit={handleReset} className="login-form">
                            {/* Login ID Field */}
                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '700', color: '#475569', marginBottom: '0.6rem' }}>
                                    Login ID
                                </label>
                                <div style={{ position: 'relative', width: '100%' }}>
                                    <input
                                        type="text"
                                        value={loginId}
                                        onChange={(e) => setLoginId(e.target.value)}
                                        placeholder="Enter Login ID"
                                        required
                                        disabled={resetSuccessful}
                                        style={{
                                            width: '100%',
                                            paddingLeft: '14px',
                                            fontSize: '0.9rem',
                                            backgroundColor: 'white',
                                            cursor: 'text',
                                            color: 'inherit'
                                        }}
                                        className="input-neural"
                                    />
                                </div>
                            </div>

                            {/* Temporary Password Field */}
                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '700', color: '#475569', marginBottom: '0.6rem' }}>
                                    Temporary Password
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '10px' }}>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <Lock size={18} style={{ position: 'absolute', top: '50%', left: '14px', transform: 'translateY(-50%)', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                        <input
                                            type={showTempPassword ? "text" : "password"}
                                            value={tempPassword}
                                            onChange={(e) => {
                                                setTempPassword(e.target.value.replace(/\s/g, ''));
                                                setAllowSamePassword(false);
                                            }}
                                            onKeyDown={handlePasswordKeyDown}
                                            placeholder="Enter Temporary Password"
                                            required
                                            disabled={resetSuccessful}
                                            style={{
                                                width: '100%',
                                                paddingLeft: '44px',
                                                paddingRight: '14px',
                                                fontSize: '0.9rem',
                                                backgroundColor: 'white',
                                                cursor: 'text',
                                                color: 'inherit'
                                            }}
                                            className="input-neural"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowTempPassword(!showTempPassword)}
                                        className="password-toggle-btn"
                                    >
                                        {showTempPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>

                            {/* New Password Field */}
                            <div className="form-group-custom" style={{ position: 'relative' }}>
                                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '700', color: '#475569', marginBottom: '0.6rem' }}>
                                    Create Password
                                </label>
                                <div
                                    className="password-input-wrapper"
                                    style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '10px' }}
                                >
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <Lock size={18} style={{ position: 'absolute', top: '50%', left: '14px', transform: 'translateY(-50%)', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                        <input
                                            type={showNewPassword ? "text" : "password"}
                                            value={newPassword}
                                            onChange={(e) => {
                                                const value = e.target.value.replace(/\s/g, '');
                                                setNewPassword(value);
                                                checkPasswordRequirements(value);
                                                setAllowSamePassword(false);
                                            }}
                                            onKeyDown={handlePasswordKeyDown}
                                            placeholder="Enter New Password"
                                            required
                                            disabled={resetSuccessful}
                                            style={{ paddingLeft: '44px', paddingRight: '14px', width: '100%', fontSize: '0.9rem' }}
                                            className="input-neural"
                                        />

                                        {/* Password Requirements Indicator - Hover Tooltip */}
                                        {newPassword && (
                                            <div
                                                className="password-requirements-tooltip"
                                                style={{
                                                    position: 'absolute',
                                                    top: '100%',
                                                    left: '0',
                                                    right: '0',
                                                    marginTop: '0.5rem',
                                                    padding: '0.4rem 0.5rem',
                                                    background: 'rgba(255,255,255,0.98)',
                                                    backdropFilter: 'blur(10px)',
                                                    borderRadius: '0.5rem',
                                                    border: '1px solid rgba(0,0,0,0.1)',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                                    transition: 'opacity 0.2s ease, visibility 0.2s ease',
                                                    zIndex: 1000,
                                                    pointerEvents: 'none'
                                                }}
                                            >
                                                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569', marginBottom: '0.5rem' }}>
                                                    Password Requirements:
                                                </div>
                                                {[
                                                    { key: 'minLength', label: 'Minimum 8 characters' },
                                                    { key: 'startsWithCapital', label: 'Starting letter should be Capital' },
                                                    { key: 'hasSpecialChar', label: 'Special characters (@,#,$,&,*)' },
                                                    { key: 'hasNumber', label: 'Numbers should be there' }
                                                ].map((req, index, array) => (
                                                    <div key={req.key} style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.6rem',
                                                        marginBottom: index === array.length - 1 ? '0' : '0.4rem'
                                                    }}>
                                                        <div style={{
                                                            width: '6px',
                                                            height: '6px',
                                                            borderRadius: '50%',
                                                            background: passwordRequirements[req.key] ? '#10b981' : '#ef4444',
                                                            transition: 'background 0.2s',
                                                            flexShrink: 0
                                                        }} />
                                                        <span style={{
                                                            fontSize: '0.7rem',
                                                            color: passwordRequirements[req.key] ? '#10b981' : '#ef4444',
                                                            fontWeight: '500',
                                                            transition: 'color 0.2s',
                                                            lineHeight: '1.2'
                                                        }}>
                                                            {req.label}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        className="password-toggle-btn"
                                    >
                                        {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>

                            {/* Confirm Password Field */}
                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '700', color: '#475569', marginBottom: '0.6rem' }}>
                                    Confirm Password
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '10px' }}>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <Lock size={18} style={{ position: 'absolute', top: '50%', left: '14px', transform: 'translateY(-50%)', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                        <input
                                            type={showConfirmPassword ? "text" : "password"}
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value.replace(/\s/g, ''))}
                                            onKeyDown={handlePasswordKeyDown}
                                            placeholder="Repeat New Password"
                                            required
                                            disabled={resetSuccessful}
                                            style={{ paddingLeft: '44px', paddingRight: '14px', width: '100%', fontSize: '0.9rem' }}
                                            className="input-neural"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="password-toggle-btn"
                                    >
                                        {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>

                            <div style={{ marginTop: '1rem', marginBottom: '1.2rem' }}>
                                <HumanVerification
                                    onVerified={(status) => setIsHumanVerified(status)}
                                    context="user_reset"
                                    identifier={loginId}
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn-primary-neural"
                                disabled={resetSuccessful}
                                style={{
                                    width: '100%',
                                    padding: '1.2rem',
                                    borderRadius: '1rem',
                                    border: 'none',
                                    fontWeight: '800',
                                    fontSize: '1.1rem',
                                    cursor: resetSuccessful ? 'not-allowed' : 'pointer',
                                    marginTop: '1rem',
                                    opacity: resetSuccessful ? 0.5 : 1
                                }}
                            >
                                Reset Now
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
