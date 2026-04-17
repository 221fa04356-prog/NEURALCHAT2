const fs = require('fs');
const path = require('path');
const dir = 'c:/Users/chimr/OneDrive/Desktop/NEU25/chatNeural2/client/src/pages/';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));
files.forEach(f => {
    const fp = path.join(dir, f);
    let content = fs.readFileSync(fp, 'utf8');
    content = content.replace(/color:\s*['"]#475569['"]/g, "color: '#e2e8f0'");
    fs.writeFileSync(fp, content);
});
console.log("Colors updated.");
