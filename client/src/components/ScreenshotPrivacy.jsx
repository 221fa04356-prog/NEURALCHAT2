import React, { useState, useEffect, useRef } from 'react';
import './ScreenshotPrivacy.css';

const ScreenshotPrivacy = () => {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const isDetectionEnabled = () => {
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const settings = user.privacySettings || {};
        // Default to true if not set, or check specifically for the flag
        return settings.screenshotDetection !== false;
      } catch (e) {
        return true;
      }
    };

    const triggerOverlay = () => {
      if (!isDetectionEnabled()) return;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      
      setIsVisible(true);
      
      timerRef.current = setTimeout(() => {
        setIsVisible(false);
        timerRef.current = null;
      }, 3000);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'PrintScreen' || e.key === 'Snapshot' || e.keyCode === 44) {
        triggerOverlay();
      }
      
      if (e.shiftKey && (e.key === 'S' || e.key === 's') && (e.metaKey || e.ctrlKey)) {
          triggerOverlay();
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'PrintScreen' || e.key === 'Snapshot' || e.keyCode === 44) {
        triggerOverlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className="screenshot-privacy-overlay">
      <div className="privacy-modal">
        <div className="cam-icon">
          <span>CAM</span>
        </div>
        <div className="neural-chat-label">NEURAL CHAT</div>
        <h1>SCREENSHOT PRIVACY MODE ACTIVE</h1>
        <p>Sensitive chat content is hidden for 3 seconds after each screenshot attempt.</p>
        <div className="detected-badge">DETECTED VIA PRINTSCREEN</div>
      </div>
    </div>
  );
};

export default ScreenshotPrivacy;
