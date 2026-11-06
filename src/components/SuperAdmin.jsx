import React, { useState, useEffect } from 'react';

export default function SuperAdmin({ theme }) {
  const [stores, setStores] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    storeName: '',
    storeId: '',
    storeAddress: '',
    mobile: '',
    username: '',
    password: ''
  });

  const notify = (msg, type = 'info') => {
    if (window.drixNotify) window.drixNotify(msg, type);
  };

  const loadStores = async () => {
    const data = await window.posAPI.getAllStores();
    setStores(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    loadStores();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNameChange = (e) => {
    const name = e.target.value;
    const cleanPrefix = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);
    const generatedId = cleanPrefix ? `${cleanPrefix}_${Math.floor(1000 + Math.random() * 9000)}` : '';
    setFormData({ ...formData, storeName: name, storeId: generatedId });
  };

  const handleCreateClient = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    const res = await window.posAPI.createClientStore(formData);
    setIsSubmitting(false);

    if (res.success) {
      notify(`Provisioned new client store: ${formData.storeName}!`, 'success');
      setFormData({ storeName: '', storeId: '', storeAddress: '', mobile: '', username: '', password: '' });
      loadStores();
    } else {
      notify(res.error || 'Failed to create client.', 'error');
    }
  };

  const toggleSubscription = (storeId, currentStatus, storeName) => {
    const confirmMessage = currentStatus
      ? `Suspend "${storeName}" (${storeId})? Their register login will be locked immediately.`
      : `Reactivate subscription for "${storeName}" (${storeId})?`;

    if (window.drixConfirm) {
      window.drixConfirm(
        confirmMessage,
        async () => {
          await window.posAPI.toggleStoreSubscription(storeId, !currentStatus);
          notify(`Updated subscription status for ${storeName}.`, 'success');
          loadStores();
        },
        currentStatus ? 'Suspend Client Store' : 'Reactivate Client Store'
      );
    }
  };

  const isDark = theme === 'dark';
  const colors = {
    text: isDark ? '#f8fafc' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    glassBg: isDark ? 'rgba(22, 30, 46, 0.65)' : 'rgba(255, 255, 255, 0.85)',
    glassBorder: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(15, 23, 42, 0.1)',
    inputBg: isDark ? 'rgba(9, 13, 22, 0.6)' : 'rgba(255, 255, 255, 0.95)',
    accentBlue: '#3b82f6',
    accentRed: '#ef4444',
    accentGreen: '#10b981'
  };

  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    background: colors.inputBg,
    border: `1px solid ${colors.glassBorder}`,
    borderRadius: '10px',
    color: colors.text,
    marginTop: '5px',
    outline: 'none'
  };

  return (
    <div style={{ padding: '26px', width: '100%', boxSizing: 'border-box' }}>
      <h2 style={{ color: colors.text, marginTop: 0, borderBottom: `1px solid ${colors.glassBorder}`, paddingBottom: '14px', fontWeight: '800' }}>
        👑 DRIX Global Multi-Tenant Control Panel
      </h2>

      <div style={{ display: 'flex', gap: '24px', marginTop: '24px' }}>
        <div style={{ flex: 1, background: colors.glassBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '18px', padding: '24px', color: colors.text }}>
          <h3 style={{ marginTop: 0 }}>Onboard New Retail Client</h3>
          <form onSubmit={handleCreateClient} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: colors.textMuted, fontWeight: '600' }}>Boutique / Shop Name</label>
              <input type="text" name="storeName" value={formData.storeName} onChange={handleNameChange} required style={inputStyle} />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: colors.textMuted, fontWeight: '600' }}>Shop Address (Printed on Receipts)</label>
              <input type="text" name="storeAddress" value={formData.storeAddress} onChange={handleChange} required style={inputStyle} />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: colors.textMuted, fontWeight: '600' }}>Owner WhatsApp Mobile (10 Digits)</label>
              <input type="text" name="mobile" value={formData.mobile} onChange={handleChange} required style={inputStyle} />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: colors.textMuted, fontWeight: '600' }}>Auto-Generated Store ID</label>
              <input type="text" value={formData.storeId} readOnly style={{ ...inputStyle, color: colors.accentBlue, fontWeight: '800', fontFamily: 'monospace' }} />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.8rem', color: colors.textMuted, fontWeight: '600' }}>Admin Username</label>
                <input type="text" name="username" value={formData.username} onChange={handleChange} required style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.8rem', color: colors.textMuted, fontWeight: '600' }}>Admin Password</label>
                <input type="text" name="password" value={formData.password} onChange={handleChange} required style={inputStyle} />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="drix-btn"
              style={{ padding: '14px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '800', marginTop: '8px' }}
            >
              {isSubmitting ? 'Provisioning Tenant...' : 'Provision Tenant Database →'}
            </button>
          </form>
        </div>

        <div style={{ flex: 1.8, background: colors.glassBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '18px', padding: '24px', color: colors.text, overflowY: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>Active SaaS Tenants ({stores.length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: '14px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted, fontSize: '0.8rem' }}>
                <th style={{ padding: '12px' }}>STORE</th>
                <th style={{ padding: '12px' }}>STORE ID</th>
                <th style={{ padding: '12px' }}>CREDENTIALS</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => (
                <tr key={store.storeId} style={{ borderBottom: `1px solid ${colors.glassBorder}` }}>
                  <td style={{ padding: '14px', fontWeight: '700' }}>
                    {store.storeName}
                    <div style={{ fontSize: '0.75rem', color: colors.textMuted, fontWeight: '400' }}>{store.mobile || 'No phone'}</div>
                  </td>
                  <td style={{ padding: '14px', fontFamily: 'monospace', color: colors.accentBlue, fontWeight: '700' }}>{store.storeId}</td>
                  <td style={{ padding: '14px', fontSize: '0.82rem' }}>
                    <div>User: <strong>{store.username}</strong></div>
                    <div>Pass: <strong>{store.password}</strong></div>
                  </td>
                  <td style={{ padding: '14px', textAlign: 'center' }}>
                    <button
                      type="button"
                      className="drix-btn"
                      onClick={() => toggleSubscription(store.storeId, store.subscriptionActive, store.storeName)}
                      style={{
                        padding: '7px 16px',
                        background: store.subscriptionActive ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
                        color: store.subscriptionActive ? colors.accentGreen : colors.accentRed,
                        border: `1px solid ${store.subscriptionActive ? colors.accentGreen : colors.accentRed}`,
                        borderRadius: '99px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '0.82rem'
                      }}
                    >
                      {store.subscriptionActive ? '● Active' : '● Suspended'}
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