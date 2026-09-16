import React, { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

// Helper to block negative keypresses
const blockInvalidChars = (e) => {
  if (['e', 'E', '+', '-'].includes(e.key)) {
    e.preventDefault();
  }
};

export default function Inventory({ theme }) {
  const [products, setProducts] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null); 
  
  const [editProduct, setEditProduct] = useState(null);
  const [barcodePreview, setBarcodePreview] = useState(null);
  const [printCopies, setPrintCopies] = useState(1);
  const barcodeRef = useRef(null);

  // Dynamic Categories State
  const [savedCategories, setSavedCategories] = useState(['Kurti', 'Top', 'Jeans', 'Dress', 'Saree', 'Accessories']);

  // Base Form Data
  const [formData, setFormData] = useState({
    name: '', 
    category: 'Kurti', 
    color: '', 
    cost_price: '', 
    price: '', 
    raw_file_path: '' 
  });

  // Variant Architecture
  const [variants, setVariants] = useState([{ 
    size: 'M', 
    quantity: '', 
    barcode: Math.floor(1000 + Math.random() * 9000).toString() 
  }]);

  const isDark = theme === 'dark';
  const colors = {
    text: isDark ? '#ffffff' : '#1c1c1e',
    textMuted: isDark ? '#a1a1a6' : '#86868b',
    glassBg: isDark ? 'rgba(30, 30, 30, 0.4)' : 'rgba(255, 255, 255, 0.5)',
    glassBorder: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.5)',
    inputBg: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.7)',
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

  const loadProductsAndSettings = async () => {
    const data = await window.posAPI.getProducts();
    setProducts(data);

    const settings = await window.posAPI.getSettings();
    if (settings.savedCategories && settings.savedCategories.length > 0) {
      setSavedCategories(settings.savedCategories);
    }
  };

  useEffect(() => { 
    loadProductsAndSettings(); 
  }, []);

  useEffect(() => {
    if (barcodePreview && barcodeRef.current) {
      JsBarcode(barcodeRef.current, barcodePreview.barcode, { 
        format: "CODE128", 
        width: 1.5, 
        height: 40, 
        displayValue: true, 
        fontSize: 12, 
        margin: 0 
      });
    }
  }, [barcodePreview]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData({ ...formData, raw_file_path: file.path });
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSaveCategory = async () => {
    const newCat = formData.category.trim();
    if (!newCat) return;
    
    if (!savedCategories.includes(newCat)) {
      const updatedCategories = [...savedCategories, newCat];
      setSavedCategories(updatedCategories);
      await window.posAPI.updateSetting('savedCategories', updatedCategories);
      alert(`"${newCat}" has been permanently saved to your category list!`);
    } else {
      alert(`"${newCat}" is already in your category list.`);
    }
  };

  const addVariantRow = () => {
    setVariants([...variants, { 
      size: 'L', 
      quantity: '', 
      barcode: Math.floor(1000 + Math.random() * 9000).toString() 
    }]);
  };
  
  const updateVariant = (index, field, value) => {
    const newVars = [...variants];
    newVars[index][field] = value;
    setVariants(newVars);
  };
  
  const removeVariantRow = (index) => {
    const newVars = variants.filter((_, i) => i !== index);
    setVariants(newVars);
  };
  
  const generateVariantBarcode = (index) => {
    const newVars = [...variants];
    newVars[index].barcode = Math.floor(1000 + Math.random() * 9000).toString();
    setVariants(newVars);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let savedImagePath = null;
      if (formData.raw_file_path) {
        savedImagePath = await window.posAPI.saveImage(formData.raw_file_path);
      }
      
      let itemsAdded = 0;
      for (const variant of variants) {
        if (variant.quantity && variant.barcode) {
          await window.posAPI.addProduct({
            name: formData.name,
            category: formData.category,
            color: formData.color,
            cost_price: Math.max(0, parseFloat(formData.cost_price)),
            price: Math.max(0, parseFloat(formData.price)),
            image_path: savedImagePath,
            size: variant.size,
            stock_quantity: Math.max(0, parseInt(variant.quantity)),
            barcode: variant.barcode
          });
          itemsAdded++;
        }
      }

      if (itemsAdded > 0) {
        alert(`${itemsAdded} variants added successfully!`);
        setFormData({ 
          name: '', 
          category: formData.category, 
          color: '', 
          cost_price: '', 
          price: '', 
          raw_file_path: '' 
        });
        setVariants([{ 
          size: 'M', 
          quantity: '', 
          barcode: Math.floor(1000 + Math.random() * 9000).toString() 
        }]);
        setPreviewUrl(null);
        loadProductsAndSettings();
      } else {
        alert("Please provide stock quantity and barcodes for at least one variant.");
      }
    } catch (error) {
      alert('Error adding product. Ensure barcodes are unique.');
    }
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    await window.posAPI.updateProduct(editProduct.id, {
      name: editProduct.name, 
      category: editProduct.category, 
      size: editProduct.size, 
      color: editProduct.color,
      cost_price: Math.max(0, parseFloat(editProduct.cost_price)), 
      price: Math.max(0, parseFloat(editProduct.price)),
      stock_quantity: Math.max(0, parseInt(editProduct.stock_quantity)),
      barcode: editProduct.barcode
    });
    alert('Item Updated!');
    setEditProduct(null);
    loadProductsAndSettings();
  };

  // SECURE DELETE HANDLER (NOW USES BARCODE INSTEAD OF ID)
  const handleDelete = async (barcode) => {
    if (window.confirm("Are you sure you want to permanently delete this product?")) {
      await window.posAPI.deleteProduct(barcode);
      loadProductsAndSettings();
    }
  };

  const handleActualPrint = async () => {
    const qtyToPrint = parseInt(printCopies) || 1;
    const result = await window.posAPI.printBarcodeLabel({
      name: barcodePreview.name, 
      size: barcodePreview.size, 
      price: barcodePreview.price, 
      barcode: barcodePreview.barcode, 
      copies: qtyToPrint
    });
    if (result.success) {
      setBarcodePreview(null);
      setPrintCopies(1);
    } else {
      alert("Print failed. Check printer connection.");
    }
  };

  return (
    <div style={{ padding: '30px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', boxSizing: 'border-box' }}>
      <h2 style={{ color: colors.text, marginTop: 0 }}>📦 Inventory & Stock Management</h2>
      
      {/* ---------------- BULK ADD ITEM FORM ---------------- */}
      <div style={{ ...glassStyle, padding: '30px', marginBottom: '30px' }}>
        <h3 style={{ marginTop: 0 }}>Add New Product (Bulk Variants)</h3>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: '20px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: colors.textMuted }}>Item Name:</label>
              <input type="text" name="name" value={formData.name} onChange={handleChange} required style={inputStyle} />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: colors.textMuted }}>Category (Type or Select):</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  list="categories" 
                  name="category" 
                  value={formData.category} 
                  onChange={handleChange} 
                  required 
                  style={{ ...inputStyle, flex: 1 }} 
                />
                <button 
                  type="button" 
                  onClick={handleSaveCategory}
                  title="Save this category permanently"
                  style={{ padding: '0 12px', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: colors.text, border: `1px solid ${colors.glassBorder}`, borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  💾
                </button>
              </div>
              <datalist id="categories">
                {savedCategories.map((cat, index) => (
                  <option key={index} value={cat} />
                ))}
              </datalist>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: colors.textMuted }}>Base Color:</label>
              <input type="text" name="color" value={formData.color} onChange={handleChange} required style={inputStyle} />
            </div>
            
            <div style={{ display: 'flex', gap: '15px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '5px', color: colors.textMuted }}>Cost Price (₹):</label>
                <input type="number" name="cost_price" value={formData.cost_price} onChange={handleChange} onKeyDown={blockInvalidChars} min="0" step="0.01" required style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '5px', color: colors.textMuted }}>Selling Price (₹):</label>
                <input type="number" name="price" value={formData.price} onChange={handleChange} onKeyDown={blockInvalidChars} min="0" step="0.01" required style={inputStyle} />
              </div>
            </div>

            {/* VARIANT GENERATOR TABLE */}
            <div style={{ gridColumn: 'span 2', background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)', padding: '20px', borderRadius: '16px', border: `1px solid ${colors.glassBorder}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h4 style={{ margin: 0, color: colors.text }}>Sizes & Quantities</h4>
                <button 
                  type="button" 
                  onClick={addVariantRow} 
                  style={{ padding: '8px 16px', background: 'rgba(0, 122, 255, 0.1)', color: colors.accentBlue, border: `1px solid rgba(0, 122, 255, 0.3)`, borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  + Add Size Variant
                </button>
              </div>
              
              {variants.map((variant, index) => (
                <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                  <input type="text" placeholder="Size (e.g. M)" value={variant.size} onChange={(e) => updateVariant(index, 'size', e.target.value)} required style={{ ...inputStyle, flex: 1 }} />
                  <input type="number" placeholder="Qty" value={variant.quantity} onChange={(e) => updateVariant(index, 'quantity', e.target.value)} onKeyDown={blockInvalidChars} min="0" required style={{ ...inputStyle, flex: 1 }} />
                  <div style={{ display: 'flex', flex: 2, gap: '5px' }}>
                    <input type="text" placeholder="4-Digit Code" value={variant.barcode} onChange={(e) => updateVariant(index, 'barcode', e.target.value)} required style={{ ...inputStyle, flex: 1 }} />
                    <button type="button" onClick={() => generateVariantBarcode(index)} style={{ padding: '12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '12px', cursor: 'pointer' }}>🎲</button>
                  </div>
                  {variants.length > 1 && (
                    <button type="button" onClick={() => removeVariantRow(index)} style={{ padding: '12px 16px', background: 'rgba(255, 59, 48, 0.1)', color: colors.accentRed, border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                  )}
                </div>
              ))}
            </div>
            
            <button type="submit" style={{ gridColumn: 'span 2', padding: '16px', background: colors.accentBlue, color: 'white', border: 'none', borderRadius: '14px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.05rem', boxShadow: '0 4px 15px rgba(0, 122, 255, 0.3)' }}>
              Save All Variants to Inventory
            </button>
          </div>

          <div style={{ border: `2px dashed ${colors.glassBorder}`, background: isDark ? 'rgba(0,0,0,0.1)' : 'transparent', padding: '20px', borderRadius: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <label style={{ display: 'block', marginBottom: '15px', fontWeight: 'bold', color: colors.textMuted }}>Product Image</label>
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" style={{ width: '130px', height: '130px', objectFit: 'cover', borderRadius: '16px', marginBottom: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }} />
            ) : (
              <div style={{ width: '130px', height: '130px', background: colors.inputBg, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '15px', color: colors.textMuted }}>No Image</div>
            )}
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ width: '100%', fontSize: '0.8rem', color: colors.textMuted }} />
          </div>

        </form>
      </div>

      {/* ---------------- STOCK OVERVIEW TABLE ---------------- */}
      <div style={{ ...glassStyle, padding: '30px' }}>
        <h3 style={{ marginTop: 0 }}>Current Stock Overview</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '15px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted }}>Img</th>
                <th style={{ padding: '15px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted }}>Code</th>
                <th style={{ padding: '15px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted }}>Item</th>
                <th style={{ padding: '15px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted }}>Variant</th>
                <th style={{ padding: '15px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted }}>MRP</th>
                <th style={{ padding: '15px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted }}>Stock</th>
                <th style={{ padding: '15px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted }}>Actions</th> 
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${colors.glassBorder}`, transition: 'background 0.2s' }}>
                  <td style={{ padding: '10px' }}>
                    {p.image_path ? <img src={p.image_path} alt="img" style={{ width: '45px', height: '45px', objectFit: 'cover', borderRadius: '8px' }} /> : '-'}
                  </td>
                  <td style={{ padding: '15px', fontFamily: 'monospace', color: colors.text }}>{p.barcode}</td>
                  <td style={{ padding: '15px', fontWeight: '500', color: colors.text }}>{p.name}</td>
                  <td style={{ padding: '15px', color: colors.text }}>{p.size} / {p.color}</td>
                  <td style={{ padding: '15px', color: colors.text, fontWeight: 'bold' }}>₹{p.price}</td>
                  <td style={{ padding: '15px' }}>
                    <span style={{ color: p.stock_quantity <= 3 ? colors.accentRed : colors.accentGreen, fontWeight: 'bold', padding: '4px 8px', background: p.stock_quantity <= 3 ? 'rgba(255, 59, 48, 0.1)' : 'rgba(52, 199, 89, 0.1)', borderRadius: '6px' }}>
                      {p.stock_quantity}
                    </span>
                  </td>
                  <td style={{ padding: '15px', display: 'flex', gap: '8px' }}>
                    <button onClick={() => setEditProduct(p)} style={{ padding: '8px 14px', background: 'rgba(255, 149, 0, 0.15)', color: colors.accentOrange, border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                      Edit
                    </button>
                    <button onClick={() => setBarcodePreview(p)} style={{ padding: '8px 14px', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: colors.text, border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                      Tags
                    </button>
                    {/* FIXED: Deletes specifically by Barcode to stop the React duplicate key bug */}
                    <button onClick={() => handleDelete(p.barcode)} style={{ padding: '8px 14px', background: 'rgba(255, 59, 48, 0.15)', color: colors.accentRed, border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- FULL EDIT MODAL ---------------- */}
      {editProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: isDark ? '#1c1c1e' : '#ffffff', padding: '30px', borderRadius: '24px', width: '400px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: `1px solid ${colors.glassBorder}` }}>
            <h3 style={{ margin: '0 0 20px 0', color: colors.text }}>Edit Item Data</h3>
            <form onSubmit={submitEdit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Name:</label>
                <input type="text" value={editProduct.name} onChange={(e) => setEditProduct({...editProduct, name: e.target.value})} required style={inputStyle}/>
              </div>
              
              <div>
                <label style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Barcode Code:</label>
                <input type="text" value={editProduct.barcode} onChange={(e) => setEditProduct({...editProduct, barcode: e.target.value})} required style={inputStyle}/>
              </div>

              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Size:</label>
                  <input type="text" value={editProduct.size} onChange={(e) => setEditProduct({...editProduct, size: e.target.value})} required style={inputStyle}/>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Color:</label>
                  <input type="text" value={editProduct.color} onChange={(e) => setEditProduct({...editProduct, color: e.target.value})} required style={inputStyle}/>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Cost (₹):</label>
                  <input type="number" onKeyDown={blockInvalidChars} min="0" step="0.01" value={editProduct.cost_price} onChange={(e) => setEditProduct({...editProduct, cost_price: e.target.value})} required style={inputStyle}/>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: colors.textMuted, fontSize: '0.85rem' }}>MRP (₹):</label>
                  <input type="number" onKeyDown={blockInvalidChars} min="0" step="0.01" value={editProduct.price} onChange={(e) => setEditProduct({...editProduct, price: e.target.value})} required style={inputStyle}/>
                </div>
              </div>
              <div>
                <label style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Total Stock:</label>
                <input type="number" onKeyDown={blockInvalidChars} min="0" value={editProduct.stock_quantity} onChange={(e) => setEditProduct({...editProduct, stock_quantity: e.target.value})} required style={inputStyle}/>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setEditProduct(null)} style={{ flex: 1, padding: '14px', background: colors.inputBg, border: 'none', color: colors.text, borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: '14px', background: colors.accentBlue, color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- BARCODE PRINT MODAL ---------------- */}
      {barcodePreview && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: isDark ? '#1c1c1e' : '#ffffff', padding: '30px', borderRadius: '24px', width: '350px', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: `1px solid ${colors.glassBorder}` }}>
            <h3 style={{ margin: '0 0 20px 0', color: colors.text }}>Print Labels</h3>
            <div style={{ padding: '20px', border: `2px dashed ${colors.glassBorder}`, background: isDark ? 'rgba(0,0,0,0.3)' : '#f9f9f9', borderRadius: '16px', marginBottom: '25px' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 'bold', color: colors.text }}>{barcodePreview.name} ({barcodePreview.size})</p>
              <div style={{ background: 'white', padding: '10px', borderRadius: '8px', display: 'inline-block' }}>
                <svg ref={barcodeRef}></svg>
              </div>
              <p style={{ margin: '10px 0 0 0', fontSize: '15px', fontWeight: 'bold', color: colors.text }}>MRP: ₹{barcodePreview.price}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginBottom: '25px' }}>
              <label style={{ fontWeight: 'bold', color: colors.text }}>Copies:</label>
              <input type="number" onKeyDown={blockInvalidChars} min="1" value={printCopies} onChange={(e) => setPrintCopies(e.target.value)} style={{ width: '80px', padding: '10px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, color: colors.text, borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setBarcodePreview(null); setPrintCopies(1); }} style={{ flex: 1, padding: '14px', background: colors.inputBg, color: colors.text, border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              <button onClick={handleActualPrint} style={{ flex: 2, padding: '14px', background: colors.text, color: isDark ? '#000' : '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Print 🖨️</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}