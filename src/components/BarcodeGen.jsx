import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export default function BarcodeGen({ product }) {
  const svgRef = useRef();

  useEffect(() => {
    if (product?.barcode && svgRef.current) {
      JsBarcode(svgRef.current, product.barcode, {
        format: 'CODE128',
        width: 1.5,
        height: 40,
        displayValue: true,
        fontSize: 12,
      });
    }
  }, [product]);

  return (
    <div style={{
      width: '50mm',
      height: '25mm',
      padding: '2mm',
      border: '1px dashed #ccc',
      textAlign: 'center',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{product.name}</div>
      <div style={{ fontSize: '9px' }}>Size: {product.size} | Color: {product.color}</div>
      <svg ref={svgRef} style={{ width: '100%', height: '30px' }}></svg>
      <div style={{ fontSize: '11px', fontWeight: 'bold' }}>MRP: ₹{product.price}</div>
    </div>
  );
}