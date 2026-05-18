import React from 'react';

export const CustomHeader = () => {
    return (
        <div className="custom-header" style={{ position: 'relative', zIndex: 2000, backgroundColor: '#f8fafc' }}>
            <div className="app-icon">
                {/* Placeholder for icon if needed */}
                <div className="icon-circle"></div>
            </div>
            <div className="app-title">Synergy CSP Relay</div>
            <div className="draggable-region"></div>
        </div>
    );
};
