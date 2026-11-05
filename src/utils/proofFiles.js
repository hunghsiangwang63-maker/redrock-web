// 證明文件上傳前處理（課程暫停／退費申請用）。
// 圖片：縮到最長邊 1600px、轉 JPEG(0.82)，通常 < 500KB；PDF：原檔（須 ≤ 1.5MB）。
// 結果為後端 parseProofFiles 接受的 { name, mime, dataUrl }（後端再驗：最多 3 份、每份 ≤ 2MB、合計 ≤ 5MB）。
export const PROOF_MAX_FILES = 3;
const PDF_MAX_BYTES = 1.5 * 1024 * 1024;

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error('read'));
  r.readAsDataURL(file);
});

const compressImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    try {
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
  img.src = url;
});

// 回傳 { file } 或 { error:'type'|'size'|'read' }
export async function prepareProofFile(file) {
  const type = file.type || '';
  try {
    if (type === 'application/pdf') {
      if (file.size > PDF_MAX_BYTES) return { error: 'size' };
      return { file: { name: file.name, mime: 'application/pdf', dataUrl: await readAsDataUrl(file) } };
    }
    if (type.startsWith('image/')) {
      const name = (file.name || '證明').replace(/\.[^.]+$/, '') + '.jpg';
      return { file: { name, mime: 'image/jpeg', dataUrl: await compressImage(file) } };
    }
    return { error: 'type' };
  } catch (e) { return { error: 'read' }; }
}
