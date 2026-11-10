import { useEffect, useState } from 'react';
import { memberClient } from '../api/client';

// 會員端轉帳收款帳號：依「館別」顯示（新竹＝台新、士林＝富邦），資料來自後端 /settings/bank-accounts/member。
// 不要在頁面寫死單一帳號（2026-11-10：比賽／攀岩隊／器材租借寫死新竹帳號，士林館的會員也被引導匯到新竹）。
// bankInfoForGym(gymId) → PaymentSection 的 bankInfo 形狀；沒給 gymId 或查不到該館回 null（不顯示帳號，不誤導）。
export default function useGymBankAccounts() {
  const [bankAccounts, setBankAccounts] = useState({});
  useEffect(() => {
    memberClient.get('/settings/bank-accounts/member')
      .then(r => setBankAccounts(r.data.bankAccounts || {})).catch(() => {});
  }, []);
  const bankInfoForGym = (gymId) => {
    const bk = gymId ? bankAccounts[gymId] : null;
    return bk ? { bankName: bk.bankName, branch: bk.branch || '', account: bk.accountNumber, accountName: bk.accountName } : null;
  };
  return { bankAccounts, bankInfoForGym };
}
