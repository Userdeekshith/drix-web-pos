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

  // --- CLOUD STORE SETTINGS MANAGEMENT ---
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

  // --- 2. HYBRID INVENTORY (UNIFIED TRUTH ENGINE) ---
  getProducts: async () => {
    let products = [];
    try {
      if (!navigator.onLine) throw new Error('Offline');
      const res = await fetch(`${CLOUD_API}/products`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Fetch failed');
      products = await res.json();
      localStorage.setItem('drix_offline_products_base', JSON.stringify(products));
    } catch (e) {
      products = JSON.parse(localStorage.getItem('drix_offline_products_base') || localStorage.getItem('drix_offline_products') || '[]');
    }

    // Reconcile any unsynced offline bills against cloud stock so stock is always accurate
    const pendingQueue = JSON.parse(localStorage.getItem('drix_pending_sales') || '[]');
    const reconciled = products.map((prod) => ({ ...prod }));

    if (pendingQueue.length > 0) {
      pendingQueue.forEach((invoice) => {
        (invoice.items || []).forEach((item) => {
          const target = reconciled.find((p) => String(p.barcode) === String(item.barcode));
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

  getProductByBarcode: async (barcode) => {
    const clean = String(barcode || '').trim();
    const products = await window.posAPI.getProducts();
    return products.find((p) => String(p.barcode).trim() === clean) || null;
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

  updateProduct: async (targetBarcode, data) => {
    try {
      const lookupCode = targetBarcode || data.barcode;
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

  deleteProduct: async (barcode) => {
    try {
      const res = await fetch(`${CLOUD_API}/products/${encodeURIComponent(barcode)}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // --- 3. HYBRID CHECKOUT & RETURN (OFFLINE QUEUE) ---
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

  // --- UTILITIES & PRINTING ---
  getSettings: async () => JSON.parse(localStorage.getItem('drix_settings') || '{}'),

  updateSetting: async (key, value) => {
    const settings = JSON.parse(localStorage.getItem('drix_settings') || '{}');
    settings[key] = value;
    localStorage.setItem('drix_settings', JSON.stringify(settings));
    return { success: true };
  },

  saveImage: async (fileBlob) => {
    return new Promise((resolve, reject) => {
      if (!fileBlob) return resolve(null);
      if (typeof fileBlob === 'string') return resolve(fileBlob);
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      if (fileBlob instanceof Blob) reader.readAsDataURL(fileBlob);
      else resolve(null);
    });
  },

  getPrinters: async () => [
    { name: 'Native Browser Print Engine', displayName: 'System Default Thermal / Label Printer' }
  ],

  printReceipt: async () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        window.print();
        resolve({ success: true });
      }, 250);
    });
  },

  printBarcodeLabel: async () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        window.print();
        resolve({ success: true });
      }, 250);
    });
  },

  exitApp: () => {
    if (window.drixUpdater && window.drixUpdater.exitApp) {
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
        const p = products.find((prod) => String(prod.barcode) === String(item.barcode));
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