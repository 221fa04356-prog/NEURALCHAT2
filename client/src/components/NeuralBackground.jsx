import React, { useEffect, useRef } from 'react';

const NeuralBackground = React.memo(() => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        let width, height;
        let particles = [];
        let mouse = { x: null, y: null };
        let animationFrameId;

        const config = {
            baseColor: { r: 13, g: 159, b: 183 }, // #0D9FB7
            baseConnectionDistance: 110,
            mouseDistance: 200,
            baseSpeed: 1.0
        };

        const resize = () => {
            if (!containerRef.current) return;
            width = containerRef.current.clientWidth || window.innerWidth;
            height = containerRef.current.clientHeight || window.innerHeight;
            canvas.width = width;
            canvas.height = height;

            const area = width * height;
            const density = 14000;
            const targetCount = Math.min(Math.floor(area / density), 100);

            initParticles(targetCount);
        }

        class Particle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.angle = Math.random() * Math.PI * 2;
                this.baseSpeed = (Math.random() * 0.6 + 0.2) * config.baseSpeed;
                this.speed = this.baseSpeed;
                this.turnSpeed = (Math.random() - 0.5) * 0.015;
                this.isHub = Math.random() > 0.88;
                this.baseSize = this.isHub ? Math.random() * 2 + 2.5 : Math.random() * 1.2 + 0.8;
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

            draw() {
                if (this.isHub) {
                    ctx.beginPath();
                    const pulse = Math.sin(Date.now() * 0.002 + this.x) * 0.5;
                    ctx.arc(this.x, this.y, (this.size * 3) + pulse, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, 0.1)`;
                    ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                const alpha = this.isHub ? 0.9 : 0.5;
                ctx.fillStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, ${alpha})`;
                ctx.fill();
            }
        }

        function initParticles(count) {
            particles = [];
            for (let i = 0; i < count; i++) {
                particles.push(new Particle());
            }
        }

        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            ctx.clearRect(0, 0, width, height);

            const dynamicConnectionDistance = config.baseConnectionDistance + Math.sin(Date.now() * 0.001) * 25;
            const n = particles.length;

            const normalBuckets = Array.from({ length: 10 }, () => new Path2D());
            const hubBuckets = Array.from({ length: 10 }, () => new Path2D());

            for (let i = 0; i < n; i++) {
                particles[i].update();
                particles[i].draw();

                for (let j = i + 1; j < n; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist2 = dx * dx + dy * dy;

                    let maxDist = dynamicConnectionDistance;
                    const isHubPair = particles[i].isHub || particles[j].isHub;
                    if (isHubPair) {
                        maxDist *= 1.4;
                    }
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
                        ctx.strokeStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, ${opacity * 0.8})`;
                        ctx.lineWidth = 1.5;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(mouse.x, mouse.y);
                        ctx.stroke();

                        if (dist2 < 2500) {
                            particles[i].x += dx * 0.02;
                            particles[i].y += dy * 0.02;
                        }
                    }
                }
            }

            ctx.lineWidth = 0.5;
            for (let i = 0; i < 10; i++) {
                const alpha = (i / 10) * 0.6;
                ctx.strokeStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, ${alpha})`;
                ctx.stroke(normalBuckets[i]);
            }

            ctx.lineWidth = 1.2;
            for (let i = 0; i < 10; i++) {
                const alpha = (i / 10) * 0.6;
                ctx.strokeStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, ${alpha})`;
                ctx.stroke(hubBuckets[i]);
            }
        }

        const handleMouseMove = (e) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();

            // Normalize exactly as LandingBackground
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
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 0,
                overflow: 'hidden',
                backgroundColor: '#f5f5f5',
                pointerEvents: 'none',
                transform: 'translateZ(0)',
                willChange: 'transform'
            }}
        >
            <canvas ref={canvasRef} style={{ display: 'block' }} />
        </div>
    );
});

export default NeuralBackground;
