import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Undo, Crop, Type, Download } from 'lucide-react';

export default function ImageEditorModal({ imageUrl, onRetake, onDone, onClose }) {
    const [texts, setTexts] = useState([]);
    const [draggingText, setDraggingText] = useState(null);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [selectedTextIndex, setSelectedTextIndex] = useState(null);

    const [activeColor, setActiveColor] = useState('#ffffff');
    const [activeFont, setActiveFont] = useState('sans-serif');

    // Custom Text Modal State
    const [showTextPrompt, setShowTextPrompt] = useState(false);
    const [tempTextInput, setTempTextInput] = useState("");

    // Crop State
    const [isCropping, setIsCropping] = useState(false);
    const [cropStart, setCropStart] = useState(null);
    const [cropCurrent, setCropCurrent] = useState(null);
    const [croppedArea, setCroppedArea] = useState(null); // {x, y, w, h} in internal canvas coords

    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    // Original image data caching to support cropping and undoing
    const [baseImg, setBaseImg] = useState(null);

    const fonts = ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'Arial', 'Verdana', 'Georgia', 'Courier New', 'Comic Sans MS', 'Impact'];
    const colors = ['#000000', '#888888', '#ffffff', '#0084ff', '#00ccff', '#9900ff', '#00ff00', '#ff3300', '#ffcc00', '#ff00ff', '#ffa500', '#008080'];

    const themeColor = '#0084ff'; // Application color instead of green

    // Theme Variables (Neural Dark Theme)
    const containerBg = 'rgba(13, 22, 29, 0.95)';
    const canvasBg = 'rgba(0, 0, 0, 0.4)';
    const textColor = '#f8fafc';
    const iconColor = '#94a3b8';
    const borderColor = 'rgba(255, 255, 255, 0.08)';

    useEffect(() => {
        const img = new Image();
        img.src = imageUrl;
        img.onload = () => setBaseImg(img);
    }, [imageUrl]);

    const drawCanvas = useCallback(() => {
        if (!baseImg || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        let width = baseImg.width;
        let height = baseImg.height;

        // Apply crop restriction
        if (croppedArea) {
            width = croppedArea.w;
            height = croppedArea.h;
        }

        const maxW = 800 * 0.9;
        const maxH = window.innerHeight * 0.5;

        let drawW = width;
        let drawH = height;
        if (drawW > maxW || drawH > maxH) {
            const ratio = Math.min(maxW / drawW, maxH / drawH);
            drawW *= ratio;
            drawH *= ratio;
        }

        canvas.width = drawW;
        canvas.height = drawH;

        if (croppedArea) {
            ctx.drawImage(baseImg, croppedArea.x, croppedArea.y, croppedArea.w, croppedArea.h, 0, 0, drawW, drawH);
        } else {
            ctx.drawImage(baseImg, 0, 0, drawW, drawH);
        }
    }, [baseImg, croppedArea]);

    useEffect(() => {
        drawCanvas();
    }, [drawCanvas, isCropping]);

    const handleAddTextPrompt = () => {
        setTempTextInput("");
        setShowTextPrompt(true);
    };

    const confirmAddText = () => {
        if (tempTextInput.trim()) {
            setTexts([...texts, {
                id: Date.now(),
                text: tempTextInput,
                x: 50,
                y: 50,
                color: activeColor,
                font: activeFont
            }]);
            setSelectedTextIndex(texts.length);
        }
        setShowTextPrompt(false);
    };

    const handleColorChange = (c) => {
        setActiveColor(c);
        if (selectedTextIndex !== null) {
            setTexts(prev => {
                const arr = [...prev];
                arr[selectedTextIndex].color = c;
                return arr;
            });
        }
    };

    const handleFontChange = (f) => {
        setActiveFont(f);
        if (selectedTextIndex !== null) {
            setTexts(prev => {
                const arr = [...prev];
                arr[selectedTextIndex].font = f;
                return arr;
            });
        }
    };

    const drawFinalCanvas = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvasRef.current.width;
        canvas.height = canvasRef.current.height;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(canvasRef.current, 0, 0);

        texts.forEach(item => {
            ctx.font = `bold 24px ${item.font || 'sans-serif'}`;
            ctx.textBaseline = "top";

            ctx.fillStyle = item.color || "#ffffff";
            ctx.fillText(item.text, item.x, item.y);
        });

        return canvas.toDataURL('image/png');
    };

    const handleDownload = () => {
        const url = drawFinalCanvas();
        const a = document.createElement('a');
        a.href = url;
        a.download = 'captured_image.png';
        a.click();
    };

    const handleDone = () => {
        const finalUrl = drawFinalCanvas();
        onDone(finalUrl);
    };

    const handlePointerDown = (e, index) => {
        if (isCropping) return;
        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const rect = containerRef.current.getBoundingClientRect();

        const textItem = texts[index];
        setOffset({
            x: (clientX - rect.left) - textItem.x,
            y: (clientY - rect.top) - textItem.y
        });
        setDraggingText(index);
        setSelectedTextIndex(index);
        setActiveColor(textItem.color || '#ffffff');
        setActiveFont(textItem.font || 'sans-serif');
    };

    const handleCanvasPointerDown = (e) => {
        if (!isCropping) {
            setSelectedTextIndex(null);
            return;
        }
        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const rect = canvasRef.current.getBoundingClientRect();
        setCropStart({ x: clientX - rect.left, y: clientY - rect.top });
        setCropCurrent({ x: clientX - rect.left, y: clientY - rect.top });
    };

    const handlePointerMove = (e) => {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        if (isCropping && cropStart) {
            const rect = canvasRef.current.getBoundingClientRect();
            setCropCurrent({ x: clientX - rect.left, y: clientY - rect.top });
            return;
        }

        if (draggingText === null) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = (clientX - rect.left) - offset.x;
        const y = (clientY - rect.top) - offset.y;

        setTexts(prev => {
            const newTexts = [...prev];
            newTexts[draggingText].x = x;
            newTexts[draggingText].y = y;
            return newTexts;
        });
    };

    const handlePointerUp = () => {
        if (isCropping && cropStart && cropCurrent) {
            // Apply scale to original image bounds
            const canvasW = canvasRef.current.width;
            const canvasH = canvasRef.current.height;
            const rect = canvasRef.current.getBoundingClientRect();

            let x1 = Math.min(cropStart.x, cropCurrent.x);
            let y1 = Math.min(cropStart.y, cropCurrent.y);
            let x2 = Math.max(cropStart.x, cropCurrent.x);
            let y2 = Math.max(cropStart.y, cropCurrent.y);

            // Bounds check
            x1 = Math.max(0, x1); y1 = Math.max(0, y1);
            x2 = Math.min(rect.width, x2); y2 = Math.min(rect.height, y2);

            if (x2 - x1 > 10 && y2 - y1 > 10) {
                // Map CSS px to canvas internal resolution
                const scaleX = canvasW / rect.width;
                const scaleY = canvasH / rect.height;

                // Map canvas resolution to baseImage resolution
                let baseXScale = baseImg.width / canvasW;
                let baseYScale = baseImg.height / canvasH;
                if (croppedArea) {
                    baseXScale = croppedArea.w / canvasW;
                    baseYScale = croppedArea.h / canvasH;
                }

                const newCrop = {
                    x: (croppedArea ? croppedArea.x : 0) + (x1 * scaleX * baseXScale),
                    y: (croppedArea ? croppedArea.y : 0) + (y1 * scaleY * baseYScale),
                    w: (x2 - x1) * scaleX * baseXScale,
                    h: (y2 - y1) * scaleY * baseYScale
                };
                setCroppedArea(newCrop);
            }
            setCropStart(null);
            setCropCurrent(null);
            setIsCropping(false);
            return;
        }

        setDraggingText(null);
    };

    // Render crop overlay box
    const renderCropOverlay = () => {
        if (!isCropping || !cropStart || !cropCurrent) return null;
        const x1 = Math.min(cropStart.x, cropCurrent.x);
        const y1 = Math.min(cropStart.y, cropCurrent.y);
        const w = Math.abs(cropCurrent.x - cropStart.x);
        const h = Math.abs(cropCurrent.y - cropStart.y);

        return (
            <div style={{
                position: 'absolute',
                border: `2px solid ${themeColor}`,
                background: 'rgba(0,132,255,0.2)',
                left: x1, top: y1, width: w, height: h,
                pointerEvents: 'none', zIndex: 100
            }} />
        );
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.4)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
        }}>
            <div style={{
                width: '100%', maxWidth: 800, height: window.innerWidth <= 768 ? '100%' : '80vh', maxHeight: window.innerWidth <= 768 ? 'none' : 800,
                background: containerBg, borderRadius: window.innerWidth <= 768 ? 0 : 16, overflow: 'hidden',
                display: 'flex', flexDirection: 'column', margin: window.innerWidth <= 768 ? 0 : '0 20px',
                boxShadow: '0 17px 50px 0 rgba(0,0,0,0.19), 0 12px 15px 0 rgba(0,0,0,0.24)'
            }}>
                {/* Custom Prompt Modal */}
                {showTextPrompt && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        background: 'rgba(0,0,0,0.4)', zIndex: 10000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <div style={{
                            background: containerBg, padding: 20, borderRadius: 12, width: '90%', maxWidth: 400,
                            color: textColor, display: 'flex', flexDirection: 'column', gap: 15,
                            boxShadow: '0 17px 50px 0 rgba(0,0,0,0.19)'
                        }}>
                            <div style={{ fontSize: 18, fontWeight: '500' }}>Enter text to add:</div>
                            <input
                                autoFocus
                                type="text"
                                style={{ padding: '10px 15px', borderRadius: 8, border: `2px solid ${themeColor}`, background: '#f0f2f5', color: textColor, fontSize: 16, outline: 'none' }}
                                value={tempTextInput}
                                onChange={(e) => setTempTextInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') confirmAddText(); }}
                            />
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                <button onClick={() => setShowTextPrompt(false)} style={{ background: '#f0f2f5', color: iconColor, border: 'none', padding: '8px 16px', borderRadius: 20, cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
                                <button onClick={confirmAddText} style={{ background: themeColor, color: '#fff', border: 'none', padding: '8px 24px', borderRadius: 20, cursor: 'pointer', fontWeight: 500 }}>OK</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Top Toolbar */}
                <div style={{
                    height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 20px', color: iconColor, flexShrink: 0, borderBottom: `1px solid ${borderColor}`
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 15, cursor: 'pointer' }} onClick={onClose}>
                        <X size={24} />
                        <span style={{ fontSize: 16, display: window.innerWidth <= 768 ? 'none' : 'block', color: textColor, fontWeight: 500 }}>Take photo</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 25 }}>
                        <div style={{ display: 'flex', gap: 20, alignItems: 'center', color: iconColor }}>
                            <Undo size={22} style={{ cursor: 'pointer', hover: { color: themeColor } }} onClick={onRetake} title="Retake Image" />
                            <Crop
                                size={22}
                                style={{ cursor: 'pointer', color: isCropping ? themeColor : iconColor }}
                                onClick={() => setIsCropping(!isCropping)}
                                title="Crop"
                            />
                            <Type size={22} style={{ cursor: 'pointer' }} onClick={handleAddTextPrompt} title="Add Text" />
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                        <button onClick={handleDone} style={{
                            background: 'none', border: 'none', color: themeColor, fontSize: 16, cursor: 'pointer', fontWeight: 600
                        }}>Done</button>
                        <Download size={22} style={{ cursor: 'pointer' }} onClick={handleDownload} title="Download" />
                    </div>
                </div>

                {/* Main Canvas Area */}
                <div
                    ref={containerRef}
                    style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        position: 'relative', overflow: 'hidden', background: canvasBg
                    }}
                    onMouseMove={handlePointerMove}
                    onMouseUp={handlePointerUp}
                    onMouseLeave={handlePointerUp}
                    onTouchMove={handlePointerMove}
                    onTouchEnd={handlePointerUp}
                >
                    <div style={{ position: 'relative' }}>
                        <canvas
                            ref={canvasRef}
                            style={{ background: '#000', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', cursor: isCropping ? 'crosshair' : 'default', maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }}
                            onMouseDown={handleCanvasPointerDown}
                            onTouchStart={handleCanvasPointerDown}
                        />

                        {renderCropOverlay()}

                        {/* Draggable Texts overlay */}
                        {!isCropping && texts.map((item, index) => (
                            <div
                                key={item.id}
                                onMouseDown={(e) => handlePointerDown(e, index)}
                                onTouchStart={(e) => handlePointerDown(e, index)}
                                style={{
                                    position: 'absolute',
                                    left: item.x,
                                    top: item.y,
                                    color: item.color,
                                    padding: '4px 8px',
                                    fontSize: 24,
                                    fontFamily: item.font,
                                    fontWeight: 'bold',
                                    cursor: draggingText === index ? 'grabbing' : 'grab',
                                    userSelect: 'none',
                                    whiteSpace: 'nowrap',
                                    border: selectedTextIndex === index ? `2px dashed ${themeColor}` : 'none',
                                    zIndex: 10
                                }}
                            >
                                {item.text}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom Toolbar */}
                <div style={{
                    height: window.innerWidth <= 768 ? 120 : 80,
                    display: 'flex', flexDirection: window.innerWidth <= 768 ? 'column' : 'row',
                    alignItems: 'center', justifyContent: 'center', gap: 15, padding: '10px 20px', flexShrink: 0, borderTop: `1px solid ${borderColor}`, background: containerBg
                }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {colors.map(c => (
                            <div
                                key={c}
                                onClick={() => handleColorChange(c)}
                                style={{
                                    width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                                    border: activeColor === c ? `3px solid ${themeColor}` : '1px solid #d1d7db'
                                }}
                            />
                        ))}
                    </div>

                    <div style={{ marginLeft: window.innerWidth <= 768 ? 0 : 30, display: 'flex', alignItems: 'center', gap: 10, color: iconColor, fontSize: 14 }}>
                        <div style={{ width: 28, height: 28, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', background: borderColor, borderRadius: '50%', fontWeight: 'bold' }}>A</div>
                        <select
                            style={{ background: 'transparent', color: textColor, border: 'none', fontSize: 14, outline: 'none', cursor: 'pointer', fontWeight: 500 }}
                            value={activeFont}
                            onChange={(e) => handleFontChange(e.target.value)}
                        >
                            {fonts.map(f => (
                                <option key={f} value={f} style={{ background: containerBg, color: textColor }}>{f}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
}
