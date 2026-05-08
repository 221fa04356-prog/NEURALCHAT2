import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Shield, Lock, Mail, User, Key, Eye, EyeOff, ArrowLeft, Phone } from 'lucide-react';
import LandingBackground from '../components/LandingBackground';
import HumanVerification from '../components/HumanVerification';
import Snackbar from '../components/Snackbar';
import CountryCodeSelect from '../components/CountryCodeSelect';
import '../styles/Home.css';

export default function AdminRegister() {
    const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '', secretKey: '', mobile: '', countryCode: '+91' });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', type: 'info' });
    const [isHumanVerified, setIsHumanVerified] = useState(false);
    const [mobileAvailability, setMobileAvailability] = useState({ status: 'idle', message: '' });
    const navigate = useNavigate();

    useEffect(() => {
        const cleanMobile = formData.mobile.replace(/\D/g, '');
        if (cleanMobile.length !== 10) {
            setMobileAvailability({ status: 'idle', message: '' });
            return;
        }

        let cancelled = false;
        const timer = setTimeout(async () => {
            setMobileAvailability({ status: 'checking', message: 'Checking mobile number...' });
            try {
                const res = await axios.get('/api/auth/check-mobile', { params: { mobile: cleanMobile } });
                if (cancelled) return;
                if (res.data.available) {
                    setMobileAvailability({ status: 'available', message: '' });
                } else {
                    const message = res.data.message || 'This mobile number is already linked with another account.';
                    setMobileAvailability({ status: 'taken', message });
                }
            } catch (err) {
                if (!cancelled) {
                    setMobileAvailability({ status: 'error', message: err.response?.data?.error || 'Unable to check mobile number right now.' });
                }
            }
        }, 350);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [formData.mobile]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!isHumanVerified) {
            setSnackbar({ open: true, message: 'Please complete the Human Verification first', type: 'warning' });
            return;
        }

        // Validations
        const nameRegex = /^[a-zA-Z\s]+$/;
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        const passwordRegex = /^[A-Z][a-z]*(?=.*\d)(?=.*[@#$&*])[a-z\d@#$&*]{7,19}$/;
        const mobileRegex = /^\d{10}$/;

        if (!nameRegex.test(formData.name)) {
            setSnackbar({ open: true, message: 'Full Name must contain only alphabets', type: 'warning' });
            return;
        }

        if (!emailRegex.test(formData.email)) {
            setSnackbar({ open: true, message: 'Please enter a valid email address', type: 'warning' });
            return;
        }

        if (!formData.mobile || !mobileRegex.test(formData.mobile)) {
            setSnackbar({ open: true, message: 'Mobile number must be exactly 10 digits.', type: 'warning' });
            return;
        }
        if (mobileAvailability.status === 'taken') {
            setSnackbar({ open: true, message: mobileAvailability.message, type: 'error' });
            return;
        }

        if (!passwordRegex.test(formData.password)) {
            setSnackbar({ open: true, message: 'Password must start with uppercase letter, followed by lowercase letters, and include numbers and special characters', type: 'warning' });
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setSnackbar({ open: true, message: 'Passwords do not match', type: 'error' });
            return;
        }

        try {
            const res = await axios.post('/api/auth/admin/register', formData);
            setSnackbar({ open: true, message: res.data?.message || 'Your Request has been sent to the Main Admin for approval', type: 'success' });
            setTimeout(() => navigate('/'), 2000);
        } catch (err) {
            setSnackbar({
                open: true,
                message: err.response?.data?.error || 'Registration failed',
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
            <LandingBackground />

            {snackbar.open && (
                <Snackbar
                    message={snackbar.message}
                    type={snackbar.type}
                    senderName="Admin"
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                />
            )}

            <div className="home-content-wrapper">
                <div className="login-card-container fade-in-scale">
                    {/* Added admin-compact class for specific height reduction */}
                    <div className="login-card compact admin-compact">
                        <Link to="/" state={{ showLogin: true, showAdmin: true }} className="back-button" style={{ marginBottom: '0.8rem' }}>
                            <ArrowLeft size={18} /> Back
                        </Link>

                        <div className="login-header">
                            <h2 className="login-title">Admin Register</h2>
                            <p className="login-subtitle">Secure Enrollment</p>
                        </div>

                        <form onSubmit={handleSubmit} className="login-form">
                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontWeight: '700', color: '#e2e8f0' }}>Full Name</label>
                                <div style={{ position: 'relative', width: '100%' }}>
                                    <User size={16} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                    <input
                                        type="text"
                                        placeholder="Enter Name"
                                        value={formData.name}
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (/^[A-Za-z\s]*$/.test(val)) {
                                                setFormData({ ...formData, name: val });
                                            }
                                        }}
                                        required
                                        className="input-neural"
                                    />
                                </div>
                            </div>

                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontWeight: '700', color: '#e2e8f0' }}>Email Address</label>
                                <div style={{ position: 'relative', width: '100%' }}>
                                    <Mail size={16} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                    <input
                                        type="email"
                                        placeholder="Enter Email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value.replace(/\s/g, '') })}
                                        required
                                        className="input-neural"
                                    />
                                </div>
                            </div>

                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontWeight: '700', color: '#e2e8f0' }}>Mobile Number</label>
                                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                    <div style={{ position: 'relative', width: '140px', flexShrink: 0, zIndex: 100 }}>
                                        <CountryCodeSelect
                                            value={formData.countryCode}
                                            onChange={(code) => setFormData({ ...formData, countryCode: code })}
                                            className="input-neural"
                                            style={{ height: '42px' }}
                                        />
                                    </div>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <Phone size={16} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                        <input
                                            type="text"
                                            placeholder="Enter Mobile"
                                            value={formData.mobile}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (/^\d*$/.test(val) && val.length <= 10) {
                                                    setFormData({ ...formData, mobile: val });
                                                }
                                            }}
                                            required
                                            style={{ height: '42px' }}
                                            className="input-neural"
                                        />
                                    </div>
                                </div>
                                {mobileAvailability.status === 'taken' && (
                                    <p style={{ margin: '6px 0 0', color: '#f87171', fontSize: '0.82rem', fontWeight: 700 }}>
                                        {mobileAvailability.message}
                                    </p>
                                )}
                            </div>

                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontWeight: '700', color: '#e2e8f0' }}>Password</label>
                                <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '5px' }}>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <Lock size={16} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Enter Password"
                                            value={formData.password}
                                            onChange={e => setFormData({ ...formData, password: e.target.value.replace(/\s/g, '') })}
                                            onKeyDown={handlePasswordKeyDown}
                                            required
                                            style={{ paddingLeft: '36px', paddingRight: '10px', width: '100%' }}
                                            className="input-neural"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="password-toggle-btn"
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontWeight: '700', color: '#e2e8f0' }}>Confirm Password</label>
                                <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '5px' }}>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <Lock size={16} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                        <input
                                            type={showConfirmPassword ? "text" : "password"}
                                            placeholder="Confirm Password"
                                            value={formData.confirmPassword}
                                            onChange={e => setFormData({ ...formData, confirmPassword: e.target.value.replace(/\s/g, '') })}
                                            onKeyDown={handlePasswordKeyDown}
                                            required
                                            style={{ paddingLeft: '36px', paddingRight: '10px', width: '100%' }}
                                            className="input-neural"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="password-toggle-btn"
                                    >
                                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontWeight: '700', color: '#e2e8f0' }}>Secret Key</label>
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
                                    />
                                </div>
                            </div>

                            <div style={{ marginTop: '1rem', marginBottom: '0.4rem' }}>
                                <HumanVerification
                                    onVerified={(status) => setIsHumanVerified(status)}
                                    context="admin_register"
                                />
                            </div>

                            <button type="submit" className="btn-primary-neural" disabled={mobileAvailability.status === 'taken' || mobileAvailability.status === 'checking'} style={{ width: '100%', borderRadius: '1rem', border: 'none', fontWeight: '800', cursor: mobileAvailability.status === 'taken' || mobileAvailability.status === 'checking' ? 'not-allowed' : 'pointer', opacity: mobileAvailability.status === 'taken' || mobileAvailability.status === 'checking' ? 0.65 : 1 }}>
                                <Shield size={18} /> Create Admin Account
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
