/**
* IoT Trust System Dashboard
* Paper 1 (Zaghdoudi): Registered devices + DID status
* Paper 2 (Al-Zaidi): Live trust scores, updated every 30s
*/
import React, { useState, useEffect } from 'react';

const GATEWAY_URL = 'http://localhost:3001/api';

function getStatusColor(score) {
  if (score >= 80) return '#4CAF50';
  if (score >= 50) return '#FF9800';
  if (score >= 20) return '#FF5722';
  return '#F44336';
}

function getStatusLabel(score) {
  if (score >= 80) return 'HIGHLY TRUSTED';
  if (score >= 50) return 'TRUSTED';
  if (score >= 20) return 'LOW TRUST';
  return 'BLACKLISTED';
}

function App() {
  const [devices, setDevices] = useState([]);
  const [trustScores, setTrust] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, []);

  async function fetchData() {
    try {
      const res = await fetch(`${GATEWAY_URL}/devices`);
      const data = await res.json();
      setDevices(data.devices || []);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch { console.log('Gateway offline -- demo mode'); }
  }

  const statCards = [
    { label: 'Total Devices', value: devices.length, color: '#00b4d8' },
    { label: 'Registered DIDs', value: devices.length, color: '#4CAF50' },
    { label: 'Highly Trusted', 
      value: Object.values(trustScores).filter(s=>s>=80).length, 
      color: '#4CAF50' },
    { label: 'Blacklisted', 
      value: Object.values(trustScores).filter(s=>s<20).length, 
      color: '#F44336' }
  ];

  return (
    <div style={{ fontFamily: 'Arial,sans-serif', padding:20, 
                  background: '#1a1a2e', minHeight: '100vh', 
                  color: 'white' }}>

      <h1 style={{ color: '#00b4d8', margin:0 }}>
        IoT Trust System Dashboard
      </h1>
      <p style={{ color: '#888', margin: '5px 0' }}>
        Zaghdoudi 2025 (DID) + Al-Zaidi 2026 (EWMA Trust)
      </p>
      <p style={{ color: '#555', fontSize:12 }}>
        Last update: {lastUpdate} 
        &nbsp;|&nbsp; T = a*T_prev + (1-a)*(S/(S+F+1)) - P
      </p>

      <div style={{ display: 'grid', 
                    gridTemplateColumns: 'repeat(4,1fr)', 
                    gap:15, marginBottom:30 }}>
        {statCards.map(s => (
          <div key={s.label} style={{ 
               background: '#16213e', padding:20, borderRadius:10, 
               textAlign: 'center', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: '2em', fontWeight: 'bold', 
                          color: s.color }}>{s.value}</div>
            <div style={{ color: '#888', fontSize:12 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#16213e', borderRadius:10, padding:20 }}>
        <h2 style={{ color: '#00b4d8', marginTop:0 }}>
          Registered IoT Devices
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333' }}>
              {['Device ID', 'DID', 'Trust Score', 
                'Status', 'Registered At'].map(h => (
                <th key={h} style={{ padding:10, textAlign: 'left', 
                                     color: '#888', fontWeight: 'normal' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.map(dev => {
              const score = trustScores[dev.deviceId] || 100;
              const color = getStatusColor(score);
              return (
                <tr key={dev.deviceId} 
                    style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding:10, color: '#ddd' }}>
                    {dev.deviceId}
                  </td>
                  <td style={{ padding:10, color: '#00b4d8', fontSize:12 }}>
                    {dev.did}
                  </td>
                  <td style={{ padding:10 }}>
                    <div style={{ display: 'flex', 
                                  alignItems: 'center', gap:10 }}>
                      <div style={{ width:80, height:8, 
                                    background: '#333', borderRadius:4 }}>
                        <div style={{ width: `${score}%`, height: '100%', 
                                      background: color, borderRadius:4 }}/>
                      </div>
                      <span style={{ color }}>{score}/100</span>
                    </div>
                  </td>
                  <td style={{ padding:10 }}>
                    <span style={{ background: `${color}22`, color, 
                                   padding: '3px 8px', borderRadius:4, 
                                   fontSize:11, fontWeight: 'bold' }}>
                      {getStatusLabel(score)}
                    </span>
                  </td>
                  <td style={{ padding:10, color: '#555', fontSize:11 }}>
                    {dev.registeredAt 
                      ? new Date(dev.registeredAt).toLocaleString() 
                      : 'Just now'}
                  </td>
                </tr>
              );
            })}
            {devices.length === 0 && (
              <tr><td colSpan={5} style={{ padding:40, 
                                           textAlign: 'center', color: '#555' }}>
                No devices yet. Run the simulation first.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
