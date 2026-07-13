import React from 'react';

export function getStatusColor(score) {
  if (score >= 80) return '#16A34A'; // Success green
  if (score >= 50) return '#D97706'; // Amber/Orange
  if (score >= 20) return '#EA580C'; // Orange/Red
  return '#DC2626'; // Danger red
}

export function getStatusBgColor(score) {
  if (score >= 80) return '#DCFCE7'; // Light green bg
  if (score >= 50) return '#FEF3C7'; // Light amber bg
  if (score >= 20) return '#FFEDD5'; // Light orange bg
  return '#FEE2E2'; // Light red bg
}

export function getStatusLabel(score) {
  if (score >= 80) return 'FULL_ACCESS';
  if (score >= 50) return 'RESTRICTED';
  if (score >= 20) return 'QUARANTINED';
  return 'REVOKED';
}

function TrustScores({ score }) {
  const color = getStatusColor(score);
  const bgColor = getStatusBgColor(score);
  const label = getStatusLabel(score);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '140px' }}>
        <div style={{ width: '80px', height: '6px', background: '#E5E7EB', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: '3px' }} />
        </div>
        <span style={{ color: '#374151', fontWeight: '600', fontSize: '13px' }}>{score}/100</span>
      </div>
      <span style={{ 
        background: bgColor, 
        color: color, 
        padding: '4px 10px', 
        borderRadius: '9999px', // Pill shape
        fontSize: '11px', 
        fontWeight: '600',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap'
      }}>
        {label}
      </span>
    </div>
  );
}

export default TrustScores;
