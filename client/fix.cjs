const fs = require('fs');
const file = 'c:/Users/percy/Documents/nechat70/chatNeural2/client/src/pages/Chat.jsx';
let text = fs.readFileSync(file, 'utf8');
const replacement = `<div className="wa-reactions-row">
                                    <span onClick={(e) => { e.stopPropagation(); setOpenDropdown(null); }}>👍</span>
                                    <span onClick={(e) => { e.stopPropagation(); setOpenDropdown(null); }}>❤️</span>
                                    <span onClick={(e) => { e.stopPropagation(); setOpenDropdown(null); }}>😂</span>
                                    <span onClick={(e) => { e.stopPropagation(); setOpenDropdown(null); }}>😮</span>
                                    <span onClick={(e) => { e.stopPropagation(); setOpenDropdown(null); }}>😢</span>
                                    <span onClick={(e) => { e.stopPropagation(); setOpenDropdown(null); }}>🙏</span>
                                    <Plus size={18} onClick={(e) => { e.stopPropagation(); setOpenDropdown(null); }} />
                                </div>`;
text = text.replace(/<div className="wa-reactions-row">[\s\S]*?<\/div>/, replacement);
fs.writeFileSync(file, text, 'utf8');
console.log('Fixed emojis');
