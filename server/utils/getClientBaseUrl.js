const getLocalIp = require('./getLocalIp');

function getClientBaseUrl() {
    if (process.env.CLIENT_URL) {
        return process.env.CLIENT_URL.replace(/\/$/, '');
    }

    // Local Vite/SPA dev servers are served over HTTP by default.
    return `http://${getLocalIp()}:5173`;
}

module.exports = getClientBaseUrl;
