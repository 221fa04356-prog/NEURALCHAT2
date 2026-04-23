const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const HOST = '127.0.0.1';
const PORT = Number(process.env.NEURALCHAT_OPEN_HELPER_PORT || 48723);
const TEMP_ROOT = path.join(os.tmpdir(), 'neuralchat-open');
const SERVER_ROOT = path.resolve(__dirname, '..');
const UPLOADS_ROOT = path.join(SERVER_ROOT, 'uploads');
const LAST_RESULT_PATH = path.join(TEMP_ROOT, 'last-open-result.json');

fs.mkdirSync(TEMP_ROOT, { recursive: true });

const recordLastResult = (payload) => {
    try {
        fs.writeFileSync(LAST_RESULT_PATH, JSON.stringify({
            at: new Date().toISOString(),
            ...payload
        }, null, 2));
    } catch (_) { }
};

const sendJson = (res, statusCode, payload) => {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(payload));
};

const sanitizeFileName = (fileName = 'download') => {
    const safe = String(fileName || 'download').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
    return safe || 'download';
};

const isPrivateHost = (host = '') => {
    const normalized = String(host || '').toLowerCase();
    return normalized === 'localhost'
        || normalized === '127.0.0.1'
        || normalized === '0.0.0.0'
        || /^10\./.test(normalized)
        || /^192\.168\./.test(normalized)
        || /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized);
};

const isInsideRoot = (targetPath, rootPath) => {
    const relative = path.relative(rootPath, targetPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const getUploadPathFromUrl = (sourceUrl) => {
    let parsedUrl;
    try {
        parsedUrl = new URL(sourceUrl);
    } catch (_) {
        return null;
    }

    let pathname = decodeURIComponent(parsedUrl.pathname || '');
    if (pathname.startsWith('/api/chat/media')) {
        pathname = decodeURIComponent(
            parsedUrl.searchParams.get('path')
            || parsedUrl.searchParams.get('legacyPath')
            || ''
        );
    }
    if (!pathname.startsWith('/uploads/')) {
        return null;
    }

    return pathname;
};

const resolveLocalUploadPath = (sourceUrl) => {
    const pathname = getUploadPathFromUrl(sourceUrl);
    if (!pathname) {
        return null;
    }

    const pathSegments = pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    if (pathSegments.length === 0 || pathSegments[0] !== 'uploads') {
        return null;
    }

    const resolvedPath = path.resolve(SERVER_ROOT, ...pathSegments);
    if (!isInsideRoot(resolvedPath, UPLOADS_ROOT)) {
        return null;
    }

    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
        return null;
    }

    return resolvedPath;
};

const openWithDefaultApp = (targetPath) => new Promise((resolve, reject) => {
    const escaped = targetPath.replace(/'/g, "''");
    const psScript = `
try {
    Start-Process -FilePath '${escaped}' -ErrorAction Stop | Out-Null
    exit 0
} catch {
    $msg = $_.Exception.Message
    if ($msg) { [Console]::Error.WriteLine($msg) }
    exit 41
}
`.trim();
    const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-Command', psScript],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stderr = '';
    child.stderr.on('data', (chunk) => {
        stderr += String(chunk || '');
    });

    child.on('error', reject);
    child.on('exit', (code) => {
        if (code === 0 || code === null) {
            resolve();
            return;
        }

        const message = (stderr || `Start-Process exited with code ${code}`).trim();
        const noAssociation = /no application is associated|this file does not have an app associated/i.test(message);
        const error = new Error(message);
        error.code = noAssociation ? 'APP_NOT_FOUND' : 'APP_LAUNCH_FAILED';
        reject(error);
    });
});

const requestBuffer = (targetUrl, authToken = '', redirectCount = 0) => new Promise((resolve, reject) => {
    if (redirectCount > 5) {
        reject(new Error('Too many redirects while downloading file'));
        return;
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(targetUrl);
    } catch (_) {
        reject(new Error('Invalid download URL'));
        return;
    }

    const client = parsedUrl.protocol === 'https:' ? https : http;
    const req = client.request(parsedUrl, {
        method: 'GET',
        rejectUnauthorized: !(parsedUrl.protocol === 'https:' && isPrivateHost(parsedUrl.hostname)),
        headers: {
            'User-Agent': 'NeuralChatOpenHelper/1.0',
            'Accept': '*/*',
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
    }, (res) => {
        const statusCode = Number(res.statusCode || 0);
        const location = res.headers.location;

        if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
            const nextUrl = new URL(location, parsedUrl).toString();
            res.resume();
            requestBuffer(nextUrl, authToken, redirectCount + 1).then(resolve).catch(reject);
            return;
        }

        if (statusCode < 200 || statusCode >= 300) {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8').slice(0, 300);
                reject(new Error(`Download failed with status ${statusCode}${body ? `: ${body}` : ''}`));
            });
            return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.end();
});

const downloadToTemp = async (url, fileName, authToken = '') => {
    const buffer = await requestBuffer(url, authToken);
    const prefix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const targetPath = path.join(TEMP_ROOT, `${prefix}-${sanitizeFileName(fileName)}`);
    fs.writeFileSync(targetPath, buffer);
    return targetPath;
};

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return;
    }

    if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, { ok: true, port: PORT });
        return;
    }

    if (req.method === 'GET' && req.url === '/last-result') {
        try {
            if (!fs.existsSync(LAST_RESULT_PATH)) {
                sendJson(res, 200, { ok: true, result: null });
                return;
            }
            const raw = fs.readFileSync(LAST_RESULT_PATH, 'utf8');
            const parsed = JSON.parse(raw || 'null');
            sendJson(res, 200, { ok: true, result: parsed });
        } catch (error) {
            sendJson(res, 500, { ok: false, error: error.message || 'Unable to read last result' });
        }
        return;
    }

    if (req.method === 'POST' && req.url === '/open') {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 1024 * 1024) {
                req.destroy();
            }
        });

        req.on('end', async () => {
            try {
                const parsed = JSON.parse(body || '{}');
                const sourceUrl = String(parsed.url || '');
                const fileName = sanitizeFileName(parsed.fileName || 'download');
                const ext = String(parsed.ext || '').toLowerCase();
                const authToken = String(parsed.authToken || '');

                if (!sourceUrl) {
                    recordLastResult({ ok: false, stage: 'validate', error: 'Missing url' });
                    sendJson(res, 400, { ok: false, error: 'Missing url' });
                    return;
                }

                const localPath = resolveLocalUploadPath(sourceUrl);
                const targetPath = localPath || await downloadToTemp(sourceUrl, fileName, authToken);
                await openWithDefaultApp(targetPath);
                recordLastResult({
                    ok: true,
                    stage: localPath ? 'local-open' : 'download-open',
                    sourceUrl,
                    fileName,
                    ext,
                    targetPath,
                    local: Boolean(localPath)
                });
                sendJson(res, 200, { ok: true, path: targetPath, ext, local: Boolean(localPath) });
            } catch (error) {
                recordLastResult({
                    ok: false,
                    stage: 'open',
                    sourceUrl: (() => {
                        try {
                            const parsed = JSON.parse(body || '{}');
                            return String(parsed.url || '');
                        } catch (_) {
                            return '';
                        }
                    })(),
                    error: error.message || 'Open failed',
                    code: error.code || 'OPEN_FAILED'
                });
                sendJson(res, 500, {
                    ok: false,
                    error: error.message || 'Open failed',
                    code: error.code || 'OPEN_FAILED'
                });
            }
        });
        return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, HOST, () => {
    console.log(`[windows-open-helper] listening on http://${HOST}:${PORT}`);
});
