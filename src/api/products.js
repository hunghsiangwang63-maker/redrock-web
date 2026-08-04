import client from './client';

export const getProducts = (gymId) =>
  client.get('/products', { params: gymId ? { gymId } : {} });

export const getInactiveProducts = (gymId) =>
  client.get('/products', { params: { inactive: 1, ...(gymId ? { gymId } : {}) } });

export const createProduct = (data) =>
  client.post('/products', data);

export const updateProduct = (id, data) =>
  client.put(`/products/${id}`, data);

export const deleteProduct = (id) =>
  client.delete(`/products/${id}`);

// 永久刪除（限管理員）
export const deleteProductPermanent = (id) =>
  client.delete(`/products/${id}/permanent`);

export const restockProduct = (id, data) =>
  client.post(`/products/${id}/restock`, data);

export const setWarehouseStock = (productId, variantId, quantity) =>
  client.put(`/products/${productId}/variants/${variantId}/warehouse-stock`, { quantity });

export const sellProducts = (data) =>
  client.post('/products/sell', data);

export const getProductSales = (params) =>
  client.get('/products/sales', { params });

export const returnSale = (saleId, reason) =>
  client.post(`/products/sales/${saleId}/return`, { reason });

// 銷售開立發票（手動記帳版，比照課程/比賽/入場同一套 InvoiceModal）
export const getSaleInvoices = (saleId) =>
  client.get(`/products/sales/${saleId}/invoices`);

export const createSaleInvoice = (saleId, data) =>
  client.post(`/products/sales/${saleId}/invoices`, data);

export const voidSaleInvoice = (id, voidReason) =>
  client.post(`/products/invoices/${id}/void`, { voidReason });

export const getStocktakeHistory = (gymId) =>
  client.get('/products/stocktake/history', { params: gymId ? { gymId } : {} });
