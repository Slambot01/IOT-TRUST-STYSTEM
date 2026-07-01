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
    { label: 'Total Devices', value: devices.length, color: '#00b4d8' },
    { label: 'Registered DIDs', value: devices.length, color: '#4CAF50' },
    { label: 'Highly Trusted', 
      value: Object.values(trustScores).filter(s => s >= 80).length, 
      color: '#4CAF50' },
    { label: 'Blacklisted', 
      value: Object.values(trustScores).filter(s => s < 20).length, 
      color: '#F44336' }
  ];

  return (
    <div style={{ fontFamily: 'Arial,sans-serif', padding: 20, 
                  background: '#1a1a2e', minHeight: '100vh', 
                  color: 'white' }}>

      <h1 style={{ color: '#00b4d8', margin: 0 }}>
        IoT Trust System Dashboard
      </h1>
      <p style={{ color: '#888', margin: '5px 0' }}>
        Zaghdoudi 2025 (DID) + Al-Zaidi 2026 (EWMA Trust)
      </p>
      <p style={{ color: '#555', fontSize: 12 }}>
        Last update: {lastUpdate} 
        &nbsp;|&nbsp; T = a*T_prev + (1-a)*(S/(S+F+1)) - P
      </p>

      <div style={{ display: 'grid', 
                    gridTemplateColumns: 'repeat(4,1fr)', 
                    gap: 15, marginBottom: 30 }}>
        {statCards.map(s => (
          <div key={s.label} style={{ 
               background: '#16213e', padding: 20, borderRadius: 10, 
               textAlign: 'center', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: '2em', fontWeight: 'bold', 
                          color: s.color }}>{s.value}</div>
            <div style={{ color: '#888', fontSize: 12 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <DeviceList devices={devices} trustScores={trustScores} />
    </div>
  );
}

export default App;
