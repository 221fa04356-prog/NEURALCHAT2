import React, { useEffect, useState, useRef, useMemo } from 'react';
import '../styles/AdminDashboard.css';
import Snackbar from '../components/Snackbar';
import ConfirmModal from '../components/ConfirmModal';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
    Users, UserCheck, Trash2, MessageSquare, Key, LogOut,
    Eye, EyeOff, Menu, AlertTriangle, ArrowLeft, Smile,
    User as UserIcon, Search, Bell, Settings, LayoutDashboard,
    TrendingUp, Calendar, ChevronRight, X, Layers, Check, RefreshCw, Forward, ChevronDown, XCircle
} from 'lucide-react';
import { io } from 'socket.io-client';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import logo from '../assets/logo.png';
import NeuralBackground from '../components/NeuralBackground';


const CustomTooltip = ({ active, payload, label, coordinate, scrollRef }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        let shiftStyle = {};
        if (scrollRef && scrollRef.current && coordinate) {
            const scrollLeft = scrollRef.current.scrollLeft;
            const containerWidth = scrollRef.current.clientWidth;
            const scrollWidth = scrollRef.current.scrollWidth;
            const tooltipX = coordinate.x;

            const TOOLTIP_ESTIMATED_WIDTH = 220;
            const RECHARTS_FLIP_THRESHOLD = 300; // If within 300px of SVG right, Recharts natively flips it

            const isNearSvgRight = (scrollWidth - tooltipX) < RECHARTS_FLIP_THRESHOLD;
            const isNearVisibleRight = (tooltipX - scrollLeft) > (containerWidth - TOOLTIP_ESTIMATED_WIDTH);

            // Shift left if near the right edge of the visible window, but ONLY if Recharts isn't already flipping it
            if (isNearVisibleRight && !isNearSvgRight) {
                shiftStyle = { transform: 'translateX(calc(-100% - 30px))' };
            }
        }

        return (
            <div style={{
                background: '#fff',
                padding: '10px',
                borderRadius: '8px',
                boxShadow: '0 0 2rem rgba(0,0,0,0.1)',
                border: 'none',
                position: 'relative',
                ...shiftStyle
            }}>
                <p style={{ margin: '0 0 5px', fontWeight: 'bold' }}>{label}</p>
                <p style={{ margin: 0, color: '#0A7C8F' }}>Approved Users : {data.approved || 0}</p>
                <p style={{ margin: 0, color: '#0FB5D0' }}>Pending Approvals : {data.pending || 0}</p>
                <p style={{ margin: 0, color: '#2BC9E4' }}>Reset Requests : {data.resets || 0}</p>
            </div>
        );
    }
    return null;
};

const processChartData = (data) => {
    if (!data) return [];
    return data.map(item => {
        // Define priority/order: Approved, Pending, Resets
        const activeItems = [
            { val: item.approved || 0, color: '#0A7C8F', name: 'Approved Users' },
            { val: item.pending || 0, color: '#0FB5D0', name: 'Pending Approvals' },
            { val: item.resets || 0, color: '#2BC9E4', name: 'Reset Requests' }
        ].filter(i => i.val > 0);

        const maxVal = Math.max(...activeItems.map(i => i.val), 0);

        return { ...item, activeItems, maxVal };
    });
};

const CustomBar = (props) => {
    const { x, y, width, height, payload } = props;
    const { activeItems, maxVal } = payload;
    const isMobile = window.innerWidth <= 768;
    const barWidth = isMobile ? 12 : 20;
    const gap = isMobile ? 2 : 4;

    if (!activeItems || activeItems.length === 0 || maxVal === 0) return null;

    const scale = height / maxVal;
    const cx = x + width / 2;

    return (
        <g>
            {activeItems.map((item, index) => {
                const itemHeight = item.val * scale;
                const itemY = y + height - itemHeight;
                let itemX = 0;

                if (activeItems.length === 1) {
                    itemX = cx - barWidth / 2;
                } else if (activeItems.length === 2) {
                    if (index === 0) itemX = cx - barWidth - gap / 2; // Left
                    if (index === 1) itemX = cx + gap / 2; // Right
                } else if (activeItems.length === 3) {
                    if (index === 0) itemX = cx - 1.5 * barWidth - gap; // Left
                    if (index === 1) itemX = cx - 0.5 * barWidth; // Center
                    if (index === 2) itemX = cx + 0.5 * barWidth + gap; // Right
                }

                // Radius logic (top-left, top-right)
                const radius = 4;
                // Generate path for rounded top corners
                const path = `
                    M ${itemX},${itemY + itemHeight}
                    L ${itemX},${itemY + radius}
                    Q ${itemX},${itemY} ${itemX + radius},${itemY}
                    L ${itemX + barWidth - radius},${itemY}
                    Q ${itemX + barWidth},${itemY} ${itemX + barWidth},${itemY + radius}
                    L ${itemX + barWidth},${itemY + itemHeight}
                    Z
                `;

                return <path key={index} d={path} fill={item.color} style={{ outline: 'none' }} />;
            })}
        </g>
    );
};

export default function AdminDashboard() {
    const navigate = useNavigate();

    // 1. State Declarations
    const [activeTab, setActiveTab] = useState(sessionStorage.getItem('adminActiveTab') || 'overview');
    const [stats, setStats] = useState(null);
    const [chartPeriod, setChartPeriod] = useState('day'); // 'day', 'month', 'year'
    const [users, setUsers] = useState([]);
    const [resets, setResets] = useState([]);
    const [loading, setLoading] = useState(true);

    // Auth & Visibility States
    const [confirmPass, setConfirmPass] = useState({});
    const [confirmPassRe, setConfirmPassRe] = useState({});
    const [loginIds, setLoginIds] = useState({});
    const [showPass, setShowPass] = useState({});
    const [showPassRe, setShowPassRe] = useState({});



    // Chat Review State
    const [viewChat, setViewChat] = useState(null);
    const [loadingChat, setLoadingChat] = useState(false);
    const [chatStep, setChatStep] = useState('contacts');
    const [chatContacts, setChatContacts] = useState([]);
    const [chatDates, setChatDates] = useState([]);
    const [selectedContact, setSelectedContact] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, messageId: null });

    // Multi-Select State
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedMsgs, setSelectedMsgs] = useState([]);
    const [selectedYear, setSelectedYear] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(null);
    const [dateSearchQuery, setDateSearchQuery] = useState('');
    const [msgDropdown, setMsgDropdown] = useState(null); // { id: msgId, x: e.pageX, y: e.pageY }
    const [showLogoutTooltip, setShowLogoutTooltip] = useState(false);

    // Flag Alert State
    const [showFlagAlert, setShowFlagAlert] = useState(false);
    const [highRiskUsers, setHighRiskUsers] = useState([]);
    const [unethicalAlerts, setUnethicalAlerts] = useState([]); // Array of { userId, userName, messageId, content, reason }
    const [adminNotifications, setAdminNotifications] = useState([]); // Combined alerts
    const [showNotifications, setShowNotifications] = useState(false);

    const chatEndRef = useRef(null);
    const chartScrollRef = useRef(null);

    // Sidebar & UI State
    const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1024);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            setWindowWidth(width);
            setIsMobile(width <= 768);
            if (width > 768) setMobileSidebarOpen(false);
            if (width <= 1024) setSidebarOpen(false);
            else setSidebarOpen(true);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (chartScrollRef.current && stats?.chartData) {
            const chartData = stats.chartData[chartPeriod] || [];

            // Get today's date in the appropriate format based on period
            const today = new Date();
            let todayKey;

            if (chartPeriod === 'day') {
                // Format: YYYY-MM-DD
                todayKey = today.toISOString().split('T')[0];
            } else if (chartPeriod === 'month') {
                // Format: YYYY-MM
                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, '0');
                todayKey = `${year}-${month}`;
            } else if (chartPeriod === 'year') {
                // Format: YYYY
                todayKey = String(today.getFullYear());
            }

            // Find the index of today's data point
            const todayIndex = chartData.findIndex(item => item.name === todayKey);

            if (todayIndex !== -1) {
                // Calculate scroll position to center today's bar
                const barGroupWidth = isMobile ? 80 : 120;
                const scrollContainer = chartScrollRef.current;
                const targetScrollLeft = (todayIndex * barGroupWidth) - (scrollContainer.clientWidth / 2) + (barGroupWidth / 2);

                // Scroll to today's date
                scrollContainer.scrollLeft = Math.max(0, targetScrollLeft);
            } else {
                // Fallback: scroll to the end if today's date is not in the data
                chartScrollRef.current.scrollLeft = chartScrollRef.current.scrollWidth;
            }
        }
    }, [stats, chartPeriod, isMobile]);

    // Admin User Data
    const [adminUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('user')) || { name: 'Admin', role: 'Super Admin' };
        } catch (e) {
            return { name: 'Admin', role: 'Super Admin' };
        }
    });

    // Snackbar & Confirmation
    const [snackbar, setSnackbar] = useState(null);
    const showSnackbar = (message, type = 'info') => {
        const name = adminUser?.name || 'Admin';
        const adminLabel = `Admin (${name})`;
        setSnackbar({ open: true, message, type, senderName: adminLabel });
    };
    const closeSnackbar = () => setSnackbar(null);

    const [confirmConfig, setConfirmConfig] = useState(null);
    const triggerConfirm = (title, message, onConfirm) => setConfirmConfig({ title, message, onConfirm });
    const closeConfirm = () => setConfirmConfig(null);

    const [unethicalModalUser, setUnethicalModalUser] = useState(null);

    const handlePasswordKeyDown = (e) => {
        if (e.key === ' ') {
            e.preventDefault();
        }
    };

    const [highlightMessageId, setHighlightMessageId] = useState(null);
    const [showUnethicalModal, setShowUnethicalModal] = useState(false);

    // Group alerts by user
    const groupedUnethicalAlerts = useMemo(() => {
        const groups = {};
        unethicalAlerts.forEach(alert => {
            if (!groups[alert.userId]) {
                groups[alert.userId] = {
                    userId: alert.userId,
                    userName: alert.userName,
                    alerts: []
                };
            }
            groups[alert.userId].alerts.push(alert);
        });
        return groups;
    }, [unethicalAlerts]);

    useEffect(() => {
        if (unethicalAlerts.length > 0) {
            setShowUnethicalModal(true);
        }
    }, [unethicalAlerts.length]);

    // Scroll to highlighted message
    useEffect(() => {
        if (highlightMessageId && viewChat?.messages && chatStep === 'messages') {
            // Slight delay to ensure render
            setTimeout(() => {
                const element = document.getElementById(`msg-container-${highlightMessageId}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Highlight with a full-width row background tint (WhatsApp style)
                    element.style.background = 'rgba(255, 77, 77, 0.15)';
                    element.style.transition = 'background 0.5s ease-in-out';

                    setTimeout(() => {
                        element.style.background = 'transparent';
                    }, 3000);
                    setHighlightMessageId(null);
                }
            }, 500);
        }
    }, [viewChat?.messages, chatStep, highlightMessageId]);

    const handleViewAlert = async (alert) => {
        // 1. Find User (Sender/Actor)
        const actorId = alert.userId || alert.sender_id;
        const user = users.find(u => u.id === actorId || u._id === actorId) || { id: actorId, name: alert.userName || alert.deletedBy || 'User', email: 'N/A' };

        // 2. Identify Contact (Receiver or Group)
        let contact = null;
        if (alert.isGroup) {
            contact = { id: alert.groupId, name: alert.partnerName || 'Group Chat', type: 'group' };
        } else {
            const otherId = alert.receiverId || alert.otherUserId;
            if (otherId) {
                contact = users.find(u => u.id === otherId || u._id === otherId);
                if (!contact) contact = { id: otherId, name: alert.partnerName || 'Unknown User', type: 'user' };
            } else {
                contact = { id: 'ai', name: 'AI Assistant', type: 'ai' };
            }
        }

        // 3. Date Handling
        const dateObj = new Date(alert.timestamp || alert.createdAt);
        const year = dateObj.getFullYear().toString();
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const day = dateObj.getDate().toString().padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;

        // 4. Update State & Fetch
        setShowNotifications(false);
        setShowUnethicalModal(false);
        setUnethicalModalUser(null);
        setChatStep('messages');
        setSelectedYear(year);
        setSelectedMonth(month);
        setSelectedDate(dateString);
        setSelectedContact(contact);
        setViewChat({ user, messages: [] }); // Clear current
        setLoadingChat(true);

        try {
            // Updated Logic: Fetch context data for "Back" navigation
            const [historyRes, contactsRes, datesRes] = await Promise.all([
                axios.get(`/api/admin/chat/history-filtered`, {
                    params: {
                        userId: user.id || user._id,
                        otherUserId: contact.id || contact._id,
                        date: dateString,
                        isGroup: alert.isGroup
                    }
                }),
                axios.get(`/api/admin/chat/contacts/${user.id || user._id}`),
                axios.get(`/api/admin/chat/dates/${user.id || user._id}/${contact.id || contact._id}`)
            ]);

            setChatContacts(contactsRes.data);
            setChatDates(datesRes.data.sort((a, b) => new Date(a) - new Date(b))); // Sort for consistency

            setViewChat({ user, messages: historyRes.data });
            setHighlightMessageId(alert.messageId || alert.id);
        } catch (err) {
            console.error(err);
            showSnackbar('Failed to load alert context', 'error');
        } finally {
            setLoadingChat(false);
        }
    };

    // 2. Effects
    useEffect(() => {
        sessionStorage.setItem('adminActiveTab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        if (chatStep === 'messages' && chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [viewChat?.messages, chatStep]);

    useEffect(() => {
        fetchData();
        fetchStats();
        fetchUnethicalAlerts();
    }, []);

    const fetchUnethicalAlerts = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('/api/chat/admin/unethical-messages', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.data && Array.isArray(res.data)) {
                setUnethicalAlerts(res.data);
            }
        } catch (err) {
            console.error("Failed to fetch unethical alerts", err);
        }
    };

    // Socket Setup
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;

        // Use Vite dev server URL - it will proxy WebSocket to backend via /socket.io
        const SOCKET_URL = window.location.origin;
        const socket = io(SOCKET_URL, {
            auth: { token },
            transports: ['websocket', 'polling'], // Allow polling as fallback
            reconnection: true,
        });

        socket.on('connect', () => {
            console.log('Client: Socket Connected!', socket.id);
        });

        socket.on('connect_error', (err) => {
            console.error('Client: Socket Connection Error:', err);
        });

        socket.on('unethical_message_detected', (data) => {
            console.log("Unethical Alert:", data);
            const newAlert = {
                ...data,
                id: data.messageId,
                type: 'unethical',
                timestamp: new Date()
            };
            setAdminNotifications(prev => {
                if (prev.some(a => a.id === data.messageId)) return prev;
                return [newAlert, ...prev];
            });
            // Also keep original state for now if needed by other components
            setUnethicalAlerts(prev => {
                if (prev.some(a => a.messageId === data.messageId)) return prev;
                return [...prev, data];
            });
            // Optional: Audio alert
            const audio = new Audio('/assets/notification.mp3');
            audio.play().catch(e => console.log("Audio play failed", e));
        });

        socket.on('message_deleted_admin', (data) => {
            console.log("Deletion Alert (Admin):", data);
            const newAlert = {
                ...data,
                id: data.messageId,
                type: 'deletion',
                timestamp: data.timestamp ? new Date(data.timestamp) : new Date()
            };
            setAdminNotifications(prev => {
                if (prev.some(a => a.id === data.messageId)) return prev;
                return [newAlert, ...prev];
            });
            const audio = new Audio('/assets/notification.mp3');
            audio.play().catch(e => console.log("Audio play failed", e));
        });

        socket.on('new_registration', (newUser) => {
            console.log('Client: new_registration received:', newUser);
            setUsers(prev => {
                // Ensure unique by ID
                if (prev.find(u => u.id === newUser.id)) return prev;
                return [...prev, newUser];
            });
            showSnackbar(`New Registration (Pending Approval): ${newUser.name}`, 'info');
            fetchStats();
        });

        socket.on('new_reset', (newReset) => {
            console.log('Client: new_reset received:', newReset);
            setResets(prev => {
                if (prev.find(r => r.id === newReset.id)) return prev;
                return [...prev, newReset];
            });
            const identifier = `${newReset.name} (${newReset.login_id || newReset.email})`;
            showSnackbar(`New Password Reset Request: ${identifier}`, 'info');
            fetchStats();
        });

        socket.on('user_approved', ({ userId }) => {
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'approved' } : u));
            fetchStats();
        });

        socket.on('user_deleted', ({ userId }) => {
            setUsers(prev => prev.filter(u => u.id !== userId));
            fetchStats();
        });

        socket.on('reset_resolved', ({ requestId }) => {
            setResets(prev => prev.filter(r => r.id !== requestId));
            fetchStats();
        });

        socket.on('reset_deleted', ({ requestId }) => {
            setResets(prev => prev.filter(r => r.id !== requestId));
            fetchStats();
        });

        socket.on('message_deleted', (data) => {
            console.log('Socket: message_deleted received:', data);
            setViewChat(prev => {
                if (!prev || !prev.messages) return prev;
                return {
                    ...prev,
                    messages: prev.messages.map(msg =>
                        (msg._id === data.messageId || msg.id === data.messageId)
                            ? { ...msg, is_deleted_by_admin: data.is_deleted_by_admin, is_deleted_by_user: data.is_deleted_by_user }
                            : msg
                    )
                };
            });
        });

        return () => socket.disconnect();
    }, []);

    const fetchData = async () => {
        try {
            const [uRes, rRes] = await Promise.all([
                axios.get('/api/admin/users'),
                axios.get('/api/admin/resets')
            ]);
            // Sort Old to New (ascending)
            const sortedUsers = [...uRes.data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            const sortedResets = [...rRes.data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            setUsers(sortedUsers);
            setResets(sortedResets);

            const risky = uRes.data.filter(u => u.flaggedCount > 3);
            if (risky.length > 0 && !sessionStorage.getItem('highRiskAlertAcknowledged')) {
                setHighRiskUsers(risky);
                setShowFlagAlert(true);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const res = await axios.get('/api/admin/stats');
            setStats(res.data);
        } catch (err) {
            console.error('Stats fetch failed:', err);
        }
    };

    const handleApprove = async (userId) => {
        const password = confirmPass[userId];
        const confirmPassword = confirmPassRe[userId];
        const loginId = loginIds[userId];
        const passwordRegex = /^[A-Z][a-z]*(?=.*\d)(?=.*[@#$&*])[a-z\d@#$&*]{7,19}$/;

        if (!loginId) return showSnackbar('Please assign a numeric Login ID', 'warning');
        if (!password) return showSnackbar('Please enter a password', 'warning');
        if (password.length < 8) return showSnackbar('minimum 8 characters needed', 'warning');
        if (password !== confirmPassword) return showSnackbar('Passwords do not match', 'error');
        if (!passwordRegex.test(password)) return showSnackbar('Password must start with uppercase letter, followed by lowercase letters, and include numbers and special characters', 'warning');

        try {
            await axios.post('/api/admin/approve', { userId, loginId, password });
            const user = users.find(u => u.id === userId || u._id === userId);
            showSnackbar(`Pending Approval approved for: ${user?.name || ''} (${loginId})`, 'success');
            fetchData();
            fetchStats();
            setConfirmPass({ ...confirmPass, [userId]: '' });
            setConfirmPassRe({ ...confirmPassRe, [userId]: '' });
            setLoginIds({ ...loginIds, [userId]: '' });
        } catch (err) {
            showSnackbar(err.response?.data?.error || 'Approval failed', 'error');
        }
    };

    const handleReset = async (requestId, userId) => {
        const newPassword = confirmPass[`reset-${requestId}`];
        const confirmPassword = confirmPassRe[`reset-${requestId}`];
        const passwordRegex = /^[A-Z][a-z]*(?=.*\d)(?=.*[@#$&*])[a-z\d@#$&*]{7,19}$/;

        if (!newPassword) return showSnackbar('Please enter a new password', 'warning');
        if (newPassword.length < 8) return showSnackbar('minimum 8 characters needed', 'warning');
        if (newPassword !== confirmPassword) return showSnackbar('Passwords do not match', 'error');
        if (!passwordRegex.test(newPassword)) return showSnackbar('Password must start with uppercase letter, followed by lowercase letters, and include numbers and special characters', 'warning');

        try {
            await axios.post('/api/admin/reset-password', { requestId, userId, newPassword });
            // Find the user associated with the reset request to display their name/login_id
            const user = users.find(u => u.id === userId);
            showSnackbar(`Temporary password set for: ${user?.name || userId} (${user?.login_id || ''})`, 'success');
            fetchData(); // Re-fetch data to update resets list if needed
            fetchStats();
        } catch (err) {
            showSnackbar(err.response?.data?.error || 'Reset failed', 'error');
        }
    };

    // ... (Chat logic remains similar but UI is overhauled) ...
    const handleReviewChat = async (user) => {
        setLoadingChat(true);
        setViewChat({ user, messages: [] });
        setChatStep('contacts');
        setSelectedContact(null);
        setSelectedDate(null);
        setSelectedYear(null);
        setSelectedMonth(null);
        setDateSearchQuery('');
        try {
            const res = await axios.get(`/api/admin/chat/contacts/${user.id}`);
            setChatContacts(res.data);
        } catch (err) {
            showSnackbar('Failed to fetch contacts', 'error');
        } finally {
            setLoadingChat(false);
        }
    };

    const handleSelectContact = (contact) => {
        setSelectedContact(contact);
        setChatStep('years');
        setLoadingChat(true);
        setSelectedYear(null);
        setSelectedMonth(null);
        setDateSearchQuery('');
        const userId = viewChat.user.id || viewChat.user._id;
        const otherUserId = contact.id || contact._id;
        axios.get(`/api/admin/chat/dates/${userId}/${otherUserId}`)
            .then(res => {
                const sortedDates = [...res.data].sort((a, b) => new Date(a) - new Date(b));
                setChatDates(sortedDates);
            })
            .catch((err) => {
                console.error("Fetch dates error:", err);
                showSnackbar('Failed to fetch dates', 'error');
            })
            .finally(() => setLoadingChat(false));
    };

    const handleSelectYear = (year) => {
        setSelectedYear(year);
        setChatStep('months');
        setDateSearchQuery('');
    };

    const handleSelectMonth = (month) => {
        setSelectedMonth(month);
        setChatStep('dates');
        setDateSearchQuery('');
    };

    const handleContextMenu = (e, msgId, isMe) => {
        e.preventDefault();
        setContextMenu({
            visible: true,
            x: e.pageX,
            y: e.pageY,
            messageId: msgId,
            isMe: isMe
        });
    };

    useEffect(() => {
        const handleClick = () => {
            if (contextMenu.visible) setContextMenu({ ...contextMenu, visible: false });
            if (msgDropdown) setMsgDropdown(null);
            if (showNotifications) setShowNotifications(false);
        };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [contextMenu, msgDropdown, showNotifications]);

    const handleSelectDate = async (date) => {
        setSelectedDate(date);
        setLoadingChat(true);
        try {
            const res = await axios.get(`/api/admin/chat/history-filtered`, { params: { userId: viewChat.user.id, otherUserId: selectedContact.id, date } });
            setViewChat({ ...viewChat, messages: res.data });
            setChatStep('messages');
        } catch (err) {
            showSnackbar('Failed to fetch history', 'error');
        } finally {
            setLoadingChat(false);
        }
    };

    const toggleSelectMsg = (msgId) => {
        if (!selectionMode) return;
        setSelectedMsgs(prev =>
            prev.includes(msgId) ? prev.filter(id => id !== msgId) : [...prev, msgId]
        );
    };

    const enterSelectionMode = (msgId) => {
        setSelectionMode(true);
        setSelectedMsgs([msgId]);
        setMsgDropdown(null);
    };

    const handleBulkDelete = () => {
        triggerConfirm('Delete Messages?', `Delete ${selectedMsgs.length} messages?`, async () => {
            try {
                // For now, we'll use a loop or update the backend to support bulk. 
                // But the user specifically asked for "Trash icon to messages" which implies per-message first.
                // Let's implement the per-message delete and then bulk if needed.
                const token = localStorage.getItem('token');
                for (const msgId of selectedMsgs) {
                    await axios.post(`/api/chat/message/${msgId}/delete`, {}, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                }
                setViewChat({ ...viewChat, messages: viewChat.messages.map(m => selectedMsgs.includes(m.id || m._id) ? { ...m, is_deleted_by_admin: true } : m) });
                setSelectionMode(false);
                setSelectedMsgs([]);
                showSnackbar('Chat Messages deleted', 'success');
                closeConfirm();
            } catch (err) {
                showSnackbar('Failed to delete messages', 'error');
                closeConfirm();
            }
        });
    };

    const handleDeleteSingleMessage = (msgId) => {
        setContextMenu({ ...contextMenu, visible: false });
        // Admins always delete for everyone (censorship)
        triggerConfirm('Delete for everyone', 'Are you sure you want to delete this message?', async () => {
            try {
                const token = localStorage.getItem('token');
                await axios.post(`/api/chat/message/${msgId}/delete`, {}, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setViewChat({ ...viewChat, messages: viewChat.messages.map(m => (m.id === msgId || m._id === msgId) ? { ...m, is_deleted_by_admin: true } : m) });
                setViewChat({ ...viewChat, messages: viewChat.messages.map(m => (m.id === msgId || m._id === msgId) ? { ...m, is_deleted_by_admin: true } : m) });
                showSnackbar('Message deleted', 'success');
                closeConfirm();
            } catch (err) {
                showSnackbar('Deletion failed', 'error');
                closeConfirm();
            }
        });
    };

    const renderContent = (content) => {
        if (!content) return content;
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = content.split(urlRegex);
        return parts.map((part, i) => {
            if (urlRegex.test(part)) {
                return (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#53bdeb', textDecoration: 'underline' }} onClick={(e) => e.stopPropagation()}>
                        {part}
                    </a>
                );
            }
            return part;
        });
    };

    const renderLinkPreview = (msg) => {
        if (!msg.link_preview || !msg.link_preview.title) return null;
        const lp = msg.link_preview;
        const isYT = lp.domain?.includes('youtube') || lp.domain?.includes('youtu.be');

        return (
            <div
                style={{
                    background: isYT ? 'rgba(255, 65, 84, 0.03)' : 'rgba(0,0,0,0.02)',
                    borderRadius: '12px', overflow: 'hidden', marginTop: '12px',
                    border: isYT ? '1px solid rgba(255, 65, 84, 0.08)' : '1px solid rgba(0,0,0,0.05)',
                    cursor: 'pointer'
                }}
                className="no-hover-card"
                onClick={() => window.open(lp.url, '_blank')}
            >
                {lp.image && (
                    <div style={{ position: 'relative' }}>
                        <img src={lp.image} alt={lp.title} style={{ width: '100%', height: '160px', objectFit: 'cover' }} />
                        {isYT && (
                            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(255,0,0,0.9)', padding: '8px 20px', borderRadius: '12px', color: 'white', boxShadow: '0 4px 15px rgba(255,0,0,0.3)' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                            </div>
                        )}
                    </div>
                )}
                <div style={{ padding: '12px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#32325d', lineHeight: '1.4' }}>{lp.title}</div>
                    {lp.description && <div style={{ fontSize: '0.75rem', color: '#8898aa', marginTop: '6px', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{lp.description}</div>}
                    <div style={{ fontSize: '0.7rem', color: isYT ? '#ff0000' : '#0A7C8F', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
                        {isYT ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
                        ) : (
                            <Eye size={12} />
                        )}
                        {lp.domain}
                    </div>
                </div>
            </div>
        );
    };

    // --------------------------------------------------------------------------------
    // RENDER HELPERS
    // --------------------------------------------------------------------------------

    const COLORS = ['#0A7C8F', '#0FB5D0', '#2BC9E4', '#0098B0', '#CCFAFF'];

    const renderNotificationDropdown = () => {
        if (!showNotifications) return null;
        return (
            <div className="admin-notification-dropdown" style={{
                position: 'absolute', top: '55px', right: isMobile ? '10px' : '60px',
                width: isMobile ? '280px' : '340px', background: 'white',
                borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                zIndex: 3000, overflow: 'hidden', border: '1px solid #e9ecef',
                animation: 'slideUp 0.3s ease-out'
            }}>
                <div style={{
                    padding: '16px', borderBottom: '1px solid #e9ecef',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#f8f9fe'
                }}>
                    <span style={{ fontWeight: '700', color: '#111b21', fontSize: '0.95rem' }}>Review Box</span>
                    <span style={{
                        background: '#0FB5D0', color: 'white', padding: '2px 8px',
                        borderRadius: '10px', fontSize: '0.7rem', fontWeight: '700'
                    }}>
                        {adminNotifications.length}
                    </span>
                </div>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {adminNotifications.length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#8898aa', fontSize: '0.85rem' }}>
                            <Bell size={30} style={{ margin: '0 auto 10px', opacity: 0.3, display: 'block' }} />
                            No recent actions to review
                        </div>
                    ) : (
                        adminNotifications.map((alert, idx) => (
                            <div
                                key={idx}
                                onClick={() => handleViewAlert(alert)}
                                style={{
                                    padding: '12px 16px', borderBottom: '1px solid #f1f3f5',
                                    cursor: 'pointer', transition: 'background 0.2s',
                                    display: 'flex', gap: '12px', alignItems: 'flex-start'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f8f9fe'}
                                onMouseLeave={e => e.currentTarget.style.background = 'white'}
                            >
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '50%',
                                    background: alert.type === 'unethical' ? '#feebee' : '#e0f7fa',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    {alert.type === 'unethical' ? (
                                        <AlertTriangle size={18} color="#f5365c" />
                                    ) : (
                                        <Trash2 size={18} color="#0A7C8F" />
                                    )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                        <span style={{ fontWeight: '700', fontSize: '0.825rem', color: '#32325d' }}>
                                            {alert.type === 'unethical' ? 'Unethical Content' : 'Message Deleted'}
                                        </span>
                                        <span style={{ fontSize: '0.65rem', color: '#adb5bd' }}>
                                            {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#525f7f', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                        {alert.isGroup ? <Users size={12} /> : <UserIcon size={12} />}
                                        <span style={{ fontWeight: '600' }}>{alert.deletedBy || alert.userName}</span>
                                        <span style={{ color: '#adb5bd' }}>in</span>
                                        <span style={{ fontWeight: '600', color: '#0A7C8F' }}>{alert.partnerName}</span>
                                    </div>
                                    <div style={{
                                        fontSize: '0.75rem', color: '#8898aa',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        fontStyle: 'italic'
                                    }}>
                                        "{alert.contentSnippet || alert.content}"
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                {adminNotifications.length > 0 && (
                    <div
                        onClick={(e) => { e.stopPropagation(); setAdminNotifications([]); }}
                        style={{
                            padding: '10px', textAlign: 'center', fontSize: '0.75rem',
                            color: '#fb6340', fontWeight: '700', cursor: 'pointer',
                            borderTop: '1px solid #e9ecef', background: '#fff'
                        }}
                    >
                        Clear all notifications
                    </div>
                )}
            </div>
        );
    };

    const renderMsgDropdown = () => {
        if (!msgDropdown) return null;
        return (
            <>
                <div
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2004, cursor: 'default' }}
                    onClick={() => setMsgDropdown(null)}
                />
                <div
                    onClick={() => setMsgDropdown(null)}
                    style={{
                        position: 'fixed', top: msgDropdown.y - 10, left: msgDropdown.x,
                        transform: 'translate(-100%, -100%)', // Move up and left to sit above the trigger
                        background: 'white', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                        zIndex: 2005, padding: '4px', border: '1px solid #e9ecef', minWidth: '150px'
                    }}
                >
                    <div
                        onClick={() => enterSelectionMode(msgDropdown.id)}
                        style={{
                            padding: '10px 16px', borderRadius: '6px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            color: '#32325d', fontSize: '0.85rem', fontWeight: '600',
                            transition: 'background 0.2s', marginBottom: '4px'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = '#f8f9fe'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        <Check size={16} /> Select Messages
                    </div>
                    <div
                        onClick={() => handleDeleteSingleMessage(msgDropdown.id)}
                        style={{
                            padding: '10px 16px', borderRadius: '6px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            color: '#f5365c', fontSize: '0.85rem', fontWeight: '600',
                            transition: 'background 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = '#fef1f2'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        <Trash2 size={16} /> Delete
                    </div>
                </div>
            </>
        );
    };

    const renderSelectionBar = () => {
        if (!selectionMode) return null;
        return (
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'white', borderTop: '1px solid #e9ecef',
                padding: '1rem 2rem', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', zIndex: 1010,
                boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
                animation: 'slideUp 0.3s ease-out'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <X
                        size={20}
                        style={{ cursor: 'pointer', color: '#8898aa' }}
                        onClick={() => { setSelectionMode(false); setSelectedMsgs([]); }}
                    />
                    <span style={{ fontWeight: '700', color: '#32325d', fontSize: '1.1rem' }}>
                        {selectedMsgs.length} selected
                    </span>
                </div>
                <div
                    onClick={handleBulkDelete}
                    style={{
                        background: '#fef1f2', color: '#f5365c',
                        padding: '10px 20px', borderRadius: '12px',
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                        gap: '8px', fontWeight: '700', transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#fddfe2'}
                    onMouseOut={(e) => e.currentTarget.style.background = '#fef1f2'}
                >
                    <Trash2 size={20} /> Delete Selected
                </div>
            </div>
        );
    };

    const StatCard = ({ title, value, subtext, gradient, icon: Icon, onClick }) => (
        <div
            onClick={onClick}
            style={{
                background: gradient,
                padding: '1.5rem',
                borderRadius: '10px',
                color: 'white',
                boxShadow: '0 4px 15px rgba(10, 124, 143, 0.2)',
                position: 'relative',
                overflow: 'hidden',
                flex: 1,
                minWidth: '300px',
                minHeight: '180px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'transform 0.2s',
            }}
            onMouseOver={(e) => onClick && (e.currentTarget.style.transform = 'translateY(-5px)')}
            onMouseOut={(e) => onClick && (e.currentTarget.style.transform = 'translateY(0)')}
        >
            {/* Background design dots/circles as seen in image */}
            <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }}></div>

            <div style={{ zIndex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.95rem', fontWeight: '500', opacity: 0.9, margin: 0 }}>{title}</p>
                    <Icon size={24} style={{ opacity: 0.8 }} />
                </div>
                <h3 style={{ fontSize: '2.1rem', fontWeight: '600', margin: '0.5rem 0' }}>{value}</h3>
            </div>
            <div style={{ zIndex: 1, fontSize: '0.85rem', fontWeight: '400', opacity: 0.9 }}>
                {subtext}
            </div>
        </div>
    );

    const renderOverview = () => {
        const query = (searchQuery || '').toLowerCase().trim();
        const searchMatches = query ? users.filter(u =>
            u.role !== 'admin' && (
                (u.name && u.name.toLowerCase().includes(query)) ||
                (u.email && u.email.toLowerCase().includes(query)) ||
                (u.login_id && u.login_id.toString().toLowerCase().includes(query))
            )
        ) : [];

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {query && searchMatches.length > 0 && (
                    <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 0 2rem rgba(0,0,0,0.05)', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                            <Search size={18} color="#0A7C8F" />
                            <h4 style={{ margin: 0, fontWeight: '700', color: '#32325d' }}>Search Results of Users</h4>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {searchMatches.slice(0, 5).map(u => (
                                <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: '#f6f9fc', borderRadius: '8px', transition: 'all 0.2s', border: '1px solid transparent' }} className="hover-card">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                                        <div style={{ width: '35px', height: '35px', background: 'linear-gradient(135deg, #e9ecef 0%, #dee2e6 100%)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ced4da' }}>
                                            <UserIcon size={16} color="#0A7C8F" />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <div style={{ fontWeight: '700', color: '#32325d', fontSize: '0.95rem' }}>{u.name}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ fontSize: '0.75rem', color: '#8898aa', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span style={{ fontWeight: '600', color: '#0A7C8F' }}>ID:</span> {u.login_id || 'N/A'}
                                                </div>
                                                <span style={{ fontSize: '0.75rem', color: '#ced4da' }}>|</span>
                                                <div style={{ fontSize: '0.75rem', color: '#8898aa' }}>{u.email}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ paddingRight: '10px' }}>
                                        <button
                                            onClick={() => { setSearchQuery(''); setActiveTab('management'); }}
                                            style={{
                                                background: 'white',
                                                border: '1px solid #0A7C8F',
                                                color: '#0A7C8F',
                                                padding: '6px 16px',
                                                borderRadius: '20px',
                                                fontSize: '0.75rem',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                boxShadow: '0 2px 4px rgba(10, 124, 143, 0.1)'
                                            }}
                                            onMouseOver={(e) => { e.currentTarget.style.background = '#0A7C8F'; e.currentTarget.style.color = 'white'; }}
                                            onMouseOut={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#0A7C8F'; }}
                                        >
                                            View in Users list
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {searchMatches.length > 5 && (
                                <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#8898aa', cursor: 'pointer' }} onClick={() => setActiveTab('management')}>
                                    View all {searchMatches.length} matches
                                </div>
                            )}
                        </div>
                    </div>
                )}
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: isMobile ? 'center' : 'flex-start' }}>
                    <StatCard
                        title="Total Users"
                        value={stats?.totalUsers || 0}
                        subtext="Total registered members"
                        gradient="linear-gradient(87deg, #0A7C8F 0, #0FB5D0 100%)"
                        icon={TrendingUp}
                        onClick={() => setActiveTab('management')}
                    />
                    <StatCard
                        title="Pending Approvals"
                        value={stats?.pendingApprovals || 0}
                        subtext="Waiting for your review"
                        gradient="linear-gradient(87deg, #0A7C8F 0, #0FB5D0 100%)"
                        icon={LayoutDashboard}
                        onClick={() => setActiveTab('pending')}
                    />
                    <StatCard
                        title="Reset Requests"
                        value={stats?.activeResets || 0}
                        subtext="Active password reset tasks"
                        gradient="linear-gradient(87deg, #0A7C8F 0, #0FB5D0 100%)"
                        icon={Key}
                        onClick={() => setActiveTab('resets')}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '1.5rem', minHeight: '400px' }}>
                    {/* Bar Chart */}
                    <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 0 2rem rgba(0,0,0,0.05)', minWidth: 0 }}>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '1rem',
                            marginBottom: '1.5rem',
                            textAlign: 'center'
                        }}>
                            <h4 style={{ margin: 0, fontWeight: '700', color: '#32325d', width: '100%', textAlign: 'center' }}>User Activity & Request Trends</h4>
                            <div style={{ display: 'flex', background: '#f6f9fc', padding: '4px', borderRadius: '8px' }}>
                                {['day', 'month', 'year'].map(p => (
                                    <button key={p} onClick={() => setChartPeriod(p)} style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s', background: chartPeriod === p ? 'white' : 'transparent', color: chartPeriod === p ? '#0FB5D0' : '#8898aa', boxShadow: chartPeriod === p ? '0 1px 3px rgba(50,50,93,.15), 0 1px 0 rgba(0,0,0,.02)' : 'none' }}>
                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Chart Area with fixed Y Axis and scrollable Bar area */}
                        <div style={{ display: 'flex', height: '300px', width: '100%', position: 'relative' }}>
                            {(() => {
                                const fullData = processChartData(stats?.chartData[chartPeriod] || []);
                                const barGroupWidth = isMobile ? 80 : 120;
                                const calculatedWidth = fullData.length * barGroupWidth;

                                return (
                                    <>
                                        {/* Fixed Y-Axis Container */}
                                        <div style={{ width: '40px', height: '100%', flexShrink: 0, zIndex: 10, background: 'white' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={fullData} margin={{ left: -25, right: 0, top: 0, bottom: isMobile ? 50 : 40 }}>
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8898aa', fontSize: 12 }} />
                                                    <Bar dataKey="maxVal" opacity={0} isAnimationActive={false} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* Scrollable Bar Area */}
                                        <div
                                            ref={chartScrollRef}
                                            style={{
                                                flex: 1,
                                                overflowX: 'auto',
                                                overflowY: 'hidden',
                                                scrollBehavior: 'smooth',
                                                minWidth: 0
                                            }}
                                            className="table-responsive"
                                        >
                                            <div style={{ width: calculatedWidth > 0 ? `${calculatedWidth}px` : '100%', height: '100%', minWidth: '100%' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={fullData} margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9ecef" />
                                                        <XAxis
                                                            dataKey="name"
                                                            axisLine={false}
                                                            tickLine={false}
                                                            tick={{ fill: '#8898aa', fontSize: isMobile ? 10 : 12 }}
                                                            dy={15}
                                                            interval={0}
                                                            angle={0}
                                                            textAnchor="middle"
                                                            height={isMobile ? 50 : 40}
                                                            tickFormatter={(val) => {
                                                                if (!val) return '';
                                                                if (chartPeriod === 'day') {
                                                                    const [y, m, d] = val.split('-');
                                                                    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                                                                    const month = monthNames[parseInt(m) - 1];
                                                                    const shortYear = y.substring(2);
                                                                    return isMobile ? `${parseInt(d)} ${month} '${shortYear}` : `${parseInt(d)} ${month}`;
                                                                }
                                                                if (chartPeriod === 'month') {
                                                                    const [y, m] = val.split('-');
                                                                    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                                                                    const month = monthNames[parseInt(m) - 1];
                                                                    const shortYear = y.substring(2);
                                                                    return `${month} '${shortYear}`;
                                                                }
                                                                return val;
                                                            }}
                                                        />
                                                        <YAxis hide domain={[0, 'auto']} />
                                                        <Tooltip content={<CustomTooltip scrollRef={chartScrollRef} />} cursor={{ fill: '#f6f9fc' }} />
                                                        <Bar dataKey="maxVal" shape={<CustomBar />} legendType="none" tabIndex={-1} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>

                        {/* Legend outside the scrollable area */}
                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'center' }}>
                                {[
                                    { color: '#0A7C8F', label: 'Approved Users' },
                                    { color: '#0FB5D0', label: 'Pending Approvals' },
                                    { color: '#2BC9E4', label: 'Reset Requests' }
                                ].map((item, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '12px', height: '12px', background: item.color, borderRadius: '2px' }} />
                                        <span style={{ fontSize: '0.8rem', color: '#8898aa', fontWeight: '600' }}>{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Pie Chart */}
                    <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 0 2rem rgba(0,0,0,0.05)', textAlign: 'center' }}>
                        <h4 style={{ margin: '0 0 1.5rem 0', fontWeight: '700', color: '#32325d', textAlign: 'center' }}>User Status Distribution</h4>
                        <div style={{ height: '320px', width: '100%' }}>
                            {(() => {
                                const COLORS = ['#0A7C8F', '#0FB5D0', '#2BC9E4'];
                                const pieData = [
                                    { name: 'Approved Users', value: stats?.totalUsers || 0 },
                                    { name: 'Pending Approvals', value: stats?.pendingApprovals || 0 },
                                    { name: 'Reset Requests', value: stats?.activeResets || 0 }
                                ];
                                return (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={pieData}
                                                innerRadius={isMobile ? 70 : 85}
                                                outerRadius={isMobile ? 100 : 120}
                                                paddingAngle={5}
                                                dataKey="value"
                                                tabIndex={-1}
                                            >
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} style={{ outline: 'none' }} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                );
                            })()}
                        </div>

                        {/* Custom Legend - Matching Image Style */}
                        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? '1rem' : '1.5rem', justifyContent: 'center' }}>
                                {[
                                    { color: '#0A7C8F', label: 'Approved Users' },
                                    { color: '#0FB5D0', label: 'Pending Approvals' },
                                    { color: '#2BC9E4', label: 'Reset Requests' }
                                ].map((item, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '14px', height: '14px', background: item.color, borderRadius: '3px' }} />
                                        <span style={{ fontSize: isMobile ? '0.75rem' : '0.85rem', color: '#8898aa', fontWeight: '600' }}>{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderUsersList = (listType) => {
        const filtered = users.filter(u => {
            const isNotAdmin = u.role !== 'admin';
            const status = (u.status || '').toLowerCase();
            const query = (searchQuery || '').toLowerCase().trim();

            const matchesTab = listType === 'pending'
                ? (status === 'pending' && isNotAdmin)
                : (status === 'approved' && isNotAdmin); // Removed strict login_id check to ensure visibility if status is approved

            const matchesSearch = !query ||
                (u.name && u.name.toLowerCase().includes(query)) ||
                (u.email && u.email.toLowerCase().includes(query)) ||
                (u.login_id && u.login_id.toString().toLowerCase().includes(query));

            return matchesTab && matchesSearch;
        });

        return (
            <div style={{ background: 'white', borderRadius: '1rem', overflowX: 'auto', boxShadow: '0 0 2rem rgba(0,0,0,0.05)' }}>
                <table style={{ minWidth: isMobile ? '800px' : '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f6f9fc', borderBottom: '1px solid #e9ecef' }}>
                            <th style={{ padding: '1rem', paddingLeft: '2.4rem', textAlign: 'center', fontSize: '0.8rem', color: '#8898aa', fontWeight: '600' }}>Sl.No</th>
                            <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#8898aa', fontWeight: '600' }}>USER</th>
                            <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#8898aa', fontWeight: '600' }}>ROLE</th>
                            <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#8898aa', fontWeight: '600' }}>EMAIL</th>
                            {(listType === 'management' || listType === 'pending') && <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#8898aa', fontWeight: '600', whiteSpace: 'nowrap' }}>LOGIN ID</th>}
                            {listType === 'pending' && <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#8898aa', fontWeight: '600' }}>PASSWORD ALLOCATION</th>}
                            <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#8898aa', fontWeight: '600', whiteSpace: 'nowrap' }}>DATE & TIME</th>
                            <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#8898aa', fontWeight: '600' }}>MANAGE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((u, i) => (
                            <tr
                                key={u.id}
                                style={{
                                    borderBottom: 'none',
                                    transition: 'all 0.25s ease',
                                    position: 'relative',
                                    zIndex: 0
                                }}
                                className="hover-row"
                                onMouseOver={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-3px)';
                                    e.currentTarget.style.background = '#fff';
                                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';
                                    e.currentTarget.style.zIndex = '1';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.boxShadow = 'none';
                                    e.currentTarget.style.zIndex = '0';
                                }}
                            >
                                <td style={{ padding: '1rem', paddingLeft: '2.4rem', textAlign: 'center', fontSize: '0.9rem', color: '#525f7f' }}>{i + 1}</td>
                                <td style={{ padding: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontWeight: '600', color: '#32325d' }}>{u.name}</div>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9rem', color: '#525f7f', fontWeight: '500' }}>
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        textAlign: 'center',
                                        padding: '4px 12px',
                                        background: '#f6f9fc',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        color: '#0A7C8F',
                                        fontWeight: '700',
                                        minWidth: '60px',
                                        lineHeight: '1.2'
                                    }}>
                                        {u.designation || (u.role === 'admin' ? 'Admin' : 'User')}
                                    </span>
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9rem', color: '#525f7f', maxWidth: '180px', wordBreak: 'break-all', whiteSpace: 'normal' }}>{u.email}</td>
                                {listType === 'management' && <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9rem', color: '#525f7f' }}>{u.login_id}</td>}
                                {listType === 'pending' && (
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <input
                                            type="text"
                                            placeholder="Login ID"
                                            value={loginIds[u.id] || ''}
                                            onChange={e => {
                                                const val = e.target.value.replace(/\D/g, '');
                                                setLoginIds({ ...loginIds, [u.id]: val });
                                            }}
                                            style={{ width: '60px', padding: '8px 4px', fontSize: '0.7rem', borderRadius: '6px', border: '1px solid #dee2e6', textAlign: 'center' }}
                                        />
                                    </td>
                                )}
                                {listType === 'pending' && (
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    type={showPass[u.id] ? "text" : "password"}
                                                    placeholder="Set Password"
                                                    value={confirmPass[u.id] || ''}
                                                    onChange={e => setConfirmPass({ ...confirmPass, [u.id]: e.target.value.replace(/\s/g, '') })}
                                                    onKeyDown={handlePasswordKeyDown}
                                                    onCopy={(e) => {
                                                        const selection = window.getSelection().toString();
                                                        if (selection) {
                                                            // If user selected dots, copy actual value
                                                            e.clipboardData.setData('text/plain', confirmPass[u.id] || '');
                                                            e.preventDefault();
                                                        }
                                                    }}
                                                    style={{ width: '120px', padding: '8px 24px 8px 8px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #dee2e6', textAlign: 'center', outline: 'none' }}
                                                />
                                                <div onClick={() => setShowPass({ ...showPass, [u.id]: !showPass[u.id] })} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#8898aa', display: 'flex', alignItems: 'center' }}>
                                                    {showPass[u.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </div>
                                            </div>
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    type={showPassRe[u.id] ? "text" : "password"}
                                                    placeholder="Confirm Password"
                                                    value={confirmPassRe[u.id] || ''}
                                                    onChange={e => setConfirmPassRe({ ...confirmPassRe, [u.id]: e.target.value.replace(/\s/g, '') })}
                                                    onKeyDown={handlePasswordKeyDown}
                                                    onCopy={(e) => {
                                                        const selection = window.getSelection().toString();
                                                        if (selection) {
                                                            e.clipboardData.setData('text/plain', confirmPassRe[u.id] || '');
                                                            e.preventDefault();
                                                        }
                                                    }}
                                                    style={{ width: '155px', padding: '8px 24px 8px 8px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #dee2e6', textAlign: 'center', outline: 'none' }}
                                                />
                                                <div onClick={() => setShowPassRe({ ...showPassRe, [u.id]: !showPassRe[u.id] })} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#8898aa', display: 'flex', alignItems: 'center' }}>
                                                    {showPassRe[u.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                )}
                                <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: '#8898aa' }}>
                                    {u.created_at ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                            <div style={{ fontWeight: '600', color: '#525f7f' }}>{new Date(u.created_at).toLocaleDateString('en-IN')}</div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.8, whiteSpace: 'nowrap' }}>
                                                {new Date(u.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                            </div>
                                        </div>
                                    ) : 'N/A'}
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                                        {listType === 'pending' ? (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        if (confirmPass[u.id] !== confirmPassRe[u.id]) {
                                                            showSnackbar('Passwords do not match!', 'error');
                                                            return;
                                                        }
                                                        handleApprove(u.id);
                                                    }}
                                                    style={{ background: '#fff', color: '#0A7C8F', padding: '8px 12px', width: '110px', minWidth: '110px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '700', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(10, 124, 143, 0.1)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap', outline: 'none' }}
                                                    className="hover-card"
                                                    onMouseOver={(e) => {
                                                        e.currentTarget.style.background = 'linear-gradient(135deg, #0A7C8F 0%, #0FB5D0 100%)';
                                                        e.currentTarget.style.color = 'white';
                                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                                        e.currentTarget.style.border = 'none';
                                                        e.currentTarget.style.outline = 'none';
                                                    }}
                                                    onMouseOut={(e) => {
                                                        e.currentTarget.style.background = '#fff';
                                                        e.currentTarget.style.color = '#0A7C8F';
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.border = 'none';
                                                        e.currentTarget.style.outline = 'none';
                                                    }}
                                                >
                                                    <Check size={16} /> Approve
                                                </button>
                                                <button
                                                    onClick={() => triggerConfirm('Reject Registration?', `Reject and delete ${u.name}?`, async () => {
                                                        await axios.delete(`/api/admin/user/${u.id}`);
                                                        fetchData();
                                                        fetchStats();
                                                        closeConfirm();
                                                        showSnackbar(`Pending Approval rejected for: ${u.name} (${u.login_id || u.email})`, 'success');
                                                    })}
                                                    style={{ background: '#fff', color: '#f5365c', padding: '8px 12px', width: '110px', minWidth: '110px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '700', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(245, 54, 92, 0.1)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap', outline: 'none' }}
                                                    className="hover-card"
                                                    onMouseOver={(e) => {
                                                        e.currentTarget.style.background = '#f5365c';
                                                        e.currentTarget.style.color = 'white';
                                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                                        e.currentTarget.style.border = 'none';
                                                        e.currentTarget.style.outline = 'none';
                                                    }}
                                                    onMouseOut={(e) => {
                                                        e.currentTarget.style.background = '#fff';
                                                        e.currentTarget.style.color = '#f5365c';
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.border = 'none';
                                                        e.currentTarget.style.outline = 'none';
                                                    }}
                                                >
                                                    <X size={16} /> Reject
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleReviewChat(u)}
                                                    style={{ background: '#fff', color: '#0A7C8F', padding: '8px 12px', width: '110px', minWidth: '110px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '700', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(10, 124, 143, 0.1)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap', outline: 'none' }}
                                                    className="hover-card"
                                                    onMouseOver={(e) => {
                                                        e.currentTarget.style.background = 'linear-gradient(135deg, #0A7C8F 0%, #0FB5D0 100%)';
                                                        e.currentTarget.style.color = 'white';
                                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                                        e.currentTarget.style.border = 'none';
                                                        e.currentTarget.style.outline = 'none';
                                                    }}
                                                    onMouseOut={(e) => {
                                                        e.currentTarget.style.background = '#fff';
                                                        e.currentTarget.style.color = '#0A7C8F';
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.border = 'none';
                                                        e.currentTarget.style.outline = 'none';
                                                    }}
                                                >
                                                    <MessageSquare size={16} /> Review
                                                </button>
                                                <button
                                                    onClick={() => triggerConfirm('Delete User?', `Delete ${u.name}?`, async () => {
                                                        await axios.delete(`/api/admin/user/${u.id}`);
                                                        fetchData();
                                                        fetchStats();
                                                        closeConfirm();
                                                        showSnackbar(`Total User deleted: ${u.name} (${u.login_id || u.email})`, 'success');
                                                    })}
                                                    style={{ background: '#fff', color: '#f5365c', padding: '8px 12px', width: '110px', minWidth: '110px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '700', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(245, 54, 92, 0.1)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap', outline: 'none' }}
                                                    className="hover-card"
                                                    onMouseOver={(e) => {
                                                        e.currentTarget.style.background = '#f5365c';
                                                        e.currentTarget.style.color = 'white';
                                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                                        e.currentTarget.style.border = 'none';
                                                        e.currentTarget.style.outline = 'none';
                                                    }}
                                                    onMouseOut={(e) => {
                                                        e.currentTarget.style.background = '#fff';
                                                        e.currentTarget.style.color = '#f5365c';
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.border = 'none';
                                                        e.currentTarget.style.outline = 'none';
                                                    }}
                                                >
                                                    <Trash2 size={16} /> Delete
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderResets = () => {
        const query = (searchQuery || '').toLowerCase().trim();
        const filteredResets = resets.filter(r =>
            !query ||
            (r.name && r.name.toLowerCase().includes(query)) ||
            (r.email && r.email.toLowerCase().includes(query)) ||
            (r.login_id && r.login_id.toString().toLowerCase().includes(query))
        );

        return (
            <div style={{ background: 'white', borderRadius: '1rem', overflowX: 'auto', boxShadow: '0 0 2rem rgba(0,0,0,0.05)' }}>
                {filteredResets.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#8898aa' }}>
                        <Search size={40} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                        <div>No password reset requests found{query ? ` for "${searchQuery}"` : ''}.</div>
                    </div>
                ) : (
                    <table style={{ minWidth: isMobile ? '800px' : '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f6f9fc', borderBottom: '1px solid #e9ecef' }}>
                                <th style={{ padding: '1rem', paddingLeft: '2.4rem', textAlign: 'center', fontSize: '0.8rem', color: '#8898aa', fontWeight: '600' }}>Sl.No</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#8898aa', fontWeight: '600' }}>USER</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#8898aa', fontWeight: '600', whiteSpace: 'nowrap' }}>LOGIN ID</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#8898aa', fontWeight: '600' }}>NEW PASSWORD</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#8898aa', fontWeight: '600', whiteSpace: 'nowrap' }}>DATE & TIME</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#8898aa', fontWeight: '600' }}>MANAGE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredResets.map((r, i) => (
                                <tr
                                    key={r.id}
                                    style={{
                                        borderBottom: 'none',
                                        transition: 'all 0.25s ease',
                                        position: 'relative',
                                        zIndex: 0
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-3px)';
                                        e.currentTarget.style.background = '#fff';
                                        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';
                                        e.currentTarget.style.zIndex = '1';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.boxShadow = 'none';
                                        e.currentTarget.style.zIndex = '0';
                                    }}
                                >
                                    <td style={{ padding: '1rem', paddingLeft: '2.4rem', textAlign: 'center', fontSize: '0.9rem', color: '#525f7f' }}>{i + 1}</td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <div style={{ fontWeight: '600', color: '#32325d' }}>{r.name}</div>
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9rem', color: '#525f7f' }}>{r.login_id}</td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    type={showPass[`reset-${r.id}`] ? "text" : "password"}
                                                    placeholder="Set Password"
                                                    value={confirmPass[`reset-${r.id}`] || ''}
                                                    onChange={e => setConfirmPass({ ...confirmPass, [`reset-${r.id}`]: e.target.value.replace(/\s/g, '') })}
                                                    onKeyDown={handlePasswordKeyDown}
                                                    onCopy={(e) => {
                                                        const selection = window.getSelection().toString();
                                                        if (selection) {
                                                            e.clipboardData.setData('text/plain', confirmPass[`reset-${r.id}`] || '');
                                                            e.preventDefault();
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '8px 24px 8px 8px',
                                                        fontSize: '0.8rem',
                                                        width: '120px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #cbd5e1',
                                                        outline: 'none',
                                                        color: '#334155',
                                                        textAlign: 'center'
                                                    }}
                                                />
                                                <div onClick={() => setShowPass({ ...showPass, [`reset-${r.id}`]: !showPass[`reset-${r.id}`] })} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                                                    {showPass[`reset-${r.id}`] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </div>
                                            </div>
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    type={showPass[`reset-confirm-${r.id}`] ? "text" : "password"}
                                                    placeholder="Confirm Password"
                                                    value={confirmPassRe[`reset-${r.id}`] || ''}
                                                    onChange={e => setConfirmPassRe({ ...confirmPassRe, [`reset-${r.id}`]: e.target.value.replace(/\s/g, '') })}
                                                    onKeyDown={handlePasswordKeyDown}
                                                    onCopy={(e) => {
                                                        const selection = window.getSelection().toString();
                                                        if (selection) {
                                                            e.clipboardData.setData('text/plain', confirmPassRe[`reset-${r.id}`] || '');
                                                            e.preventDefault();
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '8px 24px 8px 8px',
                                                        fontSize: '0.8rem',
                                                        width: '155px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #cbd5e1',
                                                        outline: 'none',
                                                        color: '#334155',
                                                        textAlign: 'center'
                                                    }}
                                                />
                                                <div onClick={() => setShowPass({ ...showPass, [`reset-confirm-${r.id}`]: !showPass[`reset-confirm-${r.id}`] })} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                                                    {showPass[`reset-confirm-${r.id}`] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: '#8898aa' }}>
                                        {r.created_at ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                                <div style={{ fontWeight: '600', color: '#525f7f' }}>{new Date(r.created_at).toLocaleDateString('en-IN')}</div>
                                                <div style={{ fontSize: '0.75rem', opacity: 0.8, whiteSpace: 'nowrap' }}>
                                                    {new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                </div>
                                            </div>
                                        ) : 'N/A'}
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                                            <button
                                                onClick={() => handleReset(r.id, r.user_id)}
                                                style={{ background: '#fff', color: '#0A7C8F', padding: '8px 12px', width: '110px', minWidth: '110px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '700', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(10, 124, 143, 0.1)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap', outline: 'none' }}
                                                className="hover-card"
                                                onMouseOver={(e) => {
                                                    e.currentTarget.style.background = 'linear-gradient(135deg, #0A7C8F 0%, #0FB5D0 100%)';
                                                    e.currentTarget.style.color = 'white';
                                                    e.currentTarget.style.border = 'none';
                                                    e.currentTarget.style.outline = 'none';
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                }}
                                                onMouseOut={(e) => {
                                                    e.currentTarget.style.background = '#fff';
                                                    e.currentTarget.style.color = '#0A7C8F';
                                                    e.currentTarget.style.border = 'none';
                                                    e.currentTarget.style.outline = 'none';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                }}
                                            >
                                                <RefreshCw size={16} /> Update
                                            </button>
                                            <button
                                                onClick={() => triggerConfirm('Delete Reset Request?', `Delete request for ${r.name}?`, async () => {
                                                    await axios.delete(`/api/admin/reset/${r.id}`);
                                                    fetchData();
                                                    fetchStats();
                                                    closeConfirm();
                                                    showSnackbar(`Reset Request deleted for: ${r.name} (${r.login_id})`, 'success');
                                                })}
                                                style={{ background: '#fff', color: '#f5365c', padding: '8px 12px', width: '110px', minWidth: '110px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '700', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(245, 54, 92, 0.1)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap', outline: 'none' }}
                                                className="hover-card"
                                                onMouseOver={(e) => {
                                                    e.currentTarget.style.background = '#f5365c';
                                                    e.currentTarget.style.color = 'white';
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                    e.currentTarget.style.border = 'none';
                                                    e.currentTarget.style.outline = 'none';
                                                }}
                                                onMouseOut={(e) => {
                                                    e.currentTarget.style.background = '#fff';
                                                    e.currentTarget.style.color = '#f5365c';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.border = 'none';
                                                    e.currentTarget.style.outline = 'none';
                                                }}
                                            >
                                                <Trash2 size={16} /> Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        );
    };

    // --------------------------------------------------------------------------------
    // MAIN LAYOUT
    // --------------------------------------------------------------------------------

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', background: 'transparent', fontFamily: "'Open Sans', sans-serif", position: 'relative', overflow: 'hidden' }}>
            <NeuralBackground />

            {/* Mobile Sidebar Overlay */}
            {isMobile && mobileSidebarOpen && (
                <div
                    onClick={() => setMobileSidebarOpen(false)}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)',
                        zIndex: 1001, animation: 'fadeIn 0.2s'
                    }}
                />
            )}

            {/* Sidebar */}
            <div style={{
                width: isMobile ? '280px' : (sidebarOpen ? '260px' : '60px'),
                background: 'white',
                transition: 'all 0.3s ease',
                boxShadow: '0 0 2rem rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                zIndex: isMobile ? 1002 : 100,
                position: isMobile ? 'fixed' : 'relative',
                left: isMobile ? (mobileSidebarOpen ? 0 : '-280px') : 0,
                height: '100vh'
            }}>
                <div
                    style={{ padding: '0', height: '60px', display: 'flex', alignItems: 'center', gap: '3px', borderBottom: '1px solid #f6f9fc' }}
                >
                    <div
                        onClick={() => {
                            if (isMobile) setMobileSidebarOpen(false);
                            else setSidebarOpen(!sidebarOpen);
                        }}
                        style={{
                            width: (isMobile || sidebarOpen) ? '70px' : '55px', height: '38px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer'
                        }}
                    >
                        <img src={logo} alt="Neural Chat Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                    {(isMobile || sidebarOpen) && <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0A7C8F', margin: 0, fontFamily: 'Public Sans, sans-serif', whiteSpace: 'nowrap' }}>Neural Chat</h2>}
                </div>

                <div style={{ flex: 1, padding: '0.5rem 0' }}>
                    {[
                        { id: 'overview', name: 'Dashboard', icon: LayoutDashboard },
                        { id: 'management', name: 'Total Users', icon: Users, count: stats?.totalUsers },
                        { id: 'pending', name: 'Pending Approvals', icon: UserCheck, count: stats?.pendingApprovals },
                        { id: 'resets', name: 'Reset Requests', icon: Key, count: stats?.activeResets }
                    ].map(item => (
                        <div
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            style={{
                                display: 'flex', alignItems: 'center',
                                justifyContent: (isMobile || sidebarOpen) ? 'flex-start' : 'center',
                                gap: (isMobile || sidebarOpen) ? '1rem' : '0',
                                padding: (isMobile || sidebarOpen) ? '0.8rem 1.5rem' : '0.8rem 0',
                                cursor: 'pointer',
                                marginBottom: '0.5rem',
                                transition: 'all 0.2s',
                                background: 'transparent',
                                color: activeTab === item.id ? '#0A7C8F' : '#3e4b5b',
                                position: 'relative'
                            }}
                        >
                            <item.icon size={20} style={{ color: activeTab === item.id ? '#0A7C8F' : '#adb5bd' }} />
                            {(isMobile || sidebarOpen) && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
                                    <span style={{ fontWeight: activeTab === item.id ? '700' : '400', fontSize: '0.9rem' }}>{item.name}</span>
                                    {item.count !== undefined && item.count > 0 && (
                                        <span style={{
                                            background: activeTab === item.id ? '#0A7C8F' : '#f2edf3',
                                            color: activeTab === item.id ? 'white' : '#8898aa',
                                            fontSize: '0.7rem', fontWeight: '700',
                                            padding: '2px 8px', borderRadius: '10px',
                                            minWidth: '20px', textAlign: 'center'
                                        }}>
                                            {item.count}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

                {/* Top Header */}
                <header style={{
                    height: '60px', background: 'transparent', display: 'flex', alignItems: 'center',
                    justifyContent: isMobile ? 'space-between' : 'flex-end', padding: isMobile ? '0 0.5rem' : '0 2rem'
                }}>
                    {isMobile && (
                        <div
                            onClick={() => setMobileSidebarOpen(true)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer'
                            }}
                        >
                            <div style={{ width: '40px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <img src={logo} alt="Neural Chat Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            </div>
                            <h2 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0A7C8F', margin: 0, fontFamily: 'Public Sans, sans-serif', whiteSpace: 'nowrap' }}>Neural Chat</h2>
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.75rem' : '1.5rem' }}>

                        <div style={{ position: 'relative', width: isMobile ? '110px' : '300px', marginLeft: isMobile ? '4px' : '0' }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#adb5bd' }} />
                            <input
                                type="search"
                                name="new-search-query"
                                autoComplete="new-password"
                                data-lpignore="true"
                                placeholder={isMobile ? "Search users" : "Search users by name, ID or email"}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%', padding: '10px 10px 10px 40px', borderRadius: '20px',
                                    border: '1px solid rgba(0,0,0,0.05)', background: 'rgba(255, 255, 255, 0.4)', fontSize: '0.85rem', color: '#495057'
                                }}
                            />
                        </div>
                        <div style={{ position: 'relative' }}>
                            <div
                                onClick={(e) => { e.stopPropagation(); setShowNotifications(!showNotifications); }}
                                style={{
                                    cursor: 'pointer', padding: '8px', borderRadius: '50%',
                                    background: showNotifications ? '#f0f2f5' : 'transparent',
                                    transition: 'background 0.2s', position: 'relative'
                                }}
                            >
                                <Bell size={20} color={showNotifications ? '#0FB5D0' : '#525f7f'} />
                                {adminNotifications.length > 0 && (
                                    <span style={{
                                        position: 'absolute', top: '4px', right: '4px',
                                        background: '#f5365c', color: 'white', fontSize: '0.65rem',
                                        minWidth: '16px', height: '16px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: '700', border: '2px solid white'
                                    }}>
                                        {adminNotifications.length}
                                    </span>
                                )}
                            </div>
                            {renderNotificationDropdown()}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '0.75rem', cursor: 'pointer', padding: isMobile ? '5px' : '10px', borderRadius: '10px', transition: 'background 0.2s' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden' }}>
                                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(87deg, #0A7C8F 0, #0FB5D0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                                    {adminUser.name.charAt(0)}
                                </div>
                            </div>
                            {!isMobile && <div style={{ fontWeight: '600', color: '#32325d', fontSize: '0.875rem' }}>{adminUser.name}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: isMobile ? '0.6rem' : '1.2rem', color: '#3e4b5b', alignItems: 'center', marginRight: isMobile ? '0.3rem' : '0' }}>
                            <div
                                style={{ cursor: 'pointer', display: 'flex', position: 'relative' }}
                                onClick={() => { localStorage.clear(); sessionStorage.clear(); navigate('/admin/login'); }}
                                onMouseEnter={() => setShowLogoutTooltip(true)}
                                onMouseLeave={() => setShowLogoutTooltip(false)}
                            >
                                <LogOut size={18} />
                                {showLogoutTooltip && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '45px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        color: '#0A7C8F',
                                        fontWeight: '600',
                                        fontSize: '14px',
                                        whiteSpace: 'nowrap',
                                        zIndex: 1000,
                                        pointerEvents: 'none',
                                        background: 'rgba(255, 255, 255, 0.9)',
                                        padding: '6px 14px',
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                                        backdropFilter: 'blur(5px)'
                                    }}>
                                        Logout
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Dashboard View */}
                <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: isMobile ? '1rem 1rem' : '1.5rem 2.5rem', background: 'transparent' }}>
                    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

                        {(activeTab === 'overview' || activeTab === 'management' || activeTab === 'pending' || activeTab === 'resets') && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2rem' }}>
                                <div style={{
                                    width: '36px', height: '36px',
                                    background: '#0A7C8F',
                                    borderRadius: '8px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 4px 10px rgba(10, 124, 143, 0.4)'
                                }}>
                                    {activeTab === 'overview' && <LayoutDashboard size={20} color="white" />}
                                    {activeTab === 'management' && <Users size={20} color="white" />}
                                    {activeTab === 'pending' && <UserCheck size={20} color="white" />}
                                    {activeTab === 'resets' && <Key size={20} color="white" />}
                                </div>
                                <h1 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#34334a', fontStyle: 'normal', margin: 0 }}>
                                    {activeTab === 'overview' && 'Dashboard'}
                                    {activeTab === 'management' && 'Total Users'}
                                    {activeTab === 'pending' && 'Pending Approvals'}
                                    {activeTab === 'resets' && 'Reset Requests'}
                                </h1>
                                <div style={{ flex: 1 }}></div>
                            </div>
                        )}

                        {loading ? (
                            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8898aa' }}>Loading content...</div>
                        ) : (
                            <>
                                {activeTab === 'overview' && renderOverview()}
                                {activeTab === 'management' && renderUsersList('management')}
                                {activeTab === 'pending' && renderUsersList('pending')}
                                {activeTab === 'resets' && renderResets()}
                            </>
                        )}
                    </div>
                </main>
            </div>

            {/* Chat Overlays & Modals (Overhauled for premium look) */}
            {viewChat && (
                <div
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(50,50,93,0.3)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                    onClick={() => setViewChat(null)}
                >
                    <div
                        style={{ background: 'white', width: isMobile ? '95%' : '90%', maxWidth: '800px', height: isMobile ? '90vh' : '85vh', borderRadius: '1.5rem', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 50px 100px rgba(50,50,93,0.1), 0 15px 35px rgba(50,50,93,0.15)', position: 'relative' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ padding: isMobile ? '1rem' : '1.5rem', background: 'linear-gradient(87deg, #0A7C8F 0, #0FB5D0 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: isMobile ? '0.75rem' : '0' }}>
                            <div style={{ textAlign: 'left', flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
                                <h3 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.2rem', fontWeight: '700' }}>Review Chat: {viewChat.user.name}</h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: isMobile ? '0.7rem' : '0.8rem', opacity: 0.9 }}>Viewing logs for monitoring</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.5rem' : '1rem', marginLeft: isMobile ? '0' : 'auto', flex: isMobile ? '1 1 100%' : '0 0 auto', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                                {(chatStep === 'years' || chatStep === 'months' || chatStep === 'dates') && (
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: isMobile ? '1 1 auto' : '0 0 auto' }}>
                                        <Search size={16} style={{ position: 'absolute', left: '12px', color: 'rgba(255,255,255,0.7)' }} />
                                        <input
                                            type="text"
                                            placeholder="Search date..."
                                            className="date-search-input"
                                            value={dateSearchQuery}
                                            onChange={(e) => setDateSearchQuery(e.target.value)}
                                            style={{
                                                background: 'rgba(255,255,255,0.15)',
                                                border: 'none',
                                                borderRadius: '20px',
                                                padding: isMobile ? '6px 12px 6px 32px' : '6px 12px 6px 35px',
                                                color: 'white',
                                                fontSize: isMobile ? '0.75rem' : '0.85rem',
                                                outline: 'none',
                                                width: isMobile ? '100%' : '180px',
                                                transition: 'all 0.2s'
                                            }}
                                        />
                                    </div>
                                )}
                                {chatStep !== 'contacts' && (
                                    <button
                                        onClick={() => {
                                            if (chatStep === 'messages') setChatStep('dates');
                                            else if (chatStep === 'dates') setChatStep('months');
                                            else if (chatStep === 'months') setChatStep('years');
                                            else if (chatStep === 'years') setChatStep('contacts');
                                        }}
                                        style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: isMobile ? '6px 12px' : '6px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: isMobile ? '0.8rem' : '0.9rem', fontWeight: '700', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                                        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                                    >
                                        Back
                                    </button>
                                )}
                                <button
                                    onClick={() => setViewChat(null)}
                                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: isMobile ? '6px 12px' : '6px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: isMobile ? '0.8rem' : '0.9rem', fontWeight: '700', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                                    onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                                >
                                    Close
                                </button>
                            </div>
                        </div>

                        <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', background: '#f8f9fe' }}>
                            {loadingChat ? (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8898aa' }}>Loading logs...</div>
                            ) : (
                                <>
                                    {chatStep === 'contacts' && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                                            {chatContacts.filter(c => c.type !== 'ai' && c.name !== 'AI Assistant').map(c => (
                                                <div key={c.id} onClick={() => handleSelectContact(c)} style={{ background: 'white', padding: '1rem', borderRadius: '1rem', border: '1px solid #e9ecef', cursor: 'pointer', transition: 'all 0.2s' }} className="hover-card">
                                                    <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#32325d' }}>{c.name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#8898aa' }}>{c.type === 'ai' ? 'Automated Assistant' : (c.type === 'group' ? 'Group Chat' : 'Peer-to-Peer Chat')}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {chatStep === 'years' && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
                                            {[...new Set(chatDates.map(d => d.split('-')[0]))]
                                                .filter(y => y.includes(dateSearchQuery))
                                                .sort((a, b) => a - b)
                                                .map(year => (
                                                    <div key={year} onClick={() => handleSelectYear(year)} style={{ background: 'white', padding: '1.5rem 1rem', borderRadius: '1.2rem', border: '1px solid #e9ecef', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="hover-card">
                                                        <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#32325d' }}>{year}</div>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                    {chatStep === 'months' && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
                                            {[...new Set(chatDates.filter(d => d.startsWith(selectedYear)).map(d => d.split('-')[1]))]
                                                .sort((a, b) => a - b)
                                                .filter(m => {
                                                    const monthName = new Date(selectedYear, parseInt(m) - 1).toLocaleString('default', { month: 'long' });
                                                    return monthName.toLowerCase().includes(dateSearchQuery.toLowerCase()) || m.includes(dateSearchQuery);
                                                })
                                                .map(m => {
                                                    const monthName = new Date(selectedYear, parseInt(m) - 1).toLocaleString('default', { month: 'long' });
                                                    return (
                                                        <div key={m} onClick={() => handleSelectMonth(m)} style={{ background: 'white', padding: '1.5rem 1rem', borderRadius: '1.2rem', border: '1px solid #e9ecef', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }} className="hover-card">
                                                            <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#32325d' }}>{monthName}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#8898aa', marginTop: '4px' }}>{selectedYear}</div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    )}
                                    {chatStep === 'dates' && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
                                            {chatDates
                                                .filter(d => d.startsWith(`${selectedYear}-${selectedMonth}`))
                                                .filter(d => {
                                                    const [y, m, day] = d.split('-');
                                                    const formatted = `${day}-${m}-${y}`;
                                                    return formatted.includes(dateSearchQuery) || d.includes(dateSearchQuery);
                                                })
                                                .map(d => {
                                                    const [year, month, day] = d.split('-');
                                                    const formattedDate = `${day}-${month}-${year}`;
                                                    return (
                                                        <div key={d} onClick={() => handleSelectDate(d)} style={{ background: 'white', padding: '1rem', borderRadius: '1rem', border: '1px solid #e9ecef', cursor: 'pointer', textAlign: 'center' }}>
                                                            <Calendar size={20} color="#0A7C8F" style={{ marginBottom: '0.5rem' }} />
                                                            <div style={{ fontSize: '0.875rem', fontWeight: '600' }}>{formattedDate}</div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    )}
                                    {chatStep === 'messages' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {viewChat.messages.map((msg, i) => {
                                                const isMe = String(msg.user_id?._id || msg.user_id) === String(viewChat.user.id || viewChat.user._id);
                                                const isDeleted = msg.is_deleted_by_admin || msg.is_deleted_by_user;
                                                const msgId = msg._id || msg.id;
                                                const isSelected = selectedMsgs.includes(msgId);

                                                return (
                                                    <div
                                                        key={i}
                                                        id={`msg-container-${msg._id || msg.id}`}
                                                        style={{
                                                            width: '100%',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            padding: '8px 0',
                                                            transition: 'background 0.3s'
                                                        }}
                                                    >
                                                        {msg.role === 'system' ? (
                                                            <div style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                margin: '20px 0',
                                                                position: 'relative'
                                                            }}>
                                                                <div style={{
                                                                    position: 'absolute',
                                                                    left: 0,
                                                                    right: 0,
                                                                    height: '1px',
                                                                    background: '#e9ecef',
                                                                    zIndex: 1
                                                                }}></div>
                                                                <div style={{
                                                                    background: '#f8f9fa',
                                                                    padding: '4px 16px',
                                                                    borderRadius: '20px',
                                                                    fontSize: '0.75rem',
                                                                    color: '#8898aa',
                                                                    fontWeight: '600',
                                                                    zIndex: 2,
                                                                    border: '1px solid #e9ecef',
                                                                    textTransform: 'uppercase',
                                                                    letterSpacing: '0.5px'
                                                                }}>
                                                                    {msg.content}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div
                                                                id={`msg-${msg._id || msg.id}`}
                                                                style={{
                                                                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                                                                    maxWidth: '85%',
                                                                    display: 'flex',
                                                                    flexDirection: isMe ? 'row-reverse' : 'row',
                                                                    alignItems: 'flex-start',
                                                                    gap: '4px',
                                                                    padding: '0 12px'
                                                                }}
                                                            >
                                                                {selectionMode && !isDeleted && (
                                                                    <div
                                                                        onClick={() => toggleSelectMsg(msgId)}
                                                                        style={{
                                                                            width: '20px', height: '20px', borderRadius: '50%',
                                                                            border: `2px solid ${isSelected ? '#0FB5D0' : '#ced4da'}`,
                                                                            background: isSelected ? '#0FB5D0' : 'transparent',
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            cursor: 'pointer', transition: 'all 0.2s',
                                                                            flexShrink: 0,
                                                                            marginTop: '8px' // Align with the top of the bubble
                                                                        }}
                                                                    >
                                                                        {isSelected && <Check size={12} color="white" />}
                                                                    </div>
                                                                )}
                                                                <div
                                                                    onClick={() => selectionMode && !isDeleted && toggleSelectMsg(msgId)}
                                                                    style={{
                                                                        display: 'flex', flexDirection: 'column',
                                                                        alignItems: isMe ? 'flex-end' : 'flex-start',
                                                                        cursor: selectionMode ? 'pointer' : 'default',
                                                                        opacity: (selectionMode && !isSelected) ? 0.7 : 1,
                                                                        transition: 'all 0.2s'
                                                                    }}
                                                                >
                                                                    <div
                                                                        className="wa-message-bubble"
                                                                        style={{
                                                                            padding: '0.75rem 1rem', borderRadius: '1.2rem',
                                                                            background: isMe ? '#0B8195' : 'white',
                                                                            color: isMe ? 'white' : '#32325d',
                                                                            boxShadow: isSelected ? '0 0 0 3px rgba(15, 181, 208, 0.3)' : '0 4px 6px rgba(50,50,93,0.1)',
                                                                            border: isMe ? 'none' : '1px solid #e9ecef',
                                                                            borderBottomRightRadius: isMe ? '0' : '1.2rem',
                                                                            borderBottomLeftRadius: isMe ? '1.2rem' : '0',
                                                                            position: 'relative',
                                                                            transition: 'all 0.2s',
                                                                            width: 'fit-content',
                                                                            maxWidth: '100%',
                                                                            wordBreak: 'normal',
                                                                            overflowWrap: 'anywhere'
                                                                        }}
                                                                    >
                                                                        {selectedContact?.type === 'group' && !isMe && (
                                                                            <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#0A7C8F', marginBottom: '4px' }}>
                                                                                {msg.sender_name || 'User'}
                                                                            </div>
                                                                        )}
                                                                        {!isDeleted && !selectionMode && (
                                                                            <div
                                                                                className="dropdown-trigger"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setMsgDropdown({ id: msgId, x: e.clientX, y: e.clientY });
                                                                                }}
                                                                                style={{
                                                                                    position: 'absolute', top: '8px', right: '8px',
                                                                                    left: 'auto', color: isMe ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.6)',
                                                                                    cursor: 'pointer', opacity: 0, transition: 'opacity 0.2s'
                                                                                }}
                                                                            >
                                                                                <ChevronDown size={14} />
                                                                            </div>
                                                                        )}

                                                                        {msg.is_deleted_by_admin && (
                                                                            <div style={{ fontSize: '0.75rem', marginBottom: '6px', display: 'flex', alignItems: 'center', color: isMe ? 'rgba(255,255,255,0.9)' : '#f5365c', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                                                                <Trash2 size={12} style={{ marginRight: '4px' }} /> Deleted by Admin
                                                                            </div>
                                                                        )}
                                                                        {msg.is_flagged && !isDeleted && (
                                                                            <div style={{ fontSize: '0.75rem', marginBottom: '6px', display: 'flex', alignItems: 'center', color: '#7D1802', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                                                                <AlertTriangle size={12} style={{ marginRight: '4px' }} /> Unethical: {msg.flag_reason || 'Flagged'}
                                                                            </div>
                                                                        )}
                                                                        {msg.is_deleted_by_user && (
                                                                            <div style={{ fontSize: '0.85rem', marginBottom: '6px', display: 'flex', alignItems: 'center', color: isMe ? 'rgba(255,255,255,0.9)' : '#8898aa', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                                                                <XCircle size={14} style={{ marginRight: '4px' }} /> Deleted by User
                                                                            </div>
                                                                        )}

                                                                        {renderLinkPreview(msg)}

                                                                        <div style={{ opacity: isDeleted ? 0.6 : 1, marginTop: msg.link_preview ? '10px' : '0', whiteSpace: 'pre-wrap' }}>
                                                                            {renderContent(msg.content)}
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ fontSize: '0.7rem', color: '#8898aa', marginTop: '4px', textAlign: isMe ? 'right' : 'left' }}>
                                                                        {isMe ? 'You' : (selectedContact.name)} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            <div ref={chatEndRef} />
                                        </div>
                                    )
                                    }
                                </>
                            )}
                        </div>
                        {renderSelectionBar()}
                    </div>
                </div>
            )
            }

            {/* Global Confirms & Notifications */}
            {renderMsgDropdown()}
            {snackbar && <Snackbar message={snackbar.message} type={snackbar.type} senderName={snackbar.senderName} onClose={closeSnackbar} />}
            <ConfirmModal isOpen={!!confirmConfig} {...confirmConfig} onCancel={closeConfirm} />

            {/* Unethical Content Alert Popup */}
            {/* Unethical Content Alert Modal */}
            {showUnethicalModal && unethicalAlerts.length > 0 && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)'
                }} onClick={() => setShowUnethicalModal(false)}>
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.95)', borderRadius: '16px',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                        width: '450px', maxWidth: '90%',
                        overflow: 'hidden', animation: 'scaleIn 0.2s ease-out',
                        backdropFilter: 'blur(10px)'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{
                            background: '#DB2A04', color: 'white', padding: '16px 20px',
                            fontWeight: '700', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <AlertTriangle size={20} />
                                Unethical Content Detected
                            </div>
                            <X size={20} style={{ cursor: 'pointer', opacity: 0.8 }} onClick={() => setShowUnethicalModal(false)} />
                        </div>

                        <div style={{ padding: '0', maxHeight: '400px', overflowY: 'auto' }}>
                            {!unethicalModalUser ? (
                                // Level 1: List Users
                                <div style={{ padding: '10px' }}>
                                    <div style={{ padding: '10px', fontSize: '0.9rem', color: '#525f7f', fontWeight: '600' }}>
                                        Users with flagged messages:
                                    </div>
                                    {Object.values(groupedUnethicalAlerts).map(group => (
                                        <div
                                            key={group.userId}
                                            onClick={() => setUnethicalModalUser(group)}
                                            style={{
                                                padding: '12px 16px', margin: '6px',
                                                background: '#E72C05', border: '1px solid rgba(0,0,0,0.05)',
                                                borderRadius: '8px', cursor: 'pointer',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                transition: 'all 0.2s',
                                                boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
                                            }}
                                            onMouseOver={e => {
                                                e.currentTarget.style.background = '#cf2504';
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                e.currentTarget.style.boxShadow = '0 5px 15px rgba(0,0,0,0.1)';
                                            }}
                                            onMouseOut={e => {
                                                e.currentTarget.style.background = '#E72C05';
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div>
                                                    <div className="user-name" style={{ fontWeight: '700', color: 'white', transition: 'color 0.2s' }}>{group.userName}</div>
                                                    <div className="user-sub" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', transition: 'color 0.2s' }}>{group.alerts.length} Flagged Message{group.alerts.length > 1 ? 's' : ''}</div>
                                                </div>
                                            </div>
                                            <ChevronDown className="user-icon" size={18} style={{ transform: 'rotate(-90deg)', color: 'rgba(255,255,255,0.8)', transition: 'color 0.2s' }} />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                // Level 2: List Messages for User
                                <div>
                                    <div style={{ padding: '12px 20px', background: '#f8f9fe', borderBottom: '1px solid #e9ecef', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div
                                            onClick={() => setUnethicalModalUser(null)}
                                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: '#525f7f', fontWeight: '600' }}
                                        >
                                            <ChevronDown size={16} style={{ transform: 'rotate(90deg)' }} /> Back
                                        </div>
                                        <div style={{ height: '20px', borderLeft: '1px solid #ccc', margin: '0 8px' }}></div>
                                        <div style={{ fontWeight: '700', color: '#32325d' }}>{unethicalModalUser.userName}'s Messages</div>
                                    </div>
                                    <div style={{ padding: '10px' }}>
                                        {unethicalModalUser.alerts.map((alert, idx) => {
                                            const receiver = alert.receiverId ? (users.find(u => (u.id === alert.receiverId || u._id === alert.receiverId)) || { name: 'Unknown User' }) : { name: 'AI Assistant' };
                                            return (
                                                <div
                                                    key={idx}
                                                    onClick={() => handleViewAlert(alert)}
                                                    style={{
                                                        padding: '12px', margin: '8px 4px',
                                                        background: 'white', border: '1px solid #e9ecef',
                                                        borderRadius: '8px', cursor: 'pointer',
                                                        boxShadow: '0 2px 5px rgba(0,0,0,0.03)',
                                                        transition: 'transform 0.1s'
                                                    }}
                                                    onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                                    onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                                                >
                                                    <div style={{ fontSize: '0.9rem', color: '#32325d', marginBottom: '6px', fontWeight: '500' }}>
                                                        {alert.content.length > 60 ? alert.content.substring(0, 60) + '...' : alert.content}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <div style={{ fontSize: '0.75rem', color: '#525f7f', fontWeight: '600' }}>
                                                            Chatted with: <span style={{ color: '#0A7C8F' }}>{receiver.name}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#ff4d4d' }}>
                                                                Reason: {alert.reason || 'Unethical Content Detected'}
                                                            </div>
                                                            <div style={{ fontSize: '0.7rem', color: '#8898aa' }}>
                                                                {new Date(alert.createdAt).toLocaleDateString()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                .hover-row { transition: all 0.25s ease; }
                .hover-card:hover { transform: translateY(-2px); }
                .wa-message-bubble:hover .dropdown-trigger { opacity: 1 !important; }
                .date-search-input::placeholder { color: rgba(255,255,255,0.9) !important; }
                input[type="password"] { user-select: text !important; -webkit-user-select: text !important; }
                @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-thumb { background: #e9ecef; borderRadius: 3px; }
                .recharts-bar-rectangle, .recharts-pie-sector, .recharts-bar-cursor, .recharts-sector, .recharts-surface, .recharts-wrapper, path, rect, g { outline: none !important; }
                *:focus { outline: none !important; }
            `}</style>
        </div>
    );
}
