/* eslint-disable no-restricted-globals */

let canvas, ctx, width, height;
let particles = [];
let mouse = { x: null, y: null };
let animationFrameId;

const config = {
    baseColor: { r: 14, g: 165, b: 190 }, // #0EA5BE
    baseConnectionDistance: 120,
    mouseDistance: 250,
    baseSpeed: 1.2
};

class Particle {
    constructor(w, h) {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.angle = Math.random() * Math.PI * 2;
        this.baseSpeed = (Math.random() * 0.6 + 0.2) * config.baseSpeed;
        this.speed = this.baseSpeed;
        this.turnSpeed = (Math.random() - 0.5) * 0.015;
        this.isHub = Math.random() > 0.88;
        this.baseSize = this.isHub ? Math.random() * 2 + 2.5 : Math.random() * 1.2 + 0.8;
        this.size = this.baseSize;
    }

    update(w, h) {
        this.angle += this.turnSpeed;
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        if (this.x < -100) this.x = w + 100;
        if (this.x > w + 100) this.x = -100;
        if (this.y < -100) this.y = h + 100;
        if (this.y > h + 100) this.y = -100;
    }

    draw(ctx) {
        ctx.moveTo(this.x + this.size, this.y);
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    }

    drawAura(ctx, currentTime) {
        if (this.isHub) {
            const pulse = Math.sin(currentTime * 0.002 + this.x) * 0.5;
            ctx.moveTo(this.x + (this.size * 3) + pulse, this.y);
            ctx.arc(this.x, this.y, (this.size * 3) + pulse, 0, Math.PI * 2);
        }
    }
}

function initParticles(count, w, h) {
    const newParticles = [];
    for (let i = 0; i < count; i++) {
        newParticles.push(new Particle(w, h));
    }
    particles = newParticles;
}

const animate = (currentTime) => {
    animationFrameId = requestAnimationFrame(animate);
    
    if (!ctx || !width || !height) return;

    const now = currentTime || Date.now();
    ctx.clearRect(0, 0, width, height);

    const dynamicConnectionDistance = config.baseConnectionDistance + Math.sin(now * 0.001) * 25;
    const n = particles.length;

    const normalBuckets = Array.from({ length: 10 }, () => new Path2D());
    const hubBuckets = Array.from({ length: 10 }, () => new Path2D());
    
    const hubAuraPath = new Path2D();
    const hubPath = new Path2D();
    const normalPath = new Path2D();

    for (let i = 0; i < n; i++) {
        particles[i].update(width, height);
        
        if (particles[i].isHub) {
            particles[i].drawAura(hubAuraPath, now);
            particles[i].draw(hubPath);
        } else {
            particles[i].draw(normalPath);
        }

        for (let j = i + 1; j < n; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            
            const maxDistVal = dynamicConnectionDistance * 1.4;
            if (Math.abs(dx) > maxDistVal || Math.abs(dy) > maxDistVal) continue;

            const dist2 = dx * dx + dy * dy;

            let maxDist = dynamicConnectionDistance;
            const isHubPair = particles[i].isHub || particles[j].isHub;
            if (isHubPair) maxDist *= 1.4;
            
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

    ctx.fillStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, 0.1)`;
    ctx.fill(hubAuraPath);

    ctx.fillStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, 0.9)`;
    ctx.fill(hubPath);

    ctx.fillStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, 0.5)`;
    ctx.fill(normalPath);

    ctx.lineWidth = 0.8;
    for (let i = 0; i < 10; i++) {
        const alpha = (i / 10) * 0.7;
        ctx.strokeStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, ${alpha})`;
        ctx.stroke(normalBuckets[i]);
    }

    ctx.lineWidth = 1.8;
    for (let i = 0; i < 10; i++) {
        const alpha = (i / 10) * 0.9;
        ctx.strokeStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, ${alpha})`;
        ctx.stroke(hubBuckets[i]);
    }
}

self.onmessage = (e) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT':
            canvas = payload.canvas;
            ctx = canvas.getContext('2d');
            width = payload.width;
            height = payload.height;
            canvas.width = width;
            canvas.height = height;
            
            const area = width * height;
            const density = 20000;
            const targetCount = Math.min(Math.floor(area / density), 70);
            initParticles(targetCount, width, height);
            
            animate();
            break;

        case 'RESIZE':
            width = payload.width;
            height = payload.height;
            if (canvas) {
                canvas.width = width;
                canvas.height = height;
            }
            const newArea = width * height;
            const newDensity = 20000;
            const newTargetCount = Math.min(Math.floor(newArea / newDensity), 70);
            initParticles(newTargetCount, width, height);
            break;

        case 'MOUSE':
            mouse = payload;
            break;

        default:
            break;
    }
};
