import React, { useState, useEffect, useRef } from 'react';

const blockInvalidChars = (e) => {
  if (['e', 'E', '+', '-'].includes(e.key)) {
    e.preventDefault();
  }
};

// NEW: Accepts storeDetails prop dynamically
export default function Billing({ theme, storeDetails }) {
  const [cart, setCart] = useState([]);
  const [settings, setSettings] = useState({});
  const [isReturnMode, setIsReturnMode] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  
  const [discount, setDiscount] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const [systemMessage, setSystemMessage] = useState({ text: '', type: '' });

  const barcodeBuffer = useRef('');
  const barcodeTimeout = useRef(null);
  const latestCart = useRef(cart);
  const latestShowPreview = useRef(showPreview);
  const latestIsReturnMode = useRef(isReturnMode);

  useEffect(() => { latestCart.current = cart; }, [cart]);
  useEffect(() => { latestShowPreview.current = showPreview; }, [showPreview]);
  useEffect(() => { latestIsReturnMode.current = isReturnMode; }, [isReturnMode]);

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

  const glassStyle = {
    background: colors.glassBg,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${colors.glassBorder}`,
    borderRadius: '16px',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1)',
    color: colors.text
  };

  const inputStyle = {
    padding: '12px',
    background: colors.inputBg,
    border: `1px solid ${colors.glassBorder}`,
    borderRadius: '12px',
    color: colors.text,
    outline: 'none',
    fontSize: '1rem',
    width: '100%',
    boxSizing: 'border-box'
  };

  const showMessage = (text, type = 'error') => {
    setSystemMessage({ text, type });
    setTimeout(() => setSystemMessage({ text: '', type: '' }), 3000);
  };

  useEffect(() => {
    window.posAPI.getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    const handleGlobalScan = async (e) => {
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
          if (!product) return showMessage(`Barcode ${cleanBarcode} not found!`);
          
          addToCart(product);
        }
      } else {
        if (e.key.length === 1) { 
          barcodeBuffer.current += e.key;
          clearTimeout(barcodeTimeout.current);
          barcodeTimeout.current = setTimeout(() => { 
            barcodeBuffer.current = ''; 
          }, 150);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalScan);
    return () => {
      window.removeEventListener('keydown', handleGlobalScan);
      clearTimeout(barcodeTimeout.current);
    };
  }, []); 

  const sendWhatsAppBill = () => {
    if (!previewData.customer_mobile || previewData.customer_mobile === 'N/A') {
      return showMessage("Please enter a mobile number first.");
    }

    // NEW: Dynamic WhatsApp Branding
    let text = `*${storeDetails?.storeName || 'Store Invoice'}*\n`;
    text += `Inv: ${previewData.invoice_number} | Date: ${previewData.date.split(',')[0]}\n`;
    text += `--------------------------------\n`;
    
    previewData.items.forEach(item => {
      text += `${item.name}\n${item.qty} x ₹${item.price} = ₹${item.price * item.qty}\n`;
    });
    
    text += `--------------------------------\n`;
    text += `Subtotal: ₹${previewData.subtotal.toFixed(2)}\n`;
    
    if (previewData.discount > 0) {
      text += `Discount: -₹${previewData.discount.toFixed(2)}\n`;
    }
    
    text += `*Total Amount: ₹${previewData.total_amount.toFixed(2)}*\n\n`;
    text += `Thank you for shopping with us! 🛍️`;

    const encodedText = encodeURIComponent(text);
    const waNumber = previewData.customer_mobile.length === 10 ? `91${previewData.customer_mobile}` : previewData.customer_mobile;
    
    window.open(`https://api.whatsapp.com/send?phone=${waNumber}&text=${encodedText}`, '_blank');
  };

  const handleManualSearch = async (e) => {
    e.preventDefault();
    const cleanBarcode = manualBarcode.trim(); 
    if (!cleanBarcode) return;
    
    const product = await window.posAPI.getProductByBarcode(cleanBarcode);
    if (!product) {
      showMessage(`Barcode ${cleanBarcode} not found!`);
      setManualBarcode(''); 
      return;
    }
    
    addToCart(product);
    setManualBarcode(''); 
  };

  const addToCart = (product) => {
    if (product.stock_quantity <= 0 && !latestIsReturnMode.current) {
      return showMessage(`Cannot add ${product.name}. Item is OUT OF STOCK!`);
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock_quantity && !latestIsReturnMode.current) {
           showMessage(`Only ${product.stock_quantity} units of ${product.name} left!`);
           return prev; 
        }
        return prev.map((item) => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { ...product, qty: 1, cost_price: product.cost_price }];
    });
  };

  const updateQty = (id, delta) => {
    setCart((prev) => {
      return prev.map((item) => {
        if (item.id === id) {
          const newQty = item.qty + delta;
          if (newQty > item.stock_quantity && delta > 0 && !isReturnMode) {
            showMessage(`Cannot increase. Only ${item.stock_quantity} units left!`);
            return item; 
          }
          return { ...item, qty: newQty };
        }
        return item;
      }).filter((item) => item.qty > 0);
    });
  };

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
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
      customer_mobile: customerMobile || 'N/A', 
      subtotal,
      discount: discountValue,
      tax_rate: gstRate,
      tax_amount: taxAmount,
      cgst: taxAmount / 2,
      sgst: taxAmount / 2,
      total_amount: grandTotal,
      payment_mode: 'CASH',
      items: cart,
      type: isReturnMode ? 'RETURN' : 'SALE',
      // NEW: Inject Dynamic Store Values for Printing
      storeName: storeDetails?.storeName || "DRIX Partner Store", 
      storeAddress: storeDetails?.storeAddress || "Address Not Configured",
      storeNumber: storeDetails?.mobile || "",
      date: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    };

    setPreviewData(payload);
    setShowPreview(true);
  };

  const confirmAndPrint = async () => {
    if (isReturnMode) {
      await window.posAPI.processReturn(previewData);
      showMessage('Return processed & Stock Restocked!', 'success');
    } else {
      await window.posAPI.checkout(previewData);
      const printResult = await window.posAPI.printReceipt(previewData); 
      if (!printResult.success) {
        showMessage('Sale saved, but receipt printing failed. Check printer.', 'error');
      } else {
        showMessage('Sale Completed Successfully!', 'success');
      }
    }

    setCart([]);
    setDiscount('');
    setCustomerMobile(''); 
    setIsReturnMode(false);
    setShowPreview(false);
  };

  return (
    <div style={{ display: 'flex', gap: '20px', padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', boxSizing: 'border-box', position: 'relative' }}>
      
      {/* ---------------- BILLING UI ---------------- */}
      <div style={{ flex: 2, ...glassStyle, padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ marginTop: 0 }}>{isReturnMode ? '⚠️ Processing Return (Restock Mode)' : '🛒 Billing Register'}</h2>
        
        {systemMessage.text && (
          <div style={{ 
            padding: '10px', 
            marginBottom: '15px', 
            borderRadius: '12px', 
            fontWeight: 'bold',
            textAlign: 'center',
            background: systemMessage.type === 'success' ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)',
            color: systemMessage.type === 'success' ? colors.accentGreen : colors.accentRed,
            border: `1px solid ${systemMessage.type === 'success' ? 'rgba(52, 199, 89, 0.3)' : 'rgba(255, 59, 48, 0.3)'}`
          }}>
            {systemMessage.text}
          </div>
        )}

        <form onSubmit={handleManualSearch} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <input 
            type="text" 
            placeholder="Scan or Enter Barcode..." 
            value={manualBarcode} 
            onChange={(e) => setManualBarcode(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            autoFocus
          />
          <button type="submit" style={{ padding: '10px 20px', background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.8)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
            Add
          </button>
        </form>

        <div style={{ flex: 1, overflowY: 'auto', background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)', borderRadius: '12px', border: `1px solid ${colors.glassBorder}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', top: 0, background: isDark ? 'rgba(40,40,40,0.9)' : 'rgba(240,240,240,0.9)', backdropFilter: 'blur(10px)' }}>
              <tr>
                <th style={{ padding: '12px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.text }}>Item</th>
                <th style={{ padding: '12px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.text }}>Price</th>
                <th style={{ padding: '12px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.text }}>Qty</th>
                <th style={{ padding: '12px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.text }}>Total</th>
                <th style={{ padding: '12px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.text }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => (
                <tr key={item.id} style={{ borderBottom: `1px solid ${colors.glassBorder}` }}>
                  <td style={{ padding: '12px', color: colors.text }}>
                    {item.name} <br/>
                    <small style={{ color: colors.textMuted }}>{item.size}/{item.color}</small>
                  </td>
                  <td style={{ padding: '12px', color: colors.text }}>₹{item.price}</td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: colors.inputBg, padding: '4px 8px', borderRadius: '8px', width: 'fit-content' }}>
                      <button type="button" onClick={() => updateQty(item.id, -1)} style={{ background: 'transparent', border: 'none', color: colors.text, cursor: 'pointer', fontSize: '1.2rem' }}>-</button>
                      <span style={{ fontWeight: '600', color: colors.text, minWidth: '20px', textAlign: 'center' }}>{item.qty}</span>
                      <button type="button" onClick={() => updateQty(item.id, 1)} style={{ background: 'transparent', border: 'none', color: colors.text, cursor: 'pointer', fontSize: '1.2rem' }}>+</button>
                    </div>
                  </td>
                  <td style={{ padding: '12px', color: colors.text, fontWeight: 'bold' }}>₹{item.price * item.qty}</td>
                  <td style={{ padding: '12px' }}>
                    <button type="button" onClick={() => updateQty(item.id, -item.qty)} style={{ color: colors.accentRed, border: 'none', background: 'rgba(255, 59, 48, 0.1)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: colors.textMuted }}>
                    Scan or enter a barcode to begin
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- SUMMARY & PAYMENT UI ---------------- */}
      <div style={{ flex: 1, ...glassStyle, padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginTop: 0 }}>Bill Summary</h3>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: colors.textMuted, fontSize: '0.9rem' }}>Customer Mobile Number:</label>
          <input 
            type="tel" 
            maxLength="10" 
            placeholder="e.g. 9876543210" 
            value={customerMobile} 
            onChange={(e) => setCustomerMobile(e.target.value)} 
            style={inputStyle} 
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
          <span style={{ color: colors.textMuted }}>Subtotal:</span>
          <span style={{ color: colors.text }}>₹{subtotal.toFixed(2)}</span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
          <span style={{ color: colors.accentRed, fontWeight: 'bold' }}>Discount (₹):</span>
          <input 
            type="number" 
            min="0"
            value={discount} 
            onChange={(e) => setDiscount(e.target.value)} 
            onKeyDown={blockInvalidChars} 
            style={{ ...inputStyle, width: '100px', textAlign: 'right', padding: '8px' }} 
            placeholder="0"
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
          <span style={{ color: colors.textMuted }}>GST ({gstRate}%):</span>
          <span style={{ color: colors.text }}>₹{taxAmount.toFixed(2)}</span>
        </div>
        
        <hr style={{ margin: '15px 0', border: 'none', borderTop: `1px solid ${colors.glassBorder}` }} />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.4rem', fontWeight: 'bold', color: isReturnMode ? colors.accentRed : colors.accentBlue }}>
          <span>Grand Total:</span>
          <span>₹{grandTotal.toFixed(2)}</span>
        </div>

        <button 
          type="button"
          onClick={handlePreview} 
          disabled={cart.length === 0} 
          style={{ width: '100%', padding: '15px', marginTop: 'auto', backgroundColor: isReturnMode ? colors.accentRed : (cart.length > 0 ? colors.accentBlue : 'rgba(0,0,0,0.1)'), color: cart.length > 0 ? '#fff' : colors.textMuted, border: 'none', borderRadius: '12px', cursor: cart.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '1.1rem', transition: 'all 0.3s ease' }}
        >
          {isReturnMode ? 'Preview Return' : 'Preview & Options'}
        </button>
        
        <button 
          type="button"
          onClick={() => setIsReturnMode(!isReturnMode)} 
          style={{ width: '100%', padding: '12px', marginTop: '15px', background: 'transparent', border: `1px solid ${colors.glassBorder}`, color: colors.text, borderRadius: '12px', cursor: 'pointer' }}
        >
          Switch to {isReturnMode ? 'Sale Mode' : 'Return Mode'}
        </button>
      </div>

      {/* ---------------- BILL PREVIEW MODAL ---------------- */}
      {showPreview && previewData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', width: '380px', padding: '0', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '95vh', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            
            <div style={{ background: '#f8f9fa', padding: '15px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ddd' }}>
              <h3 style={{ margin: 0, color: '#1c1c1e' }}>Receipt Preview</h3>
              <button onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#86868b' }}>✕</button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, fontFamily: 'monospace', fontSize: '13px', color: '#000', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginBottom: '10px' }}>
                <span>ORIGINAL FOR RECIPIENT</span>
                <span style={{ fontWeight: 'bold' }}>TAX INVOICE</span>
              </div>
              
              <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                <h2 style={{ margin: '0 0 5px 0', fontSize: '18px' }}>{previewData.storeName}</h2>
                <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{previewData.storeAddress}</p>
                {previewData.storeNumber && <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{previewData.storeNumber}</p>}
              </div>
              
              <div style={{ borderBottom: '1px dashed #000', paddingBottom: '10px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Inv: {previewData.invoice_number}</span>
                <span>{previewData.date}</span>
              </div>
              
              <div style={{ borderBottom: '1px solid #000', paddingBottom: '10px', marginBottom: '10px' }}>
                BILL TO: {previewData.customer_name}<br/>
                {previewData.customer_mobile !== 'N/A' && <>Mobile: {previewData.customer_mobile}<br/></>}
              </div>

              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #000' }}>
                    <th style={{ paddingBottom: '5px', width: '50%' }}>Item</th>
                    <th style={{ paddingBottom: '5px' }}>Qty</th>
                    <th style={{ paddingBottom: '5px', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.items.map((item, idx) => (
                    <React.Fragment key={idx}>
                      <tr>
                        <td colSpan="3" style={{ paddingTop: '5px' }}>{item.name}</td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: '11px', color: '#555' }}>GST {previewData.tax_rate}%</td>
                        <td>{item.qty} <span style={{ fontSize:'10px' }}>x ₹{item.price}</span></td>
                        <td style={{ textAlign: 'right' }}>₹{(item.price * item.qty).toFixed(2)}</td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>

              <div style={{ borderTop: '1px solid #000', marginTop: '10px', paddingTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span>Sub Total</span>
                  <span>₹{previewData.subtotal.toFixed(2)}</span>
                </div>
                
                {previewData.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', color: '#d9534f' }}>
                    <span>Discount</span>
                    <span>- ₹{previewData.discount.toFixed(2)}</span>
                  </div>
                )}
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span>Taxable Amount</span>
                  <span>₹{(previewData.subtotal - previewData.discount).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span>CGST @ {(previewData.tax_rate / 2).toFixed(2)}%</span>
                  <span>₹{previewData.cgst.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>SGST @ {(previewData.tax_rate / 2).toFixed(2)}%</span>
                  <span>₹{previewData.sgst.toFixed(2)}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '5px 0', fontWeight: 'bold', fontSize: '15px' }}>
                  <span>Total Amount</span>
                  <span>₹{previewData.total_amount.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ marginTop: '15px', fontSize: '11px' }}>
                <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>Terms & Conditions</p>
                <ol style={{ margin: 0, paddingLeft: '15px' }}>
                  <li>Exchange within 7 days with bill.</li>
                  <li>No cash refund, only exchange.</li>
                  <li>Garment tag must be intact.</li>
                </ol>
                <p style={{ textAlign: 'center', marginTop: '15px', fontWeight: 'bold' }}>Thank you for shopping with us!</p>
              </div>
            </div>

            <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#f8f9fa', borderTop: '1px solid #ddd' }}>
              <button 
                onClick={sendWhatsAppBill} 
                style={{ padding: '12px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Share Bill via WhatsApp 💬
              </button>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => setShowPreview(false)} 
                  style={{ flex: 1, padding: '12px', background: '#fff', border: '1px solid #ccc', borderRadius: '12px', cursor: 'pointer', color: '#1c1c1e', fontWeight: 'bold' }}
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmAndPrint} 
                  style={{ flex: 2, padding: '12px', background: '#007aff', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Confirm & Print 🖨️
                </button>
              </div>
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}