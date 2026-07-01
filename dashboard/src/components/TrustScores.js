import React from 'react';

export function getStatusColor(score) {
  if (score >= 80) return '#4CAF50';
  if (score >= 50) return '#FF9800';
  if (score >= 20) return '#FF5722';
  return '#F44336';
}

export function getStatusLabel(score) {
  if (score >= 80) return 'HIGHLY TRUSTED';
  if (score >= 50) return 'TRUSTED';
  if (score >= 20) return 'LOW TRUST';
  return 'BLACKLISTED';
}

function TrustScores({ score }) {
  const color = getStatusColor(score);
  const label = getStatusLabel(score);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 130 }}>
        <div style={{ width: 80, height: 8, background: '#333', borderRadius: 4 }}>
          <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 4 }} />
        </div>
        <span style={{ color, fontWeight: 'bold' }}>{score}/100</span>
      </div>
      <span style={{ 
        background: `${color}22`, color, 
        padding: '3px 8px', borderRadius: 4, 
        fontSize: 11, fontWeight: 'bold',
        whiteSpace: 'nowrap'
      }}>
        {label}
      </span>
    </div>
  );
}

export default TrustScores;
