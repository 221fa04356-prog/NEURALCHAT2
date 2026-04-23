import React, { memo, Fragment, useRef, useEffect, useState } from 'react';
import { 
    Trash2, XCircle, Forward, ChevronDown, Camera, FileText, 
    Pause, Play, Mic, User as UserIcon, CheckSquare, 
    Check, CheckCheck, Star, Pin, List, Calendar, X, CheckCircle
} from 'lucide-react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import ViewOnceBadge from './ViewOnceBadge';

const DEFAULT_VOICE_WAVEFORM = [8, 10, 9, 12, 11, 8, 13, 15, 12, 9, 11, 14, 10, 13, 8, 10, 15, 11, 13, 10, 14, 12, 9, 8, 10, 13, 11, 12, 9, 11];
const VOICE_WAVEFORM_BARS = 30;
const voiceWaveformCache = new Map();
const failedMediaUrlCache = new Set();

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
    const token = localStorage.getItem('token') || '';
    if (!token) return url;

    try {
        const parsed = new URL(url, window.location.origin);
        if (!parsed.pathname.startsWith('/api/chat/media')) return url;
        parsed.searchParams.set('token', token);
        if (/^https?:\/\//i.test(url)) return parsed.toString();
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (_) {
        if (!String(url).includes('/api/chat/media')) return url;
        const withoutToken = String(url)
            .replace(/([?&])token=[^&#]*&?/i, '$1')
            .replace(/[?&]$/g, '');
        return withoutToken.includes('?')
            ? `${withoutToken}&token=${encodeURIComponent(token)}`
            : `${withoutToken}?token=${encodeURIComponent(token)}`;
    }
};

const buildMediaProxyUrl = (rawPath) => {
    if (!rawPath) return '';
    const raw = String(rawPath);
    const normalizedPath = (() => {
        try {
            const parsed = new URL(raw, window.location.origin);
            return parsed.pathname || raw;
        } catch (_) {
            return raw;
        }
    })();
    const fileName = normalizedPath.split('/').pop() || '';
    const params = new URLSearchParams();
    params.set('path', normalizedPath);
    if (fileName) params.set('name', fileName);
    return appendMediaToken(`/api/chat/media?${params.toString()}`);
};

const buildMessageMediaFallbackUrl = (msg, isGroupChat = false) => {
    const msgId = String(msg?._id || msg?.id || '');
    if (!msgId) return '';
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

const resolveAbsoluteMessageFileUrl = (msg, isGroupChat = false) => {
    const rawPath = msg?.file_path || msg?.filePath || '';
    if (!rawPath) return '';
    const raw = String(rawPath);
    if (raw.startsWith('blob:') || raw.startsWith('data:')) return raw;
    const fallbackUrl = buildMessageMediaFallbackUrl(msg, isGroupChat);

    if (raw.startsWith('http')) {
        try {
            const parsed = new URL(raw);
            if (parsed.pathname.startsWith('/api/chat/media')) {
                const resolved = /\/api\/chat\/media\/file\//i.test(parsed.pathname)
                    ? appendMediaToken(`${parsed.pathname}${parsed.search || ''}`)
                    : (fallbackUrl || appendMediaToken(`${parsed.pathname}${parsed.search || ''}`));
                return failedMediaUrlCache.has(resolved) ? '' : resolved;
            }
            if (parsed.pathname.startsWith('/uploads/')) {
                const resolved = fallbackUrl || buildMediaProxyUrl(parsed.pathname);
                return failedMediaUrlCache.has(resolved) ? '' : resolved;
            }
        } catch (_) { }
        const resolved = fallbackUrl || appendMediaToken(raw);
        return failedMediaUrlCache.has(resolved) ? '' : resolved;
    }

    const normalized = raw.startsWith('/') ? raw : `/${raw.replace(/^\/+/, '')}`;
    if (normalized.startsWith('/api/chat/media')) {
        const resolved = /\/api\/chat\/media\/file\//i.test(normalized)
            ? appendMediaToken(normalized)
            : (fallbackUrl || appendMediaToken(normalized));
        return failedMediaUrlCache.has(resolved) ? '' : resolved;
    }
    if (normalized.startsWith('/uploads/')) {
        const resolved = fallbackUrl || buildMediaProxyUrl(normalized);
        return failedMediaUrlCache.has(resolved) ? '' : resolved;
    }
    const resolved = fallbackUrl || appendMediaToken(normalized);
    return failedMediaUrlCache.has(resolved) ? '' : resolved;
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
    setShowScrollBtn,
    clearPendingUnread,
    markAsRead,
    markMessageViewed,
    scrollerRef,
    jumpToMessageTarget,
    isGroup,
    headerContent,
    onScroll,
    isMobile
}) => {
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [, setFailedMediaVersion] = useState(0);
    const rememberFailedMediaUrl = (url) => {
        if (!url || failedMediaUrlCache.has(url)) return;
        failedMediaUrlCache.add(url);
        setFailedMediaVersion((v) => v + 1);
    };
    const virtuosoRef = useRef(null);
    const handledJumpNonceRef = useRef(null);
    const targetId = String(selectedUser?._id || '').toLowerCase();
    const typingSet = typingUsers[targetId];

    // 1. Prepare Flattened List for Virtuoso
    const flattenedItems = React.useMemo(() => {
        const items = [];
        let currentGroupDate = null;

        const filteredMessages = messages.filter(msg => {
            if (!messageSearchQuery) return true;
            return (msg.content || '').toLowerCase().includes(messageSearchQuery.toLowerCase());
        });

        filteredMessages.forEach((msg) => {
            const dateLabel = formatDateForSeparator(msg.created_at, t, getLangCode(selectedLanguage));
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
        const isLastItem = index === flattenedItems.length - 1;
        const msgId = msg._id || msg.id;
        const isMe = isMeMsg(msg);
        const isAudioPlaying = String(playingAudioId) === String(msg._id || msg.id);
        const activePlaybackDuration = Math.max(1, Number(playbackDuration || msg.duration || 1));
        const pendingSeekPercentForMsg = pendingVoiceSeekTargets?.[String(msg._id || msg.id)] ?? null;
        const displayElapsedSeconds = isAudioPlaying
            ? Math.min(Math.max(0, Math.round(activePlaybackDuration)), Math.max(0, Math.floor(Number(playbackPosition || 0))))
            : Math.max(0, Math.round(msg.duration || 0));
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
        const contentGuess = (typeof msg.content === 'string' ? msg.content.trim() : '');
        const filePathGuess = decodeURIComponent(String(msg.file_path || msg.filePath || '').split('?')[0].split('/').pop() || '').trim();
        const rawFileName = fileNameDirect || (/\.[a-z0-9]{2,8}$/i.test(contentGuess) ? contentGuess : '') || filePathGuess || 'Document';
        const displayFileName = rawFileName.replace(/^\d{10,}-/, '');
        const fileDotIdx = displayFileName.lastIndexOf('.');
        const fileExt = (fileDotIdx > 0 && fileDotIdx < displayFileName.length - 1) ? displayFileName.slice(fileDotIdx + 1).toLowerCase() : '';
        const getFriendlyFileLabel = () => {
            if (fileExt === 'pdf') return 'PDF';
            if (['csv'].includes(fileExt)) return 'CSV';
            if (['xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'ods'].includes(fileExt)) return 'XLS';
            if (['ppt', 'pptx', 'pptm', 'pot', 'potx', 'pps', 'ppsx', 'odp'].includes(fileExt)) return 'PPT';
            if (['doc', 'docx', 'docm', 'dot', 'dotx', 'rtf', 'odt', 'txt'].includes(fileExt)) return 'DOC';
            if (['zip', 'rar', '7z', 'tar', 'gz'].includes(fileExt)) return 'ZIP';
            return 'FILE';
        };
        const fileBadgeLabel = getFriendlyFileLabel();
        const isVideoByExt = ['mp4', 'avi', 'mkv', 'mov', 'webm', 'm4v'].includes(fileExt);
        const isPdfDoc = fileExt === 'pdf';
        const isOfficePreviewDoc = ['doc', 'docx', 'docm', 'dot', 'dotx', 'rtf', 'odt', 'xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'ods', 'ppt', 'pptx', 'pptm', 'pot', 'potx', 'pps', 'ppsx', 'odp'].includes(fileExt);
        const absoluteFileUrl = msg.file_path ? resolveAbsoluteMessageFileUrl(msg, isGroup) : '';
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
        const formatFileSize = (bytes) => {
            const n = Number(bytes || 0);
            if (!Number.isFinite(n) || n <= 0) return '';
            if (n >= 1024 * 1024) return `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`;
            return `${Math.max(1, Math.round(n / 1024))} kB`;
        };
        const fileSizeLabel = formatFileSize(msg.fileSize || msg.file_size);
        const getDocAccent = () => {
            if (['pdf'].includes(fileExt)) return '#E53935';
            if (['xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'csv', 'ods'].includes(fileExt)) return '#1F9D55';
            if (['ppt', 'pptx', 'pptm', 'pot', 'potx', 'pps', 'ppsx', 'odp'].includes(fileExt)) return '#D36A2E';
            if (['doc', 'docx', 'docm', 'dot', 'dotx', 'rtf', 'odt', 'txt'].includes(fileExt)) return '#2D6AC8';
            return '#54656f';
        };
        const docAccent = getDocAccent();
        const getDocTypeName = () => {
            if (['pdf'].includes(fileExt)) return 'PDF Document';
            if (['xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'csv', 'ods'].includes(fileExt)) return 'Spreadsheet';
            if (['ppt', 'pptx', 'pptm', 'pot', 'potx', 'pps', 'ppsx', 'odp'].includes(fileExt)) return 'Presentation';
            if (['doc', 'docx', 'docm', 'dot', 'dotx', 'rtf', 'odt', 'txt'].includes(fileExt)) return 'Text Document';
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
                if (target === myName) {
                    target = 'you';
                    displayContent = (remover !== 'You') ? `You were removed by ${remover}` : `You removed you`;
                } else {
                    displayContent = `${remover} removed ${target}`;
                }
            } else if (content.includes(' added ')) {
                const parts = content.split(' added ');
                let adder = parts[0];
                let target = parts[1];
                if (String(msg.sender_id?._id || msg.sender_id) === String(myId)) adder = 'You';
                if (target === myName || target.includes(myName)) target = target.replace(myName, 'you');
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
        if (msg.type === 'community_link') {
            const commName = msg.metadata?.communityName || 'Community';
            const isMe = String(msg.sender_id?._id || msg.sender_id) === String(user?.id || user?._id);
            const displayContent = isMe ? `You added this group to the community: ${commName}` : `${msg.sender_id?.name || 'Admin'} added this group to the community: ${commName}`;
            return (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                    <div style={{ background: '#F3FDFE', borderRadius: '12px', padding: '16px 24px', textAlign: 'center', border: '1px solid #E0F2F1', color: '#00695C', fontSize: '14px', maxWidth: '85%' }}>
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
                    {isForwardingMode && (
                        <div className="wa-msg-checkbox">
                            {forwardSelectedMsgs.find(m => String(m._id || m.id) === String(msg._id || msg.id)) ?
                                <CheckSquare size={24} color="white" fill="#0EA5BE" /> :
                                <div className="wa-checkbox-empty" />
                            }
                        </div>
                    )}
                    <div
                        className={`wa-message-bubble ${isMe ? 'wa-msg-sent' : 'wa-msg-rec'} ${msg.type === 'audio' ? 'wa-voice-type' : ''} ${msg.type === 'poll' ? 'is-poll' : ''} ${msg.link_preview ? 'has-link-preview' : ''}`}
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
                        onTouchMove={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
                    >
                        {isGroup && !isMe && (
                            <div className="wa-sender-name" style={{
                                fontWeight: '600',
                                fontSize: '13px',
                                color: senderColor,
                                marginBottom: '4px',
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
                                        if (msg.reply_to.type === 'image') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Camera size={14} color="#027EB5" /> <span>Photo</span></span>;
                                        if (msg.reply_to.type === 'file') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><FileText size={14} color="#027EB5" /> <span>File</span></span>;
                                        if (msg.reply_to.type === 'poll') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>📊 <span>{msg.reply_to.poll?.question || 'Poll'}</span></span>;
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
                                {msg.is_view_once && msg.is_viewed && !isMeMsg(msg) ? (
                                    <div className="wa-spent-view-once-media" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', color: '#8696a0', fontSize: 14 }}>
                                        <ViewOnceBadge size={20} />
                                        <span>{msg.type === 'image' ? 'Photo' : 'Video'}</span>
                                    </div>
                                ) : (
                                    <>
                                        {msg.type === 'image' && (
                                            <div className="wa-msg-image-container" onClick={(e) => {
                                                if (isForwardingMode) return;
                                                e.stopPropagation();
                                                if (msg.is_view_once && !isMe) {
                                                    markMessageViewed(msg._id);
                                                }
                                                setViewingContact(null);
                                                handleDownload(msg.file_path, msg.fileName, msg);
                                            }}>
                                                {absoluteFileUrl ? (
                                                    <img
                                                        src={absoluteFileUrl}
                                                        alt="Sent"
                                                        className="wa-msg-image"
                                                        onError={() => rememberFailedMediaUrl(absoluteFileUrl)}
                                                    />
                                                ) : (
                                                    <div className="wa-deleted-tag">
                                                        <XCircle size={16} /> Media unavailable
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {(msg.type === 'video' || (msg.type === 'file' && isVideoByExt)) && (
                                            <div className="wa-msg-image-container" 
                                                style={{ borderRadius: 10, overflow: 'hidden', background: '#111b21', cursor: 'pointer' }}
                                                onClick={(e) => {
                                                    if (msg.is_view_once && !isMe) {
                                                        markAsRead(msg);
                                                    }
                                                }}
                                            >
                                                {absoluteFileUrl ? (
                                                    <video
                                                        src={absoluteFileUrl}
                                                        controls
                                                        playsInline
                                                        preload="metadata"
                                                        crossOrigin="anonymous"
                                                        onError={() => rememberFailedMediaUrl(absoluteFileUrl)}
                                                        style={{ 
                                                            width: '100%', 
                                                            maxWidth: isMobile ? 240 : 340, 
                                                            maxHeight: isMobile ? 320 : 420,
                                                            display: 'block', 
                                                            background: '#000', 
                                                            borderRadius: 8,
                                                            objectFit: 'contain'
                                                        }}
                                                    >
                                                        <source src={absoluteFileUrl} type={fileExt === 'webm' ? 'video/webm' : 'video/mp4'} />
                                                    </video>
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
                                        {msg.is_view_once && msg.is_viewed && !isMeMsg(msg) ? (
                                            <div className="wa-spent-view-once-file" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', color: '#8696a0', fontSize: 14 }}>
                                                <ViewOnceBadge size={20} />
                                                <span>File</span>
                                            </div>
                                        ) : (
                                            <div
                                                className="wa-msg-doc-bubble"
                                                style={{ overflow: 'hidden', borderRadius: 12 }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 2px 4px' }}>
                                                    <div className="wa-doc-icon" style={{ background: docAccent }}>
                                                        {fileBadgeLabel}
                                                    </div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div className="wa-doc-title">{docTypeName}</div>
                                                        <div className="wa-doc-filename" title={displayFileName}>
                                                            {displayFileName}
                                                        </div>
                                                        <div className="wa-doc-meta">
                                                            {fileBadgeLabel}{fileSizeLabel ? ` | ${fileSizeLabel}` : ''}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="wa-doc-footer">
                                                    <button
                                                        type="button"
                                                        className="wa-doc-btn wa-doc-btn-open"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (msg.is_view_once && !isMe) {
                                                                markMessageViewed(msg._id);
                                                            }
                                                            if (shouldUseSystemOpen && typeof handleOpenFile === 'function') {
                                                                handleOpenFile(absoluteFileUrl, displayFileName, msg);
                                                                return;
                                                            }
                                                            if (docOpenUrl) {
                                                                window.open(docOpenUrl, '_blank', 'noopener,noreferrer');
                                                            }
                                                        }}
                                                    >
                                                        Open
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="wa-doc-btn"
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
                                        {msg.is_view_once && msg.is_viewed && !isMeMsg(msg) && String(playingAudioId) !== String(msg._id || msg.id) ? (
                                            <div className="wa-voice-card spent" style={{ opacity: 0.7, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minHeight: '72px', padding: '12px 16px' }}>
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
                                    return (
                                        <div className="wa-link-preview-card" onClick={(e) => { e.stopPropagation(); window.open(lp.url, '_blank'); }} style={{ cursor: 'pointer', marginTop: 8 }}>
                                            {lp.image && <img src={lp.image} alt="" style={{ width: '100%', borderRadius: '8px' }} />}
                                            <div style={{ padding: 8 }}>
                                                <div style={{ fontWeight: 600, fontSize: 13 }}>{lp.title}</div>
                                                <div style={{ fontSize: 12, color: '#667781' }}>{lp.domain}</div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {msg.type === 'contact' && (
                                    <div className="wa-contact-msg-card" style={{ padding: 12, background: 'white', borderRadius: 12, border: '1px solid #e9edef' }}>
                                        <UserIcon size={24} color="#0EA5BE" />
                                        <span>Contact Message</span>
                                    </div>
                                )}                                {msg.type === 'poll' && msg.poll && (
                                    <div className="wa-poll-card-v3" style={{
                                        background: 'rgba(2, 132, 199, 0.15)',
                                        borderRadius: '12px',
                                        padding: isMobile ? '12px' : '16px',
                                        width: '100%',
                                        maxWidth: isMobile ? '280px' : '360px',
                                        boxSizing: 'border-box',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '14px',
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
                                                            padding: isMobile ? '10px 12px' : '12px 16px',
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
                                                        <span style={{ fontSize: isMobile ? '14px' : '16px', color: '#ffffff', fontWeight: '500', flex: 1, wordBreak: 'break-word' }}>{opt.text}</span>
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
                                                padding: '8px',
                                                border: 'none',
                                                background: 'transparent',
                                                color: '#0EA5BE',
                                                fontWeight: '600',
                                                fontSize: isMobile ? '14px' : '15px',
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

                                {msg.content && msg.type !== 'contact' && msg.type !== 'poll' && msg.type !== 'event' && (
                                    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderContent(msg.content)}</span>
                                )}
                            </>
                        )}

                        {msg.type !== 'audio' && (
                            <div className="wa-msg-meta" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: '#667781' }}>
                                {msg.is_starred && <Star size={12} className="wa-star-icon" fill="currentColor" />}
                                {msg.is_edited && <span>Edited</span>}
                                <span>{formatTime(msg.created_at)}</span>
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
                                <span className="wa-timestamp">{formatTime(msg.created_at)}</span>
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
                    </div>
                </div>
            </Fragment>
        );
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
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




