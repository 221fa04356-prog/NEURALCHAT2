const fs = require('fs');
let t = fs.readFileSync('Chat.jsx', 'utf8');
t = t.split("title={reactedByMe ? 'Remove reaction' : 'Add reaction'}").join("title=\"View reactions\"");
fs.writeFileSync('Chat.jsx', t, 'utf8');
console.log('Fixed tooltips!');
