import React, { useEffect, useRef } from 'react';

const LandingBackground = React.memo(() => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        let width, height;
        let particles = [];
        let mouse = { x: null, y: null };
        let animationFrameId;

        // Configuration for a stunning dark theme (Neon Cyan / Purplish)
        const config = {
            baseColor: { r: 14, g: 165, b: 233 }, // Sky Blue for the main nodes
            hubColor: { r: 99, g: 102, b: 241 },   // Indigo for hubs
            baseConnectionDistance: 130,
            mouseDistance: 220,
            baseSpeed: 0.8
        };

        const resize = () => {
            if (!containerRef.current) return;
            width = containerRef.current.clientWidth || window.innerWidth;
            height = containerRef.current.clientHeight || window.innerHeight;
            canvas.width = width;
            canvas.height = height;

            const area = width * height;
            const density = 12000;
            const targetCount = Math.min(Math.floor(area / density), 120);

            initParticles(targetCount);
        }

        class Particle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.angle = Math.random() * Math.PI * 2;
                this.baseSpeed = (Math.random() * 0.5 + 0.2) * config.baseSpeed;
                this.speed = this.baseSpeed;
                this.turnSpeed = (Math.random() - 0.5) * 0.01;

                this.isHub = Math.random() > 0.85;
                this.baseSize = this.isHub ? Math.random() * 2.5 + 2.5 : Math.random() * 1.5 + 1;
                this.size = this.baseSize;
            }

            update() {
                this.angle += this.turnSpeed;

                this.x += Math.cos(this.angle) * this.speed;
                this.y += Math.sin(this.angle) * this.speed;

                if (this.x < -100) this.x = width + 100;
                if (this.x > width + 100) this.x = -100;
                if (this.y < -100) this.y = height + 100;
                if (this.y > height + 100) this.y = -100;
            }
        }

        function initParticles(count) {
            particles = [];
            for (let i = 0; i < count; i++) {
                particles.push(new Particle());
            }
        }

        const animate = (currentTime) => {
            animationFrameId = requestAnimationFrame(animate);
            
            const now = currentTime || Date.now();
            
            ctx.clearRect(0, 0, width, height);

            const dynamicConnectionDistance = config.baseConnectionDistance + Math.sin(now * 0.001) * 20;
            const n = particles.length;

            const normalBuckets = Array.from({ length: 10 }, () => new Path2D());
            const hubBuckets = Array.from({ length: 10 }, () => new Path2D());
            
            const hubAuraPath = new Path2D();
            const hubPath = new Path2D();
            const normalPath = new Path2D();

            for (let i = 0; i < n; i++) {
                particles[i].update();
                
                if (particles[i].isHub) {
                    const pulse = Math.sin(now * 0.002 + particles[i].x) * 1.0;
                    hubAuraPath.moveTo(particles[i].x + (particles[i].size * 3.5) + pulse, particles[i].y);
                    hubAuraPath.arc(particles[i].x, particles[i].y, (particles[i].size * 3.5) + pulse, 0, Math.PI * 2);
                    
                    hubPath.moveTo(particles[i].x + particles[i].size, particles[i].y);
                    hubPath.arc(particles[i].x, particles[i].y, particles[i].size, 0, Math.PI * 2);
                } else {
                    normalPath.moveTo(particles[i].x + particles[i].size, particles[i].y);
                    normalPath.arc(particles[i].x, particles[i].y, particles[i].size, 0, Math.PI * 2);
                }

                for (let j = i + 1; j < n; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    
                    const maxDistVal = dynamicConnectionDistance * 1.4;
                    if (Math.abs(dx) > maxDistVal || Math.abs(dy) > maxDistVal) continue;

                    const dist2 = dx * dx + dy * dy;

                    let maxDist = dynamicConnectionDistance;
                    const isHubPair = particles[i].isHub || particles[j].isHub;
                    if (isHubPair) maxDist *= 1.5;
                    
                    const maxDist2 = maxDist * maxDist;

                    if (dist2 < maxDist2) {
                        const distance = Math.sqrt(dist2);
                        const opacity = 1 - (distance / maxDist);
                        
                        let bucketIdx = Math.floor(opacity * 10);
                        if (bucketIdx > 9) bucketIdx = 9;
                        if (bucketIdx < 0) bucketIdx = 0;

                        if (isHubPair) {
                            hubBuckets[bucketIdx].moveTo(particles[i].x, particles[i].y);
                            hubBuckets[bucketIdx].lineTo(particles[j].x, particles[j].y);
                        } else {
                            normalBuckets[bucketIdx].moveTo(particles[i].x, particles[i].y);
                            normalBuckets[bucketIdx].lineTo(particles[j].x, particles[j].y);
                        }
                    }
                }

                if (mouse.x != null) {
                    const dx = particles[i].x - mouse.x;
                    const dy = particles[i].y - mouse.y;
                    const dist2 = dx * dx + dy * dy;
                    const configMouse2 = config.mouseDistance * config.mouseDistance;

                    if (dist2 < configMouse2) {
                        const distance = Math.sqrt(dist2);
                        ctx.beginPath();
                        const opacity = 1 - (distance / config.mouseDistance);
                        // Mouse connection line
                        ctx.strokeStyle = `rgba(56, 189, 248, ${opacity * 0.9})`; 
                        ctx.lineWidth = 1.8;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(mouse.x, mouse.y);
                        ctx.stroke();

                        if (dist2 < 4000) {
                            particles[i].x += dx * 0.03;
                            particles[i].y += dy * 0.03;
                        }
                    }
                }
            }

            // Draw hub auras
            ctx.fillStyle = `rgba(${config.hubColor.r}, ${config.hubColor.g}, ${config.hubColor.b}, 0.15)`;
            ctx.fill(hubAuraPath);

            // Draw hubs
            ctx.fillStyle = `rgba(${config.hubColor.r}, ${config.hubColor.g}, ${config.hubColor.b}, 0.9)`;
            ctx.fill(hubPath);

            // Draw normal nodes
            ctx.fillStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, 0.6)`;
            ctx.fill(normalPath);

            // Draw connections
            for (let i = 0; i < 10; i++) {
                const alpha = (i / 10) * 0.4;
                ctx.lineWidth = 0.8;
                ctx.strokeStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, ${alpha})`;
                ctx.stroke(normalBuckets[i]);
            }

            for (let i = 0; i < 10; i++) {
                const alpha = (i / 10) * 0.5;
                ctx.lineWidth = 1.5;
                // Add gradient-like feel by mixing hub and base color for hub connections
                ctx.strokeStyle = `rgba(${config.hubColor.r}, ${config.hubColor.g}, ${config.baseColor.b}, ${alpha})`;
                ctx.stroke(hubBuckets[i]);
            }
        }

        const handleMouseMove = (e) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            mouse.x = e.clientX - rect.left;
            mouse.y = e.clientY - rect.top;
        };

        const handleMouseOut = () => {
            mouse.x = null;
            mouse.y = null;
        };

        window.addEventListener('resize', resize);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseout', handleMouseOut);

        resize();
        animate();

        return () => {
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseout', handleMouseOut);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 1,
                overflow: 'hidden',
                background: 'radial-gradient(ellipse at center, #0f172a 0%, #020617 100%)',
                pointerEvents: 'none',
                transform: 'translateZ(0)',
                willChange: 'transform'
            }}
        >
            <canvas ref={canvasRef} style={{ display: 'block' }} />
        </div>
    );
});

export default LandingBackground;
