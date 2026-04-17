const fs = require('fs');
const path = require('path');
const dir = 'c:/Users/chimr/OneDrive/Desktop/NEU25/chatNeural2/client/src/pages/';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));
files.forEach(f => {
    const fp = path.join(dir, f);
    let content = fs.readFileSync(fp, 'utf8');
    content = content.replace(/color:\s*['"]#475569['"]/g, "color: '#e2e8f0'");
    content = content.replace(/color:\s*['"]#94A3B8['"]/g, "color: '#94A3B8'"); // This is actually fine, maybe we leave it or tweak it.
    // Also change form-group-custom label's inline style color if it doesn't match
    fs.writeFileSync(fp, content);
});
console.log("Colors updated.");
