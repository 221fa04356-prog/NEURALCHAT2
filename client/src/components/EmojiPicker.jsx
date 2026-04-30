import React, { useState, useMemo, memo, useRef, useEffect } from 'react';
import { X, Smile, Flower2, Coffee, Trophy, Car, Lightbulb, Hash } from 'lucide-react';

const EMOJI_DATA = [
    {
        category: 'Smileys & People',
        icon: <Smile size={20} />,
        emojis: [
            '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '☺️', '🙂', '🤗', '🤩', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '😴', '😌', '😛', '😜', '😝', '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '☹️', '🙁', '😖', '😞', '😟', '😤', '😢', '😭', '😦', '😧', '😨', '😩', '🤯', '😬', '😰', '😱', '🥵', '🥶', '😳', '🤪', '😵', '😡', '😠', '🤬', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '😇', '🤠', '🤡', '🥳', '🥴', '🥺', '🤥', '🤫', '🤭', '🧐', '🤓', '😈', '👿', '👹', '👺', '💀', '👻', '兵', '👽', '👾', '🤖', '💩', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'
        ]
    },
    {
        category: 'Animals & Nature',
        icon: <Flower2 size={20} />,
        emojis: [
            '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🕸', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🐘', '🦏', '🦛', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🐐', '🦌', '🐕', '🐩', '🐈', '🐓', '🦃', '🕊', '🐇', '🐁', '🐀', '🐿', '🦔', '🐾', '🐉', '🐲', '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🎍', '🎋', '🍃', '🍂', '🍁', '🍄', '🌾', '💐', '🌷', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻', '🌞', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙'
        ]
    },
    {
        category: 'Food & Drink',
        icon: <Coffee size={20} />,
        emojis: [
            '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶', '🌽', '🥕', '🥔', '🍠', '🥐', '🍞', '🥖', '🥨', '🥯', '🧀', '🥚', '🍳', '🥩', '🥓', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🌮', '🌯', '🥗', '🥘', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🍼', '🥛', '☕️', '🍵', '🥤', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🍾'
        ]
    },
    {
        category: 'Activities',
        icon: <Trophy size={20} />,
        emojis: [
            '⚽️', '🏀', '🏈', '⚾️', '🥎', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🏒', '🏑', '🏏', '🥅', '⛳️', '🏹', '🎣', '🥊', '🥋', '⛸', '🎿', '🛷', '🥌', '⛷', '🏂', '🏋️‍♀️', '🏋️‍♂️', '🤼‍♀️', '🤼‍♂️', '🤸‍♀️', '🤸‍♂️', '⛹️‍♀️', '⛹️‍♂️', '🤺', '🤾‍♀️', '🤾‍♂️', '🏌️‍♀️', '🏌️‍♂️', '🏇', '🧘‍♀️', '🧘‍♂️', '🏄‍♀️', '🏄‍♂️', '🏊‍♀️', '🏊‍♂️', '🤽‍♀️', '🤽‍♂️', '🚣‍♀️', '🚣‍♂️', '🧗‍♀️', '🧗‍♂️', '🚵‍♀️', '🚵‍♂️', '🚴‍♀️', '🚴‍♂️', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖', '🏵', '🎫', '🎟', '🎭', '🎨', '🖼', '🎰', '🎳', '🎮', '🕹', '🎯', '🎲', '🧩', '🧸', '🎸', '🎹', '🥁', '🎻', '🎼', '🎤', '🎧', '🎬'
        ]
    },
    {
        category: 'Travel & Places',
        icon: <Car size={20} />,
        emojis: [
            '🚗', '🚕', '🚙', '🚌', '🚎', '🏎', '🚓', '🚑', '🚒', '🚐', '🚚', '🚛', '🚜', '🚲', '🛴', '🛵', '🏍', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '🚁', '🛩', '✈️', '🛫', '🛬', '🚀', '🛰', '🛸', '🛶', '⛵️', '🛥', '🚤', '🛳', '⛴', '🚢', '⚓️', '🚧', '⛽️', '🚏', '🚦', '🚥', '🏁', '🗺', '🗿', '🗽', '⛲️', '🗼', '🏰', '🏯', '🏟', '🎡', '🎢', '🎠', '⛱', '🏖', '🏝', '🏜', '🌋', '⛰', '🏔', '🗻', '🏕', '⛺️', '🏠', '🏘', '🏚', '🏗', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛', '⛪️', '🕌', '🕍', '🕋', '⛩', '🛤', '🛣', '🌅', '🌄', '🌇', '🌆', '🏙', '🌃', '🌌', '🌉', '🌁'
        ]
    },
    {
        category: 'Objects',
        icon: <Lightbulb size={20} />,
        emojis: [
            '⌚️', '📱', '📲', '💻', '⌨️', '🖱', '🖲', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽', '🎞', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙', '🎚', '🎛', '⏱', '⏲', '⏰', '🕰', '⌛️', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯', '🗑', '🛢', '💸', '💵', '💴', '💶', '💷', '💰', '💳', '💎', '⚖️', '🔧', '🔨', '⚒', '🛠', '⛏', '🔩', '⚙️', '⛓', '🔫', '💣', '🔪', '🗡', '⚔️', '🛡', '🚬', '⚰️', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳', '💊', '💉', '🌡', '🧹', '🧺', '🧻', '🧼', '🧽', '🧯', '🛒', '🚿', '🛁', '🚽', '🛎', '🔑', '🗝', '🚪', '🛋', '🛏', '🛌', '🖼', '🛍', '🎁', '🎈', '🎏', '🎀', '🎊', '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌', '📥', '📤', '📦', '🏷', '📪', '📫', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '📊', '📈', '📉', '🗒', '🗓', '📆', '📅', '📇', '🗃', '🗳', '🗄', '📋', '📁', '📂', '🗂', '🗞', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🔗', '📎', '🖇', '📐', '📏', '📌', '📍', '✂️', '🖊', '🖋', '✒️', '🖌', '🖍', '📝', '🔍', '🔎', '🔏', '🔐', '🔒', '🔓'
        ]
    },
    {
        category: 'Symbols',
        icon: <Hash size={20} />,
        emojis: [
            '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈️', '♉️', '♊️', '♋️', '♌️', '♍️', '♎️', '♏️', '♐️', '♑️', '♒️', '♓️', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚️', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕️', '🛑', '⛔️', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗️', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯️', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿️', '🅿️', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓'
        ]
    }
];

const EmojiPicker = ({ onSelect, onClose, position, className = "", zoom = 1 }) => {
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState(EMOJI_DATA[0].category);
    const pickerRef = useRef(null);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        const handleClickOutside = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    const filteredData = useMemo(() => {
        if (!search) return EMOJI_DATA;
        return EMOJI_DATA.map(cat => ({
            ...cat,
            emojis: cat.emojis.filter(emoji => 
                // Simple keyword matching for search
                true 
            )
        })).filter(cat => cat.emojis.length > 0);
    }, [search]);

    // Simple search filter implementation
    const displayedEmojis = useMemo(() => {
        const all = EMOJI_DATA.flatMap(c => c.emojis);
        if (!search) return null;
        return all.slice(0, 50); // Just a placeholder for search
    }, [search]);

    const effViewportWidth = window.innerWidth / zoom;
    const effViewportHeight = window.innerHeight / zoom;
    
    const maxMobileWidth = 360;
    const padding = 20;

    const pickerWidth = Math.min(maxMobileWidth, effViewportWidth - padding * 2);
    // On mobile we don't want it to take more than half or 60% of screen height to leave room for seeing the chat.
    // 480 is max, but let's cap it at max 60vh on very small devices or leave 120px buffer.
    const pickerHeight = Math.min(480, effViewportHeight - 120); 

    // Convert viewport position to container position
    const posX = position.x / zoom;
    const posY = position.y / zoom;

    const left = Math.min(Math.max(padding + pickerWidth / 2, posX), effViewportWidth - padding - pickerWidth / 2);

    let top;
    let transform;
    let marginTop = 0;

    if (posY + 20 + pickerHeight <= effViewportHeight - padding) {
        // Fits below
        top = posY + 20;
        transform = 'translate(-50%, 0)';
        marginTop = 10;
    } else if (posY - 20 - pickerHeight >= padding) {
        // Fits above
        top = posY - 20;
        transform = 'translate(-50%, -100%)';
        marginTop = -10;
    } else {
        // Doesn't fit perfectly in either direction, constrain within viewport
        top = Math.max(padding, effViewportHeight - pickerHeight - padding);
        transform = 'translate(-50%, 0)';
        marginTop = 0;
    }

    return (
        <div 
            ref={pickerRef}
            className={`wa-full-emoji-picker ${className}`}
            style={{
                position: 'fixed',
                top: top,
                left: left,
                width: pickerWidth,
                height: pickerHeight,
                zIndex: 10005,
                transform: transform,
                marginTop: marginTop
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="wa-emoji-picker-container">
                <div className="wa-emoji-picker-header">
                    <div className="wa-emoji-categories">
                        {EMOJI_DATA.map(cat => (
                            <div 
                                key={cat.category}
                                className={`wa-emoji-cat-btn ${activeCategory === cat.category ? 'active' : ''}`}
                                title={cat.category}
                                aria-label={cat.category}
                                onClick={() => {
                                    setActiveCategory(cat.category);
                                    const el = document.getElementById(`cat-${cat.category}`);
                                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }}
                            >
                                {cat.icon}
                                {activeCategory === cat.category && <div className="wa-cat-indicator" />}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="wa-emoji-list-scroll">
                    {search ? (
                        <div className="wa-emoji-section">
                            <div className="wa-emoji-grid">
                                {EMOJI_DATA.flatMap(c => c.emojis).slice(0, 100).map((emoji, i) => (
                                    <span key={i} className="wa-emoji-item" title={emoji} aria-label={`Emoji ${emoji}`} onClick={() => onSelect(emoji)}>{emoji}</span>
                                ))}
                            </div>
                        </div>
                    ) : (
                        EMOJI_DATA.map(cat => (
                            <div key={cat.category} id={`cat-${cat.category}`} className="wa-emoji-section">
                                <div className="wa-emoji-section-title">{cat.category}</div>
                                <div className="wa-emoji-grid">
                                    {cat.emojis.map((emoji, i) => (
                                        <span key={i} className="wa-emoji-item" title={emoji} aria-label={`Emoji ${emoji}`} onClick={() => onSelect(emoji)}>{emoji}</span>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
            <div className="wa-emoji-picker-backdrop" onClick={onClose} />
        </div>
    );
};

export default memo(EmojiPicker);
