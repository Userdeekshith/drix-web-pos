const CLOUD_API = 'https://glamyes-cloud-api.onrender.com/api';

// UPDATED: Rebranded DRIX API Key to match backend
const API_KEY = 'DRIX_SECRET_KEY_2026';

const getHeaders = () => {
  return {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    'x-store-id': localStorage.getItem('drix_store_id') || 'DRIX_MASTER'
  };
};

window.posAPI = {
  // --- 1. HYBRID AUTHENTICATION ---
  checkUsersExist: async () => true, 
  loginUser: async (data) => {
    try {
      if (!navigator.onLine) throw new Error("Offline");
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
      const cached = JSON.parse(localStorage.getItem('drix_offline_user'));
      if (cached && cached.username === data.username && cached.password === data.password && cached.storeId === data.storeId) {
        alert("⚠️ No Internet Connection. You have been logged in using Offline Mode.");
        return { success: true, user: cached.user, storeName: cached.storeName, storeAddress: cached.storeAddress, mobile: cached.mobile };
      }
      return { success: false, error: 'Network Offline. No cached login found for these credentials.' };
    }
  },

  // --- SUPER ADMIN CLIENT MANAGEMENT ---
  getAllStores: async () => {
    try {
      const res = await fetch(`${CLOUD_API}/admin/stores`, { headers: getHeaders() });
      if (res.ok) return await res.json();
    } catch (e) { return []; }
  },

  createClientStore: async (storeData) => {
    const res = await fetch(`${CLOUD_API}/admin/stores`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(storeData)
    });
    return await res.json();
  },

  toggleStoreSubscription: async (storeId, newStatus) => {
    const res = await fetch(`${CLOUD_API}/admin/stores/${storeId}/toggle`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ status: newStatus })
    });
    return await res.json();
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

  // --- 2. HYBRID INVENTORY ---
  getProducts: async () => {
    try {
      if (!navigator.onLine) throw new Error("Offline");
      const res = await fetch(`${CLOUD_API}/products`, { headers: getHeaders() });
      if (!res.ok) throw new Error("Fetch failed");
      const products = await res.json();
      
      localStorage.setItem('drix_offline_products', JSON.stringify(products));
      return products;
    } catch (e) {
      return JSON.parse(localStorage.getItem('drix_offline_products') || '[]');
    }
  },
  
  getProductByBarcode: async (barcode) => {
    const products = await window.posAPI.getProducts();
    return products.find(p => p.barcode === barcode) || null;
  },

  addProduct: async (product) => {
    const res = await fetch(`${CLOUD_API}/products`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(product) });
    return await res.json();
  },

  updateProduct: async (id, data) => {
    const res = await fetch(`${CLOUD_API}/products/${data.barcode}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) });
    return await res.json();
  },

  deleteProduct: async (barcode) => {
    const res = await fetch(`${CLOUD_API}/products/${barcode}`, { method: 'DELETE', headers: getHeaders() });
    return await res.json();
  },

  // --- 3. HYBRID CHECKOUT (OFFLINE QUEUE) ---
  checkout: async (invoiceData) => {
    try {
      if (!navigator.onLine) throw new Error("Offline");
      const res = await fetch(`${CLOUD_API}/checkout`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(invoiceData) });
      return await res.json();
    } catch (e) {
      const pendingQueue = JSON.parse(localStorage.getItem('drix_pending_sales') || '[]');
      invoiceData.isOffline = true;
      pendingQueue.push(invoiceData);
      localStorage.setItem('drix_pending_sales', JSON.stringify(pendingQueue));

      const cachedProducts = JSON.parse(localStorage.getItem('drix_offline_products') || '[]');
      invoiceData.items.forEach(item => {
         const p = cachedProducts.find(prod => prod.barcode === item.barcode);
         if (p) p.stock_quantity -= (invoiceData.type === 'RETURN' ? -item.qty : item.qty);
      });
      localStorage.setItem('drix_offline_products', JSON.stringify(cachedProducts));

      return { success: true, invoice: invoiceData, offlineSaved: true };
    }
  },

  processReturn: async (returnData) => {
    const res = await fetch(`${CLOUD_API}/checkout`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(returnData) });
    return await res.json();
  },

  // --- 4. THE SYNC ENGINE ---
  getPendingSalesCount: async () => {
    const pending = JSON.parse(localStorage.getItem('drix_pending_sales') || '[]');
    return pending.length;
  },

  syncPendingSales: async () => {
    if (!navigator.onLine) return { success: false, error: "Still offline." };
    const pending = JSON.parse(localStorage.getItem('drix_pending_sales') || '[]');
    if (pending.length === 0) return { success: true, count: 0 };

    let successCount = 0;
    let failedQueue = [];

    for (const invoice of pending) {
      try {
        const res = await fetch(`${CLOUD_API}/checkout`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(invoice) });
        if (res.ok) successCount++;
        else failedQueue.push(invoice);
      } catch (e) {
        failedQueue.push(invoice);
      }
    }
    
    localStorage.setItem('drix_pending_sales', JSON.stringify(failedQueue));
    return { success: failedQueue.length === 0, count: successCount, remaining: failedQueue.length };
  },

  // --- WEB-NATIVE UTILITIES ---
  getSettings: async () => {
    return JSON.parse(localStorage.getItem('drix_settings') || '{}');
  },
  
  updateSetting: async (key, value) => {
    const settings = JSON.parse(localStorage.getItem('drix_settings') || '{}');
    settings[key] = value;
    localStorage.setItem('drix_settings', JSON.stringify(settings));
    return { success: true };
  },

  saveImage: async (fileBlob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      if (fileBlob instanceof Blob) reader.readAsDataURL(fileBlob);
      else resolve(fileBlob); 
    });
  },

  getPrinters: async () => {
    return [{ name: "Native Browser Print Engine", displayName: "System Default Printer" }];
  },

  printReceipt: async (data) => {
    setTimeout(() => window.print(), 500);
    return { success: true };
  },

  printBarcodeLabel: async (data) => {
    setTimeout(() => window.print(), 500);
    return { success: true };
  },

  getSalesHistory: async () => {
    try {
      const res = await fetch(`${CLOUD_API}/sales`, { headers: getHeaders() });
      if (res.ok) return await res.json();
    } catch (e) {}
    return [];
  },

  // --- HYBRID DASHBOARD STATS ---
  getDashboardStats: async () => {
    const products = await window.posAPI.getProducts();
    let sales = [];
    
    try {
      const res = await fetch(`${CLOUD_API}/sales`, { headers: getHeaders() });
      if (res.ok) sales = await res.json();
    } catch (e) {
      sales = JSON.parse(localStorage.getItem('drix_pending_sales') || '[]');
    }

    const now = new Date();
    const todayString = now.toDateString();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let turnover_today = 0, profit_today = 0;
    let turnover_month = 0, profit_month = 0;

    sales.forEach(sale => {
      let saleDate = new Date(sale.created_at || sale.date || new Date());
      if (isNaN(saleDate.getTime())) saleDate = new Date();

      const isToday = saleDate.toDateString() === todayString;
      const isThisMonth = saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear;

      let totalCost = 0;
      const items = Array.isArray(sale.items) ? sale.items : [];
      
      items.forEach(item => {
         const p = products.find(prod => prod.barcode === item.barcode);
         const cost = p ? (p.cost_price || 0) : (item.price || 0); 
         totalCost += (cost * (item.qty || 0));
      });

      const safeTotalAmount = sale.total_amount || 0;
      const revenue = sale.type === 'RETURN' ? -safeTotalAmount : safeTotalAmount;
      const profit = sale.type === 'RETURN' ? -(safeTotalAmount - totalCost) : (safeTotalAmount - totalCost);

      if (isToday) { turnover_today += revenue; profit_today += profit; }
      if (isThisMonth) { turnover_month += revenue; profit_month += profit; }
    });

    let total_retail_value = 0, total_invested = 0;
    products.forEach(p => {
       const qty = p.stock_quantity || 0;
       if (qty > 0) {
           total_retail_value += ((p.price || 0) * qty);
           total_invested += ((p.cost_price || 0) * qty);
       }
    });

    return {
       salesStats: { turnover_today, profit_today, turnover_month, profit_month },
       stockValuation: { total_retail_value, total_invested }
    };
  }
};