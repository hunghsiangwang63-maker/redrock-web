// 偵測是否在社群 App 的內建瀏覽器（in-app WebView）中開啟。
// 這類環境（LINE / FB / IG / 微信…）常無法正確回報 YouTube 影片播放進度，
// 需提示會員改用系統瀏覽器（Safari / Chrome）開啟。
export function detectInAppBrowser() {
  const ua = (navigator.userAgent || navigator.vendor || '').toString();
  // 依序比對常見 in-app 瀏覽器的 UA 特徵
  const patterns = [
    { name: 'LINE', re: /\bLine\//i },
    { name: 'Facebook', re: /\bFBAN\/|\bFBAV\/|FB_IAB\//i },
    { name: 'Messenger', re: /\bFBAN\/Messenger|MessengerForiOS/i },
    { name: 'Instagram', re: /\bInstagram\b/i },
    { name: '微信', re: /\bMicroMessenger\b/i },
    { name: 'Threads', re: /\bBarcelona\b/i },
    { name: 'TikTok', re: /\bBytedanceWebview|musical_ly|TikTok\b/i },
  ];
  for (const p of patterns) {
    if (p.re.test(ua)) return { inApp: true, name: p.name };
  }
  return { inApp: false, name: null };
}
