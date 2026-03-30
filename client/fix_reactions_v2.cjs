const fs = require('fs');
const path = require('path');

const chatFilePath = path.join(__dirname, 'src', 'pages', 'Chat.jsx');
const cssFilePath = path.join(__dirname, 'src', 'styles', 'Chat.css');

let content = fs.readFileSync(chatFilePath, 'utf8');

// Use regex replacement for flexibility
const p2pRegex = /(<div className="wa-msg-meta">[\s\S]*?<span>\{formatTime\(msg\.created_at\)\}<\/span>[\s\S]*?\{isMe && \([\s\S]*?msg\.is_read[\s\S]*?\? <CheckCheck size=\{14\} color="#53bdeb" \/>[\s\S]*?: <CheckCheck size=\{14\} color="#9ca3af" \/>[\s\S]*?\)\}*[\s\S]*?<\/div>)([\s]*<\/div>[\s]*<\/div>)/;

const p2pBadgeCode = `
                                                            {/* Reaction display badges - P2P */}
                                                            {msg.reactions && msg.reactions.length > 0 && (() => {
                                                                const currentUserId = user.id || user._id;
                                                                const grouped = msg.reactions.reduce((acc, r) => {
                                                                    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, reactedByMe: false };
                                                                    acc[r.emoji].count++;
                                                                    if (String(r.user_id) === String(currentUserId)) acc[r.emoji].reactedByMe = true;
                                                                    return acc;
                                                                }, {});
                                                                return (
                                                                    <div className={\`wa-reaction-badges \${isMe ? 'wa-reaction-badges-sent' : 'wa-reaction-badges-recv'}\`}>
                                                                        {Object.entries(grouped).map(([emoji, { count, reactedByMe }]) => (
                                                                            <span
                                                                                key={emoji}
                                                                                className={\`wa-reaction-badge \${reactedByMe ? 'reacted' : ''}\`}
                                                                                onClick={(e) => { e.stopPropagation(); handleReaction(msg._id || msg.id, emoji, false); }}
                                                                                title={reactedByMe ? 'Remove reaction' : 'Add reaction'}
                                                                            >
                                                                                {emoji}{count > 1 && <span className="wa-reaction-count">{count}</span>}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                );
                                                            })()}`;

const groupRegex = /(<div className="wa-msg-meta">[\s\S]*?<span className="wa-timestamp">[\s\S]*?\{new Date\(msg\.created_at\)\.toLocaleTimeString[\s\S]*?<\/span>[\s\S]*?\{isMe && \([\s\S]*?<div className="wa-msg-status">[\s\S]*?\{msg\.is_read[\s\S]*?\? <CheckCheck size=\{14\} color="#53bdeb" \/>[\s\S]*?: <CheckCheck size=\{14\} color="#8696a0" \/>\}[\s\S]*?<\/div>[\s\S]*?\)\}*[\s\S]*?<\/div>)([\s]*<\/div>[\s]*<\/div>)/;

const groupBadgeCode = `
                                                            {/* Reaction display badges - Group */}
                                                            {msg.reactions && msg.reactions.length > 0 && (() => {
                                                                const currentUserId = user.id || user._id;
                                                                const grouped = msg.reactions.reduce((acc, r) => {
                                                                    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, reactedByMe: false };
                                                                    acc[r.emoji].count++;
                                                                    if (String(r.user_id) === String(currentUserId)) acc[r.emoji].reactedByMe = true;
                                                                    return acc;
                                                                }, {});
                                                                return (
                                                                    <div className={\`wa-reaction-badges \${isMe ? 'wa-reaction-badges-sent' : 'wa-reaction-badges-recv'}\`}>
                                                                        {Object.entries(grouped).map(([emoji, { count, reactedByMe }]) => (
                                                                            <span
                                                                                key={emoji}
                                                                                className={\`wa-reaction-badge \${reactedByMe ? 'reacted' : ''}\`}
                                                                                onClick={(e) => { e.stopPropagation(); handleReaction(msg._id || msg.id, emoji, true); }}
                                                                                title={reactedByMe ? 'Remove reaction' : 'Add reaction'}
                                                                            >
                                                                                {emoji}{count > 1 && <span className="wa-reaction-count">{count}</span>}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                );
                                                            })()}`;

let result = content;

if (p2pRegex.test(result)) {
    result = result.replace(p2pRegex, `$1${p2pBadgeCode}$2`);
    console.log('✅ P2P reaction badges added');
} else {
    console.error('❌ Could not find P2P target');
}

if (groupRegex.test(result)) {
    result = result.replace(groupRegex, `$1${groupBadgeCode}$2`);
    console.log('✅ Group reaction badges added');
} else {
    console.error('❌ Could not find Group target');
}

fs.writeFileSync(chatFilePath, result, 'utf8');


// Add CSS
let cssContent = fs.readFileSync(cssFilePath, 'utf8');
const cssRule = `
/* Reaction Badges on Messages */
.wa-reaction-badges {
    position: absolute;
    bottom: -10px;
    display: flex;
    gap: 4px;
    z-index: 2;
    background: transparent;
    border-radius: 12px;
}

.wa-reaction-badges-sent {
    right: 15px; /* Adjust based on your bubble padding */
}

.wa-reaction-badges-recv {
    left: 15px;
}

.wa-reaction-badge {
    background: #ffffff;
    border: 1px solid #e9edef;
    border-radius: 12px;
    padding: 2px 6px;
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 3px;
    box-shadow: 0 1px 2px rgba(11, 20, 26, 0.1);
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
}

.wa-reaction-badge:hover {
    background: #f5f6f6;
    transform: scale(1.05);
}

.wa-reaction-badge.reacted {
    background: #e1f5fe;
    border-color: #027EB5;
}

.wa-reaction-count {
    color: #54656f;
    font-weight: 500;
}
.wa-reaction-badge.reacted .wa-reaction-count {
    color: #027EB5;
}
`;

if (!cssContent.includes('.wa-reaction-badges {')) {
    cssContent += cssRule;
    fs.writeFileSync(cssFilePath, cssContent, 'utf8');
    console.log('✅ CSS added');
}

console.log('Done!');
