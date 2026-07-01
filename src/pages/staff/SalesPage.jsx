import { useState, useEffect, useRef } from 'react';
import { getProducts, createProduct, updateProduct, deleteProduct, restockProduct, sellProducts, setWarehouseStock } from '../../api/products';
import { searchMembers } from '../../api/members';
import { getGyms } from '../../api/gyms';
import { useAuth } from '../../store/authStore.jsx';
import client from '../../api/client';
import SegmentedTabs from '../../components/SegmentedTabs';

const PAY_METHODS = [
  { key:'cash', label:'現金' },
  { key:'linepay', label:'Line Pay' },
  { key:'jkopay', label:'街口支付' },
  { key:'taiwanpay', label:'台灣Pay' },
];

const Modal = ({ title, onClose, children, width=480 }) => (
  <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}>
    <div style={{ background:'#fff', borderRadius:16, padding:24, width, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', border:'0.5px solid #E8D5D5' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:600 }}>{title}</div>
        <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const VariantForm = ({ variants, onChange }) => {
  const addVariant = () => onChange([...variants, { size:'', color:'', price:'', promoPrice:'', stock:'' }]);
  const removeVariant = (i) => onChange(variants.filter((_,idx) => idx !== i));
  const updateVariant = (i, field, value) => onChange(variants.map((v,idx) => idx===i ? {...v,[field]:value} : v));

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <label style={{ fontSize:11, color:'#666', fontWeight:600 }}>變體（尺寸/顏色）</label>
        <button type="button" onClick={addVariant}
          style={{ height:26, padding:'0 10px', borderRadius:6, background:'#8B1A1A', color:'#fff', border:'none', fontSize:11, cursor:'pointer' }}>
          ＋ 新增變體
        </button>
      </div>
      {variants.map((v, i) => (
        <div key={i} style={{ background:'#FBF5F5', borderRadius:8, padding:'10px 12px', marginBottom:8, position:'relative' }}>
          <button type="button" onClick={() => removeVariant(i)}
            style={{ position:'absolute', top:8, right:8, background:'none', border:'none', color:'#999', cursor:'pointer', fontSize:14 }}>✕</button>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[
              { label:'尺寸', key:'size', placeholder:'如：S / M / L / 無' },
              { label:'顏色', key:'color', placeholder:'如：黑 / 白 / 無' },
              { label:'原價（NT$）', key:'price', type:'number', placeholder:'0' },
              { label:'促銷價（選填）', key:'promoPrice', type:'number', placeholder:'留空則無促銷' },
              { label:'初始庫存', key:'stock', type:'number', placeholder:'0' },
            ].map(f => (
              <div key={f.key} style={{ gridColumn: f.key==='size'||f.key==='color' ? 'auto' : f.key==='stock'?'1/-1':'auto' }}>
                <label style={{ fontSize:10, color:'#666', display:'block', marginBottom:3 }}>{f.label}</label>
                <input type={f.type||'text'} value={v[f.key]||''} placeholder={f.placeholder}
                  onChange={e => updateVariant(i, f.key, e.target.value)}
                  style={{ width:'100%', height:32, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 8px', fontSize:12, outline:'none', boxSizing:'border-box', background:'#fff', color:'#1a1a1a' }}/>
              </div>
            ))}
          </div>
        </div>
      ))}
      {variants.length === 0 && (
        <div style={{ textAlign:'center', padding:'12px 0', color:'#999', fontSize:12 }}>點上方按鈕新增變體</div>
      )}

    </div>
  );
};

export default function SalesPage({ embedded = false }) {
  const { staff, activeGymId } = useAuth();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const fileRef = useRef();
  const [tab, setTab] = useState('sell');
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('ok');
  const [selectedProduct, setSelectedProduct] = useState(null);

  // 商品搜尋/分類下鑽（類別→品項→變體）
  const [productSearch, setProductSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedBrand, setSelectedBrand] = useState(null);

  // 商品管理
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({ brand:'', name:'', description:'', category:'裝備', lowStockAlert:5, variants:[] });
  const [showRestock, setShowRestock] = useState(null);
  const [showStocktake, setShowStocktake] = useState(false);
  const [stocktakeItems, setStocktakeItems] = useState([]);
  const [stocktakeResult, setStocktakeResult] = useState(null);
  const [restockVariantId, setRestockVariantId] = useState('');
  const [restockQty, setRestockQty] = useState('');
  const [restockNote, setRestockNote] = useState('');
  const [editingWarehouse, setEditingWarehouse] = useState(null); // variantId 正在編輯中
  const [warehouseInput, setWarehouseInput] = useState('');
  const isSuperAdmin = staff?.role === 'super_admin';
  const [gyms, setGyms] = useState([]);
  const [selectedGymId, setSelectedGymId] = useState(staff?.gymId || '');
  const targetGymId = isSuperAdmin ? selectedGymId : (activeGymId || staff?.gymId);

  useEffect(() => {
    if (isSuperAdmin) {
      getGyms().then(res => {
        const list = res.data.gyms || [];
        setGyms(list);
        if (!selectedGymId && list.length > 0) setSelectedGymId(list[0].id);
      }).catch(() => {});
    }
  }, [isSuperAdmin]);

  const handleSaveWarehouse = async (productId, variantId) => {
    const qty = parseInt(warehouseInput);
    if (isNaN(qty) || qty < 0) { showMsg('請輸入有效數量', 'red'); return; }
    try {
      await setWarehouseStock(productId, variantId, qty);
      showMsg('倉庫庫存已更新');
      setEditingWarehouse(null);
      loadProducts();
    } catch (err) { showMsg(err.response?.data?.message || '更新失敗', 'red'); }
  };

  const showMsg = (text, type='ok') => { setMsg(text); setMsgType(type); setTimeout(() => setMsg(''), 3000); };

  useEffect(() => { loadProducts(); }, [targetGymId]);

  const loadProducts = async () => {
    try {
      const res = await getProducts(targetGymId);
      setProducts(res.data.products || []);
    } catch (e) {}
  };

  const addToCart = (product, variant) => {
    const key = `${product.id}_${variant.id}`;
    const existing = cart.find(c => c.key === key);
    if (existing) {
      if (existing.quantity >= variant.stock) { showMsg('庫存不足', 'red'); return; }
      setCart(cart.map(c => c.key === key ? {...c, quantity: c.quantity+1} : c));
    } else {
      if (variant.stock <= 0) { showMsg('庫存不足', 'red'); return; }
      const unitPrice = (variant.promoActive && variant.promoPrice) ? variant.promoPrice : variant.price;
      setCart([...cart, { key, productId: product.id, variantId: variant.id,
        productName: product.name, brand: product.brand,
        size: variant.size, color: variant.color,
        price: variant.price, promoPrice: variant.promoPrice, promoActive: variant.promoActive,
        unitPrice, quantity: 1, maxStock: variant.stock }]);
    }
    setSelectedProduct(null);
  };

  const removeFromCart = (key) => setCart(cart.filter(c => c.key !== key));
  const updateQty = (key, qty) => {
    if (qty <= 0) { removeFromCart(key); return; }
    const item = cart.find(c => c.key === key);
    if (qty > item?.maxStock) { showMsg('超過庫存', 'red'); return; }
    setCart(cart.map(c => c.key === key ? {...c, quantity: qty} : c));
  };
  // 攀岩隊員 9 折預覽（與後端一致：有效隊員 + 每項 ≥ NT$100 才折；後端結帳時為權威計算）
  const _today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const teamActive = !!(selectedMember?.isTeamMember && selectedMember?.teamMemberUntil
    && (selectedMember?.teamMemberSince || '') <= _today && _today <= selectedMember.teamMemberUntil);
  const itemGross = (c) => c.unitPrice * c.quantity;
  const itemNet = (c) => { const g = itemGross(c); return (teamActive && g >= 100) ? Math.round(g * 0.9) : g; };
  const cartGross = cart.reduce((sum, c) => sum + itemGross(c), 0);
  const totalAmount = cart.reduce((sum, c) => sum + itemNet(c), 0);   // 折後總額
  const cartDiscount = cartGross - totalAmount;

  const handleSell = async () => {
    if (!cart.length) { showMsg('請先加入商品', 'red'); return; }
    setLoading(true);
    try {
      const res = await sellProducts({
        items: cart.map(c => ({ productId: c.productId, variantId: c.variantId, quantity: c.quantity })),
        memberId: selectedMember?.id || null,
        memberName: selectedMember?.name || '匿名',
        paymentMethod, gymId: targetGymId,
      });
      showMsg(res.data.message);
      setCart([]); setSelectedMember(null); setMemberQuery('');
      await loadProducts();
    } catch (err) { showMsg(err.response?.data?.message || '銷售失敗', 'red'); }
    finally { setLoading(false); }
  };

  const handleCreateProduct = async () => {
    setLoading(true);
    try {
      await createProduct({ ...productForm,
        variants: productForm.variants.map(v => ({
          ...v, price: parseInt(v.price)||0, promoPrice: v.promoPrice ? parseInt(v.promoPrice) : null, stock: parseInt(v.stock)||0
        }))
      });
      showMsg('商品已建立'); setShowAddProduct(false);
      setProductForm({ brand:'', name:'', description:'', category:'裝備', lowStockAlert:5, variants:[] });
      await loadProducts();
    } catch (err) { showMsg('建立失敗', 'red'); }
    finally { setLoading(false); }
  };

  const handleUpdateProduct = async () => {
    setLoading(true);
    try {
      await updateProduct(editingProduct.id, productForm);
      showMsg('商品已更新'); setEditingProduct(null); await loadProducts();
    } catch (err) { showMsg('更新失敗', 'red'); }
    finally { setLoading(false); }
  };

  const handleTogglePromo = async (productId, variantId, current) => {
    try {
      await client.put(`/products/${productId}/variants/${variantId}/promo`, { promoActive: !current });
      await loadProducts();
    } catch (e) {}
  };

  const handleRestock = async () => {
    if (!restockVariantId || !restockQty) { showMsg('請選擇變體並輸入數量', 'red'); return; }
    setLoading(true);
    try {
      const res = await restockProduct(showRestock.id, { variantId: restockVariantId, quantity: parseInt(restockQty), note: restockNote });
      showMsg(res.data.message); setShowRestock(null); setRestockQty(''); setRestockNote(''); setRestockVariantId('');
      await loadProducts();
    } catch (err) { showMsg('入庫失敗', 'red'); }
    finally { setLoading(false); }
  };

  const handleExport = async () => {
    try {
      const params = staff?.gymId ? `?gymId=${staff.gymId}` : '';
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:3001/products/export${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = '庫存清單.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { showMsg('匯出失敗', 'red'); }
  };

  const openStocktake = () => {
    const items = [];
    products.forEach(p => {
      (p.variants || []).forEach(v => {
        items.push({
          productId: p.id, productName: p.name, brand: p.brand || '',
          variantId: v.id, size: v.size || '', color: v.color || '',
          systemStock: v.stock || 0, actualStock: v.stock || 0,
        });
      });
    });
    setStocktakeItems(items);
    setStocktakeResult(null);
    setShowStocktake(true);
  };

  const handleStocktake = async () => {
    setLoading(true);
    try {
      const res = await client.post('/products/stocktake', {
        gymId: targetGymId,
        items: stocktakeItems.map(i => ({
          productId: i.productId, variantId: i.variantId, actualStock: parseInt(i.actualStock) || 0
        }))
      });
      setStocktakeResult(res.data);
      showMsg(res.data.message, res.data.discrepancies?.length > 0 ? 'red' : 'ok');
      await loadProducts();
    } catch (err) { showMsg(err.response?.data?.message || '盤點失敗', 'red'); }
    finally { setLoading(false); }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setLoading(true);
    try {
      const res = await client.post('/products/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      showMsg(res.data.message); await loadProducts();
    } catch (err) { showMsg(err.response?.data?.message || '匯入失敗', 'red'); }
    finally { setLoading(false); e.target.value = ''; }
  };

  const searchMember = async (q) => {
    setMemberQuery(q);
    if (q.length < 2) { setMemberResults([]); return; }
    const res = await searchMembers(q);
    setMemberResults(res.data.members || []);
  };

  const TABS = [{ key:'sell', label:'銷售' }, { key:'inventory', label:'庫存管理' }];

  // 計算商品最低價
  const getProductPriceRange = (product) => {
    if (!product.variants?.length) return '—';
    const prices = product.variants.map(v => (v.promoActive && v.promoPrice) ? v.promoPrice : v.price);
    const min = Math.min(...prices), max = Math.max(...prices);
    return min === max ? `NT$${min}` : `NT$${min}～${max}`;
  };

  const getTotalStock = (product) => product.variants?.reduce((s, v) => s + (v.stock||0), 0) || 0;

  // 分類清單（含各類數量）+ 搜尋/分類過濾
  const productCategories = (() => {
    const m = {};
    products.forEach(p => { m[p.category || '其他'] = (m[p.category || '其他'] || 0) + 1; });
    return Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  })();
  // 各類別的庫存合計（供類別層顯示）
  const catStock = {};
  products.forEach(p => { const c = p.category || '其他'; catStock[c] = (catStock[c] || 0) + getTotalStock(p); });

  // 某類別下的品牌（含品項數、庫存合計）
  const brandsInCat = (cat) => {
    const m = {};
    products.filter(p => (p.category || '其他') === cat).forEach(p => {
      const b = p.brand || '無品牌';
      if (!m[b]) m[b] = { name: b, count: 0, stock: 0 };
      m[b].count++; m[b].stock += getTotalStock(p);
    });
    return Object.values(m).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  };
  const productsInCatBrand = (cat, brand) => products
    .filter(p => (p.category || '其他') === cat && (p.brand || '無品牌') === brand)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hant'));

  const listCard = { background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' };
  const emptyCard = (t) => <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:40, textAlign:'center', color:'#999', fontSize:13 }}>{t}</div>;

  // 麵包屑/返回（類別 › 品牌）
  const drillBack = () => (!productSearch && selectedCategory) ? (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
      <button onClick={() => selectedBrand ? setSelectedBrand(null) : setSelectedCategory(null)}
        style={{ height:34, padding:'0 12px', borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', color:'#8B1A1A', fontSize:13, fontWeight:600, cursor:'pointer', flexShrink:0 }}>← {selectedBrand ? '品牌' : '類別'}</button>
      <span style={{ fontSize:15, fontWeight:700, color:'#8B1A1A' }}>{selectedCategory}{selectedBrand ? ` › ${selectedBrand}` : ''}</span>
    </div>
  ) : null;

  // 共用下鑽：搜尋→直接品項；否則 類別→品牌→(leaf 型號)
  const renderDrill = (leaf) => {
    if (products.length === 0) return emptyCard('尚無商品，請先至「庫存管理」新增');
    if (productSearch) return filteredProducts.length === 0 ? emptyCard('找不到符合的商品') : leaf(filteredProducts);
    if (!selectedCategory) return (
      <div style={listCard}>{productCategories.map(c => (
        <div key={c.name} onClick={() => { setSelectedCategory(c.name); setSelectedBrand(null); }}
          style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'15px 14px', borderBottom:'0.5px solid #F5EFEF', cursor:'pointer' }}>
          <div style={{ fontWeight:700, fontSize:16 }}>{c.name}</div>
          <div style={{ fontSize:12, color:'#888' }}>{c.count} 品項 · 庫存 {catStock[c.name] || 0}　<span style={{ color:'#8B1A1A', fontSize:16 }}>›</span></div>
        </div>
      ))}</div>
    );
    if (!selectedBrand) return (
      <div style={listCard}>{brandsInCat(selectedCategory).map(b => (
        <div key={b.name} onClick={() => setSelectedBrand(b.name)}
          style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'15px 14px', borderBottom:'0.5px solid #F5EFEF', cursor:'pointer' }}>
          <div style={{ fontWeight:700, fontSize:16, color:'#1a1a1a' }}>{b.name}</div>
          <div style={{ fontSize:12, color:'#888' }}>{b.count} 型號 · 庫存 {b.stock}　<span style={{ color:'#8B1A1A', fontSize:16 }}>›</span></div>
        </div>
      ))}</div>
    );
    return leaf(productsInCatBrand(selectedCategory, selectedBrand));
  };

  // 單一商品列（型號層 / 搜尋結果共用，銷售頁用）：點擊→選變體(顏色尺寸)
  const productRow = (p) => {
    const totalStock = getTotalStock(p);
    const stockColor = totalStock === 0 ? '#A32D2D' : (totalStock <= p.lowStockAlert ? '#D97706' : '#2D7D46');
    return (
      <div key={p.id} onClick={() => totalStock > 0 && setSelectedProduct(p)}
        style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', borderBottom:'0.5px solid #F5EFEF', cursor: totalStock > 0 ? 'pointer' : 'not-allowed', opacity: totalStock > 0 ? 1 : 0.55 }}>
        <div style={{ flex:1, minWidth:0 }}>
          {p.brand && <div style={{ fontSize:13, fontWeight:600, color:'#8B1A1A' }}>{p.brand}</div>}
          <div style={{ fontWeight:600, fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace' }}>{getProductPriceRange(p)}</div>
          <div style={{ fontSize:13, color:'#888' }}>
            庫存 <span style={{ fontSize:15, fontWeight:700, color: stockColor }}>{totalStock}</span>{totalStock === 0 ? '（已售完）' : ''} · {p.variants?.length || 0} 變體
          </div>
        </div>
      </div>
    );
  };

  const filteredProducts = products.filter(p => {
    if (catFilter && (p.category || '其他') !== catFilter) return false;
    if (productSearch) {
      const q = productSearch.trim().toLowerCase();
      const hay = `${p.name} ${p.brand} ${p.category} ${(p.variants || []).map(v => v.size).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const bc = (a.brand || '').localeCompare(b.brand || '', 'zh-Hant');   // 先品牌
    return bc !== 0 ? bc : (a.name || '').localeCompare(b.name || '', 'zh-Hant');  // 再名稱
  });

  return (
    <div style={{ padding: isMobile ? 12 : 20, background:'#F7F3F3',  }}>
      {msg && (
        <div style={{ background: msgType==='ok'?'#E6F4EB':'#FCEBEB', border:`0.5px solid ${msgType==='ok'?'#B3DEC0':'#F09595'}`, borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color: msgType==='ok'?'#2D7D46':'#A32D2D' }}>
          {msg}
        </div>
      )}

      {isSuperAdmin && gyms.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, background:'#fff', border:'0.5px solid #E8D5D5', borderRadius:8, padding:'8px 12px' }}>
          <span style={{ fontSize:12, color:'#999' }}>操作館別：</span>
          <select value={selectedGymId} onChange={e => setSelectedGymId(e.target.value)}
            style={{ height:30, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
            {gyms.map(g => <option key={g.id} value={g.id}>{g.shortName || g.name}</option>)}
          </select>
          <span style={{ fontSize:11, color:'#999' }}>銷售扣庫存、盤點皆套用此館別</span>
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap: isMobile ? 'wrap' : 'nowrap', gap: isMobile ? 10 : 0 }}>
        <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
        {tab === 'inventory' && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={handleImport}/>
            <button onClick={handleExport}
              style={{ height:isMobile?40:36, padding:`0 ${isMobile?16:14}px`, borderRadius:8, background:'#2D7D46', color:'#fff', border:'none', fontSize: isMobile?14:13, cursor:'pointer' }}>
              📤 匯出庫存
            </button>
            <button onClick={openStocktake} disabled={products.length === 0}
              style={{ height:36, padding:'0 14px', borderRadius:8, background:'#854F0B', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>
              📋 庫存盤點
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={loading}
              style={{ height:36, padding:'0 14px', borderRadius:8, background:'#185FA5', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>
              📥 Excel 匯入
            </button>
            <button onClick={() => setShowAddProduct(true)}
              style={{ height:36, padding:'0 16px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>
              ＋ 新增商品
            </button>
          </div>
        )}
      </div>

      {/* ── 銷售 tab ── */}
      {tab === 'sell' && (
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap:16 }}>
          <div>
            {/* 搜尋 + 返回（類別 › 品牌）*/}
            <div style={{ marginBottom:12 }}>
              <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="🔍 搜尋商品名稱 / 品牌 / 尺寸..."
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#fff', outline:'none', boxSizing:'border-box', color:'#1a1a1a' }}/>
            </div>
            {drillBack()}
            {renderDrill(list => <div style={listCard}>{list.map(productRow)}</div>)}
          </div>

          {/* 購物車 */}
          <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16, height:'fit-content' }}>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:14 }}>購物車</div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>會員（選填）</label>
              <input value={memberQuery} onChange={e => searchMember(e.target.value)} placeholder="搜尋姓名或手機..."
                style={{ width:'100%', height:34, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:12, outline:'none', boxSizing:'border-box', background:'#FBF5F5' }}/>
              {memberResults.length > 0 && !selectedMember && (
                <div style={{ border:'0.5px solid #E8D5D5', borderRadius:8, marginTop:4 }}>
                  {memberResults.slice(0,4).map(m => (
                    <div key={m.id} onClick={() => { setSelectedMember(m); setMemberQuery(m.name); setMemberResults([]); }}
                      style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, borderBottom:'0.5px solid #F5EFEF', display:'flex', justifyContent:'space-between' }}>
                      <span>{m.name}</span><span style={{ color:'#999' }}>{m.phone}</span>
                    </div>
                  ))}
                </div>
              )}
              {selectedMember && (
                <div style={{ background:'#E6F4EB', borderRadius:6, padding:'6px 10px', marginTop:4, fontSize:12, display:'flex', justifyContent:'space-between' }}>
                  <span>{selectedMember.name}{teamActive && <span style={{ marginLeft:6, color:'#2D7D46', fontWeight:700 }}>🏅攀岩隊員 9 折</span>}</span>
                  <span onClick={() => { setSelectedMember(null); setMemberQuery(''); }} style={{ cursor:'pointer', color:'#999' }}>×</span>
                </div>
              )}
            </div>
            {cart.length === 0 ? (
              <div style={{ textAlign:'center', padding:'20px 0', color:'#999', fontSize:12 }}>點擊商品選擇變體加入購物車</div>
            ) : cart.map(item => (
              <div key={item.key} style={{ marginBottom:10, padding:'8px 0', borderBottom:'0.5px solid #F5EFEF' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:500 }}>{item.productName}</div>
                    <div style={{ fontSize:11, color:'#999' }}>
                      {[item.size, item.color].filter(Boolean).join(' / ')}
                      {item.promoActive && item.promoPrice && (
                        <span style={{ color:'#A32D2D', marginLeft:4 }}>促銷 NT${item.promoPrice}</span>
                      )}
                    </div>
                    <div style={{ fontSize:11, color:'#666' }}>
                      NT${item.unitPrice} × {item.quantity} = {teamActive && itemGross(item) >= 100 ? (
                        <>
                          <span style={{ textDecoration:'line-through', color:'#bbb' }}>NT${itemGross(item).toLocaleString()}</span>
                          <span style={{ color:'#2D7D46', fontWeight:600, marginLeft:4 }}>NT${itemNet(item).toLocaleString()}</span>
                          <span style={{ color:'#2D7D46', marginLeft:2 }}>(9折)</span>
                        </>
                      ) : <>NT${itemGross(item).toLocaleString()}</>}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <button onClick={() => updateQty(item.key, item.quantity-1)}
                      style={{ width:22, height:22, borderRadius:11, border:'0.5px solid #E8D5D5', background:'#fff', cursor:'pointer', fontSize:13 }}>−</button>
                    <span style={{ fontSize:12, minWidth:18, textAlign:'center' }}>{item.quantity}</span>
                    <button onClick={() => updateQty(item.key, item.quantity+1)}
                      style={{ width:22, height:22, borderRadius:11, border:'0.5px solid #E8D5D5', background:'#fff', cursor:'pointer', fontSize:13 }}>＋</button>
                    <button onClick={() => removeFromCart(item.key)}
                      style={{ width:22, height:22, borderRadius:11, border:'none', background:'#FCEBEB', color:'#A32D2D', cursor:'pointer', fontSize:11 }}>✕</button>
                  </div>
                </div>
              </div>
            ))}
            {cart.length > 0 && (
              <>
                <div style={{ marginTop:8, marginBottom:8 }}>
                  <div style={{ fontSize:11, color:'#666', marginBottom:6 }}>付款方式</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {PAY_METHODS.map(pm => (
                      <button key={pm.key} onClick={() => setPaymentMethod(pm.key)}
                        style={{ height:28, padding:'0 10px', borderRadius:8, border:`0.5px solid ${paymentMethod===pm.key?'#8B1A1A':'#E8D5D5'}`, background: paymentMethod===pm.key?'#8B1A1A':'#fff', color: paymentMethod===pm.key?'#fff':'#666', fontSize:11, cursor:'pointer' }}>
                        {pm.label}
                      </button>
                    ))}
                  </div>
                </div>
                {teamActive && cartDiscount > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#2D7D46', marginBottom:6, padding:'0 4px' }}>
                    <span>攀岩隊員 9 折折扣</span><span style={{ fontWeight:600 }}>−NT${cartDiscount.toLocaleString()}</span>
                  </div>
                )}
                <div style={{ background:'#FBF5F5', borderRadius:8, padding:'10px 12px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:13, color:'#666' }}>總計{teamActive && cartDiscount > 0 && <span style={{ fontSize:11, color:'#999', textDecoration:'line-through', marginLeft:6 }}>NT${cartGross.toLocaleString()}</span>}</span>
                  <span style={{ fontSize:18, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace' }}>NT${totalAmount.toLocaleString()}</span>
                </div>
                <button onClick={handleSell} disabled={loading}
                  style={{ width:'100%', height:44, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                  {loading ? '處理中...' : `✓ 完成銷售 NT$${totalAmount.toLocaleString()}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 庫存管理 tab ── */}
      {tab === 'inventory' && (
        <div>
          {products.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="🔍 搜尋商品名稱 / 品牌 / 尺寸..."
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#fff', outline:'none', boxSizing:'border-box', color:'#1a1a1a' }}/>
            </div>
          )}
          {drillBack()}
          {renderDrill(list => list.map(p => (
            <div key={p.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  {p.brand && <div style={{ fontSize:11, color:'#999' }}>{p.brand}</div>}
                  <div style={{ fontWeight:600, fontSize:15 }}>{p.name}</div>
                  <div style={{ fontSize:12, color:'#666', marginTop:2 }}>{p.category} · 低庫存警示：{p.lowStockAlert} 件</div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => { setShowRestock(p); setRestockVariantId(p.variants?.[0]?.id||''); }}
                    style={{ height:30, padding:'0 12px', borderRadius:8, background:'#E6F4EB', color:'#2D7D46', border:'none', fontSize:12, cursor:'pointer', fontWeight:500 }}>
                    入庫
                  </button>
                  <button onClick={() => { setEditingProduct(p); setProductForm({ brand:p.brand||'', name:p.name, description:p.description||'', category:p.category, lowStockAlert:p.lowStockAlert||5, variants: p.variants||[] }); }}
                    style={{ height:30, padding:'0 12px', borderRadius:8, background:'#fff', color:'#444', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer' }}>
                    編輯
                  </button>
                  <button onClick={() => { if(window.confirm(`停用「${p.name}」？`)) { deleteProduct(p.id).then(() => { showMsg('已停用'); loadProducts(); }); } }}
                    style={{ height:30, padding:'0 12px', borderRadius:8, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:12, cursor:'pointer' }}>
                    停用
                  </button>
                </div>
              </div>
              {/* 變體列表 */}
              <div style={{ borderTop:'0.5px solid #F5EFEF', paddingTop:10 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 60px 60px 55px 55px 60px 70px', gap:6, fontSize:10, color:'#999', fontWeight:600, marginBottom:6, padding:'0 4px' }}>
                  <span>尺寸</span><span>顏色</span><span>原價</span><span>促銷價</span><span>新竹館</span><span>士林館</span><span>倉庫</span><span>促銷</span>
                </div>
                {(p.variants||[]).map(v => {
                  const hsinchuStock = v.gymStock?.['gym-hsinchu'] ?? 0;
                  const shilinStock = v.gymStock?.['gym-shilin'] ?? 0;
                  const warehouseStock = v.warehouseStock ?? 0;
                  return (
                  <div key={v.id} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 60px 60px 55px 55px 60px 70px', gap:6, fontSize:12, padding:'5px 4px', borderRadius:6, background: v.stock <= p.lowStockAlert ? '#FFF5F5' : 'none', marginBottom:2, alignItems:'center' }}>
                    <span style={{ color: v.stock === 0 ? '#999' : '#1a1a1a' }}>{v.size || '—'}</span>
                    <span style={{ color: v.stock === 0 ? '#999' : '#1a1a1a' }}>{v.color || '—'}</span>
                    <span style={{ fontFamily:'monospace' }}>NT${v.price}</span>
                    <span style={{ fontFamily:'monospace', color: v.promoPrice ? '#8B1A1A' : '#ccc' }}>
                      {v.promoPrice ? `NT$${v.promoPrice}` : '—'}
                    </span>
                    <span style={{ color: hsinchuStock === 0 ? '#A32D2D' : hsinchuStock <= p.lowStockAlert ? '#854F0B' : '#2D7D46', fontWeight:500 }}>
                      {hsinchuStock}
                    </span>
                    <span style={{ color: shilinStock === 0 ? '#A32D2D' : shilinStock <= p.lowStockAlert ? '#854F0B' : '#2D7D46', fontWeight:500 }}>
                      {shilinStock}
                    </span>
                    {editingWarehouse === v.id ? (
                      <div style={{ display:'flex', gap:2 }}>
                        <input autoFocus type="number" value={warehouseInput} onChange={e => setWarehouseInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSaveWarehouse(p.id, v.id)}
                          style={{ width:38, height:22, fontSize:11, border:'0.5px solid #8B1A1A', borderRadius:4, padding:'0 3px' }} />
                        <button onClick={() => handleSaveWarehouse(p.id, v.id)} style={{ border:'none', background:'none', color:'#2D7D46', cursor:'pointer', fontSize:13 }}>✓</button>
                      </div>
                    ) : (
                      <span
                        onClick={() => { if (isSuperAdmin) { setEditingWarehouse(v.id); setWarehouseInput(String(warehouseStock)); } }}
                        title={isSuperAdmin ? '點擊修改倉庫庫存' : '僅總管理人員可修改'}
                        style={{ color:'#6b6b6b', fontWeight:500, cursor: isSuperAdmin ? 'pointer' : 'default', textDecoration: isSuperAdmin ? 'underline dotted' : 'none' }}>
                        {warehouseStock}
                      </span>
                    )}
                    <div>
                      {v.promoPrice ? (
                        <button onClick={() => handleTogglePromo(p.id, v.id, v.promoActive)}
                          style={{ height:22, padding:'0 8px', borderRadius:6, background: v.promoActive ? '#8B1A1A' : '#f5f5f5', color: v.promoActive ? '#fff' : '#999', border:'none', fontSize:10, cursor:'pointer', fontWeight:500 }}>
                          {v.promoActive ? '促銷中' : '開啟'}
                        </button>
                      ) : <span style={{ fontSize:10, color:'#ccc' }}>無促銷價</span>}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )))}
        </div>
      )}

      {/* ── 選擇變體 Modal ── */}
      {selectedProduct && (
        <Modal title={`選擇規格 — ${selectedProduct.name}`} onClose={() => setSelectedProduct(null)} width={400}>
          {selectedProduct.brand && <div style={{ fontSize:12, color:'#999', marginBottom:8 }}>{selectedProduct.brand}</div>}
          {(selectedProduct.variants||[]).map(v => {
            const unitPrice = (v.promoActive && v.promoPrice) ? v.promoPrice : v.price;
            const inCart = cart.find(c => c.variantId === v.id);
            return (
              <div key={v.id} onClick={() => v.stock > 0 && addToCart(selectedProduct, v)}
                style={{ padding:'12px 14px', borderRadius:10, border:'0.5px solid #E8D5D5', marginBottom:8, cursor: v.stock > 0 ? 'pointer' : 'not-allowed', opacity: v.stock > 0 ? 1 : 0.5, background: inCart ? '#F5E8E8' : '#fff', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500 }}>{[v.size, v.color].filter(Boolean).join(' / ') || '標準'}</div>
                  <div style={{ fontSize:11, color:'#999', marginTop:2 }}>庫存：{v.stock} 件</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  {v.promoActive && v.promoPrice ? (
                    <>
                      <div style={{ fontSize:14, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace' }}>NT${v.promoPrice}</div>
                      <div style={{ fontSize:11, color:'#999', textDecoration:'line-through' }}>NT${v.price}</div>
                    </>
                  ) : (
                    <div style={{ fontSize:14, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace' }}>NT${v.price}</div>
                  )}
                  {inCart && <div style={{ fontSize:10, color:'#8B1A1A', marginTop:2 }}>已加入 {inCart.quantity} 件</div>}
                </div>
              </div>
            );
          })}
        </Modal>
      )}

      {/* ── 新增商品 Modal ── */}
      {showAddProduct && (
        <Modal title="新增商品" onClose={() => setShowAddProduct(false)} width={560}>
          {[
            { label:'品牌（選填）', key:'brand', type:'text' },
            { label:'商品名稱', key:'name', type:'text' },
            { label:'類別', key:'category', type:'text' },
            { label:'說明（選填）', key:'description', type:'text' },
            { label:'低庫存警示（件）', key:'lowStockAlert', type:'number' },
          ].map(f => (
            <div key={f.key} style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
              <input type={f.type} value={productForm[f.key]||''}
                onChange={e => setProductForm({...productForm, [f.key]:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>
          ))}
          <div style={{ marginBottom:16 }}>
            <VariantForm variants={productForm.variants} onChange={v => setProductForm({...productForm, variants:v})}/>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowAddProduct(false)}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
            <button onClick={handleCreateProduct} disabled={loading}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {loading ? '建立中...' : '建立商品'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── 編輯商品 Modal ── */}
      {editingProduct && (
        <Modal title={`編輯 — ${editingProduct.name}`} onClose={() => setEditingProduct(null)} width={560}>
          {[
            { label:'品牌', key:'brand', type:'text' },
            { label:'商品名稱', key:'name', type:'text' },
            { label:'類別', key:'category', type:'text' },
            { label:'說明', key:'description', type:'text' },
            { label:'低庫存警示（件）', key:'lowStockAlert', type:'number' },
          ].map(f => (
            <div key={f.key} style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
              <input type={f.type} value={productForm[f.key]||''}
                onChange={e => setProductForm({...productForm, [f.key]:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>
          ))}
          <div style={{ marginBottom:16 }}>
            <VariantForm variants={productForm.variants||[]} onChange={v => setProductForm({...productForm, variants:v})}/>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setEditingProduct(null)}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
            <button onClick={handleUpdateProduct} disabled={loading}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {loading ? '更新中...' : '儲存'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── 入庫 Modal ── */}
      {showRestock && (
        <Modal title={`入庫 — ${showRestock.name}`} onClose={() => setShowRestock(null)}>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>選擇變體</label>
            <select value={restockVariantId} onChange={e => setRestockVariantId(e.target.value)}
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
              {(showRestock.variants||[]).map(v => (
                <option key={v.id} value={v.id}>
                  {[v.size, v.color].filter(Boolean).join(' / ') || '標準'} (庫存: {v.stock})
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>入庫數量</label>
            <input type="number" value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="請輸入數量"
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>備註（選填）</label>
            <input type="text" value={restockNote} onChange={e => setRestockNote(e.target.value)} placeholder="如：廠商補貨"
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowRestock(null)}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
            <button onClick={handleRestock} disabled={loading}
              style={{ flex:2, height:40, borderRadius:9, background:'#2D7D46', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {loading ? '入庫中...' : '確認入庫'}
            </button>
          </div>
        </Modal>
      )}
      {/* ── 庫存盤點 Modal ── */}
      {showStocktake && (
        <Modal title="庫存盤點" onClose={() => setShowStocktake(false)} width={640}>
          {stocktakeResult ? (
            <>
              <div style={{ marginBottom:16 }}>
                {stocktakeResult.discrepancies?.length > 0 ? (
                  <>
                    <div style={{ background:'#FAEEDA', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#854F0B', fontWeight:500 }}>
                      ⚠️ 發現 {stocktakeResult.discrepancies.length} 項差異，已通知管理員
                    </div>
                    <div style={{ background:'#fff', borderRadius:8, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px 80px 80px', gap:8, padding:'8px 14px', fontSize:11, color:'#999', fontWeight:600, background:'#FBF5F5' }}>
                        <span>商品</span><span>規格</span><span>帳面</span><span>實際</span><span>差異</span>
                      </div>
                      {stocktakeResult.discrepancies.map((d, i) => (
                        <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px 80px 80px', gap:8, padding:'10px 14px', fontSize:13, borderTop:'0.5px solid #F5EFEF' }}>
                          <span>{d.productName}</span>
                          <span style={{ color:'#666' }}>{[d.size, d.color].filter(Boolean).join('/')}</span>
                          <span>{d.systemStock}</span>
                          <span>{d.actualStock}</span>
                          <span style={{ color: d.diff > 0 ? '#2D7D46' : '#A32D2D', fontWeight:600 }}>
                            {d.diff > 0 ? '+' : ''}{d.diff}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ background:'#E6F4EB', borderRadius:8, padding:'12px 14px', fontSize:13, color:'#2D7D46', fontWeight:500 }}>
                    ✓ 盤點完成，庫存無差異
                  </div>
                )}
              </div>
              <button onClick={() => setShowStocktake(false)}
                style={{ width:'100%', height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>
                關閉
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize:12, color:'#666', marginBottom:12 }}>請輸入實際盤點數量，系統將與帳面庫存比對</div>
              <div style={{ maxHeight:400, overflowY:'auto' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px 80px', gap:8, padding:'6px 10px', fontSize:11, color:'#999', fontWeight:600, background:'#FBF5F5', borderRadius:6, marginBottom:6 }}>
                  <span>商品</span><span>規格</span><span>帳面</span><span>盤點數量</span>
                </div>
                {stocktakeItems.map((item, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px 80px', gap:8, padding:'8px 10px', fontSize:13, borderBottom:'0.5px solid #F5EFEF', alignItems:'center',
                    background: parseInt(item.actualStock) !== item.systemStock ? '#FFF5E8' : 'none' }}>
                    <div>
                      {item.brand && <div style={{ fontSize:10, color:'#999' }}>{item.brand}</div>}
                      <div>{item.productName}</div>
                    </div>
                    <span style={{ color:'#666', fontSize:12 }}>{[item.size, item.color].filter(Boolean).join('/') || '標準'}</span>
                    <span style={{ color:'#999' }}>{item.systemStock}</span>
                    <input type="number" value={item.actualStock}
                      onChange={e => setStocktakeItems(stocktakeItems.map((it, idx) => idx===i ? {...it, actualStock: e.target.value} : it))}
                      style={{ width:'100%', height:32, borderRadius:6, color:'#1a1a1a', border: parseInt(item.actualStock) !== item.systemStock ? '1px solid #F5A623' : '0.5px solid #E8D5D5',
                        padding:'0 8px', fontSize:13, outline:'none', textAlign:'center', background: parseInt(item.actualStock) !== item.systemStock ? '#FFF9F0' : '#fff' }}/>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:8, marginTop:16 }}>
                <button onClick={() => setShowStocktake(false)}
                  style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', color:'#666', fontSize:13, cursor:'pointer' }}>取消</button>
                <button onClick={handleStocktake} disabled={loading}
                  style={{ flex:2, height:40, borderRadius:9, background:'#854F0B', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                  {loading ? '盤點中...' : '確認盤點'}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
