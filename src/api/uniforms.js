import client from './client';

// 小蜘蛛人制服（衣服）領取紀錄（員工端）
export const getMemberUniforms = (memberId) => client.get(`/uniforms/member/${memberId}`);
export const createUniform = (data) => client.post('/uniforms', data);
export const updateUniform = (id, data) => client.put(`/uniforms/${id}`, data);
export const voidUniform = (id, reason) => client.post(`/uniforms/${id}/void`, { reason });
