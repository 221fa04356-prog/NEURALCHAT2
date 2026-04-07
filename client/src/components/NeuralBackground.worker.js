/* eslint-disable no-restricted-globals */

let canvas, ctx, width, height;
let particles = [];
let mouse = { x: null, y: null };
let targetMouse = { x: null, y: null };
let animationFrameId;

const config = {
    baseColor: { r: 13, g: 159, b: 183 }, // #0D9FB7
    baseConnectionDistance: 100, 
    mouseDistance: 240,
    baseSpeed: 0.6, // Lowered for calmer movement
    mouseEase: 0.08 
};

// PRE-ALLOCATED RESOURCES FOR ZERO-GC ANIMATION
const grid = new Map();
let collisionMatrix = new Uint8Array(0);

class Particle {
    constructor(w, h, id) {
        this.id = id;
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.angle = Math.random() * Math.PI * 2;
        this.baseSpeed = (Math.random() * 0.7 + 0.3) * config.baseSpeed;
        this.speed = this.baseSpeed;
        this.turnSpeed = (Math.random() - 0.5) * 0.012;
        this.isHub = Math.random() > 0.75; // More hubs for more cluster anchors
        this.baseSize = this.isHub ? Math.random() * 2.5 + 3.0 : Math.random() * 1.5 + 0.8;
        this.size = this.baseSize;
    }

    update(w, h) {
        // Organic wandering behavior (curved paths) matches LandingBackground
        this.angle += this.turnSpeed;

        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        // Mouse interaction (push away)
        if (mouse.x !== null) {
            const dx = this.x - mouse.x;
            const dy = this.y - mouse.y;
            const dist2 = dx * dx + dy * dy;
            if (dist2 < 62500) { // 250^2
                const force = (250 - Math.sqrt(dist2)) / 250;
                this.x += (dx / Math.sqrt(dist2)) * force * 2;
                this.y += (dy / Math.sqrt(dist2)) * force * 2;
            }
        }

        // Seamless Infinite Wrap
        const margin = 100;
        if (this.x < -margin) this.x = width + margin;
        if (this.x > width + margin) this.x = -margin;
        if (this.y < -margin) this.y = height + margin;
        if (this.y > height + margin) this.y = -margin;
    }

    draw(ctx) {
        ctx.moveTo(this.x + this.size, this.y);
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    }

    drawAura(ctx, currentTime) {
        if (this.isHub) {
            const auraPulse = Math.sin(currentTime * 0.002 + this.pulse) * 0.8;
            ctx.moveTo(this.x + (this.size * 3) + auraPulse, this.y);
            ctx.arc(this.x, this.y, (this.size * 3) + auraPulse, 0, Math.PI * 2);
        }
    }
}

function initParticles(count, w, h) {
    const newParticles = [];
    for (let i = 0; i < count; i++) {
        newParticles.push(new Particle(w, h, i));
    }
    particles = newParticles;
    // Pre-allocate matrix based on particle count
    collisionMatrix = new Uint8Array(count * count);
}

const animate = (currentTime) => {
    animationFrameId = requestAnimationFrame(animate);
    
    if (!ctx || !width || !height) return;

    const now = currentTime || Date.now();
    
    // Smooth mouse interpolation
    if (targetMouse.x !== null && targetMouse.y !== null) {
        if (mouse.x === null) {
            mouse.x = targetMouse.x;
            mouse.y = targetMouse.y;
        } else {
            mouse.x += (targetMouse.x - mouse.x) * config.mouseEase;
            mouse.y += (targetMouse.y - mouse.y) * config.mouseEase;
        }
    } else {
        mouse.x = null;
        mouse.y = null;
    }

    ctx.clearRect(0, 0, width, height);

    const dynamicConnectionDistance = config.baseConnectionDistance + Math.sin(now * 0.001) * 20;
    const maxDist = dynamicConnectionDistance * 1.6; 
    const cellSize = maxDist * 1.1;
    const n = particles.length;

    // 1. REUSE GRID (Clear instead of re-creating)
    grid.clear();
    const getGridKey = (x, y) => {
        const col = Math.floor(x / cellSize);
        const row = Math.floor(y / cellSize);
        return `${col},${row}`;
    };

    const normalBuckets = Array.from({ length: 10 }, () => new Path2D());
    const hubBuckets = Array.from({ length: 10 }, () => new Path2D());
    const backgroundPath = new Path2D();
    
    const hubAuraPath = new Path2D();
    const hubPath = new Path2D();
    const normalPath = new Path2D();

    // 1. Update and populate grid
    for (let i = 0; i < n; i++) {
        const p = particles[i];
        p.update(width, height);
        
        if (p.isHub) {
            // Pulse logic for hubs
            const auraPulse = Math.sin(now * 0.002 + p.x) * 0.8;
            hubAuraPath.moveTo(p.x + (p.size * 3) + auraPulse, p.y);
            hubAuraPath.arc(p.x, p.y, (p.size * 3) + auraPulse, 0, Math.PI * 2);
            hubPath.moveTo(p.x + p.size, p.y);
            hubPath.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        } else {
            normalPath.moveTo(p.x + p.size, p.y);
            normalPath.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        }

        const key = getGridKey(p.x, p.y);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(p);

        if (mouse.x !== null) {
            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < config.mouseDistance * config.mouseDistance) {
                const dist = Math.sqrt(d2);
                ctx.beginPath();
                // Increased opacity from 0.5 to 0.85
                const op = (1 - (dist / config.mouseDistance)) * 0.85;
                ctx.strokeStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, ${op})`;
                ctx.lineWidth = 1.3; // Slightly thicker
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(mouse.x, mouse.y);
                ctx.stroke();
            }
        }
    }

    // 2. REUSE MATRIX (Zero out instead of re-creating Set)
    collisionMatrix.fill(0);
    const mouseActive = mouse.x !== null;

    for (let i = 0; i < n; i++) {
        const p1 = particles[i];
        const col = Math.floor(p1.x / cellSize);
        const row = Math.floor(p1.y / cellSize);

        // Radial Interaction Multiplier (Organic growth around mouse)
        let localMultiplier = 1.0;
        if (mouseActive) {
            const mdx = p1.x - mouse.x;
            const mdy = p1.y - mouse.y;
            const mDist2 = mdx * mdx + mdy * mdy;
            const checkRadius = 450;
            if (mDist2 < checkRadius * checkRadius) {
                const mDist = Math.sqrt(mDist2);
                localMultiplier = 1.0 + (1.0 - mDist / checkRadius) * 0.6;
            }
        }

        for (let x = col - 1; x <= col + 1; x++) {
            for (let y = row - 1; y <= row + 1; y++) {
                const neighbors = grid.get(`${x},${y}`);
                if (!neighbors) continue;

                for (const p2 of neighbors) {
                    if (p1.id === p2.id) continue;
                    
                    const idA = p1.id < p2.id ? p1.id : p2.id;
                    const idB = p1.id < p2.id ? p2.id : p1.id;
                    const index = idA * n + idB;
                    if (collisionMatrix[index]) continue;
                    collisionMatrix[index] = 1;

                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    const d2 = dx * dx + dy * dy;
                    
                    let lMax = dynamicConnectionDistance * localMultiplier;
                    const isH = p1.isHub || p2.isHub;
                    if (isH) lMax *= 1.5;
                    const lMax2 = lMax * lMax;

                    if (d2 < lMax2) {
                        const dist = Math.sqrt(d2);
                        let op = (1 - (dist / lMax)) * 0.85;
                        if (localMultiplier > 1.0) {
                            op = Math.min(1.0, op * (1.0 + (localMultiplier - 1.0) * 0.8));
                        }

                        let bIdx = Math.floor(op * 10);
                        if (bIdx > 9) bIdx = 9;
                        if (bIdx < 0) bIdx = 0;

                        if (isH) {
                            hubBuckets[bIdx].moveTo(p1.x, p1.y);
                            hubBuckets[bIdx].lineTo(p2.x, p2.y);
                        } else {
                            normalBuckets[bIdx].moveTo(p1.x, p1.y);
                            normalBuckets[bIdx].lineTo(p2.x, p2.y);
                        }
                    } else if (d2 < lMax2 * 1.5 && isH) {
                        backgroundPath.moveTo(p1.x, p1.y);
                        backgroundPath.lineTo(p2.x, p2.y);
                    }
                }
            }
        }
    }

    // 3. Batch Draw
    ctx.lineWidth = 0.4;
    ctx.strokeStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, 0.12)`;
    ctx.stroke(backgroundPath);

    ctx.fillStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, 0.1)`;
    ctx.fill(hubAuraPath);

    ctx.fillStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, 0.9)`;
    ctx.fill(hubPath);

    ctx.fillStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, 0.5)`;
    ctx.fill(normalPath);

    for (let i = 0; i < 10; i++) {
        const al = (i / 10) * 0.6;
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, ${al})`;
        ctx.stroke(normalBuckets[i]);
        
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = `rgba(${config.baseColor.r}, ${config.baseColor.g}, ${config.baseColor.b}, ${al * 1.2})`;
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
            const density = 13000; 
            const targetCount = Math.min(Math.floor(area / density), 125);
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
            const nArea = width * height;
            const nDensity = 13000;
            const nCount = Math.min(Math.floor(nArea / nDensity), 125);
            initParticles(nCount, width, height);
            break;

        case 'MOUSE':
            targetMouse = payload;
            break;

        default:
            break;
    }
};
