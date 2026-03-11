import React, { useState, useRef, useEffect } from 'react';
import { countryCodes } from '../utils/countryCodes';

export default function CountryCodeSelect({ value, onChange, className, style }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedCountry = countryCodes.find(c => c.dialCode === value) || { isoCode: '', dialCode: value };

    return (
        <div ref={dropdownRef} style={{ position: 'relative', height: '100%', ...style }}>
            <div 
                className={className}
                style={{ 
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                    height: '100%', paddingLeft: '10px', paddingRight: '10px', userSelect: 'none',
                    backgroundColor: 'transparent'
                }}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span style={{ fontSize: '0.9rem', color: '#475569', fontWeight: '500' }}>
                    {selectedCountry.isoCode} ({selectedCountry.dialCode})
                </span>
                <span style={{ color: '#94A3B8', fontSize: '10px', marginLeft: '5px' }}>▼</span>
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 5px)', left: 0, width: '280px',
                    background: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(0, 0, 0, 0.1)', borderRadius: '12px',
                    boxShadow: '0 10px 40px rgba(31, 38, 135, 0.15)', maxHeight: '250px',
                    overflowY: 'auto', zIndex: 1000, display: 'flex', flexDirection: 'column',
                    padding: '8px'
                }}>
                    {countryCodes.sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                        <div 
                            key={`${c.isoCode}-${c.dialCode}`}
                            onClick={() => { onChange(c.dialCode); setIsOpen(false); }}
                            style={{ 
                                padding: '10px 14px', cursor: 'pointer', borderRadius: '8px', 
                                transition: 'all 0.2s', fontSize: '14px', color: '#334155',
                                background: c.dialCode === value ? 'rgba(14,165,233,0.1)' : 'transparent',
                                fontWeight: c.dialCode === value ? '600' : '400',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}
                            onMouseOver={(e) => {
                                if (c.dialCode !== value) e.currentTarget.style.background = 'rgba(14,165,233,0.05)';
                            }}
                            onMouseOut={(e) => {
                                if (c.dialCode !== value) e.currentTarget.style.background = 'transparent';
                            }}
                        >
                            <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '10px' }}>{c.name} ({c.isoCode})</span>
                            <span style={{ color: '#0ea5e9', fontWeight: '500', whiteSpace: 'nowrap', flexShrink: 0 }}>{c.dialCode}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
