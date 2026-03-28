import React, { useEffect, useRef } from 'react';

const NeuralBackground = () => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        let width, height;
        let particles = [];
        let mouse = { x: null, y: null };
        let animationFrameId;

        // Configuration
        const config = {
            baseColor: { r: 14, g: 165, b: 190 }, // #0EA5BE
            baseConnectionDistance: 110,
            mouseDistance: 200,
            baseSpeed: 0.5
        };

        const resize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;

            const area = width * height;
            const density = 10000;
            const targetCount = Math.floor(area / density);

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

                // 12% chance to be a larger central node (Hub)
                this.isHub = Math.random() > 0.88;
                this.baseSize = this.isHub ? Math.random() * 2 + 2.5 : Math.random() * 1.2 + 0.8;
                this.size = this.baseSize;
            }

            update() {
                // Organic wandering behavior (curved paths)
                this.angle += this.turnSpeed;

                // Move
                this.x += Math.cos(this.angle) * this.speed;
                this.y += Math.sin(this.angle) * this.speed;

                // Seamless Infinite Wrap
                if (this.x < -100) this.x = width + 100;
                if (this.x > width + 100) this.x = -100;
                if (this.y < -100) this.y = height + 100;
                if (this.y > height + 100) this.y = -100;
            }

            draw() {
                // Hub Aura Effect
                if (this.isHub) {
                    ctx.beginPath();
                    // Subtle breathing pulse for hub auras
                    const pulse = Math.sin(Date.now() * 0.002 + this.x) * 0.5;
                    ctx.arc(this.x, this.y, (this.size * 3) + pulse, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, 0.1)`;
                    ctx.fill();
                }

                // Core Node
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

            // "Breathing" Web: Connection distance gently expands and contracts over time
            const dynamicConnectionDistance = config.baseConnectionDistance + Math.sin(Date.now() * 0.001) * 25;

            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();

                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    let maxDist = dynamicConnectionDistance;
                    if (particles[i].isHub || particles[j].isHub) {
                        maxDist *= 1.4; // Hubs connect across larger gaps
                    }

                    if (distance < maxDist) {
                        ctx.beginPath();
                        const opacity = 1 - (distance / maxDist);

                        const lineWidth = (particles[i].isHub || particles[j].isHub) ? 1.2 : 0.5;

                        ctx.strokeStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, ${opacity * 0.6})`;
                        ctx.lineWidth = lineWidth;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }

                // Mouse Repel / Connect
                if (mouse.x != null) {
                    const dx = particles[i].x - mouse.x;
                    const dy = particles[i].y - mouse.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < config.mouseDistance) {
                        ctx.beginPath();
                        const opacity = 1 - (distance / config.mouseDistance);
                        ctx.strokeStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, ${opacity * 0.8})`;
                        ctx.lineWidth = 1.5;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(mouse.x, mouse.y);
                        ctx.stroke();

                        // Subtle mouse repel effect
                        if (distance < 50) {
                            particles[i].x += dx * 0.02;
                            particles[i].y += dy * 0.02;
                        }
                    }
                }
            }
        }

        const handleMouseMove = (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        };

        const handleMouseOut = () => {
            mouse.x = null;
            mouse.y = null;
        };

        window.addEventListener('resize', resize);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseout', handleMouseOut);

        // Start Application
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
                zIndex: -1,
                overflow: 'hidden',
                backgroundColor: '#f5f5f5' // Light Theme Background as per snippet
            }}
        >
            <canvas
                ref={canvasRef}
                style={{ display: 'block' }}
            />
        </div>
    );
};

export default NeuralBackground;
