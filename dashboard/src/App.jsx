import React, { useState, useEffect } from 'react';
import DeviceList from './components/DeviceList';

const GATEWAY_URL = 'http://localhost:3001/api';
const TRUST_API_URL = 'http://localhost:3002/api';

function App() {
  const [devices, setDevices] = useState([]);
  const [trustData, setTrustData] = useState({});
  const [comparisonData, setComparisonData] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    fetchData();
    fetchComparisonData();
    const id = setInterval(fetchData, 3000);
    return () => clearInterval(id);
  }, []);

  async function fetchComparisonData() {
    try {
      const res = await fetch(`${TRUST_API_URL}/trust/v2/comparison`);
      if (res.ok) {
        const data = await res.json();
        setComparisonData(data);
      }
    } catch {
      console.log('Comparison API offline');
    }
  }

  async function fetchData() {
    try {
      const devRes = await fetch(`${GATEWAY_URL}/devices`);
      if (devRes.ok) {
        const devData = await devRes.json();
        setDevices(devData.devices || []);
      }
    } catch {
      console.log('Gateway offline');
    }
    try {
      const trustRes = await fetch(`${TRUST_API_URL}/trust/v2/all`);
      if (trustRes.ok) {
        const tData = await trustRes.json();
        const scoreMap = {};
        tData.forEach(item => {
          scoreMap[item.deviceId] = item;
        });
        setTrustData(scoreMap);
        setLastUpdate(new Date().toLocaleTimeString());
      }
    } catch {
      console.log('Trust API offline');
    }
  }

  const trustValues = Object.values(trustData);
  const totalDevices = trustValues.length || devices.length;
  const statCards = [
    { label: 'Total Devices', value: totalDevices, color: '#2563EB' },
    { label: 'Full Access', value: trustValues.filter(d => d.tier === 'FULL_ACCESS').length, color: '#16A34A' },
    { label: 'Quarantined', value: trustValues.filter(d => d.tier === 'QUARANTINED').length, color: '#EA580C' },
    { label: 'Revoked', value: trustValues.filter(d => d.tier === 'REVOKED').length, color: '#DC2626' }
  ];

  return (
    <div style={{ 
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', 
      padding: '40px', 
      background: '#F8F9FA', 
      minHeight: '100vh', 
      color: '#111827' 
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ color: '#111827', margin: '0 0 8px 0', fontSize: '28px', fontWeight: '600' }}>
            IoT Trust System Dashboard
          </h1>
          <p style={{ color: '#6B7280', margin: '0 0 12px 0', fontSize: '15px' }}>
            Phase 2: Multi-Parametric Behavioral Trust (Al-Zaidi 2026 Extension)
          </p>
          <div style={{ 
            color: '#9CA3AF', 
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>Last update: {lastUpdate}</span>
          </div>
        </div>

        <div style={{ display: 'grid', 
                      gridTemplateColumns: 'repeat(4,1fr)', 
                      gap: '24px', marginBottom: '40px' }}>
          {statCards.map(s => (
            <div key={s.label} style={{ 
                 background: '#FFFFFF', 
                 padding: '24px', 
                 borderRadius: '10px', 
                 border: '1px solid #E5E7EB',
                 boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                 display: 'flex',
                 flexDirection: 'column',
                 gap: '8px'
            }}>
              <div style={{ fontSize: '32px', fontWeight: '700', 
                            color: s.color, lineHeight: '1' }}>{s.value}</div>
              <div style={{ color: '#6B7280', fontSize: '14px', fontWeight: '500' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {comparisonData && (
          <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: '10px', border: '1px solid #E5E7EB', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginTop: 0, marginBottom: '8px' }}>
              Phase 1 vs Phase 2 Detection Comparison (Slow Poison Attack)
            </h2>
            <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '16px', lineHeight: '1.5' }}>
              <strong>Phase 1 Avg Detection:</strong> {typeof comparisonData.summary.p1_avg_detection_cycle === 'number' ? comparisonData.summary.p1_avg_detection_cycle.toFixed(1) + ' cycles' : 'N/A (never detected)'} | <strong>Fails:</strong> {comparisonData.summary.p1_fails}/{comparisonData.summary.total_devices}
              <br/>
              <strong>Phase 2 Avg Detection:</strong> {typeof comparisonData.summary.p2_avg_detection_cycle === 'number' ? comparisonData.summary.p2_avg_detection_cycle.toFixed(1) + ' cycles' : 'N/A (never detected)'} | <strong>Fails:</strong> {comparisonData.summary.p2_fails}/{comparisonData.summary.total_devices}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', textAlign: 'left', fontSize: '12px', color: '#6B7280' }}>
                  <th style={{ padding: '8px 12px' }}>Device ID</th>
                  <th style={{ padding: '8px 12px' }}>P1 Detection Cycle</th>
                  <th style={{ padding: '8px 12px' }}>P2 Detection Cycle</th>
                  <th style={{ padding: '8px 12px' }}>P1 Final Score</th>
                  <th style={{ padding: '8px 12px' }}>P2 Final Score</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.devices.map(d => (
                  <tr key={d.device_id} style={{ borderBottom: '1px solid #E5E7EB', fontSize: '13px' }}>
                    <td style={{ padding: '8px 12px', fontWeight: '500' }}>{d.device_id}</td>
                    <td style={{ padding: '8px 12px', color: d.p1_detection ? '#16A34A' : '#DC2626', fontWeight: '600' }}>
                      {d.p1_detection || 'Failed'}
                    </td>
                    <td style={{ padding: '8px 12px', color: d.p2_detection ? '#16A34A' : '#DC2626', fontWeight: '600' }}>
                      {d.p2_detection || 'Failed'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>{(d.p1_final_score * 100).toFixed(1)}%</td>
                    <td style={{ padding: '8px 12px' }}>{d.p2_final_score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DeviceList devices={devices} trustData={trustData} />
      </div>
    </div>
  );
}

export default App;
