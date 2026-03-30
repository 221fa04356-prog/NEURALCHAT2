const fs = require('fs');
const path = require('path');

const chatFilePath = path.join(__dirname, 'src', 'pages', 'Chat.jsx');
const cssFilePath = path.join(__dirname, 'src', 'styles', 'Chat.css');

let chatContent = fs.readFileSync(chatFilePath, 'utf8');

// 1. Inject state
const stateTarget = `const [snackbar, setSnackbar] = useState(null); // For feedback`;
const stateInjection = `const [snackbar, setSnackbar] = useState(null); // For feedback\n    const [reactionDetails, setReactionDetails] = useState(null); // { msg, isGroup }`;

if (chatContent.includes(stateTarget) && !chatContent.includes('const [reactionDetails, setReactionDetails]')) {
    chatContent = chatContent.replace(stateTarget, stateInjection);
    console.log('✅ Added reactionDetails state');
} else {
    console.log('⚠️ State target not found or already exists');
}

// 2. Change onClick in P2P badges
const p2pOnClickOld = `onClick={(e) => { e.stopPropagation(); handleReaction(msg._id || msg.id, emoji, false); }}`;
const p2pOnClickNew = `onClick={(e) => { e.stopPropagation(); setReactionDetails({ msg, isGroup: false }); }}`;
if (chatContent.includes(p2pOnClickOld)) {
    chatContent = chatContent.split(p2pOnClickOld).join(p2pOnClickNew);
    console.log('✅ Updated P2P badge click handlers');
} else {
    console.log('⚠️ P2P click handler not found or already updated');
}

// 3. Change onClick in Group badges
const groupOnClickOld = `onClick={(e) => { e.stopPropagation(); handleReaction(msg._id || msg.id, emoji, true); }}`;
const groupOnClickNew = `onClick={(e) => { e.stopPropagation(); setReactionDetails({ msg, isGroup: true }); }}`;
if (chatContent.includes(groupOnClickOld)) {
    chatContent = chatContent.split(groupOnClickOld).join(groupOnClickNew);
    console.log('✅ Updated Group badge click handlers');
} else {
    console.log('⚠️ Group click handler not found or already updated');
}

// 4. Inject Modal
const modalJSX = `
            {/* Reaction Details Modal */}
            {reactionDetails && (
                <div 
                    className="wa-mute-modal-overlay" 
                    onClick={() => setReactionDetails(null)}
                    style={{ zIndex: 32000, background: 'rgba(255, 255, 255, 0.4)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <div 
                        className="wa-mute-modal" 
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: '360px', borderRadius: '12px', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '400px' }}
                    >
                        <div style={{ display: 'flex', borderBottom: '1px solid #e9edef', background: '#f0f2f5' }}>
                            <div style={{ flex: 1, padding: '16px', fontWeight: 500, color: '#111b21', textAlign: 'center', borderBottom: '2px solid #0EA5BE' }}>
                                All {reactionDetails.msg.reactions.length}
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
                            {reactionDetails.msg.reactions.map((r, i) => {
                                const isMe = String(r.user_id) === String(user.id || user._id);
                                let u = isMe ? user : users.find(usr => String(usr._id || usr.id) === String(r.user_id));
                                const displayName = isMe ? 'You' : (u ? u.name : 'Unknown User');
                                const displayAvatar = u?.avatar ? (u.avatar.startsWith('http') ? u.avatar : \`http://localhost:5000\${u.avatar}\`) : "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";
                                
                                return (
                                    <div 
                                        key={i} 
                                        style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: isMe ? 'pointer' : 'default', transition: 'background 0.2s', background: isMe ? '#f0f2f5' : 'transparent' }}
                                        onClick={() => {
                                            if (isMe) {
                                                handleReaction(reactionDetails.msg._id || reactionDetails.msg.id, r.emoji, reactionDetails.isGroup);
                                                setReactionDetails(null);
                                            }
                                        }}
                                        title={isMe ? 'Click to remove reaction' : ''}
                                    >
                                        <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', marginRight: 15, flexShrink: 0 }}>
                                            <img src={displayAvatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ color: '#111b21', fontSize: 16 }}>{displayName}</div>
                                            {isMe && <div style={{ color: '#667781', fontSize: 13, marginTop: 2 }}>Click to remove</div>}
                                        </div>
                                        <div style={{ fontSize: 24, paddingLeft: 10 }}>{r.emoji}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
            {renderContactSelectionPanel()}`;

if (chatContent.includes('{renderContactSelectionPanel()}')) {
    chatContent = chatContent.split('{renderContactSelectionPanel()}').join(modalJSX);
    console.log('✅ Injected Reaction Details Modal');
}

fs.writeFileSync(chatFilePath, chatContent, 'utf8');

// 5. Update CSS position to strictly left side
let cssContent = fs.readFileSync(cssFilePath, 'utf8');
const oldSentCss = /.wa-reaction-badges-sent\s*\{[\s\S]*?\}/;
const oldRecvCss = /.wa-reaction-badges-recv\s*\{[\s\S]*?\}/;

const newSentCss = ".wa-reaction-badges-sent {\\n    left: 15px; /* Forced to left side per user request */\\n    right: auto;\\n}";

const newRecvCss = ".wa-reaction-badges-recv {\\n    left: 15px;\\n    right: auto;\\n}";

if (oldSentCss.test(cssContent)) {
    cssContent = cssContent.replace(oldSentCss, newSentCss);
    console.log('✅ Updated CSS left pos for sent');
}
if (oldRecvCss.test(cssContent)) {
    cssContent = cssContent.replace(oldRecvCss, newRecvCss);
    console.log('✅ Updated CSS left pos for recv');
}

fs.writeFileSync(cssFilePath, cssContent, 'utf8');
console.log('✅ Execution completed');
