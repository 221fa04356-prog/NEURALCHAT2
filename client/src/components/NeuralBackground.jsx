import React, { useEffect, useRef, useState } from 'react';
import NeuralWorker from './NeuralBackground.worker?worker';

const NeuralBackground = React.memo(() => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const workerRef = useRef(null);
    const [canvasKey, setCanvasKey] = useState(0);

    useEffect(() => {
        console.log('NeuralBackground mounted');
        if (!canvasRef.current || !containerRef.current) return;

        const canvas = canvasRef.current;
        const width = containerRef.current.clientWidth || window.innerWidth;
        const height = containerRef.current.clientHeight || window.innerHeight;

        // Use transferControlToOffscreen to move canvas to the worker
        let offscreen;
        try {
            // Check if this canvas has already been transferred (custom property check)
            if (canvas._transferred) {
                // If it was already transferred, we can't use it again with a new worker.
                // We increment canvasKey to force React to give us a NEW canvas element.
                console.warn('Canvas already transferred, forcing remount...');
                setCanvasKey(prev => prev + 1);
                return;
            }

            offscreen = canvas.transferControlToOffscreen();
            canvas._transferred = true; // Mark as transferred

            workerRef.current = new NeuralWorker();

            workerRef.current.postMessage({
                type: 'INIT',
                payload: {
                    canvas: offscreen,
                    width,
                    height
                }
            }, [offscreen]);
        } catch (e) {
            console.error('OffscreenCanvas or Worker not supported or already transferred', e);
            // Fallback: If it's a "Cannot transfer control more than once" error, 
            // we should have caught it above, but as a safety measure:
            if (e.name === 'InvalidStateError') {
                setCanvasKey(prev => prev + 1);
            }
            return;
        }

        const resize = () => {
            if (!containerRef.current || !workerRef.current) return;
            const w = containerRef.current.clientWidth || window.innerWidth;
            const h = containerRef.current.clientHeight || window.innerHeight;

            workerRef.current.postMessage({
                type: 'RESIZE',
                payload: { width: w, height: h }
            });
        };

        const handleMouseMove = (e) => {
            if (!containerRef.current || !workerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            workerRef.current.postMessage({
                type: 'MOUSE',
                payload: {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                }
            });
        };

        const handleMouseOut = () => {
            if (!workerRef.current) return;
            workerRef.current.postMessage({
                type: 'MOUSE',
                payload: { x: null, y: null }
            });
        };

        window.addEventListener('resize', resize);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseout', handleMouseOut);

        return () => {
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseout', handleMouseOut);

            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, [canvasKey]); // Re-run if we forced a new canvas

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: -1,
                overflow: 'hidden',
                backgroundColor: '#f3f3f3ff', // Professional dark background
                pointerEvents: 'none',
                transform: 'translateZ(0)',
                willChange: 'transform'
            }}
        >
            <canvas
                key={canvasKey}
                ref={canvasRef}
                style={{ display: 'block', width: '100%', height: '100%' }}
            />
        </div>
    );
});

export default NeuralBackground;

