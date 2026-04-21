const fs = require('fs');
const file = 'c:/Users/chimr/OneDrive/Desktop/FRESH/NEURALCHAT2/client/src/pages/Chat.jsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr =                             <input type=\"file\" id=\"add-more-preview-files\" multiple onChange={(e) => { handleFileSelect(e); }} style={{ display: 'none' }} />;

const replaceStr =                             <input type=\"file\" id=\"add-more-preview-files\" multiple onChange={(e) => { 
                                const newFiles = Array.from(e.target.files);
                                if (newFiles.length) {
                                    const merged = [...filesInTray, ...newFiles];
                                    setSelectedFiles(merged);
                                    if (!file) setFile(merged[0]);
                                }
                            }} style={{ display: 'none' }} />;

content = content.replace(targetStr, replaceStr);
fs.writeFileSync(file, content);
console.log('Successfully added handleAddMoreFiles logic!');
