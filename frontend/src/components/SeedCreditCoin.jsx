import React from 'react';

/**
 * SeedCreditCoin
 * Clean minted badge representation of SEED Credits (SC).
 */
const SeedCreditCoin = ({ className = '', style = {}, size }) => {
  const fontSize = size ? `${Math.max(9, Math.round(size * 0.75))}px` : '10px';

  return (
    <span
      className={`sc-badge-text ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize,
        color: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.14)',
        border: '1px solid rgba(16, 185, 129, 0.35)',
        padding: '1.5px 5px',
        borderRadius: '4px',
        letterSpacing: '0.4px',
        lineHeight: 1,
        userSelect: 'none',
        verticalAlign: 'middle',
        ...style
      }}
      title="SEED Credits (SC)"
    >
      SC
    </span>
  );
};

export default SeedCreditCoin;
