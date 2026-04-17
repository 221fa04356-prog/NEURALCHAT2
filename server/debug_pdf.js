const pdf = require('pdf-parse');
console.log('---------------- DEBUG START ----------------');
console.log('Type of pdf-parse:', typeof pdf);
console.log('Is Array?', Array.isArray(pdf));
console.log('Keys:', Object.keys(pdf));
console.log('String representation:', pdf.toString());
if (typeof pdf === 'object') {
    console.log('JSON representation:', JSON.stringify(pdf, null, 2));
}
const fs = require('fs');
const path = require('path');
// Create a tiny dummy PDF buffer (header only) just to test signature
const dummyPdf = Buffer.from('%PDF-1.4\n%...\n');
console.log('Testing function call...');
try {
    if (typeof pdf === 'function') {
        pdf(dummyPdf).then(() => console.log('Promise returned')).catch(e => console.log('Error inside promise (expected for dummy):', e.message));
    } else {
        console.log('Skipping call, not a function.');
    }
} catch (e) {
    console.log('Call threw error:', e.message);
}
console.log('---------------- DEBUG END ----------------');
