import client, { memberClient } from './client';

// ── 員工端（使用 staff token）──────────────────────────────────────
export const getMemberDiscountCards = (memberId) =>
  client.get(`/cards/discount/member/${memberId}`);
export const purchaseDiscountCard = (data) =>
  client.post('/cards/discount/purchase', data);
export const discountCardTransferPreview = (cardId, data) =>
  client.post(`/cards/discount/${cardId}/transfer-preview`, data);
export const transferDiscountCard = (cardId, data) =>
  client.post(`/cards/discount/${cardId}/transfer`, data);

export const getMemberBlackCards = (memberId) =>
  client.get(`/cards/black/member/${memberId}`);
export const bindBlackCard = (data) =>
  client.post('/cards/black/bind', data);
export const blackCardTransferPreview = (cardId, data) =>
  client.post(`/cards/black/${cardId}/transfer-preview`, data);
export const transferBlackCard = (cardId, data) =>
  client.post(`/cards/black/${cardId}/transfer`, data);

export const getMemberBonuses = (memberId) =>
  client.get(`/cards/bonus/member/${memberId}`);

// ── 會員端（使用 member token）──────────────────────────────────────
export const memberGetDiscountCards = (memberId) =>
  memberClient.get(`/cards/discount/member/${memberId}`);
export const memberGetBlackCards = (memberId) =>
  memberClient.get(`/cards/black/member/${memberId}`);
export const memberGetBonuses = (memberId) =>
  memberClient.get(`/cards/bonus/member/${memberId}`);
export const memberDiscountCardTransferPreview = (cardId, data) =>
  memberClient.post(`/cards/discount/${cardId}/transfer-preview`, data);
export const memberTransferDiscountCard = (cardId, data) =>
  memberClient.post(`/cards/discount/${cardId}/transfer`, data);
export const memberBlackCardTransferPreview = (cardId, data) =>
  memberClient.post(`/cards/black/${cardId}/transfer-preview`, data);
export const memberTransferBlackCard = (cardId, data) =>
  memberClient.post(`/cards/black/${cardId}/transfer`, data);
