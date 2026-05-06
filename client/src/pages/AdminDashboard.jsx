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
    TrendingUp, Calendar, ChevronRight, X, Layers, Check, RefreshCw, Forward, ChevronDown, XCircle,
    Mic, Pause, Play, List, History, ShieldCheck, MapPin, Video, Phone, Ban
} from 'lucide-react';
import { io } from 'socket.io-client';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import logo from '../assets/logo.png';

const formatEventTimeString = (startDate, startTime, endDate, endTime) => {
    if (!startDate && !startTime) return '';
    const isToday = (d) => {
        const today = new Date();
        return d.getDate() === today.getDate() &&
            d.getMonth() === today.getMonth() &&
            d.getFullYear() === today.getFullYear();
    };
    const isTomorrow = (d) => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return d.getDate() === tomorrow.getDate() &&
            d.getMonth() === tomorrow.getMonth() &&
            d.getFullYear() === tomorrow.getFullYear();
    };
    const formatPart = (ds, ts) => {
        if (!ds) return ts || '';
        const d = new Date(ds);
        if (isNaN(d.getTime())) return '';
        let dateStr = '';
        if (isToday(d)) dateStr = 'Today';
        else if (isTomorrow(d)) dateStr = 'Tomorrow';
        else dateStr = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        return ts ? `${dateStr}, ${ts}` : dateStr;
    };

    const startStr = formatPart(startDate, startTime);
    if (endDate && endTime) {
        const endStr = formatPart(endDate, endTime);
        return `${startStr} - ${endStr}`;
    }
    return startStr;
};

const ADMIN_PILL_GRADIENT = 'linear-gradient(135deg, #1498ff 0%, #2e7bff 48%, #4e59ff 100%)';
const THEME_SERIES_COLORS = ['#1a9cff', '#2e7bff', '#4e59ff', '#6e72ff', '#73a8ff', '#8ed2ff'];
const OFFICIAL_PANEL_SURFACE = 'linear-gradient(180deg, rgba(10, 18, 36, 0.94) 0%, rgba(13, 23, 42, 0.9) 100%)';
const OFFICIAL_PANEL_BORDER = '1px solid rgba(148, 163, 184, 0.14)';
const OFFICIAL_PANEL_SHADOW = '0 24px 60px rgba(2, 6, 23, 0.28)';
const OFFICIAL_TEXT_PRIMARY = '#f8fafc';
const OFFICIAL_TEXT_SECONDARY = '#cbd5e1';
const OFFICIAL_TEXT_MUTED = '#94a3b8';
const ADMIN_ACTION_SURFACE = 'linear-gradient(135deg, #0ea5e9 0%, #4f46e5 100%)';
const ADMIN_ACTION_BORDER = 'none';

const appendMediaToken = (url) => {
    if (!url) return '';
    const apiBase = (axios.defaults.baseURL || '').replace(/\/$/, '');
    const apiOrigin = apiBase.replace(/\/api$/i, '');
    const token = localStorage.getItem('token') || '';

    try {
        const parsed = new URL(url, window.location.origin);
        if (!parsed.pathname.startsWith('/api/chat/media')) return url;
        if (token) parsed.searchParams.set('token', token);
        if (apiOrigin) return `${apiOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
        if (/^https?:\/\//i.test(url)) return parsed.toString();
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (_) {
        if (!String(url).includes('/api/chat/media')) return url;
        if (!token) return apiOrigin && String(url).startsWith('/api/chat/media') ? `${apiOrigin}${url}` : url;
        const withoutToken = String(url)
            .replace(/([?&])token=[^&#]*&?/i, '$1')
            .replace(/[?&]$/g, '');
        const tokenized = withoutToken.includes('?')
            ? `${withoutToken}&token=${encodeURIComponent(token)}`
            : `${withoutToken}?token=${encodeURIComponent(token)}`;
        return apiOrigin && tokenized.startsWith('/api/chat/media') ? `${apiOrigin}${tokenized}` : tokenized;
    }
};

const getAdminMediaUrl = (rawPath) => {
    if (!rawPath) return '';
    const raw = String(rawPath);
    if (raw.startsWith('blob:') || raw.startsWith('data:')) return raw;
    if (/^https?:\/\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            if (parsed.pathname.startsWith('/uploads/')) {
                return appendMediaToken(`/api/chat/media?path=${encodeURIComponent(parsed.pathname)}`);
            }
            if (parsed.pathname.startsWith('/api/chat/media')) {
                return appendMediaToken(`${parsed.pathname}${parsed.search || ''}`);
            }
        } catch (_) { }
        return raw;
    }

    const normalized = raw.startsWith('/') ? raw : `/${raw.replace(/^\/+/, '')}`;
    if (normalized.startsWith('/uploads/')) {
        return appendMediaToken(`/api/chat/media?path=${encodeURIComponent(normalized)}`);
    }
    if (normalized.startsWith('/api/chat/media')) {
        return appendMediaToken(normalized);
    }

    const base = (axios.defaults.baseURL || '').replace(/\/$/, '');
    return base ? `${base}/${raw.replace(/^\//, '')}` : normalized;
};

const ACTION_BUTTON_META = {
    primary: {
        color: '#ffffff',
        hoverBackground: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 48%, #4f46e5 100%)',
        hoverColor: '#ffffff',
        baseBackground: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 48%, #4f46e5 100%)',
        baseShadow: '0 12px 24px rgba(14, 165, 233, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.16)',
        hoverShadow: '0 14px 28px rgba(14, 165, 233, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.18)'
    },
    danger: {
        color: '#ffffff',
        hoverBackground: 'linear-gradient(135deg, #ef4444 0%, #fb7185 48%, #be123c 100%)',
        hoverColor: '#ffffff',
        baseBackground: 'linear-gradient(135deg, #ef4444 0%, #fb7185 48%, #be123c 100%)',
        baseShadow: '0 12px 24px rgba(239, 68, 68, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.16)',
        hoverShadow: '0 14px 28px rgba(239, 68, 68, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.18)'
    }
};

const METRIC_META = {
    totalUsers: {
        label: 'Total Users',
        shortLabel: 'Users',
        subtext: 'Total registered members',
        icon: TrendingUp,
        color: '#1a9cff',
        gradient: ADMIN_PILL_GRADIENT,
        onClickTab: 'management'
    },
    pendingApprovals: {
        label: 'Pending Approvals',
        shortLabel: 'Pending',
        subtext: 'Waiting for your review',
        icon: LayoutDashboard,
        color: '#2e7bff',
        gradient: ADMIN_PILL_GRADIENT,
        onClickTab: 'pending'
    },
    activeResets: {
        label: 'Reset Requests',
        shortLabel: 'Resets',
        subtext: 'Active password reset tasks',
        icon: Key,
        color: '#4e59ff',
        gradient: ADMIN_PILL_GRADIENT,
        onClickTab: 'resets'
    },
    unblockRequests: {
        label: 'Unblock Requests',
        shortLabel: 'Unblock',
        subtext: 'Users requesting restoration',
        icon: ShieldCheck,
        color: '#6e72ff',
        gradient: ADMIN_PILL_GRADIENT,
        onClickTab: 'unblock'
    },
    totalBlocks: {
        label: 'Block Actions',
        shortLabel: 'Blocks',
        subtext: 'Total p2p block actions',
        icon: Ban,
        color: '#38bdf8',
        gradient: ADMIN_PILL_GRADIENT,
        actionDetail: 'block'
    },
    totalReports: {
        label: 'Report Actions',
        shortLabel: 'Reports',
        subtext: 'Total reports submitted',
        icon: AlertTriangle,
        color: '#2e7bff',
        gradient: ADMIN_PILL_GRADIENT,
        actionDetail: 'report'
    }
};

const SERIES_META = {
    approved: { label: 'Approved Users', shortLabel: 'Approved', color: '#1a9cff', totalKey: 'totalUsers' },
    pending: { label: 'Pending Approvals', shortLabel: 'Pending', color: '#2e7bff', totalKey: 'pendingApprovals' },
    resets: { label: 'Reset Requests', shortLabel: 'Resets', color: '#4e59ff', totalKey: 'activeResets' },
    unblocks: { label: 'Unblock Requests', shortLabel: 'Unblock', color: '#6e72ff', totalKey: 'unblockRequests' },
    blocks: { label: 'Block Actions', shortLabel: 'Blocks', color: '#73a8ff', totalKey: 'totalBlocks' },
    reports: { label: 'Report Actions', shortLabel: 'Reports', color: '#8ed2ff', totalKey: 'totalReports' }
};

const prettifyMetricKey = (key) => key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getMetricMeta = (key, index = 0) => {
    const known = METRIC_META[key];
    if (known) return known;

    const color = THEME_SERIES_COLORS[index % THEME_SERIES_COLORS.length];
    return {
        label: prettifyMetricKey(key),
        shortLabel: prettifyMetricKey(key),
        subtext: 'Live metric from admin statistics',
        icon: Layers,
        color,
        gradient: ADMIN_PILL_GRADIENT
    };
};

const getSeriesMeta = (key, index = 0) => {
    const known = SERIES_META[key];
    if (known) return known;

    return {
        label: prettifyMetricKey(key),
        shortLabel: prettifyMetricKey(key),
        color: THEME_SERIES_COLORS[index % THEME_SERIES_COLORS.length]
    };
};

const getChartSeriesKeys = (data = []) => {
    const keySet = new Set();
    data.forEach((item) => {
        Object.keys(item || {}).forEach((key) => {
            if (key !== 'name') keySet.add(key);
        });
    });
    return Array.from(keySet);
};

const CustomTooltip = ({ active, payload, label, seriesMetaMap }) => {
    const isMobile = window.innerWidth <= 768;
    if (active && payload && payload.length) {
        const formattedLabel = (() => {
            if (!label || typeof label !== 'string' || !label.includes('-')) return label;
            const parts = label.split('-');
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            if (parts.length === 3) {
                return `${parseInt(parts[2])} ${monthNames[parseInt(parts[1]) - 1]} ${parts[0]}`;
            } else if (parts.length === 2) {
                return `${monthNames[parseInt(parts[1]) - 1]} ${parts[0]}`;
            }
            return label;
        })();

        return (
            <div style={{
                background: 'rgba(8, 15, 32, 0.96)',
                padding: isMobile ? '6px 10px' : '10px 15px',
                borderRadius: '14px',
                boxShadow: '0 16px 40px rgba(2, 6, 23, 0.45)',
                border: '1px solid rgba(43, 201, 228, 0.2)',
                position: 'relative',
                zIndex: 1000,
                whiteSpace: 'nowrap'
            }}>
                <p style={{ margin: '0 0 6px', fontWeight: '700', color: '#f8fafc', fontSize: isMobile ? '11px' : '14px' }}>{formattedLabel}</p>
                {payload.map((entry) => {
                    const meta = seriesMetaMap?.[entry.dataKey] || getSeriesMeta(entry.dataKey);
                    return (
                        <p key={entry.dataKey} style={{ margin: 0, color: meta.color, fontSize: isMobile ? '10px' : '13px', fontWeight: '600' }}>
                            {isMobile ? meta.shortLabel : meta.label} : {entry.value || 0}
                        </p>
                    );
                })}
            </div>
        );
    }
    return null;
};

const PieTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;

    const entry = payload[0]?.payload;
    if (!entry) return null;

    return (
        <div style={{
            background: 'rgba(8, 15, 32, 0.96)',
            padding: '10px 14px',
            borderRadius: '14px',
            border: '1px solid rgba(78, 89, 255, 0.24)',
            boxShadow: '0 16px 40px rgba(2, 6, 23, 0.45)',
            color: OFFICIAL_TEXT_PRIMARY
        }}>
            <div style={{ fontSize: '0.9rem', fontWeight: '700', color: OFFICIAL_TEXT_PRIMARY }}>{entry.label}</div>
            <div style={{ fontSize: '0.82rem', fontWeight: '600', color: entry.color }}>{entry.value}</div>
        </div>
    );
};

const getActionButtonStyle = (variant = 'primary') => {
    const meta = ACTION_BUTTON_META[variant] || ACTION_BUTTON_META.primary;
    return {
        background: meta.baseBackground || ADMIN_ACTION_SURFACE,
        color: meta.color,
        padding: '7px 11px',
        width: '104px',
        minWidth: '104px',
        borderRadius: '0.8rem',
        cursor: 'pointer',
        fontSize: '0.9rem',
        fontWeight: '700',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: meta.baseShadow || '0 10px 25px rgba(14, 165, 233, 0.3)',
        border: ADMIN_ACTION_BORDER,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        whiteSpace: 'nowrap',
        outline: 'none',
        appearance: 'none'
    };
};

const applyActionButtonHover = (element, variant = 'primary', hovered = true) => {
    const meta = ACTION_BUTTON_META[variant] || ACTION_BUTTON_META.primary;
    element.style.background = hovered ? meta.hoverBackground : (meta.baseBackground || ADMIN_ACTION_SURFACE);
    element.style.border = ADMIN_ACTION_BORDER;
    element.style.color = hovered ? meta.hoverColor : meta.color;
    element.style.transform = hovered ? 'translateY(-3px) scale(1.02)' : 'translateY(0) scale(1)';
    element.style.boxShadow = hovered ? (meta.hoverShadow || '0 15px 35px rgba(14, 165, 233, 0.45)') : (meta.baseShadow || '0 10px 25px rgba(14, 165, 233, 0.3)');
    element.style.outline = 'none';
    element.style.outlineOffset = '0';
};

export default function AdminDashboard() {
    const navigate = useNavigate();
    const hostname = window.location.hostname || '';
    const isLanOrLocal =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

    // 1. State Declarations
    const [activeTab, setActiveTab] = useState(() => {
        const savedTab = sessionStorage.getItem('adminActiveTab') || 'overview';
        if (savedTab === 'block-members') return 'block-actions';
        if (savedTab === 'report-members') return 'report-actions';
        return savedTab;
    });
    const [stats, setStats] = useState(null);
    const [chartPeriod, setChartPeriod] = useState('day'); // 'day', 'month', 'year'
    const [users, setUsers] = useState([]);
    const [resets, setResets] = useState([]);
    const [reactionLogs, setReactionLogs] = useState([]);
    const [selectedReactionMsg, setSelectedReactionMsg] = useState(null); // For message-specific audit card
    const [selectedEventMsg, setSelectedEventMsg] = useState(null); // For event-specific audit log
    const [loading, setLoading] = useState(true);

    const fetchReactionLogs = async () => {
        try {
            const res = await axios.get('/api/admin/reaction-logs');
            setReactionLogs(res.data);
        } catch (err) {
            console.error('Failed to fetch reaction logs:', err);
        }
    };

    // Auth & Visibility States
    const [confirmPass, setConfirmPass] = useState({});
    const [confirmPassRe, setConfirmPassRe] = useState({});
    const [loginIds, setLoginIds] = useState({});
    const [showPass, setShowPass] = useState({});
    const [showPassRe, setShowPassRe] = useState({});

    // Audio Playback State
    const [playingAudioId, setPlayingAudioId] = useState(null);
    const audioInstanceRef = useRef(null);

    const handlePlayAudio = (msgId, filePath) => {
        if (playingAudioId === msgId) {
            audioInstanceRef.current?.pause();
            setPlayingAudioId(null);
        } else {
            if (audioInstanceRef.current) {
                audioInstanceRef.current.pause();
                audioInstanceRef.current.onended = null;
            }
            const audio = new Audio(filePath);
            audioInstanceRef.current = audio;
            setPlayingAudioId(msgId);
            audio.play().catch(err => console.error("Audio playback error:", err));
            audio.onended = () => setPlayingAudioId(null);
        }
    };



    // Chat Review State
    const [viewChat, setViewChat] = useState(null);
    const [viewingMedia, setViewingMedia] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [loadingChat, setLoadingChat] = useState(false);
    const [chatStep, setChatStep] = useState('contacts');
    const [chatContacts, setChatContacts] = useState([]);
    const [chatDates, setChatDates] = useState([]);
    const [selectedContact, setSelectedContact] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, messageId: null });
    const [viewingContact, setViewingContact] = useState(null);

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
    const mainScrollRef = useRef(null);
    const reviewScrollRef = useRef(null);

    // Sidebar & UI State
    const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1024);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [canScrollUp, setCanScrollUp] = useState(false);
    const [canScrollDown, setCanScrollDown] = useState(false);
    const [showScrollControl, setShowScrollControl] = useState(false);
    const [scrollControlTop, setScrollControlTop] = useState(50);
    const [isDraggingScrollControl, setIsDraggingScrollControl] = useState(false);
    const [reviewCanScrollUp, setReviewCanScrollUp] = useState(false);
    const [reviewCanScrollDown, setReviewCanScrollDown] = useState(false);
    const [reviewScrollControlTop, setReviewScrollControlTop] = useState(50);
    const [isDraggingReviewScrollControl, setIsDraggingReviewScrollControl] = useState(false);
    const [highlightedRedirectRow, setHighlightedRedirectRow] = useState(null);
    const [actionAuditView, setActionAuditView] = useState(null);
    const scrollHideTimerRef = useRef(null);

    const isBlockReportRestorationRequest = (user) => {
        const reason = String(user?.unblockRequestReason || '').toLowerCase();
        return Boolean(user?.unblockRequested && reason.includes('block/report'));
    };

    const normalizedStats = useMemo(() => {
        if (!stats) return null;

        return {
            ...stats,
            unblockRequests: users.filter((user) => user.unblockRequested && !isBlockReportRestorationRequest(user)).length
        };
    }, [stats, users]);

    const overviewMetrics = useMemo(() => {
        if (!normalizedStats) return [];

        return Object.entries(normalizedStats)
            .filter(([key]) => !['blockMembers', 'reportMembers'].includes(key))
            .filter(([_, value]) => typeof value === 'number' && Number.isFinite(value))
            .map(([key, value], index) => ({
                key,
                value,
                ...getMetricMeta(key, index)
            }));
    }, [normalizedStats]);

    const activeChartData = useMemo(() => {
        const source = normalizedStats?.chartData?.[chartPeriod] || [];
        return source.map((item) => ({
            ...item,
            approved: Number(item?.approved) || 0,
            pending: Number(item?.pending) || 0,
            resets: Number(item?.resets) || 0,
            unblocks: Number(item?.unblocks ?? item?.unblockRequests) || 0,
            blocks: Number(item?.blocks) || 0,
            reports: Number(item?.reports) || 0
        }));
    }, [normalizedStats, chartPeriod]);

    const chartSeriesKeys = useMemo(() => getChartSeriesKeys(activeChartData), [activeChartData]);

    const chartSeries = useMemo(() => (
        chartSeriesKeys.map((key, index) => ({
            key,
            ...getSeriesMeta(key, index)
        }))
    ), [chartSeriesKeys]);

    const chartSeriesMetaMap = useMemo(() => (
        chartSeries.reduce((acc, item) => {
            acc[item.key] = item;
            return acc;
        }, {})
    ), [chartSeries]);

    const distributionMetrics = useMemo(() => (
        overviewMetrics
            .filter(metric => !['blockMembers', 'reportMembers'].includes(metric.key))
            .map((metric, index) => ({
                ...metric,
                renderValue: metric.value === 0 ? 0.0001 : metric.value,
                color: metric.color || THEME_SERIES_COLORS[index % THEME_SERIES_COLORS.length]
            }))
    ), [overviewMetrics]);

    const actionContainers = useMemo(() => (
        Array.isArray(normalizedStats?.actionContainers) ? normalizedStats.actionContainers : []
    ), [normalizedStats]);

    const actionDetails = useMemo(() => (
        Array.isArray(normalizedStats?.actionDetails) ? normalizedStats.actionDetails : []
    ), [normalizedStats]);

    const looksEncryptedValue = (value) => {
        const text = String(value || '').trim();
        if (!text) return false;
        return /^[a-f0-9]{24,}(:[a-f0-9]{16,})?$/i.test(text);
    };

    const adminUserLookup = useMemo(() => {
        const byId = new Map();
        const byLoginId = new Map();
        users.forEach((entry) => {
            const id = String(entry?._id || entry?.id || '');
            if (id) byId.set(id, entry);
            const loginId = String(entry?.login_id || '').trim();
            if (loginId) byLoginId.set(loginId, entry);
        });
        return { byId, byLoginId };
    }, [users]);

    const resolvedActionDetails = useMemo(() => (
        actionDetails.map((detail) => {
            if (detail?.targetType !== 'p2p') return detail;
            const matchedUser = adminUserLookup.byId.get(String(detail.targetId || ''))
                || adminUserLookup.byLoginId.get(String(detail.targetLoginId || '').trim());
            if (!matchedUser) {
                return {
                    ...detail,
                    targetName: looksEncryptedValue(detail.targetName) ? '' : detail.targetName,
                    targetMobile: looksEncryptedValue(detail.targetMobile) ? '' : detail.targetMobile,
                    targetEmail: looksEncryptedValue(detail.targetEmail) ? '' : detail.targetEmail
                };
            }
            return {
                ...detail,
                targetName: matchedUser.name || matchedUser.displayName || (!looksEncryptedValue(detail.targetName) ? detail.targetName : ''),
                targetLoginId: matchedUser.login_id || detail.targetLoginId || '',
                targetMobile: matchedUser.mobile || (!looksEncryptedValue(detail.targetMobile) ? detail.targetMobile : ''),
                targetEmail: matchedUser.email || (!looksEncryptedValue(detail.targetEmail) ? detail.targetEmail : '')
            };
        })
    ), [actionDetails, adminUserLookup]);

    const reviewNotifications = useMemo(() => (
        [...adminNotifications].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    ), [adminNotifications]);

    const handleFloatingScroll = () => {
        if (isDraggingScrollControl) return;
        const root = mainScrollRef.current;
        if (!root) return;

        const step = Math.max(root.clientHeight * 0.7, 320);
        const direction = canScrollDown ? 1 : -1;
        root.scrollBy({ top: step * direction, behavior: 'smooth' });
    };

    const handleReviewFloatingScroll = () => {
        if (isDraggingReviewScrollControl) return;
        const root = reviewScrollRef.current;
        if (!root) return;

        const step = Math.max(root.clientHeight * 0.7, 260);
        const direction = reviewCanScrollDown ? 1 : -1;
        root.scrollBy({ top: step * direction, behavior: 'smooth' });
    };

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
        if (!mainScrollRef.current) return;
        const root = mainScrollRef.current;

        const updateScrollState = () => {
            const maxScrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
            setCanScrollUp(root.scrollTop > 24);
            setCanScrollDown(root.scrollTop < maxScrollTop - 24);
            setShowScrollControl(true);

            if (scrollHideTimerRef.current) clearTimeout(scrollHideTimerRef.current);
            scrollHideTimerRef.current = setTimeout(() => {
                setShowScrollControl(false);
            }, 1200);
        };

        updateScrollState();
        root.addEventListener('scroll', updateScrollState);
        window.addEventListener('resize', updateScrollState);

        return () => {
            root.removeEventListener('scroll', updateScrollState);
            window.removeEventListener('resize', updateScrollState);
            if (scrollHideTimerRef.current) clearTimeout(scrollHideTimerRef.current);
        };
    }, [activeTab, stats, users.length, resets.length, reviewNotifications.length, searchQuery]);

    useEffect(() => {
        if (!isDraggingScrollControl) return;

        const handlePointerMove = (event) => {
            const root = mainScrollRef.current;
            const viewportHeight = window.innerHeight;
            const controlSize = isMobile ? 42 : 48;
            const nextTop = Math.max(12, Math.min(viewportHeight - (controlSize + 12), event.clientY - (controlSize / 2)));
            setScrollControlTop((nextTop / viewportHeight) * 100);

            if (!root) return;
            const maxScrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
            const minTrackTop = 12;
            const maxTrackTop = Math.max(minTrackTop, viewportHeight - (controlSize + 12));
            const ratio = maxTrackTop === minTrackTop ? 0 : (nextTop - minTrackTop) / (maxTrackTop - minTrackTop);
            root.scrollTop = maxScrollTop * ratio;
        };

        const handlePointerUp = () => setIsDraggingScrollControl(false);

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [isDraggingScrollControl, isMobile]);

    useEffect(() => {
        const root = reviewScrollRef.current;
        if (!viewChat || !root) {
            setReviewCanScrollUp(false);
            setReviewCanScrollDown(false);
            setReviewScrollControlTop(50);
            return;
        }

        const updateReviewScrollState = () => {
            const maxScrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
            setReviewCanScrollUp(root.scrollTop > 16);
            setReviewCanScrollDown(root.scrollTop < maxScrollTop - 16);
        };

        updateReviewScrollState();
        root.addEventListener('scroll', updateReviewScrollState);
        window.addEventListener('resize', updateReviewScrollState);

        return () => {
            root.removeEventListener('scroll', updateReviewScrollState);
            window.removeEventListener('resize', updateReviewScrollState);
        };
    }, [viewChat, chatStep, viewChat?.messages?.length, chatDates.length, chatContacts.length, dateSearchQuery]);

    useEffect(() => {
        setIsDraggingReviewScrollControl(false);
        setReviewScrollControlTop(50);
    }, [chatStep, viewChat?.user?.id, viewChat?.user?._id]);

    useEffect(() => {
        if (!isDraggingReviewScrollControl) return;

        const handlePointerMove = (event) => {
            const root = reviewScrollRef.current;
            if (!root) return;

            const rect = root.getBoundingClientRect();
            const controlSize = isMobile ? 38 : 44;
            const minTrackTop = 12;
            const maxTrackTop = Math.max(minTrackTop, rect.height - (controlSize + 12));
            const nextTop = Math.max(minTrackTop, Math.min(maxTrackTop, event.clientY - rect.top - (controlSize / 2)));
            setReviewScrollControlTop((nextTop / rect.height) * 100);

            const maxScrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
            const ratio = maxTrackTop === minTrackTop ? 0 : (nextTop - minTrackTop) / (maxTrackTop - minTrackTop);
            root.scrollTop = maxScrollTop * ratio;
        };

        const handlePointerUp = () => setIsDraggingReviewScrollControl(false);

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [isDraggingReviewScrollControl, isMobile]);

    useEffect(() => {
        if (activeTab === 'overview' && chartScrollRef.current && stats?.chartData) {
            const timer = setTimeout(() => {
                const chartData = stats.chartData[chartPeriod] || [];
                const today = new Date();
                let todayKey;

                if (chartPeriod === 'day') {
                    const y = today.getFullYear();
                    const m = String(today.getMonth() + 1).padStart(2, '0');
                    const d = String(today.getDate()).padStart(2, '0');
                    todayKey = `${y}-${m}-${d}`;
                } else if (chartPeriod === 'month') {
                    const y = today.getFullYear();
                    const m = String(today.getMonth() + 1).padStart(2, '0');
                    todayKey = `${y}-${m}`;
                } else if (chartPeriod === 'year') {
                    todayKey = String(today.getFullYear());
                }

                const todayIndex = chartData.findIndex(item => item.name === todayKey);
                const scrollContainer = chartScrollRef.current;

                if (scrollContainer) {
                    if (todayIndex !== -1) {
                        const barGroupWidth = isMobile ? 84 : 96;
                        const targetScrollLeft = (todayIndex * barGroupWidth) - (scrollContainer.clientWidth / 2) + (barGroupWidth / 2);
                        scrollContainer.scrollLeft = Math.max(0, targetScrollLeft);
                    } else {
                        scrollContainer.scrollLeft = scrollContainer.scrollWidth;
                    }
                }
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [stats, chartPeriod, isMobile, activeTab]);

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
    const pushAdminNotification = (notification) => {
        const id = notification.id || `${notification.type || 'notice'}-${Date.now()}`;
        setAdminNotifications(prev => {
            if (prev.some(n => n.id === id)) return prev;
            return [{ ...notification, id, timestamp: notification.timestamp || new Date() }, ...prev];
        });
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
        // Tab switching logic for non-chat alerts
        if (alert.type === 'unblock_request') {
            setActiveTab('unblock');
            setHighlightedRedirectRow({ kind: 'unblock', id: String(alert.userId || '') });
            setShowNotifications(false);
            return;
        }
        if (alert.type === 'registration') {
            setActiveTab('pending');
            setHighlightedRedirectRow({ kind: 'pending', id: String(alert.userId || '') });
            setShowNotifications(false);
            return;
        }
        if (alert.type === 'reset') {
            setActiveTab('resets');
            setHighlightedRedirectRow({ kind: 'reset', id: String(alert.requestId || alert.id || '') });
            setShowNotifications(false);
            return;
        }
        if (alert.type === 'moderation_action') {
            const tabAction = alert.action === 'report' ? 'report' : 'block';
            await fetchStats();
            setActiveTab(tabAction === 'report' ? 'report-actions' : 'block-actions');
            setHighlightedRedirectRow({
                kind: `moderation:${tabAction}`,
                id: `${alert.userId || alert.actorId || ''}:${alert.targetId || ''}`
            });
            setShowNotifications(false);
            return;
        }

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
        if (!highlightedRedirectRow) return;

        const timer = setTimeout(() => setHighlightedRedirectRow(null), 4500);
        const rowEl = document.querySelector(`[data-redirect-row="${highlightedRedirectRow.kind}:${highlightedRedirectRow.id}"]`);
        if (rowEl && typeof rowEl.scrollIntoView === 'function') {
            rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        return () => clearTimeout(timer);
    }, [highlightedRedirectRow, activeTab, users, resets, resolvedActionDetails]);

    useEffect(() => {
        fetchData();
        fetchStats();
        fetchUnethicalAlerts();
        fetchReactionLogs();
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

        const SOCKET_URL = isLanOrLocal ? window.location.origin : (import.meta.env.VITE_API_URL || window.location.origin);
        const socket = io(SOCKET_URL, {
            auth: { token },
            transports: ['polling', 'websocket'],
            upgrade: true,
            timeout: 10000,
            reconnection: true,
        });

        socket.on('connect', () => {
            console.log('Client: Socket Connected!', socket.id);
        });

        socket.on('connect_error', (err) => {
            const message = err?.message || '';
            if (message.toLowerCase().includes('timeout')) {
                console.warn('Client: Socket transport fallback in progress');
                return;
            }
            console.warn('Client: Socket Connection Warning:', message || err);
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
                if (prev.find(u => u.id === newUser.id)) return prev;
                return [...prev, newUser];
            });
            showSnackbar(`New Registration (Pending Approval): ${newUser.name}`, 'info');
            
            // Add to Review Box
            const newNotif = {
                id: `reg-${newUser.id}-${Date.now()}`,
                type: 'registration',
                userId: newUser.id,
                name: newUser.name,
                email: newUser.email,
                login_id: newUser.login_id,
                timestamp: new Date()
            };
            setAdminNotifications(prev => [newNotif, ...prev]);
            fetchData();
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
            
            // Add to Review Box
            const newNotif = {
                id: `reset-${newReset.id}-${Date.now()}`,
                type: 'reset',
                requestId: newReset.id,
                userId: newReset.user_id,
                name: newReset.name,
                email: newReset.email,
                login_id: newReset.login_id,
                timestamp: new Date()
            };
            setAdminNotifications(prev => [newNotif, ...prev]);
            fetchStats();
        });

        socket.on('new_unblock_request', (data) => {
            console.log('Admin Dashboard: !! NEW UNBLOCK REQUEST !!', data);
            fetchData();
            fetchStats();
            showSnackbar(`New Unblock Request from: ${data.userName}`, 'info');
            // Add to notifications
            const newNotif = {
                id: `unblock-${data.userId}-${Date.now()}`,
                type: 'unblock_request',
                userId: data.userId,
                userName: data.userName,
                reason: data.reason,
                timestamp: new Date()
            };
            setAdminNotifications(prev => [newNotif, ...prev]);
        });

        socket.on('chat_moderation_action', (data) => {
            fetchStats();
            const actionLabel = data?.action === 'block' ? 'Block' : data?.action === 'unblock' ? 'Unblock' : 'Report';
            const actorName = data?.actorName || data?.userName || data?.memberName || 'Unknown member';
            const targetName = data?.targetName || data?.partnerName || data?.receiverName || 'Unknown target';
            const message = `${actorName} ${actionLabel.toLowerCase()}ed ${targetName}`;
            showSnackbar(message, 'info');
            pushAdminNotification({
                id: `moderation-${data?.action || 'action'}-${data?.actorId || data?.userId || 'admin'}-${data?.targetId || data?.messageId || Date.now()}-${data?.timestamp || Date.now()}`,
                type: 'moderation_action',
                action: data?.action || 'report',
                actorId: data?.actorId || data?.userId || '',
                userId: data?.actorId || data?.userId || '',
                targetId: data?.targetId || '',
                userName: actorName,
                targetName,
                message,
                timestamp: data?.timestamp ? new Date(data.timestamp) : new Date()
            });
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

        socket.on('receive_message', (newMsg) => {
            console.log('Admin Dashboard: Real-time message received:', newMsg);
            setViewChat(prev => {
                if (!prev || !prev.messages) return prev;

                // Robust Check for User and Contact match
                const msgSenderId = String(newMsg.user_id?._id || newMsg.user_id || newMsg.sender_id);
                const msgReceiverId = String(newMsg.receiver_id?._id || newMsg.receiver_id || newMsg.receiverId);
                const currentViewedUserId = String(prev.user?.id || prev.user?._id);

                // Important: Ensure it's for the specific conversation the admin is looking at!
                // If the admin is reviewing (User A + User B), we only care about messages between them.
                const isRelevant = (msgSenderId === currentViewedUserId) || (msgReceiverId === currentViewedUserId);

                if (isRelevant) {
                    // Check if message already exists (prevent duplicates)
                    const isDuplicate = prev.messages.some(m => String(m._id || m.id) === String(newMsg._id || newMsg.id));
                    if (isDuplicate) return prev;

                    console.log('Admin Dashboard: Adding message to live view');
                    return { ...prev, messages: [...prev.messages, { ...newMsg, _id: newMsg._id || newMsg.id }] };
                }
                return prev;
            });
        });

        socket.on('message_updated', (data) => {
            console.log('Admin Dashboard: Message update received:', data);
            setViewChat(prev => {
                if (!prev || !prev.messages) return prev;
                return {
                    ...prev,
                    messages: prev.messages.map(msg =>
                        (String(msg._id || msg.id) === String(data._id || data.id))
                            ? { ...msg, ...data }
                            : msg
                    )
                };
            });
        });

        socket.on('event_responded', (data) => {
            console.log('Admin Dashboard: Event Response received:', data);
            setViewChat(prev => {
                if (!prev || !prev.messages) return prev;
                return {
                    ...prev,
                    messages: prev.messages.map(msg =>
                        (String(msg._id || msg.id) === String(data.messageId))
                            ? { ...msg, event: data.event }
                            : msg
                    )
                };
            });
            setSelectedEventMsg(prev => {
                if (!prev) return prev;
                if (String(prev._id || prev.id) === String(data.messageId)) {
                    return { ...prev, event: data.event };
                }
                return prev;
            });
        });

        socket.on('event_updated', (data) => {
            console.log('Admin Dashboard: Event Update received:', data);
            setViewChat(prev => {
                if (!prev || !prev.messages) return prev;
                return {
                    ...prev,
                    messages: prev.messages.map(msg =>
                        (String(msg._id || msg.id) === String(data.messageId))
                            ? { ...msg, event: data.event }
                            : msg
                    )
                };
            });
            setSelectedEventMsg(prev => {
                if (!prev) return prev;
                if (String(prev._id || prev.id) === String(data.messageId)) {
                    return { ...prev, event: data.event };
                }
                return prev;
            });
        });

        socket.on('message_reaction_updated', (data) => {
            console.log('Admin Dashboard: Real-time reaction received:', data);
            setViewChat(prev => {
                if (!prev || !prev.messages) return prev;
                return {
                    ...prev,
                    messages: prev.messages.map(msg =>
                        (String(msg._id || msg.id) === String(data.messageId))
                            ? { ...msg, reactions: data.reactions }
                            : msg
                    )
                };
            });
        });

        socket.on('reaction_audit_log', (data) => {
            console.log('Admin Dashboard: Audit event received:', data);
            setViewChat(prev => {
                if (!prev || !prev.messages) return prev;
                return {
                    ...prev,
                    messages: prev.messages.map(msg => {
                        if (String(msg._id || msg.id) === String(data.messageId)) {
                            const history = msg.reaction_history || [];
                            // Add new log to history if not duplicate
                            const isDuplicate = history.some(h =>
                                String(h.user_id?._id || h.user_id) === String(data.user_id?._id || data.user_id) &&
                                h.emoji === data.emoji &&
                                h.action === data.action &&
                                Math.abs(new Date(h.timestamp) - new Date(data.timestamp)) < 1000
                            );
                            if (isDuplicate) return msg;
                            return { ...msg, reaction_history: [...history, data] };
                        }
                        return msg;
                    })
                };
            });
        });

        socket.on('user_typing', (data) => {
            // Optional: Handle typing in admin view if helpful
            // For now just console log or we could add a small indicator
            console.log("Admin: Someone is typing...", data);
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
            console.log('Admin: Fetched Stats:', res.data); // Debug log
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
            
            // Remove notification from Review Box
            setAdminNotifications(prev => prev.filter(n => !(n.type === 'registration' && n.userId === userId)));
            
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
            
            // Remove notification from Review Box
            setAdminNotifications(prev => prev.filter(n => !(n.type === 'reset' && n.userId === userId)));
            
            fetchData(); // Re-fetch data to update resets list if needed
            fetchStats();
        } catch (err) {
            showSnackbar(err.response?.data?.error || 'Reset failed', 'error');
        }
    };

    const handleApproveUnblock = async (userId) => {
        try {
            await axios.post('/api/admin/approve-unblock', { userId });
            const user = users.find(u => u.id === userId || u._id === userId);
            showSnackbar(`Messaging restored for: ${user?.name || ''}`, 'success');
            
            // Remove notification from Review Box
            setAdminNotifications(prev => prev.filter(n => !(n.type === 'unblock_request' && n.userId === userId)));
            
            fetchData();
            fetchStats();
        } catch (err) {
            showSnackbar(err.response?.data?.error || 'Approval failed', 'error');
        }
    };

    const handleRejectUnblock = async (userId) => {
        const user = users.find(u => u.id === userId || u._id === userId);
        triggerConfirm('Reject Unblock Request?', `Reject messaging restoration for ${user?.name || 'this user'}?`, async () => {
            try {
                await axios.post('/api/admin/reject-unblock', { userId });
                showSnackbar(`Unblock request rejected for: ${user?.name || ''}`, 'info');
                
                // Remove notification from Review Box
                setAdminNotifications(prev => prev.filter(n => !(n.type === 'unblock_request' && n.userId === userId)));
                
                fetchData();
                fetchStats();
                closeConfirm();
            } catch (err) {
                showSnackbar(err.response?.data?.error || 'Rejection failed', 'error');
                closeConfirm();
            }
        });
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
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                if (showNotifications) setShowNotifications(false);
                if (viewChat) setViewChat(null);
                if (viewingMedia) setViewingMedia(null);
                if (unethicalModalUser) setUnethicalModalUser(null);
                if (showUnethicalModal) setShowUnethicalModal(false);
                if (confirmConfig) closeConfirm();
                if (msgDropdown) setMsgDropdown(null);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [showNotifications, viewChat, viewingMedia, unethicalModalUser, showUnethicalModal, confirmConfig, msgDropdown]);

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

    const formatVoiceTime = (seconds) => {
        if (!seconds) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
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

    const renderReactionAuditModal = () => {
        if (!selectedReactionMsg) return null;
        const history = selectedReactionMsg.reaction_history || [];

        return (
            <div
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(2, 6, 23, 0.72)', backdropFilter: 'blur(8px)', zIndex: 12000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}
                onClick={() => setSelectedReactionMsg(null)}
            >
                <div
                    style={{ background: '#0f172a', width: '95%', maxWidth: '420px', borderRadius: '1.2rem', overflow: 'hidden', boxShadow: '0 28px 70px rgba(2, 6, 23, 0.55)', animation: 'slideUp 0.3s ease-out', border: '1px solid rgba(148, 163, 184, 0.16)' }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div style={{ padding: '1.2rem 1.5rem', background: ADMIN_PILL_GRADIENT, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '0 0 auto' }}>
                            <div style={{ background: 'rgba(255,255,255,0.2)', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <History size={16} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>Emoji Activity</h3>
                        </div>
                        <button
                            onClick={() => setSelectedReactionMsg(null)}
                            style={{
                                background: 'rgba(255,255,255,0.25)',
                                border: 'none',
                                color: 'white',
                                cursor: 'pointer',
                                padding: '6px 18px',
                                borderRadius: '40px',
                                fontSize: '0.9rem',
                                fontWeight: '700',
                                transition: 'all 0.2s',
                                width: 'fit-content',
                                flexShrink: 0
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.35)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.25)';
                            }}
                        >
                            Close
                        </button>
                    </div>

                    {/* Content */}
                    <div style={{ padding: '1.2rem', maxHeight: '60vh', overflowY: 'auto', background: '#111827' }}>
                        {history.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: OFFICIAL_TEXT_MUTED }}>
                                No history recorded for this message.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {Object.values(history.reduce((acc, log) => {
                                    const key = `${log.user_id?._id || log.user_id}-${log.emoji}`;
                                    if (!acc[key]) acc[key] = { user: log.user_id, emoji: log.emoji, logs: [] };
                                    acc[key].logs.push(log);
                                    return acc;
                                }, {})).map((group, idx) => (
                                    <div key={idx} style={{ background: '#172033', padding: '12px 16px', borderRadius: '12px', boxShadow: '0 10px 28px rgba(2, 6, 23, 0.22)', border: '1px solid rgba(148, 163, 184, 0.16)', display: 'flex', alignItems: 'center', gap: '15px' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: ADMIN_PILL_GRADIENT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', flexShrink: 0 }}>
                                            {group.user?.name?.charAt(0) || '?'}
                                        </div>
                                        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                                <span style={{ fontWeight: '700', color: OFFICIAL_TEXT_PRIMARY, fontSize: '0.95rem' }}>{group.user?.name || 'Unknown User'}</span>
                                                <div style={{ fontSize: '1.2rem', marginTop: '2px' }}>{group.emoji}</div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                                {group.logs.map((L, i) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', color: OFFICIAL_TEXT_MUTED, whiteSpace: 'nowrap' }}>
                                                        <span style={{ fontWeight: '800', color: L.action === 'added' ? '#2dce89' : '#f5365c', textTransform: 'capitalize' }}>{L.action}:</span>
                                                        <span>
                                                            {new Date(L.timestamp).toLocaleDateString([], { month: 'short', day: '2-digit' })}, {new Date(L.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '1rem 1.2rem', background: '#0f172a', borderTop: '1px solid rgba(148, 163, 184, 0.14)', display: 'flex', justifyContent: 'center' }}>
                        <button
                            onClick={() => setSelectedReactionMsg(null)}
                            style={{
                                width: '100%',
                                padding: '12px 24px',
                                borderRadius: '12px',
                                border: 'none',
                                background: ADMIN_PILL_GRADIENT,
                                color: 'white',
                                fontWeight: '800',
                                fontSize: '1rem',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                boxShadow: '0 4px 15px rgba(10, 124, 143, 0.2)',
                                textTransform: 'uppercase',
                                letterSpacing: '1px'
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 6px 20px rgba(10, 124, 143, 0.3)';
                                e.currentTarget.style.filter = 'brightness(1.1)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 15px rgba(10, 124, 143, 0.2)';
                                e.currentTarget.style.filter = 'brightness(1)';
                            }}
                        >
                            Done
                        </button>
                    </div>
                </div>

            </div>
        );
    };

    const renderEventAuditModal = () => {
        if (!selectedEventMsg) return null;
        const history = selectedEventMsg.event?.response_history || [];

        return (
            <div
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}
                onClick={() => setSelectedEventMsg(null)}
            >
                <div
                    style={{ background: 'white', width: '95%', maxWidth: '420px', borderRadius: '1.2rem', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.3s ease-out' }}
                    onClick={e => e.stopPropagation()}
                >
                    <div style={{ padding: '1.2rem 1.5rem', background: 'linear-gradient(87deg, #0A7C8F 0, #0FB5D0 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '0 0 auto' }}>
                            <div style={{ background: 'rgba(255,255,255,0.2)', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Calendar size={16} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>Event History</h3>
                        </div>
                        <button
                            onClick={() => setSelectedEventMsg(null)}
                            style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: 'white', cursor: 'pointer', padding: '6px 18px', borderRadius: '40px', fontSize: '0.9rem', fontWeight: '700', transition: 'all 0.2s', width: 'fit-content', flexShrink: 0 }}
                        >
                            Close
                        </button>
                    </div>

                    <div style={{ padding: '1.2rem', maxHeight: '60vh', overflowY: 'auto', background: '#f8f9fe' }}>
                        {history.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: '#8898aa' }}>
                                No RSVP history recorded for this event.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {Object.values(history.reduce((acc, log) => {
                                    const userId = String(log.user_id?._id || log.user_id);
                                    if (!acc[userId]) {
                                        const foundUser = users.find(u => String(u.id || u._id) === userId);
                                        acc[userId] = {
                                            user: foundUser || { name: 'Unknown User', _id: userId },
                                            logs: []
                                        };
                                    }
                                    acc[userId].logs.push(log);
                                    return acc;
                                }, {})).map((group, idx) => (
                                    <div key={idx} style={{ background: 'white', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', border: '1px solid #e9ecef', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {/* User Info Header */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f8f9fe', paddingBottom: '10px' }}>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(87deg, #0A7C8F 0, #0FB5D0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', flexShrink: 0, fontSize: '0.85rem' }}>
                                                {group.user?.name?.charAt(0) || <UserIcon size={16} />}
                                            </div>
                                            <span style={{ fontWeight: '750', color: '#111b21', fontSize: '1rem' }}>{group.user?.name || 'Unknown User'}</span>
                                        </div>

                                        {/* Logs Section (Below Name) */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '48px' }}>
                                            {group.logs.map((log, i) => {
                                                const statusColor = log.status === 'Going' ? '#2dce89' : log.status === 'Maybe' ? '#fb6340' : '#f5365c';
                                                const logText = i === 0 ? `Voted for "${log.status}"` : `Changed voting to "${log.status}"`;

                                                return (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', width: '100%' }}>
                                                        <span style={{ fontWeight: '700', color: statusColor, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{logText}</span>
                                                        <span style={{ fontSize: '0.7rem', color: '#8898aa', whiteSpace: 'nowrap' }}>
                                                            {new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: '2-digit' })}, {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ padding: '1rem 1.2rem', background: 'white', borderTop: '1px solid #e9ecef', display: 'flex', justifyContent: 'center' }}>
                        <button
                            onClick={() => setSelectedEventMsg(null)}
                            style={{ width: '100%', padding: '12px 24px', borderRadius: '12px', border: 'none', background: 'linear-gradient(87deg, #0A7C8F 0, #0FB5D0 100%)', color: 'white', fontWeight: '800', fontSize: '1rem', cursor: 'pointer', transition: 'all 0.3s ease', boxShadow: '0 4px 15px rgba(10, 124, 143, 0.2)', textTransform: 'uppercase', letterSpacing: '1px' }}
                        >
                            Done
                        </button>
                    </div>
                </div>

            </div>
        );
    };

    const renderMediaLightbox = () => {
        if (!viewingMedia) return null;
        const isImage = viewingMedia.type === 'image';

        // Collect all media messages from current chat to show in the bottom bar
        const allMedia = viewChat?.messages?.filter(m => m.type === 'image' || m.type === 'video') || [];

        const handleWheel = (e) => {
            if (!isImage) return;
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const newZoom = Math.min(Math.max(1, zoomLevel + delta), 4); // Min zoom now 100% (1)
            if (newZoom === 1) setPanOffset({ x: 0, y: 0 });
            setZoomLevel(newZoom);
        };

        const handleMouseDown = (e) => {
            if (zoomLevel > 1) {
                setIsDragging(true);
                setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
            }
        };

        const handleMouseMove = (e) => {
            if (isDragging) {
                setPanOffset({
                    x: e.clientX - dragStart.x,
                    y: e.clientY - dragStart.y
                });
            }
        };

        const handleMouseUp = () => setIsDragging(false);

        return (
            <div
                style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(255, 255, 255, 0.6)',
                    backdropFilter: 'blur(25px)',
                    WebkitBackdropFilter: 'blur(25px)',
                    zIndex: 5000, display: 'flex', flexDirection: 'column',
                    animation: 'wa-fade-in 0.3s ease-out',
                    overflow: 'hidden',
                    userSelect: 'none'
                }}
                onClick={() => { setViewingMedia(null); setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
                onWheel={handleWheel}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <style>
                    {`
                    @keyframes wa-fade-in { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes wa-scale-in { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                    .lightbox-media-hover {
                        transition: ${isDragging ? 'none' : 'transform 0.1s ease-out'} !important;
                        ${zoomLevel === 1 ? 'cursor: zoom-in;' : (isDragging ? 'cursor: grabbing;' : 'cursor: move;')}
                    }
                    .media-thumb-item { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 3px solid transparent; }
                    .media-thumb-item.active { border-color: #0FB5D0; transform: scale(1.1); box-shadow: 0 10px 25px rgba(15, 181, 208, 0.3); }
                    .media-thumb-container::-webkit-scrollbar { height: 6px; }
                    .media-thumb-container::-webkit-scrollbar-thumb { background: rgba(10, 124, 143, 0.2); border-radius: 10px; }
                    `}
                </style>

                {/* Header */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    padding: '25px 30px', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', color: '#1a1f36', zIndex: 5002
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ width: '45px', height: '45px', background: 'rgba(10, 124, 143, 0.1)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0A7C8F' }}>
                            {isImage ? <Smile size={24} /> : <Play size={24} />}
                        </div>
                        <div>
                            <div style={{ fontWeight: '800', fontSize: '1.2rem', color: '#0A7C8F' }}>{isImage ? 'Photo' : 'Video'} Preview</div>
                            <div style={{ fontSize: '0.85rem', opacity: 0.8, fontWeight: '600' }}>Reviewing activity from {viewChat?.user?.name}</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '15px' }}>
                        {isImage && (
                            <div style={{
                                background: 'white', padding: '10px 20px', borderRadius: '14px',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.05)', fontSize: '0.9rem',
                                fontWeight: '700', color: '#0A7C8F', border: '1px solid rgba(10, 124, 143, 0.1)'
                            }}>
                                Zoom: {Math.round(zoomLevel * 100)}% {zoomLevel > 1 && '(Drag to pan)'}
                            </div>
                        )}
                        <button
                            onClick={() => { setViewingMedia(null); setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
                            style={{
                                background: 'white', border: 'none', color: '#1a1f36',
                                width: '45px', height: '45px', borderRadius: '50%', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                            }}
                            onMouseOver={e => e.currentTarget.style.transform = 'rotate(90deg)'}
                            onMouseOut={e => e.currentTarget.style.transform = 'rotate(0deg)'}
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Media Container - Removed Padded White Card as requested */}
                <div
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 40px', position: 'relative' }}
                    onClick={e => e.stopPropagation()}
                    onMouseDown={handleMouseDown}
                >
                    {isImage ? (
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img
                                src={getAdminMediaUrl(viewingMedia.file_path)}
                                alt="Full View"
                                className="lightbox-media-hover"
                                draggable="false"
                                style={{
                                    maxWidth: '100%', maxHeight: '70vh',
                                    objectFit: 'contain',
                                    borderRadius: '12px',
                                    boxShadow: '0 30px 90px rgba(0,0,0,0.15)',
                                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                                    animation: 'wa-scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                                    display: 'block'
                                }}
                            />
                        </div>
                    ) : (
                        <video
                            src={getAdminMediaUrl(viewingMedia.file_path)}
                            controls
                            autoPlay
                            style={{
                                maxWidth: '100%', maxHeight: '70vh',
                                borderRadius: '16px', boxShadow: '0 30px 70px rgba(0,0,0,0.2)',
                                animation: 'wa-scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
                            }}
                        />
                    )}
                </div>

                {/* Bottom Media Carousel */}
                {allMedia.length > 0 && (
                    <div
                        className="media-thumb-container"
                        style={{
                            background: 'rgba(255, 255, 255, 0.8)', padding: '20px',
                            display: 'flex', gap: '15px', overflowX: 'auto',
                            justifyContent: allMedia.length < 10 ? 'center' : 'flex-start',
                            borderTop: '1px solid rgba(0,0,0,0.05)', zIndex: 5003
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {allMedia.map((m, i) => (
                            <div
                                key={m._id || m.id || i}
                                className={`media-thumb-item ${String(m._id || m.id) === String(viewingMedia._id || viewingMedia.id) ? 'active' : ''}`}
                                onClick={() => { setViewingMedia(m); setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
                                style={{
                                    width: '80px', height: '80px', borderRadius: '12px',
                                    overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                                    position: 'relative', background: '#f0f2f5'
                                }}
                            >
                                {m.type === 'video' ? (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e9ecef' }}>
                                        <Play size={24} color="#0A7C8F" />
                                        {m.duration && (
                                            <div style={{ position: 'absolute', bottom: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '0.6rem', padding: '2px 4px', borderRadius: '4px' }}>
                                                {formatVoiceTime(m.duration)}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <img src={getAdminMediaUrl(m.file_path)} alt="thumb" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderNotificationDropdown = () => {
        if (!showNotifications) return null;
        return (
            <div className="admin-notification-dropdown" style={{
                position: isMobile ? 'fixed' : 'absolute',
                top: isMobile ? '66px' : '84px',
                right: isMobile ? '10px' : '128px',
                left: isMobile ? '12px' : 'auto',
                width: isMobile ? 'auto' : '360px',
                maxWidth: isMobile ? 'none' : '360px',
                background: OFFICIAL_PANEL_SURFACE,
                borderRadius: '18px', boxShadow: '0 24px 60px rgba(2, 6, 23, 0.4)',
                zIndex: 6000, overflow: 'hidden', border: '1px solid rgba(148, 163, 184, 0.14)',
                animation: 'slideUp 0.3s ease-out'
            }}>
                <div className="admin-notification-dropdown-header" style={{
                    padding: '16px 18px', borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(20, 152, 255, 0.12)'
                }}>
                    <span style={{ fontWeight: '700', color: OFFICIAL_TEXT_PRIMARY, fontSize: '0.95rem' }}>Review Box</span>
                    <span style={{
                        position: 'relative',
                        width: '28px',
                        height: '28px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#cbd5e1'
                    }}>
                        <Bell size={18} color="#cbd5e1" fill="none" />
                        {reviewNotifications.length > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: '-8px',
                                right: '-8px',
                                minWidth: '18px',
                                height: '18px',
                                padding: '0 5px',
                                borderRadius: '999px',
                                background: 'linear-gradient(135deg, #59b7ff 0%, #4e59ff 100%)',
                                color: 'white',
                                fontSize: '0.62rem',
                                fontWeight: '800',
                                lineHeight: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '2px solid rgba(12, 20, 38, 0.9)',
                                boxShadow: '0 8px 18px rgba(78, 89, 255, 0.35)'
                            }}>
                                {reviewNotifications.length}
                            </span>
                        )}
                    </span>
                </div>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {reviewNotifications.length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center', color: OFFICIAL_TEXT_MUTED, fontSize: '0.85rem' }}>
                            <Bell size={30} style={{ margin: '0 auto 10px', opacity: 0.3, display: 'block' }} />
                            No recent actions to review
                        </div>
                    ) : (
                        reviewNotifications.map((alert, idx) => (
                            <div
                                key={idx}
                                onClick={() => handleViewAlert(alert)}
                                style={{
                                    padding: '14px 16px', borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
                                    cursor: 'pointer', transition: 'background 0.2s',
                                    display: 'flex', gap: '12px', alignItems: 'flex-start'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#162036'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                <div style={{
                                    width: '38px', height: '38px', borderRadius: '14px',
                                    background: 'rgba(255,255,255,0.06)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                    border: '1px solid rgba(148, 163, 184, 0.1)'
                                }}>
                                    {alert.type === 'unethical' ? (
                                        <AlertTriangle size={18} color="#f5365c" />
                                    ) : alert.type === 'unblock_request' ? (
                                        <ShieldCheck size={18} color="#6e72ff" />
                                    ) : alert.type === 'moderation_action' ? (
                                        alert.action === 'report' ? (
                                            <AlertTriangle size={18} color="#73a8ff" />
                                        ) : alert.action === 'unblock' ? (
                                            <ShieldCheck size={18} color="#34d399" />
                                        ) : (
                                            <XCircle size={18} color="#ff6b7d" />
                                        )
                                    ) : alert.type === 'registration' ? (
                                        <UserCheck size={18} color="#2e7bff" />
                                    ) : alert.type === 'reset' ? (
                                        <Key size={18} color="#4e59ff" />
                                    ) : (
                                        <Trash2 size={18} color="#1a9cff" />
                                    )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                        <span style={{ fontWeight: '700', fontSize: '0.825rem', color: OFFICIAL_TEXT_PRIMARY }}>
                                            {alert.type === 'unethical' ? 'Unethical Content' : 
                                             alert.type === 'unblock_request' ? 'Unblock Request' : 
                                             alert.type === 'moderation_action' ? `${alert.action === 'unblock' ? 'Unblock' : alert.action === 'block' ? 'Block' : 'Report'} Action` :
                                             alert.type === 'registration' ? 'New Registration' : 
                                             alert.type === 'reset' ? 'Password Reset' : 'Message Deleted'}
                                        </span>
                                        <span style={{ fontSize: '0.65rem', color: OFFICIAL_TEXT_MUTED }}>
                                            {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: OFFICIAL_TEXT_SECONDARY, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                        {alert.type === 'registration' ? <UserIcon size={12} /> : 
                                         alert.type === 'reset' ? <Key size={12} /> : 
                                         alert.type === 'unblock_request' ? <ShieldCheck size={12} /> : 
                                         alert.type === 'moderation_action' ? (alert.action === 'unblock' ? <ShieldCheck size={12} /> : alert.action === 'block' ? <XCircle size={12} /> : <AlertTriangle size={12} />) :
                                            alert.isGroup ? <Users size={12} /> : <UserIcon size={12} />}
                                        <span style={{ fontWeight: '600' }}>{alert.deletedBy || alert.userName || alert.name}</span>
                                        {(alert.type === 'unethical' || alert.type === 'deletion') && (
                                            <>
                                                <span style={{ color: OFFICIAL_TEXT_MUTED }}>in</span>
                                                <span style={{ fontWeight: '600', color: '#73a8ff' }}>{alert.partnerName || 'Unknown Chat'}</span>
                                            </>
                                        )}
                                    </div>
                                    <div style={{
                                        fontSize: '0.75rem', color: OFFICIAL_TEXT_MUTED,
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px'
                                    }}>
                                        {alert.type === 'unethical' || alert.type === 'deletion' ? (
                                            alert.type === 'audio' ? (
                                                <>
                                                    <Mic size={12} /> Voice Message ({formatVoiceTime(alert.duration)})
                                                </>
                                            ) : (
                                                `"${alert.contentSnippet || alert.content || 'No content'}"`
                                            )
                                        ) : alert.type === 'unblock_request' ? (
                                            `Reason: "${alert.reason || 'No reason provided'}"`
                                        ) : alert.type === 'moderation_action' ? (
                                            alert.message || `${alert.userName || 'Someone'} ${alert.action === 'block' ? 'blocked' : alert.action === 'unblock' ? 'unblocked' : 'reported'} ${alert.targetName || 'someone'}`
                                        ) : alert.type === 'registration' ? (
                                            `New user: ${alert.email || alert.login_id || alert.userId}`
                                        ) : alert.type === 'reset' ? (
                                            `Id: ${alert.login_id || alert.email || alert.name}`
                                        ) : null}
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
                            color: '#8ed2ff', fontWeight: '700', cursor: 'pointer',
                            borderTop: '1px solid rgba(148, 163, 184, 0.12)', background: 'rgba(255,255,255,0.02)'
                        }}
                    >
                        Clear recent notifications
                    </div>
                )}
            </div>
        );
    };

    const renderMsgDropdown = () => {
        if (!msgDropdown) return null;
        const menuWidth = isMobile ? 210 : 220;
        const menuHeight = 116;
        const viewportWidth = window.innerWidth || 1024;
        const viewportHeight = window.innerHeight || 768;
        const preferredLeft = msgDropdown.x - menuWidth + 18;
        const preferredTop = msgDropdown.y + 12;
        const dropdownLeft = Math.max(12, Math.min(viewportWidth - menuWidth - 12, preferredLeft));
        const dropdownTop = preferredTop + menuHeight > viewportHeight - 12
            ? Math.max(12, msgDropdown.y - menuHeight - 12)
            : Math.max(isMobile ? 76 : 88, preferredTop);

        return (
            <>
                <div
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2004, cursor: 'default' }}
                    onClick={() => setMsgDropdown(null)}
                />
                <div
                    onClick={() => setMsgDropdown(null)}
                    style={{
                        position: 'fixed',
                        top: dropdownTop,
                        left: dropdownLeft,
                        width: menuWidth,
                        background: '#172033',
                        borderRadius: '14px',
                        boxShadow: '0 18px 46px rgba(2, 6, 23, 0.45)',
                        zIndex: 2005,
                        padding: '6px',
                        border: '1px solid rgba(148, 163, 184, 0.16)'
                    }}
                >
                    <div
                        onClick={() => enterSelectionMode(msgDropdown.id)}
                        style={{
                            padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            color: OFFICIAL_TEXT_PRIMARY, fontSize: '0.85rem', fontWeight: '700',
                            transition: 'background 0.2s', marginBottom: '4px'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        <Check size={16} /> Select Messages
                    </div>
                    <div
                        onClick={() => handleDeleteSingleMessage(msgDropdown.id)}
                        style={{
                            padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            color: '#f5365c', fontSize: '0.85rem', fontWeight: '600',
                            transition: 'background 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(245, 54, 92, 0.12)'}
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
            className="stat-card"
            onClick={onClick}
            style={{
                background: gradient,
                padding: '1.5rem',
                borderRadius: '22px',
                color: 'white',
                boxShadow: '0 18px 44px rgba(8, 15, 32, 0.24)',
                position: 'relative',
                overflow: 'hidden',
                flex: 1,
                minWidth: isMobile ? '100%' : '260px',
                width: isMobile ? '100%' : 'auto',
                minHeight: isMobile ? '152px' : '180px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'transform 0.2s',
                border: '1px solid rgba(255, 255, 255, 0.12)'
            }}
            onMouseOver={(e) => onClick && (e.currentTarget.style.transform = 'translateY(-5px)')}
            onMouseOut={(e) => onClick && (e.currentTarget.style.transform = 'translateY(0)')}
        >
            {/* Background design dots/circles as seen in image */}
            <div style={{ position: 'absolute', top: '-24px', right: '-24px', width: isMobile ? '84px' : '100px', height: isMobile ? '84px' : '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }}></div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 45%)', pointerEvents: 'none' }} />

            <div style={{ zIndex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.95rem', fontWeight: '500', opacity: 0.9, margin: 0 }}>{title}</p>
                    <Icon size={24} style={{ opacity: 0.8 }} />
                </div>
                <h3 style={{ fontSize: isMobile ? '1.8rem' : '2.1rem', fontWeight: '600', margin: '0.5rem 0' }}>{value}</h3>
            </div>
            <div style={{ zIndex: 1, fontSize: isMobile ? '0.8rem' : '0.85rem', fontWeight: '400', opacity: 0.9 }}>
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
                    <div className="admin-analytics-panel" style={{ padding: '1.5rem', borderRadius: '1.25rem', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                            <Search size={18} color="#73a8ff" />
                            <h4 style={{ margin: 0, fontWeight: '700', color: OFFICIAL_TEXT_PRIMARY }}>Search Results of Users</h4>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {searchMatches.slice(0, 5).map(u => (
                                <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem', background: 'rgba(255,255,255,0.04)', borderRadius: '14px', transition: 'all 0.2s', border: '1px solid rgba(148, 163, 184, 0.12)' }} className="hover-card">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                                        <div style={{ width: '35px', height: '35px', background: 'rgba(255,255,255,0.06)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(148, 163, 184, 0.12)' }}>
                                            <UserIcon size={16} color="#73a8ff" />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <div style={{ fontWeight: '700', color: OFFICIAL_TEXT_PRIMARY, fontSize: '0.95rem' }}>{u.name}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ fontSize: '0.75rem', color: OFFICIAL_TEXT_MUTED, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span style={{ fontWeight: '600', color: '#73a8ff' }}>ID:</span> {u.login_id || 'N/A'}
                                                </div>
                                                <span style={{ fontSize: '0.75rem', color: 'rgba(148, 163, 184, 0.45)' }}>|</span>
                                                <div style={{ fontSize: '0.75rem', color: OFFICIAL_TEXT_MUTED }}>{u.email}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ paddingRight: '10px' }}>
                                        <button
                                            onClick={() => { setSearchQuery(''); setActiveTab('management'); }}
                                            style={{
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(115, 168, 255, 0.35)',
                                                color: '#9ed6ff',
                                                padding: '6px 16px',
                                                borderRadius: '20px',
                                                fontSize: '0.75rem',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                boxShadow: '0 10px 24px rgba(2, 6, 23, 0.12)'
                                            }}
                                            onMouseOver={(e) => { e.currentTarget.style.background = ADMIN_PILL_GRADIENT; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = 'transparent'; }}
                                            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#9ed6ff'; e.currentTarget.style.borderColor = 'rgba(115, 168, 255, 0.35)'; }}
                                        >
                                            View in Users list
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {searchMatches.length > 5 && (
                                <div style={{ textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, cursor: 'pointer' }} onClick={() => setActiveTab('management')}>
                                    View all {searchMatches.length} matches
                                </div>
                            )}
                        </div>
                    </div>
                )}
                <div data-scroll-section="overview-metrics" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: isMobile ? 'center' : 'flex-start', scrollMarginTop: '110px' }}>
                    {overviewMetrics.map((metric) => (
                        <StatCard
                            key={metric.key}
                            title={metric.label}
                            value={metric.value}
                            subtext={metric.subtext}
                            gradient={metric.gradient}
                            icon={metric.icon}
                            onClick={metric.actionDetail
                                ? () => setActiveTab(metric.actionDetail === 'block' ? 'block-actions' : 'report-actions')
                                : (metric.onClickTab ? () => setActiveTab(metric.onClickTab) : undefined)}
                        />
                    ))}
                </div>

                <div className="dashboard-overview-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '1.5rem', minHeight: '400px' }}>
                    {/* Bar Chart */}
                    <div data-scroll-section="overview-trends" className="admin-analytics-panel" style={{ padding: '1.5rem', borderRadius: '1.25rem', minWidth: 0, scrollMarginTop: '110px' }}>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '1rem',
                            marginBottom: '1.5rem',
                            textAlign: 'center'
                        }}>
                            <h4 style={{ margin: 0, fontWeight: '700', color: '#f8fafc', width: '100%', textAlign: 'center' }}>User Activity & Request Trends</h4>
                            <div className="admin-period-toggle" style={{ display: 'flex', padding: '4px', borderRadius: '999px', width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
                                {['day', 'month', 'year'].map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setChartPeriod(p)}
                                        style={{
                                            padding: isMobile ? '8px 0' : '8px 18px',
                                            borderRadius: '999px',
                                            border: 'none',
                                            fontSize: '0.78rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            background: chartPeriod === p ? ADMIN_PILL_GRADIENT : 'transparent',
                                            color: chartPeriod === p ? '#f8fafc' : '#94a3b8',
                                            boxShadow: chartPeriod === p ? '0 10px 24px rgba(78, 89, 255, 0.28)' : 'none',
                                            minWidth: isMobile ? '0' : '88px',
                                            flex: isMobile ? 1 : 'unset'
                                        }}
                                    >
                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div
                            ref={chartScrollRef}
                            className="table-responsive"
                            style={{
                                height: '320px',
                                width: '100%',
                                overflowX: 'auto',
                                overflowY: 'hidden',
                                scrollBehavior: 'smooth'
                            }}
                        >
                            <div style={{ width: `${Math.max(activeChartData.length * (isMobile ? 84 : 96), 560)}px`, minWidth: '100%', height: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={activeChartData} margin={{ top: 10, right: 16, left: isMobile ? -18 : 0, bottom: 18 }} barGap={6} barCategoryGap={isMobile ? '28%' : '20%'}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.18)" />
                                        <XAxis
                                            dataKey="name"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 12 }}
                                            interval={0}
                                            height={50}
                                            tickFormatter={(val) => {
                                                if (!val) return '';
                                                if (chartPeriod === 'day') {
                                                    const [y, m, d] = val.split('-');
                                                    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                                                    const month = monthNames[parseInt(m, 10) - 1];
                                                    const shortYear = y.substring(2);
                                                    return isMobile ? `${parseInt(d, 10)} ${month}` : `${parseInt(d, 10)} ${month} '${shortYear}`;
                                                }
                                                if (chartPeriod === 'month') {
                                                    const [y, m] = val.split('-');
                                                    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                                                    return `${monthNames[parseInt(m, 10) - 1]} '${y.substring(2)}`;
                                                }
                                                return val;
                                            }}
                                        />
                                        <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                        <Tooltip content={<CustomTooltip seriesMetaMap={chartSeriesMetaMap} />} cursor={{ fill: 'rgba(79, 107, 255, 0.08)' }} />
                                        {chartSeries.map((series) => (
                                            <Bar
                                                key={series.key}
                                                dataKey={series.key}
                                                fill={series.color}
                                                radius={[8, 8, 0, 0]}
                                                maxBarSize={20}
                                                tabIndex={-1}
                                            />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'center' }}>
                                {chartSeries.map((item) => (
                                    <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '12px', height: '12px', background: item.color, borderRadius: '999px', boxShadow: `0 0 12px ${item.color}55` }} />
                                        <span style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: '600' }}>
                                            {item.label} <span style={{ color: item.color, marginLeft: '4px' }}>{item.totalKey ? (normalizedStats?.[item.totalKey] || 0) : '-'}</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Pie Chart */}
                    <div data-scroll-section="overview-distribution" className="admin-analytics-panel" style={{ padding: '1.5rem', borderRadius: '1.25rem', textAlign: 'center', position: 'relative', scrollMarginTop: '110px' }}>
                        <h4 style={{ margin: '0 0 1.5rem 0', fontWeight: '700', color: '#f8fafc', textAlign: 'center' }}>User Status Distribution</h4>
                        <div style={{ height: '280px', width: '100%', position: 'relative' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={distributionMetrics}
                                        innerRadius={isMobile ? 68 : 84}
                                        outerRadius={isMobile ? 98 : 118}
                                        paddingAngle={2}
                                        dataKey="renderValue"
                                        stroke="none"
                                        tabIndex={-1}
                                    >
                                        {distributionMetrics.map((entry, index) => (
                                            <Cell key={`cell-${entry.key}-${index}`} fill={entry.color} stroke="none" style={{ outline: 'none' }} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<PieTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div style={{ marginTop: '1.5rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.9rem 1.25rem' }}>
                            {distributionMetrics.map((item) => (
                                <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '14px', height: '14px', background: item.color, borderRadius: '999px', boxShadow: `0 0 12px ${item.color}55` }} />
                                    <span style={{ fontSize: isMobile ? '0.75rem' : '0.85rem', color: '#cbd5e1', fontWeight: '600' }}>
                                        {item.label} <span style={{ color: item.color, marginLeft: '4px' }}>{item.value}</span>
                                    </span>
                                </div>
                            ))}
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
            <div
                data-scroll-section={listType}
                className="admin-data-panel table-responsive"
                style={{ borderRadius: '1.25rem', overflowX: 'auto', scrollMarginTop: '110px' }}
            >
                <table style={{ minWidth: listType === 'pending' ? (isMobile ? '1120px' : '1280px') : (isMobile ? '800px' : '100%'), borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
                            <th style={{ padding: '1rem', paddingLeft: '2.4rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600' }}>Sl.No</th>
                            <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600' }}>USER</th>
                            <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600' }}>ROLE</th>
                            <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600' }}>EMAIL</th>
                            {(listType === 'management' || listType === 'pending') && <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600', whiteSpace: 'nowrap' }}>LOGIN ID</th>}
                            {listType === 'pending' && <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600' }}>PASSWORD ALLOCATION</th>}
                            <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600', whiteSpace: 'nowrap' }}>DATE & TIME</th>
                            <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600' }}>MANAGE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((u, i) => {
                            const rowId = String(u.id || u._id || '');
                            const isHighlighted = Boolean(
                                highlightedRedirectRow &&
                                highlightedRedirectRow.kind === listType &&
                                highlightedRedirectRow.id === rowId
                            );
                            return (
                            <tr
                                key={u.id}
                                data-redirect-row={`${listType}:${rowId}`}
                                style={{
                                    borderBottom: 'none',
                                    transition: 'all 0.25s ease',
                                    position: 'relative',
                                    zIndex: 0,
                                    background: isHighlighted ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                                    boxShadow: isHighlighted ? 'inset 0 0 0 1px rgba(56, 189, 248, 0.45), 0 16px 36px rgba(2, 6, 23, 0.18)' : 'none'
                                }}
                                className="hover-row"
                                onMouseOver={(e) => {
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                    e.currentTarget.style.boxShadow = '0 16px 36px rgba(2, 6, 23, 0.18)';
                                    e.currentTarget.style.zIndex = '1';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.background = isHighlighted ? 'rgba(56, 189, 248, 0.12)' : 'transparent';
                                    e.currentTarget.style.boxShadow = isHighlighted ? 'inset 0 0 0 1px rgba(56, 189, 248, 0.45), 0 16px 36px rgba(2, 6, 23, 0.18)' : 'none';
                                    e.currentTarget.style.zIndex = '0';
                                }}
                            >
                                <td style={{ padding: '1rem', paddingLeft: '2.4rem', textAlign: 'center', fontSize: '0.95rem', color: OFFICIAL_TEXT_MUTED }}>{i + 1}</td>
                                <td style={{ padding: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.95rem', fontWeight: '600', color: OFFICIAL_TEXT_PRIMARY }}>{u.name}</div>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.95rem', color: OFFICIAL_TEXT_SECONDARY, fontWeight: '500' }}>
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        textAlign: 'center',
                                        padding: '4px 12px',
                                        background: 'rgba(255,255,255,0.05)',
                                        borderRadius: '4px',
                                        fontSize: '0.85rem',
                                        color: '#73a8ff',
                                        fontWeight: '700',
                                        minWidth: '60px',
                                        lineHeight: '1.2'
                                    }}>
                                        {u.designation || (u.role === 'admin' ? 'Admin' : 'User')}
                                    </span>
                                </td>
                                <td
                                    style={{
                                        padding: '1rem',
                                        textAlign: 'center',
                                        fontSize: '0.95rem',
                                        color: OFFICIAL_TEXT_SECONDARY,
                                        minWidth: listType === 'pending' ? '260px' : '180px',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {u.email}
                                </td>
                                {listType === 'management' && <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.95rem', color: OFFICIAL_TEXT_SECONDARY }}>{u.login_id}</td>}
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
                                            style={{ width: '70px', padding: '8px 4px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid #dee2e6', textAlign: 'center' }}
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
                                                    style={{ width: '135px', padding: '8px 24px 8px 8px', fontSize: '0.88rem', borderRadius: '6px', border: '1px solid #dee2e6', textAlign: 'center', outline: 'none' }}
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
                                                    style={{ width: '170px', padding: '8px 24px 8px 8px', fontSize: '0.88rem', borderRadius: '6px', border: '1px solid #dee2e6', textAlign: 'center', outline: 'none' }}
                                                />
                                                <div onClick={() => setShowPassRe({ ...showPassRe, [u.id]: !showPassRe[u.id] })} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#8898aa', display: 'flex', alignItems: 'center' }}>
                                                    {showPassRe[u.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                )}
                                <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9rem', color: OFFICIAL_TEXT_MUTED }}>
                                    {u.created_at ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                            <div style={{ fontWeight: '600', color: OFFICIAL_TEXT_SECONDARY }}>{new Date(u.created_at).toLocaleDateString('en-IN')}</div>
                                            <div style={{ fontSize: '0.8rem', opacity: 0.8, whiteSpace: 'nowrap' }}>
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
                                                    style={getActionButtonStyle('primary')}
                                                    onMouseOver={(e) => applyActionButtonHover(e.currentTarget, 'primary', true)}
                                                    onMouseOut={(e) => applyActionButtonHover(e.currentTarget, 'primary', false)}
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
                                                    style={getActionButtonStyle('danger')}
                                                    onMouseOver={(e) => applyActionButtonHover(e.currentTarget, 'danger', true)}
                                                    onMouseOut={(e) => applyActionButtonHover(e.currentTarget, 'danger', false)}
                                                >
                                                    <X size={16} /> Reject
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleReviewChat(u)}
                                                    style={getActionButtonStyle('primary')}
                                                    onMouseOver={(e) => applyActionButtonHover(e.currentTarget, 'primary', true)}
                                                    onMouseOut={(e) => applyActionButtonHover(e.currentTarget, 'primary', false)}
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
                                                    style={getActionButtonStyle('danger')}
                                                    onMouseOver={(e) => applyActionButtonHover(e.currentTarget, 'danger', true)}
                                                    onMouseOut={(e) => applyActionButtonHover(e.currentTarget, 'danger', false)}
                                                >
                                                    <Trash2 size={16} /> Delete
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderActionTable = (actionType) => {
        const details = [...resolvedActionDetails]
            .filter(item => item.action === actionType)
            .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
        const requestRows = users
            .filter(isBlockReportRestorationRequest)
            .map(user => {
                const userId = String(user.id || user._id || '');
                const related = details.filter(detail => String(detail.targetId || '') === userId);
                if (related.length === 0) return null;
                const oldestRelated = [...related].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))[0];
                return {
                    id: `request-${actionType}-${userId}`,
                    isRequestRow: true,
                    userId,
                    action: actionType,
                    eventAction: 'request',
                    targetType: 'requests',
                    targetId: userId,
                    targetName: user.name || oldestRelated?.targetName || 'Unknown member',
                    targetLoginId: user.login_id || oldestRelated?.targetLoginId || '',
                    reason: user.unblockRequestReason || 'Restoration requested',
                    resolutionStatus: 'pending',
                    created_at: oldestRelated?.created_at,
                    name: user.name || 'Unknown member',
                    login_id: user.login_id || ''
                };
            })
            .filter(Boolean);
        const tableRows = [...details, ...requestRows];
        const title = actionType === 'block' ? 'Block Actions' : 'Report Actions';
        const emptyLabel = actionType === 'block' ? 'block actions' : 'report actions';
        const getTargetLoginLabel = (detail) => detail?.targetLoginId || 'N/A';
        const getEventActionLabel = (detail) => {
            if (detail?.eventAction === 'unblock') return 'Unblocked';
            if (detail?.action === 'block' && detail?.currentBlocked === false) return 'Unblocked';
            if (detail?.eventAction === 'block' || detail?.action === 'block') return 'Blocked';
            if (detail?.eventAction === 'report' || detail?.action === 'report') return 'Reported';
            return 'Action';
        };
        const getEventActionColor = (detail) => {
            const label = getEventActionLabel(detail);
            if (label === 'Unblocked') return '#34d399';
            if (label === 'Reported') return '#facc15';
            return '#fb7185';
        };
        const getStatusColor = (status) => {
            if (status === 'unblocked') return '#34d399';
            if (status === 'reported') return '#facc15';
            return '#fb7185';
        };
        const getStatusLabel = (status) => {
            if (status === 'unblocked') return 'Unblocked';
            if (status === 'reported') return 'Reported';
            return 'Blocked';
        };
        const getResolutionLabel = (detail) => (
            detail?.resolutionStatus === 'solved' ? 'Already solved' : 'Pending'
        );
        const getResolutionColor = (detail) => (
            detail?.resolutionStatus === 'solved' ? '#34d399' : '#fbbf24'
        );
        const getRawActionStatus = (detail) => {
            if (detail?.eventAction === 'unblock') return 'unblocked';
            if (detail?.eventAction === 'report' || detail?.action === 'report') return 'reported';
            if (detail?.eventAction === 'block' || detail?.action === 'block') return 'blocked';
            return getEventActionLabel(detail).toLowerCase() === 'unblocked' ? 'unblocked' : 'blocked';
        };
        const findActionDetailForStatus = (sourceDetail, status) => {
            const related = details
                .filter(item => (
                    String(item.userId || '') === String(sourceDetail?.userId || '') &&
                    String(item.targetId || '') === String(sourceDetail?.targetId || '')
                ))
                .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            const exact = related.find(item => getRawActionStatus(item) === status);
            if (exact) return exact;
            return null;
        };
        const viewButtonStyle = {
            border: ADMIN_ACTION_BORDER,
            background: ADMIN_ACTION_SURFACE,
            color: '#ffffff',
            borderRadius: 999,
            padding: '7px 18px',
            fontWeight: 900,
            cursor: 'pointer',
            minWidth: 104,
            boxShadow: '0 12px 24px rgba(14, 165, 233, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.16)'
        };
        const auditTextButtonStyle = {
            border: ADMIN_ACTION_BORDER,
            background: ADMIN_ACTION_SURFACE,
            color: '#ffffff',
            borderRadius: 999,
            cursor: 'pointer',
            fontWeight: 900,
            padding: '7px 16px',
            boxShadow: '0 12px 24px rgba(14, 165, 233, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.16)'
        };

        const isReportAction = actionType === 'report';
        const activeDetail = actionAuditView?.detail;
        const chosenStatus = actionAuditView?.selectedStatus;
        const chosenDetail = activeDetail && chosenStatus ? findActionDetailForStatus(activeDetail, chosenStatus) : null;
        const activeColor = chosenStatus ? getStatusColor(chosenStatus) : '#9ed6ff';
        const isRequestAudit = activeDetail?.isRequestRow;
        const activeTime = chosenDetail?.created_at
            ? new Date(chosenDetail.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
            : 'N/A';

        return (
            <>
                <div className="table-responsive" style={{ borderRadius: '1.25rem', overflow: 'hidden', background: OFFICIAL_PANEL_SURFACE, border: OFFICIAL_PANEL_BORDER, boxShadow: OFFICIAL_PANEL_SHADOW }}>
                    <div style={{ padding: '1.1rem 1.25rem', borderBottom: '1px solid rgba(148, 163, 184, 0.14)' }}>
                        <h3 style={{ margin: 0, color: OFFICIAL_TEXT_PRIMARY, fontSize: '1rem', fontWeight: 900 }}>{title} History</h3>
                    </div>
                    <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', color: OFFICIAL_TEXT_SECONDARY }}>
                        <thead>
                            <tr style={{ background: 'rgba(15, 23, 42, 0.72)' }}>
                                <th style={{ width: '21%', padding: '0.85rem 1.25rem', textAlign: 'left', color: '#9ed6ff', fontSize: '0.78rem' }}>Member</th>
                                <th style={{ width: '21%', padding: '0.85rem 1rem', textAlign: 'center', color: '#9ed6ff', fontSize: '0.78rem' }}>Victim Login ID</th>
                                <th style={{ width: '20%', padding: '0.85rem 1rem', textAlign: 'center', color: '#9ed6ff', fontSize: '0.78rem' }}>Action</th>
                                <th style={{ width: '20%', padding: '0.85rem 1rem', textAlign: 'center', color: '#9ed6ff', fontSize: '0.78rem' }}>Status</th>
                                <th style={{ width: '18%', padding: '0.85rem 1.25rem', textAlign: 'center', color: '#9ed6ff', fontSize: '0.78rem' }}>Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tableRows.map(detail => {
                                const redirectKey = `moderation:${actionType}:${String(detail.userId || '')}:${String(detail.targetId || '')}`;
                                const isHighlighted = Boolean(
                                    highlightedRedirectRow &&
                                    highlightedRedirectRow.kind === `moderation:${actionType}` &&
                                    highlightedRedirectRow.id === `${String(detail.userId || '')}:${String(detail.targetId || '')}`
                                );
                                return (
                                <tr
                                    key={detail.id}
                                    data-redirect-row={redirectKey}
                                    style={{
                                        borderTop: '1px solid rgba(148, 163, 184, 0.1)',
                                        background: isHighlighted ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                                        boxShadow: isHighlighted ? 'inset 0 0 0 1px rgba(56, 189, 248, 0.45), 0 16px 36px rgba(2, 6, 23, 0.18)' : 'none'
                                    }}
                                >
                                    <td style={{ padding: '0.95rem 1.25rem', fontWeight: 800, color: OFFICIAL_TEXT_PRIMARY }}>
                                        {detail.name || 'Unknown member'}
                                        <div style={{ color: OFFICIAL_TEXT_MUTED, fontSize: '0.72rem', fontWeight: 700 }}>{detail.login_id || 'N/A'}</div>
                                    </td>
                                    <td style={{ padding: '0.95rem 1rem', textAlign: 'center', fontWeight: 900, color: OFFICIAL_TEXT_PRIMARY }}>
                                        {getTargetLoginLabel(detail)}
                                    </td>
                                    <td style={{ padding: '0.95rem 1rem', textAlign: 'center' }}>
                                        <button
                                            type="button"
                                            style={viewButtonStyle}
                                            onClick={() => setActionAuditView({ detail, mode: 'action', selectedStatus: null })}
                                        >
                                            View
                                        </button>
                                    </td>
                                    <td style={{ padding: '0.95rem 1rem', textAlign: 'center' }}>
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: 999,
                                            padding: '6px 12px',
                                            fontSize: '0.72rem',
                                            fontWeight: 900,
                                            color: getResolutionColor(detail),
                                            background: `${getResolutionColor(detail)}18`,
                                            border: `1px solid ${getResolutionColor(detail)}55`,
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {getResolutionLabel(detail)}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.95rem 1.25rem', textAlign: 'center', fontWeight: 700, textTransform: 'capitalize' }}>
                                        {detail.isRequestRow ? 'Requests' : (detail.targetType || 'N/A')}
                                    </td>
                                </tr>
                                );
                            })}
                            {tableRows.length === 0 && (
                                <tr>
                                <td colSpan={5} style={{ padding: '1.5rem', textAlign: 'center', color: OFFICIAL_TEXT_MUTED, fontWeight: 700 }}>No {emptyLabel} yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {actionAuditView && activeDetail && (
                    <div
                        onClick={() => setActionAuditView(null)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 10000,
                            background: 'rgba(3, 10, 26, 0.14)',
                            backdropFilter: 'blur(8px) saturate(145%)',
                            WebkitBackdropFilter: 'blur(8px) saturate(145%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 20
                        }}
                    >
                        <div
                            onClick={(event) => event.stopPropagation()}
                            style={{
                                width: 'min(430px, 100%)',
                                borderRadius: 18,
                                background: 'linear-gradient(180deg, rgba(10, 18, 36, 0.98), rgba(13, 23, 42, 0.96))',
                                border: `1px solid ${activeColor}55`,
                                boxShadow: `0 28px 80px rgba(2, 6, 23, 0.46), 0 0 0 1px ${activeColor}22, inset 0 1px 0 rgba(255, 255, 255, 0.12)`,
                                backdropFilter: 'blur(10px) saturate(135%)',
                                WebkitBackdropFilter: 'blur(10px) saturate(135%)',
                                padding: 22,
                                color: OFFICIAL_TEXT_PRIMARY,
                                position: 'relative'
                            }}
                        >
                            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                                {chosenStatus ? (
                                    <button
                                        type="button"
                                        onClick={() => setActionAuditView(prev => ({ ...prev, selectedStatus: null }))}
                                        style={{ ...auditTextButtonStyle, justifySelf: 'start' }}
                                    >
                                        Back
                                    </button>
                                ) : <span />}
                                <div style={{ fontSize: 18, fontWeight: 900, textAlign: 'center', whiteSpace: 'nowrap' }}>Action Details</div>
                                <button
                                    type="button"
                                    onClick={() => setActionAuditView(null)}
                                    style={{ ...auditTextButtonStyle, justifySelf: 'end' }}
                                >
                                    Close
                                </button>
                            </div>
                            {isRequestAudit ? (
                                <div style={{ display: 'grid', gap: 12, color: OFFICIAL_TEXT_SECONDARY, fontWeight: 700 }}>
                                    <div style={{
                                        padding: '14px 16px',
                                        borderRadius: 14,
                                        background: 'rgba(14, 165, 233, 0.12)',
                                        border: '1px solid rgba(56, 189, 248, 0.34)',
                                        color: '#9ed6ff',
                                        fontSize: 22,
                                        fontWeight: 950,
                                        textAlign: 'center'
                                    }}>
                                        Requests
                                    </div>
                                    <div>User: <span style={{ color: OFFICIAL_TEXT_PRIMARY }}>{activeDetail.name || 'Unknown member'} ({activeDetail.login_id || 'N/A'})</span></div>
                                    <div>Source: <span style={{ color: OFFICIAL_TEXT_PRIMARY }}>{title}</span></div>
                                    <div>Status: <span style={{ color: getResolutionColor(activeDetail) }}>{getResolutionLabel(activeDetail)}</span></div>
                                    <div>Reason:</div>
                                    <div style={{
                                        padding: '12px 14px',
                                        borderRadius: 12,
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(148, 163, 184, 0.14)',
                                        color: OFFICIAL_TEXT_PRIMARY,
                                        fontStyle: 'italic'
                                    }}>
                                        "{activeDetail.reason || 'No reason provided'}"
                                    </div>
                                </div>
                            ) : !chosenStatus ? (
                                <div style={{ display: 'grid', gap: 14 }}>
                                    <div style={{ color: OFFICIAL_TEXT_MUTED, fontWeight: 800, textAlign: 'center' }}>
                                        {isReportAction
                                            ? `Inspect report action for victim login ID ${getTargetLoginLabel(activeDetail)}.`
                                            : `Select which status you want to inspect for victim login ID ${getTargetLoginLabel(activeDetail)}.`}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: isReportAction ? '1fr' : '1fr 1fr', gap: 12 }}>
                                        {(isReportAction ? ['reported'] : ['blocked', 'unblocked']).map((status) => {
                                            const statusDetail = findActionDetailForStatus(activeDetail, status);
                                            const color = getStatusColor(status);
                                            const available = !!statusDetail;
                                            const isUnblocked = status === 'unblocked';
                                            const isReported = status === 'reported';
                                            return (
                                                <button
                                                    key={status}
                                                    type="button"
                                                    onClick={() => {
                                                        if (!available) {
                                                            showSnackbar(`Alert: ${getStatusLabel(status)} record is not available for this victim.`, 'warning');
                                                            return;
                                                        }
                                                        setActionAuditView(prev => ({ ...prev, selectedStatus: status }));
                                                    }}
                                                    onMouseEnter={(event) => {
                                                        event.currentTarget.style.transform = 'translateY(-2px)';
                                                        event.currentTarget.style.filter = 'brightness(1.08) saturate(1.08)';
                                                        event.currentTarget.style.boxShadow = isReported
                                                            ? '0 20px 42px rgba(244, 138, 0, 0.34), 0 0 28px rgba(255, 204, 21, 0.18), inset 0 1px 1px rgba(255,255,255,0.30)'
                                                            : isUnblocked
                                                                ? '0 20px 42px rgba(47, 140, 255, 0.38), 0 0 28px rgba(34, 198, 243, 0.16), inset 0 1px 1px rgba(255,255,255,0.30)'
                                                                : '0 20px 42px rgba(244, 63, 94, 0.38), 0 0 28px rgba(255, 91, 110, 0.16), inset 0 1px 1px rgba(255,255,255,0.30)';
                                                    }}
                                                    onMouseLeave={(event) => {
                                                        event.currentTarget.style.transform = 'translateY(0)';
                                                        event.currentTarget.style.filter = 'none';
                                                        event.currentTarget.style.boxShadow = isReported
                                                            ? '0 16px 34px rgba(244, 138, 0, 0.24), 0 0 18px rgba(255, 204, 21, 0.12), inset 0 1px 1px rgba(255,255,255,0.25)'
                                                            : isUnblocked
                                                                ? '0 16px 34px rgba(47, 140, 255, 0.28), 0 0 18px rgba(34, 198, 243, 0.12), inset 0 1px 1px rgba(255,255,255,0.25)'
                                                                : '0 16px 34px rgba(244, 63, 94, 0.28), 0 0 18px rgba(255, 91, 110, 0.12), inset 0 1px 1px rgba(255,255,255,0.25)';
                                                    }}
                                                    style={{
                                                        minHeight: 54,
                                                        borderRadius: 16,
                                                        border: 'none',
                                                        background: isReported
                                                            ? 'linear-gradient(135deg, #ffcc15 0%, #f4b000 48%, #f08a00 100%)'
                                                            : isUnblocked
                                                                ? 'linear-gradient(135deg, #22c6f3 0%, #2f8cff 58%, #5b6cff 100%)'
                                                                : 'linear-gradient(135deg, #ff5b6e 0%, #f43f5e 58%, #be123c 100%)',
                                                        color: '#ffffff',
                                                        fontWeight: 950,
                                                        fontSize: 16,
                                                        cursor: 'pointer',
                                                        boxShadow: isReported
                                                            ? '0 16px 34px rgba(244, 138, 0, 0.24), 0 0 18px rgba(255, 204, 21, 0.12), inset 0 1px 1px rgba(255,255,255,0.25)'
                                                            : isUnblocked
                                                                ? '0 16px 34px rgba(47, 140, 255, 0.28), 0 0 18px rgba(34, 198, 243, 0.12), inset 0 1px 1px rgba(255,255,255,0.25)'
                                                                : '0 16px 34px rgba(244, 63, 94, 0.28), 0 0 18px rgba(255, 91, 110, 0.12), inset 0 1px 1px rgba(255,255,255,0.25)',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: 8,
                                                        opacity: available ? 1 : 0.72,
                                                        transition: 'transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease'
                                                    }}
                                                >
                                                    {isReported ? <AlertTriangle size={18} /> : isUnblocked ? <ShieldCheck size={18} /> : <Ban size={18} />}
                                                    {getStatusLabel(status)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: 12, color: OFFICIAL_TEXT_SECONDARY, fontWeight: 700 }}>
                                    <div>Member: <span style={{ color: OFFICIAL_TEXT_PRIMARY }}>{activeDetail.name || 'Unknown member'} ({activeDetail.login_id || 'N/A'})</span></div>
                                    <div>Victim Login ID: <span style={{ color: OFFICIAL_TEXT_PRIMARY }}>{getTargetLoginLabel(activeDetail)}</span></div>
                                    <div>Status: <span style={{ color: getResolutionColor(activeDetail) }}>{getResolutionLabel(activeDetail)}</span></div>
                                    {chosenDetail ? (
                                        <>
                                            <div style={{
                                                marginTop: 4,
                                                padding: '14px 16px',
                                                borderRadius: 14,
                                                background: `${activeColor}18`,
                                                border: `1px solid ${activeColor}66`,
                                                color: activeColor,
                                                fontSize: 24,
                                                fontWeight: 950,
                                                textAlign: 'center'
                                            }}>
                                                {getStatusLabel(chosenStatus)}
                                            </div>
                                            <div style={{ textAlign: 'center', color: OFFICIAL_TEXT_MUTED, fontWeight: 800 }}>Time: {activeTime}</div>
                                        </>
                                    ) : (
                                        <div style={{
                                            marginTop: 4,
                                            padding: '14px 16px',
                                            borderRadius: 14,
                                            background: 'rgba(245, 158, 11, 0.14)',
                                            border: '1px solid rgba(245, 158, 11, 0.5)',
                                            color: '#fbbf24',
                                            fontSize: 16,
                                            fontWeight: 900,
                                            textAlign: 'center'
                                        }}>
                                            Alert: {getStatusLabel(chosenStatus)} record is not available for this victim.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </>
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
            <div data-scroll-section="resets" className="admin-data-panel" style={{ borderRadius: '1.25rem', overflowX: 'auto', scrollMarginTop: '110px' }}>
                {filteredResets.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: OFFICIAL_TEXT_MUTED }}>
                        <Search size={40} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                        <div>No password reset requests found{query ? ` for "${searchQuery}"` : ''}.</div>
                    </div>
                ) : (
                    <table style={{ minWidth: isMobile ? '800px' : '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
                                <th style={{ padding: '1rem', paddingLeft: '2.4rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600' }}>Sl.No</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600' }}>USER</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600', whiteSpace: 'nowrap' }}>LOGIN ID</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600' }}>NEW PASSWORD</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600', whiteSpace: 'nowrap' }}>DATE & TIME</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600' }}>MANAGE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredResets.map((r, i) => {
                                const rowId = String(r.id || '');
                                const isHighlighted = Boolean(
                                    highlightedRedirectRow &&
                                    highlightedRedirectRow.kind === 'reset' &&
                                    highlightedRedirectRow.id === rowId
                                );
                                return (
                                <tr
                                    key={r.id}
                                    data-redirect-row={`reset:${rowId}`}
                                    style={{
                                        borderBottom: 'none',
                                        transition: 'all 0.25s ease',
                                        position: 'relative',
                                        zIndex: 0,
                                        background: isHighlighted ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                                        boxShadow: isHighlighted ? 'inset 0 0 0 1px rgba(56, 189, 248, 0.45), 0 16px 36px rgba(2, 6, 23, 0.18)' : 'none'
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.transform = 'none';
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                        e.currentTarget.style.boxShadow = '0 16px 36px rgba(2, 6, 23, 0.18)';
                                        e.currentTarget.style.zIndex = '1';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.transform = 'none';
                                        e.currentTarget.style.background = isHighlighted ? 'rgba(56, 189, 248, 0.12)' : 'transparent';
                                        e.currentTarget.style.boxShadow = isHighlighted ? 'inset 0 0 0 1px rgba(56, 189, 248, 0.45), 0 16px 36px rgba(2, 6, 23, 0.18)' : 'none';
                                        e.currentTarget.style.zIndex = '0';
                                    }}
                                >
                                    <td style={{ padding: '1rem', paddingLeft: '2.4rem', textAlign: 'center', fontSize: '0.85rem', color: OFFICIAL_TEXT_MUTED }}>{i + 1}</td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <div style={{ fontWeight: '600', color: OFFICIAL_TEXT_PRIMARY, fontSize: '0.9rem' }}>{r.name}</div>
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: OFFICIAL_TEXT_SECONDARY }}>{r.login_id}</td>
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
                                                        fontSize: '0.78rem',
                                                        width: '120px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #cbd5e1',
                                                        outline: 'none',
                                                        color: OFFICIAL_TEXT_SECONDARY,
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
                                                        fontSize: '0.78rem',
                                                        width: '155px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #cbd5e1',
                                                        outline: 'none',
                                                        color: OFFICIAL_TEXT_SECONDARY,
                                                        textAlign: 'center'
                                                    }}
                                                />
                                                <div onClick={() => setShowPass({ ...showPass, [`reset-confirm-${r.id}`]: !showPass[`reset-confirm-${r.id}`] })} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                                                    {showPass[`reset-confirm-${r.id}`] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED }}>
                                        {r.created_at ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                                <div style={{ fontWeight: '600', color: OFFICIAL_TEXT_SECONDARY }}>{new Date(r.created_at).toLocaleDateString('en-IN')}</div>
                                                <div style={{ fontSize: '0.72rem', opacity: 0.8, whiteSpace: 'nowrap' }}>
                                                    {new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                </div>
                                            </div>
                                        ) : 'N/A'}
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                                            <button
                                                onClick={() => handleReset(r.id, r.user_id)}
                                                style={getActionButtonStyle('primary')}
                                                onMouseOver={(e) => applyActionButtonHover(e.currentTarget, 'primary', true)}
                                                onMouseOut={(e) => applyActionButtonHover(e.currentTarget, 'primary', false)}
                                            >
                                                <RefreshCw size={16} /> Update
                                            </button>
                                            <button
                                                onClick={() => triggerConfirm('Delete Reset Request?', `Delete request for ${r.name}?`, async () => {
                                                    await axios.delete(`/api/admin/reset/${r.id}`);
                                                    fetchData();
                                                    fetchStats();
                                                    closeConfirm();
                                                    showSnackbar(`Reset Request deleted for: ${r.name}`, 'success');
                                                })}
                                                style={getActionButtonStyle('danger')}
                                                onMouseOver={(e) => applyActionButtonHover(e.currentTarget, 'danger', true)}
                                                onMouseOut={(e) => applyActionButtonHover(e.currentTarget, 'danger', false)}
                                            >
                                                <Trash2 size={16} /> Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        );
    };

    const renderReactionLogs = () => {
        return (
            <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 0 2rem rgba(0,0,0,0.05)', minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Smile size={18} color="#0FB5D0" />
                        <h4 style={{ margin: 0, fontWeight: '700', color: '#32325d' }}>Global Reaction Activity Audit</h4>
                    </div>
                    <button
                        onClick={fetchReactionLogs}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f6f9fc', border: '1px solid #e9ecef', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '700', color: '#0FB5D0', cursor: 'pointer' }}
                    >
                        <RefreshCw size={14} /> Refresh Logs
                    </button>
                </div>

                {!reactionLogs || reactionLogs.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#8898aa', background: '#f8f9fe', borderRadius: '12px', border: '2px dashed #e9ecef' }}>
                        No reaction activities found across the platform.
                    </div>
                ) : (
                    <div className="table-responsive" style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0' }}>
                            <thead>
                                <tr style={{ background: '#f6f9fc' }}>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#8898aa', textTransform: 'uppercase', borderRadius: '8px 0 0 0' }}>Reactor</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.75rem', fontWeight: '700', color: '#8898aa', textTransform: 'uppercase' }}>Emoji</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#8898aa', textTransform: 'uppercase' }}>Action</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#8898aa', textTransform: 'uppercase' }}>Message Content</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#8898aa', textTransform: 'uppercase' }}>Context</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '0.75rem', fontWeight: '700', color: '#8898aa', textTransform: 'uppercase', borderRadius: '0 8px 0 0' }}>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reactionLogs.map((log, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f3f5' }} className="hover-row">
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(87deg, #0A7C8F 0, #0FB5D0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.7rem', fontWeight: 'bold' }}>
                                                    {log.user_id?.name?.charAt(0) || '?'}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: '700', fontSize: '0.85rem', color: '#32325d' }}>{log.user_id?.name || 'Unknown'}</span>
                                                    <span style={{ fontSize: '0.7rem', color: '#8898aa' }}>ID: {log.user_id?.login_id || 'N/A'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '1.2rem' }}>
                                            {log.emoji}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: '800',
                                                background: log.action === 'added' ? '#e1f5fe' : '#fff1f2',
                                                color: log.action === 'added' ? '#01579b' : '#be123c',
                                                textTransform: 'capitalize',
                                                display: 'inline-flex', alignItems: 'center', gap: '4px'
                                            }}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ fontSize: '0.825rem', color: '#525f7f', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {log.contentSnippet}
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#32325d' }}>{log.context}</span>
                                                <span style={{ fontSize: '0.65rem', color: '#8898aa' }}>{log.participants}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.8rem', color: '#525f7f' }}>
                                                {new Date(log.timestamp).toLocaleDateString()}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#adb5bd' }}>
                                                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    const renderUnblockRequests = () => {
        const unblockReqs = users.filter(u => u.unblockRequested && !isBlockReportRestorationRequest(u));

        if (unblockReqs.length === 0) {
            return (
                <div data-scroll-section="unblock" className="admin-empty-panel" style={{ borderRadius: '1.25rem', padding: '3rem', textAlign: 'center', scrollMarginTop: '110px' }}>
                    <ShieldCheck size={48} color="#6e72ff" style={{ marginBottom: '1rem', opacity: 0.8 }} />
                    <h3 style={{ margin: 0, color: OFFICIAL_TEXT_PRIMARY }}>No pending unblock requests</h3>
                    <p style={{ color: OFFICIAL_TEXT_MUTED, marginTop: '0.5rem' }}>All messaging restrictions are currently active or resolved.</p>
                </div>
            );
        }

        return (
            <div data-scroll-section="unblock" className="admin-data-panel" style={{ borderRadius: '1.25rem', overflowX: 'auto', scrollMarginTop: '110px' }}>
                <table style={{ minWidth: isMobile ? '800px' : '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
                            <th style={{ padding: '1rem', paddingLeft: '2.4rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600' }}>SL.NO</th>
                            <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600' }}>USER</th>
                            <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600' }}>JUSTIFICATION / REASON</th>
                            <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600' }}>STRIKES</th>
                            <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '600' }}>MANAGE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {unblockReqs.map((u, i) => {
                            const rowId = String(u.id || u._id || '');
                            const isHighlighted = Boolean(
                                highlightedRedirectRow &&
                                highlightedRedirectRow.kind === 'unblock' &&
                                highlightedRedirectRow.id === rowId
                            );
                            return (
                            <tr
                                key={u.id}
                                data-redirect-row={`unblock:${rowId}`}
                                className="hover-row"
                                style={{
                                    borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
                                    background: isHighlighted ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                                    boxShadow: isHighlighted ? 'inset 0 0 0 1px rgba(56, 189, 248, 0.45), 0 16px 36px rgba(2, 6, 23, 0.18)' : 'none'
                                }}
                            >
                                <td style={{ padding: '1rem', paddingLeft: '2.4rem', textAlign: 'center', fontSize: '0.85rem', color: OFFICIAL_TEXT_MUTED }}>{i + 1}</td>
                                <td style={{ padding: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid rgba(148, 163, 184, 0.12)' }}>
                                            {u.image ? <img src={u.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={16} color="#73a8ff" />}
                                        </div>
                                        <div style={{ textAlign: 'left' }}>
                                            <div style={{ fontWeight: '700', color: OFFICIAL_TEXT_PRIMARY, fontSize: '0.85rem' }}>{u.name}</div>
                                            <div style={{ fontSize: '0.72rem', color: OFFICIAL_TEXT_MUTED }}>ID: {u.login_id}</div>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                    <div style={{
                                        background: 'rgba(255,255,255,0.04)',
                                        padding: '10px 15px',
                                        borderRadius: '12px',
                                        fontSize: '0.8rem',
                                        color: OFFICIAL_TEXT_SECONDARY,
                                        maxWidth: '300px',
                                        margin: '0 auto',
                                        fontStyle: 'italic',
                                        border: '1px solid rgba(148, 163, 184, 0.12)'
                                    }}>
                                        "{u.unblockRequestReason || 'No reason provided'}"
                                    </div>
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                    <span style={{
                                        padding: '4px 10px',
                                        background: 'rgba(255,255,255,0.06)',
                                        color: OFFICIAL_TEXT_SECONDARY,
                                        borderRadius: '12px',
                                        fontSize: '0.72rem',
                                        fontWeight: '700'
                                    }}>
                                        {u.unethicalCount || 0} / 5 Strikes
                                    </span>
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                                        <button
                                            onClick={() => handleApproveUnblock(u.id)}
                                            style={getActionButtonStyle('primary')}
                                            onMouseOver={e => applyActionButtonHover(e.currentTarget, 'primary', true)}
                                            onMouseOut={e => applyActionButtonHover(e.currentTarget, 'primary', false)}
                                        >
                                            <Check size={16} /> Restore
                                        </button>
                                        <button
                                            onClick={() => handleRejectUnblock(u.id)}
                                            style={getActionButtonStyle('danger')}
                                            onMouseOver={e => applyActionButtonHover(e.currentTarget, 'danger', true)}
                                            onMouseOut={e => applyActionButtonHover(e.currentTarget, 'danger', false)}
                                        >
                                            <X size={16} /> Reject
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    // --------------------------------------------------------------------------------
    // MAIN LAYOUT
    // --------------------------------------------------------------------------------

    return (
        <div className="dashboard-layout" style={{ display: 'flex', height: '100vh', width: '100vw', background: 'transparent', fontFamily: "'Open Sans', sans-serif", position: 'relative', overflow: 'hidden' }}>
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
            <div className={`sidebar${isMobile && mobileSidebarOpen ? ' mobile-open' : ''}`} style={{
                 width: isMobile ? '304px' : (sidebarOpen ? '300px' : '84px'),
                 background: 'white',
                 transition: 'all 0.3s ease',
                 boxShadow: '0 0 2rem rgba(0,0,0,0.05)',
                 display: 'flex',
                 flexDirection: 'column',
                 zIndex: isMobile ? 1002 : 100,
                 position: isMobile ? 'fixed' : 'relative',
                 left: isMobile ? (mobileSidebarOpen ? 0 : '-304px') : 0,
                 height: '100vh'
             }}>
                <div
                    style={{ padding: '0', height: '60px', display: 'flex', alignItems: 'center', gap: '3px', borderBottom: 'none', boxShadow: 'none' }}
                >
                    <div
                        onClick={() => {
                            if (isMobile) setMobileSidebarOpen(false);
                            else setSidebarOpen(!sidebarOpen);
                        }}
                        style={{
                            width: (isMobile || sidebarOpen) ? '70px' : '64px', height: (isMobile || sidebarOpen) ? '38px' : '48px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer'
                        }}
                    >
                        <img src={logo} alt="Neural Chat Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                    {(isMobile || sidebarOpen) && <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#9ed6ff', margin: 0, fontFamily: 'Public Sans, sans-serif', whiteSpace: 'nowrap' }}>Neural Chat</h2>}
                </div>

                <div style={{ flex: 1, padding: '0.5rem 0' }}>
                    {[
                        { id: 'overview', name: 'Dashboard', icon: LayoutDashboard, color: '#73a8ff' },
                        { id: 'management', name: 'Total Users', icon: Users, count: normalizedStats?.totalUsers, color: '#1a9cff' },
                        { id: 'pending', name: 'Pending Approvals', icon: UserCheck, count: normalizedStats?.pendingApprovals, color: '#2e7bff' },
                        { id: 'resets', name: 'Reset Requests', icon: Key, count: normalizedStats?.activeResets, color: '#4e59ff' },
                        { id: 'unblock', name: 'Unblock Requests', icon: ShieldCheck, count: normalizedStats?.unblockRequests, color: '#6e72ff' },
                        { id: 'block-actions', name: 'Block Actions', icon: XCircle, count: normalizedStats?.totalBlocks, color: '#73a8ff' },
                        { id: 'report-actions', name: 'Report Actions', icon: AlertTriangle, count: normalizedStats?.totalReports, color: '#73a8ff' }
                    ].map(item => (
                        <div
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            style={{
                                display: 'flex', alignItems: 'center',
                                justifyContent: (isMobile || sidebarOpen) ? 'flex-start' : 'center',
                                gap: (isMobile || sidebarOpen) ? '1rem' : '0',
                                padding: (isMobile || sidebarOpen) ? (isMobile ? '0.9rem 1.35rem' : '0.8rem 1.5rem') : '0.8rem 0',
                                cursor: 'pointer',
                                marginBottom: '0.5rem',
                                transition: 'all 0.2s',
                                background: 'transparent',
                                color: item.color,
                                position: 'relative'
                            }}
                        >
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: sidebarOpen || isMobile ? '20px' : '22px', height: sidebarOpen || isMobile ? '20px' : '22px' }}>
                                <item.icon size={sidebarOpen || isMobile ? 18 : 20} strokeWidth={2} style={{ color: item.color }} />
                                {(item.count !== undefined) && (
                                    <span style={{
                                        position: 'absolute',
                                        top: '-8px',
                                        right: '-10px',
                                        minWidth: '17px',
                                        height: '17px',
                                        padding: '0 4px',
                                        borderRadius: '999px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: 'linear-gradient(135deg, #59b7ff 0%, #4e59ff 100%)',
                                        color: '#ffffff',
                                        fontSize: '0.62rem',
                                        fontWeight: '800',
                                        lineHeight: 1,
                                        border: '2px solid rgba(15, 23, 42, 0.96)',
                                        zIndex: 2,
                                        boxShadow: '0 8px 18px rgba(78, 89, 255, 0.35)'
                                    }}>
                                        {item.count || 0}
                                    </span>
                                )}
                            </div>
                            {(isMobile || sidebarOpen) && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', alignItems: 'center', flex: 1, marginLeft: '0.9rem', gap: '0.8rem', minWidth: 0 }}>
                                    <span style={{ fontWeight: activeTab === item.id ? '800' : '600', fontSize: isMobile ? '0.96rem' : '0.88rem', whiteSpace: 'nowrap', lineHeight: 1.1 }}>{item.name}</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="admin-main-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

                {/* Top Header */}
                <header className="admin-top-header admin-top-header-glass" style={{
                     height: isMobile ? '58px' : '64px',
                     background: 'transparent',
                     borderBottom: 'none',
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                     padding: isMobile ? '0 0.55rem' : '0 2.5rem',
                     boxShadow: 'none',
                     borderRadius: isMobile ? '0 0 18px 18px' : '0',
                     marginTop: isMobile ? '14px' : '20px',
                     marginLeft: 0,
                     marginRight: 0,
                     transition: 'none'
                 }}>
                    <div style={{ width: '100%', maxWidth: '1200px', display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'space-between' : 'flex-end', minWidth: 0 }}>
                        {isMobile && (
                            <div
                                onClick={() => setMobileSidebarOpen(true)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', minWidth: 0, flexShrink: 1
                                }}
                            >
                                <div style={{ width: '40px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <img src={logo} alt="Neural Chat Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.6rem' : '0.85rem', marginLeft: isMobile ? '0.5rem' : 'auto', justifyContent: 'flex-end', flexShrink: 0, flex: isMobile ? 1 : 'unset', minWidth: 0 }}>

                        <div style={{ position: 'relative', width: isMobile ? 'auto' : '320px', marginLeft: 0, flexShrink: 0, flex: isMobile ? 1 : 'unset', minWidth: isMobile ? 0 : 'unset' }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input
                                type="search"
                                name="new-search-query"
                                className="admin-header-search"
                                autoComplete="new-password"
                                data-lpignore="true"
                                placeholder={isMobile ? "Search users" : "Search users by name, ID or email"}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%', padding: '10px 10px 10px 40px', borderRadius: '20px',
                                    border: '1px solid rgba(148, 163, 184, 0.3)',
                                    background: 'rgba(15, 23, 42, 0.65)',
                                    fontSize: '0.85rem',
                                    color: '#e2e8f0'
                                }}
                            />
                        </div>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                            <div
                                onClick={(e) => { e.stopPropagation(); setShowNotifications(!showNotifications); }}
                                style={{
                                    cursor: 'pointer', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: '50%',
                                    background: 'transparent',
                                    transition: 'background 0.2s', position: 'relative'
                                }}
                            >
                                <Bell
                                    size={20}
                                    color={showNotifications ? '#e2e8f0' : '#cbd5e1'}
                                    fill="none"
                                />
                                {reviewNotifications.length > 0 && (
                                    <span style={{
                                        position: 'absolute', top: '1px', right: '1px',
                                        background: 'linear-gradient(135deg, #59b7ff 0%, #4e59ff 100%)', color: 'white', fontSize: '0.62rem',
                                        minWidth: '17px', height: '17px', borderRadius: '999px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        padding: '0 4px',
                                        fontWeight: '700', border: '2px solid rgba(12, 20, 38, 0.9)',
                                        boxShadow: '0 8px 18px rgba(78, 89, 255, 0.35)',
                                        lineHeight: 1,
                                        zIndex: 2
                                    }}>
                                        {reviewNotifications.length}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0' : '0.75rem', cursor: 'pointer', padding: isMobile ? '0' : '10px', borderRadius: '10px', transition: 'background 0.2s', flexShrink: 0 }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden' }}>
                                <div style={{ width: '100%', height: '100%', background: ADMIN_PILL_GRADIENT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                                    {adminUser.name.charAt(0)}
                                </div>
                            </div>
                            {!isMobile && <div style={{ fontWeight: '600', color: '#e2e8f0', fontSize: '0.875rem' }}>{adminUser.name}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: isMobile ? '0.6rem' : '0.55rem', color: '#cbd5e1', alignItems: 'center', marginRight: 0, flexShrink: 0 }}>
                            <div
                                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: isMobile ? '32px' : '32px', height: isMobile ? '32px' : '32px', position: 'relative' }}
                                onClick={() => { localStorage.clear(); sessionStorage.clear(); navigate('/'); }}
                                onMouseEnter={() => setShowLogoutTooltip(true)}
                                onMouseLeave={() => setShowLogoutTooltip(false)}
                            >
                                <LogOut size={isMobile ? 17 : 18} />
                                {showLogoutTooltip && !isMobile && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '45px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        color: '#9ed6ff',
                                        fontWeight: '600',
                                        fontSize: '14px',
                                        whiteSpace: 'nowrap',
                                        zIndex: 1000,
                                        pointerEvents: 'none',
                                        background: 'linear-gradient(180deg, rgba(10, 18, 36, 0.98) 0%, rgba(13, 23, 42, 0.96) 100%)',
                                        padding: '7px 14px',
                                        borderRadius: '999px',
                                        border: '1px solid rgba(56, 189, 248, 0.24)',
                                        boxShadow: '0 14px 34px rgba(2, 6, 23, 0.45), 0 0 18px rgba(56, 189, 248, 0.18)',
                                        backdropFilter: 'blur(10px)'
                                    }}>
                                        Logout
                                    </div>
                                )}
                            </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Dashboard View */}
                <main
                    ref={mainScrollRef}
                    className="admin-scroll-main"
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        padding: isMobile ? '1rem 1rem 1.25rem' : '1.25rem 2.5rem 2rem',
                        background: 'transparent',
                        position: 'relative',
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none'
                    }}
                >
                    <div className="admin-scroll-shell" style={{ maxWidth: '1200px', margin: '0 auto', minWidth: 0, position: 'relative' }}>

                        {(activeTab === 'overview' || activeTab === 'management' || activeTab === 'pending' || activeTab === 'resets' || activeTab === 'unblock' || activeTab === 'block-actions' || activeTab === 'report-actions') && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2rem' }}>
                                <div style={{
                                    width: '36px', height: '36px',
                                    background: ADMIN_PILL_GRADIENT,
                                    borderRadius: '12px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 12px 24px rgba(78, 89, 255, 0.26)'
                                }}>
                                    {activeTab === 'overview' && <LayoutDashboard size={20} color="white" />}
                                    {activeTab === 'management' && <Users size={20} color="white" />}
                                    {activeTab === 'pending' && <UserCheck size={20} color="white" />}
                                    {activeTab === 'resets' && <Key size={20} color="white" />}
                                    {activeTab === 'unblock' && <ShieldCheck size={20} color="white" />}
                                    {activeTab === 'block-actions' && <XCircle size={20} color="white" />}
                                    {activeTab === 'report-actions' && <AlertTriangle size={20} color="white" />}
                                </div>
                                <h1 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#f8fafc', fontStyle: 'normal', margin: 0 }}>
                                    {activeTab === 'overview' && 'Dashboard'}
                                    {activeTab === 'management' && 'Total Users'}
                                    {activeTab === 'pending' && 'Pending Approvals'}
                                    {activeTab === 'resets' && 'Reset Requests'}
                                    {activeTab === 'unblock' && 'Unblock Requests'}
                                    {activeTab === 'block-actions' && 'Block Actions'}
                                    {activeTab === 'report-actions' && 'Report Actions'}
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
                                {activeTab === 'unblock' && renderUnblockRequests()}
                                {activeTab === 'block-actions' && renderActionTable('block')}
                                {activeTab === 'report-actions' && renderActionTable('report')}
                                {activeTab === 'reactions' && renderReactionLogs()}
                            </>
                        )}
                    </div>
                    {showScrollControl && (canScrollUp || canScrollDown) && (
                        <button
                            type="button"
                            onClick={handleFloatingScroll}
                            aria-label={canScrollDown ? 'Scroll down' : 'Scroll up'}
                            style={{
                                position: 'fixed',
                                right: isMobile ? '10px' : '14px',
                                top: `${scrollControlTop}%`,
                                transform: 'translateY(-50%)',
                                width: isMobile ? '42px' : '48px',
                                height: isMobile ? '42px' : '48px',
                                borderRadius: '50%',
                                border: 'none',
                                background: 'linear-gradient(180deg, rgba(44, 48, 57, 0.92) 0%, rgba(34, 37, 45, 0.92) 100%)',
                                backdropFilter: 'blur(18px)',
                                WebkitBackdropFilter: 'blur(18px)',
                                boxShadow: '0 18px 40px rgba(2, 6, 23, 0.28)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0px',
                                color: '#cbd5e1',
                                cursor: isDraggingScrollControl ? 'grabbing' : 'grab',
                                zIndex: 80,
                                touchAction: 'none',
                                userSelect: 'none'
                            }}
                            className="admin-page-scroll-button"
                            onPointerDown={(event) => {
                                event.preventDefault();
                                event.currentTarget.setPointerCapture?.(event.pointerId);
                                setIsDraggingScrollControl(true);
                                setShowScrollControl(true);
                            }}
                        >
                            <ChevronDown size={isMobile ? 13 : 15} style={{ transform: 'rotate(180deg)', opacity: canScrollUp ? 1 : 0.45 }} />
                            <ChevronDown size={isMobile ? 13 : 15} style={{ opacity: canScrollDown ? 1 : 0.45, marginTop: '-2px' }} />
                        </button>
                    )}
                </main>
                {renderNotificationDropdown()}
                {renderMediaLightbox()}
            </div>

            {/* Chat Overlays & Modals (Overhauled for premium look) */}
            {viewChat && (
                <div
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(50,50,93,0.3)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                    onClick={() => setViewChat(null)}
                >
                    <div
                        style={{ background: '#0f172a', width: isMobile ? '95%' : '90%', maxWidth: '800px', height: isMobile ? '90vh' : '85vh', borderRadius: '1.5rem', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 50px 100px rgba(2, 6, 23, 0.42)', position: 'relative', border: '1px solid rgba(148, 163, 184, 0.14)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ padding: isMobile ? '1rem' : '1.5rem', background: ADMIN_PILL_GRADIENT, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: isMobile ? '0.75rem' : '0' }}>
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

                        <div
                            ref={reviewScrollRef}
                            style={{ flex: 1, padding: isMobile ? '1rem 0.75rem 1rem 1rem' : '1.5rem', overflowY: 'auto', background: '#111827', position: 'relative' }}
                        >
                            {loadingChat ? (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Loading logs...</div>
                            ) : (
                                <>
                                    {chatStep === 'contacts' && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                                            {chatContacts.filter(c => c.type !== 'ai' && c.name !== 'AI Assistant').map(c => (
                                                <div key={c.id} onClick={() => handleSelectContact(c)} style={{ background: '#172033', padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(148, 163, 184, 0.12)', cursor: 'pointer', transition: 'all 0.2s' }} className="hover-card">
                                                    <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#f8fafc' }}>{c.name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{c.subtext || (c.type === 'ai' ? 'Automated Assistant' : (c.type === 'group' ? 'Group Chat' : 'Peer-to-Peer Chat'))}</div>
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
                                                    <div key={year} onClick={() => handleSelectYear(year)} style={{ background: '#172033', padding: '1.5rem 1rem', borderRadius: '1.2rem', border: '1px solid rgba(148, 163, 184, 0.14)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="hover-card">
                                                        <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f8fafc' }}>{year}</div>
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
                                                        <div key={m} onClick={() => handleSelectMonth(m)} style={{ background: '#172033', padding: '1.5rem 1rem', borderRadius: '1.2rem', border: '1px solid rgba(148, 163, 184, 0.14)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }} className="hover-card">
                                                            <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc' }}>{monthName}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>{selectedYear}</div>
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
                                                        <div key={d} onClick={() => handleSelectDate(d)} style={{ background: '#172033', padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(148, 163, 184, 0.14)', cursor: 'pointer', textAlign: 'center' }}>
                                                            <Calendar size={20} color="#8ed2ff" style={{ marginBottom: '0.5rem' }} />
                                                            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#e2e8f0' }}>{formattedDate}</div>
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
                                                                    background: '#172033',
                                                                    padding: '4px 16px',
                                                                    borderRadius: '20px',
                                                                    fontSize: '0.75rem',
                                                                    color: '#94a3b8',
                                                                    fontWeight: '600',
                                                                    zIndex: 2,
                                                                    border: '1px solid rgba(148, 163, 184, 0.14)',
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
                                                                            padding: '0.8rem 1.1rem', borderRadius: '1.25rem',
                                                                            background: msg.type === 'audio' ? 'transparent' : (isMe ? 'linear-gradient(135deg, #1498ff 0%, #0FB5D0 100%)' : '#172033'),
                                                                            color: isMe ? '#ffffff' : '#e2e8f0',
                                                                            boxShadow: isSelected ? '0 0 0 3px rgba(15, 181, 208, 0.35)' : (isMe ? '0 4px 15px rgba(10, 124, 143, 0.2)' : '0 2px 8px rgba(0,0,0,0.06)'),
                                                                            border: isMe ? 'none' : '1px solid rgba(148, 163, 184, 0.16)',
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
                                                                                    left: 'auto', color: 'rgba(255,255,255,0.65)',
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
                                                                            <div style={{ fontSize: '0.75rem', marginBottom: '6px', display: 'flex', alignItems: 'center', color: isMe ? '#fff176' : '#ffb4a3', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                                                                <AlertTriangle size={12} style={{ marginRight: '4px' }} /> Unethical: {msg.flag_reason || 'Flagged'}
                                                                            </div>
                                                                        )}
                                                                        {msg.is_deleted_by_user && (
                                                                            <div style={{ fontSize: '0.85rem', marginBottom: '6px', display: 'flex', alignItems: 'center', color: isMe ? 'rgba(255,255,255,0.85)' : '#8898aa', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                                                                <XCircle size={14} style={{ marginRight: '4px' }} /> Deleted by User
                                                                            </div>
                                                                        )}

                                                                        {renderLinkPreview(msg)}

                                                                        {msg.type === 'image' && msg.file_path && (
                                                                            <div style={{ marginTop: '8px', position: 'relative', cursor: 'zoom-in' }} onClick={(e) => { e.stopPropagation(); setViewingMedia(msg); }}>
                                                                                <img src={getAdminMediaUrl(msg.file_path)} alt="media" style={{ maxWidth: '100%', borderRadius: '8px', maxHeight: '200px', objectFit: 'contain' }} />
                                                                                {msg.is_view_once && <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>View Once {msg.is_opened ? '(Opened)' : ''}</div>}
                                                                            </div>
                                                                        )}
                                                                        {msg.type === 'video' && msg.file_path && (
                                                                            <div style={{ marginTop: '8px', position: 'relative', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setViewingMedia(msg); }}>
                                                                                <video src={getAdminMediaUrl(msg.file_path)} controls style={{ maxWidth: '100%', borderRadius: '8px', maxHeight: '200px' }} />
                                                                                {msg.is_view_once && <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>View Once {msg.is_opened ? '(Opened)' : ''}</div>}
                                                                            </div>
                                                                        )}

                                                                        {msg.type === 'file' && msg.file_path && (
                                                                            <div style={{ marginTop: '8px', background: 'rgba(0,0,0,0.05)', padding: '8px 12px', borderRadius: '8px' }}>
                                                                                <a href={getAdminMediaUrl(msg.file_path)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#0A7C8F', textDecoration: 'none', fontWeight: 'bold' }}>📄 {msg.fileName || 'Download File'}</a>
                                                                            </div>
                                                                        )}

                                                                        {msg.type === 'audio' && msg.file_path && (
                                                                            <div style={{ marginTop: '8px', position: 'relative' }}>
                                                                                <div style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '12px',
                                                                                    background: isMe ? 'rgba(13, 159, 183, 0.12)' : 'rgba(13, 159, 183, 0.05)',
                                                                                    padding: '12px 16px',
                                                                                    borderRadius: '16px',
                                                                                    minWidth: '220px',
                                                                                    boxShadow: isMe ? 'none' : 'inset 0 1px 3px rgba(0,0,0,0.05)'
                                                                                }}>
                                                                                    <div
                                                                                        onClick={() => handlePlayAudio(msgId, getAdminMediaUrl(msg.file_path))}
                                                                                        style={{
                                                                                            width: '40px',
                                                                                            height: '40px',
                                                                                            borderRadius: '50%',
                                                                                            background: '#0d9fb7',
                                                                                            display: 'flex',
                                                                                            alignItems: 'center',
                                                                                            justifyContent: 'center',
                                                                                            cursor: 'pointer',
                                                                                            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                                                                                            flexShrink: 0
                                                                                        }}
                                                                                    >
                                                                                        {playingAudioId === msgId ? (
                                                                                            <Pause size={20} color="white" />
                                                                                        ) : (
                                                                                            <Play size={20} color="white" style={{ marginLeft: '3px' }} />
                                                                                        )}
                                                                                    </div>

                                                                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                            <Mic size={14} color={isMe ? '#0d9fb7' : '#57b1be'} />
                                                                                            <span style={{ fontSize: '12px', fontWeight: '600', color: '#525f7f' }}>
                                                                                                Voice Message
                                                                                            </span>
                                                                                        </div>
                                                                                        {msg.duration && (
                                                                                            <div style={{ fontSize: '11px', opacity: 0.8, color: '#0d9fb7' }}>
                                                                                                {formatVoiceTime(msg.duration)}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                {msg.is_view_once && <div style={{ position: 'absolute', top: -14, right: 0, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>View Once {msg.is_opened ? '(Opened)' : ''}</div>}
                                                                            </div>
                                                                        )}

                                                                        {msg.type === 'poll' && msg.poll && (
                                                                            <div className="wa-poll-card" style={{ background: '#ffffff', borderRadius: '12px', padding: '15px', minWidth: '280px', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', marginTop: '8px', marginBottom: '4px', cursor: 'default' }}>
                                                                                <div style={{ paddingBottom: '10px', fontWeight: 'bold', color: '#111b21', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                    <List size={20} color="#0EA5BE" />
                                                                                    {msg.poll.question}
                                                                                </div>
                                                                                <div style={{ color: '#8696a0', fontSize: '13px', marginBottom: '12px' }}>
                                                                                    {msg.poll.allowMultipleAnswers ? 'Select one or more' : 'Select one'}
                                                                                </div>
                                                                                <div className="wa-poll-options" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                                    {msg.poll.options.map((opt, idx) => {
                                                                                        const totalVotes = msg.poll.options.reduce((sum, o) => sum + (o.voters?.length || 0), 0);
                                                                                        const votes = opt.voters?.length || 0;
                                                                                        const percentage = totalVotes === 0 ? 0 : Math.round((votes / totalVotes) * 100);
                                                                                        const hasAnyVote = totalVotes > 0;

                                                                                        return (
                                                                                            <div key={idx} style={{ position: 'relative', overflow: 'hidden', padding: '10px', borderRadius: '8px', border: '1px solid #e9edef', background: '#ffffff' }}>
                                                                                                {hasAnyVote && (
                                                                                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${percentage}%`, background: 'rgba(14, 165, 190, 0.15)', zIndex: 1 }} />
                                                                                                )}
                                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 2 }}>
                                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', color: '#111b21' }}>
                                                                                                        <div style={{ width: '18px', height: '18px', borderRadius: msg.poll.allowMultipleAnswers ? '4px' : '50%', border: '2px solid #8696a0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}></div>
                                                                                                        {opt.text}
                                                                                                    </div>
                                                                                                    {votes > 0 && <span style={{ fontSize: '12px', color: '#54656f', fontWeight: '500' }}>{votes}</span>}
                                                                                                </div>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {msg.type === 'contact' && (() => {
                                                                            let cDataArray;
                                                                            try {
                                                                                const rawData = JSON.parse(msg.content);
                                                                                cDataArray = Array.isArray(rawData) ? rawData : [rawData];
                                                                            } catch (e) {
                                                                                cDataArray = [{ name: 'Contact' }];
                                                                            }

                                                                            if (cDataArray.length > 1) {
                                                                                return (
                                                                                    <div
                                                                                        className="wa-contact-msg-card-multiple"
                                                                                        onClick={(e) => { e.stopPropagation(); setViewingContact(cDataArray); }}
                                                                                        style={{ background: '#ffffff', borderRadius: '12px', padding: '12px', minWidth: '260px', cursor: 'pointer', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', marginTop: '8px' }}
                                                                                    >
                                                                                        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                                                                                            <div style={{ position: 'relative', width: 66, height: 44, marginRight: 12, flexShrink: 0 }}>
                                                                                                <div className="wa-avatar" style={{ position: 'absolute', right: 0, zIndex: 1, width: 44, height: 44, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '2px solid #ffffff' }}>
                                                                                                    {cDataArray[1].image ? <img src={cDataArray[1].image} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <UserIcon size={24} color="#8696a0" />}
                                                                                                </div>
                                                                                                <div className="wa-avatar" style={{ position: 'absolute', left: 0, zIndex: 2, width: 44, height: 44, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '2px solid #ffffff' }}>
                                                                                                    {cDataArray[0].image ? <img src={cDataArray[0].image} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <UserIcon size={24} color="#8696a0" />}
                                                                                                </div>
                                                                                            </div>
                                                                                            <div style={{ color: '#111b21', fontSize: '15px', fontWeight: 600, lineHeight: '1.3' }}>
                                                                                                {cDataArray[0].name || cDataArray[0].mobile} and {cDataArray.length - 1} other contact{cDataArray.length > 2 ? 's' : ''}
                                                                                            </div>
                                                                                        </div>
                                                                                        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
                                                                                            <button style={{ background: 'none', border: 'none', color: '#027EB5', padding: '10px 0', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                                                                                                View all
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            }

                                                                            const cData = cDataArray[0];
                                                                            return (
                                                                                <div
                                                                                    className="wa-contact-msg-card"
                                                                                    onClick={(e) => { e.stopPropagation(); setViewingContact(cData); }}
                                                                                    style={{ background: '#ffffff', borderRadius: '12px', padding: '12px', minWidth: '240px', cursor: 'pointer', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', marginTop: '8px' }}
                                                                                >
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                                                                                        <div className="wa-avatar" style={{ width: 44, height: 44, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                                                                                            {cData.image ? <img src={cData.image} alt={cData.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <UserIcon size={24} color="#8696a0" />}
                                                                                        </div>
                                                                                        <div style={{ color: '#111b21', fontSize: '16px', fontWeight: 600 }}>
                                                                                            {cData.name || 'Contact'}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
                                                                                        <button
                                                                                            className="wa-contact-card-action"
                                                                                            style={{ background: 'none', border: 'none', color: '#027EB5', padding: '10px 0', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                                                                                        >
                                                                                            View Info
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })()}

                                                                        {msg.type === 'event' && msg.event && (
                                                                            <div className="wa-event-card" style={{ background: '#ffffff', borderRadius: '12px', overflow: 'visible', width: '280px', maxWidth: '100%', cursor: 'default', opacity: msg.event.cancelled ? 0.7 : 1, marginTop: '8px', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                                                                                <div style={{ background: 'rgba(14, 165, 190, 0.05)', padding: '14px 16px', color: '#111b21', position: 'relative', borderRadius: '12px' }}>
                                                                                    <div style={{ display: 'flex', gap: '14px' }}>
                                                                                        <div style={{ background: 'white', border: '1px solid #e9edef', width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                                            <Calendar size={24} color="#0EA5BE" />
                                                                                        </div>
                                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                                            <div style={{ fontSize: '17px', fontWeight: 'bold', marginBottom: '4px', textDecoration: msg.event.cancelled ? 'line-through' : 'none', wordBreak: 'break-word', color: '#111b21' }}>{msg.event.name}</div>
                                                                                            <div style={{ fontSize: '14px', color: '#667781' }}>
                                                                                                {formatEventTimeString(msg.event.startDate, msg.event.startTime, msg.event.endDate, msg.event.endTime)}
                                                                                            </div>
                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                                                                                                <div style={{ display: 'flex', position: 'relative', width: '20px', height: '20px' }}>
                                                                                                    <div style={{ position: 'absolute', width: '20px', height: '20px', borderRadius: '50%', background: '#dfe5e7', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                                                                                        <UserIcon size={12} color="#8696a0" style={{ marginTop: '1px' }} />
                                                                                                    </div>
                                                                                                </div>
                                                                                                <span style={{ fontSize: '14px', color: '#0EA5BE', fontWeight: 500 }}>{msg.event.responses?.length || 0} responded</span>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <div style={{ padding: '12px 0', margin: '0 16px', borderTop: '1px solid #f0f2f5', textAlign: 'center' }}>
                                                                                    <span style={{ color: msg.event.cancelled ? '#667781' : '#0EA5BE', fontWeight: '600', fontSize: '15px' }}>
                                                                                        {msg.event.cancelled ? 'Event cancelled' : ''}
                                                                                    </span>
                                                                                    {!msg.event.cancelled && (
                                                                                        <button
                                                                                            onClick={(e) => { e.stopPropagation(); setSelectedEventMsg(msg); }}
                                                                                            style={{
                                                                                                cursor: 'pointer', padding: '6px 12px', borderRadius: '12px', background: 'rgba(15, 181, 208, 0.1)',
                                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0FB5D0',
                                                                                                transition: 'all 0.2s', border: '1px solid rgba(0,0,0,0.05)',
                                                                                                gap: '6px', fontSize: '12px', fontWeight: 'bold', marginLeft: '12px'
                                                                                            }}
                                                                                        >
                                                                                            <History size={16} /> Event History


                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {msg.content && msg.type !== 'poll' && msg.type !== 'contact' && msg.type !== 'event' && (
                                                                            <div style={{ opacity: isDeleted ? 0.6 : 1, marginTop: (msg.link_preview || msg.type !== 'text') ? '8px' : '0', whiteSpace: 'pre-wrap' }}>
                                                                                {renderContent(msg.content)}
                                                                            </div>
                                                                        )}

                                                                        {/* Reactions for Admin Review - Enhanced Audit Log */}
                                                                        {((msg.reactions && msg.reactions.length > 0) || (msg.reaction_history && msg.reaction_history.length > 0)) && (
                                                                            <div style={{
                                                                                display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px',
                                                                                justifyContent: isMe ? 'flex-end' : 'flex-start'
                                                                            }}>
                                                                                {/* Group unique reaction-user pairs to show history status */}
                                                                                {(() => {
                                                                                    const history = msg.reaction_history || [];
                                                                                    const currentSet = new Set((msg.reactions || []).map(r => `${String(r.user_id._id || r.user_id)}-${r.emoji}`));

                                                                                    // Get all unique user-emoji events
                                                                                    const allEvents = {};
                                                                                    history.forEach(log => {
                                                                                        const userIdStr = String(log.user_id._id || log.user_id);
                                                                                        const key = `${userIdStr}-${log.emoji}`;
                                                                                        if (!allEvents[key]) {
                                                                                            const u = users.find(usr => String(usr._id || usr.id) === userIdStr);
                                                                                            allEvents[key] = {
                                                                                                emoji: log.emoji,
                                                                                                userName: u ? u.name : (log.user_id?.name || 'Unknown'),
                                                                                                isCurrentlyActive: currentSet.has(key),
                                                                                                logs: []
                                                                                            };
                                                                                        }
                                                                                        allEvents[key].logs.push(log);
                                                                                    });

                                                                                    // If no events but current reactions exists (stale data support)
                                                                                    if (Object.keys(allEvents).length === 0 && msg.reactions) {
                                                                                        msg.reactions.forEach(r => {
                                                                                            const userIdStr = String(r.user_id._id || r.user_id);
                                                                                            const key = `${userIdStr}-${r.emoji}`;
                                                                                            const u = users.find(usr => String(usr._id || usr.id) === userIdStr);
                                                                                            allEvents[key] = {
                                                                                                emoji: r.emoji,
                                                                                                userName: u ? u.name : (r.user_id?.name || 'Unknown'),
                                                                                                isCurrentlyActive: true,
                                                                                                logs: []
                                                                                            };
                                                                                        });
                                                                                    }

                                                                                    return Object.values(allEvents).map((event, idx) => {
                                                                                        return (
                                                                                            <div
                                                                                                key={idx}
                                                                                                className="reaction-audit-badge"
                                                                                                style={{
                                                                                                    background: event.isCurrentlyActive ? (isMe ? 'rgba(255,255,255,0.15)' : 'rgba(10, 124, 143, 0.05)') : 'rgba(0,0,0,0.03)',
                                                                                                    padding: '2px 8px', borderRadius: '12px',
                                                                                                    fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px',
                                                                                                    border: event.isCurrentlyActive ? '1px solid rgba(0,0,0,0.05)' : '1px dashed #adb5bd',
                                                                                                    color: event.isCurrentlyActive ? (isMe ? 'white' : '#525f7f') : '#adb5bd',
                                                                                                    opacity: event.isCurrentlyActive ? 1 : 0.7,
                                                                                                    transition: 'all 0.2s',
                                                                                                    cursor: 'help'
                                                                                                }}
                                                                                                onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.05)'; if (!event.isCurrentlyActive) e.currentTarget.style.opacity = 1; }}
                                                                                                onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; if (!event.isCurrentlyActive) e.currentTarget.style.opacity = 0.7; }}
                                                                                            >
                                                                                                <span>{event.emoji}</span>
                                                                                                {!event.isCurrentlyActive && <X size={8} style={{ marginLeft: '2px' }} />}
                                                                                            </div>
                                                                                        );
                                                                                    }).concat([
                                                                                        <div
                                                                                            key="history-btn"
                                                                                            onClick={(e) => { e.stopPropagation(); setSelectedReactionMsg(msg); }}
                                                                                            style={{
                                                                                                cursor: 'pointer', padding: '4px 8px', borderRadius: '12px', background: isMe ? 'rgba(255,255,255,0.2)' : 'rgba(15, 181, 208, 0.1)',
                                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: isMe ? 'white' : '#0FB5D0',
                                                                                                transition: 'all 0.2s', marginLeft: '4px', border: '1px solid rgba(0,0,0,0.05)',
                                                                                                gap: '4px', fontSize: '10px', fontWeight: 'bold'
                                                                                            }}
                                                                                        >
                                                                                            <History size={12} /> Emoji Activity
                                                                                        </div>
                                                                                    ]);
                                                                                })()}
                                                                            </div>
                                                                        )}
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
                        {(reviewCanScrollUp || reviewCanScrollDown) && (
                            <button
                                type="button"
                                className="admin-review-scroll-button"
                                onClick={handleReviewFloatingScroll}
                                aria-label={reviewCanScrollDown ? 'Scroll review down' : 'Scroll review up'}
                                style={{
                                    position: 'absolute',
                                    right: isMobile ? '8px' : '12px',
                                    top: `clamp(${isMobile ? '82px' : '96px'}, ${reviewScrollControlTop}%, calc(100% - ${isMobile ? '28px' : '34px'}))`,
                                    transform: 'translateY(-50%)',
                                    width: isMobile ? '38px' : '44px',
                                    height: isMobile ? '38px' : '44px',
                                    borderRadius: '50%',
                                    border: '1px solid rgba(148, 163, 184, 0.16)',
                                    background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.94) 0%, rgba(15, 23, 42, 0.94) 100%)',
                                    backdropFilter: 'blur(16px)',
                                    WebkitBackdropFilter: 'blur(16px)',
                                    boxShadow: '0 16px 34px rgba(2, 6, 23, 0.35)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#cbd5e1',
                                    cursor: isDraggingReviewScrollControl ? 'grabbing' : 'grab',
                                    zIndex: 3,
                                    touchAction: 'none',
                                    userSelect: 'none'
                                }}
                                onPointerDown={(event) => {
                                    event.preventDefault();
                                    event.currentTarget.setPointerCapture?.(event.pointerId);
                                    setIsDraggingReviewScrollControl(true);
                                }}
                            >
                                <ChevronDown size={isMobile ? 12 : 14} style={{ transform: 'rotate(180deg)', opacity: reviewCanScrollUp ? 1 : 0.45 }} />
                                <ChevronDown size={isMobile ? 12 : 14} style={{ opacity: reviewCanScrollDown ? 1 : 0.45, marginTop: '-2px' }} />
                            </button>
                        )}
                        {renderSelectionBar()}
                    </div>
                </div>
            )
            }

            {/* Global Confirms & Notifications */}
            {renderReactionAuditModal()}
            {renderEventAuditModal()}
            {renderMsgDropdown()}
            {snackbar && <Snackbar message={snackbar.message} type={snackbar.type} senderName={snackbar.senderName} onClose={closeSnackbar} />}
            <ConfirmModal isOpen={!!confirmConfig} {...confirmConfig} onCancel={closeConfirm} />

            {/* Viewing Contact Details Modal */}
            {viewingContact && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)'
                }} onClick={() => setViewingContact(null)}>
                    <div style={{
                        background: 'white', borderRadius: '16px',
                        width: '400px', maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto',
                        padding: '24px', boxShadow: '0 25px 50px rgba(0,0,0,0.2)',
                        animation: 'scaleIn 0.2s ease-out'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#111b21' }}>Contact Info</h3>
                            <div onClick={() => setViewingContact(null)} style={{ cursor: 'pointer', color: '#54656f' }}>
                                <X size={24} />
                            </div>
                        </div>

                        {Array.isArray(viewingContact) ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {viewingContact.map((c, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', borderBottom: i < viewingContact.length - 1 ? '1px solid #f0f2f5' : 'none' }}>
                                        <div style={{ width: 56, height: 56, background: '#f3f4f6', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                            {c.image ? <img src={c.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={28} color="#8696a0" />}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: '600', color: '#111b21', fontSize: '16px' }}>{c.name || 'Contact'}</div>
                                            <div style={{ color: '#54656f', fontSize: '14px' }}>{c.mobile || 'No phone'}</div>
                                            {c.about && <div style={{ color: '#8696a0', fontSize: '13px', marginTop: 2 }}>{c.about}</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                <div style={{ width: 100, height: 100, background: '#f3f4f6', borderRadius: '50%', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                    {viewingContact.image ? <img src={viewingContact.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={50} color="#8696a0" />}
                                </div>
                                <h2 style={{ margin: '0 0 4px 0', fontSize: '1.5rem' }}>{viewingContact.name || 'Contact'}</h2>
                                <div style={{ color: '#54656f', fontSize: '16px', marginBottom: 12 }}>{viewingContact.mobile || 'No phone'}</div>
                                {viewingContact.about && (
                                    <div style={{ padding: '12px', background: '#f0f2f5', borderRadius: '8px', width: '100%', fontSize: '14px', color: '#111b21' }}>
                                        {viewingContact.about}
                                    </div>
                                )}
                            </div>
                        )}
                        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
                            <button
                                onClick={() => setViewingContact(null)}
                                style={{ background: '#0A7C8F', color: 'white', border: 'none', padding: '10px 30px', borderRadius: '24px', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Unethical Content Alert Popup */}
            {/* Unethical Content Alert Modal */}
            {showUnethicalModal && unethicalAlerts.length > 0 && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
                    background: 'rgba(2, 8, 20, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(5px) saturate(135%)',
                    WebkitBackdropFilter: 'blur(5px) saturate(135%)'
                }} onClick={() => setShowUnethicalModal(false)}>
                    <div style={{
                        background: 'linear-gradient(180deg, rgba(10, 18, 36, 0.98) 0%, rgba(13, 23, 42, 0.96) 52%, rgba(9, 18, 37, 0.98) 100%)', borderRadius: '16px',
                        border: '1px solid rgba(56, 189, 248, 0.22)',
                        boxShadow: '0 28px 80px rgba(2, 6, 23, 0.46), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                        width: '450px', maxWidth: '90%',
                        overflow: 'hidden', animation: 'scaleIn 0.2s ease-out',
                        backdropFilter: 'blur(18px) saturate(165%)',
                        WebkitBackdropFilter: 'blur(18px) saturate(165%)'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(255, 82, 116, 0.98) 0%, rgba(235, 38, 82, 0.96) 54%, rgba(200, 15, 62, 0.98) 100%)',
                            color: 'white',
                            padding: '18px 22px',
                            fontWeight: '700',
                            fontSize: '1.1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.18)',
                            boxShadow: '0 12px 32px rgba(143, 18, 52, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{
                                    width: 30,
                                    height: 30,
                                    borderRadius: '50%',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'rgba(255, 255, 255, 0.18)',
                                    border: '1px solid rgba(255, 255, 255, 0.34)',
                                    boxShadow: '0 0 18px rgba(255, 255, 255, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.22)'
                                }}>
                                    <AlertTriangle size={20} color="#ffffff" strokeWidth={2.6} />
                                </span>
                                Unethical Content Detected
                            </div>
                            <X size={20} style={{ cursor: 'pointer', opacity: 0.8 }} onClick={() => setShowUnethicalModal(false)} />
                        </div>

                        <div style={{ padding: '0', maxHeight: '400px', overflowY: 'auto', background: 'linear-gradient(180deg, rgba(10, 18, 36, 0.96) 0%, rgba(13, 23, 42, 0.94) 100%)' }}>
                            {!unethicalModalUser ? (
                                // Level 1: List Users
                                <div style={{ padding: '14px 16px 16px' }}>
                                    <div style={{ padding: '8px 2px 14px', fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.86)', fontWeight: '800' }}>
                                        Users with flagged messages:
                                    </div>
                                    {Object.values(groupedUnethicalAlerts).map(group => (
                                        <div
                                            key={group.userId}
                                            onClick={() => setUnethicalModalUser(group)}
                                            style={{
                                                padding: '14px 16px', margin: '0 0 10px',
                                                background: 'linear-gradient(135deg, rgba(255, 84, 116, 0.98) 0%, rgba(204, 18, 65, 0.96) 100%)',
                                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                                borderLeft: '4px solid rgba(255, 255, 255, 0.48)',
                                                borderRadius: '12px',
                                                cursor: 'pointer',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                transition: 'all 0.2s',
                                                boxShadow: '0 14px 30px rgba(143, 18, 52, 0.24), inset 0 1px 1px rgba(255,255,255,0.16)'
                                            }}
                                            onMouseOver={e => {
                                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 102, 132, 0.98) 0%, rgba(217, 24, 72, 0.96) 100%)';
                                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.34)';
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                e.currentTarget.style.boxShadow = '0 18px 38px rgba(143, 18, 52, 0.32), 0 0 22px rgba(255, 255, 255, 0.12), inset 0 1px 1px rgba(255,255,255,0.2)';
                                            }}
                                            onMouseOut={e => {
                                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 84, 116, 0.98) 0%, rgba(204, 18, 65, 0.96) 100%)';
                                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = '0 14px 30px rgba(143, 18, 52, 0.24), inset 0 1px 1px rgba(255,255,255,0.16)';
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div>
                                                    <div className="user-name" style={{ fontWeight: '700', color: 'white', transition: 'color 0.2s' }}>{group.userName}</div>
                                                    <div className="user-sub" style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.88)', transition: 'color 0.2s' }}>{group.alerts.length} Flagged Message{group.alerts.length > 1 ? 's' : ''}</div>
                                                </div>
                                            </div>
                                            <ChevronDown className="user-icon" size={18} style={{ transform: 'rotate(-90deg)', color: 'white', transition: 'color 0.2s' }} />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                // Level 2: List Messages for User
                                <div>
                                    <div style={{ padding: '14px 20px', background: 'rgba(15, 23, 42, 0.72)', borderBottom: '1px solid rgba(56, 189, 248, 0.18)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div
                                            onClick={() => setUnethicalModalUser(null)}
                                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'white', fontWeight: '700' }}
                                        >
                                            <ChevronDown size={16} style={{ transform: 'rotate(90deg)' }} /> Back
                                        </div>
                                        <div style={{ height: '20px', borderLeft: '1px solid rgba(148, 163, 184, 0.24)', margin: '0 8px' }}></div>
                                        <div style={{ fontWeight: '700', color: OFFICIAL_TEXT_PRIMARY }}>{unethicalModalUser.userName}'s Messages</div>
                                    </div>
                                    <div style={{ padding: '14px 16px' }}>
                                        {unethicalModalUser.alerts.map((alert, idx) => {
                                            const receiver = alert.receiverId ? (users.find(u => (u.id === alert.receiverId || u._id === alert.receiverId)) || { name: 'Unknown User' }) : { name: 'AI Assistant' };
                                            return (
                                                <div
                                                    key={idx}
                                                    onClick={() => handleViewAlert(alert)}
                                                    style={{
                                                        padding: '14px 16px', margin: '0 0 10px',
                                                        background: 'linear-gradient(135deg, rgba(255, 84, 116, 0.92), rgba(204, 18, 65, 0.88))',
                                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                                        borderLeft: '4px solid rgba(255, 255, 255, 0.48)',
                                                        borderRadius: '12px',
                                                        cursor: 'pointer',
                                                        boxShadow: '0 12px 28px rgba(143, 18, 52, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.14)',
                                                        transition: 'transform 0.1s'
                                                    }}
                                                    onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                                    onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                                                >
                                                    <div style={{ fontSize: '0.92rem', color: OFFICIAL_TEXT_PRIMARY, marginBottom: '10px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {alert.type === 'audio' ? (
                                                            <>
                                                                <Mic size={14} color="#0A7C8F" />
                                                                Voice Message ({formatVoiceTime(alert.duration)})
                                                            </>
                                                        ) : (
                                                            alert.content && (alert.content.length > 60 ? alert.content.substring(0, 60) + '...' : alert.content)
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <div style={{ fontSize: '0.76rem', color: OFFICIAL_TEXT_MUTED, fontWeight: '700' }}>
                                                            Chatted with: <span style={{ color: '#2bc9e4' }}>{receiver.name}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#ff7a8f', lineHeight: 1.45, paddingRight: 12 }}>
                                                                Reason: {alert.reason || 'Unethical Content Detected'}
                                                            </div>
                                                            <div style={{ fontSize: '0.7rem', color: OFFICIAL_TEXT_MUTED }}>
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
                .admin-scroll-main::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
                .recharts-bar-rectangle, .recharts-pie-sector, .recharts-bar-cursor, .recharts-sector, .recharts-surface, .recharts-wrapper, path, rect, g { outline: none !important; }
                *:focus { outline: none !important; }
            `}</style>
        </div>
    );
}
