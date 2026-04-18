import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Send, MessageCircle, X, Paperclip, File, Image as ImageIcon } from 'lucide-react';
import '../styles/AIChatWidget.css'; // We'll create this CSS next

export default function AIChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [file, setFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('Agent is thinking...');
    const [loadingCategory, setLoadingCategory] = useState('text');
    const [errorMsg, setErrorMsg] = useState('');

    // Drag State
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });

    const bottomRef = useRef(null);
    const fileInputRef = useRef(null);

    // Auth context (simulated check)
    // Auth State
    const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || '{}'));

    useEffect(() => {
        const handleAuthChange = () => {
            setUser(JSON.parse(localStorage.getItem('user') || '{}'));
        };
        window.addEventListener('authChange', handleAuthChange);
        return () => window.removeEventListener('authChange', handleAuthChange);
    }, []);

    useEffect(() => {
        if (isOpen && user.id) {
            fetchHistory();
        }
    }, [isOpen, user.id]);

    const hasMoved = useRef(false);
    const widgetRef = useRef(null);
    const scrollTimeout = useRef(null);

    // Ensure widget is hidden on login/register pages regardless of local storage state
    // HIDDEN: Chatbot is currently disabled via CSS.

    // Drag Effects
    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStartRef.current.x;
            const dy = e.clientY - dragStartRef.current.y;

            // Only consider it a move if significant (fixes overly sensitive clicks)
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                hasMoved.current = true;
            }

            setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            dragStartRef.current = { x: e.clientX, y: e.clientY };
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const handleMouseDown = (e) => {
        setIsDragging(true);
        hasMoved.current = false; // Reset move tracking
        dragStartRef.current = { x: e.clientX, y: e.clientY };
    };

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isOpen, isLoading]);

    // Loading Animation Effect
    useEffect(() => {
        let interval;
        if (isLoading) {
            if (loadingCategory === 'text') {
                setLoadingText('Agent is thinking...');
            } else {
                const step1 = loadingCategory === 'image' ? "Analyzing the picture..." : "Analyzing the document...";
                const texts = [step1, "Generating Response..."];
                let index = 0;
                setLoadingText(texts[0]);
                interval = setInterval(() => {
                    index = (index + 1) % texts.length;
                    setLoadingText(texts[index]);
                }, 2000);
            }
        } else {
            setLoadingText('');
        }
        return () => clearInterval(interval);
    }, [isLoading, loadingCategory]);

    useEffect(() => {
        if (errorMsg) {
            const timer = setTimeout(() => setErrorMsg(''), 4000);
            return () => clearTimeout(timer);
        }
    }, [errorMsg]);

    const fetchHistory = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`/api/chat/history/${user.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setMessages(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handlePaste = (e) => {
        if (e.clipboardData.files && e.clipboardData.files.length > 0) {
            e.preventDefault();
            const pastedFile = e.clipboardData.files[0];
            const allowedExtensions = ['jpg', 'jpeg', 'png', 'doc', 'docx', 'pdf', 'xls', 'xlsx', 'mp4', 'avi', 'mkv', 'mov', 'webm'];
            const extension = pastedFile.name.split('.').pop().toLowerCase();

            if (allowedExtensions.includes(extension)) {
                if (pastedFile.size > 1073741824) {
                    setErrorMsg('File must be less than 1GB');
                } else {
                    setFile(pastedFile);
                }
            } else {
                setErrorMsg('Only JPG, JPEG, PNG, DOC, DOCX, PDF, Excel, and Video files are allowed.');
            }
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const droppedFile = e.dataTransfer.files[0];
            const allowedExtensions = ['jpg', 'jpeg', 'png', 'doc', 'docx', 'pdf', 'xls', 'xlsx', 'mp4', 'avi', 'mkv', 'mov', 'webm'];
            const extension = droppedFile.name.split('.').pop().toLowerCase();

            if (allowedExtensions.includes(extension)) {
                if (droppedFile.size > 1073741824) {
                    setErrorMsg('File must be less than 1GB');
                } else {
                    setFile(droppedFile);
                }
            } else {
                setErrorMsg('Only JPG, JPEG, PNG, DOC, DOCX, PDF, Excel, and Video files are allowed.');
            }
        }
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() && !file) return;

        const formData = new FormData();
        formData.append('userId', user.id);
        formData.append('content', input);
        if (file) formData.append('file', file);

        let category = 'text';
        if (file) {
            category = file.type.startsWith('image/') ? 'image' : 'file';
        }
        setLoadingCategory(category);

        const tempMsg = {
            id: Date.now(),
            role: 'user',
            content: input,
            type: category,
            file_path: file ? URL.createObjectURL(file) : null,
            created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, tempMsg]);
        setInput('');
        setFile(null);
        setIsLoading(true);

        try {
            const token = localStorage.getItem('token');
            await axios.post('/api/chat/send', formData, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            fetchHistory();
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggle = (e) => {
        // Prevent toggle if it was a drag gesture
        if (hasMoved.current) return;
        setIsOpen(!isOpen);
    };

    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isOpen && widgetRef.current && !widgetRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    // Floating Date Badge Logic
    const [floatingDate, setFloatingDate] = useState('');
    const [showFloatingDate, setShowFloatingDate] = useState(false);

    const handleScroll = (e) => {
        const container = e.target;

        // Show badge
        setShowFloatingDate(true);

        // Find top-most visible message
        // We look for elements with class 'ai-message'
        const messageElements = Array.from(container.getElementsByClassName('ai-message'));

        for (let el of messageElements) {
            const rect = el.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            // If the element is within the container's view (or slightly above/below threshold)
            // We want the ONE at the top. 
            // rect.top is relative to viewport. containerRect.top is viewport.
            // If rect.top is >= containerRect.top - (some margin), it's the first one.
            // Actually, iteration order is top-down. The first one that has (rect.bottom > containerRect.top) is the top visible one.

            if (rect.bottom > containerRect.top + 50) { // +50 for header offset
                // This message is visible at the top
                // We need to find the corresponding message object to get the date.
                // We can't easily map DOM to React state object without ID.
                // Let's rely on React Key? No, easier to attach data-date to the div.
                const date = el.getAttribute('data-date');
                if (date) {
                    setFloatingDate(formatDateLabel(date));
                }
                break;
            }
        }

        // Reset timeout
        if (scrollTimeout.current) {
            clearTimeout(scrollTimeout.current);
        }
        scrollTimeout.current = setTimeout(() => {
            setShowFloatingDate(false);
        }, 5000);
    };

    const formatTime = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDateLabel = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0);

        const diffTime = today - checkDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7 && diffDays > 0) {
            return date.toLocaleDateString('en-US', { weekday: 'long' });
        } else {
            const d = date.getDate().toString().padStart(2, '0');
            const m = (date.getMonth() + 1).toString().padStart(2, '0');
            const y = date.getFullYear();
            return `${d}/${m}/${y}`;
        }
    };

    if (!user.id || ['/', '/register', '/admin-register', '/admin-reset', '/admin'].includes(window.location.pathname)) {
        return null;
    }

    return (
        <div
            ref={widgetRef}
            className={`ai-widget-container ${isOpen ? 'open' : ''}`}
            style={{ transform: `translate(${position.x}px, ${position.y}px)`, display: 'none' }}
        >
            {!isOpen && (
                <div
                    className="ai-toggle-btn"
                    onMouseDown={handleMouseDown}
                    onClick={handleToggle}
                    style={{ cursor: 'move' }}
                >
                    <MessageCircle size={32} />
                </div>
            )}

            {isOpen && (
                <div
                    className="ai-chat-window"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    <div
                        className="ai-header"
                        onMouseDown={handleMouseDown}
                        style={{ cursor: 'move' }}
                    >
                        <h3>AI Assistant</h3>
                        <button onClick={() => setIsOpen(false)} className="close-icon-btn"><X size={24} /></button>
                    </div>

                    {showFloatingDate && floatingDate && (
                        <div className="floating-date-badge">
                            {floatingDate}
                        </div>
                    )}

                    <div className="ai-messages" onScroll={handleScroll}>
                        {messages.map((msg, index) => {
                            const showDate = index === 0 || formatDateLabel(msg.created_at) !== formatDateLabel(messages[index - 1].created_at);
                            return (
                                <React.Fragment key={msg.id}>
                                    {showDate && (
                                        <div className="date-badge-container">
                                            <span className="date-badge">{formatDateLabel(msg.created_at)}</span>
                                        </div>
                                    )}
                                    <div className={`ai-message ${msg.role}`} data-date={msg.created_at}>
                                        {msg.type === 'image' && <img src={msg.file_path} alt="upload" className="msg-img" />}
                                        {msg.type === 'file' && (
                                            <div className="file-attachment">
                                                <File size={14} />
                                                <a href={msg.file_path} target="_blank" rel="noreferrer">File</a>
                                            </div>
                                        )}
                                        <p style={{ margin: 0 }}>{msg.content}</p>
                                        <span className="msg-timestamp">{formatTime(msg.created_at)}</span>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                        {isLoading && (
                            <div className="ai-message model loading">
                                <div className="loader"></div>
                                <span>{loadingText}</span>
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    <form onSubmit={handleSend} className="ai-input-area">
                        <button type="button" onClick={() => fileInputRef.current.click()} className="icon-btn" title="Allowed files: JPG, JPEG, PNG, DOC, DOCX, PDF, Excel, Video (up to 1GB)">
                            <Paperclip size={18} />
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            accept=".jpg,.jpeg,.png,.doc,.docx,.pdf,.xls,.xlsx,.mp4,.avi,.mkv,.mov,.webm,video/*"
                            onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                    const selectedFile = e.target.files[0];
                                    const allowedExtensions = ['jpg', 'jpeg', 'png', 'doc', 'docx', 'pdf', 'xls', 'xlsx', 'mp4', 'avi', 'mkv', 'mov', 'webm'];
                                    const extension = selectedFile.name.split('.').pop().toLowerCase();

                                    if (allowedExtensions.includes(extension)) {
                                        if (selectedFile.size > 1073741824) { // 1GB limit
                                            setErrorMsg('File must be less than 1GB');
                                            e.target.value = '';
                                        } else {
                                            setFile(selectedFile);
                                        }
                                    } else {
                                        setErrorMsg('Only JPG, JPEG, PNG, DOC, DOCX, PDF, Excel, and Video files are allowed.');
                                        e.target.value = '';
                                    }
                                }
                            }}
                        />
                        {file && (
                            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0, maxWidth: '200px', marginRight: '8px' }}>
                                <span className="file-badge">
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {file.name}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setFile(null)}
                                    style={{
                                        position: 'absolute',
                                        top: '-6px',
                                        right: '-6px',
                                        background: 'rgba(255, 255, 255, 0.4)',
                                        backdropFilter: 'blur(4px)',
                                        WebkitBackdropFilter: 'blur(4px)',
                                        color: '#83a1f3ff', // User's preferred color
                                        border: '1px solid rgba(131, 161, 243, 0.3)', // Semi-transparent version of their color
                                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                                        borderRadius: '50%',
                                        width: '18px',
                                        height: '18px',
                                        padding: 0,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        zIndex: 10
                                    }}
                                    title="Remove file"
                                >
                                    <X size={12} strokeWidth={3} />
                                </button>
                            </div>
                        )}
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onPaste={handlePaste}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend(e);
                                }
                            }}
                            placeholder="Ask AI..."
                            rows={1}
                            style={{
                                flex: 1,
                                padding: '0.5rem',
                                border: '1px solid #e5e7eb',
                                borderRadius: '1.5rem',
                                fontSize: '0.9rem',
                                resize: 'none',
                                fontFamily: 'inherit',
                                maxHeight: '100px',
                                overflowY: 'auto',
                                outline: 'none'
                            }}
                        />
                        <button type="submit" className="send-btn"><Send size={18} /></button>
                    </form>
                    {errorMsg && (
                        <div className="ai-error-banner">
                            {errorMsg}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}