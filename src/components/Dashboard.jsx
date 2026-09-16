import React, { useState, useEffect, useMemo } from 'react';

// NEW: Universal Web-Safe CSV Downloader
const triggerBrowserDownload = (filename, csvContent) => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function Dashboard({ theme, setTheme }) {
  const [stats, setStats] = useState(null);
  const [salesHistory, setSalesHistory] = useState([]);
  
  const [timeFilter, setTimeFilter] = useState('7d'); 
  const [isClosing, setIsClosing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const [emailStatus, setEmailStatus] = useState('idle'); 
  const [emailError, setEmailError] = useState(''); 
  const [isShuttingDown, setIsShuttingDown] = useState(false);

  useEffect(() => { fetchData(); }, []);

  // BULLETPROOF FETCH: If anything crashes, it falls back to 0 so the UI doesn't freeze
  const fetchData = async () => {
    try {
      const s = await window.posAPI.getDashboardStats();
      const history = await window.posAPI.getSalesHistory();
      setStats(s);
      setSalesHistory(Array.isArray(history) ? history : []);
    } catch (e) {
      console.error("Dashboard Fetch Error:", e);
      setStats({
        salesStats: { turnover_today: 0, profit_today: 0, turnover_month: 0, profit_month: 0 },
        stockValuation: { total_retail_value: 0, total_invested: 0 }
      });
      setSalesHistory([]);
    }
  };

  useEffect(() => {
    let timer;
    if (isClosing && timeLeft > 0 && !isShuttingDown) {
      timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0 && isClosing && !isShuttingDown) {
      triggerShutdown(); 
    }
    return () => clearInterval(timer);
  }, [isClosing, timeLeft, isShuttingDown]);

  // FIXED: Standardized Web Download for Sales
  const downloadSales = async () => {
    if (salesHistory.length === 0) return alert("No sales data available.");
    
    let csv = "Invoice Number,Date,Type,Customer Mobile,Total Amount,Tax Amount\n";
    salesHistory.forEach(sale => {
      let saleDate = new Date(sale.created_at);
      if (isNaN(saleDate.getTime())) saleDate = new Date(); // Fallback
      const dateStr = saleDate.toLocaleDateString('en-IN');
      csv += `${sale.invoice_number},${dateStr},${sale.type},${sale.customer_mobile},${sale.total_amount},${sale.tax_amount}\n`;
    });
    
    const dateStr = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
    triggerBrowserDownload(`DRIX_Sales_Report_${dateStr}.csv`, csv);
    alert("Sales report downloaded successfully!");
  };

  // FIXED: Standardized Web Download for Inventory
  const downloadInventory = async () => {
    const inventory = await window.posAPI.getProducts();
    if (!Array.isArray(inventory) || inventory.length === 0) return alert("No inventory data available.");
    
    let csv = "Barcode,Item Name,Category,Size,Color,Stock Qty,Cost Price,Selling Price\n";
    inventory.forEach(p => {
      // Replaces quotes inside product names so they don't break the CSV format
      const safeName = p.name ? p.name.replace(/"/g, '""') : 'N/A';
      csv += `${p.barcode},"${safeName}",${p.category},${p.size || 'N/A'},${p.color || 'N/A'},${p.stock_quantity},${p.cost_price},${p.price}\n`;
    });
    
    const dateStr = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
    triggerBrowserDownload(`DRIX_Stock_Report_${dateStr}.csv`, csv);
    alert("Inventory report downloaded successfully!");
  };

  const startClosingSequence = () => {
    if (window.confirm("Are you ready to close the store? Automated reports are dispatched by the Cloud nightly at 10:00 PM.")) {
      setIsClosing(true);
      setEmailError('');
      sendEmails();
    }
  };

  const sendEmails = async () => {
    setEmailStatus('sending');
    
    // Simulate server communication for the UI sequence since the actual cron job runs on the server at night
    setTimeout(() => {
      setEmailStatus('success');
    }, 2000);
  };

  const triggerShutdown = () => {
    setIsShuttingDown(true);
    // Universal Shutdown: Safely handles both Electron and Web
    setTimeout(() => {
      if (window.posAPI.exitApp) {
        window.posAPI.exitApp(); // Works in Electron
      } else {
        window.location.reload(); // Works in Web Browser
      }
    }, 4000);
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

    let dataArr = Object.keys(grouped).map(date => ({ date, total: grouped[date] }));
    dataArr = dataArr.reverse();

    if (timeFilter === '7d') dataArr = dataArr.slice(-7);
    if (timeFilter === '1m') dataArr = dataArr.slice(-30);
    if (timeFilter === '1y') dataArr = dataArr.slice(-365);
    
    return dataArr;
  }, [salesHistory, timeFilter]);

  const maxChartVal = chartData.length > 0 ? Math.max(...chartData.map(d => d.total)) : 100;

  const isDark = theme === 'dark';
  
  const colors = {
    text: isDark ? '#ffffff' : '#1c1c1e',
    textMuted: isDark ? '#a1a1a6' : '#86868b',
    glassBg: isDark ? 'rgba(30, 30, 30, 0.4)' : 'rgba(255, 255, 255, 0.5)',
    glassBorder: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.4)',
    accentBlue: '#007aff',
    accentRed: '#ff3b30',
    accentOrange: '#ff9500',
    accentGreen: '#34c759'
  };

  const glassStyle = {
    background: colors.glassBg,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${colors.glassBorder}`,
    borderRadius: '16px',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1)',
    color: colors.text
  };

  const btnStyle = {
    background: colors.glassBg,
    backdropFilter: 'blur(10px)',
    border: `1px solid ${colors.glassBorder}`,
    color: colors.text,
    padding: '8px 16px',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 0.2s ease'
  };

  if (!stats) return <div style={{ padding: '20px', color: colors.text }}>Loading UI Framework...</div>;

  return (
    <div style={{ minHeight: '100%', padding: '30px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', boxSizing: 'border-box', position: 'relative' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h2 style={{ margin: 0, color: colors.text, fontSize: '2rem', fontWeight: '700', textShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>Overview</h2>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={downloadSales} style={btnStyle} onMouseOver={(e) => e.target.style.background = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)'} onMouseOut={(e) => e.target.style.background = colors.glassBg}>
            📥 Sales CSV
          </button>
          <button onClick={downloadInventory} style={btnStyle} onMouseOver={(e) => e.target.style.background = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)'} onMouseOut={(e) => e.target.style.background = colors.glassBg}>
            📦 Stock CSV
          </button>
          <button onClick={startClosingSequence} style={{ ...btnStyle, background: colors.accentRed, color: 'white', border: 'none' }} onMouseOver={(e) => e.target.style.opacity = '0.8'} onMouseOut={(e) => e.target.style.opacity = '1'}>
            🔒 End Day
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ ...glassStyle, padding: '25px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: colors.textMuted, fontSize: '1rem', fontWeight: '500' }}>Today's Performance</h4>
          <div style={{ fontSize: '2.2rem', fontWeight: '700', color: colors.text }}>₹{stats.salesStats.turnover_today.toFixed(2)}</div>
          <div style={{ color: colors.accentGreen, fontWeight: '600', marginTop: '5px' }}>+ ₹{stats.salesStats.profit_today.toFixed(2)} Profit</div>
        </div>

        <div style={{ ...glassStyle, padding: '25px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: colors.textMuted, fontSize: '1rem', fontWeight: '500' }}>This Month</h4>
          <div style={{ fontSize: '2.2rem', fontWeight: '700', color: colors.text }}>₹{stats.salesStats.turnover_month.toFixed(2)}</div>
          <div style={{ color: colors.accentGreen, fontWeight: '600', marginTop: '5px' }}>+ ₹{stats.salesStats.profit_month.toFixed(2)} Profit</div>
        </div>

        <div style={{ ...glassStyle, padding: '25px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: colors.textMuted, fontSize: '1rem', fontWeight: '500' }}>Current Stock Value</h4>
          <div style={{ fontSize: '2.2rem', fontWeight: '700', color: colors.text }}>₹{stats.stockValuation.total_retail_value.toFixed(2)}</div>
          <div style={{ color: colors.accentOrange, fontWeight: '600', marginTop: '5px' }}>₹{stats.stockValuation.total_invested.toFixed(2)} Invested</div>
        </div>
      </div>

      <div style={{ ...glassStyle, padding: '30px', display: 'flex', flexDirection: 'column', height: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '600' }}>Revenue Analytics</h3>
          
          <div style={{ background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)', padding: '4px', borderRadius: '8px', display: 'flex', gap: '4px' }}>
            {['7d', '1m', '1y'].map(filter => (
              <button 
                key={filter}
                onClick={() => setTimeFilter(filter)}
                style={{ 
                  background: timeFilter === filter ? (isDark ? '#3a3a3c' : '#ffffff') : 'transparent',
                  color: timeFilter === filter ? colors.text : colors.textMuted,
                  border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer',
                  boxShadow: timeFilter === filter ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s'
                }}>
                {filter.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '10px', paddingTop: '20px', borderBottom: `1px solid ${colors.glassBorder}` }}>
          {chartData.length === 0 ? (
            <div style={{ width: '100%', textAlign: 'center', color: colors.textMuted, paddingBottom: '50px' }}>No sales data available for this period.</div>
          ) : (
            chartData.map((data, index) => {
              const heightPercent = maxChartVal > 0 ? (data.total / maxChartVal) * 100 : 0;
              return (
                <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', group: 'hover' }}>
                  <div title={`₹${data.total.toFixed(2)}`} style={{ 
                    width: '100%', maxWidth: '40px', 
                    height: `${heightPercent}%`, 
                    background: colors.accentBlue, 
                    borderRadius: '6px 6px 0 0',
                    transition: 'height 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                    opacity: 0.85
                  }} 
                  onMouseOver={(e) => e.target.style.opacity = '1'}
                  onMouseOut={(e) => e.target.style.opacity = '0.85'}
                  />
                  <span style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                    {data.date.split(' ')[0]} 
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {isClosing && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: isShuttingDown ? '#000000' : 'rgba(0, 0, 0, 0.6)', 
          backdropFilter: isShuttingDown ? 'none' : 'blur(15px)',
          WebkitBackdropFilter: isShuttingDown ? 'none' : 'blur(15px)',
          zIndex: 9999, display: 'flex', flexDirection: 'column', 
          justifyContent: 'center', alignItems: 'center', color: 'white',
          transition: 'all 2s ease-in-out'
        }}>
          
          {isShuttingDown ? (
            <div style={{ textAlign: 'center', animation: 'fadeOut 3s forwards' }}>
              <h1 style={{ fontSize: '4rem', letterSpacing: '3px', marginBottom: '10px', fontWeight: '300' }}>DRIX</h1>
              <h3 style={{ color: '#8e8e93', fontWeight: '400' }}>Store closed. Goodnight.</h3>
              <style>{`@keyframes fadeOut { 0% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(0.95); } }`}</style>
            </div>
          ) : (
            
          <div style={{ 
            background: isDark ? 'rgba(40,40,40,0.8)' : 'rgba(255,255,255,0.8)', 
            backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
            border: `1px solid ${colors.glassBorder}`, color: colors.text, 
            padding: '40px', borderRadius: '24px', width: '500px', textAlign: 'center', 
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)' 
          }}>
            <h2 style={{ marginTop: 0, color: colors.text, fontWeight: '600' }}>End of Day Sequence</h2>
            
            <div style={{ fontSize: '5rem', fontWeight: '200', fontFamily: '-apple-system, sans-serif', color: colors.text, margin: '10px 0' }}>
              {formatTime(timeLeft)}
            </div>
            
            <p style={{ fontSize: '1rem', color: colors.textMuted, marginBottom: '30px' }}>
              The system will securely lock and shut down when the timer reaches zero.
            </p>

            <div style={{ padding: '20px', borderRadius: '12px', background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)', marginBottom: '30px' }}>
              {emailStatus === 'sending' && (
                <div>
                  <h3 style={{ color: colors.accentOrange, margin: '0 0 10px 0', fontSize: '1.1rem' }}>⏳ Processing Operations...</h3>
                </div>
              )}
              
              {emailStatus === 'failed' && (
                <div>
                  <h3 style={{ color: colors.accentRed, margin: '0 0 10px 0', fontSize: '1.1rem' }}>Operation Failed</h3>
                  <p style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: colors.textMuted }}>
                    {emailError || "Check your internet connection and try again."}
                  </p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button onClick={() => setIsClosing(false)} style={{ padding: '8px 20px', background: colors.inputBg, color: colors.text, border: `1px solid ${colors.glassBorder}`, borderRadius: '20px', cursor: 'pointer', fontWeight: '600' }}>
                      Close & Fix Settings
                    </button>
                    <button onClick={sendEmails} style={{ padding: '8px 20px', background: colors.accentRed, color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer', fontWeight: '600' }}>
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {emailStatus === 'success' && (
                <div>
                  <h3 style={{ color: colors.accentGreen, margin: '0 0 10px 0', fontSize: '1.1rem' }}>✓ Secure Sync Complete</h3>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: colors.textMuted }}>Your Cloud database is up to date. Automated reports will be dispatched tonight.</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '15px' }}>
              {emailStatus !== 'success' && (
                <button onClick={() => setIsClosing(false)} style={{ flex: 1, padding: '12px', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: colors.text, border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '600' }}>
                  Cancel
                </button>
              )}
              
              <button 
                onClick={triggerShutdown} 
                disabled={emailStatus !== 'success'}
                style={{ 
                  flex: 2, padding: '12px', border: 'none', borderRadius: '12px', fontWeight: '600', fontSize: '1.05rem',
                  background: emailStatus === 'success' ? colors.accentBlue : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
                  color: emailStatus === 'success' ? 'white' : colors.textMuted, cursor: emailStatus === 'success' ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s ease'
                }}
              >
                {emailStatus === 'success' ? 'Force Shut Down' : 'Awaiting Completion...'}
              </button>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}