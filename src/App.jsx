import React, { useState, useEffect } from 'react';
import Billing from './components/Billing';
import Inventory from './components/Inventory';
import Dashboard from './components/Dashboard';
import SuperAdmin from './components/SuperAdmin';

export default function App() {
  const [isBooting, setIsBooting] = useState(true);

  const [activeTab, setActiveTab] = useState('billing');
  const [theme, setTheme] = useState('dark'); 
  const [userRole, setUserRole] = useState('staff'); 
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authData, setAuthData] = useState({ username: '', password: '', storeId: '' });
  const [authError, setAuthError] = useState(''); 
  const [storeDetails, setStoreDetails] = useState({ storeName: 'DRIX POS Platform', storeAddress: '', mobile: '' });
  
  // Cloud & Hardware Settings State
  const [cloudSettings, setCloudSettings] = useState({ metaPhoneId: '', metaAccessToken: '' });
  const [printers, setPrinters] = useState([]);
  const [hardwareConfig, setHardwareConfig] = useState({ thermalPrinter: '', barcodePrinter: '', scanner: '' });
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const bootTimer = setTimeout(() => setIsBooting(false), 2800);
    return () => clearTimeout(bootTimer);
  }, []);

  // Fetch local hardware configs when opening settings
  useEffect(() => {
    if (showSettings) {
      window.posAPI.getPrinters().then(setPrinters);
      window.posAPI.getSettings().then(settings => {
        setHardwareConfig({
          thermalPrinter: settings.thermal_printer || '',
          barcodePrinter: settings.barcode_printer || '',
          scanner: settings.scanner_prefix || ''
        });
      });
    }
  }, [showSettings]);

  const handleWebLogin = async (e) => {
    e.preventDefault();
    setAuthError(''); 
    
    if (authData.username && authData.password && authData.storeId) {
      localStorage.setItem('drix_store_id', authData.storeId);
      
      const res = await window.posAPI.loginUser({ 
        username: authData.username, 
        password: authData.password,
        storeId: authData.storeId 
      });

      if (res.success) {
        setStoreDetails({
          storeName: res.storeName || authData.storeId,
          storeAddress: res.storeAddress || '',
          mobile: res.mobile || ''
        });

        const loadedStore = await window.posAPI.getCloudSettings();
        if (loadedStore) {
          setCloudSettings({ 
            metaPhoneId: loadedStore.metaPhoneId || '', 
            metaAccessToken: loadedStore.metaAccessToken || '' 
          });
        }

        setUserRole(res.user.role); 
        setIsAuthenticated(true);
        if(res.user.role === 'superadmin') setActiveTab('superadmin'); 
      } else {
        localStorage.removeItem('drix_store_id');
        setAuthError(res.error || "Invalid Credentials or Store ID");
      }
    } else {
      setAuthError('Please fill in all credentials.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('drix_store_id');
    setIsAuthenticated(false);
    setUserRole('staff');
    setAuthData({ username: '', password: '', storeId: '' });
    setCloudSettings({ metaPhoneId: '', metaAccessToken: '' });
  };

  // Fast Lock (Keeps Store ID and Username, just asks for password again)
  const handleLock = () => {
    setIsAuthenticated(false);
    setAuthData({ ...authData, password: '' });
  };

  const handleSaveCloudSettings = async () => {
    const res = await window.posAPI.updateCloudSettings({
      metaPhoneId: cloudSettings.metaPhoneId,
      metaAccessToken: cloudSettings.metaAccessToken
    });
    if (res.success) alert('✅ WhatsApp Automation Credentials Saved to DRIX Cloud!');
    else alert('❌ Failed to save settings.');
  };

  const handleHardwareChange = async (key, value) => {
    setHardwareConfig({ ...hardwareConfig, [key]: value });
    
    let settingKey = '';
    if (key === 'thermalPrinter') settingKey = 'thermal_printer';
    if (key === 'barcodePrinter') settingKey = 'barcode_printer';
    if (key === 'scanner') settingKey = 'scanner_prefix';
    
    await window.posAPI.updateSetting(settingKey, value);
  };

  const isDark = theme === 'dark';
  const colors = {
    bg: isDark ? 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)' : 'linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%)',
    sidebarBg: isDark ? 'rgba(20, 20, 20, 0.6)' : 'rgba(255, 255, 255, 0.6)',
    text: isDark ? '#ffffff' : '#1c1c1e',
    textMuted: isDark ? '#a1a1a6' : '#86868b',
    glassBg: isDark ? 'rgba(30, 30, 30, 0.5)' : 'rgba(255, 255, 255, 0.7)',
    glassBorder: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.5)',
    inputBg: isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.9)',
    accentBlue: '#007aff',
    accentGreen: '#34c759',
    accentRed: '#ff3b30'
  };

  const globalStyle = `
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; overflow: hidden; }
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}; border-radius: 4px; }
    
    /* --- CRITICAL ELECTRON INPUT BUG FIX --- */
    input, select, textarea, button {
      -webkit-app-region: no-drag !important; 
      -webkit-user-select: auto !important;
      user-select: auto !important;
    }
    
    @keyframes pulseLogo {
      0% { transform: scale(0.85); opacity: 0; filter: drop-shadow(0 0 0px rgba(0, 198, 255, 0)); }
      50% { transform: scale(1.05); opacity: 1; filter: drop-shadow(0 0 25px rgba(0, 198, 255, 0.6)); }
      100% { transform: scale(1); opacity: 1; filter: drop-shadow(0 0 15px rgba(0, 198, 255, 0.3)); }
    }
    @keyframes fadeTextUp {
      0% { opacity: 0; transform: translateY(20px); }
      100% { opacity: 0.7; transform: translateY(0); }
    }
    @keyframes fadeInApp {
      0% { opacity: 0; transform: scale(0.98); }
      100% { opacity: 1; transform: scale(1); }
    }
  `;

  if (isBooting) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#0f2027', color: '#ffffff' }}>
        <style>{globalStyle}</style>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <h1 style={{ fontSize: '6rem', letterSpacing: '6px', fontWeight: '900', margin: 0, background: '-webkit-linear-gradient(45deg, #007aff, #00c6ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'pulseLogo 2s cubic-bezier(0.25, 1, 0.5, 1) forwards' }}>
            DRIX
          </h1>
        </div>
        <div style={{ paddingBottom: '40px', textAlign: 'center', color: '#a1a1a6', fontSize: '0.9rem', animation: 'fadeTextUp 1.5s ease-out 0.8s forwards', opacity: 0, fontWeight: '500', lineHeight: '1.5' }}>
          © 2026 DRIX Systems. All Rights Reserved.<br/>
          Engineered by Deekshith Mahadev
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: colors.bg, color: colors.text, animation: 'fadeInApp 0.6s ease-out forwards' }}>
        <style>{globalStyle}</style>
        
        <div style={{ zIndex: 1, background: colors.glassBg, padding: '40px', borderRadius: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', width: '360px', backdropFilter: 'blur(30px)', border: `1px solid ${colors.glassBorder}` }}>
          <h1 style={{ textAlign: 'center', margin: '0 0 5px 0', fontSize: '2.5rem', letterSpacing: '2px', fontWeight: '800', background: '-webkit-linear-gradient(45deg, #007aff, #00c6ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            DRIX
          </h1>
          <p style={{ textAlign: 'center', color: colors.textMuted, marginBottom: '30px', fontWeight: '500' }}>Universal Cloud Client</p>
          
          {authError && <div style={{ background: 'rgba(255, 59, 48, 0.1)', color: '#ff3b30', padding: '12px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center', fontWeight: '600', border: '1px solid rgba(255, 59, 48, 0.3)' }}>{authError}</div>}

          <form onSubmit={handleWebLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: colors.textMuted, marginLeft: '5px' }}>Store ID (Provided by DRIX)</label>
              <input type="text" placeholder="e.g. GLAMYES_MASTER" required value={authData.storeId} onChange={(e) => setAuthData({...authData, storeId: e.target.value.toUpperCase()})} style={{ width: '100%', padding: '14px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '12px', color: colors.text, outline: 'none', fontSize: '1rem', boxSizing: 'border-box', marginTop: '5px' }} />
            </div>
            <input type="text" placeholder="Username" required value={authData.username} onChange={(e) => setAuthData({...authData, username: e.target.value})} style={{ padding: '14px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '12px', color: colors.text, outline: 'none', fontSize: '1rem' }} />
            <input type="password" placeholder="Password" required value={authData.password} onChange={(e) => setAuthData({...authData, password: e.target.value})} style={{ padding: '14px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '12px', color: colors.text, outline: 'none', fontSize: '1rem' }} />
            
            <button type="submit" style={{ padding: '15px', background: colors.accentBlue, color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.05rem', marginTop: '10px', transition: 'all 0.3s ease', boxShadow: '0 4px 15px rgba(0, 122, 255, 0.4)' }}>
              Secure Login
            </button>
          </form>
        </div>

        <div style={{ position: 'absolute', bottom: '20px', textAlign: 'center', color: colors.textMuted, fontSize: '0.85rem', opacity: 0.7 }}>
          © 2026 DRIX. All Rights Reserved.<br/>
          Engineered by Deekshith Mahadev
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: colors.bg, transition: 'background 0.5s ease', overflow: 'hidden', position: 'relative', animation: 'fadeInApp 0.4s ease-out forwards' }}>
      <style>{globalStyle}</style>
      
      <nav style={{ width: '260px', background: colors.sidebarBg, backdropFilter: 'blur(40px)', borderRight: `1px solid ${colors.glassBorder}`, display: 'flex', flexDirection: 'column', padding: '25px 0', zIndex: 10 }}>
        <div style={{ padding: '0 20px 20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '800', margin: '0 0 5px 0', background: '-webkit-linear-gradient(45deg, #007aff, #00c6ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>DRIX</h1>
          <div style={{ fontSize: '12px', fontWeight: '600', color: colors.textMuted, background: colors.inputBg, padding: '4px 10px', borderRadius: '20px', display: 'inline-block' }}>{storeDetails.storeName}</div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 15px' }}>
          <button onClick={() => setActiveTab('billing')} style={{ background: activeTab === 'billing' ? colors.glassBg : 'transparent', color: colors.text, border: activeTab === 'billing' ? `1px solid ${colors.glassBorder}` : '1px solid transparent', padding: '14px 20px', borderRadius: '12px', textAlign: 'left', cursor: 'pointer', fontSize: '16px', fontWeight: '600', transition: 'all 0.2s' }}>💰 Cloud Register</button>
          <button onClick={() => setActiveTab('inventory')} style={{ background: activeTab === 'inventory' ? colors.glassBg : 'transparent', color: colors.text, border: activeTab === 'inventory' ? `1px solid ${colors.glassBorder}` : '1px solid transparent', padding: '14px 20px', borderRadius: '12px', textAlign: 'left', cursor: 'pointer', fontSize: '16px', fontWeight: '600', transition: 'all 0.2s' }}>📦 Global Inventory</button>
          <button onClick={() => setActiveTab('dashboard')} style={{ background: activeTab === 'dashboard' ? colors.glassBg : 'transparent', color: colors.text, border: activeTab === 'dashboard' ? `1px solid ${colors.glassBorder}` : '1px solid transparent', padding: '14px 20px', borderRadius: '12px', textAlign: 'left', cursor: 'pointer', fontSize: '16px', fontWeight: '600', transition: 'all 0.2s' }}>📊 Cloud Analytics</button>
          
          {userRole === 'superadmin' && (
            <button onClick={() => setActiveTab('superadmin')} style={{ background: activeTab === 'superadmin' ? colors.glassBg : 'transparent', color: colors.text, border: activeTab === 'superadmin' ? `1px solid ${colors.glassBorder}` : '1px solid transparent', borderLeft: `3px solid ${colors.accentBlue}`, padding: '14px 20px', borderRadius: '12px', textAlign: 'left', cursor: 'pointer', fontSize: '16px', fontWeight: '600', transition: 'all 0.2s', marginTop: '15px' }}>
              👑 DRIX Control Panel
            </button>
          )}
        </div>

        <div style={{ marginTop: 'auto', padding: '20px 15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          
          <button onClick={handleLock} style={{ background: 'transparent', color: colors.textMuted, border: `1px solid ${colors.glassBorder}`, padding: '10px', borderRadius: '12px', cursor: 'pointer', width: '100%', fontWeight: '600', fontSize: '0.9rem', textAlign: 'left' }}>
            🔒 Lock Register
          </button>
          
          <button onClick={() => setShowSettings(true)} style={{ background: colors.glassBg, color: colors.text, border: `1px solid ${colors.glassBorder}`, padding: '12px', borderRadius: '12px', cursor: 'pointer', width: '100%', fontWeight: '600', fontSize: '1rem', marginTop: '5px' }}>
            ⚙️ App Settings
          </button>
          <button onClick={handleLogout} style={{ background: 'rgba(255, 59, 48, 0.1)', color: '#ff3b30', border: '1px solid rgba(255, 59, 48, 0.3)', padding: '12px', borderRadius: '12px', cursor: 'pointer', width: '100%', fontWeight: '600', fontSize: '1rem' }}>
            🚪 Sign Out
          </button>
        </div>
      </nav>

      <main style={{ flex: 1, overflowY: 'auto', zIndex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'billing' && <Billing theme={theme} storeDetails={storeDetails} />}
        {activeTab === 'inventory' && <Inventory theme={theme} />}
        {activeTab === 'dashboard' && <Dashboard theme={theme} setTheme={setTheme} />}
        {activeTab === 'superadmin' && <SuperAdmin theme={theme} />}
      </main>

      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(15px)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: isDark ? '#1c1c1e' : '#ffffff', border: `1px solid ${colors.glassBorder}`, padding: '35px', borderRadius: '24px', width: '500px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', color: colors.text, maxHeight: '90vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
              <h2 style={{ margin: 0, fontWeight: '700' }}>DRIX Configuration</h2>
              <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: colors.textMuted, fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ padding: '20px 0', borderBottom: `1px solid ${colors.glassBorder}` }}>
              <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '15px' }}>Hardware Integrations</strong>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: colors.textMuted }}>Thermal Receipt Printer</label>
                  <select 
                    value={hardwareConfig.thermalPrinter} 
                    onChange={(e) => handleHardwareChange('thermalPrinter', e.target.value)}
                    style={{ width: '100%', padding: '12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, marginTop: '5px' }}>
                    <option value="">-- Select Printer --</option>
                    {printers.map(p => (
                      <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', color: colors.textMuted }}>Barcode Sticker Printer</label>
                  <select 
                    value={hardwareConfig.barcodePrinter} 
                    onChange={(e) => handleHardwareChange('barcodePrinter', e.target.value)}
                    style={{ width: '100%', padding: '12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, marginTop: '5px' }}>
                    <option value="">-- Select Printer --</option>
                    {printers.map(p => (
                      <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', color: colors.textMuted }}>Barcode Scanner Configuration</label>
                  <select 
                    value={hardwareConfig.scanner} 
                    onChange={(e) => handleHardwareChange('scanner', e.target.value)}
                    style={{ width: '100%', padding: '12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, marginTop: '5px' }}>
                    <option value="none">Standard / Plug & Play</option>
                    <option value="prefix_f7">Prefix [F7] Mode</option>
                    <option value="prefix_stx">Prefix [STX] Mode</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ padding: '20px 0', borderBottom: `1px solid ${colors.glassBorder}` }}>
              <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '5px' }}>WhatsApp Cloud API Integration</strong>
              <span style={{ fontSize: '0.85rem', color: colors.textMuted, display: 'block', marginBottom: '15px' }}>Link your Meta Developer credentials to enable automated nightly EOD reporting.</span>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input type="text" placeholder="Meta Phone Number ID" value={cloudSettings.metaPhoneId} onChange={(e) => setCloudSettings({...cloudSettings, metaPhoneId: e.target.value})} style={{ width: '100%', padding: '12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, boxSizing: 'border-box' }} />
                <input type="password" placeholder="Meta Permanent Access Token" value={cloudSettings.metaAccessToken} onChange={(e) => setCloudSettings({...cloudSettings, metaAccessToken: e.target.value})} style={{ width: '100%', padding: '12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, boxSizing: 'border-box' }} />
                <button onClick={handleSaveCloudSettings} style={{ padding: '12px', background: colors.accentBlue, color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Save API Keys to DRIX Cloud</button>
              </div>
            </div>

            {/* RESTORED: Offline Resilience Section with Google Drive Link */}
            <div style={{ padding: '20px 0', borderBottom: `1px solid ${colors.glassBorder}` }}>
              <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '5px' }}>Offline Resilience</strong>
              <span style={{ fontSize: '0.85rem', color: colors.textMuted, display: 'block', marginBottom: '15px' }}>Experiencing internet issues? Download the DRIX Local Desktop Client for offline-first syncing capabilities.</span>
              <a 
                href="https://drive.google.com/file/d/1iu0bI61YF44RASbon-9xxeeoOX4v2VmW/view?usp=sharing" 
                target="_blank" 
                rel="noopener noreferrer" 
                style={{ display: 'inline-block', padding: '10px 15px', background: colors.inputBg, color: colors.text, textDecoration: 'none', borderRadius: '8px', border: `1px solid ${colors.glassBorder}`, fontSize: '0.9rem', fontWeight: 'bold' }}
              >
                ⬇️ Download Desktop App (.exe)
              </a>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: `1px solid ${colors.glassBorder}` }}>
              <div>
                <strong style={{ display: 'block', fontSize: '1.05rem' }}>Appearance Mode</strong>
                <span style={{ fontSize: '0.85rem', color: colors.textMuted }}>Switch between Light and Dark interface.</span>
              </div>
              <button onClick={() => setTheme(isDark ? 'light' : 'dark')} style={{ padding: '8px 16px', borderRadius: '20px', border: `1px solid ${colors.glassBorder}`, background: colors.inputBg, color: colors.text, fontWeight: '600', cursor: 'pointer' }}>
                {isDark ? '☀️ Light' : '🌙 Dark'}
              </button>
            </div>

            <div style={{ textAlign: 'center', marginTop: '20px', color: colors.textMuted, fontSize: '0.8rem', lineHeight: '1.4' }}>
              <strong>DRIX Cloud Software Solutions</strong><br/>
              Developed by Deekshith Mahadev
            </div>

          </div>
        </div>
      )}
    </div>
  );
}