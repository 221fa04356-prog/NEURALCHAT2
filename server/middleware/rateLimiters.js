const LoginAttempt = require('../models/LoginAttempt');

const parsePositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeIdentifier = (value = '') => String(value).trim().toLowerCase().slice(0, 160) || 'unknown';

const getClientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown-ip';

const toTimestamp = (value) => {
    if (!value) return null;
    const timestamp = value instanceof Date ? value.getTime() : Number(value);
    return Number.isFinite(timestamp) ? timestamp : null;
};

const sendLimited = (res, retryAfterSeconds, message, blockedUntil = null) => {
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
        error: message,
        retryAfterSeconds,
        blockedUntil: toTimestamp(blockedUntil),
        rateLimited: true
    });
};

const schedulePrune = (map, isExpired) => {
    const timer = setInterval(() => {
        const now = Date.now();
        for (const [key, value] of map.entries()) {
            if (isExpired(value, now)) map.delete(key);
        }
    }, 5 * 60 * 1000);

    if (typeof timer.unref === 'function') timer.unref();
};

const createWindowLimiter = ({ windowMs, maxRequests, message }) => {
    const attempts = new Map();
    schedulePrune(attempts, (entry, now) => now >= entry.resetAt);

    return (req, res, next) => {
        const now = Date.now();
        const key = getClientIp(req);
        const current = attempts.get(key);

        if (!current || now >= current.resetAt) {
            attempts.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }

        if (current.count >= maxRequests) {
            const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
            return sendLimited(res, retryAfterSeconds, message, current.resetAt);
        }

        current.count += 1;
        return next();
    };
};

const createFailedAuthLimiter = ({ maxFailures, blockMs, message }) => {
    return async (req, res, next) => {
        const now = Date.now();
        const role = req.body?.adminLogin ? 'admin' : 'user';
        const identifier = normalizeIdentifier(req.body?.email || req.body?.loginId);
        const ip = getClientIp(req);
        const key = `${role}:${ip}:${identifier}`;

        try {
            const current = await LoginAttempt.findOne({ key });

            if (current?.blockedUntil) {
                const blockedUntilMs = current.blockedUntil.getTime();

                if (now < blockedUntilMs) {
                    const retryAfterSeconds = Math.ceil((blockedUntilMs - now) / 1000);
                    return sendLimited(res, retryAfterSeconds, message, blockedUntilMs);
                }

                await LoginAttempt.deleteOne({ key });
            }
        } catch (err) {
            console.error('Login limiter lookup failed:', err);
            return res.status(500).json({ error: 'Unable to verify login protection right now.' });
        }

        let failureRecorded = false;
        let sentBlockResponse = false;
        const recordFailure = async () => {
            const failureAt = Date.now();
            const latest = await LoginAttempt.findOne({ key });
            const expiredBlock = latest?.blockedUntil && failureAt >= latest.blockedUntil.getTime();
            const nextCount = !latest || expiredBlock ? 1 : latest.count + 1;
            const blockedUntil = nextCount >= maxFailures ? new Date(failureAt + blockMs) : null;

            if (!latest || expiredBlock) {
                return LoginAttempt.findOneAndUpdate(
                    { key },
                    {
                        key,
                        role,
                        identifier,
                        ip,
                        count: nextCount,
                        firstFailureAt: new Date(failureAt),
                        lastFailureAt: new Date(failureAt),
                        blockedUntil,
                        updatedAt: new Date(failureAt)
                    },
                    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
                );
            }

            latest.count = nextCount;
            latest.lastFailureAt = new Date(failureAt);
            latest.blockedUntil = blockedUntil;
            latest.updatedAt = new Date(failureAt);
            return latest.save();
        };

        const originalJson = res.json.bind(res);
        res.json = async (body) => {
            const isFailedAuth = [400, 401, 403].includes(res.statusCode);

            if (isFailedAuth) {
                failureRecorded = true;
                try {
                    const nextFailure = await recordFailure();
                    const blockedUntilMs = nextFailure?.blockedUntil?.getTime();

                    if (blockedUntilMs && Date.now() < blockedUntilMs) {
                        const retryAfterSeconds = Math.ceil((blockedUntilMs - Date.now()) / 1000);
                        res.set('Retry-After', String(retryAfterSeconds));
                        res.status(429);
                        sentBlockResponse = true;
                        return originalJson({
                            ...(body || {}),
                            error: message,
                            retryAfterSeconds,
                            blockedUntil: blockedUntilMs,
                            rateLimited: true
                        });
                    }
                } catch (err) {
                    console.error('Login limiter update failed:', err);
                    res.status(500);
                    return originalJson({ error: 'Unable to update login protection right now.' });
                }
            }

            return originalJson(body);
        };

        res.on('finish', async () => {
            const isFailedAuth = [400, 401, 403].includes(res.statusCode);

            if (sentBlockResponse) return;

            if (!isFailedAuth) {
                try {
                    await LoginAttempt.deleteOne({ key });
                } catch (err) {
                    console.error('Login limiter reset failed:', err);
                }
                return;
            }

            if (!failureRecorded) {
                try {
                    await recordFailure();
                } catch (err) {
                    console.error('Login limiter update failed:', err);
                }
            }
        });

        return next();
    };
};

const loginRequestLimiter = createWindowLimiter({
    windowMs: parsePositiveInt(process.env.LOGIN_RATE_WINDOW_MINUTES, 15) * 60 * 1000,
    maxRequests: parsePositiveInt(process.env.LOGIN_RATE_MAX_REQUESTS_PER_IP, 30),
    message: 'Too many login attempts from this network. Please try again later.'
});

const userLoginFailureLimiter = createFailedAuthLimiter({
    maxFailures: parsePositiveInt(process.env.USER_LOGIN_MAX_FAILURES, 5),
    blockMs: parsePositiveInt(process.env.USER_LOGIN_BLOCK_MINUTES, 10) * 60 * 1000,
    message: 'Too many failed user login attempts. Please wait before trying again.'
});

const adminLoginFailureLimiter = createFailedAuthLimiter({
    maxFailures: parsePositiveInt(process.env.ADMIN_LOGIN_MAX_FAILURES, 3),
    blockMs: parsePositiveInt(process.env.ADMIN_LOGIN_BLOCK_MINUTES, 20) * 60 * 1000,
    message: 'Too many failed admin login attempts. Please wait before trying again.'
});

const loginFailureLimiter = (req, res, next) => {
    if (req.body?.adminLogin) {
        return adminLoginFailureLimiter(req, res, next);
    }

    return userLoginFailureLimiter(req, res, next);
};

module.exports = {
    loginRequestLimiter,
    loginFailureLimiter
};
