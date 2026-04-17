const os = require('os');
const fs = require('fs');
const interfaces = os.networkInterfaces();

let output = 'Available Network Interfaces:\n';
Object.keys(interfaces).forEach((ifaceName) => {
    interfaces[ifaceName].forEach((iface) => {
        if (iface.family === 'IPv4' && !iface.internal) {
            output += `Interface: ${ifaceName}\n`;
            output += `  Address: ${iface.address}\n`;
            output += `  Netmask: ${iface.netmask}\n`;
            output += `  Mac: ${iface.mac}\n`;
            output += '-------------------\n';
        }
    });
});

fs.writeFileSync('interfaces.txt', output);
console.log('Done');
