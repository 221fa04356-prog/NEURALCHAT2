'use strict';
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'Chat.jsx');

console.log('Reading Chat.jsx...');
let content = fs.readFileSync(filePath, 'utf8');
console.log('Read complete. Size:', content.length);

// Fix the broken handleReaction function body (template literals were stripped)
// Line 649: const res = await axios.post(/api/messages//react, {
// Should be: const res = await axios.post(`/api/messages/${messageId}/react`, {
// Line 653: headers: { 'Authorization': Bearer  }
// Should be: headers: { 'Authorization': `Bearer ${token}` }

const broken1 = "const res = await axios.post(/api/messages//react, {";
const fixed1  = "const res = await axios.post(`/api/messages/${messageId}/react`, {";

const broken2 = "headers: { 'Authorization': Bearer  }";
const fixed2  = "headers: { 'Authorization': `Bearer ${token}` }";

let changed = 0;

if (content.includes(broken1)) {
    content = content.replace(broken1, fixed1);
    console.log('✓ Fixed axios.post URL template literal');
    changed++;
} else {
    console.log('✗ axios.post broken pattern not found');
}

if (content.includes(broken2)) {
    content = content.replace(broken2, fixed2);
    console.log('✓ Fixed Authorization header template literal');
    changed++;
} else {
    console.log('✗ Authorization header broken pattern not found');
}

if (changed > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✓ File written successfully!');
} else {
    console.log('No changes needed (already fixed or pattern mismatch).');
}

// Verify
const verify = fs.readFileSync(filePath, 'utf8');
console.log('\n--- Verification ---');
console.log('Template literal in POST url:', verify.includes('/api/messages/${messageId}/react'));
console.log('Template literal in header:', verify.includes('Bearer ${token}'));
console.log('handleReaction func exists:', verify.includes('const handleReaction ='));
console.log('Reactions row wired:', verify.includes("handleReaction(id,"));
console.log('Socket listener:', verify.includes("message_reaction_updated"));
