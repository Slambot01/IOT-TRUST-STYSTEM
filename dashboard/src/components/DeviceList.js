import React from 'react';
import TrustScores from './TrustScores';

function DeviceList({ devices, trustScores }) {
  return (
    <div style={{ background: '#16213e', borderRadius: 10, padding: 20 }}>
      <h2 style={{ color: '#00b4d8', marginTop: 0 }}>
        Registered IoT Devices
      </h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #333' }}>
            {['Device ID', 'DID', 'Trust Score & Status', 'Registered At'].map(h => (
              <th key={h} style={{ padding: 10, textAlign: 'left', color: '#888', fontWeight: 'normal' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {devices.map(dev => {
            // Check !== undefined so a valid score of 0 does not fall back to 100
            const score = trustScores[dev.deviceId] !== undefined ? trustScores[dev.deviceId] : (trustScores[dev.deviceId] || 100);
            return (
              <tr key={dev.deviceId} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: 10, color: '#ddd', fontWeight: 'bold' }}>
                  {dev.deviceId}
                </td>
                <td style={{ padding: 10, color: '#00b4d8', fontSize: 12 }}>
                  {dev.did}
                </td>
                <td style={{ padding: 10 }}>
                  <TrustScores score={score} />
                </td>
                <td style={{ padding: 10, color: '#555', fontSize: 11 }}>
                  {dev.registeredAt 
                    ? new Date(dev.registeredAt).toLocaleString() 
                    : 'Just now'}
                </td>
              </tr>
            );
          })}
          {devices.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#555' }}>
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
