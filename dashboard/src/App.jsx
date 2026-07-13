/**
 * IoT Trust System Dashboard
 * Paper 1 (Zaghdoudi): Registered devices + DID status
 * Paper 2 (Al-Zaidi): Live trust scores, updated every 3s
 */
import React, { useState, useEffect } from 'react';
import DeviceList from './components/DeviceList';

const GATEWAY_URL = 'http://localhost:3001/api';
const TRUST_API_URL = 'http://localhost:3002/api';

function App() {
  const [devices, setDevices] = useState([]);
  const [trustScores, setTrust] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 3000);
    return () => clearInterval(id);
  }, []);

  async function fetchData() {
    try {
      const devRes = await fetch(`${GATEWAY_URL}/devices`);
      const devData = await devRes.json();
      setDevices(devData.devices || []);
    } catch {
      console.log('Gateway offline');
    }
    try {
      const trustRes = await fetch(`${TRUST_API_URL}/trust/all`);
      const trustData = await trustRes.json();
      const scoreMap = {};
      trustData.forEach(item => {
        scoreMap[item.deviceId] = Math.round(item.score * 100);
      });
      setTrust(scoreMap);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch {
      console.log('Trust API offline');
    }
  }

  const statCards = [
    { label: 'Total Devices', value: devices.length, color: '#2563EB' }, // Primary blue
    { label: 'Registered DIDs', value: devices.length, color: '#16A34A' }, // Success green
    { label: 'Highly Trusted', 
      value: Object.values(trustScores).filter(s => s >= 80).length, 
      color: '#16A34A' },
    { label: 'Blacklisted', 
      value: Object.values(trustScores).filter(s => s < 20).length, 
      color: '#DC2626' } // Danger red
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
            Zaghdoudi 2025 (DID) + Al-Zaidi 2026 (EWMA Trust)
          </p>
          <div style={{ 
            color: '#9CA3AF', 
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>Last update: {lastUpdate}</span>
            <span>|</span>
            <span style={{ fontFamily: 'monospace', background: '#E5E7EB', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', color: '#6B7280' }}>
              T = a*T_prev + (1-a)*(S/(S+F+1)) - P
            </span>
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

        <DeviceList devices={devices} trustScores={trustScores} />
      </div>
    </div>
  );
}

export default App;
