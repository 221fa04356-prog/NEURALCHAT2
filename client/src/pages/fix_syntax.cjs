const fs = require('fs');
const path = 'c:/Users/percy/Documents/nechat84/chatNeural2/client/src/pages/Chat.jsx';
let content = fs.readFileSync(path, 'utf8');

// The problematic block is around handlePlayAudio
const targetBlock = `        audio.onended = () => {
            clearInterval(playTimer);
audio.onended = () => {`;

const fixedBlock = `        audio.onended = () => {
            clearInterval(playTimer);`;

if (content.includes(targetBlock)) {
    const fixedContent = content.replace(targetBlock, fixedBlock);
    fs.writeFileSync(path, fixedContent);
    console.log('Successfully removed duplicated audio.onended line.');
} else {
    // Try with different indentation or line endings
    console.log('Target block not found precisely. Trying fuzzy match...');
    const lines = content.split('\n');
    let found = false;
    for (let i = 0; i < lines.length - 2; i++) {
        if (lines[i].includes('audio.onended = () => {') && 
            lines[i+1].includes('clearInterval(playTimer);') && 
            lines[i+2].includes('audio.onended = () => {')) {
            console.log(`Found pattern at lines ${i+1}-${i+3}`);
            lines.splice(i+2, 1); // Remove the third line (index i+2)
            fs.writeFileSync(path, lines.join('\n'));
            found = true;
            break;
        }
    }
    if (!found) {
        console.error('Could not find the problematic pattern.');
        process.exit(1);
    }
}
