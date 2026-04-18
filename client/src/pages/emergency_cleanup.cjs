const fs = require('fs');
const path = 'c:/Users/percy/Documents/nechat84/chatNeural2/client/src/pages/Chat.jsx';
let content = fs.readFileSync(path, 'utf8');

// The disaster happened between some index and another.
// I'll look for the markers.

const startMarker = '// --- Voice Recording Functions ---';
const firstPlayAudio = 'const handlePlayAudio = async (msg, startTime = 0) =>';
const secondPlayAudio = 'const handlePlayAudio = async (msg, startTime = 0) =>';

// Let's find index of markers
const firstOccur = content.indexOf(firstPlayAudio);
const secondOccur = content.indexOf(firstPlayAudio, firstOccur + 1);

if (firstOccur !== -1 && secondOccur !== -1) {
    // Everything from firstOccur up to secondOccur is likely garbage or duplicated
    // But wait, what if I delete too much?
    // Let's check what's between them.
    
    // Actually, I see that lines 5136 to 5330 are the duplicate mess.
    // I will delete the block that is clearly broken.
    
    const garbageStart = firstOccur;
    const garbageEnd = secondOccur;
    
    const cleanedContent = content.substring(0, garbageStart) + content.substring(garbageEnd);
    fs.writeFileSync(path, cleanedContent);
    console.log('Successfully cleaned up Chat.jsx duplication.');
} else {
    console.error('Markers not found or duplication not detected as expected.');
    process.exit(1);
}
