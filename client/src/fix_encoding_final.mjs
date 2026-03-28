import fs from 'fs';
const path = 'c:/Users/percy/Documents/nechat69/chatNeural2/client/src/pages/Chat.jsx';
// Read it as UTF-16 then write as UTF-8
const content = fs.readFileSync(path, 'utf16le');
fs.writeFileSync(path, content, 'utf8');
console.log('Forced UTF-16 to UTF-8 conversion');
