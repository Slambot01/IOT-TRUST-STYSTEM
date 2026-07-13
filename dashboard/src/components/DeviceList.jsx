import React, { useState } from 'react';
import TrustScores from './TrustScores';

function DeviceList({ devices, trustData }) {
  const [hoveredRow, setHoveredRow] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);

  const toggleRow = (id) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  return (
    <div style={{ 
      background: '#FFFFFF', 
      borderRadius: '10px', 
      border: '1px solid #E5E7EB',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      overflow: 'hidden' 
    }}>
      <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid #E5E7EB' }}>
        <h2 style={{ color: '#111827', margin: 0, fontSize: '18px', fontWeight: '600' }}>
          Registered IoT Devices
        </h2>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
            {['Device ID', 'DID', 'Trust Score & Status', 'Registered At'].map(h => (
              <th key={h} style={{ 
                padding: '12px 24px', 
                textAlign: 'left', 
                color: '#6B7280', 
                fontWeight: '600',
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {devices.map(dev => {
            const td = trustData[dev.deviceId] || { 
              score: 100, 
              isLearning: true, 
              subScores: { p1_request_rate: 100, p2_endpoint_consistency: 100, p3_payload_size: 100, p4_error_rate: 100 },
              compositeScore: 100
            };
            const isHovered = hoveredRow === dev.deviceId;
            const isExpanded = expandedRow === dev.deviceId;
            return (
              <React.Fragment key={dev.deviceId}>
                <tr 
                  style={{ 
                    borderBottom: '1px solid #E5E7EB',
                    background: isHovered ? '#F9FAFB' : '#FFFFFF',
                    transition: 'background 0.15s ease',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={() => setHoveredRow(dev.deviceId)}
                  onMouseLeave={() => setHoveredRow(null)}
                  onClick={() => toggleRow(dev.deviceId)}
                >
                  <td style={{ padding: '16px 24px', color: '#111827', fontWeight: '500', fontSize: '14px' }}>
                    {dev.deviceId}
                    {td.isLearning && (
                      <span style={{ fontSize: '11px', color: '#D97706', background: '#FEF3C7', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>
                        Learning
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '16px 24px', color: '#2563EB', fontSize: '13px' }}>
                    <a href="#" style={{ color: 'inherit', textDecoration: isHovered ? 'underline' : 'none' }}>
                      {dev.did}
                    </a>
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <TrustScores score={td.score} />
                  </td>
                  <td style={{ padding: '16px 24px', color: '#6B7280', fontSize: '13px' }}>
                    {dev.registeredAt 
                      ? new Date(dev.registeredAt).toLocaleString() 
                      : 'Just now'}
                  </td>
                </tr>
                {isExpanded && (
                  <tr style={{ background: '#F8FAFC' }}>
                    <td colSpan={4} style={{ padding: '16px 24px', borderBottom: '1px solid #E5E7EB' }}>
                      <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: '#334155' }}>
                        <div><strong>P1 (Rate):</strong> {td.subScores?.p1_request_rate?.toFixed(1) ?? 'N/A'}</div>
                        <div><strong>P2 (Endpoints):</strong> {td.subScores?.p2_endpoint_consistency?.toFixed(1) ?? 'N/A'}</div>
                        <div><strong>P3 (Payload):</strong> {td.subScores?.p3_payload_size?.toFixed(1) ?? 'N/A'}</div>
                        <div><strong>P4 (Errors):</strong> {td.subScores?.p4_error_rate?.toFixed(1) ?? 'N/A'}</div>
                        <div><strong>Composite:</strong> {td.compositeScore?.toFixed(1) ?? 'N/A'}</div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {devices.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: '48px', textAlign: 'center', color: '#6B7280' }}>
                No devices yet. Run the simulation first.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DeviceList;
