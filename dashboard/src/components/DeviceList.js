import React, { useState } from 'react';
import TrustScores from './TrustScores';

function DeviceList({ devices, trustScores }) {
  const [hoveredRow, setHoveredRow] = useState(null);

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
            // Check !== undefined so a valid score of 0 does not fall back to 100
            const score = trustScores[dev.deviceId] !== undefined ? trustScores[dev.deviceId] : (trustScores[dev.deviceId] || 100);
            const isHovered = hoveredRow === dev.deviceId;
            return (
              <tr 
                key={dev.deviceId} 
                style={{ 
                  borderBottom: '1px solid #E5E7EB',
                  background: isHovered ? '#F9FAFB' : '#FFFFFF',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={() => setHoveredRow(dev.deviceId)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <td style={{ padding: '16px 24px', color: '#111827', fontWeight: '500', fontSize: '14px' }}>
                  {dev.deviceId}
                </td>
                <td style={{ padding: '16px 24px', color: '#2563EB', fontSize: '13px' }}>
                  <a href="#" style={{ color: 'inherit', textDecoration: isHovered ? 'underline' : 'none' }}>
                    {dev.did}
                  </a>
                </td>
                <td style={{ padding: '16px 24px' }}>
                  <TrustScores score={score} />
                </td>
                <td style={{ padding: '16px 24px', color: '#6B7280', fontSize: '13px' }}>
                  {dev.registeredAt 
                    ? new Date(dev.registeredAt).toLocaleString() 
                    : 'Just now'}
                </td>
              </tr>
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
