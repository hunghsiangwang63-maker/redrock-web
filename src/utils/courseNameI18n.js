// 課程名稱英/日翻譯（會員端、公開頁顯示用）。
// 課程名稱＝班別名稱＋梯次名稱（例：「小蜘蛛人初級班 9-1月週三A班」），梯次名稱是員工自由輸入的文字，
// 所以用「班別名稱字典＋常見梯次樣式改寫」處理；對不上的字原樣保留（安全 fallback，不會消失）。
// 中文模式原樣回傳。改班別名稱翻譯只改下面 CATEGORY。
import { getMemberLang } from './memberI18n';

// 班別名稱 [English, 日本語]；長的放前面避免被短的先吃掉（執行時也會依長度排序）
const CATEGORY = {
  '抱石X肌力與體能特訓班': ['Bouldering X Strength & Conditioning Camp', 'ボルダリングX筋力・体力特訓クラス'],
  '小蜘蛛人寒暑假英文密集班': ['Little Spiderman Holiday Intensive Class (English)', 'リトルスパイダーマン長期休暇集中クラス（英語）'],
  '小蜘蛛人寒暑假密集班': ['Little Spiderman Holiday Intensive Class', 'リトルスパイダーマン長期休暇集中クラス'],
  '寒暑假密集班(中文)': ['Holiday Intensive Class (Chinese)', '長期休暇集中クラス（中国語）'],
  '小蜘蛛人進階班': ['Little Spiderman Advanced Class', 'リトルスパイダーマン上級クラス'],
  '小蜘蛛人初級班': ['Little Spiderman Beginner Class', 'リトルスパイダーマン初級クラス'],
  '特殊時段專班報名表': ['Special Time-Slot Class', '特別時間帯クラス'],
  '紅石攀岩隊講座：筋膜刀放鬆課程-下肢': ['RedRock Team Workshop: Fascia Blade Release – Lower Body', '紅石クライミングチーム講座：筋膜ナイフリリース－下半身'],
  'RedFlash -紅石攀岩隊(新竹) 運動按摩': ['RedFlash – RedRock Team (Hsinchu) Sports Massage', 'RedFlash－紅石クライミングチーム（新竹）スポーツマッサージ'],
  'RedFlash -紅石攀岩隊 運動按摩': ['RedFlash – RedRock Team Sports Massage', 'RedFlash－紅石クライミングチーム スポーツマッサージ'],
  '青少年初級班': ['Youth Beginner Class', 'ジュニア初級クラス'],
  '青少年進階班': ['Youth Advanced Class', 'ジュニア上級クラス'],
  '週期訓練課程': ['Periodization Training Program', 'ピリオダイゼーション トレーニング'],
  '虹瑩進階班': ['Hongying Advanced Class', '虹瑩 上級クラス'],
  '肢體評估': ['Physical Assessment', '身体評価'],
  '入門班': ['Introductory Class', '入門クラス'],
  '進階班': ['Advanced Class', '上級クラス'],
  '矯正班': ['Corrective Class', '矯正クラス'],
  '技巧班': ['Technique Class', 'テクニッククラス'],
};
const CAT_KEYS = Object.keys(CATEGORY).sort((a, b) => b.length - a.length);

const MON_EN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = { '一': ['Mon', '月'], '二': ['Tue', '火'], '三': ['Wed', '水'], '四': ['Thu', '木'], '五': ['Fri', '金'], '六': ['Sat', '土'], '日': ['Sun', '日'] };

export const translateCourseName = (name, lang) => {
  if (!name || (lang !== 'en' && lang !== 'ja')) return name;
  const en = lang === 'en';
  let s = String(name);
  // 1) 班別名稱（先換成佔位符，避免後面的樣式規則誤改）
  const slots = [];
  for (const k of CAT_KEYS) {
    if (s.includes(k)) {
      s = s.split(k).join(`\u0001${slots.length}\u0002`);
      slots.push(CATEGORY[k][en ? 0 : 1]);
    }
  }
  // 2) 梯次樣式
  s = s.replace(/(\d{1,2})-(\d{1,2})月/g, (_, a, b) => en ? ` ${MON_EN[+a] || a}–${MON_EN[+b] || b} ` : `${a}〜${b}月`);
  s = s.replace(/(?<![\d–〜])(\d{1,2})月(?!\u0002)/g, (_, a) => en ? ` ${MON_EN[+a] || `${a}月`} ` : `${a}月`);
  s = s.replace(/[週周]([一二三四五六日])([A-Za-z]?)班/g, (_, d, l) => en
    ? ` ${WD[d][0]}${l ? ` Class ${l}` : ' Class'} ` : `${WD[d][1]}曜${l ? l : ''}クラス`);
  s = s.replace(/優惠試上/g, en ? ' Discounted Trial ' : '割引体験');
  s = s.replace(/專班/g, en ? ' Private Class ' : '専用クラス');
  s = s.replace(/運動按摩/g, en ? ' Sports Massage ' : 'スポーツマッサージ');
  s = s.replace(/\(一小時\)/g, en ? '(1 hour)' : '（1時間）');
  s = s.replace(/\(([一二三四五六七八九十]+)小時\)/g, (_, n) => en ? `(${n} hr)` : `（${n}時間）`);
  // 3) 還原班別名稱
  s = s.replace(/\u0001(\d+)\u0002/g, (_, i) => slots[+i]);
  return s.replace(/[ 　]+/g, ' ').trim();
};

// 依目前會員端語言翻譯（中文原樣）
export const tc = (name) => translateCourseName(name, getMemberLang());
