import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

const formatTime = (seconds) => {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const VoiceMessagePlayer = ({ src, duration, isMe, userDataImage, selectedUserImage }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(duration || 0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const audioRef = useRef(null);
    const progressRef = useRef(null);

    const toggleSpeed = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        let newSpeed = 1;
        if (playbackSpeed === 1) newSpeed = 1.5;
        else if (playbackSpeed === 1.5) newSpeed = 2;
        else newSpeed = 1;

        setPlaybackSpeed(newSpeed);
        if (audioRef.current) {
            audioRef.current.playbackRate = newSpeed;
        }
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const setAudioData = () => {
            if (!duration && audio.duration !== Infinity && !isNaN(audio.duration)) {
                setTotalDuration(audio.duration);
            }
        };

        const setAudioTime = () => setCurrentTime(audio.currentTime);

        const onAudioEnd = () => {
            setIsPlaying(false);
            setCurrentTime(0);
            if (audio) {
                audio.currentTime = 0;
            }
        };

        audio.addEventListener('loadedmetadata', setAudioData);
        audio.addEventListener('timeupdate', setAudioTime);
        audio.addEventListener('ended', onAudioEnd);

        return () => {
            audio.removeEventListener('loadedmetadata', setAudioData);
            audio.removeEventListener('timeupdate', setAudioTime);
            audio.removeEventListener('ended', onAudioEnd);
            audio.pause();
        };
    }, [duration]);

    const handlePlayPause = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
        } else {
            audio.play();
            setIsPlaying(true);
        }
    };

    const handleProgressClick = (e) => {
        if (e.stopPropagation) e.stopPropagation();
        const audio = audioRef.current;
        const progress = progressRef.current;
        if (!audio || !progress) return;

        const rect = progress.getBoundingClientRect();
        const clickX = Math.max(0, e.clientX - rect.left);
        const percent = clickX / rect.width;

        const newTime = percent * (totalDuration || audio.duration || 1);
        audio.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const progressPercent = totalDuration ? (currentTime / totalDuration) * 100 : 0;
    const themeColor = isMe ? "#53bdeb" : "var(--primary, #23D2EF)";

    // Create random static wave heights once (so they look natural)
    const [waveHeights] = useState(() => Array.from({ length: 25 }, () => Math.random() * 60 + 20));

    return (
        <div className="wa-msg-audio-container" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px', minWidth: '220px', maxWidth: '300px' }} onClick={e => e.stopPropagation()}>
            <audio ref={audioRef} src={src} preload="metadata" />

            {isPlaying || currentTime > 0 ? (
                <div
                    onClick={toggleSpeed}
                    style={{
                        width: '40px',
                        height: '40px',
                        minWidth: '40px',
                        minHeight: '40px',
                        flexShrink: 0,
                        borderRadius: '20px',
                        background: isMe ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.05)',
                        color: isMe ? '#667781' : '#54656f',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        cursor: 'pointer'
                    }}
                >
                    {playbackSpeed}x
                </div>
            ) : (
                <div className="wa-audio-avatar" style={{ position: 'relative', width: 40, height: 40, minWidth: 40, minHeight: 40, flexShrink: 0 }}>
                    {(isMe ? userDataImage : selectedUserImage) ? (
                        <img 
                            src={isMe ? userDataImage : selectedUserImage} 
                            alt="" 
                            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                        />
                    ) : (
                        <div style={{ width: '100%', height: '100%', borderRadius: '50%', backgroundColor: '#dfe5e7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                        </div>
                    )}
                    <div style={{ position: 'absolute', bottom: -2, right: -2, background: 'white', borderRadius: '50%', padding: 2 }}>
                        <Mic size={12} color={isMe ? "#53bdeb" : "var(--primary, #23D2EF)"} />
                    </div>
                </div>
            )}

            <button
                onClick={handlePlayPause}
                style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 5,
                    color: '#8696a0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                {isPlaying ? <Pause size={28} fill="#8696a0" /> : <Play size={28} fill="#8696a0" />}
            </button>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingRight: '5px' }}>
                <div
                    ref={progressRef}
                    onClick={handleProgressClick}
                    style={{
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                        gap: '2px',
                        position: 'relative'
                    }}
                >
                    {/* Render Waveform */}
                    {waveHeights.map((h, i) => {
                        const isPlayed = (i / waveHeights.length) * 100 <= progressPercent;
                        return (
                            <div
                                key={i}
                                style={{
                                    flex: 1,
                                    height: `${h}%`,
                                    background: isPlayed ? themeColor : '#8696a0',
                                    opacity: isPlayed ? 1 : 0.6,
                                    borderRadius: '2px',
                                    minWidth: '2px'
                                }}
                            />
                        );
                    })}
                    {/* Position Indicator */}
                    <div style={{
                        position: 'absolute',
                        left: `${progressPercent}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: themeColor,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        transition: 'left 0.1s linear'
                    }} />
                </div>
                <div style={{ fontSize: '11px', color: '#667781', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{formatTime(currentTime > 0 ? currentTime : (totalDuration || 0))}</span>
                </div>
            </div>
        </div>
    );
};

export default VoiceMessagePlayer;
