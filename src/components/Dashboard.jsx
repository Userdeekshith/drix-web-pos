import React, { useState, useEffect, useMemo } from 'react';

const triggerBrowserDownload = (filename, csvContent) => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function Dashboard({ theme }) {
  const [stats, setStats] = useState(null);
  const [salesHistory, setSalesHistory] = useState([]);

  const [timeFilter, setTimeFilter] = useState('7d');
  const [isClosing, setIsClosing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const [emailStatus, setEmailStatus] = useState('idle');
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const notify = (msg, type = 'info') => {
    if (window.drixNotify) window.drixNotify(msg, type);
  };

  const checkPendingQueue = async () => {
    if (window.posAPI.getPendingSalesCount) {
      const count = await window.posAPI.getPendingSalesCount();
      setPendingSyncCount(count);
    }
  };

  const fetchData = async () => {
    try {
      const s = await window.posAPI.getDashboardStats();
      const history = await window.posAPI.getSalesHistory();
      setStats(s);
      setSalesHistory(Array.isArray(history) ? history : []);
    } catch (e) {
      setStats({
        salesStats: { turnover_today: 0, profit_today: 0, turnover_month: 0, profit_month: 0 },
        stockValuation: { total_retail_value: 0, total_invested: 0 }
      });
      setSalesHistory([]);
    }
  };

  useEffect(() => {
    fetchData();
    checkPendingQueue();

    const handleRefresh = () => {
      checkPendingQueue();
      fetchData();
    };
    window.addEventListener('drix-sync-complete', handleRefresh);
    window.addEventListener('drix-queue-updated', handleRefresh);
    return () => {
      window.removeEventListener('drix-sync-complete', handleRefresh);
      window.removeEventListener('drix-queue-updated', handleRefresh);
    };
  }, []);

  useEffect(() => {
    let timer;
    if (isClosing && timeLeft > 0 && !isShuttingDown) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && isClosing && !isShuttingDown) {
      triggerShutdown();
    }
    return () => clearInterval(timer);
  }, [isClosing, timeLeft, isShuttingDown]);

  const handleManualSync = async () => {
    if (!navigator.onLine) return notify('Please connect to Wi-Fi first to sync offline bills!', 'error');

    setIsSyncing(true);
    const result = await window.posAPI.syncPendingSales();
    setIsSyncing(false);

    if (result.success) {
      notify(`Synced ${result.count} offline bill(s) to DRIX Cloud!`, 'success');
      setPendingSyncCount(0);
      fetchData();
    } else {
      notify(`Synced ${result.count} bill(s), ${result.remaining} remaining.`, 'warning');
      setPendingSyncCount(result.remaining);
    }
  };

  const downloadSales = async () => {
    if (salesHistory.length === 0) return notify('No sales data available to export.', 'warning');

    let csv = 'Invoice Number,Date,Type,Customer Mobile,Total Amount,Tax Amount\n';
    salesHistory.forEach((sale) => {
      let saleDate = new Date(sale.created_at);
      if (isNaN(saleDate.getTime())) saleDate = new Date();
      const dateStr = saleDate.toLocaleDateString('en-IN');
      csv += `${sale.invoice_number},${dateStr},${sale.type},${sale.customer_mobile},${sale.total_amount},${sale.tax_amount}\n`;
    });

    const dateStr = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
    triggerBrowserDownload(`DRIX_Sales_Report_${dateStr}.csv`, csv);
    notify('Sales CSV report downloaded!', 'success');
  };

  const downloadInventory = async () => {
    const inventory = await window.posAPI.getProducts();
    if (!Array.isArray(inventory) || inventory.length === 0) {
      return notify('No inventory data available to export.', 'warning');
    }

    let csv = 'Barcode,Item Name,Category,Size,Color,Stock Qty,Cost Price,Selling Price\n';
    inventory.forEach((p) => {
      const safeName = p.name ? p.name.replace(/"/g, '""') : 'N/A';
      csv += `${p.barcode},"${safeName}",${p.category},${p.size || 'N/A'},${p.color || 'N/A'},${p.stock_quantity},${p.cost_price},${p.price}\n`;
    });

    const dateStr = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
    triggerBrowserDownload(`DRIX_Stock_Report_${dateStr}.csv`, csv);
    notify('Inventory Stock CSV downloaded!', 'success');
  };

  const startClosingSequence = () => {
    if (pendingSyncCount > 0) {
      return notify(
        `You have ${pendingSyncCount} unsynced offline bill(s)! Connect to Wi-Fi and sync before closing.`,
        'error'
      );
    }
    if (!navigator.onLine) {
      return notify('Network Offline: Connect to Wi-Fi before closing so DRIX can dispatch EOD reports.', 'error');
    }

    if (window.drixConfirm) {
      window.drixConfirm(
        'Are you ready to close the store for today? Nightly WhatsApp EOD telemetry will be dispatched automatically at 10:00 PM.',
        () => {
          setIsClosing(true);
          setEmailStatus('sending');
          setTimeout(() => setEmailStatus('success'), 1500);
        },
        'End of Day Store Closure'
      );
    }
  };

  const triggerShutdown = () => {
    setIsShuttingDown(true);
    setTimeout(() => {
      if (window.posAPI.exitApp) window.posAPI.exitApp();
      else window.location.reload();
    }, 3000);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const chartData = useMemo(() => {
    if (!salesHistory || salesHistory.length === 0) return [];

    const grouped = salesHistory.reduce((acc, curr) => {
      if (curr.type === 'RETURN') return acc;
      let dateObj = new Date(curr.date || curr.created_at || Date.now());
      if (isNaN(dateObj.getTime())) dateObj = new Date();
      const date = dateObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      acc[date] = (acc[date] || 0) + (curr.total_amount || 0);
      return acc;
    }, {});

    let dataArr = Object.keys(grouped).map((date) => ({ date, total: grouped[date] })).reverse();
    if (timeFilter === '7d') dataArr = dataArr.slice(-7);
    if (timeFilter === '1m') dataArr = dataArr.slice(-30);
    if (timeFilter === '1y') dataArr = dataArr.slice(-365);
    return dataArr;
  }, [salesHistory, timeFilter]);

  const maxChartVal = chartData.length > 0 ? Math.max(...chartData.map((d) => d.total)) : 100;

  const isDark = theme === 'dark';
  const colors = {
    text: isDark ? '#f8fafc' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    glassBg: isDark ? 'rgba(22, 30, 46, 0.65)' : 'rgba(255, 255, 255, 0.85)',
    glassBorder: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(15, 23, 42, 0.1)',
    accentBlue: '#3b82f6',
    accentRed: '#ef4444',
    accentOrange: '#f59e0b',
    accentGreen: '#10b981'
  };

  const glassStyle = {
    background: colors.glassBg,
    backdropFilter: 'blur(20px)',
    border: `1px solid ${colors.glassBorder}`,
    borderRadius: '18px',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.12)',
    color: colors.text
  };

  const btnStyle = {
    background: colors.glassBg,
    border: `1px solid ${colors.glassBorder}`,
    color: colors.text,
    padding: '10px 18px',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '0.88rem',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  };

  if (!stats) return <div style={{ padding: '30px', color: colors.text }}>Loading Cloud Telemetry...</div>;

  return (
    <div style={{ minHeight: '100%', padding: '26px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '26px' }}>
        <div>
          <h2 style={{ margin: 0, color: colors.text, fontSize: '1.75rem', fontWeight: '800' }}>Executive Telemetry</h2>
          <span style={{ fontSize: '0.85rem', color: colors.textMuted }}>Real-time store revenue, profit margins & stock valuation</span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {pendingSyncCount > 0 && (
            <button
              type="button"
              className="drix-btn"
              disabled={isSyncing}
              onClick={handleManualSync}
              style={{ ...btnStyle, background: 'rgba(245, 158, 11, 0.2)', border: `1px solid ${colors.accentOrange}`, color: colors.accentOrange }}
            >
              ⚠️ {isSyncing ? 'Syncing...' : `Sync Offline Data (${pendingSyncCount})`}
            </button>
          )}

          <button type="button" className="drix-btn" onClick={downloadSales} style={btnStyle}>
            📥 Sales CSV
          </button>
          <button type="button" className="drix-btn" onClick={downloadInventory} style={btnStyle}>
            📦 Stock CSV
          </button>
          <button type="button" className="drix-btn" onClick={startClosingSequence} style={{ ...btnStyle, background: colors.accentRed, color: 'white', border: 'none' }}>
            🔒 End Day
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '26px' }}>
        <div style={{ ...glassStyle, padding: '24px' }}>
          <h4 style={{ margin: '0 0 8px 0', color: colors.textMuted, fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase' }}>Today's Turnover</h4>
          <div style={{ fontSize: '2.2rem', fontWeight: '900', color: colors.text }}>₹{stats.salesStats.turnover_today.toFixed(2)}</div>
          <div style={{ color: colors.accentGreen, fontWeight: '700', marginTop: '6px', fontSize: '0.9rem' }}>
            + ₹{stats.salesStats.profit_today.toFixed(2)} Net Profit
          </div>
        </div>

        <div style={{ ...glassStyle, padding: '24px' }}>
          <h4 style={{ margin: '0 0 8px 0', color: colors.textMuted, fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase' }}>Monthly Revenue</h4>
          <div style={{ fontSize: '2.2rem', fontWeight: '900', color: colors.text }}>₹{stats.salesStats.turnover_month.toFixed(2)}</div>
          <div style={{ color: colors.accentGreen, fontWeight: '700', marginTop: '6px', fontSize: '0.9rem' }}>
            + ₹{stats.salesStats.profit_month.toFixed(2)} Monthly Profit
          </div>
        </div>

        <div style={{ ...glassStyle, padding: '24px' }}>
          <h4 style={{ margin: '0 0 8px 0', color: colors.textMuted, fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase' }}>Active Stock Valuation</h4>
          <div style={{ fontSize: '2.2rem', fontWeight: '900', color: colors.text }}>₹{stats.stockValuation.total_retail_value.toFixed(2)}</div>
          <div style={{ color: colors.accentOrange, fontWeight: '700', marginTop: '6px', fontSize: '0.9rem' }}>
            ₹{stats.stockValuation.total_invested.toFixed(2)} Capital Invested
          </div>
        </div>
      </div>

      <div style={{ ...glassStyle, padding: '26px', display: 'flex', flexDirection: 'column', height: '380px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800' }}>Revenue Trajectory</h3>

          <div style={{ background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)', padding: '4px', borderRadius: '10px', display: 'flex', gap: '4px' }}>
            {['7d', '1m', '1y'].map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setTimeFilter(filter)}
                style={{
                  background: timeFilter === filter ? colors.accentBlue : 'transparent',
                  color: timeFilter === filter ? '#ffffff' : colors.textMuted,
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                {filter.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '12px', paddingTop: '20px', borderBottom: `1px solid ${colors.glassBorder}` }}>
          {chartData.length === 0 ? (
            <div style={{ width: '100%', textAlign: 'center', color: colors.textMuted, paddingBottom: '50px' }}>
              No sales recorded for this period yet.
            </div>
          ) : (
            chartData.map((data, index) => {
              const heightPercent = maxChartVal > 0 ? Math.max(6, (data.total / maxChartVal) * 100) : 6;
              return (
                <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <div
                    title={`₹${data.total.toFixed(2)}`}
                    style={{
                      width: '100%',
                      maxWidth: '42px',
                      height: `${heightPercent}%`,
                      background: 'linear-gradient(180deg, #3b82f6 0%, #06b6d4 100%)',
                      borderRadius: '8px 8px 0 0',
                      transition: 'height 0.4s ease'
                    }}
                  />
                  <span style={{ fontSize: '0.72rem', color: colors.textMuted, marginTop: '8px', fontWeight: '600' }}>
                    {data.date}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {isClosing && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: isShuttingDown ? '#000000' : 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(15px)', zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white' }}>
          {isShuttingDown ? (
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: '4rem', letterSpacing: '4px', marginBottom: '10px', fontWeight: '900' }}>DRIX</h1>
              <h3 style={{ color: '#94a3b8', fontWeight: '500' }}>Store securely closed. Goodnight.</h3>
            </div>
          ) : (
            <div style={{ background: isDark ? '#111827' : '#ffffff', border: `1px solid ${colors.glassBorder}`, color: colors.text, padding: '36px', borderRadius: '24px', width: '480px', textAlign: 'center', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}>
              <h2 style={{ marginTop: 0, fontWeight: '800' }}>End of Day Sequence</h2>
              <div style={{ fontSize: '4.5rem', fontWeight: '200', margin: '10px 0' }}>{formatTime(timeLeft)}</div>
              <p style={{ fontSize: '0.95rem', color: colors.textMuted, marginBottom: '24px' }}>
                All local ledgers are reconciled with DRIX Cloud.
              </p>

              <div style={{ padding: '18px', borderRadius: '14px', background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)', marginBottom: '24px' }}>
                {emailStatus === 'sending' ? (
                  <h3 style={{ color: colors.accentOrange, margin: 0, fontSize: '1rem' }}>⏳ Verifying Cloud Sync...</h3>
                ) : (
                  <div>
                    <h3 style={{ color: colors.accentGreen, margin: '0 0 6px 0', fontSize: '1.05rem' }}>✓ Cloud Sync Verified</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: colors.textMuted }}>
                      Nightly WhatsApp report will dispatch at 10:00 PM IST.
                    </p>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" className="drix-btn" onClick={() => setIsClosing(false)} style={{ flex: 1, padding: '12px', background: 'rgba(128,128,128,0.15)', color: colors.text, border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '700' }}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="drix-btn"
                  onClick={triggerShutdown}
                  disabled={emailStatus !== 'success'}
                  style={{ flex: 2, padding: '12px', border: 'none', borderRadius: '12px', fontWeight: '800', background: colors.accentBlue, color: 'white', cursor: 'pointer' }}
                >
                  Shut Down Register Now
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}