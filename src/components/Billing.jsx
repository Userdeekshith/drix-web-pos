import React, { useState, useEffect, useRef } from 'react';

const blockInvalidChars = (e) => {
  if (['e', 'E', '+', '-'].includes(e.key)) {
    e.preventDefault();
  }
};

export default function Billing({ theme, storeDetails }) {
  const [cart, setCart] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [settings, setSettings] = useState({});
  const [isReturnMode, setIsReturnMode] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [discount, setDiscount] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');

  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const searchInputRef = useRef(null);
  const barcodeBuffer = useRef('');
  const barcodeTimeout = useRef(null);
  const latestShowPreview = useRef(showPreview);
  const latestIsReturnMode = useRef(isReturnMode);

  useEffect(() => { latestShowPreview.current = showPreview; }, [showPreview]);
  useEffect(() => { latestIsReturnMode.current = isReturnMode; }, [isReturnMode]);

  const notify = (text, type = 'error') => {
    if (window.drixNotify) window.drixNotify(text, type);
  };

  const loadCatalog = async () => {
    const prods = await window.posAPI.getProducts();
    setCatalog(Array.isArray(prods) ? prods : []);
  };

  useEffect(() => {
    window.posAPI.getSettings().then(setSettings);
    loadCatalog();
  }, []);

  // Global Hardware Barcode Scanner & Keyboard Shortcuts (F2 / F4 / Esc)
  useEffect(() => {
    const handleGlobalScan = async (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === 'Escape' && latestShowPreview.current) {
        setShowPreview(false);
        return;
      }

      if (latestShowPreview.current) return;

      const activeTag = document.activeElement ? document.activeElement.tagName.toUpperCase() : '';
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        return;
      }

      if (e.key === 'Enter') {
        if (barcodeBuffer.current.length >= 3) {
          const cleanBarcode = barcodeBuffer.current.trim();
          barcodeBuffer.current = '';
          const product = await window.posAPI.getProductByBarcode(cleanBarcode);
          if (!product) return notify(`Barcode ${cleanBarcode} not found!`, 'error');
          addToCart(product);
        }
      } else if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
        clearTimeout(barcodeTimeout.current);
        barcodeTimeout.current = setTimeout(() => {
          barcodeBuffer.current = '';
        }, 150);
      }
    };

    window.addEventListener('keydown', handleGlobalScan);
    return () => {
      window.removeEventListener('keydown', handleGlobalScan);
      clearTimeout(barcodeTimeout.current);
    };
  }, []);

  // FIXED: Uses unique `barcode` instead of `undefined` product.id
  const addToCart = (product) => {
    const code = String(product.barcode);
    const availableStock = Number(product.stock_quantity || 0);

    if (availableStock <= 0 && !latestIsReturnMode.current) {
      return notify(`Cannot add "${product.name}". Item is OUT OF STOCK!`, 'error');
    }

    setCart((prev) => {
      const existing = prev.find((item) => String(item.barcode) === code);
      if (existing) {
        if (existing.qty >= availableStock && !latestIsReturnMode.current) {
          notify(`Only ${availableStock} unit(s) of ${product.name} available in stock!`, 'warning');
          return prev;
        }
        return prev.map((item) =>
          String(item.barcode) === code ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [
        ...prev,
        {
          ...product,
          barcode: code,
          qty: 1,
          price: Number(product.price || 0),
          cost_price: Number(product.cost_price || 0),
          stock_quantity: availableStock
        }
      ];
    });
  };

  // FIXED: Updates quantity accurately by `barcode`
  const updateQty = (barcode, delta) => {
    const code = String(barcode);
    setCart((prev) =>
      prev
        .map((item) => {
          if (String(item.barcode) === code) {
            const newQty = item.qty + delta;
            if (newQty > item.stock_quantity && delta > 0 && !isReturnMode) {
              notify(`Cannot increase. Only ${item.stock_quantity} unit(s) in stock!`, 'warning');
              return item;
            }
            return { ...item, qty: newQty };
          }
          return item;
        })
        .filter((item) => item.qty > 0)
    );
  };

  const handleManualSearch = async (e) => {
    e.preventDefault();
    const query = manualBarcode.trim();
    if (!query) return;

    // 1. Exact barcode match
    let product = await window.posAPI.getProductByBarcode(query);

    // 2. Fallback: match by product name if user typed a name
    if (!product) {
      const lower = query.toLowerCase();
      product = catalog.find(
        (p) =>
          String(p.barcode).toLowerCase() === lower ||
          (p.name && p.name.toLowerCase().includes(lower))
      );
    }

    if (!product) {
      notify(`Item or Barcode "${query}" not found!`, 'error');
      setManualBarcode('');
      return;
    }

    addToCart(product);
    setManualBarcode('');
    searchInputRef.current?.focus();
  };

  const subtotal = cart.reduce((acc, item) => acc + Number(item.price) * Number(item.qty), 0);
  const discountValue = Math.max(0, parseFloat(discount || 0));
  const discountedSubtotal = Math.max(0, subtotal - discountValue);
  const gstRate = settings.gst_enabled === 'true' ? parseFloat(settings.gst_rate || 5) : 0;
  const taxAmount = (discountedSubtotal * gstRate) / 100;
  const grandTotal = discountedSubtotal + taxAmount;

  const handlePreview = () => {
    if (cart.length === 0) return;

    const payload = {
      invoice_number: `INV-${Date.now().toString().slice(-6)}`,
      customer_name: 'Walk-in Customer',
      customer_mobile: customerMobile.trim() || 'N/A',
      subtotal,
      discount: discountValue,
      tax_rate: gstRate,
      tax_amount: taxAmount,
      cgst: taxAmount / 2,
      sgst: taxAmount / 2,
      total_amount: grandTotal,
      payment_mode: paymentMode,
      items: cart,
      type: isReturnMode ? 'RETURN' : 'SALE',
      storeName: storeDetails?.storeName || 'DRIX Partner Store',
      storeAddress: storeDetails?.storeAddress || '',
      storeNumber: storeDetails?.mobile || '',
      date: new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    };

    setPreviewData(payload);
    setShowPreview(true);
  };

  const sendWhatsAppBill = () => {
    if (!previewData.customer_mobile || previewData.customer_mobile === 'N/A') {
      return notify('Please enter a 10-digit customer mobile number first.', 'warning');
    }

    let text = `*${storeDetails?.storeName || 'Store Invoice'}*\n`;
    if (storeDetails?.storeAddress) text += `${storeDetails.storeAddress}\n`;
    text += `Inv: ${previewData.invoice_number} | Date: ${previewData.date.split(',')[0]}\n`;
    text += `--------------------------------\n`;

    previewData.items.forEach((item) => {
      text += `${item.name} (${item.size || '-'})\n${item.qty} x ₹${item.price} = ₹${(item.price * item.qty).toFixed(2)}\n`;
    });

    text += `--------------------------------\n`;
    text += `Subtotal: ₹${previewData.subtotal.toFixed(2)}\n`;
    if (previewData.discount > 0) {
      text += `Discount: -₹${previewData.discount.toFixed(2)}\n`;
    }
    text += `*Grand Total: ₹${previewData.total_amount.toFixed(2)}* (${previewData.payment_mode})\n\n`;
    text += `Thank you for shopping with us! 🛍️`;

    const encodedText = encodeURIComponent(text);
    const cleanPhone = previewData.customer_mobile.replace(/\D/g, '');
    const waNumber = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    window.open(`https://api.whatsapp.com/send?phone=${waNumber}&text=${encodedText}`, '_blank');
  };

  const confirmAndPrint = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      if (isReturnMode) {
        const res = await window.posAPI.processReturn(previewData);
        notify(
          res.offlineSaved
            ? 'Return saved to Offline Vault & stock updated!'
            : 'Return processed & stock restocked!',
          'success'
        );
      } else {
        const res = await window.posAPI.checkout(previewData);
        await window.posAPI.printReceipt(previewData);
        notify(
          res.offlineSaved
            ? 'Sale saved to Offline Queue & receipt printed!'
            : 'Sale completed & receipt printed!',
          'success'
        );
      }

      setCart([]);
      setDiscount('');
      setCustomerMobile('');
      setIsReturnMode(false);
      setShowPreview(false);
      await loadCatalog();
      searchInputRef.current?.focus();
    } finally {
      setIsProcessing(false);
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

  const glassStyle = {
    background: colors.glassBg,
    backdropFilter: 'blur(20px)',
    border: `1px solid ${colors.glassBorder}`,
    borderRadius: '18px',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
    color: colors.text
  };

  const inputStyle = {
    padding: '12px 14px',
    background: colors.inputBg,
    border: `1px solid ${colors.glassBorder}`,
    borderRadius: '12px',
    color: colors.text,
    outline: 'none',
    fontSize: '0.96rem',
    width: '100%',
    boxSizing: 'border-box'
  };

  const totalUnits = cart.reduce((sum, i) => sum + i.qty, 0);

  return (
    <div style={{ display: 'flex', gap: '20px', padding: '24px', flex: 1, boxSizing: 'border-box' }}>
      {/* ---------------- LEFT: BILLING REGISTER ---------------- */}
      <div style={{ flex: 2.2, ...glassStyle, padding: '24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: '800' }}>
              {isReturnMode ? '⚠️ Return & Restock Mode' : '🛒 Cloud Billing Register'}
            </h2>
            <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>
              Scan barcode anywhere or press <strong>F2</strong> to search catalog
            </span>
          </div>

          {cart.length > 0 && (
            <button
              type="button"
              className="drix-btn"
              onClick={() => setCart([])}
              style={{ padding: '8px 14px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.12)', color: colors.accentRed, border: 'none', fontWeight: '700', cursor: 'pointer', fontSize: '0.84rem' }}
            >
              Clear Cart ({totalUnits})
            </button>
          )}
        </div>

        <form onSubmit={handleManualSearch} style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
          <input
            ref={searchInputRef}
            type="text"
            list="drix-catalog-suggestions"
            placeholder="Scan Barcode or type Product Name (F2)..."
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            autoFocus
          />
          <datalist id="drix-catalog-suggestions">
            {catalog.map((p) => (
              <option key={p._id || p.barcode} value={p.barcode}>
                {p.name} ({p.size}/{p.color}) - ₹{p.price} [Stock: {p.stock_quantity}]
              </option>
            ))}
          </datalist>
          <button
            type="submit"
            className="drix-btn"
            style={{ padding: '0 24px', background: colors.accentBlue, color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '700', fontSize: '0.95rem' }}
          >
            + Add Item
          </button>
        </form>

        <div style={{ flex: 1, overflowY: 'auto', background: isDark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.5)', borderRadius: '14px', border: `1px solid ${colors.glassBorder}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', top: 0, background: isDark ? '#111827' : '#f1f5f9', zIndex: 1 }}>
              <tr>
                <th style={{ padding: '14px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted, fontSize: '0.8rem', textTransform: 'uppercase' }}>Product</th>
                <th style={{ padding: '14px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted, fontSize: '0.8rem', textTransform: 'uppercase' }}>Price</th>
                <th style={{ padding: '14px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted, fontSize: '0.8rem', textTransform: 'uppercase' }}>Quantity</th>
                <th style={{ padding: '14px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted, fontSize: '0.8rem', textTransform: 'uppercase' }}>Total</th>
                <th style={{ padding: '14px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted, fontSize: '0.8rem', textTransform: 'uppercase', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => (
                <tr key={item.barcode} style={{ borderBottom: `1px solid ${colors.glassBorder}` }}>
                  <td style={{ padding: '14px', color: colors.text }}>
                    <div style={{ fontWeight: '700' }}>{item.name}</div>
                    <small style={{ color: colors.textMuted, fontFamily: 'monospace' }}>
                      #{item.barcode} • {item.size || '-'} / {item.color || '-'}
                    </small>
                  </td>
                  <td style={{ padding: '14px', color: colors.text, fontWeight: '600' }}>₹{Number(item.price).toFixed(2)}</td>
                  <td style={{ padding: '14px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: colors.inputBg, padding: '4px 8px', borderRadius: '10px', border: `1px solid ${colors.glassBorder}` }}>
                      <button
                        type="button"
                        className="drix-btn"
                        onClick={() => updateQty(item.barcode, -1)}
                        style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: 'none', color: colors.text, cursor: 'pointer', fontWeight: '800', fontSize: '1rem' }}
                      >
                        −
                      </button>
                      <span style={{ fontWeight: '700', color: colors.text, minWidth: '24px', textAlign: 'center' }}>{item.qty}</span>
                      <button
                        type="button"
                        className="drix-btn"
                        onClick={() => updateQty(item.barcode, 1)}
                        style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.15)', border: 'none', color: colors.accentBlue, cursor: 'pointer', fontWeight: '800', fontSize: '1rem' }}
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: '14px', color: colors.text, fontWeight: '800' }}>
                    ₹{(Number(item.price) * Number(item.qty)).toFixed(2)}
                  </td>
                  <td style={{ padding: '14px', textAlign: 'right' }}>
                    <button
                      type="button"
                      className="drix-btn"
                      onClick={() => updateQty(item.barcode, -item.qty)}
                      style={{ color: colors.accentRed, border: 'none', background: 'rgba(239, 68, 68, 0.12)', padding: '7px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '0.82rem' }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ padding: '60px 20px', textAlign: 'center', color: colors.textMuted }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🛍️</div>
                    <div style={{ fontWeight: '600' }}>Register Cart is Empty</div>
                    <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>Scan a barcode tag or search above to ring up items.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- RIGHT: BILL SUMMARY ---------------- */}
      <div style={{ flex: 1, ...glassStyle, padding: '24px', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginTop: 0, marginBottom: '18px', fontSize: '1.2rem', fontWeight: '800' }}>Checkout Summary</h3>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: colors.textMuted, fontSize: '0.82rem' }}>
            CUSTOMER WHATSAPP / MOBILE
          </label>
          <input
            type="tel"
            maxLength="10"
            placeholder="10-digit mobile number"
            value={customerMobile}
            onChange={(e) => setCustomerMobile(e.target.value.replace(/\D/g, ''))}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: colors.textMuted, fontSize: '0.82rem' }}>
            PAYMENT MODE
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['CASH', 'UPI', 'CARD'].map((mode) => (
              <button
                key={mode}
                type="button"
                className="drix-btn"
                onClick={() => setPaymentMode(mode)}
                style={{
                  flex: 1,
                  padding: '9px',
                  borderRadius: '10px',
                  border: paymentMode === mode ? `1px solid ${colors.accentBlue}` : `1px solid ${colors.glassBorder}`,
                  background: paymentMode === mode ? 'rgba(59, 130, 246, 0.2)' : colors.inputBg,
                  color: paymentMode === mode ? '#fff' : colors.textMuted,
                  fontWeight: '700',
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '0.95rem' }}>
          <span style={{ color: colors.textMuted }}>Items ({totalUnits}):</span>
          <span style={{ color: colors.text, fontWeight: '600' }}>₹{subtotal.toFixed(2)}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
          <span style={{ color: colors.accentRed, fontWeight: '700', fontSize: '0.92rem' }}>Discount (₹):</span>
          <input
            type="number"
            min="0"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            onKeyDown={blockInvalidChars}
            style={{ ...inputStyle, width: '110px', textAlign: 'right', padding: '8px 10px', fontWeight: '700' }}
            placeholder="0"
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '0.95rem' }}>
          <span style={{ color: colors.textMuted }}>GST ({gstRate}%):</span>
          <span style={{ color: colors.text }}>₹{taxAmount.toFixed(2)}</span>
        </div>

        <hr style={{ margin: '14px 0', border: 'none', borderTop: `1px solid ${colors.glassBorder}` }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '1.5rem', fontWeight: '900', color: isReturnMode ? colors.accentRed : colors.accentBlue }}>
          <span>Grand Total</span>
          <span>₹{grandTotal.toFixed(2)}</span>
        </div>

        <button
          type="button"
          className="drix-btn"
          onClick={handlePreview}
          disabled={cart.length === 0}
          style={{
            width: '100%',
            padding: '15px',
            marginTop: 'auto',
            background: isReturnMode
              ? colors.accentRed
              : cart.length > 0
              ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
              : 'rgba(128,128,128,0.15)',
            color: cart.length > 0 ? '#fff' : colors.textMuted,
            border: 'none',
            borderRadius: '12px',
            cursor: cart.length > 0 ? 'pointer' : 'not-allowed',
            fontWeight: '800',
            fontSize: '1.05rem',
            boxShadow: cart.length > 0 ? '0 8px 20px rgba(59, 130, 246, 0.3)' : 'none'
          }}
        >
          {isReturnMode ? 'Preview Return & Restock' : 'Checkout & Print Receipt →'}
        </button>

        <button
          type="button"
          className="drix-btn"
          onClick={() => setIsReturnMode(!isReturnMode)}
          style={{ width: '100%', padding: '11px', marginTop: '10px', background: 'transparent', border: `1px solid ${colors.glassBorder}`, color: colors.textMuted, borderRadius: '12px', cursor: 'pointer', fontWeight: '600', fontSize: '0.88rem' }}
        >
          Switch to {isReturnMode ? 'Standard Sale Mode' : 'Customer Return Mode'}
        </button>
      </div>

      {/* ---------------- RECEIPT PREVIEW & THERMAL PRINT MODAL ---------------- */}
      {showPreview && previewData && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', width: '380px', borderRadius: '18px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '92vh', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ background: '#f8fafc', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.05rem' }}>Thermal Receipt Preview</h3>
              <button type="button" onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            {/* ISOLATED PRINT AREA FOR 80MM THERMAL PRINTER */}
            <div id="drix-print-area" style={{ padding: '20px', overflowY: 'auto', flex: 1, fontFamily: 'monospace', fontSize: '13px', color: '#000', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#444', marginBottom: '8px' }}>
                <span>{previewData.type === 'RETURN' ? 'CREDIT NOTE' : 'ORIGINAL FOR RECIPIENT'}</span>
                <span style={{ fontWeight: 'bold' }}>TAX INVOICE</span>
              </div>

              <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                <h2 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '900' }}>{previewData.storeName}</h2>
                {previewData.storeAddress && <p style={{ margin: 0, whiteSpace: 'pre-line', fontSize: '12px' }}>{previewData.storeAddress}</p>}
                {previewData.storeNumber && <p style={{ margin: '2px 0 0 0', fontSize: '12px' }}>Ph: {previewData.storeNumber}</p>}
              </div>

              <div style={{ borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span>Inv: {previewData.invoice_number}</span>
                <span>{previewData.date}</span>
              </div>

              <div style={{ borderBottom: '1px solid #000', paddingBottom: '8px', marginBottom: '8px', fontSize: '12px' }}>
                BILL TO: {previewData.customer_name} ({previewData.payment_mode})<br />
                {previewData.customer_mobile !== 'N/A' && <>Mobile: {previewData.customer_mobile}<br /></>}
              </div>

              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #000' }}>
                    <th style={{ paddingBottom: '4px', width: '52%' }}>Item</th>
                    <th style={{ paddingBottom: '4px' }}>Qty</th>
                    <th style={{ paddingBottom: '4px', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.items.map((item, idx) => (
                    <React.Fragment key={idx}>
                      <tr>
                        <td colSpan="3" style={{ paddingTop: '5px', fontWeight: 'bold' }}>{item.name} ({item.size || '-'})</td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: '11px', color: '#444' }}>#{item.barcode}</td>
                        <td>{item.qty} x ₹{item.price}</td>
                        <td style={{ textAlign: 'right' }}>₹{(item.price * item.qty).toFixed(2)}</td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>

              <div style={{ borderTop: '1px solid #000', marginTop: '10px', paddingTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span>Sub Total</span>
                  <span>₹{previewData.subtotal.toFixed(2)}</span>
                </div>

                {previewData.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span>Discount</span>
                    <span>- ₹{previewData.discount.toFixed(2)}</span>
                  </div>
                )}

                {previewData.tax_rate > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span>CGST @ {(previewData.tax_rate / 2).toFixed(2)}%</span>
                      <span>₹{previewData.cgst.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span>SGST @ {(previewData.tax_rate / 2).toFixed(2)}%</span>
                      <span>₹{previewData.sgst.toFixed(2)}</span>
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '6px 0', fontWeight: 'bold', fontSize: '15px' }}>
                  <span>Total Amount</span>
                  <span>₹{previewData.total_amount.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ marginTop: '14px', fontSize: '11px' }}>
                <p style={{ margin: '0 0 4px 0', fontWeight: 'bold' }}>Terms & Conditions</p>
                <ol style={{ margin: 0, paddingLeft: '15px' }}>
                  <li>Exchange within 7 days with original bill.</li>
                  <li>No cash refund, exchange only.</li>
                  <li>Price tag must be intact.</li>
                </ol>
                <p style={{ textAlign: 'center', marginTop: '12px', fontWeight: 'bold' }}>Thank you for shopping with us!</p>
              </div>
            </div>

            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                className="drix-btn"
                onClick={sendWhatsAppBill}
                style={{ padding: '12px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700' }}
              >
                Share Bill on Customer WhatsApp 💬
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="drix-btn"
                  onClick={() => setShowPreview(false)}
                  style={{ flex: 1, padding: '12px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '10px', cursor: 'pointer', color: '#0f172a', fontWeight: '700' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="drix-btn"
                  disabled={isProcessing}
                  onClick={confirmAndPrint}
                  style={{ flex: 2, padding: '12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', cursor: isProcessing ? 'wait' : 'pointer', fontWeight: '800' }}
                >
                  {isProcessing ? 'Processing...' : 'Confirm & Print 🖨️'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}