const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'Chat.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// ===== P2P REACTION DISPLAY =====
// Find the P2P wa-msg-meta closing tag followed by 2 closing divs
// Pattern is unique: it has formatTime (not toLocaleTimeString) and is_read without wa-msg-status wrapper

const p2pMetaTarget = `                                                            <div className="wa-msg-meta">
                                                                {msg.is_edited && <span style={{ fontSize: '10px', color: '#667781', marginRight: '2px', opacity: 0.9 }}>Edited</span>}
                                                                {msg.is_pinned && <Pin size={12} fill="#8696a0" color="#8696a0" style={{ marginRight: 3, transform: 'rotate(45deg)' }} />}
                                                                {msg.is_starred && <Star size={12} fill="#8696a0" color="#8696a0" style={{ marginRight: 3 }} />}
                                                                <span>{formatTime(msg.created_at)}</span>
                                                                {isMe && (
                                                                    msg.is_read
                                                                        ? <CheckCheck size={14} color="#53bdeb" />
                                                                        : <CheckCheck size={14} color="#9ca3af" />
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>`;

const p2pMetaReplacement = `                                                            <div className="wa-msg-meta">
                                                                {msg.is_edited && <span style={{ fontSize: '10px', color: '#667781', marginRight: '2px', opacity: 0.9 }}>Edited</span>}
                                                                {msg.is_pinned && <Pin size={12} fill="#8696a0" color="#8696a0" style={{ marginRight: 3, transform: 'rotate(45deg)' }} />}
                                                                {msg.is_starred && <Star size={12} fill="#8696a0" color="#8696a0" style={{ marginRight: 3 }} />}
                                                                <span>{formatTime(msg.created_at)}</span>
                                                                {isMe && (
                                                                    msg.is_read
                                                                        ? <CheckCheck size={14} color="#53bdeb" />
                                                                        : <CheckCheck size={14} color="#9ca3af" />
                                                                )}
                                                            </div>
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
                                                            })()}
                                                        </div>
                                                    </div>`;

// ===== GROUP REACTION DISPLAY =====
// The group version uses toLocaleTimeString and wa-msg-status wrapper

const groupMetaTarget = `                                                            <div className="wa-msg-meta">
                                                                {msg.is_edited && <span style={{ fontSize: '10px', color: '#667781', marginRight: '2px', opacity: 0.9 }}>Edited</span>}
                                                                {msg.is_pinned && <Pin size={12} fill="#8696a0" color="#8696a0" style={{ marginRight: 3, transform: 'rotate(45deg)' }} />}
                                                                {msg.is_starred && <Star size={12} fill="#8696a0" color="#8696a0" style={{ marginRight: 3 }} />}
                                                                <span className="wa-timestamp">
                                                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                                </span>
                                                                {isMe && (
                                                                    <div className="wa-msg-status">
                                                                        {msg.is_read
                                                                            ? <CheckCheck size={14} color="#53bdeb" />
                                                                            : <CheckCheck size={14} color="#8696a0" />}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>`;

const groupMetaReplacement = `                                                            <div className="wa-msg-meta">
                                                                {msg.is_edited && <span style={{ fontSize: '10px', color: '#667781', marginRight: '2px', opacity: 0.9 }}>Edited</span>}
                                                                {msg.is_pinned && <Pin size={12} fill="#8696a0" color="#8696a0" style={{ marginRight: 3, transform: 'rotate(45deg)' }} />}
                                                                {msg.is_starred && <Star size={12} fill="#8696a0" color="#8696a0" style={{ marginRight: 3 }} />}
                                                                <span className="wa-timestamp">
                                                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                                </span>
                                                                {isMe && (
                                                                    <div className="wa-msg-status">
                                                                        {msg.is_read
                                                                            ? <CheckCheck size={14} color="#53bdeb" />
                                                                            : <CheckCheck size={14} color="#8696a0" />}
                                                                    </div>
                                                                )}
                                                            </div>
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
                                                            })()}
                                                        </div>
                                                    </div>`;

// Normalize CRLF to LF for matching, then apply replacements
const normalizedContent = content.replace(/\r\n/g, '\n');

let result = normalizedContent;

if (normalizedContent.includes(p2pMetaTarget)) {
    result = result.replace(p2pMetaTarget, p2pMetaReplacement);
    console.log('✅ P2P reaction badges added successfully');
} else {
    console.error('❌ Could not find P2P meta target. Checking for partial match...');
    // Try to find nearby unique text
    const partialSearch = 'formatTime(msg.created_at)}</span>\n                                                                {isMe && (\n                                                                    msg.is_read\n                                                                        ? <CheckCheck size={14} color="#53bdeb" />\n                                                                        : <CheckCheck size={14} color="#9ca3af" />\n                                                                )}\n                                                            </div>\n                                                        </div>\n                                                    </div>';
    if (normalizedContent.includes(partialSearch)) {
        console.log('   Partial P2P match found - trying broader search');
    } else {
        console.log('   No partial P2P match either');
    }
}

if (result.includes(groupMetaTarget)) {
    result = result.replace(groupMetaTarget, groupMetaReplacement);
    console.log('✅ Group reaction badges added successfully');
} else {
    console.error('❌ Could not find Group meta target');
}

// Restore CRLF
const finalContent = result.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, finalContent, 'utf8');
console.log('📁 File written');
