const CLOUD_API = 'https://glamyes-cloud-api.onrender.com/api';
const API_KEY = 'DRIX_SECRET_KEY_2026';

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
  'x-store-id': localStorage.getItem('drix_store_id') || 'DRIX_MASTER'
});

const notify = (msg, type = 'info') => {
  if (window.drixNotify) window.drixNotify(msg, type);
};

// Generates standalone 80mm thermal receipt HTML for direct printing
function buildReceiptHtml(data) {
  const rows = (data.items || [])
    .map(
      (item) => `
      <tr>
        <td colspan="3" style="padding-top:6px;font-weight:bold;">${item.name} (${item.size || '-'})</td>
      </tr>
      <tr>
        <td style="font-size:11px;color:#333;">#${item.barcode}</td>
        <td>${item.qty} x ₹${Number(item.price).toFixed(2)}</td>
        <td style="text-align:right;font-weight:bold;">₹${(Number(item.price) * Number(item.qty)).toFixed(2)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { margin: 0; size: 80mm auto; }
      body {
        margin: 0;
        padding: 4mm;
        width: 72mm;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        color: #000;
        background: #fff;
      }
      table { width: 100%; border-collapse: collapse; }
      .center { text-align: center; }
      .line { border-top: 1px dashed #000; margin: 6px 0; }
      .solid-line { border-top: 1px solid #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; margin: 3px 0; }
    </style>
  </head>
  <body>
    <div class="row" style="font-size:10px;">
      <span>${data.type === 'RETURN' ? 'CREDIT NOTE' : 'ORIGINAL'}</span>
      <b>TAX INVOICE</b>
    </div>
    <div class="center" style="margin:8px 0;">
      <div style="font-size:16px;font-weight:900;">${data.storeName || 'DRIX Store'}</div>
      ${data.storeAddress ? `<div style="white-space:pre-line;font-size:11px;">${data.storeAddress}</div>` : ''}
      ${data.storeNumber ? `<div style="font-size:11px;">Ph: ${data.storeNumber}</div>` : ''}
    </div>
    <div class="line"></div>
    <div class="row" style="font-size:11px;">
      <span>Inv: ${data.invoice_number}</span>
      <span>${data.date}</span>
    </div>
    <div style="font-size:11px;margin-bottom:4px;">
      Customer: ${data.customer_name || 'Walk-in'} (${data.payment_mode || 'CASH'})<br/>
      ${data.customer_mobile && data.customer_mobile !== 'N/A' ? `Mobile: ${data.customer_mobile}` : ''}
    </div>
    <div class="solid-line"></div>
    <table>
      <thead>
        <tr style="border-bottom:1px solid #000;text-align:left;">
          <th style="width:50%;">Item</th>
          <th>Qty</th>
          <th style="text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="solid-line"></div>
    <div class="row"><span>Subtotal</span><span>₹${Number(data.subtotal || 0).toFixed(2)}</span></div>
    ${Number(data.discount) > 0 ? `<div class="row"><span>Discount</span><span>-₹${Number(data.discount).toFixed(2)}</span></div>` : ''}
    ${
      Number(data.tax_rate) > 0
        ? `<div class="row"><span>CGST (${(data.tax_rate / 2).toFixed(1)}%)</span><span>₹${Number(data.cgst || 0).toFixed(2)}</span></div>
           <div class="row"><span>SGST (${(data.tax_rate / 2).toFixed(1)}%)</span><span>₹${Number(data.sgst || 0).toFixed(2)}</span></div>`
        : ''
    }
    <div class="solid-line"></div>
    <div class="row" style="font-size:15px;font-weight:bold;">
      <span>GRAND TOTAL</span>
      <span>₹${Number(data.total_amount || 0).toFixed(2)}</span>
    </div>
    <div class="solid-line"></div>
    <div style="font-size:10px;margin-top:8px;">
      <b>Terms & Conditions:</b><br/>
      1. Exchange within 7 days with original bill.<br/>
      2. No cash refund, exchange only.<br/>
      3. Price tag must be intact.
    </div>
    <div class="center" style="margin-top:10px;font-weight:bold;">Thank you for shopping with us!</div>
  </body>
  </html>`;
}

window.posAPI = {
  // --- 1. HYBRID AUTHENTICATION ---
  checkUsersExist: async () => true,
  loginUser: async (data) => {
    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch(`${CLOUD_API}/auth/web-login`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (json.success) {
        localStorage.setItem('drix_offline_user', JSON.stringify({ ...data, ...json }));
      }
      return json;
    } catch (e) {
      const cached = JSON.parse(localStorage.getItem('drix_offline_user') || 'null');
      if (
        cached &&
        cached.username === data.username &&
        cached.password === data.password &&
        cached.storeId === data.storeId
      ) {
        notify('Logged in via Offline Vault. Changes will queue locally.', 'warning');
        return {
          success: true,
          user: cached.user,
          storeName: cached.storeName,
          storeAddress: cached.storeAddress,
          mobile: cached.mobile
        };
      }
      return { success: false, error: 'Network offline and no cached credentials found.' };
    }
  },

  // --- SUPER ADMIN CLIENT MANAGEMENT ---
  getAllStores: async () => {
    try {
      const res = await fetch(`${CLOUD_API}/admin/stores`, { headers: getHeaders() });
      if (res.ok) return await res.json();
    } catch (e) {}
    return [];
  },

  createClientStore: async (storeData) => {
    try {
      const res = await fetch(`${CLOUD_API}/admin/stores`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(storeData)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  toggleStoreSubscription: async (storeId, newStatus) => {
    try {
      const res = await fetch(`${CLOUD_API}/admin/stores/${storeId}/toggle`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status: newStatus })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  updateStoreProfile: async (profileData) => {
    try {
      const res = await fetch(`${CLOUD_API}/store/profile`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(profileData)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  getCloudSettings: async () => {
    try {
      const res = await fetch(`${CLOUD_API}/store/settings`, { headers: getHeaders() });
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  },

  updateCloudSettings: async (data) => {
    try {
      const res = await fetch(`${CLOUD_API}/store/settings`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // --- 2. HYBRID INVENTORY (MULTI-VARIANT SUPPORT) ---
  getProducts: async () => {
    let products = [];
    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch(`${CLOUD_API}/products`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Fetch failed');
      products = await res.json();
      localStorage.setItem('drix_offline_products_base', JSON.stringify(products));
    } catch (e) {
      products = JSON.parse(
        localStorage.getItem('drix_offline_products_base') ||
          localStorage.getItem('drix_offline_products') ||
          '[]'
      );
    }

    const pendingQueue = JSON.parse(localStorage.getItem('drix_pending_sales') || '[]');
    const reconciled = products.map((prod) => ({ ...prod }));

    if (pendingQueue.length > 0) {
      pendingQueue.forEach((invoice) => {
        (invoice.items || []).forEach((item) => {
          const target = reconciled.find((p) => {
            if (item._id && p._id) return String(p._id) === String(item._id);
            if (item.size) {
              return (
                String(p.barcode) === String(item.barcode) &&
                String(p.size).toLowerCase() === String(item.size).toLowerCase()
              );
            }
            return String(p.barcode) === String(item.barcode);
          });
          if (target) {
            const delta = invoice.type === 'RETURN' ? Number(item.qty || 0) : -Number(item.qty || 0);
            target.stock_quantity = Math.max(0, Number(target.stock_quantity || 0) + delta);
          }
        });
      });
    }

    localStorage.setItem('drix_offline_products', JSON.stringify(reconciled));
    return reconciled;
  },

  // Returns ALL size variants matching a barcode
  getProductsByBarcode: async (barcode) => {
    const clean = String(barcode || '').trim().toLowerCase();
    const products = await window.posAPI.getProducts();
    return products.filter((p) => String(p.barcode).trim().toLowerCase() === clean);
  },

  getProductByBarcode: async (barcode) => {
    const matches = await window.posAPI.getProductsByBarcode(barcode);
    return matches[0] || null;
  },

  addProduct: async (product) => {
    try {
      const res = await fetch(`${CLOUD_API}/products`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(product)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  updateProduct: async (targetIdentifier, data) => {
    try {
      const lookupCode = data._id || targetIdentifier || data.barcode;
      const res = await fetch(`${CLOUD_API}/products/${encodeURIComponent(lookupCode)}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  deleteProduct: async (identifier, size = '', color = '') => {
    try {
      const params = new URLSearchParams();
      if (size) params.set('size', size);
      if (color) params.set('color', color);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`${CLOUD_API}/products/${encodeURIComponent(identifier)}${qs}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // --- 3. HYBRID CHECKOUT & RETURN ---
  checkout: async (invoiceData) => {
    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch(`${CLOUD_API}/checkout`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(invoiceData)
      });
      if (!res.ok) throw new Error('Cloud checkout error');
      return await res.json();
    } catch (e) {
      const pendingQueue = JSON.parse(localStorage.getItem('drix_pending_sales') || '[]');
      const offlineInvoice = {
        ...invoiceData,
        created_at: new Date().toISOString(),
        isOffline: true
      };
      pendingQueue.push(offlineInvoice);
      localStorage.setItem('drix_pending_sales', JSON.stringify(pendingQueue));
      window.dispatchEvent(new Event('drix-queue-updated'));
      return { success: true, invoice: offlineInvoice, offlineSaved: true };
    }
  },

  processReturn: async (returnData) => {
    return await window.posAPI.checkout({ ...returnData, type: 'RETURN' });
  },

  // --- 4. THE SYNC ENGINE ---
  getPendingSalesCount: async () => {
    const pending = JSON.parse(localStorage.getItem('drix_pending_sales') || '[]');
    return pending.length;
  },

  syncPendingSales: async () => {
    if (!navigator.onLine) return { success: false, error: 'Still offline.' };
    const pending = JSON.parse(localStorage.getItem('drix_pending_sales') || '[]');
    if (pending.length === 0) return { success: true, count: 0, remaining: 0 };

    let successCount = 0;
    const failedQueue = [];

    for (const invoice of pending) {
      try {
        const res = await fetch(`${CLOUD_API}/checkout`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(invoice)
        });
        if (res.ok) successCount++;
        else failedQueue.push(invoice);
      } catch (e) {
        failedQueue.push(invoice);
      }
    }

    localStorage.setItem('drix_pending_sales', JSON.stringify(failedQueue));
    window.dispatchEvent(new Event('drix-queue-updated'));
    return { success: failedQueue.length === 0, count: successCount, remaining: failedQueue.length };
  },

  // --- 5. HARDWARE PRINTERS & UTILITIES ---
  getSettings: async () => JSON.parse(localStorage.getItem('drix_settings') || '{}'),

  updateSetting: async (key, value) => {
    const settings = JSON.parse(localStorage.getItem('drix_settings') || '{}');
    settings[key] = value;
    localStorage.setItem('drix_settings', JSON.stringify(settings));
    return { success: true };
  },

  saveImage: async (fileBlob) => {
    return new Promise((resolve) => {
      if (!fileBlob) return resolve(null);
      if (typeof fileBlob === 'string') return resolve(fileBlob);
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      if (fileBlob instanceof Blob) reader.readAsDataURL(fileBlob);
      else resolve(null);
    });
  },

  getPrinters: async () => {
    if (window.drixUpdater?.getPrinters) {
      const list = await window.drixUpdater.getPrinters();
      if (Array.isArray(list) && list.length > 0) return list;
    }
    return [{ name: '', displayName: 'System Default Printer' }];
  },

  printReceipt: async (receiptData) => {
    const settings = JSON.parse(localStorage.getItem('drix_settings') || '{}');
    const selectedPrinter = settings.thermal_printer || '';
    const html = buildReceiptHtml(receiptData);

    // 1. Native Electron Direct Thermal Print
    if (window.drixUpdater?.printHtml) {
      return await window.drixUpdater.printHtml({
        html,
        deviceName: selectedPrinter,
        copies: 1
      });
    }

    // 2. Web Browser Print Fallback (Clean Popup Window)
    return new Promise((resolve) => {
      const win = window.open('', '_blank', 'width=400,height=600');
      if (!win) {
        window.print();
        return resolve({ success: true });
      }
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        win.print();
        win.close();
        resolve({ success: true });
      }, 300);
    });
  },

  printBarcodeLabel: async (labelData) => {
    const settings = JSON.parse(localStorage.getItem('drix_settings') || '{}');
    const selectedPrinter = settings.barcode_printer || '';
    const copies = Math.max(1, parseInt(labelData.copies, 10) || 1);

    const svgElement = document.querySelector('#drix-print-area svg');
    const svgMarkup = svgElement ? svgElement.outerHTML : `<div style="font-family:monospace;font-size:16px;font-weight:bold;">${labelData.barcode}</div>`;

    const singleSticker = `
      <div class="sticker">
        <div style="font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${labelData.name} (${labelData.size || '-'})</div>
        <div style="margin:2px 0;">${svgMarkup}</div>
        <div style="font-size:12px;font-weight:900;">MRP: ₹${labelData.price}</div>
      </div>`;

    const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <style>
          @page { margin: 0; size: 50mm 25mm; }
          body { margin: 0; padding: 0; font-family: sans-serif; background: #fff; color: #000; }
          .sticker {
            width: 48mm;
            height: 23mm;
            padding: 1mm;
            box-sizing: border-box;
            text-align: center;
            page-break-after: always;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          svg { max-width: 44mm; height: 11mm; }
        </style>
      </head>
      <body>${Array(copies).fill(singleSticker).join('')}</body>
      </html>`;

    if (window.drixUpdater?.printHtml) {
      return await window.drixUpdater.printHtml({
        html,
        deviceName: selectedPrinter,
        copies: 1
      });
    }

    return new Promise((resolve) => {
      const win = window.open('', '_blank', 'width=400,height=300');
      if (!win) {
        window.print();
        return resolve({ success: true });
      }
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        win.print();
        win.close();
        resolve({ success: true });
      }, 300);
    });
  },

  exitApp: () => {
    if (window.drixUpdater?.exitApp) {
      window.drixUpdater.exitApp();
    } else {
      window.location.reload();
    }
  },

  getSalesHistory: async () => {
    let cloudSales = [];
    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch(`${CLOUD_API}/sales`, { headers: getHeaders() });
      if (res.ok) {
        cloudSales = await res.json();
        localStorage.setItem('drix_offline_sales_history', JSON.stringify(cloudSales));
      }
    } catch (e) {
      cloudSales = JSON.parse(localStorage.getItem('drix_offline_sales_history') || '[]');
    }
    const pendingQueue = JSON.parse(localStorage.getItem('drix_pending_sales') || '[]');
    return [...pendingQueue.slice().reverse(), ...cloudSales];
  },

  getDashboardStats: async () => {
    const products = await window.posAPI.getProducts();
    const sales = await window.posAPI.getSalesHistory();

    const now = new Date();
    const todayString = now.toDateString();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let turnover_today = 0, profit_today = 0;
    let turnover_month = 0, profit_month = 0;

    sales.forEach((sale) => {
      let saleDate = new Date(sale.created_at || sale.date || new Date());
      if (isNaN(saleDate.getTime())) saleDate = new Date();

      const isToday = saleDate.toDateString() === todayString;
      const isThisMonth = saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear;

      let totalCost = 0;
      const items = Array.isArray(sale.items) ? sale.items : [];

      items.forEach((item) => {
        const p = products.find(
          (prod) =>
            (item._id && String(prod._id) === String(item._id)) ||
            (String(prod.barcode) === String(item.barcode) && String(prod.size) === String(item.size))
        );
        const cost = item.cost_price !== undefined ? Number(item.cost_price) : p ? Number(p.cost_price || 0) : 0;
        totalCost += cost * Number(item.qty || 0);
      });

      const safeTotalAmount = Number(sale.total_amount || 0);
      const revenue = sale.type === 'RETURN' ? -safeTotalAmount : safeTotalAmount;
      const profit = sale.type === 'RETURN' ? -(safeTotalAmount - totalCost) : safeTotalAmount - totalCost;

      if (isToday) {
        turnover_today += revenue;
        profit_today += profit;
      }
      if (isThisMonth) {
        turnover_month += revenue;
        profit_month += profit;
      }
    });

    let total_retail_value = 0, total_invested = 0;
    products.forEach((p) => {
      const qty = Number(p.stock_quantity || 0);
      if (qty > 0) {
        total_retail_value += Number(p.price || 0) * qty;
        total_invested += Number(p.cost_price || 0) * qty;
      }
    });

    return {
      salesStats: { turnover_today, profit_today, turnover_month, profit_month },
      stockValuation: { total_retail_value, total_invested }
    };
  }
};