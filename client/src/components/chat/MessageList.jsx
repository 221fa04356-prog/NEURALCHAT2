import React, { memo, Fragment, useRef, useEffect, useState } from 'react';
import { 
    Trash2, XCircle, Forward, ChevronDown, Camera, FileText, 
    Pause, Play, Mic, User as UserIcon, CheckSquare, 
    Check, CheckCheck, Star, Pin, List, Calendar, X 
} from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import ViewOnceBadge from './ViewOnceBadge';

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
    scrollerRef,
    jumpToMessageTarget,
    isGroup
}) => {
    const [isAtBottom, setIsAtBottom] = useState(true);
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
        const absoluteFileUrl = msg.file_path
            ? (String(msg.file_path).startsWith('http') ? String(msg.file_path) : `${window.location.origin}${msg.file_path}`)
            : '';
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
        const shouldUseSystemOpen = ['doc', 'docx', 'docm', 'dot', 'dotx', 'rtf', 'odt', 'xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'csv', 'ods', 'ppt', 'pptx', 'pptm', 'pot', 'potx', 'pps', 'ppsx', 'odp'].includes(fileExt);
        
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
                        className={`wa-message-bubble ${isMe ? 'wa-msg-sent' : 'wa-msg-rec'} ${msg.type === 'audio' ? 'wa-voice-type' : ''} ${msg.link_preview ? 'has-link-preview' : ''}`}
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
                                {msg.type === 'image' && (
                                    <div className="wa-msg-image-container" onClick={(e) => {
                                        if (isForwardingMode) return;
                                        e.stopPropagation();
                                        setViewingContact(null); // Clear contact view if any
                                        handleDownload(msg.file_path, msg.fileName); // Using handleDownload as placeholder for viewing or actual view logic
                                    }}>
                                        <img src={msg.file_path} alt="Sent" className="wa-msg-image" />
                                    </div>
                                )}
                                {(msg.type === 'video' || (msg.type === 'file' && isVideoByExt)) && (
                                    <div className="wa-msg-image-container" style={{ borderRadius: 10, overflow: 'hidden', background: '#111b21' }}>
                                        <video
                                            src={msg.file_path}
                                            controls
                                            playsInline
                                            preload="metadata"
                                            style={{ width: '100%', maxWidth: 340, display: 'block', background: '#111b21' }}
                                        />
                                    </div>
                                )}
                                {msg.type === 'file' && !isVideoByExt && (
                                    <div
                                        className="wa-msg-doc-bubble"
                                        style={{ overflow: 'hidden', borderRadius: 12 }}
                                    >
                                        {false && !isPdfDoc && isOfficePreviewDoc && msg.file_path && (
                                            <div style={{ height: 140, overflow: 'hidden', borderRadius: '10px 10px 0 0', marginBottom: 8, background: '#f5f6f7' }}>
                                                {canRemoteOfficePreview ? (
                                                    <iframe
                                                        title={`preview-${msg._id || msg.id}`}
                                                        src={officePreviewUrl}
                                                        scrolling="no"
                                                        style={{ width: 'calc(100% + 18px)', height: 140, marginRight: -18, border: 'none', pointerEvents: 'none', overflow: 'hidden', display: 'block' }}
                                                    />
                                                ) : (
                                                    <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#667781', gap: 6 }}>
                                                        <FileText size={34} color="#9aa5ad" />
                                                        <span style={{ fontSize: 12 }}>{docTypeName} preview unavailable</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 2px 8px' }}>
                                            <div style={{ width: 36, height: 36, borderRadius: 7, background: docAccent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>
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

                                        <div style={{ display: 'flex', borderTop: '1px solid rgba(17,27,33,0.09)', margin: '0 -10px -10px' }}>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (shouldUseSystemOpen && typeof handleOpenFile === 'function') {
                                                        handleOpenFile(msg.file_path, displayFileName);
                                                        return;
                                                    }
                                                    window.open(msg.file_path, '_blank', 'noopener,noreferrer');
                                                }}
                                                style={{ flex: 1, background: 'transparent', border: 'none', borderRight: '1px solid rgba(17,27,33,0.09)', color: '#0EA5BE', fontWeight: 600, padding: '10px 8px', cursor: 'pointer' }}
                                            >
                                                Open
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleDownload(msg.file_path, displayFileName); }}
                                                style={{ flex: 1, background: 'transparent', border: 'none', color: '#0EA5BE', fontWeight: 600, padding: '10px 8px', cursor: 'pointer' }}
                                            >
                                                Save as...
                                            </button>
                                        </div>
                                    </div>
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
                                                        <svg width="100%" height="24" viewBox="0 0 150 24" preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
                                                            {[8, 14, 10, 15, 11, 9, 14, 17, 13, 10, 12, 16, 11, 15, 9, 12, 16, 10, 14, 12, 17, 13, 10, 8, 11, 15, 12, 14, 10, 13].map((h, i) => {
                                                                const isActive = ((isAudioPlaying || isWaveSelected) && activePlaybackRatio > (i / 30));
                                                                return (
                                                                    <rect 
                                                                        key={i} 
                                                                        x={i * 5} 
                                                                        y={(24 - h) / 2} 
                                                                        width="3" 
                                                                        height={h} 
                                                                        rx="1.5" 
                                                                        fill={isActive ? '#34b7f1' : 'rgba(84, 101, 111, 0.18)'} 
                                                                    />
                                                                );
                                                            })}
                                                        </svg>
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
                                )}

                                {msg.type === 'poll' && msg.poll && (
                                    <div className="wa-poll-card" style={{ padding: 12, background: 'white', borderRadius: 12, border: '1px solid #e9edef' }}>
                                        <div style={{ fontWeight: 'bold' }}>{msg.poll.question}</div>
                                        {/* Simplified poll display */}
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
                increaseViewportBy={300}
                components={{
                    Scroller: MessageScroller,
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




