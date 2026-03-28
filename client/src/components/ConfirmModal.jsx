
import React from 'react';
import '../styles/ConfirmModal.css';
import { AlertTriangle, FileText, Info, ExternalLink } from 'lucide-react';

const ConfirmModal = ({ 
    isOpen, 
    title, 
    message, 
    onConfirm, 
    onCancel, 
    onConfirmMe, 
    onConfirmEveryone, 
    confirmTextMe, 
    confirmTextEveryone, 
    confirmText,
    confirmVariant = 'danger', // 'danger' | 'primary' | 'success'
    onSecondary,
    secondaryText,
    secondaryVariant = 'secondary', // 'secondary' | 'primary' | 'success'
    icon: CustomIcon
}) => {
    if (!isOpen) return null;

    const renderIcon = () => {
        if (CustomIcon) return <CustomIcon size={24} color={confirmVariant === 'danger' ? '#f5365c' : '#0EA5BE'} />;
        
        switch (confirmVariant) {
            case 'primary':
                return <FileText size={24} color="#0EA5BE" />;
            case 'success':
                return <Info size={24} color="#0EA5BE" />;
            default:
                return <AlertTriangle size={24} color="#f5365c" />;
        }
    };

    const confirmBtnClass = `btn-${confirmVariant}`;
    const secondaryBtnClass = `btn-${secondaryVariant}`;

    return (
        <div className="confirm-modal-overlay" onClick={onCancel}>
            <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="confirm-modal-header">
                    <div className="confirm-modal-icon-wrapper" style={{ 
                        backgroundColor: confirmVariant === 'danger' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(2, 126, 181, 0.1)' 
                    }}>
                        {renderIcon()}
                    </div>
                    <h3>{title || 'Are you sure?'}</h3>
                </div>
                <div className="confirm-modal-body">
                    <p>{message}</p>
                </div>
                <div className="confirm-modal-footer">
                    <button className="btn-secondary" onClick={onCancel}>Cancel</button>
                    
                    {onSecondary && (
                        <button className={secondaryBtnClass} onClick={onSecondary}>
                            {secondaryText || 'Secondary'}
                        </button>
                    )}

                    {onConfirmMe && (
                        <button className={confirmBtnClass} onClick={onConfirmMe}>
                            {confirmTextMe || 'Delete for me'}
                        </button>
                    )}
                    {onConfirmEveryone && (
                        <button className={confirmBtnClass} onClick={onConfirmEveryone}>
                            {confirmTextEveryone || 'Delete for everyone'}
                        </button>
                    )}
                    {!onConfirmMe && !onConfirmEveryone && onConfirm && (
                        <button className={confirmBtnClass} onClick={onConfirm}>
                            {confirmText || 'Confirm'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
