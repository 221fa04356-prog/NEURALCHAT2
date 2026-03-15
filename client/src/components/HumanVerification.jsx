import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Check, Phone, Image as ImageIcon, RefreshCw, Volume2, X, RefreshCcw, Send, CheckCircle } from 'lucide-react';
import '../styles/HumanVerification.css';

const PUZZLE_IMAGES = [
    "/puzzle/mountain.png",
    "/puzzle/abstract.png",
    "/puzzle/nature.png"
];

export default function HumanVerification({ onVerified, context, identifier }) {
    const [isVerified, setIsVerified] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeMethod, setActiveMethod] = useState(null); // 'captcha', 'call', 'puzzle'

    // --- Verification Methods State ---
    const [captchaText, setCaptchaText] = useState('');
    const [captchaInput, setCaptchaInput] = useState('');
    const [captchaError, setCaptchaError] = useState('');

    const [callPhoneInput, setCallPhoneInput] = useState('');
    const [callSent, setCallSent] = useState(false);
    const [callMaskedNumber, setCallMaskedNumber] = useState('');
    const [otpInput, setOtpInput] = useState('');
    const [otpError, setOtpError] = useState('');
    const [isSendingCall, setIsSendingCall] = useState(false);
    const [resendTimer, setResendTimer] = useState(0);
    const [showHVSnackbar, setShowHVSnackbar] = useState(false);

    const [puzzleRotation, setPuzzleRotation] = useState(0);
    const [targetRotation, setTargetRotation] = useState(0);
    const [puzzleError, setPuzzleError] = useState('');
    const [puzzleImageUrl, setPuzzleImageUrl] = useState(PUZZLE_IMAGES[0]);
    const [isSuccess, setIsSuccess] = useState(false);

    // --- Helper to Generate Random Strings/Rotations ---
    const generateCaptcha = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let res = '';
        for (let i = 0; i < 7; i++) {
            res += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setCaptchaText(res);
        setCaptchaInput('');
        setCaptchaError('');
    };

    const generatePuzzle = () => {
        // Random multiple of 90 degrees offset, avoiding 0 initially
        const offsets = [90, 180, 270];
        const offset = offsets[Math.floor(Math.random() * offsets.length)];
        setTargetRotation(0);
        setPuzzleRotation(offset);
        setPuzzleError('');

        const randomIndex = Math.floor(Math.random() * PUZZLE_IMAGES.length);
        setPuzzleImageUrl(PUZZLE_IMAGES[randomIndex]);
    };

    useEffect(() => {
        if (isModalOpen) {
            generateCaptcha();
            generatePuzzle();
            setActiveMethod('captcha'); // Default to first method
        }
    }, [isModalOpen]);

    useEffect(() => {
        let interval;
        if (resendTimer > 0) {
            interval = setInterval(() => {
                setResendTimer(prev => prev - 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [resendTimer]);

    const handleCheckboxClick = () => {
        if (!isVerified) setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setActiveMethod(null);
        setCallSent(false);
        setResendTimer(0);
        setShowHVSnackbar(false);
    };

    const handleSuccess = () => {
        setIsSuccess(true);
        setIsVerified(true);
        setTimeout(() => {
            setIsModalOpen(false);
            setIsSuccess(false);
            if (onVerified) onVerified(true);
        }, 1000);
    };

    // --- Captcha Operations ---
    const verifyCaptcha = () => {
        if (captchaInput === captchaText) {
            handleSuccess();
        } else {
            setCaptchaError('Incorrect Captcha. Please try again.');
            generateCaptcha();
        }
    };

    const readAloudCaptcha = () => {
        if ('speechSynthesis' in window) {
            // spell out letters slowly
            const msg = new SpeechSynthesisUtterance(captchaText.split('').join('. '));
            msg.rate = 0.8;
            window.speechSynthesis.speak(msg);
        } else {
            alert('Speech synthesis not supported in this browser.');
        }
    };

    // --- Call via Phone Operations ---
    const sendCall = async (isResend = false) => {
        if (isSendingCall) return;

        // Validation based on context
        const isRegistering = ['register', 'admin_register'].includes(context);

        if (isRegistering) {
            const cleanPhone = callPhoneInput.replace(/\s/g, '');
            if (!/^\d{10}$/.test(cleanPhone)) {
                setOtpError('Please enter a strict 10-digit mobile number.');
                return;
            }
        } else {
            // It's a login/reset, we need the identifier (Login ID or Email) passed via props
            if (!identifier) {
                setOtpError(`Please enter your ${context.includes('admin') ? 'Email' : 'Login ID'} before verifying.`);
                return;
            }
        }

        setIsSendingCall(true);
        setOtpError('');

        try {
            const payload = {
                context,
                identifier: isRegistering ? null : identifier,
                mobile: isRegistering ? callPhoneInput.replace(/\s/g, '') : null
            };

            const res = await axios.post('/api/auth/send-call-otp', payload);

            setCallMaskedNumber(res.data.maskedMobile);
            setCallSent(true);
            if (isResend) {
                setResendTimer(20);
                setShowHVSnackbar(true);
                setTimeout(() => setShowHVSnackbar(false), 5000); // Hide after 5 seconds
            }
        } catch (err) {
            setOtpError(err.response?.data?.error || 'Failed to send call');
        } finally {
            setIsSendingCall(false);
        }
    };

    const verifyOtp = async () => {
        if (!otpInput) return;
        try {
            const isRegistering = ['register', 'admin_register'].includes(context);
            const res = await axios.post('/api/auth/verify-call-otp', {
                identifier: isRegistering ? callPhoneInput.replace(/\s/g, '') : identifier,
                otp: otpInput.replace(/\s/g, '')
            });
            if (res.data.success) {
                handleSuccess();
            }
        } catch (err) {
            setOtpError(err.response?.data?.error || 'Invalid OTP');
        }
    };

    // --- Puzzle Operations ---
    const rotateLeft = () => setPuzzleRotation(prev => prev - 90);
    const rotateRight = () => setPuzzleRotation(prev => prev + 90);

    const verifyPuzzle = () => {
        const normalized = ((puzzleRotation % 360) + 360) % 360;

        if (normalized === targetRotation) {
            handleSuccess();
        } else {
            setPuzzleError('Image is not correctly oriented. Please try again.');
        }
    };

    return (
        <div className="hv-container fade-in">
            <div
                className={`hv-checkbox-wrapper ${isVerified ? 'verified' : ''}`}
                onClick={handleCheckboxClick}
            >
                <div className={`hv-checkbox ${isVerified ? 'checked' : ''}`}>
                    {isVerified && <Check strokeWidth={3} size={16} className="hv-check-icon rotate-in" />}
                </div>
                <span className="hv-checkbox-label">
                    {isVerified ? 'Verified' : 'Verify whether you are a human'}
                </span>
            </div>

            {isModalOpen && createPortal(
                <div className="hv-modal-overlay fade-in">
                    {showHVSnackbar && (
                        <div className="hv-success-snackbar fade-in">
                            <CheckCircle size={16} /> A new verification code has been sent to your registered mobile number
                        </div>
                    )}
                    <div className="hv-modal-content scale-in">
                        <button className="hv-modal-close" type="button" onClick={closeModal}>
                            <X size={20} />
                        </button>

                        <h3 className="hv-modal-title">Human Verification</h3>

                        {isSuccess ? (
                            <div className="hv-success-view fade-in">
                                <div className="hv-success-icon-wrapper">
                                    <CheckCircle size={64} className="hv-success-icon rotate-in" />
                                </div>
                                <h3 className="hv-success-view-title">Verification Successful!</h3>
                                <p className="hv-success-view-subtitle">Thank you for verifying yourself.</p>
                            </div>
                        ) : (
                            <>
                                <p className="hv-modal-subtitle">Select a method to verify you are human.</p>

                                <div className="hv-tabs">
                                    <button
                                        type="button"
                                        className={`hv-tab ${activeMethod === 'captcha' ? 'active' : ''}`}
                                        onClick={() => setActiveMethod('captcha')}
                                    >
                                        <span className="hv-tab-icon">A</span> Captcha
                                    </button>
                                    <button
                                        type="button"
                                        className={`hv-tab ${activeMethod === 'call' ? 'active' : ''}`}
                                        onClick={() => setActiveMethod('call')}
                                    >
                                        <Phone size={14} className="hv-tab-icon" /> Call via Phone
                                    </button>
                                    <button
                                        type="button"
                                        className={`hv-tab ${activeMethod === 'puzzle' ? 'active' : ''}`}
                                        onClick={() => setActiveMethod('puzzle')}
                                    >
                                        <ImageIcon size={14} className="hv-tab-icon" /> Puzzle
                                    </button>
                                </div>

                                <div className="hv-method-container">
                                    {activeMethod === 'captcha' && (
                                        <div className="hv-captcha-view fade-in">
                                            <div className="hv-captcha-box">
                                                <div className="hv-captcha-display select-none" onCopy={(e) => e.preventDefault()}>{captchaText}</div>
                                                <div className="hv-captcha-actions">
                                                    <button type="button" onClick={generateCaptcha} className="hv-icon-btn" title="Refresh Captcha">
                                                        <RefreshCw size={18} />
                                                    </button>
                                                    <button type="button" onClick={readAloudCaptcha} className="hv-icon-btn" title="Read Aloud">
                                                        <Volume2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="Enter the 7 characters"
                                                value={captchaInput}
                                                onChange={e => setCaptchaInput(e.target.value)}
                                                maxLength={7}
                                                className="hv-input mt-4"
                                            />
                                            {captchaError && <p className="hv-error-msg">{captchaError}</p>}
                                            <button type="button" className="btn-primary-neural hv-submit-btn" onClick={verifyCaptcha}>Verify</button>
                                        </div>
                                    )}

                                    {activeMethod === 'call' && (
                                        <div className="hv-call-view fade-in">
                                            {['register', 'admin_register'].includes(context) && !callSent && (
                                                <div className="hv-phone-input-group mt-2">
                                                    <div className="hv-input-wrapper">
                                                        <span className="hv-country-code">+91</span>
                                                        <input
                                                            type="text"
                                                            placeholder="Enter 10 digit mobile"
                                                            value={callPhoneInput}
                                                            onChange={e => {
                                                                const val = e.target.value.replace(/[^\d\s]/g, '');
                                                                if (val.replace(/\s/g, '').length <= 10) {
                                                                    setCallPhoneInput(val);
                                                                }
                                                            }}
                                                            className="hv-input hv-phone"
                                                        />
                                                    </div>
                                                    <button type="button" className="btn-primary-neural hv-send-btn" onClick={() => sendCall(false)} disabled={isSendingCall}>
                                                        {isSendingCall ? 'Sending' : 'Send'} <Send size={14} style={{ marginLeft: 4 }} />
                                                    </button>
                                                </div>
                                            )}

                                            {(!['register', 'admin_register'].includes(context)) && !callSent && (
                                                <div className="mt-4 text-center">
                                                    <p style={{ fontSize: 14, color: '#444', marginBottom: 16 }}>We will send a call to the mobile number registered with this ID.</p>
                                                    <button type="button" className="btn-primary-neural hv-submit-btn" onClick={() => sendCall(false)} disabled={isSendingCall}>
                                                        {isSendingCall ? 'Sending Call...' : 'Call Me Now'}
                                                    </button>
                                                </div>
                                            )}

                                            {callSent && (
                                                <div className="hv-call-active mt-4 fade-in">
                                                    <div className="hv-call-msg-row">
                                                        <p className="hv-call-msg">
                                                            You will be receiving a Verification call to +91 {callMaskedNumber}
                                                        </p>
                                                        <button
                                                            type="button"
                                                            className={`hv-resend-link ${resendTimer > 0 ? 'disabled-link' : ''}`}
                                                            onClick={() => sendCall(true)}
                                                            disabled={isSendingCall || resendTimer > 0}
                                                        >
                                                            {resendTimer > 0 ? `Resend code via call in ${resendTimer} seconds` : `Still Didn't receive it?`}
                                                        </button>
                                                    </div>

                                                    <div className="mt-4">
                                                        <input
                                                            type="text"
                                                            placeholder="Enter numerical OTP from call"
                                                            value={otpInput}
                                                            onChange={e => {
                                                                const val = e.target.value.replace(/[^\d\s]/g, '');
                                                                if (val.replace(/\s/g, '').length <= 6) {
                                                                    setOtpInput(val);
                                                                }
                                                            }}
                                                            className="hv-input text-center text-lg tracking-widest"
                                                        />
                                                    </div>
                                                    <button type="button" className="btn-primary-neural hv-submit-btn" onClick={verifyOtp}>Verify OTP</button>
                                                </div>
                                            )}

                                            {otpError && <p className="hv-error-msg hv-dynamic-color text-center mt-2">{otpError}</p>}
                                        </div>
                                    )}

                                    {activeMethod === 'puzzle' && (
                                        <div className="hv-puzzle-view fade-in">
                                            <p className="text-center text-sm text-gray-600 mb-4" style={{ fontSize: '0.9rem' }}>Use arrows to rotate the right image until it matches the left image.</p>

                                            <div className="hv-puzzle-grid">
                                                <div className="hv-puzzle-column">
                                                    <p className="hv-column-title">Original Image</p>
                                                    <div className="hv-puzzle-frame">
                                                        <img src={puzzleImageUrl} alt="Reference" />
                                                    </div>
                                                </div>

                                                <div className="hv-puzzle-column">
                                                    <p className="hv-column-title">Jumbled Order</p>
                                                    <div className="hv-puzzle-frame">
                                                        <img
                                                            src={puzzleImageUrl}
                                                            alt="Jumbled"
                                                            style={{ transform: `rotate(${puzzleRotation}deg)`, transition: 'transform 0.3s ease-out' }}
                                                        />
                                                    </div>
                                                    <div className="hv-puzzle-controls">
                                                        <button type="button" className="hv-rotate-btn" onClick={rotateLeft}>
                                                            <RefreshCcw size={16} /> Left
                                                        </button>
                                                        <button type="button" className="hv-rotate-btn" onClick={rotateRight}>
                                                            Right <RefreshCw size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {puzzleError && <p className="hv-error-msg text-center mt-3">{puzzleError}</p>}
                                            <button type="button" className="btn-primary-neural hv-submit-btn" onClick={verifyPuzzle}>Submit Puzzle</button>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
