import React from 'react';

const ViewOnceBadge = ({
    color = '#8696a0',
    size = 18,
    filled = false,
    className = '',
    style = {}
}) => {
    return (
        <span
            className={className}
            aria-hidden="true"
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: size,
                height: size,
                borderRadius: '50%',
                backgroundColor: filled ? color : 'transparent',
                border: filled ? 'none' : `1.6px solid ${color}`,
                color: filled ? '#ffffff' : color,
                flexShrink: 0,
                lineHeight: 0,
                ...style
            }}
        >
            <span style={{ fontSize: Math.max(9, size - 8), fontWeight: 700, lineHeight: 1 }}>
                1
            </span>
        </span>
    );
};

export default ViewOnceBadge;
