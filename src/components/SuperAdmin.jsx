import React, { useState, useEffect } from 'react';

export default function SuperAdmin({ theme }) {
  const [stores, setStores] = useState([]);
  // NEW: Added storeAddress and mobile to the form state
  const [formData, setFormData] = useState({ storeName: '', storeId: '', storeAddress: '', mobile: '', username: '', password: '' });

  const isDark = theme === 'dark';
  const colors = {
    text: isDark ? '#ffffff' : '#1c1c1e',
    textMuted: isDark ? '#a1a1a6' : '#86868b',
    glassBg: isDark ? 'rgba(30, 30, 30, 0.4)' : 'rgba(255, 255, 255, 0.5)',
    glassBorder: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.5)',
    inputBg: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.7)',
    accentBlue: '#007aff',
    accentRed: '#ff3b30',
    accentGreen: '#34c759'
  };

  const loadStores = async () => {
    const data = await window.posAPI.getAllStores();
    setStores(data || []);
  };

  useEffect(() => { loadStores(); }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNameChange = (e) => {
    const name = e.target.value;
    const generatedId = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() + '_' + Math.floor(1000 + Math.random() * 9000);
    setFormData({ ...formData, storeName: name, storeId: generatedId });
  };

  const handleCreateClient = async (e) => {
    e.preventDefault();
    const res = await window.posAPI.createClientStore(formData);
    if (res.success) {
      alert("New Client Successfully Generated!");
      setFormData({ storeName: '', storeId: '', storeAddress: '', mobile: '', username: '', password: '' });
      loadStores();
    } else {
      alert(res.error || "Failed to create client.");
    }
  };

  const toggleSubscription = async (storeId, currentStatus) => {
    const confirmMessage = currentStatus 
      ? "Are you sure you want to suspend this client? They will be locked out immediately."
      : "Reactivate this client's subscription?";
      
    if (window.confirm(confirmMessage)) {
      await window.posAPI.toggleStoreSubscription(storeId, !currentStatus);
      loadStores();
    }
  };

  return (
    <div style={{ padding: '30px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', width: '100%', boxSizing: 'border-box' }}>
      <h2 style={{ color: colors.text, marginTop: 0, borderBottom: `1px solid ${colors.glassBorder}`, paddingBottom: '15px' }}>
        👑 DRIX Global Operations Panel
      </h2>

      <div style={{ display: 'flex', gap: '30px', marginTop: '30px' }}>
        
        {/* NEW CLIENT GENERATOR */}
        <div style={{ flex: 1, background: colors.glassBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '16px', padding: '25px', color: colors.text }}>
          <h3 style={{ marginTop: 0 }}>Onboard New Client</h3>
          <form onSubmit={handleCreateClient} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: colors.textMuted }}>Boutique/Shop Name:</label>
              <input type="text" name="storeName" value={formData.storeName} onChange={handleNameChange} required style={{ width: '100%', padding: '12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, marginTop: '5px' }} />
            </div>
            
            {/* NEW: ADDRESS AND MOBILE FIELDS */}
            <div>
              <label style={{ fontSize: '0.85rem', color: colors.textMuted }}>Shop Address (For Receipts):</label>
              <input type="text" name="storeAddress" value={formData.storeAddress} onChange={handleChange} required style={{ width: '100%', padding: '12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, marginTop: '5px' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: colors.textMuted }}>Contact Number:</label>
              <input type="text" name="mobile" value={formData.mobile} onChange={handleChange} required style={{ width: '100%', padding: '12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, marginTop: '5px' }} />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', color: colors.textMuted }}>Auto-Generated Store ID (Immutable):</label>
              <input type="text" value={formData.storeId} readOnly style={{ width: '100%', padding: '12px', background: isDark ? 'rgba(0,0,0,0.6)' : '#eee', border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.accentBlue, fontWeight: 'bold', marginTop: '5px' }} />
            </div>
            <div style={{ display: 'flex', gap: '15px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.85rem', color: colors.textMuted }}>Admin Username:</label>
                <input type="text" name="username" value={formData.username} onChange={handleChange} required style={{ width: '100%', padding: '12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, marginTop: '5px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.85rem', color: colors.textMuted }}>Admin Password:</label>
                <input type="text" name="password" value={formData.password} onChange={handleChange} required style={{ width: '100%', padding: '12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, marginTop: '5px' }} />
              </div>
            </div>
            <button type="submit" style={{ padding: '15px', background: colors.accentBlue, color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' }}>
              Generate Client & Provision Cloud Database
            </button>
          </form>
        </div>

        {/* ACTIVE SUBSCRIPTIONS */}
        <div style={{ flex: 2, background: colors.glassBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '16px', padding: '25px', color: colors.text, overflowY: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>Active SaaS Clients</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: '15px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.glassBorder}` }}>
                <th style={{ padding: '10px' }}>Shop Name</th>
                <th style={{ padding: '10px' }}>Store ID</th>
                <th style={{ padding: '10px' }}>Login Creds</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Subscription</th>
              </tr>
            </thead>
            <tbody>
              {stores.map(store => (
                <tr key={store.storeId} style={{ borderBottom: `1px solid ${colors.glassBorder}` }}>
                  <td style={{ padding: '15px', fontWeight: 'bold' }}>{store.storeName}</td>
                  <td style={{ padding: '15px', fontFamily: 'monospace', color: colors.textMuted }}>{store.storeId}</td>
                  <td style={{ padding: '15px' }}>
                    <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>User: <span style={{ color: colors.text, fontWeight: 'bold' }}>{store.username}</span></div>
                    <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>Pass: <span style={{ color: colors.text, fontWeight: 'bold' }}>{store.password}</span></div>
                  </td>
                  <td style={{ padding: '15px', textAlign: 'center' }}>
                    <button 
                      onClick={() => toggleSubscription(store.storeId, store.subscriptionActive)}
                      style={{ 
                        padding: '8px 16px', 
                        background: store.subscriptionActive ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)', 
                        color: store.subscriptionActive ? colors.accentGreen : colors.accentRed, 
                        border: `1px solid ${store.subscriptionActive ? colors.accentGreen : colors.accentRed}`, 
                        borderRadius: '20px', 
                        cursor: 'pointer', 
                        fontWeight: 'bold' 
                      }}>
                      {store.subscriptionActive ? 'Active' : 'Suspended'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}