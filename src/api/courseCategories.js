import client from './client';

export const getCategories = () => client.get('/course-categories');
export const createCategory = (data) => client.post('/course-categories', data);
export const updateCategory = (id, data) => client.put(`/course-categories/${id}`, data);
export const deleteCategory = (id) => client.delete(`/course-categories/${id}`);
