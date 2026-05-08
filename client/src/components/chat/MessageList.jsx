import React, { memo, Fragment, useRef, useEffect, useState, useCallback } from 'react';
import { 
    Trash2, XCircle, Forward, ChevronDown, Camera, FileText, 
    Pause, Play, Mic, User as UserIcon, CheckSquare, 
    Check, CheckCheck, Star, Pin, List, Calendar, X, CheckCircle
} from 'lucide-react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import ViewOnceBadge from './ViewOnceBadge';
import { formatFileSize } from '../../utils/fileSize';

const DEFAULT_VOICE_WAVEFORM = [8, 10, 9, 12, 11, 8, 13, 15, 12, 9, 11, 14, 10, 13, 8, 10, 15, 11, 13, 10, 14, 12, 9, 8, 10, 13, 11, 12, 9, 11];
const VOICE_WAVEFORM_BARS = 30;
const voiceWaveformCache = new Map();
const getMessageListYouTubeId = (url) => {
    if (!url) return null;
    const text = String(url);
    const match = text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/))([^#&?/\s]{11})/i);
    return match?.[1] || null;
};
const buildVoiceWaveform = async (src, signal) => {
    if (!src || typeof window === 'undefined') return DEFAULT_VOICE_WAVEFORM;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return DEFAULT_VOICE_WAVEFORM;

    const response = await fetch(src, { signal, credentials: 'include' });
    if (!response.ok) {
        throw new Error(`Waveform fetch failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioContext = new AudioContextCtor();

    try {
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
        const channelData = audioBuffer.getChannelData(0);
        if (!channelData?.length) return DEFAULT_VOICE_WAVEFORM;

        const samples = new Array(VOICE_WAVEFORM_BARS).fill(0);
        const blockSize = Math.max(1, Math.floor(channelData.length / VOICE_WAVEFORM_BARS));
        const noiseFloor = 0.018;

        for (let i = 0; i < VOICE_WAVEFORM_BARS; i++) {
            const start = i * blockSize;
            const end = Math.min(channelData.length, start + blockSize);
            let peak = 0;
            let sumSquares = 0;

            for (let j = start; j < end; j++) {
                const value = Math.abs(channelData[j] || 0);
                peak = Math.max(peak, value);
                sumSquares += value * value;
            }

            const frameLength = Math.max(1, end - start);
            const rms = Math.sqrt(sumSquares / frameLength);
            const energy = Math.max(0, (peak * 0.45) + (rms * 0.9) - noiseFloor);
            samples[i] = energy;
        }

        const maxEnergy = Math.max(...samples, 0);
        if (maxEnergy <= 0.002) return DEFAULT_VOICE_WAVEFORM;

        return samples.map((value) => {
            const normalized = Math.max(0, Math.min(1, value / maxEnergy));
            return Math.round(6 + (Math.pow(normalized, 0.72) * 12));
        });
    } finally {
        audioContext.close().catch(() => {});
    }
};

const VoiceWaveform = memo(({ src, activePlaybackRatio, isInteractive }) => {
    const [bars, setBars] = useState(() => voiceWaveformCache.get(src) || DEFAULT_VOICE_WAVEFORM);

    useEffect(() => {
        if (!src) {
            setBars(DEFAULT_VOICE_WAVEFORM);
            return undefined;
        }

        const cachedBars = voiceWaveformCache.get(src);
        if (cachedBars) {
            setBars(cachedBars);
            return undefined;
        }

        const controller = new AbortController();
        let disposed = false;

        buildVoiceWaveform(src, controller.signal)
            .then((nextBars) => {
                if (disposed) return;
                voiceWaveformCache.set(src, nextBars);
                setBars(nextBars);
            })
            .catch(() => {
                if (!disposed) setBars(DEFAULT_VOICE_WAVEFORM);
            });

        return () => {
            disposed = true;
            controller.abort();
        };
    }, [src]);

    return (
        <>
            {bars.map((height, index) => {
                const isActiveBar = isInteractive && activePlaybackRatio > (index / bars.length);
                return (
                    <div
                        key={`${src || 'voice'}-${index}`}
                        className="wa-waveform-bar"
                        style={{
                            height: `${height}px`,
                            background: isActiveBar ? '#34b7f1' : 'rgba(84, 101, 111, 0.18)'
                        }}
                    />
                );
            })}
        </>
    );
});
VoiceWaveform.displayName = 'VoiceWaveform';

const appendMediaToken = (url) => {
    if (!url) return '';
    const apiBase = (axios.defaults.baseURL || '').replace(/\/$/, '');
    const apiOrigin = apiBase.replace(/\/api$/i, '');

    try {
        const parsed = new URL(url, window.location.origin);
        if (!parsed.pathname.startsWith('/api/chat/media')) return url;
        const token = localStorage.getItem('token') || '';
        parsed.searchParams.set('token', token);
        if (apiOrigin) {
            return `${apiOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
        if (/^https?:\/\//i.test(url)) return parsed.toString();
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (_) {
        if (!String(url).includes('/api/chat/media')) return url;
        const token = localStorage.getItem('token') || '';
        const withoutToken = String(url)
            .replace(/([?&])token=[^&#]*&?/i, '$1')
            .replace(/[?&]$/g, '');
        const tokenized = token
            ? (withoutToken.includes('?')
                ? `${withoutToken}&token=${encodeURIComponent(token)}`
                : `${withoutToken}?token=${encodeURIComponent(token)}`)
            : withoutToken;
        if (apiOrigin && tokenized.startsWith('/api/chat/media')) {
            return `${apiOrigin}${tokenized}`;
        }
        return tokenized;
    }
};

const buildMediaProxyUrl = (rawPath) => {
    if (!rawPath) return '';
    const raw = String(rawPath);
    return (() => {
        try {
            const parsed = new URL(raw, window.location.origin);
            if (parsed.pathname.startsWith('/uploads/')) {
                const mediaApiPath = `/api/chat/media?path=${encodeURIComponent(parsed.pathname)}`;
                return appendMediaToken(mediaApiPath);
            }
            return appendMediaToken(`${parsed.pathname || raw}${parsed.search || ''}`);
        } catch (_) {
            const normalized = raw.startsWith('/') ? raw : `/${raw.replace(/^\/+/, '')}`;
            if (normalized.startsWith('/uploads/')) {
                const mediaApiPath = `/api/chat/media?path=${encodeURIComponent(normalized)}`;
                return appendMediaToken(mediaApiPath);
            }
            return appendMediaToken(normalized);
        }
    })();
};

const buildMessageMediaFallbackUrl = (msg, isGroupChat = false) => {
    const msgId = String(msg?._id || msg?.id || '');
    if (!/^[a-f0-9]{24}$/i.test(msgId)) return '';
    const token = localStorage.getItem('token') || '';
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (msg?.fileName || msg?.file_name || msg?.name) {
        params.set('name', msg.fileName || msg.file_name || msg.name);
    }
    if (msg?.file_path) {
        params.set('legacyPath', msg.file_path);
    }
    if (isGroupChat || msg?.group_id) {
        params.set('isGroup', 'true');
    }
    const query = params.toString();
    const url = `/api/chat/media/message/${encodeURIComponent(msgId)}${query ? `?${query}` : ''}`;
    return appendMediaToken(url);
};

const resolveMessageMediaUrls = (msg, isGroupChat = false) => {
    const rawPath = msg?.file_path || msg?.filePath || '';
    const messageUrl = buildMessageMediaFallbackUrl(msg, isGroupChat);
    if (!rawPath) {
        return { primaryUrl: messageUrl, retryUrl: '' };
    }

    const raw = String(rawPath);
    if (raw.startsWith('blob:') || raw.startsWith('data:')) {
        return { primaryUrl: raw, retryUrl: '' };
    }

    const makeManagedResult = (directUrl) => {
        const primaryUrl = directUrl || messageUrl;
        const retryUrl = messageUrl && directUrl && messageUrl !== directUrl ? messageUrl : '';
        return { primaryUrl, retryUrl };
    };

    if (raw.startsWith('http')) {
        try {
            const parsed = new URL(raw);
            const normalizedUrl = `${parsed.pathname}${parsed.search || ''}`;
            if (parsed.pathname.startsWith('/api/chat/media/message/')) {
                return { primaryUrl: appendMediaToken(normalizedUrl), retryUrl: '' };
            }
            if (parsed.pathname.startsWith('/api/chat/media/file/')) {
                return makeManagedResult(appendMediaToken(normalizedUrl));
            }
            if (parsed.pathname.startsWith('/api/chat/media')) {
                const legacyPath = parsed.searchParams.get('path') || '';
                if (legacyPath.startsWith('/uploads/')) {
                    const proxyUrl = buildMediaProxyUrl(legacyPath);
                    return {
                        primaryUrl: proxyUrl || messageUrl || '',
                        retryUrl: proxyUrl && messageUrl && messageUrl !== proxyUrl ? messageUrl : ''
                    };
                }
                return { primaryUrl: appendMediaToken(normalizedUrl), retryUrl: messageUrl && messageUrl !== appendMediaToken(normalizedUrl) ? messageUrl : '' };
            }
            if (parsed.pathname.startsWith('/uploads/')) {
                const proxyUrl = buildMediaProxyUrl(parsed.pathname);
                return {
                    primaryUrl: proxyUrl || messageUrl || '',
                    retryUrl: proxyUrl && messageUrl && messageUrl !== proxyUrl ? messageUrl : ''
                };
            }
        } catch (_) { }

        const directUrl = appendMediaToken(raw) || '';
        return {
            primaryUrl: directUrl || messageUrl,
            retryUrl: messageUrl && directUrl && messageUrl !== directUrl ? messageUrl : ''
        };
    }

    const normalized = raw.startsWith('/') ? raw : `/${raw.replace(/^\/+/, '')}`;
    if (normalized.startsWith('/api/chat/media/message/')) {
        return { primaryUrl: appendMediaToken(normalized), retryUrl: '' };
    }
    if (normalized.startsWith('/api/chat/media/file/')) {
        return makeManagedResult(appendMediaToken(normalized));
    }
    if (normalized.startsWith('/api/chat/media')) {
        try {
            const parsed = new URL(normalized, window.location.origin);
            const legacyPath = parsed.searchParams.get('path') || '';
            if (legacyPath.startsWith('/uploads/')) {
                const proxyUrl = buildMediaProxyUrl(legacyPath);
                return {
                    primaryUrl: proxyUrl || messageUrl || '',
                    retryUrl: proxyUrl && messageUrl && messageUrl !== proxyUrl ? messageUrl : ''
                };
            }
        } catch (_) { }
        const directUrl = appendMediaToken(normalized);
        return {
            primaryUrl: directUrl,
            retryUrl: messageUrl && directUrl && messageUrl !== directUrl ? messageUrl : ''
        };
    }
    if (normalized.startsWith('/uploads/')) {
        const proxyUrl = buildMediaProxyUrl(normalized);
        return {
            primaryUrl: proxyUrl || messageUrl || '',
            retryUrl: proxyUrl && messageUrl && messageUrl !== proxyUrl ? messageUrl : ''
        };
    }

    const directUrl = appendMediaToken(normalized) || '';
    return {
        primaryUrl: directUrl || messageUrl,
        retryUrl: messageUrl && directUrl && messageUrl !== directUrl ? messageUrl : ''
    };
};

const DelayedMessageImage = memo(({ messageKey, src, msg, retryUrl, onLoaded, onError }) => {
    const [showLoading, setShowLoading] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        setShowLoading(false);
        setIsLoaded(false);
        const timer = setTimeout(() => setShowLoading(true), 360);
        return () => clearTimeout(timer);
    }, [src]);

    return (
        <>
            {showLoading && !isLoaded && (
                <div className="wa-msg-image-loading" aria-hidden="true">
                    <Camera size={22} />
                    <span>Loading image</span>
                </div>
            )}
            <img
                key={`${messageKey}:${src}`}
                src={src}
                alt="Sent"
                className="wa-msg-image"
                onLoad={(event) => {
                    setIsLoaded(true);
                    setShowLoading(false);
                    onLoaded(msg, event);
                }}
                onError={(event) => {
                    setShowLoading(false);
                    onError(msg, retryUrl, event);
                }}
            />
        </>
    );
});
DelayedMessageImage.displayName = 'DelayedMessageImage';

const sanitizeClipboardPayloadText = (rawText) => {
    const text = typeof rawText === 'string' ? rawText : '';
    if (!text) return '';

    const cleaned = text
        .split(/\r?\n/)
        .filter((line) => {
            const trimmed = String(line || '').trim();
            return !trimmed.startsWith('__NEURALCHAT_FILE__');
        })
        .join('\n')
        .trim();

    return cleaned.startsWith('__NEURALCHAT_FILE__') ? '' : cleaned;
};

const MessageScroller = React.forwardRef((props, ref) => (
    <div
        {...props}
        ref={ref}
        className={`wa-message-scroller ${props.className || ''}`.trim()}
    />
));
MessageScroller.displayName = 'MessageScroller';

const MessageList = memo(({
    messages,
    messageSearchQuery,
    formatDateForSeparator,
    t,
    getLangCode,
    selectedLanguage,
    isMeMsg,
    selectedUser,
    firstUnreadMessageId,
    pendingNewMsgCount,
    isForwardingMode,
    setReplyingTo,
    forwardSelectedMsgs,
    setForwardSelectedMsgs,
    setSnackbar,
    handleOpenFile,
    handleMsgDropdownOpen,
    longPressTimer,
    handleDownload,
    onOpenMessageMedia,
    playingAudioId,
    handlePlayAudio,
    playbackSpeed,
    viewOncePlaybackSpeed,
    togglePlaybackSpeed,
    viewOnceElapsed,
    playbackPosition,
    playbackDuration,
    pendingVoiceSeekTargets,
    setPendingVoiceSeekTargets,
    pendingVoiceSeekRef,
    audioInstanceRef,
    renderContent,
    renderContactMessageCard,
    formatTime,
    formatVoiceTime,
    user,
    users,
    handleVotePoll,
    setPollDetails,
    setIsPollDetailsOpen,
    openEventDetails,
    openEditEvent,
    handleEventRespond,
    openEventRespondId,
    setOpenEventRespondId,
    eventTick,
    typingUsers,
    bottomRef,
    navigateToMessage,
    isChatSelectionMode,
    setViewingContact,
    setReactionDetails,
    setShowScrollBtn,
    clearPendingUnread,
    markAsRead,
    markMessageViewed,
    scrollerRef,
    jumpToMessageTarget,
    isGroup,
    headerContent,
    onScroll,
    isMobile,
    openYouTubeChoice,
    openGenericLinkPreview,
    openLinkChoice,
    onViewOncePreviewOpenChange
}) => {
    const isDeletedForCurrentUser = useCallback((msg) => {
        if (!msg) return false;
        const myId = String(user?.id || user?._id || '');
        const deletedFor = Array.isArray(msg.deleted_for) ? msg.deleted_for : [];
        return !!(
            msg.is_deleted_by_admin ||
            msg.is_deleted_by_user ||
            (myId && deletedFor.some(id => String(id?._id || id) === myId))
        );
    }, [user?.id, user?._id]);

    const [isAtBottom, setIsAtBottom] = useState(true);
    const [failedMediaKeys, setFailedMediaKeys] = useState(() => new Set());
    const [failedMediaUrls, setFailedMediaUrls] = useState(() => new Set());
    const [mediaUrlOverrides, setMediaUrlOverrides] = useState(() => new Map());
    const [loadedMediaKeys, setLoadedMediaKeys] = useState(() => new Set());
    const [videoPlayingByKey, setVideoPlayingByKey] = useState(() => new Map());
    const [videoPipKey, setVideoPipKey] = useState('');
    const [videoPipPosterByKey, setVideoPipPosterByKey] = useState(() => new Map());
    const [videoOverlayVisibleByKey, setVideoOverlayVisibleByKey] = useState(() => new Map());
    const [activeVideoKey, setActiveVideoKey] = useState('');
    const viewOnceStorageKey = `wa_view_once_consumed_${String(user?.id || user?._id || 'anon')}`;
    const [locallyConsumedViewOnceIds, setLocallyConsumedViewOnceIds] = useState(() => {
        try {
            const raw = localStorage.getItem(viewOnceStorageKey);
            const arr = raw ? JSON.parse(raw) : [];
            return new Set(Array.isArray(arr) ? arr.map((id) => String(id || '')) : []);
        } catch (_) {
            return new Set();
        }
    });
    const [viewOncePreview, setViewOncePreview] = useState(null); // { url, type }
    const videoRefs = useRef(new Map());
    const videoOverlayTimersRef = useRef(new Map());
    const videoTapTrackerRef = useRef(new Map());
    const virtuosoRef = useRef(null);
    const handledJumpNonceRef = useRef(null);
    const targetId = String(selectedUser?._id || '').toLowerCase();
    const typingSet = typingUsers[targetId];
    const formatInlineEventTime = (event) => {
        const startDate = event?.startDate;
        if (!startDate) return 'Event';

        const buildDateTime = (dateValue, timeValue, fallbackDateValue) => {
            const normalizedDate = String(dateValue || fallbackDateValue || '').split('T')[0];
            if (!normalizedDate) return null;
            const normalizedTime = String(timeValue || '00:00').slice(0, 5);
            const parsed = new Date(`${normalizedDate}T${normalizedTime}:00`);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        };

        const formatTime = (dateValue) => dateValue.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const startValue = buildDateTime(startDate, event?.startTime);
        if (!startValue) return 'Event';

        const endValue = buildDateTime(event?.endDate, event?.endTime, startDate);
        const now = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(now.getDate() + 1);

        const isSameDay = (left, right) => left && right && left.toDateString() === right.toDateString();
        const dateLabel = isSameDay(startValue, now)
            ? 'Today'
            : isSameDay(startValue, tomorrow)
                ? 'Tomorrow'
                : startValue.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' });

        if (!endValue || !event?.endTime) {
            return `${dateLabel}, ${formatTime(startValue)}`;
        }

        if (isSameDay(startValue, endValue)) {
            return `${dateLabel}, ${formatTime(startValue)} - ${formatTime(endValue)}`;
        }

        return `${dateLabel}, ${formatTime(startValue)} - ${endValue.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' })}, ${formatTime(endValue)}`;
    };
    const getEventOwnerId = (msg) => String(msg?.sender_id?._id || msg?.sender_id || msg?.user_id?._id || msg?.user_id || '');
    const getEventResponses = (event) => {
        const responseMap = new Map();
        (event?.responses || []).forEach((response) => {
            const responseUserId = String(response?.user_id?._id || response?.user_id?.id || response?.user_id || '');
            if (!responseUserId) return;
            responseMap.set(responseUserId, response);
        });
        (event?.participants || []).forEach((participant) => {
            const participantId = String(participant?._id || participant?.id || participant || '');
            if (!participantId || responseMap.has(participantId)) return;
            responseMap.set(participantId, { user_id: participantId, status: 'Going' });
        });
        return Array.from(responseMap.values());
    };
    const getEventLifecycleState = (event) => {
        if (!event) {
            return {
                hasStarted: false,
                isEnded: false,
                isCancelled: false,
                isRescheduled: false,
                isVoteLocked: false,
                statusLabel: 'Upcoming event'
            };
        }

        if (event.cancelled) {
            return {
                hasStarted: false,
                isEnded: false,
                isCancelled: true,
                isRescheduled: false,
                isVoteLocked: true,
                statusLabel: 'Event cancelled'
            };
        }

        const startDateValue = event.startDate ? String(event.startDate).split('T')[0] : '';
        const endDateValue = event.endDate ? String(event.endDate).split('T')[0] : '';
        const startAt = startDateValue ? new Date(`${startDateValue}T${String(event.startTime || '00:00').slice(0, 5)}:00`) : null;
        const endAt = (endDateValue || event.endTime)
            ? new Date(`${(endDateValue || startDateValue)}T${String(event.endTime || event.startTime || '23:59').slice(0, 5)}:00`)
            : null;
        const now = new Date();
        const hasStarted = !!(startAt && !Number.isNaN(startAt.getTime()) && startAt <= now);
        const isEnded = !!(endAt && !Number.isNaN(endAt.getTime()) && endAt <= now);
        const isRescheduled = !!event.rescheduledAt && !hasStarted && !isEnded;

        return {
            hasStarted,
            isEnded,
            isCancelled: false,
            isRescheduled,
            isVoteLocked: hasStarted || isEnded,
            statusLabel: isEnded ? 'Event ended' : hasStarted ? 'Event started' : isRescheduled ? 'Event rescheduled' : 'Upcoming event'
        };
    };

    useEffect(() => {
        try {
            const raw = localStorage.getItem(viewOnceStorageKey);
            const arr = raw ? JSON.parse(raw) : [];
            setLocallyConsumedViewOnceIds(new Set(Array.isArray(arr) ? arr.map((id) => String(id || '')) : []));
        } catch (_) {
            setLocallyConsumedViewOnceIds(new Set());
        }
    }, [viewOnceStorageKey]);

    useEffect(() => {
        try {
            localStorage.setItem(viewOnceStorageKey, JSON.stringify(Array.from(locallyConsumedViewOnceIds)));
        } catch (_) { }
    }, [locallyConsumedViewOnceIds, viewOnceStorageKey]);

    const markViewOnceConsumedLocally = useCallback((msg) => {
        const key = String(msg?._id || msg?.id || '');
        if (!key) return;
        setLocallyConsumedViewOnceIds((prev) => {
            if (prev.has(key)) return prev;
            const next = new Set(prev);
            next.add(key);
            return next;
        });
    }, []);

    useEffect(() => {
        if (typeof onViewOncePreviewOpenChange === 'function') {
            onViewOncePreviewOpenChange(!!viewOncePreview);
        }
        return () => {
            if (typeof onViewOncePreviewOpenChange === 'function') {
                onViewOncePreviewOpenChange(false);
            }
        };
    }, [viewOncePreview, onViewOncePreviewOpenChange]);

    useEffect(() => {
        if (!viewOncePreview) return undefined;
        const handleViewOnceEscape = (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            setViewOncePreview(null);
        };
        window.addEventListener('keydown', handleViewOnceEscape, true);
        return () => window.removeEventListener('keydown', handleViewOnceEscape, true);
    }, [viewOncePreview]);

    const getMessageKey = useCallback((msg) => String(msg?._id || msg?.id || ''), []);
    const normalizeMediaCompareUrl = useCallback((url) => {
        if (!url) return '';
        try {
            return new URL(String(url), window.location.origin).toString();
        } catch (_) {
            return String(url);
        }
    }, []);
    const isMediaAborted = useCallback((event) => {
        const mediaError = event?.currentTarget?.error;
        return mediaError?.code === 1;
    }, []);
    const markMediaFailed = useCallback((msg, event) => {
        const messageKey = getMessageKey(msg);
        if (!messageKey || isMediaAborted(event)) return;
        const mediaEl = event?.currentTarget;
        const failedSrc = normalizeMediaCompareUrl(mediaEl?.currentSrc || mediaEl?.src || '');
        if (failedSrc) {
            setFailedMediaUrls((prev) => {
                if (prev.has(failedSrc)) return prev;
                const next = new Set(prev);
                next.add(failedSrc);
                return next;
            });
        }
        setFailedMediaKeys((prev) => {
            if (prev.has(messageKey)) return prev;
            const next = new Set(prev);
            next.add(messageKey);
            return next;
        });
    }, [getMessageKey, isMediaAborted, normalizeMediaCompareUrl]);
    const handleMediaError = useCallback((msg, retryUrl, event) => {
        const messageKey = getMessageKey(msg);
        const mediaEl = event?.currentTarget;
        const failedSrc = normalizeMediaCompareUrl(mediaEl?.currentSrc || mediaEl?.src || '');
        if (messageKey && failedSrc) {
            const loadKey = `${messageKey}:${failedSrc}`;
            setLoadedMediaKeys((prev) => {
                if (!prev.has(loadKey)) return prev;
                const next = new Set(prev);
                next.delete(loadKey);
                return next;
            });
        }
        if (messageKey && retryUrl && mediaEl) {
            const currentSrc = failedSrc;
            const normalizedRetryUrl = normalizeMediaCompareUrl(retryUrl);
            const hasAlreadyRetried = mediaUrlOverrides.get(messageKey) === retryUrl;
            if (!hasAlreadyRetried && currentSrc && currentSrc !== normalizedRetryUrl) {
                setMediaUrlOverrides((prev) => {
                    if (prev.get(messageKey) === retryUrl) return prev;
                    const next = new Map(prev);
                    next.set(messageKey, retryUrl);
                    return next;
                });
                return;
            }
        }
        markMediaFailed(msg, event);
    }, [getMessageKey, markMediaFailed, mediaUrlOverrides, normalizeMediaCompareUrl]);
    const handleMediaLoaded = useCallback((msg, event) => {
        const messageKey = getMessageKey(msg);
        const mediaEl = event?.currentTarget;
        const loadedSrc = normalizeMediaCompareUrl(mediaEl?.currentSrc || mediaEl?.src || '');
        if (!messageKey || !loadedSrc) return;
        const loadKey = `${messageKey}:${loadedSrc}`;
        setLoadedMediaKeys((prev) => {
            if (prev.has(loadKey)) return prev;
            const next = new Set(prev);
            next.add(loadKey);
            return next;
        });
    }, [getMessageKey, normalizeMediaCompareUrl]);
    const captureVideoPoster = useCallback((msg) => {
        const messageKey = getMessageKey(msg);
        if (!messageKey) return;
        const videoEl = videoRefs.current.get(messageKey);
        if (!videoEl) return;
        const width = Number(videoEl.videoWidth || 0);
        const height = Number(videoEl.videoHeight || 0);
        if (!width || !height) return;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(videoEl, 0, 0, width, height);
            const poster = canvas.toDataURL('image/jpeg', 0.76);
            if (!poster) return;
            setVideoPipPosterByKey((prev) => {
                if (prev.get(messageKey) === poster) return prev;
                const next = new Map(prev);
                next.set(messageKey, poster);
                return next;
            });
        } catch (_) {}
    }, [getMessageKey]);
    const handleVideoRef = useCallback((msg, node) => {
        const messageKey = getMessageKey(msg);
        if (!messageKey) return;
        if (node) {
            if (!node.__waPipHandlers) {
                const onEnter = () => {
                    captureVideoPoster(msg);
                    setVideoPipKey(messageKey);
                };
                const onLeave = () => setVideoPipKey('');
                node.addEventListener('enterpictureinpicture', onEnter);
                node.addEventListener('leavepictureinpicture', onLeave);
                node.__waPipHandlers = { onEnter, onLeave };
            }
            videoRefs.current.set(messageKey, node);
            return;
        }
        const existing = videoRefs.current.get(messageKey);
        if (existing?.__waPipHandlers) {
            const { onEnter, onLeave } = existing.__waPipHandlers;
            existing.removeEventListener('enterpictureinpicture', onEnter);
            existing.removeEventListener('leavepictureinpicture', onLeave);
            existing.__waPipHandlers = null;
        }
        videoRefs.current.delete(messageKey);
    }, [captureVideoPoster, getMessageKey]);
    const setVideoPlayingState = useCallback((msg, isPlaying) => {
        const messageKey = getMessageKey(msg);
        if (!messageKey) return;
        setVideoPlayingByKey((prev) => {
            if (prev.get(messageKey) === isPlaying) return prev;
            const next = new Map(prev);
            next.set(messageKey, isPlaying);
            return next;
        });
    }, [getMessageKey]);
    const toggleVideoPlayback = useCallback((msg) => {
        const messageKey = getMessageKey(msg);
        if (!messageKey) return;
        const videoEl = videoRefs.current.get(messageKey);
        if (!videoEl) return;
        if (videoEl.paused || videoEl.ended) {
            videoEl.play().catch(() => {});
            return;
        }
        videoEl.pause();
    }, [getMessageKey]);
    const seekVideoBySeconds = useCallback((msg, deltaSeconds) => {
        const messageKey = getMessageKey(msg);
        if (!messageKey) return;
        const videoEl = videoRefs.current.get(messageKey);
        if (!videoEl) return;
        const duration = Number(videoEl.duration || 0);
        const current = Number(videoEl.currentTime || 0);
        const maxTarget = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
        const target = Math.max(0, Math.min(maxTarget, current + deltaSeconds));
        try {
            videoEl.currentTime = target;
        } catch (_) {}
    }, [getMessageKey]);
    useEffect(() => {
        const handleWindowKeyDown = (event) => {
            if (event.defaultPrevented) return;
            const isSeekKey = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
            const isToggleKey = event.key === ' ' || event.code === 'Space';
            if (!isSeekKey && !isToggleKey) return;
            const targetTag = String(event.target?.tagName || '').toUpperCase();
            if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || event.target?.isContentEditable) return;
            const videoEl = activeVideoKey ? videoRefs.current.get(activeVideoKey) : null;
            if (!videoEl) return;
            if (isToggleKey) {
                if (videoEl.paused || videoEl.ended) {
                    videoEl.play().catch(() => {});
                } else {
                    videoEl.pause();
                }
                event.preventDefault();
                return;
            }
            const delta = event.key === 'ArrowLeft' ? -10 : 10;
            const duration = Number(videoEl.duration || 0);
            const current = Number(videoEl.currentTime || 0);
            const maxTarget = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
            const target = Math.max(0, Math.min(maxTarget, current + delta));
            try {
                videoEl.currentTime = target;
                event.preventDefault();
            } catch (_) {}
        };
        window.addEventListener('keydown', handleWindowKeyDown, { passive: false });
        return () => window.removeEventListener('keydown', handleWindowKeyDown);
    }, [activeVideoKey]);
    const scheduleVideoOverlayHide = useCallback((msg, delayMs = 1000) => {
        const messageKey = getMessageKey(msg);
        if (!messageKey) return;
        const existingTimer = videoOverlayTimersRef.current.get(messageKey);
        if (existingTimer) clearTimeout(existingTimer);
        const timer = setTimeout(() => {
            const videoEl = videoRefs.current.get(messageKey);
            const isPaused = !videoEl || videoEl.paused || videoEl.ended;
            if (!isPaused) {
                setVideoOverlayVisibleByKey((prev) => {
                    if (prev.get(messageKey) === false) return prev;
                    const next = new Map(prev);
                    next.set(messageKey, false);
                    return next;
                });
            }
            videoOverlayTimersRef.current.delete(messageKey);
        }, delayMs);
        videoOverlayTimersRef.current.set(messageKey, timer);
    }, [getMessageKey]);
    const setVideoOverlayVisible = useCallback((msg, visible, autoHideIfPlaying = true) => {
        const messageKey = getMessageKey(msg);
        if (!messageKey) return;
        setVideoOverlayVisibleByKey((prev) => {
            if (prev.get(messageKey) === visible) return prev;
            const next = new Map(prev);
            next.set(messageKey, visible);
            return next;
        });
        if (!visible) return;
        if (autoHideIfPlaying) {
            const videoEl = videoRefs.current.get(messageKey);
            if (videoEl && !videoEl.paused && !videoEl.ended) {
                scheduleVideoOverlayHide(msg, 1000);
            }
        }
    }, [getMessageKey, scheduleVideoOverlayHide]);
    const handleVideoDesktopDoubleClick = useCallback((msg, event) => {
        const rect = event.currentTarget?.getBoundingClientRect?.();
        if (!rect) return;
        const localX = Number(event.clientX || 0) - rect.left;
        if (!Number.isFinite(localX)) return;
        const delta = localX < (rect.width / 2) ? -10 : 10;
        seekVideoBySeconds(msg, delta);
        setVideoOverlayVisible(msg, true, true);
    }, [seekVideoBySeconds, setVideoOverlayVisible]);
    const handleVideoMobileDoubleTap = useCallback((msg, event) => {
        const touch = event.changedTouches?.[0];
        if (!touch) return;
        const messageKey = getMessageKey(msg);
        if (!messageKey) return;
        const rect = event.currentTarget?.getBoundingClientRect?.();
        if (!rect) return;
        const now = Date.now();
        const prev = videoTapTrackerRef.current.get(messageKey);
        const isDoubleTap = !!prev && (now - prev.time) < 320;
        const localX = Number(touch.clientX || 0) - rect.left;
        if (isDoubleTap) {
            const delta = localX < (rect.width / 2) ? -10 : 10;
            seekVideoBySeconds(msg, delta);
            setVideoOverlayVisible(msg, true, true);
            videoTapTrackerRef.current.delete(messageKey);
            return;
        }
        videoTapTrackerRef.current.set(messageKey, { time: now });
    }, [getMessageKey, seekVideoBySeconds, setVideoOverlayVisible]);
    useEffect(() => {
        const syncPiPState = (event) => {
            const pipEl = event?.target || document.pictureInPictureElement || null;
            if (!pipEl) {
                setVideoPipKey('');
                return;
            }
            for (const [key, el] of videoRefs.current.entries()) {
                if (el === pipEl) {
                    setVideoPipKey(key);
                    return;
                }
            }
        };
        const clearPiPState = () => setVideoPipKey('');
        document.addEventListener('enterpictureinpicture', syncPiPState, true);
        document.addEventListener('leavepictureinpicture', clearPiPState, true);
        return () => {
            document.removeEventListener('enterpictureinpicture', syncPiPState, true);
            document.removeEventListener('leavepictureinpicture', clearPiPState, true);
        };
    }, []);
    useEffect(() => () => {
        for (const timer of videoOverlayTimersRef.current.values()) {
            clearTimeout(timer);
        }
        videoOverlayTimersRef.current.clear();
    }, []);

    // 1. Prepare Flattened List for Virtuoso
    const flattenedItems = React.useMemo(() => {
        const items = [];
        let currentGroupDate = null;

        const filteredMessages = (messages || []).filter(msg => {
            if (!msg) return false;
            if (!messageSearchQuery) return true;
            return (msg.content || '').toLowerCase().includes(messageSearchQuery.toLowerCase());
        });

        filteredMessages.forEach((msg) => {
            const messageDisplayTime = isMeMsg(msg) && msg.scheduled_created_at ? msg.scheduled_created_at : msg.created_at;
            const dateLabel = formatDateForSeparator(messageDisplayTime, t, getLangCode(selectedLanguage));
            if (currentGroupDate !== dateLabel) {
                currentGroupDate = dateLabel;
                items.push({ type: 'date', date: dateLabel });
            }
            items.push({ type: 'message', data: msg });
        });

        if (typingSet && typingSet.size > 0) {
            items.push({ type: 'typing' });
        }
        return items;
    }, [messages, messageSearchQuery, typingSet, formatDateForSeparator, t, getLangCode, selectedLanguage]);

    // Scroll to bottom effect
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'auto' });
        }
    }, [messages.length, typingSet?.size]);

    useEffect(() => {
        const targetId = String(jumpToMessageTarget?.id || '');
        const targetNonce = String(jumpToMessageTarget?.nonce || '');
        if (!targetId) return;
        if (targetNonce && handledJumpNonceRef.current === targetNonce) return;

        const targetIndex = flattenedItems.findIndex((item) => {
            if (item.type !== 'message' || !item.data) return false;
            return String(item.data._id || item.data.id) === targetId;
        });
        if (targetIndex < 0) return;
        if (targetNonce) handledJumpNonceRef.current = targetNonce;

        if (virtuosoRef.current?.scrollToIndex) {
            virtuosoRef.current.scrollToIndex({ index: targetIndex, align: 'center', behavior: 'auto' });
        }

        const highlightMsg = (attempt = 0) => {
            const el = document.getElementById(`msg-${targetId}`);
            if (!el) {
                if (attempt < 8) setTimeout(() => highlightMsg(attempt + 1), 70);
                return;
            }
            el.classList.add('wa-msg-highlight-anim');
            setTimeout(() => el.classList.remove('wa-msg-highlight-anim'), 2000);
        };
        setTimeout(() => highlightMsg(0), 80);
    }, [jumpToMessageTarget, flattenedItems]);

    const renderItem = (index, item) => {
        if (item.type === 'date') {
            return (
                <div className="wa-date-separator">
                    <span>{item.date}</span>
                </div>
            );
        }

        if (item.type === 'typing') {
            return (
                <div className="wa-message-container" style={{ marginBottom: '10px', marginTop: '5px' }}>
                    <div className="wa-message-bubble wa-msg-rec" style={{
                        padding: '12px 16px',
                        borderRadius: '0 12px 12px 12px',
                        width: 'fit-content',
                        background: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)'
                    }}>
                        <div className="wa-typing-dot"></div>
                        <div className="wa-typing-dot"></div>
                        <div className="wa-typing-dot"></div>
                    </div>
                </div>
            );
        }

        const msg = item.data;
        if (!msg) return null;
        const isLastItem = index === flattenedItems.length - 1;
        const msgId = msg._id || msg.id;
        const messageKey = getMessageKey(msg);
        const isMe = isMeMsg(msg);
        const isViewOnceConsumed = !!(msg.is_viewed || locallyConsumedViewOnceIds.has(messageKey));
        const isAudioPlaying = String(playingAudioId) === String(msg._id || msg.id);
        const activePlaybackDuration = Math.max(1, Number(playbackDuration || msg.duration || 1));
        const pendingSeekPercentForMsg = pendingVoiceSeekTargets?.[String(msg._id || msg.id)] ?? null;
        const displayElapsedSeconds = isAudioPlaying
            ? Math.min(Math.max(0, Math.floor(activePlaybackDuration)), Math.max(0, Math.floor(Number(playbackPosition || 0))))
            : Math.max(0, Math.floor(Number(msg.duration || 0)));
        const activePlaybackRatio = isAudioPlaying
            ? Math.max(0, Math.min(1, Number(playbackPosition || 0) / activePlaybackDuration))
            : (pendingSeekPercentForMsg != null ? Math.max(0, Math.min(1, Number(pendingSeekPercentForMsg || 0))) : 0);
        const isWaveSelected = pendingSeekPercentForMsg != null && !isAudioPlaying;
        const liveElapsedSeconds = msg.type === 'audio'
            ? displayElapsedSeconds
            : 0;

        const getSeekPercentFromPoint = (clientX, rect) => {
            if (!rect || rect.width <= 0) return 0;
            return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        };

        const applyVoiceSeekPercent = (percent, shouldPlayNow = false) => {
            const msgKey = String(msg._id || msg.id);
            pendingVoiceSeekRef?.current?.set(msgKey, percent);
            setPendingVoiceSeekTargets?.(prev => ({ ...(prev || {}), [msgKey]: percent }));
            if (shouldPlayNow) handlePlayAudio(msg, 0, percent);
        };

        const beginVoiceSeekDrag = (startClientX, rect, startEvent) => {
            if (startEvent?.preventDefault && startEvent?.cancelable) startEvent.preventDefault();
            if (startEvent?.stopPropagation) startEvent.stopPropagation();
            // Seeking should only set position; playback must start only from Play button.
            if (String(playingAudioId) === String(msg._id || msg.id)) {
                handlePlayAudio(msg);
            }

            let latestPercent = getSeekPercentFromPoint(startClientX, rect);
            applyVoiceSeekPercent(latestPercent, false);

            const handleMouseMove = (moveEvent) => {
                latestPercent = getSeekPercentFromPoint(moveEvent.clientX, rect);
                applyVoiceSeekPercent(latestPercent, false);
            };

            const handleTouchMove = (moveEvent) => {
                const touch = moveEvent.touches?.[0];
                if (!touch) return;
                latestPercent = getSeekPercentFromPoint(touch.clientX, rect);
                applyVoiceSeekPercent(latestPercent, false);
            };

            const finishSeek = (clientX = null) => {
                if (Number.isFinite(clientX)) {
                    latestPercent = getSeekPercentFromPoint(clientX, rect);
                    applyVoiceSeekPercent(latestPercent, false);
                }
                cleanup();
            };

            const handleMouseUp = (upEvent) => {
                finishSeek(upEvent?.clientX);
            };

            const handleTouchEnd = (endEvent) => {
                const clientX = endEvent?.changedTouches?.[0]?.clientX;
                finishSeek(clientX);
            };

            const cleanup = () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
                window.removeEventListener('touchmove', handleTouchMove);
                window.removeEventListener('touchend', handleTouchEnd);
                window.removeEventListener('touchcancel', cleanup);
            };

            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('touchmove', handleTouchMove, { passive: true });
            window.addEventListener('touchend', handleTouchEnd);
            window.addEventListener('touchcancel', cleanup);
        };
        
        // Sender Name Resolution
        let senderName = 'User';
        if (isMe) {
            senderName = 'You';
        } else if (isGroup) {
            senderName = msg.sender_id?.name || msg.sender_id?.firstName || 'User';
        } else {
            senderName = selectedUser?.name || 'User';
        }

        const senderColor = isMe ? '#0EA5BE' : (msg.sender_color || '#0EA5BE');
        const fileNameDirect = msg.fileName || msg.file_name || msg.name || "";
        const sanitizedMessageContent = sanitizeClipboardPayloadText(msg.content || '');
        const contentGuess = sanitizedMessageContent.trim();
        const filePathGuess = decodeURIComponent(String(msg.file_path || msg.filePath || '').split('?')[0].split('/').pop() || '').trim();
        const rawFileName = fileNameDirect || (/\.[a-z0-9]{2,8}$/i.test(contentGuess) ? contentGuess : '') || filePathGuess || 'Document';
        const displayFileName = rawFileName.replace(/^\d{10,}-/, '');
        const compactFileName = (name, max = 38) => {
            const safeName = String(name || '').trim();
            if (safeName.length <= max) return safeName;
            const dotIdx = safeName.lastIndexOf('.');
            const ext = dotIdx > 0 ? safeName.slice(dotIdx) : '';
            const base = dotIdx > 0 ? safeName.slice(0, dotIdx) : safeName;
            const available = Math.max(8, max - ext.length - 3);
            const head = Math.ceil(available * 0.62);
            const tail = Math.max(3, available - head);
            return `${base.slice(0, head)}...${base.slice(-tail)}${ext}`;
        };
        const fileDotIdx = displayFileName.lastIndexOf('.');
        const fileExt = (fileDotIdx > 0 && fileDotIdx < displayFileName.length - 1) ? displayFileName.slice(fileDotIdx + 1).toLowerCase() : '';
        const getFriendlyFileLabel = () => {
            if (fileExt) return fileExt.slice(0, 5).toUpperCase();
            return 'FILE';
        };
        const fileBadgeLabel = getFriendlyFileLabel();
        const isVideoByExt = ['mp4', 'avi', 'mkv', 'mov', 'webm', 'm4v'].includes(fileExt);
        const isPdfDoc = fileExt === 'pdf';
        const isOfficePreviewDoc = ['doc', 'docx', 'docm', 'dot', 'dotx', 'rtf', 'odt', 'xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'ods', 'ppt', 'pptx', 'pptm', 'pot', 'potx', 'pps', 'ppsx', 'odp'].includes(fileExt);
        const overriddenMediaUrl = mediaUrlOverrides.get(messageKey) || '';
        const { primaryUrl: resolvedFileUrl, retryUrl: retryFileUrl } = failedMediaKeys.has(messageKey)
            ? { primaryUrl: '', retryUrl: '' }
            : resolveMessageMediaUrls(msg, isGroup);
        const candidateFileUrl = overriddenMediaUrl || resolvedFileUrl;
        const normalizedCandidateUrl = normalizeMediaCompareUrl(candidateFileUrl);
        const absoluteFileUrl = normalizedCandidateUrl && failedMediaUrls.has(normalizedCandidateUrl)
            ? ''
            : candidateFileUrl;
        const mediaLoadKey = absoluteFileUrl
            ? `${messageKey}:${normalizeMediaCompareUrl(absoluteFileUrl)}`
            : '';
        const isImageLoading = msg.type === 'image' && !!absoluteFileUrl && !loadedMediaKeys.has(mediaLoadKey);
        const isLikelyLocalOrPrivatePreview = (() => {
            if (!absoluteFileUrl) return true;
            try {
                const u = new URL(absoluteFileUrl);
                const host = (u.hostname || '').toLowerCase();
                if (!host) return true;
                if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
                if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
                if (u.pathname.includes('/uploads/')) return true;
                return false;
            } catch (_) {
                return true;
            }
        })();
        const canRemoteOfficePreview = isOfficePreviewDoc && !!absoluteFileUrl && !isLikelyLocalOrPrivatePreview;
        const officePreviewUrl = canRemoteOfficePreview
            ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteFileUrl)}`
            : '';
        const fileSizeLabel = formatFileSize(msg.fileSize || msg.file_size);
        const pageCount = Number(msg.pageCount ?? msg.pages ?? msg.page_count ?? msg.metadata?.pageCount ?? msg.metadata?.pages ?? msg.metadata?.page_count ?? 0);
        const formatDocumentCountLabel = (count, ext = '') => {
            const value = Number(count);
            if (!Number.isFinite(value) || value <= 0) return '';
            const n = Math.round(value);
            if (['ppt', 'pptx', 'pptm', 'pot', 'potx', 'pps', 'ppsx', 'odp'].includes(ext)) {
                return `${n} slide${n === 1 ? '' : 's'}`;
            }
            if (['xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'ods'].includes(ext)) {
                return `${n} sheet${n === 1 ? '' : 's'}`;
            }
            if (ext === 'csv') return `${n} row${n === 1 ? '' : 's'}`;
            if (ext === 'txt') return `${n} line${n === 1 ? '' : 's'}`;
            return `${n} page${n === 1 ? '' : 's'}`;
        };
        const pageCountLabel = formatDocumentCountLabel(pageCount, fileExt)
            || (['pdf', 'doc', 'docx', 'docm', 'dot', 'dotx', 'rtf', 'odt'].includes(fileExt) ? '1 page' : '')
            || '';
        const docMetaLabel = [fileBadgeLabel, pageCountLabel, fileSizeLabel].filter(Boolean).join(' | ');
        const docHoverTitle = [displayFileName, pageCountLabel, fileSizeLabel].filter(Boolean).join('\n');
        const getDocAccent = () => {
            if (['pdf'].includes(fileExt)) return '#E53935';
            if (['xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'csv', 'ods'].includes(fileExt)) return '#1F9D55';
            if (['ppt', 'pptx', 'pptm', 'pot', 'potx', 'pps', 'ppsx', 'odp'].includes(fileExt)) return '#D36A2E';
            if (['txt'].includes(fileExt)) return '#64748b';
            if (['doc', 'docx', 'docm', 'dot', 'dotx', 'rtf', 'odt'].includes(fileExt)) return '#2D6AC8';
            return '#54656f';
        };
        const docAccent = getDocAccent();
        const getDocTypeName = () => {
            if (['pdf'].includes(fileExt)) return 'PDF Document';
            if (['xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'csv', 'ods'].includes(fileExt)) return 'Spreadsheet';
            if (['ppt', 'pptx', 'pptm', 'pot', 'potx', 'pps', 'ppsx', 'odp'].includes(fileExt)) return 'Presentation';
            if (['doc', 'docx', 'docm', 'dot', 'dotx', 'rtf', 'odt'].includes(fileExt)) return 'Word Document';
            if (['txt'].includes(fileExt)) return 'Text Document';
            return 'Document';
        };
        const docTypeName = getDocTypeName();
        const audioSourceUrl = absoluteFileUrl || (typeof msg.content === 'string' && /^https?:\/\//i.test(msg.content) ? msg.content : '');
        const shouldUseSystemOpen = ['doc', 'docx', 'docm', 'dot', 'dotx', 'rtf', 'odt', 'xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'csv', 'ods', 'ppt', 'pptx', 'pptm', 'pot', 'potx', 'pps', 'ppsx', 'odp'].includes(fileExt);
        const docOpenUrl = officePreviewUrl || absoluteFileUrl;
        
        const unreadSeparator = (firstUnreadMessageId && String(msgId) === String(firstUnreadMessageId)) ? (
            <div className="wa-unread-separator">
                <span>
                    {pendingNewMsgCount === 1 ? '1 unread message' : `${pendingNewMsgCount} unread messages`}
                </span>
            </div>
        ) : null;

        const resolveCommunityGroupUpdate = () => {
            const metadata = msg.metadata || {};
            const normalizedType = String(msg.type || '').toLowerCase();
            const content = String(msg.content || '');
            const actionFromMetadata = String(metadata.action || '').toLowerCase();

            if (normalizedType === 'community_link' || metadata.kind === 'community_group_update') {
                const inferredAction = actionFromMetadata || (content.toLowerCase().includes('removed') ? 'removed' : 'added');
                return {
                    action: inferredAction === 'removed' ? 'removed' : 'added',
                    groupName: metadata.groupName || msg.group_name || '',
                    communityName: metadata.communityName || '',
                    actorName: isMe ? 'You' : (msg.sender_id?.name || 'Admin')
                };
            }

            const legacyMatch = content.match(/^Group\s+"(.+?)"\s+was\s+(added|removed)$/i);
            if (!legacyMatch) return null;

            return {
                action: legacyMatch[2].toLowerCase() === 'removed' ? 'removed' : 'added',
                groupName: legacyMatch[1],
                communityName: metadata.communityName || '',
                actorName: isMe ? 'You' : (msg.sender_id?.name || 'Admin')
            };
        };

        const renderCommunityGroupUpdate = (update) => {
            if (!update) return null;

            const isRemoved = update.action === 'removed';
            const title = isRemoved ? 'Group removed from community' : 'Group added to community';
            const accentColor = isRemoved ? '#c2410c' : '#0f766e';
            const accentBg = isRemoved ? 'rgba(251, 146, 60, 0.16)' : 'rgba(20, 184, 166, 0.14)';
            const borderColor = isRemoved ? 'rgba(251, 146, 60, 0.3)' : 'rgba(20, 184, 166, 0.28)';
            const glowColor = isRemoved ? 'rgba(251, 146, 60, 0.2)' : 'rgba(45, 212, 191, 0.22)';
            const Icon = isRemoved ? XCircle : CheckCircle;
            const detailText = update.communityName
                ? `"${update.groupName || 'Group'}" ${isRemoved ? 'is no longer linked to' : 'is now linked to'} "${update.communityName}"`
                : `"${update.groupName || 'Group'}" ${isRemoved ? 'was removed from the community' : 'was added to the community'}`;

            return (
                <div className="wa-community-update-wrap">
                    <div
                        className="wa-community-update-card"
                        style={{
                            '--wa-community-update-accent': accentColor,
                            '--wa-community-update-border': borderColor,
                            '--wa-community-update-bg': accentBg,
                            '--wa-community-update-glow': glowColor
                        }}
                    >
                        <div className="wa-community-update-icon">
                            <Icon size={16} />
                        </div>
                        <div className="wa-community-update-copy">
                            <div className="wa-community-update-title">{title}</div>
                            <div className="wa-community-update-text">{detailText}</div>
                            <div className="wa-community-update-meta">
                                <span>{update.actorName}</span>
                                {update.communityName && (
                                    <>
                                        <span className="wa-community-update-dot" />
                                        <span>{update.communityName}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        };

        const communityGroupUpdate = resolveCommunityGroupUpdate();
        if (communityGroupUpdate) {
            return renderCommunityGroupUpdate(communityGroupUpdate);
        }

        if (msg.is_system || msg.type === 'system') {
            const content = msg.content || '';
            let displayContent = content;

            const myId = user?.id || user?._id;
            const myName = user?.name || '';

            if (content.includes(' removed ')) {
                const parts = content.split(' removed ');
                let remover = parts[0];
                let target = parts[1];
                if (String(msg.sender_id?._id || msg.sender_id) === String(myId)) remover = 'You';
                const removedMemberId = msg.metadata?.removedMemberId;
                if (removedMemberId && String(removedMemberId) === String(myId)) {
                    target = 'you';
                    displayContent = `${remover} removed ${target}`;
                } else if (target === myName) {
                    target = 'you';
                    displayContent = `${remover} removed ${target}`;
                } else {
                    displayContent = `${remover} removed ${target}`;
                }
            } else if (content.includes(' added ')) {
                const parts = content.split(' added ');
                let adder = parts[0];
                let target = parts[1];
                if (String(msg.sender_id?._id || msg.sender_id) === String(myId)) adder = 'You';
                const addedMemberIds = msg.metadata?.addedMemberIds || [];
                if (addedMemberIds.some(id => String(id) === String(myId))) {
                    target = 'you';
                } else if (target === myName || target.includes(myName)) {
                    target = target.replace(myName, 'you');
                }
                displayContent = `${adder} added ${target}`;
            } else if (content.includes(' assigned ') && content.includes(' as the new owner')) {
                const parts = content.split(' assigned ');
                let assigner = parts[0];
                const subParts = parts[1].split(' as the new owner');
                let target = subParts[0];
                if (String(msg.sender_id?._id || msg.sender_id) === String(myId)) assigner = 'You';
                if (target === myName) target = 'you';
                displayContent = (assigner === 'You') ? `You assigned ${target} as the new owner` : `${target} is now a Community Owner`;
            } else if (content.includes('cancelled the event: ')) {
                const eventName = content.split('cancelled the event: ')[1];
                displayContent = `${isMe ? 'You' : senderName} cancelled the "${eventName}" event`;
            } else {
                const prefixMe = 'You ';
                const prefixSender = `${senderName} `;
                if (!content.toLowerCase().startsWith(prefixMe.toLowerCase()) &&
                    !content.toLowerCase().startsWith(prefixSender.toLowerCase()) &&
                    !content.startsWith('Group ')) {
                    displayContent = `${isMe ? 'You' : senderName} ${content}`;
                }
            }

            return (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                    <div className="wa-system-message">
                        {displayContent}
                    </div>
                </div>
            );
        }
        return (
            <Fragment key={msgId}>
                {unreadSeparator}
                <div
                    id={`msg-${msg._id}`}
                    className={`wa-message-container ${isForwardingMode ? 'forward-mode' : ''} ${isMe ? 'sent' : 'received'}`}
                    style={{
                        marginBottom: index === flattenedItems.length - 1 ? 0 : undefined,
                        justifyContent: isForwardingMode
                            ? 'flex-start'
                            : (isMe ? 'flex-end' : 'flex-start')
                    }}
                    onDoubleClick={() => { if (!isForwardingMode) setReplyingTo(msg); }}
                    onClick={() => {
                        if (isForwardingMode) {
                            if (isDeletedForCurrentUser(msg)) {
                                setSnackbar({ message: 'Deleted messages cannot be selected', type: 'info', variant: 'system' });
                                return;
                            }
                            const isSelected = forwardSelectedMsgs.find(m => String(m._id || m.id) === String(msg._id || msg.id));
                            if (isSelected) {
                                setForwardSelectedMsgs(prev => prev.filter(m => String(m._id || m.id) !== String(msg._id || msg.id)));
                            } else {
                                if (!msg._id && !msg.id) {
                                    setSnackbar({ message: "Please wait for message to sync before selecting", type: 'info' });
                                    return;
                                }
                                setForwardSelectedMsgs(prev => [...prev, msg]);
                            }
                        }
                    }}
                >
                    {isForwardingMode && !isDeletedForCurrentUser(msg) && (
                        <div className="wa-msg-checkbox">
                            {forwardSelectedMsgs.find(m => String(m._id || m.id) === String(msg._id || msg.id)) ?
                                <CheckSquare size={24} color="white" fill="#0EA5BE" /> :
                                <div className="wa-checkbox-empty" />
                            }
                        </div>
                    )}
                    <div
                        className={`wa-message-bubble ${isMe ? 'wa-msg-sent' : 'wa-msg-rec'} ${msg.type === 'audio' ? 'wa-voice-type' : ''} ${msg.type === 'poll' ? 'is-poll' : ''} ${msg.link_preview ? 'has-link-preview' : ''} ${msg.type === 'file' && !isVideoByExt ? 'wa-file-message-bubble' : ''}`}
                        onContextMenu={(e) => {
                            if (!isForwardingMode) {
                                e.preventDefault();
                                handleMsgDropdownOpen(e, msgId, msg);
                            }
                        }}
                        onTouchStart={(e) => {
                            if (!isForwardingMode) {
                                e.persist();
                                if (longPressTimer.current) clearTimeout(longPressTimer.current);
                                const startTouch = e.touches?.[0];
                                if (startTouch) {
                                    e.currentTarget.dataset.longPressX = String(startTouch.clientX);
                                    e.currentTarget.dataset.longPressY = String(startTouch.clientY);
                                }
                                longPressTimer.current = setTimeout(() => {
                                    const touchPoint = e.touches?.[0] || e.changedTouches?.[0];
                                    handleMsgDropdownOpen(
                                        {
                                            stopPropagation: () => e.stopPropagation?.(),
                                            clientX: touchPoint?.clientX,
                                            clientY: touchPoint?.clientY
                                        },
                                        msgId,
                                        msg
                                    );
                                }, 600);
                            }
                        }}
                        onTouchEnd={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
                        onTouchMove={(e) => {
                            const touch = e.touches?.[0];
                            const startX = Number(e.currentTarget.dataset.longPressX || 0);
                            const startY = Number(e.currentTarget.dataset.longPressY || 0);
                            if (!touch || !startX || !startY) return;
                            const moved = Math.hypot(touch.clientX - startX, touch.clientY - startY);
                            if (moved > 14 && longPressTimer.current) clearTimeout(longPressTimer.current);
                        }}
                    >
                        {isGroup && !isMe && (
                            <div className="wa-sender-name" style={{
                                fontWeight: '600',
                                fontSize: '13px',
                                color: senderColor,
                                cursor: 'default'
                            }}>
                                {senderName}
                            </div>
                        )}
                        {(msg.isForwarded || msg.is_forwarded) && !isMe && (
                            <div className="wa-forwarded-tag">
                                <Forward size={12} style={{ marginRight: 4 }} />
                                {(msg.forward_count || 0) >= 4 ? 'Forwarded many times' : 'Forwarded'}
                            </div>
                        )}
                        {!isForwardingMode && (
                            <div className="wa-dropdown-trigger msg-trigger" onClick={(e) => handleMsgDropdownOpen(e, msgId, msg)}>
                                <ChevronDown size={18} />
                            </div>
                        )}

                        {msg.reply_to && (
                            <div className="wa-reply-context">
                                <div className="wa-reply-context-name">
                                    {(() => {
                                        if (isMeMsg(msg.reply_to)) return 'You';
                                        if (isGroup) {
                                            return (
                                                msg.reply_to?.sender_id?.name ||
                                                msg.reply_to?.sender_id?.firstName ||
                                                msg.reply_to?.user_id?.name ||
                                                'User'
                                            );
                                        }
                                        return selectedUser?.name || 'User';
                                    })()}
                                </div>
                                <div className="wa-reply-context-text">
                                    {(() => {
                                        if (msg.reply_to.is_view_once) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ViewOnceBadge size={14} /> <span>View once</span></span>;
                                        if (msg.reply_to.type === 'image') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Camera size={14} color="#027EB5" /> <span>Photo</span></span>;
                                        if (msg.reply_to.type === 'file') {
                                            const replyFileName = msg.reply_to.fileName || msg.reply_to.file_name || msg.reply_to.name || '';
                                            const replyContent = sanitizeClipboardPayloadText(msg.reply_to.content || '').trim();
                                            const replyPathName = decodeURIComponent(String(msg.reply_to.file_path || msg.reply_to.filePath || '').split('?')[0].split('/').pop() || '').trim();
                                            const replyDisplayName = (replyFileName || (/\.[a-z0-9]{2,8}$/i.test(replyContent) ? replyContent : '') || replyPathName || 'File').replace(/^\d{10,}-/, '');
                                            return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><FileText size={14} color="#027EB5" /> <span>{compactFileName(replyDisplayName, 42)}</span></span>;
                                        }
                                        if (msg.reply_to.type === 'poll') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><List size={14} color="#027EB5" /> <span>{msg.reply_to.poll?.question || 'Poll'}</span></span>;
                                        if (msg.reply_to.type === 'voice' || msg.reply_to.type === 'audio') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mic size={14} color="#027EB5" /> <span>Voice message</span></span>;
                                        if (msg.reply_to.type === 'contact') {
                                            try {
                                                const parsed = JSON.parse(msg.reply_to.content);
                                                const txt = Array.isArray(parsed) ? `${parsed.length} contacts` : (parsed.name || parsed.mobile || 'Contact');
                                                return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><UserIcon size={14} color="#027EB5" /> <span>{txt}</span></span>;
                                            } catch (e) {
                                                return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><UserIcon size={14} color="#027EB5" /> <span>Contact</span></span>;
                                            }
                                        }
                                        return msg.reply_to.content || '';
                                    })()}
                                </div>
                            </div>
                        )}

                        {msg.is_deleted_by_admin ? (
                            <div className="wa-deleted-tag">
                                <Trash2 size={16} /> {t('chat_window.deleted_admin')}
                            </div>
                        ) : (msg.deleted_for && msg.deleted_for.includes(user.id || user._id)) ? (
                            <div className="wa-deleted-tag">
                                <XCircle size={16} /> {t('chat_window.deleted_user_me')}
                            </div>
                        ) : msg.is_deleted_by_user ? (
                            <div className="wa-deleted-tag">
                                <XCircle size={16} /> {t('chat_window.deleted_user_other')}
                            </div>
                        ) : (
                            <>
                                {msg.is_view_once && isViewOnceConsumed && msg.type !== 'audio' ? (
                                    <div className="wa-spent-view-once-media" draggable={false} onDragStart={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} onClick={() => setSnackbar({ message: 'Already seen', type: 'info', variant: 'system' })} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', color: '#8696a0', fontSize: 14, cursor: 'pointer' }}>
                                        <ViewOnceBadge size={20} />
                                        <span>{msg.type === 'image' ? 'Photo' : msg.type === 'file' ? 'File' : 'Video'}</span>
                                    </div>
                                ) : (
                                    <>
                                        {msg.type === 'image' && (
                                            <div className={`wa-msg-image-container ${isImageLoading ? 'is-loading' : ''} ${!absoluteFileUrl && !msg.is_view_once ? 'is-unavailable' : ''}`} onClick={(e) => {
                                                if (isForwardingMode) return;
                                                e.stopPropagation();
                                                if (msg.is_view_once) {
                                                    if (isViewOnceConsumed) {
                                                        setSnackbar({ message: 'Already seen', type: 'info', variant: 'system' });
                                                        return;
                                                    }
                                                    if (isMe) {
                                                        markViewOnceConsumedLocally(msg);
                                                        setSnackbar({ message: 'Viewed once. Marked as seen.', type: 'info', variant: 'system' });
                                                    }
                                                    if (!isMe) {
                                                        markViewOnceConsumedLocally(msg);
                                                        markMessageViewed(msg._id || msg.id);
                                                    }
                                                    const openUrl = absoluteFileUrl || msg.file_path || msg.filePath;
                                                    if (openUrl) {
                                                        setViewOncePreview({ url: openUrl, type: 'image' });
                                                    } else {
                                                        setSnackbar({ message: 'Media unavailable', type: 'error', variant: 'system' });
                                                    }
                                                    return;
                                                }
                                                setViewingContact(null);
                                                if (typeof onOpenMessageMedia === 'function') {
                                                    onOpenMessageMedia(msg);
                                                } else {
                                                    handleDownload(msg.file_path, msg.fileName, msg);
                                                }
                                            }}>
                                                {msg.is_view_once && !isViewOnceConsumed ? (
                                                    <div
                                                        style={{
                                                            minWidth: isMobile ? 150 : 180,
                                                            minHeight: isMobile ? 54 : 60,
                                                            borderRadius: 12,
                                                            border: '1px solid rgba(56, 189, 248, 0.28)',
                                                            background: 'linear-gradient(145deg, rgba(8, 35, 56, 0.95), rgba(8, 47, 73, 0.92))',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: 6,
                                                            color: '#cfe7f7',
                                                            fontSize: 12,
                                                            fontWeight: 600
                                                        }}
                                                    >
                                                        <ViewOnceBadge size={14} />
                                                        <span>View once photo</span>
                                                    </div>
                                                ) : absoluteFileUrl ? (
                                                    <DelayedMessageImage
                                                        messageKey={messageKey}
                                                        src={absoluteFileUrl}
                                                        msg={msg}
                                                        retryUrl={retryFileUrl}
                                                        onLoaded={handleMediaLoaded}
                                                        onError={handleMediaError}
                                                    />
                                                ) : (
                                                    <div className="wa-msg-image-unavailable">
                                                        <XCircle size={18} />
                                                        <span>Image unavailable</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {(msg.type === 'video' || (msg.type === 'file' && isVideoByExt)) && (
                                            <div className={`wa-msg-image-container ${videoPipKey === messageKey ? 'pip-active' : ''}`}
                                                style={{
                                                    position: 'relative',
                                                    borderRadius: 10,
                                                    overflow: 'hidden',
                                                    background: videoPipKey === messageKey ? 'linear-gradient(145deg, #0f172a 0%, #082f49 55%, #0a4f6b 100%)' : '#111b21',
                                                    cursor: 'pointer',
                                                    boxShadow: videoPipKey === messageKey ? '0 0 0 1px rgba(56,189,248,0.35), 0 8px 20px rgba(8,47,73,0.45)' : undefined,
                                                    transition: 'all 0.2s ease'
                                                }}
                                                onClick={(e) => {
                                                    if (msg.is_view_once) {
                                                        e.stopPropagation();
                                                        if (isViewOnceConsumed) {
                                                            setSnackbar({ message: 'Already seen', type: 'info', variant: 'system' });
                                                            return;
                                                        }
                                                        if (isMe) {
                                                            markViewOnceConsumedLocally(msg);
                                                            setSnackbar({ message: 'Viewed once. Marked as seen.', type: 'info', variant: 'system' });
                                                        }
                                                        if (!isMe) {
                                                            markViewOnceConsumedLocally(msg);
                                                            markMessageViewed(msg._id || msg.id);
                                                        }
                                                        const openUrl = absoluteFileUrl || msg.file_path || msg.filePath;
                                                        if (openUrl) {
                                                            setViewOncePreview({ url: openUrl, type: 'video' });
                                                        } else {
                                                            setSnackbar({ message: 'Media unavailable', type: 'error', variant: 'system' });
                                                        }
                                                        return;
                                                    }
                                                    setVideoOverlayVisible(msg, true, true);
                                                }}
                                            >
                                                {msg.is_view_once && !isViewOnceConsumed ? (
                                                    <div
                                                        style={{
                                                            minWidth: isMobile ? 158 : 188,
                                                            minHeight: isMobile ? 56 : 64,
                                                            borderRadius: 12,
                                                            border: '1px solid rgba(56, 189, 248, 0.28)',
                                                            background: 'linear-gradient(145deg, rgba(8, 35, 56, 0.95), rgba(8, 47, 73, 0.92))',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: 6,
                                                            color: '#cfe7f7',
                                                            fontSize: 12,
                                                            fontWeight: 600
                                                        }}
                                                    >
                                                        <ViewOnceBadge size={14} />
                                                        <span>View once video</span>
                                                    </div>
                                                ) : absoluteFileUrl ? (
                                                    <>
                                                        {videoPipKey === messageKey && videoPipPosterByKey.get(messageKey) && (
                                                            <img
                                                                src={videoPipPosterByKey.get(messageKey)}
                                                                alt="PiP preview"
                                                                style={{
                                                                    position: 'absolute',
                                                                    inset: 0,
                                                                    width: '100%',
                                                                    height: '100%',
                                                                    objectFit: 'cover',
                                                                    opacity: 0.95,
                                                                    filter: 'saturate(1.02) contrast(1.02)'
                                                                }}
                                                            />
                                                        )}
                                                        <video
                                                            ref={(node) => handleVideoRef(msg, node)}
                                                            key={`${messageKey}:${absoluteFileUrl}`}
                                                            src={absoluteFileUrl}
                                                            playsInline
                                                            preload="metadata"
                                                            controls
                                                            controlsList="noremoteplayback"
                                                            disableRemotePlayback
                                                            onError={(event) => handleMediaError(msg, retryFileUrl, event)}
                                                            onMouseEnter={() => {
                                                                setActiveVideoKey(messageKey);
                                                                setVideoOverlayVisible(msg, true, true);
                                                            }}
                                                            onMouseMove={() => {
                                                                setActiveVideoKey(messageKey);
                                                                setVideoOverlayVisible(msg, true, true);
                                                            }}
                                                            onTouchEnd={(event) => handleVideoMobileDoubleTap(msg, event)}
                                                            onDoubleClick={(event) => handleVideoDesktopDoubleClick(msg, event)}
                                                            onPlay={() => {
                                                                setActiveVideoKey(messageKey);
                                                                setVideoPlayingState(msg, true);
                                                                if (msg.is_view_once && !isMe) {
                                                                    markMessageViewed(msg._id || msg.id);
                                                                }
                                                            }}
                                                            onPause={() => {
                                                                setVideoPlayingState(msg, false);
                                                                setVideoOverlayVisible(msg, false, false);
                                                            }}
                                                            onLoadedMetadata={() => captureVideoPoster(msg)}
                                                            onEnded={(event) => {
                                                                setVideoPlayingState(msg, false);
                                                                setVideoOverlayVisible(msg, true, false);
                                                            }}
                                                            onClick={(event) => event.stopPropagation()}
                                                            style={{ 
                                                                width: '100%', 
                                                                maxWidth: isMobile ? 240 : 340, 
                                                                maxHeight: isMobile ? 320 : 420,
                                                                display: 'block', 
                                                                background: '#000', 
                                                                borderRadius: 8,
                                                                objectFit: 'cover',
                                                                opacity: videoPipKey === messageKey && videoPipPosterByKey.get(messageKey) ? 0.02 : 1
                                                            }}
                                                        />
                                                        {videoPipKey === messageKey && (
                                                            <div
                                                                style={{
                                                                    position: 'absolute',
                                                                    right: 10,
                                                                    bottom: 10,
                                                                    padding: '3px 10px',
                                                                    borderRadius: 999,
                                                                    fontSize: 11,
                                                                    fontWeight: 600,
                                                                    background: 'rgba(2,132,199,0.28)',
                                                                    border: '1px solid rgba(125,211,252,0.35)',
                                                                    color: '#e0f2fe',
                                                                    pointerEvents: 'none'
                                                                }}
                                                            >
                                                                PiP Active
                                                            </div>
                                                        )}
                                                        {videoOverlayVisibleByKey.get(messageKey) && videoPipKey !== messageKey && (
                                                            <div
                                                                onClick={(event) => event.stopPropagation()}
                                                                style={{
                                                                    position: 'absolute',
                                                                    top: '50%',
                                                                    left: '50%',
                                                                    transform: 'translate(-50%, -50%)',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 14,
                                                                    pointerEvents: 'auto',
                                                                    background: 'transparent',
                                                                    borderRadius: 999,
                                                                    padding: 0
                                                                }}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        toggleVideoPlayback(msg);
                                                                        setVideoOverlayVisible(msg, true, true);
                                                                    }}
                                                                    style={{
                                                                        border: '1px solid rgba(56, 189, 248, 0.35)',
                                                                        background: 'rgba(8, 47, 73, 0.62)',
                                                                        color: '#e0f2fe',
                                                                        cursor: 'pointer',
                                                                        width: 56,
                                                                        height: 56,
                                                                        borderRadius: '50%',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        backdropFilter: 'blur(6px)',
                                                                        boxShadow: '0 8px 16px rgba(8, 47, 73, 0.45)'
                                                                    }}
                                                                    title="Pause or play"
                                                                >
                                                                    {videoPlayingByKey.get(messageKey) ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="wa-deleted-tag" style={{ padding: '16px' }}>
                                                        <XCircle size={16} /> Video unavailable
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                                {msg.type === 'file' && !isVideoByExt && (
                                    <>
                                        {msg.is_view_once && isViewOnceConsumed ? (
                                            <div className="wa-spent-view-once-file" onClick={() => setSnackbar({ message: 'Already seen', type: 'info', variant: 'system' })} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', color: '#8696a0', fontSize: 14, cursor: 'pointer' }}>
                                                <ViewOnceBadge size={20} />
                                                <span>File</span>
                                            </div>
                                        ) : (
                                            <div className="wa-msg-doc-bubble">
                                                <div className="wa-doc-head">
                                                    <div className="wa-doc-icon" style={{ background: docAccent }}>
                                                        {fileBadgeLabel}
                                                    </div>
                                                    <div className="wa-doc-copy">
                                                        <div className="wa-doc-title">{docTypeName}</div>
                                                        <div className="wa-doc-filename" title={docHoverTitle}>
                                                            {compactFileName(displayFileName)}
                                                        </div>
                                                        <div className="wa-doc-meta">
                                                            {docMetaLabel}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="wa-doc-footer">
                                                    <button
                                                        type="button"
                                                        className="wa-doc-btn wa-doc-btn-open"
                                                        title="Open"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (msg.is_view_once && !isMe) {
                                                                markMessageViewed(msg._id);
                                                            }
                                                            if (typeof handleOpenFile === 'function') {
                                                                handleOpenFile(docOpenUrl || absoluteFileUrl || msg.file_path || msg.filePath, displayFileName, msg);
                                                            } else if (docOpenUrl) {
                                                                window.open(docOpenUrl, '_blank', 'noopener,noreferrer');
                                                            }
                                                        }}
                                                    >
                                                        Open
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="wa-doc-btn"
                                                        title="Save as"
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            if (msg.is_view_once && !isMe) {
                                                                markMessageViewed(msg._id);
                                                            }
                                                            handleDownload(absoluteFileUrl, displayFileName, msg); 
                                                        }}
                                                    >
                                                        Save as...
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                                {msg.type === 'audio' && (
                                    <div id={`voice-${msg._id}`} className="wa-voice-card-container">
                                        {msg.is_view_once && isViewOnceConsumed && String(playingAudioId) !== String(msg._id || msg.id) ? (
                                            <div className="wa-voice-card spent" onClick={() => setSnackbar({ message: 'Already seen', type: 'info', variant: 'system' })} style={{ opacity: 0.7, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minHeight: '72px', padding: '12px 16px', cursor: 'pointer' }}>
                                                <ViewOnceBadge size={20} />
                                                <span style={{ color: '#8696a0', fontSize: '13px', whiteSpace: 'nowrap', lineHeight: 1, display: 'flex', alignItems: 'center' }}>Voice message</span>
                                            </div>
                                        ) : (
                                            <div className={`wa-voice-card ${isMe ? 'sent' : 'received'}`}>
                                                <div className="wa-voice-avatar-section">
                                                    <div className="wa-voice-bubble-avatar" style={{ position: 'relative', width: 38, height: 38, background: '#0a84c6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                                        {String(playingAudioId) === String(msg._id || msg.id) ? (
                                                            <div className="wa-playback-speed-badge" onClick={togglePlaybackSpeed} style={{ cursor: 'pointer', fontSize: '10px', fontWeight: 'bold', color: '#0EA5BE' }}>
                                                                {msg.is_view_once ? viewOncePlaybackSpeed : playbackSpeed}x
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {isMe ? (
                                                                    (user?.image || user?.profile_pic || user?.avatar || user?.profile_photo) ? (
                                                                        <img src={user?.image || user?.profile_pic || user?.avatar || user?.profile_photo} alt="me" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                                                    ) : null
                                                                ) : (
                                                                    (msg.sender_id?.profile_photo || msg.sender_id?.image || msg.sender_id?.profile_pic || msg.sender_id?.avatar || selectedUser?.profile_photo || selectedUser?.avatar) ? (
                                                                        <img src={msg.sender_id?.profile_photo || msg.sender_id?.image || msg.sender_id?.profile_pic || msg.sender_id?.avatar || selectedUser?.profile_photo || selectedUser?.avatar} alt="user" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                                                    ) : null
                                                                )}
                                                                <div className="wa-avatar-letter" style={{ fontSize: '15px', fontWeight: 'bold', color: '#ffffff', background: '#0a84c6' }}>
                                                                    {isMe ? (user?.name || 'M')[0].toUpperCase() : (msg.sender_id?.name || selectedUser?.name || 'U')[0].toUpperCase()}
                                                                </div>
                                                            </>
                                                        )}
                                                        <div className="wa-voice-mic-badge" style={{ position: 'absolute', bottom: '0', right: '0', width: '14px', height: '14px', background: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                                                            <Mic size={10} color={msg.is_read ? '#53bdeb' : (msg.is_view_once ? '#0EA5BE' : '#8696a0')} />
                                                        </div>
                                                    </div>
                                                </div>

                                                <button className="wa-voice-play-btn" onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (msg.is_view_once) {
                                                        if (isViewOnceConsumed) {
                                                            setSnackbar({ message: 'Already seen', type: 'info', variant: 'system' });
                                                            return;
                                                        }
                                                        if (isMe) {
                                                            setLocallyConsumedViewOnceIds((prev) => {
                                                                if (prev.has(messageKey)) return prev;
                                                                const next = new Set(prev);
                                                                next.add(messageKey);
                                                                return next;
                                                            });
                                                            setSnackbar({ message: 'Viewed once. Marked as seen.', type: 'info', variant: 'system' });
                                                        }
                                                        if (!isMe) {
                                                            markViewOnceConsumedLocally(msg);
                                                            markMessageViewed(msg._id || msg.id);
                                                        }
                                                    }
                                                    const msgKey = String(msg._id || msg.id);
                                                    const pendingSeekPercentFromRef = pendingVoiceSeekRef?.current?.get(msgKey);
                                                    const pendingSeekPercentFromState = pendingVoiceSeekTargets?.[msgKey];
                                                    const pendingSeekPercent = pendingSeekPercentFromRef ?? pendingSeekPercentFromState ?? null;
                                                    if (pendingSeekPercent != null) {
                                                        handlePlayAudio(msg, 0, pendingSeekPercent);
                                                    } else {
                                                        handlePlayAudio(msg);
                                                    }
                                                }}>
                                                    {String(playingAudioId) === String(msg._id || msg.id) ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                                                </button>

                                                <div className="wa-voice-track">
                                                    <div
                                                        className="wa-voice-progress-dot"
                                                        style={{
                                                            left: `${activePlaybackRatio * 100}%`
                                                        }}
                                                    />
                                                    <div
                                                        className="wa-voice-waveform-static"
                                                        onMouseDown={(e) => {
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            beginVoiceSeekDrag(e.clientX, rect, e);
                                                        }}
                                                        onTouchStart={(e) => {
                                                            const touch = e.touches?.[0];
                                                            if (!touch) return;
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            beginVoiceSeekDrag(touch.clientX, rect, e);
                                                        }}
                                                        style={{ display: 'flex', alignItems: 'center', height: '100%', width: '100%', cursor: 'pointer' }}
                                                    >
                                                        <VoiceWaveform
                                                            src={audioSourceUrl}
                                                            activePlaybackRatio={activePlaybackRatio}
                                                            isInteractive={isAudioPlaying || isWaveSelected}
                                                        />
                                                    </div>
                                                </div>

                                                <span className="wa-voice-duration-text" style={{ color: isAudioPlaying ? '#5f6f79' : '#667781' }}>
                                                    {isAudioPlaying ? formatVoiceTime(liveElapsedSeconds) : formatVoiceTime(msg.duration || 0)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {(() => {
                                    let lp = msg.link_preview;
                                    if (!lp || !lp.title) return null;
                                    const previewUrl = lp.url || (typeof msg.content === 'string' ? msg.content : '');
                                    const youtubeId = getMessageListYouTubeId(previewUrl);
                                    const isYoutube = !!youtubeId || /(^|\/\/)(www\.)?(youtube\.com|youtu\.be)\//i.test(previewUrl);
                                    const openPreview = () => {
                                        if (typeof openLinkChoice === 'function') {
                                            openLinkChoice(previewUrl || lp.url, lp);
                                            return;
                                        }
                                        if (isYoutube && typeof openYouTubeChoice === 'function') {
                                            openYouTubeChoice(previewUrl, lp);
                                            return;
                                        }
                                        if (typeof openGenericLinkPreview === 'function') {
                                            openGenericLinkPreview(previewUrl || lp.url, lp);
                                            return;
                                        }
                                        window.open(previewUrl || lp.url, '_blank', 'noopener,noreferrer');
                                    };
                                    return (
                                        <div className={`wa-link-preview-card ${!lp.image ? 'no-image' : ''} ${isYoutube ? 'youtube' : ''}`} onClick={(e) => { e.stopPropagation(); openPreview(); }} style={{ cursor: 'pointer', marginTop: 8 }}>
                                            {lp.image && (
                                                <div className="wa-link-preview-image">
                                                    <img
                                                        src={lp.image}
                                                        alt=""
                                                        onError={(event) => {
                                                            event.currentTarget.closest('.wa-link-preview-image')?.remove();
                                                            event.currentTarget.closest('.wa-link-preview-card')?.classList.add('no-image');
                                                        }}
                                                    />
                                                    {isYoutube && (
                                                        <button
                                                            type="button"
                                                            className="wa-link-preview-play-btn"
                                                            aria-label="Choose how to open YouTube video"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                openPreview();
                                                            }}
                                                        >
                                                            <span className="wa-play-icon">
                                                                <Play size={28} color="white" fill="white" />
                                                            </span>
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            <div className="wa-link-preview-content">
                                                <div className="wa-link-preview-title">{lp.title}</div>
                                                {lp.description && <div className="wa-link-preview-description">{lp.description}</div>}
                                                <div className="wa-link-preview-domain">{lp.domain}</div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {msg.type === 'contact' && typeof renderContactMessageCard === 'function' && renderContactMessageCard(msg.content, { tone: 'light' })}
                                {msg.type === 'contact' && !renderContactMessageCard && (
                                    <div className="wa-contact-msg-card" style={{ padding: 12, background: 'white', borderRadius: 12, border: '1px solid #e9edef' }}>
                                        <UserIcon size={24} color="#0EA5BE" />
                                        <span>Contact Message</span>
                                    </div>
                                )}
                                {msg.type === 'poll' && msg.poll && (
                                    <div className="wa-poll-card-v3" style={{
                                        background: 'rgba(2, 132, 199, 0.15)',
                                        borderRadius: '12px',
                                        padding: isMobile ? '10px' : '12px',
                                        width: isMobile ? '260px' : '300px',
                                        maxWidth: '100%',
                                        boxSizing: 'border-box',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px',
                                        border: '1px solid rgba(56, 189, 248, 0.2)',
                                        backdropFilter: 'blur(8px)',
                                        margin: '4px 0',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <List size={isMobile ? 20 : 24} color="#0EA5BE" style={{ flexShrink: 0 }} />
                                            <div style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: '700', color: '#ffffff', wordBreak: 'break-word' }}>{msg.poll.question}</div>
                                        </div>
                                        
                                        <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', marginLeft: (typeof isMobile !== 'undefined' && isMobile) ? '30px' : '34px', marginBottom: '4px' }}>
                                            {msg.poll.allowMultipleAnswers ? 'Select one or more' : 'Select one'}
                                        </div>
                                        
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {(msg.poll.options || []).map((opt, idx) => {
                                                const voters = opt.voters || [];
                                                const myId = user.id || user._id;
                                                const isVoted = voters.some(v => String(v) === String(myId) || String(v?._id || v) === String(myId));
                                                
                                                return (
                                                    <div 
                                                        key={idx} 
                                                        onClick={() => handleVotePoll(msg, idx)} 
                                                        style={{ 
                                                            cursor: 'pointer', 
                                                            background: isVoted ? 'rgba(14, 165, 190, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                                            border: `1px solid ${isVoted ? '#0EA5BE' : 'rgba(255, 255, 255, 0.1)'}`,
                                                            borderRadius: '10px',
                                                            padding: isMobile ? '8px 10px' : '10px 12px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '10px',
                                                            transition: 'all 0.2s ease',
                                                            width: '100%',
                                                            boxSizing: 'border-box'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = isVoted ? 'rgba(14, 165, 190, 0.2)' : 'rgba(255, 255, 255, 0.05)'}
                                                    >
                                                        <div style={{
                                                            width: '18px',
                                                            height: '18px',
                                                            borderRadius: '5px',
                                                            border: `2px solid ${isVoted ? '#0EA5BE' : 'rgba(255, 255, 255, 0.4)'}`,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            background: isVoted ? '#0EA5BE' : 'transparent',
                                                            flexShrink: 0
                                                        }}>
                                                            {isVoted && <Check size={12} color="white" strokeWidth={3} />}
                                                        </div>
                                                        <span style={{ fontSize: isMobile ? '14px' : '15px', color: '#ffffff', fontWeight: '500', flex: 1, wordBreak: 'break-word' }}>{opt.text}</span>
                                                        <span style={{ fontSize: '13px', color: isVoted ? '#0EA5BE' : 'rgba(255, 255, 255, 0.6)', flexShrink: 0 }}>{voters.length}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        
                                        <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.15)', width: '100%', marginTop: '4px' }} />
                                        
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setPollDetails(msg.poll); setIsPollDetailsOpen(true); }}
                                            style={{
                                                width: '100%',
                                                padding: '6px 8px',
                                                border: 'none',
                                                background: 'transparent',
                                                color: '#0EA5BE',
                                                fontWeight: '600',
                                                fontSize: isMobile ? '14px' : '14px',
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                                opacity: 0.9,
                                                letterSpacing: '0.5px'
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.opacity = 1}
                                            onMouseOut={(e) => e.currentTarget.style.opacity = 0.9}
                                        >
                                            View votes
                                        </button>
                                    </div>
                                )}
                                {msg.type === 'event' && msg.event && (
                                    (() => {
                                        const myId = String(user?.id || user?._id || '');
                                        const eventOwnerId = getEventOwnerId(msg);
                                        const isSenderEvent = eventOwnerId === myId;
                                        const lifecycle = getEventLifecycleState(msg.event);
                                        const responses = getEventResponses(msg.event);
                                        const myResponse = responses.find((response) => String(response?.user_id?._id || response?.user_id?.id || response?.user_id || '') === myId);
                                        const actionLabel = isSenderEvent ? 'Edit event' : 'Respond';
                                        const canOpenRespond = !isSenderEvent && !lifecycle.isVoteLocked && !lifecycle.isCancelled;
                                        const canEditEvent = isSenderEvent && !lifecycle.isEnded && !lifecycle.isCancelled;
                                        const respondedCount = responses.length;
                                        const statusTone = lifecycle.isEnded || lifecycle.isCancelled || lifecycle.isRescheduled
                                            ? '#dc2626'
                                            : lifecycle.hasStarted
                                                ? '#0EA5BE'
                                                : '#0EA5BE';
                                        const actionTone = isSenderEvent && !canEditEvent ? '#94a3b8' : '#0EA5BE';
                                        const hasStatusRow = lifecycle.statusLabel !== 'Upcoming event';

                                        return (
                                            <div
                                                className="wa-event-card"
                                                onClick={(e) => { e.stopPropagation(); openEventDetails(msg); }}
                                                style={{ background: '#ffffff', borderRadius: '12px', overflow: 'visible', width: isMobile ? '240px' : '260px', maxWidth: '100%', cursor: 'pointer', opacity: msg.event.cancelled ? 0.7 : 1, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', marginBottom: '8px', position: 'relative' }}
                                            >
                                                <div style={{ background: 'rgba(14, 165, 190, 0.05)', padding: '14px 16px', color: '#111b21', position: 'relative', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>
                                                    <div style={{ display: 'flex', gap: '14px' }}>
                                                        <div style={{ background: 'white', border: '1px solid #e9edef', width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            <Calendar size={24} color="#0EA5BE" />
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '17px', fontWeight: 'bold', marginBottom: '4px', textDecoration: msg.event.cancelled ? 'line-through' : 'none', wordBreak: 'break-word', color: '#111b21' }}>
                                                                {msg.event.name || 'Event'}
                                                            </div>
                                                            <div style={{ fontSize: '14px', color: '#667781' }}>
                                                                {formatInlineEventTime(msg.event)}
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                                                                <div style={{ display: 'flex', position: 'relative', width: '20px', height: '20px' }}>
                                                                    <div style={{ position: 'absolute', width: '20px', height: '20px', borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                                                        <UserIcon size={12} color="#8696a0" style={{ marginTop: '1px' }} />
                                                                    </div>
                                                                </div>
                                                                <span style={{ fontSize: '14px', color: '#0EA5BE', fontWeight: 500 }}>
                                                                    {respondedCount} responded
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ padding: '0 16px 12px', borderTop: '1px solid #f0f2f5', textAlign: 'center', position: 'relative', background: '#ffffff', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}>
                                                    {!isSenderEvent && canOpenRespond && openEventRespondId === String(msg._id || msg.id) && (
                                                        <div
                                                            onClick={(e) => e.stopPropagation()}
                                                            style={{ position: 'absolute', left: '50%', bottom: 'calc(100% + 8px)', transform: 'translateX(-50%)', width: isMobile ? '175px' : '190px', background: '#ffffff', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.18)', border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden', zIndex: 25 }}
                                                        >
                                                            {['Going', 'Maybe', 'Not going'].map((status) => (
                                                                <button
                                                                    key={status}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleEventRespond(msg, status);
                                                                    }}
                                                                    style={{ width: '100%', background: myResponse?.status === status ? 'rgba(14, 165, 190, 0.08)' : '#ffffff', border: 'none', borderBottom: status !== 'Not going' ? '1px solid #f0f2f5' : 'none', padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px', color: '#111b21', textAlign: 'left' }}
                                                                >
                                                                    <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${myResponse?.status === status ? '#0EA5BE' : '#9ca3af'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                        {myResponse?.status === status && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0EA5BE', display: 'block' }} />}
                                                                    </span>
                                                                    <span>{status}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (isSenderEvent) {
                                                                if (!canEditEvent) {
                                                                    openEventDetails(msg);
                                                                    return;
                                                                }
                                                                openEditEvent(msg);
                                                                return;
                                                            }
                                                            if (!canOpenRespond) {
                                                                openEventDetails(msg);
                                                                return;
                                                            }
                                                            setOpenEventRespondId(openEventRespondId === String(msg._id || msg.id) ? null : String(msg._id || msg.id));
                                                        }}
                                                        style={{ color: actionTone, fontWeight: '600', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '22px', paddingTop: '12px', paddingBottom: hasStatusRow ? '10px' : '2px', cursor: (canEditEvent || canOpenRespond) ? 'pointer' : 'default', opacity: (!isSenderEvent && !canOpenRespond) || (isSenderEvent && !canEditEvent) ? 0.75 : 1 }}
                                                    >
                                                        <span>{actionLabel}</span>
                                                        {!isSenderEvent && <ChevronDown size={16} color={actionTone} />}
                                                    </div>

                                                    {hasStatusRow && (
                                                        <div style={{ borderTop: '1px solid #eef2f5', paddingTop: '10px' }}>
                                                            <div style={{ color: statusTone, fontWeight: '600', fontSize: '15px', minHeight: '22px' }}>
                                                                {lifecycle.statusLabel}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()
                                )}

                                {sanitizedMessageContent &&
                                    msg.type !== 'contact' &&
                                    msg.type !== 'poll' &&
                                    msg.type !== 'event' &&
                                    !(msg.is_view_once && (msg.type === 'image' || msg.type === 'video' || msg.type === 'audio' || (msg.type === 'file' && isVideoByExt))) && (
                                    <span
                                        className={`wa-msg-inline-text ${msg.type === 'file' ? 'has-attachment' : ''}`}
                                        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', display: 'block', maxWidth: '100%' }}
                                    >
                                        {renderContent(sanitizedMessageContent)}
                                    </span>
                                )}
                            </>
                        )}

                        {msg.type !== 'audio' && (
                            <div className="wa-msg-meta" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: '#667781' }}>
                                {msg.is_starred && <Star size={12} className="wa-star-icon" fill="currentColor" />}
                                {msg.is_edited && <span>Edited</span>}
                                <span>{formatTime(isMe && msg.scheduled_created_at ? msg.scheduled_created_at : msg.created_at)}</span>
                                {isMe && (
                                    <span className="wa-msg-status">
                                        {msg.is_read ? (
                                            <CheckCheck size={16} color="#53bdeb" />
                                        ) : (
                                            <CheckCheck size={16} color="#8696a0" />
                                        )}
                                    </span>
                                )}
                            </div>
                        )}

                        {msg.type === 'audio' && (
                            <div className="wa-voice-bubble-meta">
                                {msg.is_starred && <Star size={12} className="wa-star-icon" fill="currentColor" style={{ marginRight: 4 }} />}
                                <span className="wa-timestamp">{formatTime(isMe && msg.scheduled_created_at ? msg.scheduled_created_at : msg.created_at)}</span>
                                {isMe && (
                                    <span className="wa-msg-status" style={{ marginLeft: 4 }}>
                                        {msg.is_read ? (
                                            <CheckCheck size={16} color="#53bdeb" />
                                        ) : (
                                            <CheckCheck size={16} color="#8696a0" />
                                        )}
                                    </span>
                                )}
                            </div>
                        )}

                        {msg.reactions && msg.reactions.length > 0 && (() => {
                            const currentUserId = user.id || user._id;
                            const grouped = msg.reactions.reduce((acc, r) => {
                                if (!acc[r.emoji]) acc[r.emoji] = { count: 0, reactedByMe: false };
                                acc[r.emoji].count++;
                                if (String(r.user_id) === String(currentUserId)) {
                                    acc[r.emoji].reactedByMe = true;
                                }
                                return acc;
                            }, {});

                            return (
                                <div className={`wa-reaction-badges ${isMe ? 'wa-reaction-badges-sent' : 'wa-reaction-badges-recv'}`}>
                                    {Object.entries(grouped).map(([emoji, { count, reactedByMe }]) => (
                                        <span
                                            key={emoji}
                                            className={`wa-reaction-badge ${reactedByMe ? 'reacted' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const bubble = e.currentTarget.closest('.wa-message-bubble') || e.currentTarget.closest('.wa-msg-sent') || e.currentTarget.closest('.wa-msg-rec');
                                                setReactionDetails({ msg, isGroup: !!isGroup, rect: (bubble || e.currentTarget).getBoundingClientRect() });
                                            }}
                                        >
                                            {emoji}
                                            {count > 1 && <span className="wa-reaction-count">{count}</span>}
                                        </span>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </Fragment>
        );
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {viewOncePreview && (
                <div
                    onClick={() => setViewOncePreview(null)}
                    className="wa-view-once-media-privacy-overlay"
                    onDragStart={(e) => e.preventDefault()}
                    onContextMenu={(e) => e.preventDefault()}
                    onPointerMove={(e) => {
                        if (e.buttons) e.preventDefault();
                    }}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 35,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 12px 12px',
                        boxSizing: 'border-box',
                        backdropFilter: 'blur(34px) saturate(130%)',
                        WebkitBackdropFilter: 'blur(34px) saturate(130%)'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                            style={{
                                width: 'min(92%, 960px)',
                                height: 'auto',
                                maxHeight: '100%',
                                borderRadius: 12,
                                overflow: 'hidden',
                                border: '1px solid rgba(56, 189, 248, 0.28)',
                                background: 'rgba(8, 34, 58, 0.34)',
                                boxShadow: '0 16px 42px rgba(0,0,0,0.28)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backdropFilter: 'blur(18px) saturate(120%)',
                                WebkitBackdropFilter: 'blur(18px) saturate(120%)'
                            }}
                        >
                        {viewOncePreview.type === 'video' ? (
                            <video
                                src={viewOncePreview.url}
                                controls
                                autoPlay
                                preload="auto"
                                playsInline
                                draggable={false}
                                onDragStart={(e) => e.preventDefault()}
                                onContextMenu={(e) => e.preventDefault()}
                                style={{ width: '100%', maxHeight: 'calc(100vh - 180px)', display: 'block', background: 'transparent', objectFit: 'contain' }}
                            />
                        ) : (
                            <img
                                src={viewOncePreview.url}
                                alt="View once"
                                draggable={false}
                                onDragStart={(e) => e.preventDefault()}
                                onContextMenu={(e) => e.preventDefault()}
                                style={{ width: '100%', maxHeight: 'calc(100vh - 180px)', objectFit: 'contain', display: 'block', background: 'transparent' }}
                            />
                        )}
                    </div>
                </div>
            )}
            <Virtuoso
                ref={virtuosoRef}
                style={{ height: '100%', width: '100%' }}
                scrollerRef={(ref) => {
                    if (scrollerRef) {
                        if (typeof scrollerRef === 'function') scrollerRef(ref);
                        else scrollerRef.current = ref;
                    }
                }}
                data={flattenedItems}
                initialTopMostItemIndex={flattenedItems.length - 1}
                itemContent={renderItem}
                followOutput="auto"
                alignToBottom={true}
                onScroll={onScroll}
                increaseViewportBy={300}
                components={{
                    Scroller: MessageScroller,
                    Header: headerContent ? () => headerContent : undefined,
                    Footer: () => <div ref={bottomRef} className="wa-message-list-footer-spacer" aria-hidden="true" />
                }}
                atBottomStateChange={(atBottom) => {
                    setIsAtBottom(atBottom);
                    if (setShowScrollBtn) setShowScrollBtn(!atBottom);
                    if (atBottom && pendingNewMsgCount > 0) {
                        if (clearPendingUnread) clearPendingUnread();
                        if (markAsRead && selectedUser?._id) markAsRead(selectedUser._id);
                    }
                }}
            />
        </div>
    );
});

export default MessageList;
