const os = require('os');
const interfaces = os.networkInterfaces();

console.log('Available Network Interfaces:');
Object.keys(interfaces).forEach((ifaceName) => {
  interfaces[ifaceName].forEach((iface) => {
    if (iface.family === 'IPv4' && !iface.internal) {
      console.log(`Interface: ${ifaceName}`);
      console.log(`  Address: ${iface.address}`);
      console.log(`  Netmask: ${iface.netmask}`);
      console.log(`  Mac: ${iface.mac}`);
      console.log('-------------------');
    }
  });
});
