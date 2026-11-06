import React, { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

const blockInvalidChars = (e) => {
  if (['e', 'E', '+', '-'].includes(e.key)) {
    e.preventDefault();
  }
};

export default function Inventory({ theme }) {
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [editProduct, setEditProduct] = useState(null);
  const [barcodePreview, setBarcodePreview] = useState(null);
  const [printCopies, setPrintCopies] = useState(1);
  const barcodeRef = useRef(null);

  const [savedCategories, setSavedCategories] = useState([
    'Kurti', 'Top', 'Jeans', 'Dress', 'Saree', 'Jewellery', 'Accessories'
  ]);

  const [formData, setFormData] = useState({
    name: '',
    category: 'Kurti',
    color: '',
    cost_price: '',
    price: ''
  });

  const [variants, setVariants] = useState([
    {
      size: 'M',
      quantity: '',
      barcode: Math.floor(1000 + Math.random() * 9000).toString()
    }
  ]);

  const notify = (msg, type = 'info') => {
    if (window.drixNotify) window.drixNotify(msg, type);
  };

  const loadProductsAndSettings = async () => {
    const data = await window.posAPI.getProducts();
    setProducts(Array.isArray(data) ? data : []);

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
        format: 'CODE128',
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
      setSelectedFile(file);
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
      notify(`"${newCat}" saved to your category list!`, 'success');
    } else {
      notify(`"${newCat}" is already in your category list.`, 'info');
    }
  };

  // Copies the first variant's barcode by default so you can easily use 1 barcode for all sizes
  const addVariantRow = () => {
    const defaultSizes = ['M', 'L', 'XL', 'XXL', '3XL'];
    const nextSize = defaultSizes[variants.length] || 'Free';
    const baseBarcode = variants[0]?.barcode || Math.floor(1000 + Math.random() * 9000).toString();
    setVariants([
      ...variants,
      {
        size: nextSize,
        quantity: variants[0]?.quantity || '1',
        barcode: baseBarcode
      }
    ]);
  };

  const copyFirstBarcodeToAll = () => {
    if (variants.length === 0) return;
    const base = variants[0].barcode.split('-')[0].trim();
    setVariants(variants.map((v) => ({ ...v, barcode: base })));
    notify(`Applied barcode "${base}" across all ${variants.length} sizes.`, 'info');
  };

  const autoSuffixBarcodesBySize = () => {
    if (variants.length === 0) return;
    const base = variants[0].barcode.split('-')[0].trim();
    setVariants(
      variants.map((v) => ({
        ...v,
        barcode: `${base}-${String(v.size || 'S').trim().toUpperCase()}`
      }))
    );
    notify(`Generated size-specific barcodes (${base}-M, ${base}-L, etc.)!`, 'success');
  };

  const updateVariant = (index, field, value) => {
    const newVars = [...variants];
    newVars[index][field] = value;
    setVariants(newVars);
  };

  const removeVariantRow = (index) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  const generateVariantBarcode = (index) => {
    const newVars = [...variants];
    newVars[index].barcode = Math.floor(1000 + Math.random() * 9000).toString();
    setVariants(newVars);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);

    try {
      let savedImagePath = null;
      if (selectedFile) {
        savedImagePath = await window.posAPI.saveImage(selectedFile);
      }

      let itemsAdded = 0;
      let lastError = '';

      for (const variant of variants) {
        if (variant.quantity !== '' && variant.barcode) {
          const res = await window.posAPI.addProduct({
            name: formData.name.trim(),
            category: formData.category.trim(),
            color: formData.color.trim(),
            cost_price: Math.max(0, parseFloat(formData.cost_price || 0)),
            price: Math.max(0, parseFloat(formData.price || 0)),
            image_path: savedImagePath,
            size: String(variant.size || '').trim().toUpperCase(),
            stock_quantity: Math.max(0, parseInt(variant.quantity, 10)),
            barcode: String(variant.barcode).trim()
          });

          if (res && res.success !== false) {
            itemsAdded++;
          } else {
            lastError = res?.error || 'Database rejected variant';
          }
        }
      }

      if (itemsAdded > 0) {
        notify(`Successfully saved ${itemsAdded} of ${variants.length} size variant(s) to inventory!`, 'success');
        setFormData({
          name: '',
          category: formData.category,
          color: '',
          cost_price: '',
          price: ''
        });
        setVariants([
          {
            size: 'M',
            quantity: '',
            barcode: Math.floor(1000 + Math.random() * 9000).toString()
          }
        ]);
        setPreviewUrl(null);
        setSelectedFile(null);
        await loadProductsAndSettings();
      } else {
        notify(`Could not add product: ${lastError || 'Check server connection'}`, 'error');
      }
    } catch (error) {
      notify('Error saving variants: ' + error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const openEditModal = (product) => {
    setEditProduct({
      ...product,
      originalBarcode: product.barcode,
      originalSize: product.size
    });
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    const identifier = editProduct._id || editProduct.originalBarcode || editProduct.barcode;
    const res = await window.posAPI.updateProduct(identifier, {
      _id: editProduct._id,
      originalBarcode: editProduct.originalBarcode,
      originalSize: editProduct.originalSize,
      name: editProduct.name,
      category: editProduct.category,
      size: String(editProduct.size || '').trim().toUpperCase(),
      color: editProduct.color,
      cost_price: Math.max(0, parseFloat(editProduct.cost_price || 0)),
      price: Math.max(0, parseFloat(editProduct.price || 0)),
      stock_quantity: Math.max(0, parseInt(editProduct.stock_quantity || 0, 10)),
      barcode: String(editProduct.barcode).trim()
    });

    if (res && res.success !== false) {
      notify('Variant updated successfully!', 'success');
      setEditProduct(null);
      loadProductsAndSettings();
    } else {
      notify(res?.error || 'Failed to update variant.', 'error');
    }
  };

  const handleDelete = (product) => {
    if (window.drixConfirm) {
      window.drixConfirm(
        `Delete "${product.name}" (Size: ${product.size}, Barcode: #${product.barcode})?`,
        async () => {
          await window.posAPI.deleteProduct(product._id || product.barcode, product.size, product.color);
          notify(`Deleted "${product.name}" (${product.size}) from inventory.`, 'info');
          loadProductsAndSettings();
        },
        'Delete Inventory Variant'
      );
    }
  };

  const handleActualPrint = async () => {
    const result = await window.posAPI.printBarcodeLabel({
      ...barcodePreview,
      copies: parseInt(printCopies, 10) || 1
    });
    if (result.success) {
      notify('Sent barcode labels to printer!', 'success');
      setBarcodePreview(null);
      setPrintCopies(1);
    } else {
      notify('Print failed. Check printer connection in Settings.', 'error');
    }
  };

  const filteredProducts = products.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(p.barcode || '').toLowerCase().includes(q) ||
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.category || '').toLowerCase().includes(q) ||
      String(p.color || '').toLowerCase().includes(q) ||
      String(p.size || '').toLowerCase().includes(q)
    );
  });

  const isDark = theme === 'dark';
  const colors = {
    text: isDark ? '#f8fafc' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    glassBg: isDark ? 'rgba(22, 30, 46, 0.65)' : 'rgba(255, 255, 255, 0.85)',
    glassBorder: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(15, 23, 42, 0.1)',
    inputBg: isDark ? 'rgba(9, 13, 22, 0.6)' : 'rgba(255, 255, 255, 0.95)',
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

  const inputStyle = {
    padding: '11px 14px',
    background: colors.inputBg,
    border: `1px solid ${colors.glassBorder}`,
    borderRadius: '12px',
    color: colors.text,
    outline: 'none',
    fontSize: '0.95rem',
    width: '100%',
    boxSizing: 'border-box'
  };

  return (
    <div style={{ padding: '26px', boxSizing: 'border-box' }}>
      {/* ---------------- BULK ADD ITEM FORM ---------------- */}
      <div style={{ ...glassStyle, padding: '26px', marginBottom: '26px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '18px', fontSize: '1.25rem', fontWeight: '800' }}>
          ➕ Add New Product (Multi-Variant Generator)
        </h3>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: '22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: colors.textMuted, fontSize: '0.82rem', fontWeight: '600' }}>ITEM NAME</label>
              <input type="text" name="name" placeholder="e.g. Designer Silk Kurti" value={formData.name} onChange={handleChange} required style={inputStyle} />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: colors.textMuted, fontSize: '0.82rem', fontWeight: '600' }}>CATEGORY</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input list="categories" name="category" value={formData.category} onChange={handleChange} required style={{ ...inputStyle, flex: 1 }} />
                <button
                  type="button"
                  className="drix-btn"
                  onClick={handleSaveCategory}
                  title="Save category to list"
                  style={{ padding: '0 14px', background: colors.inputBg, color: colors.text, border: `1px solid ${colors.glassBorder}`, borderRadius: '12px', cursor: 'pointer', fontWeight: '700' }}
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
              <label style={{ display: 'block', marginBottom: '5px', color: colors.textMuted, fontSize: '0.82rem', fontWeight: '600' }}>COLOR / VARIANT</label>
              <input type="text" name="color" placeholder="e.g. Red" value={formData.color} onChange={handleChange} required style={inputStyle} />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '5px', color: colors.textMuted, fontSize: '0.82rem', fontWeight: '600' }}>COST PRICE (₹)</label>
                <input type="number" name="cost_price" value={formData.cost_price} onChange={handleChange} onKeyDown={blockInvalidChars} min="0" step="0.01" required style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '5px', color: colors.textMuted, fontSize: '0.82rem', fontWeight: '600' }}>SELLING MRP (₹)</label>
                <input type="number" name="price" value={formData.price} onChange={handleChange} onKeyDown={blockInvalidChars} min="0" step="0.01" required style={inputStyle} />
              </div>
            </div>

            {/* VARIANT GENERATOR TABLE */}
            <div style={{ gridColumn: 'span 2', background: isDark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.45)', padding: '18px', borderRadius: '14px', border: `1px solid ${colors.glassBorder}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, color: colors.text, fontSize: '0.95rem' }}>Sizes, Stock & Barcodes</h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {variants.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="drix-btn"
                        onClick={copyFirstBarcodeToAll}
                        title="Use the exact same barcode across all sizes"
                        style={{ padding: '7px 12px', background: colors.inputBg, color: colors.textMuted, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '0.78rem' }}
                      >
                        🔗 Same Barcode for All Sizes
                      </button>
                      <button
                        type="button"
                        className="drix-btn"
                        onClick={autoSuffixBarcodesBySize}
                        title="Append -M, -L, -XL to barcode for instant single-scan billing"
                        style={{ padding: '7px 12px', background: colors.inputBg, color: colors.textMuted, border: `1px solid ${colors.glassBorder}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '0.78rem' }}
                      >
                        🏷️ Auto-Suffix Sizes (-M, -L)
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="drix-btn"
                    onClick={addVariantRow}
                    style={{ padding: '7px 14px', background: 'rgba(59, 130, 246, 0.15)', color: colors.accentBlue, border: `1px solid rgba(59, 130, 246, 0.35)`, borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '0.84rem' }}
                  >
                    + Add Size Variant
                  </button>
                </div>
              </div>

              {variants.map((variant, index) => (
                <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                  <input type="text" placeholder="Size (e.g. M)" value={variant.size} onChange={(e) => updateVariant(index, 'size', e.target.value)} required style={{ ...inputStyle, flex: 1 }} />
                  <input type="number" placeholder="Stock Qty" value={variant.quantity} onChange={(e) => updateVariant(index, 'quantity', e.target.value)} onKeyDown={blockInvalidChars} min="0" required style={{ ...inputStyle, flex: 1 }} />
                  <div style={{ display: 'flex', flex: 2, gap: '6px' }}>
                    <input type="text" placeholder="Barcode" value={variant.barcode} onChange={(e) => updateVariant(index, 'barcode', e.target.value)} required style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }} />
                    <button type="button" className="drix-btn" onClick={() => generateVariantBarcode(index)} title="Generate random barcode" style={{ padding: '0 14px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, borderRadius: '12px', cursor: 'pointer' }}>🎲</button>
                  </div>
                  {variants.length > 1 && (
                    <button type="button" className="drix-btn" onClick={() => removeVariantRow(index)} style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.12)', color: colors.accentRed, border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '800' }}>✕</button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="drix-btn"
              style={{ gridColumn: 'span 2', padding: '14px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', border: 'none', borderRadius: '12px', cursor: isSaving ? 'wait' : 'pointer', fontWeight: '800', fontSize: '1rem', boxShadow: '0 6px 20px rgba(59, 130, 246, 0.3)' }}
            >
              {isSaving ? 'Saving Variants...' : 'Save All Variants to Inventory'}
            </button>
          </div>

          <div style={{ border: `2px dashed ${colors.glassBorder}`, padding: '18px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: '700', color: colors.textMuted, fontSize: '0.84rem' }}>PRODUCT PHOTO</label>
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" style={{ width: '130px', height: '130px', objectFit: 'cover', borderRadius: '14px', marginBottom: '12px' }} />
            ) : (
              <div style={{ width: '130px', height: '130px', background: colors.inputBg, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', color: colors.textMuted, fontSize: '0.82rem' }}>No Image</div>
            )}
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ width: '100%', fontSize: '0.78rem', color: colors.textMuted }} />
          </div>
        </form>
      </div>

      {/* ---------------- STOCK OVERVIEW TABLE ---------------- */}
      <div style={{ ...glassStyle, padding: '26px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', gap: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800' }}>
            Current Stock Overview ({filteredProducts.length})
          </h3>
          <input
            type="text"
            placeholder="🔍 Search by barcode, name, size, category, or color..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ ...inputStyle, maxWidth: '360px' }}
          />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '14px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted, fontSize: '0.8rem' }}>IMG</th>
                <th style={{ padding: '14px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted, fontSize: '0.8rem' }}>BARCODE</th>
                <th style={{ padding: '14px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted, fontSize: '0.8rem' }}>ITEM NAME</th>
                <th style={{ padding: '14px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted, fontSize: '0.8rem' }}>VARIANT</th>
                <th style={{ padding: '14px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted, fontSize: '0.8rem' }}>MRP</th>
                <th style={{ padding: '14px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted, fontSize: '0.8rem' }}>STOCK</th>
                <th style={{ padding: '14px', borderBottom: `1px solid ${colors.glassBorder}`, color: colors.textMuted, fontSize: '0.8rem', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => {
                const rowKey = p._id || `${p.barcode}_${p.size}_${p.color}`;
                return (
                  <tr key={rowKey} style={{ borderBottom: `1px solid ${colors.glassBorder}` }}>
                    <td style={{ padding: '10px 14px' }}>
                      {p.image_path ? (
                        <img src={p.image_path} alt="img" style={{ width: '42px', height: '42px', objectFit: 'cover', borderRadius: '8px' }} />
                      ) : (
                        <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: colors.inputBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textMuted, fontSize: '0.75rem' }}>—</div>
                      )}
                    </td>
                    <td style={{ padding: '14px', fontFamily: 'monospace', fontWeight: '700', color: colors.accentBlue }}>{p.barcode}</td>
                    <td style={{ padding: '14px', fontWeight: '600', color: colors.text }}>
                      {p.name}
                      <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>{p.category}</div>
                    </td>
                    <td style={{ padding: '14px', color: colors.text, fontWeight: '600' }}>{p.size} / {p.color}</td>
                    <td style={{ padding: '14px', color: colors.text, fontWeight: '700' }}>₹{p.price}</td>
                    <td style={{ padding: '14px' }}>
                      <span style={{ color: p.stock_quantity <= 3 ? colors.accentRed : colors.accentGreen, fontWeight: '800', padding: '4px 10px', background: p.stock_quantity <= 3 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)', borderRadius: '99px', fontSize: '0.85rem' }}>
                        {p.stock_quantity}
                      </span>
                    </td>
                    <td style={{ padding: '14px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button type="button" className="drix-btn" onClick={() => openEditModal(p)} style={{ padding: '7px 13px', background: 'rgba(245, 158, 11, 0.15)', color: colors.accentOrange, border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '0.82rem' }}>
                          Edit
                        </button>
                        <button type="button" className="drix-btn" onClick={() => setBarcodePreview(p)} style={{ padding: '7px 13px', background: 'rgba(59, 130, 246, 0.15)', color: colors.accentBlue, border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '0.82rem' }}>
                          🏷️ Tags
                        </button>
                        <button type="button" className="drix-btn" onClick={() => handleDelete(p)} style={{ padding: '7px 12px', background: 'rgba(239, 68, 68, 0.15)', color: colors.accentRed, border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '0.82rem' }}>
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- EDIT PRODUCT MODAL ---------------- */}
      {editProduct && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: isDark ? '#111827' : '#ffffff', padding: '28px', borderRadius: '22px', width: '420px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', border: `1px solid ${colors.glassBorder}` }}>
            <h3 style={{ margin: '0 0 18px 0', color: colors.text }}>Edit Product Variant</h3>
            <form onSubmit={submitEdit} style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
              <div>
                <label style={{ color: colors.textMuted, fontSize: '0.8rem', fontWeight: '600' }}>Item Name</label>
                <input type="text" value={editProduct.name} onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })} required style={{ ...inputStyle, marginTop: '4px' }} />
              </div>

              <div>
                <label style={{ color: colors.textMuted, fontSize: '0.8rem', fontWeight: '600' }}>Barcode</label>
                <input type="text" value={editProduct.barcode} onChange={(e) => setEditProduct({ ...editProduct, barcode: e.target.value })} required style={{ ...inputStyle, marginTop: '4px', fontFamily: 'monospace' }} />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: colors.textMuted, fontSize: '0.8rem', fontWeight: '600' }}>Size</label>
                  <input type="text" value={editProduct.size} onChange={(e) => setEditProduct({ ...editProduct, size: e.target.value })} required style={{ ...inputStyle, marginTop: '4px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: colors.textMuted, fontSize: '0.8rem', fontWeight: '600' }}>Color</label>
                  <input type="text" value={editProduct.color} onChange={(e) => setEditProduct({ ...editProduct, color: e.target.value })} required style={{ ...inputStyle, marginTop: '4px' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: colors.textMuted, fontSize: '0.8rem', fontWeight: '600' }}>Cost Price (₹)</label>
                  <input type="number" onKeyDown={blockInvalidChars} min="0" step="0.01" value={editProduct.cost_price} onChange={(e) => setEditProduct({ ...editProduct, cost_price: e.target.value })} required style={{ ...inputStyle, marginTop: '4px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: colors.textMuted, fontSize: '0.8rem', fontWeight: '600' }}>Selling MRP (₹)</label>
                  <input type="number" onKeyDown={blockInvalidChars} min="0" step="0.01" value={editProduct.price} onChange={(e) => setEditProduct({ ...editProduct, price: e.target.value })} required style={{ ...inputStyle, marginTop: '4px' }} />
                </div>
              </div>

              <div>
                <label style={{ color: colors.textMuted, fontSize: '0.8rem', fontWeight: '600' }}>Stock Quantity</label>
                <input type="number" onKeyDown={blockInvalidChars} min="0" value={editProduct.stock_quantity} onChange={(e) => setEditProduct({ ...editProduct, stock_quantity: e.target.value })} required style={{ ...inputStyle, marginTop: '4px' }} />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="drix-btn" onClick={() => setEditProduct(null)} style={{ flex: 1, padding: '12px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, color: colors.text, borderRadius: '12px', cursor: 'pointer', fontWeight: '700' }}>
                  Cancel
                </button>
                <button type="submit" className="drix-btn" style={{ flex: 1, padding: '12px', background: colors.accentBlue, color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '700' }}>
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- BARCODE PRINT MODAL ---------------- */}
      {barcodePreview && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: isDark ? '#111827' : '#ffffff', padding: '28px', borderRadius: '22px', width: '360px', textAlign: 'center', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', border: `1px solid ${colors.glassBorder}` }}>
            <h3 style={{ margin: '0 0 18px 0', color: colors.text }}>Print Barcode Labels</h3>

            <div id="drix-print-area" style={{ padding: '18px', border: `2px dashed ${colors.glassBorder}`, background: '#ffffff', color: '#000000', borderRadius: '14px', marginBottom: '20px' }}>
              <p style={{ margin: '0 0 6px 0', fontSize: '13px', fontWeight: '800', color: '#000' }}>
                {barcodePreview.name} ({barcodePreview.size})
              </p>
              <div style={{ background: 'white', padding: '6px', display: 'inline-block' }}>
                <svg ref={barcodeRef}></svg>
              </div>
              <p style={{ margin: '6px 0 0 0', fontSize: '15px', fontWeight: '900', color: '#000' }}>
                MRP: ₹{barcodePreview.price}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '20px' }}>
              <label style={{ fontWeight: '700', color: colors.text }}>Copies:</label>
              <input
                type="number"
                onKeyDown={blockInvalidChars}
                min="1"
                value={printCopies}
                onChange={(e) => setPrintCopies(e.target.value)}
                style={{ width: '80px', padding: '9px', background: colors.inputBg, border: `1px solid ${colors.glassBorder}`, color: colors.text, borderRadius: '10px', textAlign: 'center', fontWeight: '800', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="drix-btn" onClick={() => { setBarcodePreview(null); setPrintCopies(1); }} style={{ flex: 1, padding: '12px', background: colors.inputBg, color: colors.text, border: `1px solid ${colors.glassBorder}`, borderRadius: '12px', cursor: 'pointer', fontWeight: '700' }}>
                Cancel
              </button>
              <button type="button" className="drix-btn" onClick={handleActualPrint} style={{ flex: 2, padding: '12px', background: colors.accentBlue, color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer' }}>
                Print Labels 🖨️
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}