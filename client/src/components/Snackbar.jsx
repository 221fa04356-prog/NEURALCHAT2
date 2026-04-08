import React, { useEffect, useState, useRef } from 'react';
import '../styles/Snackbar.css';
import { X, MoreHorizontal, Send, AlertCircle, CheckCircle, Info } from 'lucide-react';
import logo from '../assets/logo.png'; // Import App Logo

const Snackbar = ({ message, senderName, senderAvatar, type = 'info', onClose, duration = 5000, onReply, onAction, actionLabel, variant = 'default', setOpenDropdown, setDropdownPos }) => {
    const [replyText, setReplyText] = useState('');
    const [isPaused, setIsPaused] = useState(false);

    const [isFocused, setIsFocused] = useState(false);

    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!duration || duration <= 0 || isPaused) return;

        const timer = setTimeout(() => {
            onCloseRef.current();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, isPaused, message]); // Removed onClose from dependencies

    const handleSendReply = () => {
        if (replyText.trim() && onReply) {
            onReply(replyText);
            setReplyText('');
            onClose();
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendReply();
        }
    };

    return (
        <div
            className={`snackbar-container ${variant}`}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
        >
            <div className={`snackbar-card ${type} ${variant}`}>
                {/* Header - Show for default AND system */}
                {(variant === 'default' || variant === 'system') && (
                    <div className="snackbar-header">
                        <div className="snackbar-app-info">
                            <img src={logo} alt="Neural Chat" className="snackbar-app-icon" />
                            <span className="snackbar-app-name">Neural Chat</span>
                        </div>
                        <div className="snackbar-header-actions">
                            <MoreHorizontal
                                size={16}
                                className="snackbar-more-icon"
                                style={{ cursor: 'default' }}
                            />
                            <X size={16} className="snackbar-close-icon" onClick={onClose} />
                        </div>
                    </div>
                )}

                {/* Body */}
                <div className="snackbar-body">
                    {/* Avatar and Sender Name - ONLY for default variant */}
                    {variant === 'default' && (
                        <div className="snackbar-avatar">
                            {senderAvatar ? (
                                <img src={senderAvatar} alt={senderName} />
                            ) : (
                                <div className="snackbar-initial-avatar">
                                    {(() => {
                                        let finalName = 'U';
                                        if (!senderName) {
                                            const user = JSON.parse(localStorage.getItem('user') || '{}');
                                            finalName = user.name || 'You';
                                        } else {
                                            // Handle "Admin (Name)" format
                                            const match = senderName.match(/\((.*?)\)/);
                                            const nameToUse = match ? match[1] : senderName;
                                            // Skip "Admin" part if it's the only thing
                                            finalName = nameToUse.toLowerCase().startsWith('admin') && nameToUse.length > 5
                                                ? nameToUse.substring(5).trim()
                                                : nameToUse;
                                        }
                                        return finalName.charAt(0).toUpperCase() || 'U';
                                    })()}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="snackbar-content-text">
                        {variant !== 'system' && (
                            <div className="snackbar-sender-name">
                                {senderName || JSON.parse(localStorage.getItem('user') || '{}').name || 'You'}
                            </div>
                        )}
                        <div className={`snackbar-message-preview ${type}`}>
                            {(variant === 'system' || type === 'error' || type === 'success') && (
                                <span className={`snackbar-inline-icon ${type}`} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline-flex' }}>
                                    {type === 'error' ? <AlertCircle size={14} /> : type === 'success' ? <CheckCircle size={14} /> : <Info size={14} />}
                                </span>
                            )}
                            {message}
                        </div>
                    </div>

                    {onAction && actionLabel && (
                        <div className="snackbar-action-btn" onClick={() => { onAction(); onClose(); }}>
                            {actionLabel}
                        </div>
                    )}
                </div>

                {/* Footer (Reply) - Only show if onReply is provided and NOT simple/system if desired, but user only asked for visual changes */}
                {onReply && (
                    <div className="snackbar-footer">
                        <div className="snackbar-reply-wrapper">
                            <textarea
                                className="snackbar-reply-input"
                                placeholder="Type a reply"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                onFocus={() => setIsFocused(true)}
                                onBlur={() => setIsFocused(false)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendReply();
                                    }
                                }}
                                rows={1}
                            />
                            <button
                                className="snackbar-send-btn"
                                onClick={handleSendReply}
                                disabled={!replyText.trim()}
                            >
                                <span className="send-text">Send</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Snackbar;
