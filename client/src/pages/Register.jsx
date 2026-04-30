import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { UserPlus, Mail, Phone, User, Briefcase, ArrowLeft, Shield } from 'lucide-react';
import LandingBackground from '../components/LandingBackground';
import HumanVerification from '../components/HumanVerification';
import CountryCodeSelect from '../components/CountryCodeSelect';
import Snackbar from '../components/Snackbar';
import '../styles/Home.css';

export default function Register() {
    const [formData, setFormData] = useState({ name: '', email: '', mobile: '', designation: '', countryCode: '+91' });
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    const [snackbar, setSnackbar] = useState({ open: false, message: '', type: 'info' });
    const [isHumanVerified, setIsHumanVerified] = useState(false);
    const [mobileAvailability, setMobileAvailability] = useState({ status: 'idle', message: '' });

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
        setError('');
        setMsg('');

        if (!isHumanVerified) {
            setError('Please complete the Human Verification first.');
            return;
        }

        // Validations
        const nameRegex = /^[A-Za-z\s]+$/;
        const mobileRegex = /^\d{10}$/;
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        if (!nameRegex.test(formData.name)) {
            setError('Name must contain only alphabets and spaces.');
            return;
        }
        if (!mobileRegex.test(formData.mobile)) {
            setError('Mobile number must be exactly 10 digits.');
            return;
        }
        if (mobileAvailability.status === 'taken') {
            setError(mobileAvailability.message);
            setSnackbar({ open: true, message: mobileAvailability.message, type: 'error' });
            return;
        }
        if (!emailRegex.test(formData.email)) {
            setError('Please enter a valid email address.');
            return;
        }

        try {
            const res = await axios.post('/api/auth/register', formData);
            setMsg(res.data.message);
            setSnackbar({ open: true, message: res.data.message || 'Registration requested. Wait for admin approval.', type: 'success' });
            setFormData({ name: '', email: '', mobile: '', designation: '', countryCode: '+91' });
        } catch (err) {
            setError(err.response?.data?.error || 'Registration failed');
            setSnackbar({ open: true, message: err.response?.data?.error || 'Registration failed', type: 'error' });
        }
    };

    return (
        <div className="home-container">
            <LandingBackground />

            {snackbar.open && (
                <Snackbar
                    message={snackbar.message}
                    senderName="Neural Chat"
                    type={snackbar.type || 'info'}
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                />
            )}

            <div className="home-content-wrapper">
                <div className="login-card-container fade-in-scale">
                    <div className="login-card compact">
                        <Link to="/" state={{ showLogin: true }} className="back-button" style={{ marginBottom: '0.8rem' }}>
                            <ArrowLeft size={18} /> Back
                        </Link>

                        <div className="login-header">
                            <h2 className="login-title">Create Account</h2>
                            <p className="login-subtitle">Join Neural Chat</p>
                        </div>

                        <form onSubmit={handleSubmit} className="login-form">


                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontWeight: '700', color: '#e2e8f0' }}>
                                    Full Name
                                </label>
                                <div style={{ position: 'relative', width: '100%' }}>
                                    <User size={18} style={{ position: 'absolute', top: '14px', left: '14px', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (/^[A-Za-z\s]*$/.test(val)) {
                                                setFormData({ ...formData, name: val });
                                            }
                                        }}
                                        placeholder="John Doe"
                                        required
                                        className="input-neural"
                                    />
                                </div>
                            </div>

                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontWeight: '700', color: '#e2e8f0' }}>
                                    Job Position
                                </label>
                                <div style={{ position: 'relative', width: '100%' }}>
                                    <Briefcase size={18} style={{ position: 'absolute', top: '14px', left: '14px', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                    <input
                                        type="text"
                                        value={formData.designation}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (/^[A-Za-z\s]*$/.test(val)) {
                                                setFormData({ ...formData, designation: val });
                                            }
                                        }}
                                        placeholder="Software Engineer"
                                        required
                                        className="input-neural"
                                    />
                                </div>
                            </div>

                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontWeight: '700', color: '#e2e8f0' }}>
                                    Email Address
                                </label>
                                <div style={{ position: 'relative', width: '100%' }}>
                                    <Mail size={18} style={{ position: 'absolute', top: '14px', left: '14px', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value.replace(/\s/g, '') })}
                                        placeholder="john@example.com"
                                        required
                                        className="input-neural"
                                    />
                                </div>
                            </div>

                            <div className="form-group-custom">
                                <label style={{ display: 'block', fontWeight: '700', color: '#e2e8f0' }}>
                                    Mobile Number
                                </label>
                                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                    <div style={{ position: 'relative', width: '140px', flexShrink: 0, zIndex: 100 }}>
                                        <CountryCodeSelect
                                            value={formData.countryCode}
                                            onChange={(code) => setFormData({ ...formData, countryCode: code })}
                                            className="input-neural"
                                        />
                                    </div>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <Phone size={18} style={{ position: 'absolute', top: '14px', left: '14px', color: '#94A3B8', zIndex: 10, pointerEvents: 'none' }} />
                                        <input
                                            type="text"
                                            value={formData.mobile}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (/^\d*$/.test(val) && val.length <= 10) {
                                                    setFormData({ ...formData, mobile: val });
                                                    setError('');
                                                }
                                            }}
                                            placeholder="1234567890"
                                            required
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

                            <div style={{ marginTop: '1rem', marginBottom: '0.4rem' }}>
                                <HumanVerification
                                    onVerified={(status) => setIsHumanVerified(status)}
                                    context="register"
                                />
                            </div>

                            <button type="submit" className="btn-primary-neural" disabled={mobileAvailability.status === 'taken' || mobileAvailability.status === 'checking'} style={{ width: '100%', borderRadius: '1rem', border: 'none', fontWeight: '800', cursor: mobileAvailability.status === 'taken' || mobileAvailability.status === 'checking' ? 'not-allowed' : 'pointer', opacity: mobileAvailability.status === 'taken' || mobileAvailability.status === 'checking' ? 0.65 : 1 }}>
                                <UserPlus size={18} /> Request Approval
                            </button>


                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
