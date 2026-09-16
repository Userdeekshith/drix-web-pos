const CLOUD_API = 'https://glamyes-cloud-api.onrender.com/api';
const API_KEY = 'GLAMYES_SECRET_KEY_2026';

const getHeaders = () => {
  return {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    'x-store-id': localStorage.getItem('drix_store_id') || 'GLAMYES_MASTER'
  };
};

window.posAPI = {
  // --- AUTHENTICATION ---
  checkUsersExist: async () => true, 
  loginUser: async (data) => {
    try {
      const res = await fetch(`${CLOUD_API}/auth/web-login`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: 'Network Error connecting to DRIX Cloud.' };
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
  // --- MULTI-TENANT INVENTORY ---
  getProducts: async () => {
    try {
      const res = await fetch(`${CLOUD_API}/products`, { headers: getHeaders() });
      if (!res.ok) return [];
      return await res.json();
    } catch (e) { return []; }
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

  // --- MULTI-TENANT SALES ---
  checkout: async (invoiceData) => {
    const res = await fetch(`${CLOUD_API}/checkout`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(invoiceData) });
    return await res.json();
  },

  processReturn: async (returnData) => {
    const res = await fetch(`${CLOUD_API}/checkout`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(returnData) });
    return await res.json();
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

  // --- DRIX CLOUD ANALYTICS ENGINE ---
  getDashboardStats: async () => {
    const products = await window.posAPI.getProducts();
    let sales = [];
    
    try {
      const res = await fetch(`${CLOUD_API}/sales`, { headers: getHeaders() });
      if (res.ok) sales = await res.json();
    } catch (e) { console.error("Could not fetch sales history"); }

    const now = new Date();
    const todayString = now.toDateString();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let turnover_today = 0, profit_today = 0;
    let turnover_month = 0, profit_month = 0;

    sales.forEach(sale => {
      let saleDate = new Date(sale.created_at);
      if (isNaN(saleDate.getTime())) saleDate = new Date();

      const isToday = saleDate.toDateString() === todayString;
      const isThisMonth = saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear;

      let totalCost = 0;
      const items = Array.isArray(sale.items) ? sale.items : [];
      
      items.forEach(item => {
         const p = products.find(prod => prod.barcode === item.barcode);
         const cost = p ? (p.cost_price || 0) : (item.price || 0); // fallback if cost price missing
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
  },

  getSalesHistory: async () => {
    try {
      const res = await fetch(`${CLOUD_API}/sales`, { headers: getHeaders() });
      if (res.ok) return await res.json();
    } catch (e) {}
    return [];
  }
};