const pdfLib = require('pdf-parse');
console.log('Main export keys:', Object.keys(pdfLib));

const pdf = pdfLib.default || pdfLib;
console.log('Resolved pdf function type:', typeof pdf);

if (typeof pdf !== 'function') {
    console.error('STILL NOT A FUNCTION');
    process.exit(1);
}

const fs = require('fs');
const dummyPdf = Buffer.from('%PDF-1.4\n%...\n'); // This might fail actual parsing but library should handle it or fail gracefully

// To test real parsing, we need a real PDF if possible, or just catch the error and see if it LOOKS like a parsing error (meaning function call worked)
// Or use a minimal valid PDF header.

try {
    pdf(dummyPdf).then(data => {
        console.log('Parsed Data Keys:', Object.keys(data));
        console.log('Has text?', 'text' in data);
    }).catch(err => {
        console.log('Parsing failed as expected (dummy data), but function was callable.');
        console.log('Error:', err.message);
    });
} catch (e) {
    console.log('Immediate crash:', e.message);
}
