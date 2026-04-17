const { networkInterfaces } = require('os');

function getLocalIp() {
    const nets = networkInterfaces();
    const results = {};

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                if (!results[name]) {
                    results[name] = [];
                }
                results[name].push(net.address);
            }
        }
    }

    // Prioritize "Wi-Fi" interface
    const wifiInterface = Object.keys(results).find(name => name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wifi'));
    if (wifiInterface && results[wifiInterface].length > 0) {
        return results[wifiInterface][0];
    }

    // Fallback: return the first non-VMware/Virtual address found
    const otherInterface = Object.keys(results).find(name => !name.toLowerCase().includes('vmware') && !name.toLowerCase().includes('virtual'));
    if (otherInterface && results[otherInterface].length > 0) {
        return results[otherInterface][0];
    }

    // Last resort: return the first available IP
    const allIps = Object.values(results).flat();
    return allIps.length > 0 ? allIps[0] : 'localhost';
}

module.exports = getLocalIp;
