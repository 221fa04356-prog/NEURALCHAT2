import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Lock, Mail, Key, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import Snackbar from '../components/Snackbar';
import HumanVerification from '../components/HumanVerification';
import '../styles/Home.css';

export default function AdminReset() {
    const [formData, setFormData] = useState({ email: '', newPassword: '', confirmPassword: '', secretKey: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', type: 'info' });
    const [isHumanVerified, setIsHumanVerified] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!isHumanVerified) {
            setSnackbar({ open: true, message: 'Please complete the Human Verification first', type: 'error' });
            return;
        }

        if (formData.newPassword !== formData.confirmPassword) {
            setSnackbar({ open: true, message: 'Passwords do not match', type: 'error' });
            return;
        }

        try {
            const res = await axios.post('/api/auth/admin/reset', formData);
            setSnackbar({ open: true, message: 'Password Reset Successful! Redirecting...', type: 'success', senderName: res.data.senderName });
            setTimeout(() => navigate('/'), 2000);
        } catch (err) {
            setSnackbar({
                open: true,
                message: err.response?.data?.error || 'Reset failed',
                senderName: err.response?.data?.senderName,
                type: 'error'
            });
        }
    };

    const handlePasswordKeyDown = (e) => {
        if (e.key === ' ') {
            e.preventDefault();
        }
    };

    return (
        <div className="home-container">
            

            {snackbar.open && (
                <Snackbar
                    message={snackbar.message}
                    type={snackbar.type}
                    senderName={snackbar.senderName || "Admin"}
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                />
            )}

            <div className="home-content-wrapper">
                <div className="login-card-container fade-in-scale">
                    <div className="login-card compact">
                        <Link to="/" state={{ showLogin: true, showAdmin: true }} className="back-button" style={{ marginBottom: '0.8rem' }}>
                            <ArrowLeft size={18} /> Back
                        </Link>

                        <div className="login-header">
                            <h2 className="login-title">Admin Recovery</h2>
                            <p className="login-subtitle">Reset Access using Master Key</p>
                        </div>

                        <form onSubmit={handleSubmit} className="login-form">
                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontWeight: '700', color: '#475569' }}>Admin Email</label>
                                <div style={{ position: 'relative', width: '100%' }}>
                                    <Mail size={16} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                    <input
                                        type="email"
                                        placeholder="Enter Registered Email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value.replace(/\s/g, '') })}
                                        required
                                        className="input-neural"
                                        style={{ paddingLeft: '38px', backgroundColor: 'white', color: 'inherit' }}
                                    />
                                </div>
                            </div>

                            {/* New Password */}
                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontWeight: '700', color: '#475569' }}>New Password</label>
                                <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '10px' }}>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <Lock size={16} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Enter New Password"
                                            value={formData.newPassword}
                                            onChange={e => setFormData({ ...formData, newPassword: e.target.value.replace(/\s/g, '') })}
                                            onKeyDown={handlePasswordKeyDown}
                                            required
                                            className="input-neural"
                                            style={{ paddingLeft: '38px', paddingRight: '14px', backgroundColor: 'white', color: 'inherit' }}
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

                            {/* Confirm Password */}
                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontWeight: '700', color: '#475569' }}>Confirm Password</label>
                                <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '10px' }}>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <Lock size={16} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                        <input
                                            type={showConfirmPassword ? "text" : "password"}
                                            placeholder="Confirm New Password"
                                            value={formData.confirmPassword}
                                            onChange={e => setFormData({ ...formData, confirmPassword: e.target.value.replace(/\s/g, '') })}
                                            onKeyDown={handlePasswordKeyDown}
                                            required
                                            className="input-neural"
                                            style={{ paddingLeft: '38px', paddingRight: '14px', backgroundColor: 'white', color: 'inherit' }}
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

                            {/* Secret Key */}
                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontWeight: '700', color: '#475569' }}>Secret Key</label>
                                <div style={{ position: 'relative', width: '100%' }}>
                                    <Key size={16} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                    <input
                                        type="password"
                                        placeholder="Master Secret Key"
                                        value={formData.secretKey}
                                        onChange={e => setFormData({ ...formData, secretKey: e.target.value.replace(/\s/g, '') })}
                                        onKeyDown={handlePasswordKeyDown}
                                        required
                                        className="input-neural"
                                        style={{ paddingLeft: '38px', backgroundColor: 'white', color: 'inherit' }}
                                    />
                                </div>
                            </div>

                            <div style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                                <HumanVerification
                                    onVerified={(status) => setIsHumanVerified(status)}
                                    context="admin_reset"
                                    identifier={formData.email}
                                />
                            </div>

                            <button type="submit" className="btn-primary-neural" style={{ width: '100%', borderRadius: '1rem', border: 'none', fontWeight: '800', cursor: 'pointer' }}>
                                Reset Password
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

