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
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    width: '100%',
                    height: '100%',
                    padding: '0 16px',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                }}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span style={{ fontSize: '0.9rem', color: '#f8fafc', fontWeight: '800', whiteSpace: 'nowrap' }}>
                    {selectedCountry.isoCode} ({selectedCountry.dialCode})
                </span>
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 5px)',
                    left: 0,
                    width: '280px',
                    background: 'rgba(15, 23, 42, 0.98)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(56, 189, 248, 0.1)',
                    maxHeight: '250px',
                    overflowY: 'auto',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '8px'
                }}>
                    {countryCodes.sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                        <div
                            key={`${c.isoCode}-${c.dialCode}`}
                            onClick={() => { onChange(c.dialCode); setIsOpen(false); }}
                            style={{
                                padding: '10px 14px',
                                cursor: 'pointer',
                                borderRadius: '8px',
                                transition: 'all 0.2s',
                                fontSize: '14px',
                                color: '#f8fafc',
                                background: c.dialCode === value ? 'rgba(56,189,248,0.15)' : 'transparent',
                                fontWeight: c.dialCode === value ? '700' : '500',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}
                            onMouseOver={(e) => {
                                if (c.dialCode !== value) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = '#38d5ff';
                                }
                            }}
                            onMouseOut={(e) => {
                                if (c.dialCode !== value) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = '#f8fafc';
                                }
                            }}
                        >
                            <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '10px' }}>{c.name} ({c.isoCode})</span>
                            <span style={{ color: '#38d5ff', fontWeight: '800', whiteSpace: 'nowrap', flexShrink: 0 }}>{c.dialCode}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
