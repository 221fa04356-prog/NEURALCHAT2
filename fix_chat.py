import os

file_path = r'c:\Users\chimr\OneDrive\Desktop\NEU14\chatNeural2\client\src\pages\Chat.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Define the function as a string
edit_overlay_code = """    const renderEditMessageOverlay = () => {
        if (!editingMessage) return null;
        const isMeEditing = isMeMsg(editingMessage);
        
        return (
            <div className="wa-edit-overlay" style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(255, 255, 255, 0.4)',
                backdropFilter: 'blur(8px)',
                zIndex: 10001,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'default'
            }} onClick={() => setEditingMessage(null)}>
                <div className="wa-edit-container" style={{
                    width: '90%',
                    maxWidth: '600px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px',
                    alignItems: 'center',
                    animation: 'wa-slide-up 0.3s ease-out'
                }} onClick={e => e.stopPropagation()}>
                    
                    {/* Message Preview */}
                    <div style={{
                        alignSelf: isMeEditing ? 'flex-end' : 'flex-start',
                        background: isMeEditing ? '#d9fdd3' : 'white',
                        padding: '8px 12px 16px 12px',
                        borderRadius: '12px',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.08)',
                        maxWidth: '85%',
                        position: 'relative',
                        minWidth: '100px',
                        border: '1px solid rgba(0,0,0,0.05)'
                    }}>
                         <div style={{ fontSize: '15px', color: '#111b21', whiteSpace: 'pre-wrap', marginBottom: '8px', lineHeight: '1.4' }}>
                            {editInput || <span style={{ color: '#8696a0', fontStyle: 'italic' }}>Typing...</span>}
                         </div>
                         <div style={{ position: 'absolute', bottom: '6px', right: '10px', fontSize: '11px', color: '#667781', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {new Date(editingMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                            {isMeEditing && (editingMessage.is_read ? <CheckCheck size={14} color="#53bdeb" /> : <CheckCheck size={14} color="#8696a0" />)}
                         </div>
                    </div>

                    {/* Edit Input Area */}
                    <div style={{
                        width: '100%',
                        background: '#f8fafc',
                        borderRadius: '24px',
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                        border: '1px solid #e2e8f0'
                    }}>
                        <Smile size={24} color="#54656f" style={{ cursor: 'pointer', flexShrink: 0 }} />
                        <textarea
                            autoFocus
                            className="wa-edit-box"
                            value={editInput}
                            onChange={(e) => setEditInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleEditMessageSubmit();
                                }
                                if (e.key === 'Escape') setEditingMessage(null);
                            }}
                            rows={1}
                            style={{
                                flex: 1,
                                background: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: '18px',
                                padding: '10px 16px',
                                fontSize: '15px',
                                color: '#111b21',
                                outline: 'none',
                                resize: 'none',
                                maxHeight: '150px',
                                transition: 'all 0.2s'
                            }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            <button 
                                onClick={() => setEditingMessage(null)} 
                                style={{ 
                                    background: '#f1f5f9', 
                                    border: 'none', 
                                    borderRadius: '50%', 
                                    width: '38px', 
                                    height: '38px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    cursor: 'pointer', 
                                    color: '#64748b',
                                    transition: 'background 0.2s'
                                }}
                            >
                                <X size={20} />
                            </button>
                            <button 
                                onClick={handleEditMessageSubmit} 
                                style={{ 
                                    background: '#027EB5', 
                                    border: 'none', 
                                    borderRadius: '50%', 
                                    width: '42px', 
                                    height: '42px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    cursor: 'pointer', 
                                    color: 'white',
                                    boxShadow: '0 2px 8px rgba(2, 126, 181, 0.3)',
                                    transition: 'transform 0.2s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                <Check size={24} strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>
                    <div style={{ fontSize: '13px', color: '#667781', background: 'rgba(255,255,255,0.7)', padding: '4px 12px', borderRadius: '12px' }}>
                        Press Esc to cancel • Enter to save
                    </div>
                </div>
            </div>
        );
    };

"""

# Fix the broken line first if it exists
content = content.replace('        if (!isAssignOwnerModalOpen', '    const renderAssignOwnerModal = () => {\\n        if (!isAssignOwnerModalOpen')

# Insert the function before renderAssignOwnerModal
if 'const renderEditMessageOverlay =' not in content:
    content = content.replace('    const renderAssignOwnerModal = () => {', edit_overlay_code + '    const renderAssignOwnerModal = () => {')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
