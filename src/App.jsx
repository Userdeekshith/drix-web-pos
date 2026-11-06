import React, { useState, useEffect, useCallback } from 'react';
import Billing from './components/Billing';
import Inventory from './components/Inventory';
import Dashboard from './components/Dashboard';
import SuperAdmin from './components/SuperAdmin';

const isElectron =
  (typeof window !== 'undefined' && window.drixUpdater?.isDesktop) ||
  (typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron'));

export default function App() {
  const [isBooting, setIsBooting] = useState(true);
  const [activeTab, setActiveTab] = useState('billing');
  const [theme, setTheme] = useState('dark');
  const [userRole, setUserRole] = useState('staff');

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authData, setAuthData] = useState({ username: '', password: '', storeId: '' });
  const [authError, setAuthError] = useState('');
  const [storeDetails, setStoreDetails] = useState({ storeName: 'DRIX POS Platform', storeAddress: '', mobile: '' });

  // Network & Offline Queue State
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Settings & Account States
  const [showSettings, setShowSettings] = useState(false);
  const [cloudSettings, setCloudSettings] = useState({ metaPhoneId: '', metaAccessToken: '' });
  const [accountForm, setAccountForm] = useState({ storeName: '', storeAddress: '', username: '', password: '' });
  const [printers, setPrinters] = useState([]);
  const [hardwareConfig, setHardwareConfig] = useState({ thermalPrinter: '', barcodePrinter: '', scanner: '' });
  const [savingSettings, setSavingSettings] = useState(false);

  // Live Auto-Updater State (Electron + GitHub Releases)
  const [appVersion, setAppVersion] = useState('2.0.0');
  const [updateInfo, setUpdateInfo] = useState({
    status: 'idle', // idle | checking | available | not-available | downloading | downloaded | error
    version: '',
    percent: 0,
    message: 'Click Check for Updates to scan GitHub Releases.'
  });

  // Global Non-Blocking Toast & Confirmation Modal State
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const showToast = useCallback((text, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const askConfirm = useCallback((message, onConfirm, title = 'Confirm Action') => {
    setConfirmDialog({ title, message, onConfirm });
  }, []);

  // Register global helpers & override native window.alert so Electron NEVER loses input focus
  useEffect(() => {
    window.drixNotify = showToast;
    window.drixConfirm = askConfirm;
    window.alert = (msg) => showToast(String(msg), 'info');
  }, [showToast, askConfirm]);

  useEffect(() => {
    const bootTimer = setTimeout(() => setIsBooting(false), 1800);
    return () => clearTimeout(bootTimer);
  }, []);

  // Track Online/Offline status & Pending Queue
  const refreshQueueCount = useCallback(async () => {
    if (window.posAPI?.getPendingSalesCount) {
      const count = await window.posAPI.getPendingSalesCount();
      setPendingCount(count);
    }
  }, []);

  useEffect(() => {
    refreshQueueCount();
    const onOnline = () => {
      setIsOnline(true);
      showToast('Cloud connection restored!', 'success');
      refreshQueueCount();
    };
    const onOffline = () => {
      setIsOnline(false);
      showToast('Switched to Offline Vault Mode. Sales will queue locally.', 'warning');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('drix-queue-updated', refreshQueueCount);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('drix-queue-updated', refreshQueueCount);
    };
  }, [refreshQueueCount, showToast]);

  // Listen to Electron Auto-Updater Events
  useEffect(() => {
    if (window.drixUpdater) {
      window.drixUpdater.getVersion().then((v) => v && setAppVersion(v)).catch(() => {});
      const unsubscribe = window.drixUpdater.onUpdateStatus((data) => {
        setUpdateInfo((prev) => ({ ...prev, ...data }));
        if (data.status === 'available') {
          showToast(`New DRIX Update v${data.version} is available!`, 'info');
        } else if (data.status === 'downloaded') {
          showToast(`Update v${data.version} downloaded! Ready to install.`, 'success');
        }
      });
      return unsubscribe;
    }
  }, [showToast]);

  useEffect(() => {
    if (showSettings) {
      window.posAPI.getPrinters().then(setPrinters);
      window.posAPI.getSettings().then((settings) => {
        setHardwareConfig({
          thermalPrinter: settings.thermal_printer || '',
          barcodePrinter: settings.barcode_printer || '',
          scanner: settings.scanner_prefix || ''
        });
      });
      setAccountForm({
        storeName: storeDetails.storeName,
        storeAddress: storeDetails.storeAddress,
        username: authData.username,
        password: ''
      });
    }
  }, [showSettings, storeDetails, authData.username]);

  const handleWebLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!authData.username || !authData.password || !authData.storeId) {
      setAuthError('Please enter Store ID, Username, and Password.');
      return;
    }

    setIsLoggingIn(true);
    localStorage.setItem('drix_store_id', authData.storeId.trim().toUpperCase());

    const res = await window.posAPI.loginUser({
      username: authData.username.trim(),
      password: authData.password,
      storeId: authData.storeId.trim().toUpperCase()
    });
    setIsLoggingIn(false);

    if (res.success) {
      const activeName = res.storeName || authData.storeId;
      const activeAddress = res.storeAddress || '';
      setStoreDetails({
        storeName: activeName,
        storeAddress: activeAddress,
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
      refreshQueueCount();
      if (res.user.role === 'superadmin') setActiveTab('superadmin');
      showToast(`Welcome back to ${activeName}`, 'success');
    } else {
      localStorage.removeItem('drix_store_id');
      setAuthError(res.error || 'Invalid Credentials or Store ID');
    }
  };

  const handleQuickSync = async () => {
    if (!navigator.onLine) {
      return showToast('Connect to Wi-Fi first to sync offline bills.', 'error');
    }
    setIsSyncing(true);
    const res = await window.posAPI.syncPendingSales();
    setIsSyncing(false);
    refreshQueueCount();
    if (res.success) {
      showToast(`Synced ${res.count} offline bill(s) to DRIX Cloud!`, 'success');
      window.dispatchEvent(new Event('drix-sync-complete'));
    } else {
      showToast(`Synced ${res.count}, but ${res.remaining} bill(s) remain queued.`, 'warning');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('drix_store_id');
    setIsAuthenticated(false);
    setUserRole('staff');
    setAuthData({ username: '', password: '', storeId: '' });
    setCloudSettings({ metaPhoneId: '', metaAccessToken: '' });
  };

  const handleLock = () => {
    setIsAuthenticated(false);
    setAuthData({ ...authData, password: '' });
    showToast('Register locked.', 'info');
  };

  const handleSaveAccountProfile = async () => {
    setSavingSettings(true);
    const res = await window.posAPI.updateStoreProfile({
      storeName: accountForm.storeName,
      storeAddress: accountForm.storeAddress,
      username: accountForm.username,
      password: accountForm.password || undefined
    });
    setSavingSettings(false);

    if (res.success) {
      setStoreDetails((prev) => ({
        ...prev,
        storeName: accountForm.storeName,
        storeAddress: accountForm.storeAddress
      }));
      setAuthData((prev) => ({
        ...prev,
        username: accountForm.username
      }));
      showToast('Store profile & credentials updated across all receipts!', 'success');
    } else {
      showToast('Failed to update account: ' + (res.error || 'Unknown error'), 'error');
    }
  };

  const handleSaveCloudSettings = async () => {
    setSavingSettings(true);
    const res = await window.posAPI.updateCloudSettings({
      metaPhoneId: cloudSettings.metaPhoneId,
      metaAccessToken: cloudSettings.metaAccessToken
    });
    setSavingSettings(false);
    if (res.success) showToast('WhatsApp Cloud API credentials saved!', 'success');
    else showToast('Failed to save WhatsApp settings.', 'error');
  };

  const handleHardwareChange = async (key, value) => {
    setHardwareConfig({ ...hardwareConfig, [key]: value });
    let settingKey = '';
    if (key === 'thermalPrinter') settingKey = 'thermal_printer';
    if (key === 'barcodePrinter') settingKey = 'barcode_printer';
    if (key === 'scanner') settingKey = 'scanner_prefix';
    await window.posAPI.updateSetting(settingKey, value);
    showToast('Hardware preference saved.', 'success');
  };

  // Manual GitHub Release Update Check (Works in Electron & falls back gracefully)
  const handleCheckUpdates = async () => {
    if (window.drixUpdater) {
      setUpdateInfo((prev) => ({ ...prev, status: 'checking', message: 'Checking GitHub Releases...' }));
      await window.drixUpdater.checkForUpdates();
    } else {
      showToast('Web client updates automatically via Vercel!', 'info');
    }
  };

  const isDark = theme === 'dark';
  const colors = {
    bg: isDark
      ? 'radial-gradient(circle at 15% 15%, #162238 0%, #0a0f1d 55%, #060911 100%)'
      : 'linear-gradient(135deg, #f5f7fa 0%, #e4ecf7 100%)',
    sidebarBg: isDark ? 'rgba(13, 18, 30, 0.78)' : 'rgba(255, 255, 255, 0.82)',
    text: isDark ? '#f8fafc' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    glassBg: isDark ? 'rgba(22, 30, 46, 0.65)' : 'rgba(255, 255, 255, 0.85)',
    glassBorder: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(15, 23, 42, 0.1)',
    inputBg: isDark ? 'rgba(9, 13, 22, 0.65)' : 'rgba(255, 255, 255, 0.95)',
    accentBlue: '#3b82f6',
    accentCyan: '#06b6d4',
    accentGreen: '#10b981',
    accentOrange: '#f59e0b',
    accentRed: '#ef4444'
  };

  const globalStyle = `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow: hidden; -webkit-font-smoothing: antialiased; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'}; border-radius: 999px; }
    input, select, textarea, button {
      -webkit-app-region: no-drag !important;
      -webkit-user-select: auto !important;
      user-select: auto !important;
      font-family: inherit;
    }
    input:focus, select:focus, textarea:focus {
      border-color: #3b82f6 !important;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.22) !important;
    }
    .drix-btn {
      transition: transform 0.14s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.2s ease, background 0.2s ease, opacity 0.2s ease;
    }
    .drix-btn:hover:not(:disabled) {
      transform: translateY(-1px);
    }
    .drix-btn:active:not(:disabled) {
      transform: scale(0.97);
    }
    @keyframes pulseLogo {
      0% { transform: scale(0.9); opacity: 0; filter: drop-shadow(0 0 0px rgba(59, 130, 246, 0)); }
      60% { transform: scale(1.03); opacity: 1; filter: drop-shadow(0 0 30px rgba(59, 130, 246, 0.55)); }
      100% { transform: scale(1); opacity: 1; filter: drop-shadow(0 0 18px rgba(6, 182, 212, 0.35)); }
    }
    @keyframes fadeInApp {
      0% { opacity: 0; transform: translateY(6px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes slideInToast {
      0% { opacity: 0; transform: translateX(30px) scale(0.95); }
      100% { opacity: 1; transform: translateX(0) scale(1); }
    }
    @media print {
      body * { visibility: hidden !important; }
      #drix-print-area, #drix-print-area * { visibility: visible !important; }
      #drix-print-area {
        position: fixed !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        background: #ffffff !important;
        color: #000000 !important;
        padding: 0 !important;
        margin: 0 !important;
        box-shadow: none !important;
      }
    }
  `;

  // --- GLOBAL TOAST & CONFIRM OVERLAYS ---
  const renderOverlays = () => (
    <>
      <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 20000, display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'none' }}>
        {toasts.map((t) => {
          const borderCol =
            t.type === 'success' ? colors.accentGreen : t.type === 'error' ? colors.accentRed : t.type === 'warning' ? colors.accentOrange : colors.accentBlue;
          return (
            <div
              key={t.id}
              style={{
                pointerEvents: 'auto',
                minWidth: '280px',
                maxWidth: '400px',
                padding: '13px 18px',
                borderRadius: '14px',
                background: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)',
                color: colors.text,
                borderLeft: `4px solid ${borderCol}`,
                borderTop: `1px solid ${colors.glassBorder}`,
                borderRight: `1px solid ${colors.glassBorder}`,
                borderBottom: `1px solid ${colors.glassBorder}`,
                boxShadow: '0 15px 35px rgba(0,0,0,0.35)',
                backdropFilter: 'blur(16px)',
                fontSize: '0.9rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                animation: 'slideInToast 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards'
              }}
            >
              <span>{t.text}</span>
            </div>
          );
        })}
      </div>

      {confirmDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', zIndex: 21000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: isDark ? '#111827' : '#ffffff', border: `1px solid ${colors.glassBorder}`, borderRadius: '20px', padding: '28px', width: '400px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', color: colors.text, animation: 'fadeInApp 0.2s ease-out' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1.2rem' }}>{confirmDialog.title}</h3>
            <p style={{ margin: '0 0 24px 0', color: colors.textMuted, fontSize: '0.95rem', lineHeight: '1.5' }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                className="drix-btn"
                onClick={() => setConfirmDialog(null)}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `1px solid ${colors.glassBorder}`, background: colors.inputBg, color: colors.text, fontWeight: '600', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="drix-btn"
                onClick={() => {
                  const fn = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  if (fn) fn();
                }}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: colors.accentRed, color: '#fff', fontWeight: '700', cursor: 'pointer' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (isBooting) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#070b14', color: '#ffffff' }}>
        <style>{globalStyle}</style>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h1 style={{ fontSize: '5.5rem', letterSpacing: '8px', fontWeight: '900', margin: 0, background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'pulseLogo 1.6s ease-out forwards' }}>
            DRIX
          </h1>
          <span style={{ color: '#64748b', fontSize: '0.85rem', letterSpacing: '3px', textTransform: 'uppercase', marginTop: '10px', fontWeight: '600' }}>
            Enterprise Hybrid Cloud POS
          </span>
        </div>
        <div style={{ paddingBottom: '36px', textAlign: 'center', color: '#64748b', fontSize: '0.82rem', lineHeight: '1.6' }}>
          © 2026 DRIX Systems • v{appVersion}<br />
          Engineered by Deekshith Mahadev
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: colors.bg, color: colors.text, animation: 'fadeInApp 0.4s ease-out forwards' }}>
        <style>{globalStyle}</style>
        {renderOverlays()}

        <div style={{ background: colors.glassBg, padding: '42px', borderRadius: '24px', boxShadow: '0 25px 60px rgba(0,0,0,0.4)', width: '390px', backdropFilter: 'blur(30px)', border: `1px solid ${colors.glassBorder}` }}>
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <h1 style={{ margin: '0 0 6px 0', fontSize: '2.6rem', letterSpacing: '3px', fontWeight: '900', background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              DRIX
            </h1>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.9rem', fontWeight: '500' }}>
              Universal Hybrid Cloud Client
            </p>
          </div>

          {authError && (
            <div style={{ background: 'rgba(239, 68, 68, 0.12)', color: colors.accentRed, padding: '12px', borderRadius: '12px', marginBottom: '18px', textAlign: 'center', fontWeight: '600', fontSize: '0.9rem', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              {authError}
            </div>
          )}

          <form onSubmit={handleWebLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: colors.textMuted, marginLeft: '4px' }}>STORE IDENTIFIER</label>
              <input
                type="text"
                placeholder="e.g. GLAMYES_MASTER"
                required
                autoFocus
                value={authData.storeId}
                onChange={(e) => setAuthData({ ...authData, storeId: e.target.value.toUpperCase() })}
                style={{ width: '100%', padding: '13px 15px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '12px', color: colors.text, outline: 'none', fontSize: '0.98rem', marginTop: '6px', fontWeight: '600' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: colors.textMuted, marginLeft: '4px' }}>USERNAME</label>
              <input
                type="text"
                placeholder="Enter username"
                required
                value={authData.username}
                onChange={(e) => setAuthData({ ...authData, username: e.target.value })}
                style={{ width: '100%', padding: '13px 15px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '12px', color: colors.text, outline: 'none', fontSize: '0.98rem', marginTop: '6px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', color: colors.textMuted, marginLeft: '4px' }}>PASSWORD</label>
              <input
                type="password"
                placeholder="Enter password"
                required
                value={authData.password}
                onChange={(e) => setAuthData({ ...authData, password: e.target.value })}
                style={{ width: '100%', padding: '13px 15px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '12px', color: colors.text, outline: 'none', fontSize: '0.98rem', marginTop: '6px' }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="drix-btn"
              style={{ padding: '15px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', borderRadius: '12px', cursor: isLoggingIn ? 'wait' : 'pointer', fontWeight: '700', fontSize: '1rem', marginTop: '10px', boxShadow: '0 8px 20px rgba(59, 130, 246, 0.35)' }}
            >
              {isLoggingIn ? 'Authenticating...' : 'Unlock Register →'}
            </button>
          </form>
        </div>

        <div style={{ position: 'absolute', bottom: '20px', textAlign: 'center', color: colors.textMuted, fontSize: '0.8rem', opacity: 0.75 }}>
          © 2026 DRIX Systems • v{appVersion} • Engineered by Deekshith Mahadev
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'billing', label: 'Cloud Register', icon: '💳' },
    { id: 'inventory', label: 'Global Inventory', icon: '📦' },
    { id: 'dashboard', label: 'Cloud Analytics', icon: '📊' }
  ];

  return (
    <div style={{ display: 'flex', height: '100vh', background: colors.bg, color: colors.text, overflow: 'hidden', position: 'relative' }}>
      <style>{globalStyle}</style>
      {renderOverlays()}

      {/* --- SIDEBAR --- */}
      <nav style={{ width: '260px', background: colors.sidebarBg, backdropFilter: 'blur(30px)', borderRight: `1px solid ${colors.glassBorder}`, display: 'flex', flexDirection: 'column', padding: '24px 0', zIndex: 10 }}>
        <div style={{ padding: '0 20px 22px', borderBottom: `1px solid ${colors.glassBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ fontSize: '1.85rem', fontWeight: '900', margin: 0, letterSpacing: '2px', background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              DRIX
            </h1>
            <span style={{ fontSize: '0.72rem', fontWeight: '700', padding: '3px 8px', borderRadius: '99px', background: 'rgba(59, 130, 246, 0.15)', color: colors.accentBlue }}>
              v{appVersion}
            </span>
          </div>
          <div style={{ marginTop: '10px', fontSize: '0.85rem', fontWeight: '600', color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {storeDetails.storeName || 'DRIX Store'}
          </div>
          <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '2px' }}>
            ID: {localStorage.getItem('drix_store_id') || 'DRIX_MASTER'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '18px 14px' }}>
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className="drix-btn"
                onClick={() => setActiveTab(item.id)}
                style={{
                  background: active ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.22), rgba(6, 182, 212, 0.12))' : 'transparent',
                  color: active ? '#fff' : colors.textMuted,
                  border: active ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
                  padding: '13px 16px',
                  borderRadius: '12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: active ? '700' : '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}

          {userRole === 'superadmin' && (
            <button
              type="button"
              className="drix-btn"
              onClick={() => setActiveTab('superadmin')}
              style={{
                background: activeTab === 'superadmin' ? 'rgba(59, 130, 246, 0.22)' : 'transparent',
                color: activeTab === 'superadmin' ? '#fff' : colors.textMuted,
                border: activeTab === 'superadmin' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
                padding: '13px 16px',
                borderRadius: '12px',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: '700',
                marginTop: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <span>👑</span>
              <span>DRIX Control Panel</span>
            </button>
          )}
        </div>

        {/* LIVE UPDATE BANNER IN SIDEBAR WHEN NEW GITHUB RELEASE IS FOUND */}
        {(updateInfo.status === 'available' || updateInfo.status === 'downloaded') && (
          <div style={{ margin: '0 14px 12px', padding: '12px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.12)', border: `1px solid ${colors.accentGreen}`, fontSize: '0.82rem' }}>
            <div style={{ fontWeight: '700', color: colors.accentGreen, marginBottom: '6px' }}>
              ✨ Update v{updateInfo.version} {updateInfo.status === 'downloaded' ? 'Ready!' : 'Available'}
            </div>
            <button
              type="button"
              className="drix-btn"
              onClick={() => setShowSettings(true)}
              style={{ width: '100%', padding: '7px', borderRadius: '8px', border: 'none', background: colors.accentGreen, color: '#fff', fontWeight: '700', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Open Updater
            </button>
          </div>
        )}

        <div style={{ marginTop: 'auto', padding: '16px 14px 0', borderTop: `1px solid ${colors.glassBorder}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            className="drix-btn"
            onClick={handleLock}
            style={{ background: 'transparent', color: colors.textMuted, border: `1px solid ${colors.glassBorder}`, padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', width: '100%', fontWeight: '600', fontSize: '0.88rem', textAlign: 'left' }}
          >
            🔒 Lock Register
          </button>
          <button
            type="button"
            className="drix-btn"
            onClick={() => setShowSettings(true)}
            style={{ background: colors.glassBg, color: colors.text, border: `1px solid ${colors.glassBorder}`, padding: '11px 14px', borderRadius: '10px', cursor: 'pointer', width: '100%', fontWeight: '600', fontSize: '0.92rem', textAlign: 'left' }}
          >
            ⚙️ App Settings
          </button>
          <button
            type="button"
            className="drix-btn"
            onClick={handleLogout}
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: colors.accentRed, border: '1px solid rgba(239, 68, 68, 0.25)', padding: '11px 14px', borderRadius: '10px', cursor: 'pointer', width: '100%', fontWeight: '600', fontSize: '0.92rem', textAlign: 'left' }}
          >
            🚪 Sign Out
          </button>
        </div>
      </nav>

      {/* --- MAIN CONTENT & TOP STATUS BAR --- */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: '58px', padding: '0 28px', borderBottom: `1px solid ${colors.glassBorder}`, background: colors.sidebarBg, backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.88rem', color: colors.textMuted }}>
            <span style={{ fontWeight: '600', color: colors.text }}>{storeDetails.storeName}</span>
            {storeDetails.storeAddress && <span>• {storeDetails.storeAddress.split('\n')[0]}</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {pendingCount > 0 && (
              <button
                type="button"
                className="drix-btn"
                disabled={isSyncing}
                onClick={handleQuickSync}
                style={{ padding: '6px 14px', borderRadius: '99px', background: 'rgba(245, 158, 11, 0.18)', border: `1px solid ${colors.accentOrange}`, color: colors.accentOrange, fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer' }}
              >
                {isSyncing ? '⏳ Syncing...' : `🔄 Sync ${pendingCount} Offline Bill(s)`}
              </button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '99px', background: isOnline ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.15)', border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.4)'}`, fontSize: '0.78rem', fontWeight: '700', color: isOnline ? colors.accentGreen : colors.accentOrange }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isOnline ? colors.accentGreen : colors.accentOrange }} />
              <span>{isOnline ? 'Cloud Connected' : 'Offline Vault Active'}</span>
            </div>

            <button
              type="button"
              className="drix-btn"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              style={{ padding: '6px 12px', borderRadius: '99px', border: `1px solid ${colors.glassBorder}`, background: colors.inputBg, color: colors.text, cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}
            >
              {isDark ? '☀️ Light' : '🌙 Dark'}
            </button>
          </div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'billing' && <Billing theme={theme} storeDetails={storeDetails} />}
          {activeTab === 'inventory' && <Inventory theme={theme} />}
          {activeTab === 'dashboard' && <Dashboard theme={theme} setTheme={setTheme} />}
          {activeTab === 'superadmin' && <SuperAdmin theme={theme} />}
        </main>
      </div>

      {/* --- SETTINGS MODAL --- */}
      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(14px)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: isDark ? '#111827' : '#ffffff', border: `1px solid ${colors.glassBorder}`, padding: '32px', borderRadius: '24px', width: '560px', boxShadow: '0 25px 60px rgba(0,0,0,0.55)', color: colors.text, maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontWeight: '800', fontSize: '1.4rem' }}>DRIX System Configuration</h2>
              <button type="button" onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: colors.textMuted, fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
            </div>

            {/* --- 1. SOFTWARE AUTO-UPDATER (GITHUB RELEASES) --- */}
            {isElectron && (
              <div style={{ padding: '18px', borderRadius: '16px', background: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.06)', border: `1px solid rgba(59, 130, 246, 0.25)`, marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '1rem' }}>🚀 DRIX Live Software Update (GitHub Releases)</strong>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', color: colors.accentBlue }}>Current: v{appVersion}</span>
                </div>
                <p style={{ margin: '0 0 12px 0', fontSize: '0.84rem', color: colors.textMuted }}>
                  {updateInfo.message}
                </p>

                {updateInfo.status === 'downloading' && (
                  <div style={{ width: '100%', height: '8px', background: colors.inputBg, borderRadius: '99px', overflow: 'hidden', marginBottom: '12px' }}>
                    <div style={{ width: `${updateInfo.percent}%`, height: '100%', background: colors.accentBlue, transition: 'width 0.2s ease' }} />
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  {updateInfo.status !== 'available' && updateInfo.status !== 'downloaded' && (
                    <button
                      type="button"
                      className="drix-btn"
                      disabled={updateInfo.status === 'checking' || updateInfo.status === 'downloading'}
                      onClick={handleCheckUpdates}
                      style={{ padding: '10px 16px', background: colors.accentBlue, color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontSize: '0.88rem' }}
                    >
                      {updateInfo.status === 'checking' ? 'Checking GitHub...' : '🔍 Check for Updates'}
                    </button>
                  )}

                  {updateInfo.status === 'available' && (
                    <button
                      type="button"
                      className="drix-btn"
                      onClick={() => window.drixUpdater?.downloadUpdate()}
                      style={{ padding: '10px 16px', background: colors.accentGreen, color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontSize: '0.88rem' }}
                    >
                      ⬇️ Download Update v{updateInfo.version}
                    </button>
                  )}

                  {updateInfo.status === 'downloaded' && (
                    <button
                      type="button"
                      className="drix-btn"
                      onClick={() => window.drixUpdater?.installUpdate()}
                      style={{ padding: '10px 16px', background: colors.accentGreen, color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontSize: '0.88rem' }}
                    >
                      ⚡ Restart & Install v{updateInfo.version} Now
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* --- 2. ACCOUNT MANAGEMENT --- */}
            <div style={{ padding: '18px 0', borderBottom: `1px solid ${colors.glassBorder}` }}>
              <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '4px' }}>Account & Store Profile</strong>
              <span style={{ fontSize: '0.84rem', color: colors.textMuted, display: 'block', marginBottom: '14px' }}>
                Updates your sidebar branding, thermal printed invoices, and WhatsApp customer bills automatically.
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: colors.textMuted, fontWeight: '600' }}>Store Identifier (Immutable)</label>
                  <input
                    type="text"
                    disabled
                    value={localStorage.getItem('drix_store_id') || 'DRIX_MASTER'}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(128,128,128,0.12)', border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.textMuted, marginTop: '4px', cursor: 'not-allowed' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', color: colors.textMuted, fontWeight: '600' }}>Store Display Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Glamyes Fashion Boutique"
                    value={accountForm.storeName}
                    onChange={(e) => setAccountForm({ ...accountForm, storeName: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, marginTop: '4px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', color: colors.textMuted, fontWeight: '600' }}>Store Address & Contact (Printed on Receipts)</label>
                  <textarea
                    rows="2"
                    placeholder="Street, City, Pin code, Phone"
                    value={accountForm.storeAddress}
                    onChange={(e) => setAccountForm({ ...accountForm, storeAddress: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, marginTop: '4px', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.78rem', color: colors.textMuted, fontWeight: '600' }}>Login Username</label>
                    <input
                      type="text"
                      value={accountForm.username}
                      onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, marginTop: '4px' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.78rem', color: colors.textMuted, fontWeight: '600' }}>New Password (Optional)</label>
                    <input
                      type="password"
                      placeholder="Leave blank to keep current"
                      value={accountForm.password}
                      onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, marginTop: '4px' }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="drix-btn"
                  disabled={savingSettings}
                  onClick={handleSaveAccountProfile}
                  style={{ padding: '12px', background: colors.accentGreen, color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', marginTop: '4px' }}
                >
                  {savingSettings ? 'Saving...' : 'Save Store Profile & Credentials'}
                </button>
              </div>
            </div>

            {/* --- 3. HARDWARE INTEGRATIONS --- */}
            <div style={{ padding: '18px 0', borderBottom: `1px solid ${colors.glassBorder}` }}>
              <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '12px' }}>Hardware Integrations</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', color: colors.textMuted }}>Thermal Receipt Printer</label>
                  <select
                    value={hardwareConfig.thermalPrinter}
                    onChange={(e) => handleHardwareChange('thermalPrinter', e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, marginTop: '4px' }}
                  >
                    <option value="">-- System Default Printer --</option>
                    {printers.map((p) => (
                      <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.82rem', color: colors.textMuted }}>Barcode Sticker Printer</label>
                  <select
                    value={hardwareConfig.barcodePrinter}
                    onChange={(e) => handleHardwareChange('barcodePrinter', e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text, marginTop: '4px' }}
                  >
                    <option value="">-- System Default Printer --</option>
                    {printers.map((p) => (
                      <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* --- 4. WHATSAPP CLOUD API --- */}
            <div style={{ padding: '18px 0', borderBottom: `1px solid ${colors.glassBorder}` }}>
              <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '4px' }}>WhatsApp Cloud API Integration</strong>
              <span style={{ fontSize: '0.82rem', color: colors.textMuted, display: 'block', marginBottom: '12px' }}>
                Link Meta Developer credentials for automated 10:00 PM nightly reports.
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Meta Phone Number ID"
                  value={cloudSettings.metaPhoneId}
                  onChange={(e) => setCloudSettings({ ...cloudSettings, metaPhoneId: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text }}
                />
                <input
                  type="password"
                  placeholder="Meta Permanent Access Token"
                  value={cloudSettings.metaAccessToken}
                  onChange={(e) => setCloudSettings({ ...cloudSettings, metaAccessToken: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', color: colors.text }}
                />
                <button
                  type="button"
                  className="drix-btn"
                  onClick={handleSaveCloudSettings}
                  style={{ padding: '12px', background: colors.accentBlue, color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700' }}
                >
                  Save API Keys to DRIX Cloud
                </button>
              </div>
            </div>

            {/* --- 5. DESKTOP DOWNLOAD (HIDDEN IN DESKTOP APP) --- */}
            {!isElectron && (
              <div style={{ padding: '18px 0', borderBottom: `1px solid ${colors.glassBorder}` }}>
                <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '4px' }}>Desktop Offline Client</strong>
                <span style={{ fontSize: '0.82rem', color: colors.textMuted, display: 'block', marginBottom: '12px' }}>
                  Download the Windows Desktop installer from GitHub Releases for native hardware & auto-update support.
                </span>
                <a
                  href="https://github.com/Userdeekshith/drix-web-pos/releases/latest"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', padding: '10px 16px', background: colors.accentBlue, color: '#fff', textDecoration: 'none', borderRadius: '10px', fontSize: '0.88rem', fontWeight: '700' }}
                >
                  ⬇️ Download Latest Windows Installer (.exe)
                </a>
              </div>
            )}

            <div style={{ textAlign: 'center', marginTop: '20px', color: colors.textMuted, fontSize: '0.78rem' }}>
              <strong>DRIX Cloud Software Solutions • v{appVersion}</strong><br />
              Engineered by Deekshith Mahadev
            </div>
          </div>
        </div>
      )}
    </div>
  );
}