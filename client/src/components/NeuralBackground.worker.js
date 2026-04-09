/* eslint-disable no-restricted-globals */

let canvas, ctx, width, height;
let particles = [];

const config = {
    baseColor: { r: 13, g: 159, b: 183 }, // #0D9FB7
    baseConnectionDistance: 135, // Increased slightly for better look with fewer particles
    baseSpeed: 0.7, // Slightly slower background motion
};

// Spatial grid for performance
const grid = new Map();
const cellSize = 160; 

class Particle {
    constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = (Math.random() * 0.6 + 0.4) * config.baseSpeed;
        this.turnSpeed = (Math.random() - 0.5) * 0.018; 
        
        this.isHub = Math.random() > 0.85; 
        this.baseSize = this.isHub ? Math.random() * 2 + 2.5 : Math.random() * 1.2 + 0.8;
        this.size = this.baseSize;
        this.index = 0; 
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

    draw(now) {
        if (this.isHub) {
            ctx.beginPath();
            const pulse = Math.sin(now * 0.002 + this.x) * 0.5;
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
    // ENFORCE A RIGID PERFORMANCE CAP: 
    // This ensures complexity is CONSTANT and never slows down
    const performanceLimit = 85; 
    const finalCount = Math.min(count, performanceLimit);
    
    particles = [];
    for (let i = 0; i < finalCount; i++) {
        const p = new Particle();
        p.index = i;
        particles.push(p);
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (!ctx) return;

    const now = Date.now();
    ctx.clearRect(0, 0, width, height);

    const dynamicConnectionDistance = config.baseConnectionDistance + Math.sin(now * 0.001) * 25;
    
    grid.clear();
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.update();
        p.draw(now);
        
        const gx = Math.floor(p.x / cellSize);
        const gy = Math.floor(p.y / cellSize);
        const key = (gx << 16) | gy; 
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(p);
    }

    const normalBuckets = Array.from({ length: 11 }, () => new Path2D());
    const hubBuckets = Array.from({ length: 11 }, () => new Path2D());

    for (const [key, cellParticles] of grid) {
        const gx = key >> 16;
        const gy = key & 0xFFFF;

        for (let i = 0; i < cellParticles.length; i++) {
            const p1 = cellParticles[i];
            
            for (let j = i + 1; j < cellParticles.length; j++) {
                checkConnection(p1, cellParticles[j], dynamicConnectionDistance, normalBuckets, hubBuckets);
            }

            const neighbors = [
                (gx + 1 << 16) | gy,      
                (gx - 1 << 16) | (gy + 1), 
                (gx << 16) | (gy + 1),     
                (gx + 1 << 16) | (gy + 1)  
            ];

            for (const nKey of neighbors) {
                const neighborParticles = grid.get(nKey);
                if (!neighborParticles) continue;
                for (const p2 of neighborParticles) {
                    checkConnection(p1, p2, dynamicConnectionDistance, normalBuckets, hubBuckets);
                }
            }
        }
    }

    for (let i = 0; i < 11; i++) {
        const alpha = (i / 10) * 0.6;
        ctx.strokeStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, ${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke(normalBuckets[i]);
        ctx.lineWidth = 1.2;
        ctx.stroke(hubBuckets[i]);
    }
}

function checkConnection(p1, p2, baseDist, normalBuckets, hubBuckets) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const d2 = dx * dx + dy * dy;

    let maxDist = baseDist;
    if (p1.isHub || p2.isHub) maxDist *= 1.4;
    const maxDist2 = maxDist * maxDist;

    if (d2 < maxDist2) {
        const distance = Math.sqrt(d2);
        const opacity = 1 - (distance / maxDist);
        let bIdx = Math.floor(opacity * 10);
        if (bIdx > 10) bIdx = 10;
        if (bIdx < 0) bIdx = 0;

        const bucket = (p1.isHub || p2.isHub) ? hubBuckets[bIdx] : normalBuckets[bIdx];
        bucket.moveTo(p1.x, p1.y);
        bucket.lineTo(p2.x, p2.y);
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
            initParticles(Math.floor((width * height) / 10000));
            animate();
            break;

        case 'RESIZE':
            width = payload.width;
            height = payload.height;
            if (canvas) {
                canvas.width = width;
                canvas.height = height;
            }
            initParticles(Math.floor((width * height) / 10000));
            break;

        case 'MOUSE':
            // Pointer interaction disabled
            break;

        default:
            break;
    }
};
