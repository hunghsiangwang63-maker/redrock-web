// 會員端輕量雙語（功能鍵 + 入場 QR 流程 + 註冊頁）
// 原則：以「中文原文」為 key —— 中文模式或查無對照時一律原樣返回 → 中文版行為零改動。
// 切換語言後 window.location.reload() 重載，所有頁面同步生效（免 React 全域狀態）。
// 帶變數的句子在各頁以 isEn() 三元組字，不進字典。

const DICT = {
  // ── 底部導航 ──
  '首頁': 'Home',
  '課程總覽': 'Courses',
  '我的票券': 'My Passes',
  '我的': 'Me',
  // ── 首頁快速功能 ──
  '入場QR碼': 'Entry QR',
  '我的紀錄': 'My Records',
  '比賽報名': 'Competitions',
  '體驗課程': 'Trial Class',
  '加入攀岩隊': 'Join Team',
  '器材租借': 'Gear Rental',

  // ── 入場 QR：共用 ──
  '入場 QR Code': 'Entry QR Code',
  '選擇身分': 'Select Entry Type',
  '選擇付款方式': 'Select Payment',
  '租借器材': 'Rental Gear',
  '選擇入場場館': 'Select gym',
  '新竹館': 'Hsinchu',
  '士林館': 'Shilin',
  '選擇入場人員': 'Who is entering?',
  '驗票中...': 'Verifying...',
  '驗票失敗': 'Verification failed',
  '產生 QR Code 失敗': 'Failed to generate QR code',

  // ── 入場 QR：擋下畫面 ──
  '今日已完成入場': 'Already checked in today',
  'Waiver 尚未完成': 'Waiver not completed',
  '等待法定代理人簽署': 'Awaiting guardian signature',
  '尚未通過墜落測驗': 'Fall test not passed',
  '墜落測驗已到期': 'Fall test expired',
  '無法入場': 'Entry not allowed',
  '請先完成 Waiver 風險安全聲明書簽署，才能入場': 'Please sign the liability waiver before entering.',
  '已送出，等待法定代理人完成線上簽署': 'Sent — awaiting guardian online signature.',
  '請先至服務台完成安全墜落測驗同意書簽署及墜落測驗': 'Please sign the fall-test consent and complete the fall test at the front desk.',
  '墜落測驗已到期，請至服務台重新進行測驗': 'Fall test expired — please retake it at the front desk.',
  '請聯絡服務台': 'Please contact the front desk.',
  '前往簽署 Waiver': 'Sign Waiver',
  '查看簽署狀態 / 重新發送連結': 'Check status / Resend link',
  '前往墜落測驗同意書': 'Fall Test Consent',
  '重新驗票': 'Re-verify',

  // ── 入場 QR：身分/方式 ──
  '請選擇入場身分': 'Select your entry type',
  '🏅 隊員身份：NT$100 以上消費享九折優惠': '🏅 Team member: 10% off purchases over NT$100',
  '成人入場': 'Adult Entry',
  '學生入場': 'Student Entry',
  '兒童入場': 'Child Entry',
  '入場': 'Entry',
  '成人單次入場': 'Adult Single Entry',
  '學生單次入場': 'Student Single Entry',
  '兒童單次入場': 'Child Single Entry',
  '課程學員': 'Course Student',
  '身分：': 'Type: ',
  '請選擇付款方式或使用票券': 'Choose payment or use a ticket',
  '一般付款': 'Standard Payment',
  '使用優惠折扣券（原價 8 折）': 'Use Discount Card (20% off)',
  '使用黑卡（免費）': 'Use Black Card (Free)',
  '使用紅利（免費）': 'Use Bonus (Free)',
  '使用單次入場券（免費）': 'Use Single-Entry Ticket (Free)',
  '購買優惠折扣券入場': 'Buy Discount Card & Enter',
  '含本次入場＋10次八折＋紅利': 'Includes this entry + 10 × 20%-off entries + bonus',
  '免費': 'Free',
  '購買定期票入場': 'Buy a Pass & Enter',
  '購買定期票': 'Buy Pass',
  '請選擇定期票方案…': 'Select a pass plan…',
  '雙館通用': 'Both gyms',
  '雙館': 'Both gyms',
  '單館': 'Single gym',
  '個月': 'months',
  '天': 'days',
  '可分期': 'Installments OK',

  // ── 入場 QR：付款/特約 ──
  '入場方式': 'Entry method',
  '請選擇付款方式': 'Select payment method',
  '請選擇「頭款（第一期）」付款方式': 'Select payment method for the first installment',
  '需於櫃檯出示特約廠商證件核對，未出示或不符將以原價計。': 'Show your partner-company ID at the front desk; full price applies if not presented.',
  '現金': 'Cash',
  '街口支付': 'JKO Pay',
  '台灣 Pay': 'Taiwan Pay',

  // ── 入場 QR：續約/租借 ──
  '🎫 定期票即將到期': '🎫 Pass expiring soon',
  '續約優惠': 'Renewal discount',
  '一次付清': 'Pay in full',
  '續約頭款（第一期）付款方式': 'Renewal first-installment payment',
  '續約付款方式': 'Renewal payment method',
  '需要租借器材嗎？': 'Need rental gear?',
  '岩鞋租借': 'Shoe Rental',
  '粉袋租借': 'Chalk Bag Rental',
  '都不需要': 'No, thanks',
  '不租借任何器材': 'No rental gear',
  '租借付款方式': 'Rental payment method',
  '下一步：選擇付款方式 →': 'Next: Select Payment →',
  '確認': 'Confirm',

  // ── 入場 QR：QR 頁 ──
  '折扣優惠券': 'Discount Card',
  '定期票（頭款・第1期）': 'Pass (1st installment)',
  '定期票': 'Pass',
  '入場費': 'Entry Fee',
  '定期票續約': 'Pass Renewal',
  '（頭款・第1期）': ' (1st installment)',
  '合計': 'Total',
  '付款方式：': 'Payment: ',
  '重新產生': 'Regenerate',
  '此 QR Code 已逾時，請按下方「重新產生」。': 'This QR code has expired. Tap "Regenerate" below.',
  '此入場已被取消，請重新產生或洽櫃檯。': 'This entry was cancelled. Regenerate or ask the front desk.',
  '請出示此 QR Code 給工作人員掃描；掃描確認後會': 'Show this QR code to our staff. Once scanned, ',
  '自動完成入場並跳回首頁': "you'll be checked in and returned to Home automatically",
  '。': '.',
  'VIP 免費入場': 'VIP Free Entry',
  '使用優惠折扣券': 'Use Discount Card',
  '使用黑卡': 'Use Black Card',
  '紅利免費入場': 'Bonus Free Entry',
  '使用單次入場券': 'Use Single-Entry Ticket',
  '單次購票': 'Single Entry',

  // ── 註冊頁 ──
  '紅石攀岩館 會員註冊': 'RedRock Climbing – Member Registration',
  '註冊成功！': 'Registration successful!',
  '請至您的Email信箱完成驗證，': 'Please verify via the link sent to your email.',
  '驗證完成後即可登入使用。': 'You can log in once verified.',
  '前往登入': 'Log in',
  '姓名': 'Name',
  '手機號碼': 'Phone Number',
  '密碼（至少8碼）': 'Password (min. 8 characters)',
  '生日': 'Date of Birth',
  '※ 未滿 18 歲需法定代理人（家長／監護人）簽署風險安全聲明書，並填寫下方法定代理人資料。': '※ Members under 18 require a legal guardian to sign the liability waiver. Please fill in the guardian info below.',
  '法定代理人資料（未滿 18 歲必填）': 'Legal Guardian Info (required if under 18)',
  '法定代理人姓名': "Guardian's Name",
  '法定代理人電話': "Guardian's Phone",
  '與會員關係': 'Relationship to Member',
  '王小明': 'Your name',
  '0912345678（外籍：+ 開頭國際格式）': '0912345678 (Intl: +country code…)',
  '王大明': "Guardian's name",
  '父/母/監護人': 'Father / Mother / Guardian',
  '註冊中...': 'Registering...',
  '註冊': 'Register',
  '已經有帳號？': 'Already have an account? ',
  '未滿 5 歲無法成為會員': 'Children under 5 cannot become members.',
  '未滿 18 歲需填寫法定代理人姓名、電話與關係': 'Under 18: guardian name, phone and relationship are required.',
  '註冊失敗，請確認資料是否正確': 'Registration failed. Please check your information.',
};

export const getMemberLang = () => {
  try { return localStorage.getItem('memberLang') || 'zh'; } catch { return 'zh'; }
};

export const isEn = () => getMemberLang() === 'en';

export const toggleMemberLang = () => {
  try { localStorage.setItem('memberLang', getMemberLang() === 'en' ? 'zh' : 'en'); } catch {}
  window.location.reload();
};

// 中文模式（預設）→ 原樣返回；英文模式 → 查字典，查無仍原樣返回（安全 fallback）
export const t = (zh) => (getMemberLang() === 'en' && DICT[zh]) || zh;
