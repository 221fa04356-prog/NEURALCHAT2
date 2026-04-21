const fs = require('fs');
const file = 'c:/Users/chimr/OneDrive/Desktop/FRESH/NEURALCHAT2/client/src/pages/Chat.jsx';
let content = fs.readFileSync(file, 'utf8');

const startStr = '    const renderFilePreview = () => {';
const endStr = '    const renderSearchSidebar = () => (';

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
    const replacement = `    const renderFilePreview = () => {
        const filesInTray = (selectedFiles.length ? selectedFiles : (file ? [file] : []));
        const isSingleImageOnly = filesInTray.length === 1 && !!file && file.type?.startsWith('image/');

        return (
        <div className="wa-file-preview-overlay" style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: '#e9edef',
            position: 'relative',
            zIndex: 1000
        }}>
            {/* Header */}
            <div style={{
                padding: '16px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#202c33',
                color: '#f8fafc',
                flexShrink: 0
            }}>
                <button
                    onClick={() => {
                        setFile(null);
                        setSelectedFiles([]);
                    }}
                    style={{ background: 'none', border: 'none', color: '#aebac1', cursor: 'pointer', display: 'flex', padding: 4 }}
                    title="Close preview"
                >
                    <X size={24} />
                </button>
                
                {isSingleImageOnly && (
                    <div style={{ display: 'flex', gap: 24, color: '#aebac1', alignItems: 'center' }}>
                        <Crop size={22} style={{ cursor: 'pointer' }} onClick={() => { setCapturedImage(getFilePreviewUrl(file)); setCameraModal('editor'); }} />
                        <Sticker size={22} style={{ cursor: 'pointer' }} />
                        <span style={{ fontSize: 20, fontWeight: 600, cursor: 'pointer', fontFamily: 'serif' }}>T</span>
                        <Pencil size={22} style={{ cursor: 'pointer' }} onClick={() => { setCapturedImage(getFilePreviewUrl(file)); setCameraModal('editor'); }} />
                        <Download size={22} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleDownload(getFilePreviewUrl(file), file.name || 'download'); }} />
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden',
                padding: '20px 40px',
                position: 'relative',
                background: '#0b141a'
            }}>
                {file && file.type?.startsWith('image/') ? (
                    <img
                        src={getFilePreviewUrl(file)}
                        alt="Preview"
                        style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain'
                        }}
                    />
                ) : file && file.type?.startsWith('video/') ? (
                    <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <video
                            src={getFilePreviewUrl(file)}
                            controls
                            autoPlay
                            muted
                            controlsList="nodownload"
                            style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                borderRadius: 8,
                                boxShadow: '0 8px 12px rgba(0,0,0,0.1)',
                                background: '#111b21'
                            }}
                        />
                    </div>
                ) : file && file.type?.startsWith('audio/') ? (
                    <div style={{ width: '100%', maxWidth: 700, textAlign: 'center' }}>
                        <div style={{ marginBottom: 14, fontSize: 18, fontWeight: 500, color: '#e9edef' }}>{file?.name}</div>
                        <audio src={getFilePreviewUrl(file)} controls style={{ width: '100%' }} />
                    </div>
                ) : (
                    <div style={{
                        textAlign: 'center',
                        padding: '40px 32px',
                        background: '#1f2c34',
                        borderRadius: 12,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                        color: '#e9edef',
                        border: '1px solid #2a3942',
                        minWidth: 340,
                        maxWidth: 640
                    }}>
                        <div style={{
                            width: 96,
                            height: 96,
                            margin: '0 auto 16px',
                            borderRadius: 12,
                            background: '#2a3942',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <FileText size={44} color="#8696a0" />
                        </div>
                        <div style={{ fontSize: 14, color: '#8696a0', marginBottom: 8 }}>No preview available</div>
                        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 8, color: '#e9edef', wordBreak: 'break-word' }}>{file?.name || 'File'}</div>
                        <div style={{ fontSize: 14, color: '#8696a0' }}>
                            {file?.size ? (file.size / (1024 * 1024)).toFixed(2) + ' MB' : ''} - {getDisplayFileType(file)}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer / Caption Input */}
            <div style={{
                padding: '16px 24px 32px',
                background: '#202c33',
                display: 'flex',
                flexDirection: 'column',
                gap: 16
            }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{
                        background: '#2a3942',
                        borderRadius: 8,
                        padding: '12px 16px',
                        width: '100%',
                        maxWidth: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16
                    }}>
                        <Smile size={24} color="#8696a0" />
                        <input
                            type="text"
                            id="caption-input"
                            name="caption"
                            aria-label="Add a caption"
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                color: '#e9edef',
                                fontSize: 15
                            }}
                            placeholder="Add a caption..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleSend(e);
                            }}
                            autoFocus
                        />
                        <div style={{ cursor: 'pointer' }} onClick={() => setIsViewOnceVoice(!isViewOnceVoice)} title="View once">
                            <ViewOnceBadge size={22} color={isViewOnceVoice ? "#0EA5BE" : "#8696a0"} />
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginTop: 12 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', overflowX: 'auto', maxWidth: 'calc(100% - 100px)', padding: '4px 0' }}>
                        {filesInTray.map((f, idx) => (
                            <div key={idx} style={{
                                width: 50, height: 50, borderRadius: 8,
                                border: f === file ? '2px solid #00a884' : '2px solid transparent',
                                overflow: 'hidden', cursor: 'pointer',
                                background: '#111b21', display: 'flex', justifyContent: 'center', alignItems: 'center',
                                flexShrink: 0
                            }} onClick={() => setFile(f)}>
                                {f.type?.startsWith('image/') ? (
                                    <img src={getFilePreviewUrl(f)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={\`thumb-\${idx}\`} />
                                ) : (
                                    <FileText color="#8696a0" size={24} />
                                )}
                            </div>
                        ))}

                        <div style={{
                            width: 50, height: 50, borderRadius: 8, border: '1px solid #8696a0',
                            display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer',
                            flexShrink: 0
                        }} onClick={() => document.getElementById('add-more-preview-files')?.click()}>
                            <Plus color="#8696a0" size={24} />
                            <input type="file" id="add-more-preview-files" multiple onChange={(e) => { handleFileSelect(e); }} style={{ display: 'none' }} />
                        </div>
                    </div>

                    <button
                        onClick={handleSend}
                        style={{
                            position: 'absolute',
                            right: 0,
                            width: 50,
                            height: 50,
                            borderRadius: '50%',
                            background: '#00a884',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                        }}
                    >
                        <Send size={24} color="#111b21" />
                    </button>
                </div>
            </div>
        </div>
        );
    };

`;
    content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
    fs.writeFileSync(file, content);
    console.log('Successfully replaced renderFilePreview!');
} else {
    console.error('Could not find start or end index!');
}
