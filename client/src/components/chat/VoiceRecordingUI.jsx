import React, { useState, useRef, useEffect, memo } from 'react';
import { Trash2, Mic, Play, Send } from 'lucide-react';
import ViewOnceBadge from './ViewOnceBadge';

const VoiceRecordingUI = memo(({ isMobile, onSend, onCancel, setSnackbar, t, userData, replyingTo, isMeMsg }) => {
    const [isPaused, setIsPaused] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState(null);
    const [audioUrl, setAudioUrl] = useState(null);
    const [isReviewing, setIsReviewing] = useState(false);
    const [waveformPoints, setWaveformPoints] = useState([]);
    const [isViewOnceVoice, setIsViewOnceVoice] = useState(false);
    const [previewProgress, setPreviewProgress] = useState(0);
    const [previewSeconds, setPreviewSeconds] = useState(0);
    const [isPlayingPreview, setIsPlayingPreview] = useState(false);

    const [isDragging, setIsDragging] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerRef = useRef(null);
    const waveTimerRef = useRef(null);
    const startTimeRef = useRef(null);
    const accumulatedDurationRef = useRef(0);
    const analyserRef = useRef(null);
    const dataArrayRef = useRef(null);
    const audioContextRef = useRef(null);
    const waveformTimerHandler = useRef(null);
    const previewAudioRef = useRef(null);
    const mimeTypeRef = useRef('audio/ogg;codecs=opus');
    const allWaveformPointsRef = useRef([]);
    const waveformRef = useRef(null);
    const isViewOnceRef = useRef(false);
    const previewTimerRef = useRef(null);
    const previewProgressRef = useRef(0);
    const directSendRequestedRef = useRef(false);
    const hasDispatchedSendRef = useRef(false);
    const stopFallbackTimerRef = useRef(null);
    const sendOnNextDataRef = useRef(false);

    const setPreviewProgressSafe = (value) => {
        const safeValue = Math.max(0, Math.min(100, Number(value || 0)));
        previewProgressRef.current = safeValue;
        setPreviewProgress(safeValue);
        return safeValue;
    };

    const computeDurationSeconds = () => {
        const activeMs = startTimeRef.current ? (Date.now() - startTimeRef.current) : 0;
        return Math.max(0, (accumulatedDurationRef.current + activeMs) / 1000);
    };

    const dispatchSendOnce = (blob, durationSeconds) => {
        if (!directSendRequestedRef.current) return;
        if (hasDispatchedSendRef.current) return;
        hasDispatchedSendRef.current = true;
        directSendRequestedRef.current = false;
        if (stopFallbackTimerRef.current) {
            clearTimeout(stopFallbackTimerRef.current);
            stopFallbackTimerRef.current = null;
        }
        sendOnNextDataRef.current = false;
        onSend(blob, durationSeconds, isViewOnceRef.current, mimeTypeRef.current);
    };

    useEffect(() => {
        isViewOnceRef.current = isViewOnceVoice;
    }, [isViewOnceVoice]);

    const formatVoiceTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const clearRecordingLoop = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (waveTimerRef.current) {
            clearInterval(waveTimerRef.current);
            waveTimerRef.current = null;
        }
    };

    const startRecordingLoop = () => {
        clearRecordingLoop();
        const tick = () => {
            const elapsed = (accumulatedDurationRef.current + (Date.now() - startTimeRef.current)) / 1000;
            setRecordingTime(elapsed);

            const analyser = analyserRef.current;
            const dataArray = dataArrayRef.current;
            if (audioContextRef.current && analyser && dataArray) {
                analyser.getByteTimeDomainData(dataArray);

                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += Math.abs(dataArray[i] - 128);
                }
                const avg = sum / dataArray.length;

                let finalHeight = 4;
                if (avg > 6) {
                    const peak = Math.min(20, (avg / 64) * 20);
                    finalHeight += peak;
                }

                if (avg > 10) finalHeight += (Math.random() - 0.5) * 2.5;
                finalHeight = Math.min(24, Math.max(4, finalHeight));

                allWaveformPointsRef.current.push(finalHeight);
                setWaveformPoints(prev => {
                    const next = [...prev, finalHeight];
                    if (next.length > 30) return next.slice(1);
                    return next;
                });
            }
        };

        tick();
        const intervalId = setInterval(tick, 50);
        timerRef.current = intervalId;
        waveTimerRef.current = intervalId;
    };

    const deleteRecording = (e) => {
        if (e) e.stopPropagation();
        clearRecordingLoop();
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => { });
            audioContextRef.current = null;
        }

        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
        }
        setIsPlayingPreview(false);
        setIsPaused(false);
        setIsReviewing(false);
        setAudioBlob(null);
        setAudioUrl(null);
        setRecordingTime(0);
        setIsViewOnceVoice(false);
        directSendRequestedRef.current = false;
        hasDispatchedSendRef.current = false;
        sendOnNextDataRef.current = false;
        if (stopFallbackTimerRef.current) {
            clearTimeout(stopFallbackTimerRef.current);
            stopFallbackTimerRef.current = null;
        }
        if (timerRef.current) clearInterval(timerRef.current);
        if (mediaRecorderRef.current) {
            try {
                mediaRecorderRef.current.onstop = null;
                mediaRecorderRef.current.ondataavailable = null;
                if (mediaRecorderRef.current.state !== 'inactive') {
                    mediaRecorderRef.current.stop();
                }
                const tracks = mediaRecorderRef.current.stream?.getTracks();
                if (tracks) tracks.forEach(track => track.stop());
            } catch (e) { }
            mediaRecorderRef.current = null;
        }
        onCancel();
    };

    const startRecording = async () => {
        setIsPaused(false);
        setRecordingTime(0);
        setIsReviewing(false);
        setAudioUrl(null);
        setAudioBlob(null);
        setIsViewOnceVoice(false);
        setWaveformPoints(new Array(30).fill(3)); // Pre-fill silent baseline
        setPreviewProgressSafe(0);
        setPreviewSeconds(0);
        allWaveformPointsRef.current = [];
        clearRecordingLoop();
        accumulatedDurationRef.current = 0;
        startTimeRef.current = null;

        try {
            // Simplified constraints for maximum compatibility and reduced hardware jitter
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                    googNoiseSuppression: true,
                    googAutoGainControl: true,
                    googEchoCancellation: true,
                    googHighpassFilter: true,
                    googTypingNoiseDetection: true
                }
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            let mimeType = 'audio/ogg;codecs=opus';
            if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) mimeType = 'audio/ogg;codecs=opus';
            else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
            else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
            else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
            else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
            mimeTypeRef.current = mimeType;

            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioContext = new AudioContext({ latencyHint: 'interactive' });
            audioContextRef.current = audioContext;
            if (audioContext.state === 'suspended') await audioContext.resume();

            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.75;
            analyserRef.current = analyser;

            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            // Record the browser-processed mic stream directly. This avoids the
            // extra EQ/compression chain that was introducing artificial artifacts.
            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            dataArrayRef.current = dataArray;
            startTimeRef.current = Date.now();
            startRecordingLoop();

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                    // Whenever data is received (e.g., via requestData() on pause or at the end of recording),
                    // update the preview blob and URL to ensure the user can play back the recording.
                    const blob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
                    const url = URL.createObjectURL(blob);
                    setAudioBlob(blob);
                    setAudioUrl(url);

                    if (sendOnNextDataRef.current && directSendRequestedRef.current && !hasDispatchedSendRef.current) {
                        sendOnNextDataRef.current = false;
                        const durationSeconds = computeDurationSeconds();
                        dispatchSendOnce(blob, durationSeconds);
                    }
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
                const url = URL.createObjectURL(blob);
                setAudioBlob(blob);
                setAudioUrl(url);
                setIsPaused(false);
                if (startTimeRef.current) {
                    accumulatedDurationRef.current += (Date.now() - startTimeRef.current);
                    startTimeRef.current = null;
                }
                const finalDuration = accumulatedDurationRef.current / 1000;
                const durationSeconds = Math.max(0, finalDuration);
                setRecordingTime(durationSeconds);
                if (audioContextRef.current) {
                    audioContextRef.current.close().catch(() => { });
                    audioContextRef.current = null;
                }
                try {
                    mediaRecorder.stream?.getTracks()?.forEach((track) => track.stop());
                } catch (_) { }
                clearRecordingLoop();

                if (directSendRequestedRef.current) {
                    dispatchSendOnce(blob, durationSeconds);
                } else {
                    // Downsample full waveform for review
                    const total = allWaveformPointsRef.current.length;
                    const target = 30;
                    if (total > 0) {
                        const step = total / target;
                        const downsampled = [];
                        for (let i = 0; i < target; i++) {
                            downsampled.push(allWaveformPointsRef.current[Math.floor(i * step)] || 3);
                        }
                        setWaveformPoints(downsampled);
                    }
                    setIsReviewing(true);
                }
            };

            // Start recording without timeslice to prevent chunk collision repetition
            mediaRecorder.start();
            hasDispatchedSendRef.current = false;
            sendOnNextDataRef.current = false;
            if (stopFallbackTimerRef.current) {
                clearTimeout(stopFallbackTimerRef.current);
                stopFallbackTimerRef.current = null;
            }

        } catch (err) {
            console.error("Mic error:", err);
            onCancel();
            if (setSnackbar) setSnackbar({ message: "Microphone access denied.", type: 'error' });
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
            clearRecordingLoop();
            try {
                mediaRecorderRef.current.requestData();
            } catch (_) { }
            if (stopFallbackTimerRef.current) clearTimeout(stopFallbackTimerRef.current);
            stopFallbackTimerRef.current = setTimeout(() => {
                if (!directSendRequestedRef.current || hasDispatchedSendRef.current) return;
                const blob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
                const durationSeconds = computeDurationSeconds();
                dispatchSendOnce(blob, durationSeconds);
            }, 900);
            mediaRecorderRef.current.stop();
            return;
        }

        // If recorder is unexpectedly inactive but send was requested, still submit what we have.
        if (directSendRequestedRef.current && !hasDispatchedSendRef.current) {
            const blob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
            const durationSeconds = computeDurationSeconds();
            dispatchSendOnce(blob, durationSeconds);
        }
    };

    const pauseRecording = (e) => {
        if (e) e.stopPropagation();
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            try {
                // Manually request data only on pause to allow preview.
                // This triggers ondataavailable which now safely handles the blob/url update.
                mediaRecorderRef.current.requestData();
                setTimeout(() => {
                    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                        mediaRecorderRef.current.pause();
                    }
                }, 150);

                setIsPaused(true);
                clearRecordingLoop();
                if (startTimeRef.current) {
                    accumulatedDurationRef.current += (Date.now() - startTimeRef.current);
                    startTimeRef.current = null;
                }
                setRecordingTime(Math.floor(accumulatedDurationRef.current / 1000));

                // Downsample for static preview
                const total = allWaveformPointsRef.current.length;
                const target = 30;
                if (total > 0) {
                    const step = total / target;
                    const downsampled = [];
                    for (let i = 0; i < target; i++) {
                        downsampled.push(allWaveformPointsRef.current[Math.floor(i * step)] || 3);
                    }
                    setWaveformPoints(downsampled);
                }
            } catch (err) { }
        }
    };

    const resumeRecording = (e) => {
        if (e) e.stopPropagation();
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
            try {
                if (previewAudioRef.current) {
                    previewAudioRef.current.ontimeupdate = null;
                    previewAudioRef.current.onended = null;
                    previewAudioRef.current.pause();
                    previewAudioRef.current = null;
                    setIsPlayingPreview(false);
                }
                mediaRecorderRef.current.resume();
                setIsPaused(false);
                setPreviewProgressSafe(0);
                setPreviewSeconds(recordingTime);
                startTimeRef.current = Date.now();
                startRecordingLoop();
            } catch (err) { }
        }
    };

    const togglePreviewPlayback = () => {
        if (!audioUrl) return;

        const getPreviewDuration = (audio) => {
            if (recordingTime > 0) return recordingTime;
            if (audio?.duration && isFinite(audio.duration)) return audio.duration;
            return 0;
        };

        const ensurePreviewAudio = () => {
            if (previewAudioRef.current) return previewAudioRef.current;
            const audio = new Audio(audioUrl);
            previewAudioRef.current = audio;

            audio.onloadedmetadata = () => {
                const duration = getPreviewDuration(audio);
                const selectedProgress = previewProgressRef.current;
                if (selectedProgress > 0 && duration > 0) {
                    audio.currentTime = (selectedProgress / 100) * duration;
                }
            };

            audio.onended = () => {
                if (previewAudioRef.current !== audio) return;
                setIsPlayingPreview(false);
                setPreviewProgressSafe(0);
                setPreviewSeconds(recordingTime);
                previewAudioRef.current = null;
                if (previewTimerRef.current) clearInterval(previewTimerRef.current);
            };
            return audio;
        };

        const playPreview = (audio) => {
            if (!audio) return;
            const startFromSelected = () => {
                const duration = getPreviewDuration(audio);
                if (duration > 0) {
                    const targetTime = (previewProgressRef.current / 100) * duration;
                    if (Math.abs((audio.currentTime || 0) - targetTime) > 0.05) {
                        audio.currentTime = targetTime;
                    }
                    setPreviewSeconds(Math.floor(targetTime));
                }
                audio.play().then(() => {
                    setIsPlayingPreview(true);
                    startPreviewTimer();
                }).catch(() => setIsPlayingPreview(false));
            };

            if (audio.readyState >= 1) {
                startFromSelected();
                return;
            }

            const onLoaded = () => {
                audio.removeEventListener('loadedmetadata', onLoaded);
                startFromSelected();
            };
            audio.addEventListener('loadedmetadata', onLoaded);
            audio.load();
        };

        if (isPlayingPreview) {
            if (previewAudioRef.current) previewAudioRef.current.pause();
            if (previewTimerRef.current) clearInterval(previewTimerRef.current);
            setIsPlayingPreview(false);
        } else {
            playPreview(ensurePreviewAudio());
        }
    };

    const startPreviewTimer = () => {
        if (previewTimerRef.current) clearInterval(previewTimerRef.current);
        previewTimerRef.current = setInterval(() => {
            if (!previewAudioRef.current) {
                clearInterval(previewTimerRef.current);
                return;
            }
            const curr = previewAudioRef.current.currentTime;
            const dur = recordingTime || previewAudioRef.current.duration;
            if (isFinite(dur) && dur > 0) {
                setPreviewProgressSafe((curr / dur) * 100);
                const displaySeconds = curr <= 0 ? 0 : Math.min(Math.floor(dur), Math.floor(curr));
                setPreviewSeconds(displaySeconds);
            }
        }, 50); // High frequency for smooth progress
    };

    useEffect(() => {
        startRecording();
        return () => {
            clearRecordingLoop();
            if (previewAudioRef.current) previewAudioRef.current.pause();

            // Critical: stop recorder and tracks when component unmounts
            if (mediaRecorderRef.current) {
                try {
                    mediaRecorderRef.current.onstop = null;
                    mediaRecorderRef.current.ondataavailable = null;
                    if (mediaRecorderRef.current.state !== 'inactive') {
                        mediaRecorderRef.current.stop();
                    }
                    const tracks = mediaRecorderRef.current.stream?.getTracks();
                    if (tracks) tracks.forEach(track => track.stop());
                } catch (e) { }
                mediaRecorderRef.current = null;
            }
            directSendRequestedRef.current = false;
            hasDispatchedSendRef.current = false;
            sendOnNextDataRef.current = false;
            if (stopFallbackTimerRef.current) {
                clearTimeout(stopFallbackTimerRef.current);
                stopFallbackTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        return () => {
            if (audioUrl && audioUrl.startsWith('blob:')) {
                URL.revokeObjectURL(audioUrl);
            }
        };
    }, [audioUrl]);

    const btnSize = isMobile ? '32px' : '40px';
    const iconSize = isMobile ? 18 : 24;
    const actionGap = isMobile ? '2px' : '16px';
    const sendBtnSize = isMobile ? '38px' : '44px';
    const previewDragRectRef = useRef(null);

    const clampPercent = (value) => Math.max(0, Math.min(100, value));
    const percentFromClientX = (clientX, rect) => {
        if (!rect || rect.width <= 0) return 0;
        return clampPercent(((clientX - rect.left) / rect.width) * 100);
    };

    const applyPreviewSeekPercent = (percent, shouldAutoPlay = false) => {
        const safePercent = clampPercent(percent);
        setPreviewProgressSafe(safePercent);

        const ensurePreviewAudio = () => {
            if (previewAudioRef.current) return previewAudioRef.current;
            if (!audioUrl) return null;
            const audio = new Audio(audioUrl);
            previewAudioRef.current = audio;
            audio.onended = () => {
                if (previewAudioRef.current !== audio) return;
                setIsPlayingPreview(false);
                setPreviewProgressSafe(0);
                setPreviewSeconds(recordingTime);
                previewAudioRef.current = null;
                if (previewTimerRef.current) clearInterval(previewTimerRef.current);
            };
            return audio;
        };

        const audio = previewAudioRef.current || (shouldAutoPlay ? ensurePreviewAudio() : null);
        if (audio) {
            const duration = (recordingTime > 0)
                ? recordingTime
                : ((audio.duration && isFinite(audio.duration)) ? audio.duration : 0);
            const targetTime = (safePercent / 100) * (duration || 0);
            audio.currentTime = targetTime;
            setPreviewSeconds(Math.floor(targetTime));
            if (shouldAutoPlay && !isPlayingPreview) {
                audio.play().then(() => {
                    setIsPlayingPreview(true);
                    startPreviewTimer();
                }).catch(() => setIsPlayingPreview(false));
            }
        } else {
            setPreviewSeconds(Math.floor((safePercent / 100) * Math.max(0, recordingTime)));
        }
    };

    const startPreviewSeekDrag = (clientX, event) => {
        if (!isPaused && !isReviewing) return;
        if (!waveformRef.current) return;
        if (event?.preventDefault) event.preventDefault();
        if (event?.stopPropagation) event.stopPropagation();

        // Seeking in review mode should not auto-play; user controls playback via Play button.
        if (isPlayingPreview && previewAudioRef.current) {
            previewAudioRef.current.pause();
            if (previewTimerRef.current) clearInterval(previewTimerRef.current);
            setIsPlayingPreview(false);
        }

        const rect = waveformRef.current.getBoundingClientRect();
        previewDragRectRef.current = rect;
        applyPreviewSeekPercent(percentFromClientX(clientX, rect), false);
        setIsDragging(true);

        const handleMouseMove = (moveEvent) => {
            const activeRect = previewDragRectRef.current || rect;
            applyPreviewSeekPercent(percentFromClientX(moveEvent.clientX, activeRect));
        };

        const handleTouchMove = (moveEvent) => {
            const touch = moveEvent.touches?.[0];
            if (!touch) return;
            const activeRect = previewDragRectRef.current || rect;
            applyPreviewSeekPercent(percentFromClientX(touch.clientX, activeRect));
        };

        const stopDrag = () => {
            setIsDragging(false);
            previewDragRectRef.current = null;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', stopDrag);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', stopDrag);
            window.removeEventListener('touchcancel', stopDrag);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', stopDrag);
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        window.addEventListener('touchend', stopDrag);
        window.addEventListener('touchcancel', stopDrag);
    };

    return (
        <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
            <div className="wa-input-pill" style={{
                flex: 1, padding: isMobile ? '4px 6px' : '8px 12px 8px 16px',
                minHeight: isMobile ? '44px' : '54px', borderRadius: '30px',
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', background: '#ffffff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)', gap: isMobile ? '2px' : '16px',
                overflow: 'visible'
            }}>
                <div className="wa-voice-controls-cluster" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: isMobile ? '4px' : '16px', flex: '0 0 auto', minWidth: 0, overflow: 'visible' }}>
                    <button type="button" onClick={deleteRecording} className="wa-voice-btn delete" data-tooltip="Delete" data-tooltip-pos="center" style={{ width: btnSize, height: btnSize, borderRadius: '50%', color: '#54656f', flexShrink: 0 }}>
                        <Trash2 size={isMobile ? 16 : iconSize} />
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        {!isPaused && !isReviewing && <div className="wa-recording-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444', animation: 'wa-pulse 1.5s infinite ease-in-out' }} />}
                        <span style={{ color: '#111b21', fontSize: isMobile ? '11px' : '12px', fontWeight: 500 }}>
                            {(!isPaused && !isReviewing)
                                ? formatVoiceTime(recordingTime)
                                : (isPlayingPreview || previewProgress > 0 ? formatVoiceTime(previewSeconds) : formatVoiceTime(recordingTime))}
                        </span>
                    </div>
                    <div
                        ref={waveformRef}
                        onMouseDown={(e) => {
                            startPreviewSeekDrag(e.clientX, e);
                        }}
                        onTouchStart={(e) => {
                            const touch = e.touches?.[0];
                            if (!touch) return;
                            startPreviewSeekDrag(touch.clientX, e);
                        }}
                        className="wa-recording-waveform"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2.5px',
                            height: '36px',
                            flex: 1,
                            maxWidth: isMobile
                                ? ((isPaused || isReviewing)
                                    ? (window.innerWidth > 500 ? '130px' : '90px')
                                    : (window.innerWidth > 500 ? '220px' : '150px'))
                                : '180px',
                            minWidth: 0,
                            overflow: 'hidden',
                            justifyContent: 'center',
                            position: 'relative',
                            cursor: (isPaused || isReviewing) ? 'grab' : 'default',
                            flexShrink: 5
                        }}
                    >
                        {waveformPoints.map((h, i) => (
                            <div key={i} style={{
                                height: `${h}px`,
                                backgroundColor: (isPaused || isReviewing)
                                    ? (i / waveformPoints.length < previewProgress / 100 ? '#0EA5BE' : '#8696a0')
                                    : '#8696a0',
                                width: '3px',
                                borderRadius: '3px',
                                transition: 'height 0.1s ease',
                                transform: 'scaleY(1)' // Centralized growth due to flex align-center
                            }} />
                        ))}
                        {(isPaused || isReviewing) && (
                            <div style={{
                                position: 'absolute',
                                left: `${previewProgress}%`,
                                width: '10px',
                                height: '10px',
                                backgroundColor: '#0EA5BE', // Theme Blue shade
                                borderRadius: '50%',
                                pointerEvents: 'none',
                                transform: 'translateX(-50%)',
                                zIndex: 10,
                                transition: isDragging ? 'none' : 'left 0.1s linear'
                            }} />
                        )}
                    </div>
                </div>
                {(isPaused || isReviewing) && (
                    <button type="button" onClick={togglePreviewPlayback} className="wa-voice-btn play" data-tooltip={isPlayingPreview ? "Pause" : "Play"} data-tooltip-pos="center" style={{ width: btnSize, height: btnSize, flexShrink: 0 }}>
                        {isPlayingPreview ? <div style={{ display: 'flex', gap: '3px', color: '#8696a0' }}><div style={{ width: '3px', height: '14px', background: 'currentColor' }}></div><div style={{ width: '3px', height: '14px', background: 'currentColor' }}></div></div> : <Play size={iconSize} fill="#8696a0" color="#8696a0" />}
                    </button>
                )}
                <div style={{ display: 'flex', gap: isMobile ? '4px' : actionGap, alignItems: 'center', marginLeft: isMobile ? '0px' : '8px', flexShrink: 0 }}>
                    <button type="button" onClick={(e) => isPaused ? resumeRecording(e) : (isReviewing ? null : pauseRecording(e))} className="wa-voice-btn hover-red" data-tooltip={isPaused ? "Resume" : (isReviewing ? "" : "Pause")} data-tooltip-pos="center" style={{ width: btnSize, height: btnSize, opacity: isReviewing ? 0.5 : 1 }}>
                        {isPaused || isReviewing ? <Mic size={iconSize} color="#ef4444" /> : <div style={{ display: 'flex', gap: '3px', color: '#ef4444' }}><div style={{ width: '3.2px', height: '14px', background: 'currentColor' }}></div><div style={{ width: '3.2px', height: '14px', background: 'currentColor' }}></div></div>}
                    </button>
                    <button type="button" onClick={() => setIsViewOnceVoice(!isViewOnceVoice)} className={`wa-view-once-btn ${isViewOnceVoice ? 'active' : ''}`} data-tooltip="View once" data-tooltip-pos="center" style={{ width: btnSize, height: btnSize, backgroundColor: 'transparent', borderRadius: '50%', boxShadow: 'none' }}>
                        <ViewOnceBadge size={18} filled={isViewOnceVoice} />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (isReviewing) {
                                onSend(audioBlob, recordingTime, isViewOnceVoice, mimeTypeRef.current);
                            } else {
                                directSendRequestedRef.current = true;
                                hasDispatchedSendRef.current = false;
                                sendOnNextDataRef.current = true;
                                try {
                                    mediaRecorderRef.current?.requestData?.();
                                } catch (_) { }
                                setTimeout(() => stopRecording(), 120);
                            }
                        }}
                        className="wa-send-btn-inner"
                        data-tooltip="Send"
                        data-tooltip-pos="center"
                        style={{ width: sendBtnSize, height: sendBtnSize, background: '#0EA5BE', borderRadius: '50%' }}
                    >
                        <Send size={isMobile ? 18 : 20} color="white" />
                    </button>
                </div>
            </div>
        </div>
    );
});

export default VoiceRecordingUI;
