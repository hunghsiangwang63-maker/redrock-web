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

export const restockProduct = (id, data) =>
  client.post(`/products/${id}/restock`, data);

export const setWarehouseStock = (productId, variantId, quantity) =>
  client.put(`/products/${productId}/variants/${variantId}/warehouse-stock`, { quantity });

export const sellProducts = (data) =>
  client.post('/products/sell', data);

export const getProductSales = (params) =>
  client.get('/products/sales', { params });
