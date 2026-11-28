'use strict';
/* Mağaza Kassası — məlumatlar yalnız bu cihazın brauzerində (localStorage) saxlanılır. */
const $ = s => document.querySelector(s);
const K = { p: 'mk_products', s: 'mk_sales', c: 'mk_cfg', b: 'mk_lastbackup', u: 'mk_cust', l: 'mk_ledger' };
const LOW = 5;
const ld = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
let products = ld(K.p, []), sales = ld(K.s, []), cfg = ld(K.c, { shop: 'Mağaza Kassası' });
let cart = [], view = 'sell', period = 'day', persisted = false, dp = null;
let customers = ld(K.u, []), ledger = ld(K.l, []), unlocked = false, payMode = 'cash', selCust = '', lastAdded = '', formImg = '', hold = false, pend = null, pendCode = '';
fixCfg();

/* Ayrıca modullar: hazırda QOŞULMAYIB. Gələcəkdə fiskal çek / bank terminalı buraya bağlanacaq. */
const Modules = { fiscal: { connected: false }, card: { connected: false } };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = n => Math.round((+n || 0) * 100) / 100;
const money = n => { n = r2(n); const [a, b] = Math.abs(n).toFixed(2).split('.'); return (n < 0 ? '-' : '') + a.replace(/\B(?=(\d{3})+$)/g, ' ') + ',' + b + ' ₼'; };
const pad = n => String(n).padStart(2, '0');
const dt = t => { const d = new Date(t); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function save() {
  try {
    localStorage.setItem(K.p, JSON.stringify(products));
    localStorage.setItem(K.s, JSON.stringify(sales));
    localStorage.setItem(K.c, JSON.stringify(cfg));
    localStorage.setItem(K.u, JSON.stringify(customers));
    localStorage.setItem(K.l, JSON.stringify(ledger));
    return true;
  } catch (e) { toast('Yaddaş doludur! Ehtiyat nüsxə çıxarın.', 'err'); return false; }
}
let tt;
function toast(m, t = '') { const e = $('#tst'); e.textContent = m; e.className = 'on ' + t; clearTimeout(tt); tt = setTimeout(() => e.className = '', 2800); }
function modal(h) { $('#sheet').innerHTML = h; $('#mdl').classList.add('on'); }
function closeModal() { $('#mdl').classList.remove('on'); if (loy && (loy.cid || loy.use)) { loy = { cid: '', use: 0, ph: '', nf: false }; lastAdded = ''; if (view === 'sell') rCart(); } }
function applyCfg() { $('#title').textContent = cfg.shop || 'Mağaza Kassası'; }

/* ---------- Naviqasiya ---------- */
function go(v) {
  if ((v === 'rep' || v === 'set') && cfg.pin && !unlocked) return pinPrompt(v);
  if (v === 'sell' || v === 'prod') unlocked = false;
  view = v; document.body.dataset.v = v;
  document.querySelectorAll('.view').forEach(e => e.classList.toggle('on', e.id === 'v-' + v));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  ({ sell: rCart, prod: rProd, rep: rRep, set: rSet })[v](); scrollTo(0, 0);
}

/* ---------- Satış ---------- */
const byCode = c => products.find(p => p.barcode && p.barcode === c);
const match = v => { v = v.toLowerCase(); return products.filter(p => p.name.toLowerCase().includes(v) || (p.barcode || '').includes(v)); };
const total = () => price().total;

function addToCart(p) {
  const i = cart.find(x => x.id === p.id), q = i ? i.qty : 0;
  if (q + 1 > p.stock) { toast(`Stok kifayət deyil: ${p.name} (${p.stock} ədəd)`, 'err'); return false; }
  i ? i.qty++ : cart.push({ id: p.id, qty: 1 });
  lastAdded = p.id; rCart(); return true;
}
function chg(id, d) {
  const i = cart.find(x => x.id === id), p = products.find(x => x.id === id);
  if (d > 0) { addToCart(p); return; }
  i.qty--; lastAdded = ''; if (i.qty < 1) cart = cart.filter(x => x !== i);
  rCart();
}
function clearCart() { if (cart.length && confirm('Səbət təmizlənsin?')) { cart = []; rCart(); } }
function rCart() {
  const rows = cart.map(i => ({ i, p: products.find(x => x.id === i.id) })).filter(r => r.p);
  cart = rows.map(r => r.i);
  $('#cartl').innerHTML = rows.length
    ? rows.map(({ i, p }) => `<div class="card item${p.id === lastAdded ? ' pop' : ''}"><div class="grow"><b>${esc(p.name)}</b><small>${money(p.sell)} × ${i.qty} = ${money(p.sell * i.qty)}${promoTag(p, i.qty)}</small></div><div class="qty"><button onclick="chg('${p.id}',-1)" aria-label="Azalt">−</button><span>${i.qty}</span><button onclick="chg('${p.id}',1)" aria-label="Artır">+</button></div></div>`).join('') +
      '<button class="btn gh" style="margin-top:12px" onclick="clearCart()">Səbəti təmizlə</button>'
    : '<div class="empty">Səbət boşdur<br><small>Barkodu skan edin və ya məhsul axtarın</small></div>';
  $('#tot').textContent = money(total()); $('#pay').disabled = !rows.length; $('#sel').textContent = '👤 ' + cfg.seller; { const t = $('#tot'); t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); } rQs();
}
function pick(id) { const p = products.find(x => x.id === id); if (p && addToCart(p)) { $('#q').value = ''; $('#sug').innerHTML = ''; } }
$('#q').oninput = e => {
  const v = e.target.value.trim();
  $('#sug').innerHTML = v ? (match(v).slice(0, 6).map(p => `<div class="sug" onclick="pick('${p.id}')"><span>${esc(p.name)}</span><b>${money(p.sell)}</b></div>`).join('') || '<div class="sug muted">Məhsul tapılmadı</div>') : '';
};
$('#q').onkeydown = e => { // USB/Bluetooth barkod oxuyucu da Enter ilə işləyir
  if (e.key !== 'Enter') return;
  const v = e.target.value.trim(); if (!v) return;
  const m = match(v), p = byCode(v) || (m.length === 1 ? m[0] : null);
  p ? pick(p.id) : toast(m.length ? 'Siyahıdan məhsul seçin' : 'Barkod tapılmadı: ' + v, 'err');
};

function payModal(mode) {
  if (!cart.length) return;
  if (!mode) loy = { cid: '', use: 0, ph: '', nf: false };
  payMode = mode || 'cash'; if (payMode === 'deliv') dPayMode = 'paid';
  const P = price(), t = P.total, cr = payMode === 'credit', dv = payMode === 'deliv', cs = payMode === 'cash';
  const ly = ptsOn() ? `<div class="lyb"><div class="bar"><input id="lp" type="tel" inputmode="tel" placeholder="⭐ Müştəri nömrəsi (sadiqlik)" value="${esc(loy.ph || '')}"><button class="ic" onclick="loyFind()" aria-label="Tap">🔍</button></div>${loyInfo(P)}</div>` : '';
  const body = dv
    ? `<label>Ad Soyad<input id="d-n" maxlength="60" oninput="calc()"></label>
    <label>Telefon<input id="d-p" type="tel" inputmode="tel" maxlength="20" oninput="calc()"></label>
    <label>Ünvan<textarea id="d-a" rows="2" maxlength="200" placeholder="Şəhər, rayon, küçə, bina, mənzil" oninput="calc()"></textarea></label>
    <label>Poçt indeksi<input id="d-z" maxlength="10" placeholder="AZ1000"></label>
    <div class="seg"><button id="d-pd" class="on" onclick="dPay('paid')">✅ Ödənilib</button><button id="d-pc" onclick="dPay('cod')">💵 Kuryer alacaq</button></div>`
    : cr
      ? `${customers.length ? `<label>Müştəri (nisyə)<select id="cust" onchange="calc()"><option value="">Seçin…</option>${customers.map(c => `<option value="${c.id}"${c.id === selCust ? ' selected' : ''}>${esc(c.name)} (borc ${money(bal(c.id))})</option>`).join('')}</select></label>` : ''}
    <button class="btn gh" style="margin-bottom:12px" onclick="newCust('pay')">+ Yeni müştəri</button>
    <label>İndi ödənilən (₼, ixtiyari)<input id="rcv" type="number" inputmode="decimal" step="0.01" min="0" oninput="calc()"></label>`
      : `<label>Alınan məbləğ (₼)<input id="rcv" type="number" inputmode="decimal" step="0.01" min="0" oninput="calc()"></label><div class="chips" id="chips"></div>`;
  modal(`<h2>${dv ? 'Çatdırılma sifarişi' : 'Ödəniş'}</h2><div class="big" id="bigt">${money(t)}</div><div class="muted" id="sumr" style="text-align:center;margin:-8px 0 10px"></div>
  ${ly}<div class="seg"><button class="${cs ? 'on' : ''}" onclick="payModal('cash')">💵 Nağd</button><button class="${cr ? 'on' : ''}" onclick="payModal('credit')">📒 Nisyə</button><button class="${dv ? 'on' : ''}" onclick="payModal('deliv')">🚚 Çatdırılma</button></div>
  ${body}<div class="change" id="chv"></div>
  <div class="row2"><button class="btn gh" onclick="closeModal()">Ləğv et</button><button class="btn" id="ok" onclick="finish()" disabled>Təsdiqlə</button></div>`);
  calc();
}
function dPay(m) { dPayMode = m; $('#d-pd').classList.toggle('on', m === 'paid'); $('#d-pc').classList.toggle('on', m === 'cod'); calc(); }
function setRcv(a) { $('#rcv').value = a; calc(); }
function calc() {
  const P = price(), t = P.total, pd = r2(P.L.reduce((a, l) => a + l.d, 0));
  $('#bigt').textContent = money(t);
  $('#sumr').textContent = [pd ? 'Aksiya: −' + money(pd) : '', P.loy ? 'Sadiqlik: −' + money(P.loy) : ''].filter(Boolean).join(' • ');
  if (payMode === 'deliv') {
    $('#chv').textContent = (dPayMode === 'cod' ? 'Kuryer alacaq: ' : 'Ödənilib: ') + money(t);
    $('#ok').disabled = !($('#d-n').value.trim() && $('#d-p').value.trim() && $('#d-a').value.trim()); return;
  }
  const v = r2(parseFloat($('#rcv').value)), c = $('#cust');
  if (payMode === 'credit') {
    $('#chv').textContent = 'Borca yazılacaq: ' + money(t - v);
    $('#ok').disabled = !(c && c.value && v >= 0 && v < t); return;
  }
  $('#chips').innerHTML = [...new Set([t, ...[5, 10, 20, 50, 100].map(n => Math.ceil(t / n) * n)])].filter(a => a >= t).slice(0, 4).map((a, k) => `<button onclick="setRcv(${a})">${k ? money(a) : 'Dəqiq'}</button>`).join('');
  const ok = v >= t;
  $('#chv').textContent = ok ? 'Qaytarılacaq: ' + money(v - t) : 'Çatışmayan: ' + money(t - v);
  $('#ok').disabled = !ok;
}
function finish() {
  const P = price(), t = P.total, dv = payMode === 'deliv', cr = payMode === 'credit';
  const v = dv ? 0 : r2(parseFloat($('#rcv').value)), c = cr && customers.find(x => x.id === $('#cust').value);
  let d = null;
  if (dv) { d = { name: $('#d-n').value.trim(), phone: $('#d-p').value.trim(), addr: $('#d-a').value.trim(), zip: $('#d-z').value.trim(), pay: dPayMode, st: 'new' }; if (!d.name || !d.phone || !d.addr) return; }
  else if (v < 0 || (cr ? !(c && v < t) : v < t)) return;
  if (!cart.length) return;
  for (const i of cart) { const p = products.find(x => x.id === i.id); if (!p || p.stock < i.qty) return toast('Stok kifayət deyil: ' + (p ? p.name : ''), 'err'); }
  const items = P.L.map(l => ({ id: l.p.id, name: l.p.name, barcode: l.p.barcode, qty: l.qty, buy: l.p.buy, sell: l.p.sell, d: l.d }));
  if (P.loy > 0) { let rest = P.loy; items.forEach((it, k) => { const sh = k === items.length - 1 ? rest : Math.min(rest, r2(P.loy * (it.sell * it.qty - it.d) / P.sub)); it.d = r2(it.d + sh); rest = r2(rest - sh); }); }
  const s = { id: uid(), ts: Date.now(), total: t, paid: v, change: (cr || dv) ? 0 : r2(v - t), method: dv ? 'delivery' : cr ? 'credit' : 'cash', seller: cfg.seller, items };
  if (cr) { s.cid = c.id; s.cname = c.name; s.debt = r2(t - v); }
  if (dv) s.dlv = d;
  const pts0 = P.c ? P.c.pts || 0 : 0;
  if (P.c) { s.lc = P.c.id; s.pu = P.use; s.pe = Math.floor(t * PE()); P.c.pts = pts0 - P.use + s.pe; }
  const bak = JSON.stringify(products);
  cart.forEach(i => { products.find(x => x.id === i.id).stock -= i.qty; });
  sales.push(s);
  if (cr) ledger.push({ id: uid(), cid: c.id, ts: s.ts, amt: s.debt, type: 'debt', sid: s.id });
  if (!save()) { products = JSON.parse(bak); sales.pop(); if (cr) ledger.pop(); if (P.c) P.c.pts = pts0; return; }
  cart = []; selCust = ''; loy = { cid: '', use: 0, ph: '', nf: false }; rCart(); receipt(s, true);
}
function receipt(s, fresh) {
  const rt = s.ret, cr = s.method === 'credit', dv = s.method === 'delivery';
  modal(`<h2>${fresh ? (rt ? '↩ Qaytarma tamamlandı' : dv ? '🚚 Sifariş qeydə alındı' : '✅ Satış tamamlandı') : (rt ? 'Qaytarma №' : 'Satış №') + (sales.indexOf(s) + 1)}</h2>
  ${fresh && !dv ? `<div class="change">${rt ? 'Qaytarılacaq nağd: ' + money(s.cash) : cr ? 'Borca yazıldı: ' + money(s.debt) : 'Qaytarılacaq: ' + money(s.change)}</div>` : ''}
  ${rcHtml(s)}
  <div class="row3" style="margin-top:12px"><button class="btn gh" onclick="shareImg('${s.id}')">🖼 Şəkil</button><button class="btn gh" onclick="shareR('${s.id}')">📤 Mətn</button><button class="btn gh" onclick="shareR('${s.id}',1)">💬 WA</button></div>
  <button class="btn" style="margin-top:8px" onclick="printReceipt('${s.id}')">🖨 Çek çıxar</button>
  ${!fresh && !rt ? `<button class="btn gh" style="margin-top:8px" onclick="retModal('${s.id}')">↩ Məhsul qaytar</button>` : ''}
  <button class="btn gh" style="margin-top:8px" onclick="closeModal()">${fresh ? 'Yeni satış' : 'Bağla'}</button>`);
}

/* ---------- Barkod skaneri ---------- */
let stream, timer, det, last = '', lastT = 0, mode = 'sell', busy = false;
async function openScan(m) {
  mode = m;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return toast('Kamera üçün HTTPS bağlantısı lazımdır', 'err');
  if (!('BarcodeDetector' in window)) return toast('Bu brauzer skaneri dəstəkləmir. Android Chrome istifadə edin və ya barkodu əl ilə yazın.', 'err');
  try {
    const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
    const sup = BarcodeDetector.getSupportedFormats ? await BarcodeDetector.getSupportedFormats() : want;
    det = new BarcodeDetector({ formats: want.filter(f => sup.includes(f)) });
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    const v = $('#vid'); v.srcObject = stream; await v.play();
    $('#scan').classList.add('on'); $('#smsg').textContent = 'Barkodu çərçivəyə yerləşdirin';
    last = ''; timer = setInterval(tick, 200);
  } catch (e) { closeScan(); toast(e.name === 'NotAllowedError' ? 'Kameraya icazə verilməyib' : 'Kamera açılmadı', 'err'); }
}
async function tick() {
  if (busy || hold) return; busy = true;
  try {
    const r = await det.detect($('#vid'));
    if (r.length) { const c = r[0].rawValue, n = Date.now(); if (c !== last || n - lastT > 2000) { last = c; lastT = n; onCode(c); } }
  } catch (e) { }
  busy = false;
}
function closeScan() { clearInterval(timer); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; hold = false; pend = null; $('#spanel').classList.remove('on'); $('#smsg').style.display = ''; $('#scan').classList.remove('on'); }
function beep(bad) {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator();
    o.frequency.value = bad ? 200 : 900; o.connect(a.destination); o.start();
    setTimeout(() => { o.stop(); a.close(); }, bad ? 300 : 110);
    navigator.vibrate && navigator.vibrate(bad ? [80, 40, 80] : 40);
  } catch (e) { }
}
function onCode(c) {
  if (mode === 'sell') {
    const p = byCode(c);
    if (cfg.confirmScan !== false) return scanAsk(c, p);
    if (!p) { beep(true); $('#smsg').textContent = '⚠ Barkod tapılmadı: ' + c; toast('Barkod bazada tapılmadı: ' + c, 'err'); }
    else if (addToCart(p)) { beep(); $('#smsg').textContent = '✔ ' + p.name + ' əlavə olundu'; }
    else { beep(true); $('#smsg').textContent = '⚠ Stok kifayət deyil: ' + p.name; }
  } else if (mode === 'form') { beep(); $('#f-bc').value = c; closeScan(); }
  else { beep(); $('#pq').value = c; closeScan(); rProd(); }
}

/* ---------- Məhsullar ---------- */
function rProd() {
  const v = $('#pq').value.trim();
  const l = (v ? match(v) : products.slice()).sort((a, b) => a.name.localeCompare(b.name, 'az'));
  $('#plist').innerHTML = l.length ? l.map(p => `<div class="card item" onclick="editProduct('${p.id}')"><div class="th">${thumb(p)}</div><div class="grow"><b>${esc(p.name)}</b><small>${esc(p.barcode || 'barkodsuz')} • alış ${money(p.buy)}</small></div><div class="r"><b>${money(p.sell)}</b><br><span class="badge ${p.stock <= 0 ? 'er' : p.stock <= LOW ? 'wa' : 'ok'}">${p.stock} ədəd</span></div></div>`).join('')
    : `<div class="empty">${products.length ? 'Məhsul tapılmadı' : 'Hələ məhsul yoxdur<br><small>Əlavə etmək üçün + düyməsinə basın</small>'}</div>`;
}
function editProduct(id, bc) {
  const p = products.find(x => x.id === id) || { name: '', barcode: bc || '', buy: '', sell: '', stock: '' };
  formImg = p.img || '';
  modal(`<h2>${id ? 'Məhsulu redaktə et' : 'Yeni məhsul'}</h2>
  <div class="bar" style="align-items:center;margin-bottom:10px"><div class="th big" id="f-th" onclick="$('#f-img').click()">${thumb(p)}</div><div class="grow"><button type="button" class="btn gh" style="padding:10px" onclick="$('#f-img').click()">📷 Şəkil seç / çək</button></div><input type="file" id="f-img" accept="image/*" hidden onchange="pickImg(event)"></div>
  <label>Ad<input id="f-n" value="${esc(p.name)}"></label>
  <label>Barkod<div class="bar" style="margin-top:4px"><input id="f-bc" inputmode="numeric" value="${esc(p.barcode)}" style="margin:0"><button type="button" class="ic" onclick="openScan('form')" aria-label="Skan et">📷</button><button type="button" class="ic" onclick="genBc()" aria-label="Barkod yarat">🔢</button></div></label>
  <div class="row2"><label>Alış qiyməti (₼)<input id="f-b" type="number" inputmode="decimal" step="0.01" min="0" value="${p.buy}"></label>
  <label>Satış qiyməti (₼)<input id="f-s" type="number" inputmode="decimal" step="0.01" min="0" value="${p.sell}"></label></div>
  <label>Stok sayı<input id="f-st" type="number" inputmode="numeric" step="1" min="0" value="${p.stock}"></label>
  <label class="chk"><input type="checkbox" id="f-q" ${p.quick ? 'checked' : ''}> ⚡ Sürətli satışda həmişə göstər</label>
  <div class="row2">${id ? `<button class="btn er" onclick="delProduct('${id}')">Sil</button>` : '<button class="btn gh" onclick="closeModal()">Ləğv et</button>'}<button class="btn" onclick="saveProduct('${id || ''}')">Yadda saxla</button></div>
  ${id ? `<br><button class="btn gh" onclick="labelModal('${id}')">🏷 Etiket çap et</button>` : ''}`);
}
function saveProduct(id) {
  const n = $('#f-n').value.trim(), bc = $('#f-bc').value.trim(), b = parseFloat($('#f-b').value), s = parseFloat($('#f-s').value), st = parseInt($('#f-st').value, 10);
  if (!n) return toast('Məhsul adını yazın', 'err');
  if (isNaN(b) || b < 0) return toast('Alış qiymətini düzgün yazın', 'err');
  if (isNaN(s) || s < 0) return toast('Satış qiymətini düzgün yazın', 'err');
  if (isNaN(st) || st < 0) return toast('Stok sayını düzgün yazın', 'err');
  if (bc && products.some(p => p.barcode === bc && p.id !== id)) return toast('Bu barkod artıq başqa məhsulda var', 'err');
  const o = { name: n, barcode: bc, buy: r2(b), sell: r2(s), stock: st, img: formImg, quick: $('#f-q').checked };
  if (id) Object.assign(products.find(p => p.id === id), o); else products.push({ id: uid(), ...o });
  if (!save()) return;
  closeModal(); rProd(); toast('Yadda saxlanıldı', 'ok');
}
function delProduct(id) {
  const p = products.find(x => x.id === id);
  if (!confirm(`"${p.name}" silinsin? Köhnə satış qeydləri qalacaq.`)) return;
  products = products.filter(x => x.id !== id); cart = cart.filter(x => x.id !== id);
  save(); closeModal(); rProd(); toast('Məhsul silindi', 'ok');
}

/* ---------- Hesabat ---------- */
function range(p) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (p === 'all') return 0;
  if (p === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // bazar ertəsindən
  if (p === 'month') d.setDate(1);
  return d.getTime();
}
function setP(k) { period = k; rRep(); }
function rRep() {
  const l = sales.filter(s => s.ts >= range(period)).sort((a, b) => b.ts - a.ts);
  const sum = (a, f) => r2(a.reduce((x, y) => x + f(y), 0));
  const rev = sum(l, s => s.total), pr = sum(l, s => sum(s.items, i => (i.sell - i.buy) * i.qty - (i.d || 0))), n = sum(l, s => sum(s.items, i => i.qty));
  $('#v-rep').innerHTML = `<div class="seg">${[['day', 'Gün'], ['week', 'Həftə'], ['month', 'Ay'], ['all', 'Hamısı']].map(([k, t]) => `<button class="${period === k ? 'on' : ''}" onclick="setP('${k}')">${t}</button>`).join('')}</div>
  <div class="grid"><div class="stat hi"><small>Dövriyyə</small><b>${money(rev)}</b></div>
  <div class="stat"><small>Təxmini qazanc</small><b>${money(pr)}</b></div><div class="stat"><small>Satış sayı</small><b>${l.filter(s => !s.ret).length}</b></div>
  <div class="stat"><small>Satılan ədəd</small><b>${n}</b></div><div class="stat"><small>Ümumi dövriyyə</small><b>${money(sum(sales, s => s.total))}</b></div></div>
  <button class="btn" style="margin-top:12px" onclick="dayEnd()">🌙 Günsonu (kassanı bağla)</button>
  <button class="btn gh" style="margin-top:8px" onclick="exportSales()">📥 Satışları CSV-yə yüklə</button>
  ${bySeller(l)}<h3>Satış tarixçəsi</h3>
  ${l.slice(0, 100).map(s => `<div class="card item" onclick="showSale('${s.id}')"><div class="grow"><b>${dt(s.ts)}</b><small>${s.items.reduce((a, i) => a + i.qty, 0)} ədəd • ${esc(s.seller || '')}${s.method === 'credit' ? ' • nisyə' : ''}${s.ret ? ' • qaytarma' : ''}${s.method === 'delivery' ? ' • çatdırılma' : ''}</small></div><b>${money(s.total)}</b></div>`).join('') || '<div class="empty">Bu dövrdə satış yoxdur</div>'}
  ${l.length > 100 ? '<small>Son 100 satış göstərilir. Hamısı CSV-dədir.</small>' : ''}`;
}
function showSale(id) { receipt(sales.find(s => s.id === id), false); }

/* ---------- İxrac / ehtiyat nüsxə ---------- */
const csv = rows => '\ufeff' + rows.map(r => r.map(c => {
  if (typeof c === 'number') return String(c).replace('.', ',');
  c = String(c ?? ''); if (/^[=+\-@]/.test(c)) c = "'" + c;
  return /[;"\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
}).join(';')).join('\r\n');
function dl(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const today = () => new Date().toISOString().slice(0, 10);
function exportSales() {
  const rows = [['Tarix', 'Satış №', 'Məhsul', 'Barkod', 'Say', 'Alış qiyməti', 'Satış qiyməti', 'Cəm', 'Təxmini qazanc', 'Satıcı', 'Ödəniş']];
  sales.filter(s => s.ts >= range(period)).sort((a, b) => a.ts - b.ts).forEach(s => {
    const no = sales.indexOf(s) + 1;
    s.items.forEach(i => rows.push([dt(s.ts), no, i.name, i.barcode, i.qty, i.buy, i.sell, r2(i.sell * i.qty - (i.d || 0)), r2((i.sell - i.buy) * i.qty - (i.d || 0)), s.seller || '', s.ret ? 'Qaytarma' : s.method === 'delivery' ? 'Çatdırılma' : s.method === 'credit' ? 'Nisyə' : 'Nağd']));
  });
  if (rows.length < 2) return toast('Bu dövrdə satış yoxdur', 'err');
  dl(`satislar-${period}-${today()}.csv`, csv(rows), 'text/csv;charset=utf-8'); toast('CSV yükləndi', 'ok');
}
function exportProducts() {
  dl(`mehsullar-${today()}.csv`, csv([['Ad', 'Barkod', 'Alış qiyməti', 'Satış qiyməti', 'Stok'], ...products.map(p => [p.name, p.barcode, p.buy, p.sell, p.stock])]), 'text/csv;charset=utf-8');
  toast('CSV yükləndi', 'ok');
}
function backup() {
  dl(`kassa-nusxe-${today()}.json`, JSON.stringify({ app: 'magaza-kassasi', v: 2, date: new Date().toISOString(), cfg: { ...cfg, pin: undefined }, products, sales, customers, ledger }), 'application/json');
  localStorage.setItem(K.b, Date.now()); toast('Ehtiyat nüsxə yükləndi', 'ok'); rSet();
}
function restore(e) {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (d.app !== 'magaza-kassasi' || !Array.isArray(d.products) || !Array.isArray(d.sales) ||
        !d.products.every(p => p && p.id && typeof p.name === 'string') || !d.sales.every(s => s && Array.isArray(s.items))) throw 0;
      if (!confirm(`Bərpa: ${d.products.length} məhsul, ${d.sales.length} satış. Mövcud məlumatlar əvəz olunacaq. Davam edilsin?`)) return;
      products = d.products; sales = d.sales; customers = d.customers || []; ledger = d.ledger || []; cfg = { ...(d.cfg || cfg), pin: cfg.pin }; fixCfg(); cart = [];
      save(); applyCfg(); go('set'); toast('Məlumatlar bərpa olundu', 'ok');
    } catch (x) { toast('Fayl düzgün deyil', 'err'); }
  };
  r.readAsText(f);
}
function wipe() {
  if (!confirm('Bütün məhsullar və satışlar silinəcək. Əvvəlcə ehtiyat nüsxə çıxarmısınız?')) return;
  if (!confirm('Əminsiniz? Bu əməliyyat geri qaytarılmır.')) return;
  products = []; sales = []; customers = []; ledger = []; cart = []; save(); go('set'); toast('Məlumatlar silindi', 'ok');
}

/* ---------- Parametrlər ---------- */
function saveShop() { cfg.phone = $('#shop-p').value.trim(); cfg.shop = $('#shop').value.trim() || 'Mağaza Kassası'; save(); applyCfg(); toast('Yadda saxlanıldı', 'ok'); }
function install() { if (dp) { dp.prompt(); dp = null; rSet(); } }
function rSet() {
  const bk = +localStorage.getItem(K.b);
  $('#v-set').innerHTML = `<div class="card"><h2>Mağaza</h2><label>Mağaza adı<input id="shop" value="${esc(cfg.shop)}"></label><label>Telefon (çekdə və kataloqda)<input id="shop-p" type="tel" value="${esc(cfg.phone || '')}"></label><button class="btn" onclick="saveShop()">Yadda saxla</button></div>
  <div class="card"><h2>Məlumatlar</h2><small>${products.length} məhsul, ${sales.length} satış<br>Son ehtiyat nüsxə: ${bk ? dt(bk) : '<b style="color:var(--er)">hələ çıxarılmayıb</b>'}<br>Daimi yaddaş: ${persisted ? 'aktiv' : 'brauzerin ixtiyarındadır'}</small><br><br>
  <button class="btn" onclick="backup()">💾 Ehtiyat nüsxə çıxar (JSON)</button><br>
  <label class="btn gh" style="text-align:center;margin:0 0 12px;font-size:15px;color:var(--p)">📂 Nüsxədən bərpa et<input type="file" accept=".json,application/json" hidden onchange="restore(event)"></label>
  <button class="btn gh" onclick="exportProducts()">📥 Məhsulları CSV-yə yüklə</button><br>
  <button class="btn er" onclick="wipe()">🗑 Bütün məlumatları sil</button></div>
  ${secCards()}
  ${dp ? '<div class="card"><button class="btn" onclick="install()">📲 Ana ekrana quraşdır</button></div>' : ''}
  <div class="card"><h2>Modullar</h2>
  <div class="item"><div class="grow"><b>🧾 Rəsmi fiskal çek</b><small>Hələ qoşulmayıb. Qəbzlər qeyri-fiskaldır.</small></div><span class="badge wa">Qoşulmayıb</span></div><hr style="border:0;border-top:1px solid var(--ln)">
  <div class="item"><div class="grow"><b>💳 Bank kartı</b><small>Hələ qoşulmayıb. Yalnız nağd ödəniş.</small></div><span class="badge wa">Qoşulmayıb</span></div></div>
  <p class="muted" style="text-align:center">Mağaza Kassası v1.6 • AZN</p>`;
}

/* ---------- Satıcılar, PIN, nisyə ---------- */
function fixCfg() {
  if (!Array.isArray(cfg.sellers) || !cfg.sellers.length) cfg.sellers = ['Sahib'];
  if (!cfg.sellers.includes(cfg.seller)) cfg.seller = cfg.sellers[0];
}
function sellerModal() {
  modal(`<h2>Satıcı seçin</h2>${cfg.sellers.map((n, i) => `<button class="btn ${n === cfg.seller ? '' : 'gh'}" style="margin-bottom:8px" onclick="setSeller(${i})">${esc(n)}</button>`).join('')}<button class="btn gh" onclick="closeModal()">Bağla</button>`);
}
function setSeller(i) { cfg.seller = cfg.sellers[i]; save(); closeModal(); rCart(); }
function addSeller() {
  const n = $('#sn').value.trim(); if (!n) return;
  if (cfg.sellers.includes(n)) return toast('Bu ad artıq var', 'err');
  cfg.sellers.push(n); save(); rSet();
}
function delSeller(i) {
  if (cfg.sellers.length < 2) return toast('Ən azı bir satıcı qalmalıdır', 'err');
  if (!confirm('Satıcı silinsin? Köhnə satışlarda adı qalacaq.')) return;
  const n = cfg.sellers.splice(i, 1)[0]; if (cfg.seller === n) cfg.seller = cfg.sellers[0];
  save(); rSet(); rCart();
}
function bySeller(l) {
  if (!l.length) return '';
  const by = {}; l.forEach(s => { const k = s.seller || '—'; (by[k] = by[k] || { n: 0, t: 0 }); if (!s.ret) by[k].n++; by[k].t += s.total; });
  return '<h3>Satıcılar üzrə</h3>' + Object.entries(by).map(([k, v]) => `<div class="card item"><div class="grow"><b>${esc(k)}</b><small>${v.n} satış</small></div><b>${money(v.t)}</b></div>`).join('');
}
async function hash(p) {
  if (!(window.crypto && crypto.subtle)) return 'x' + [...p].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mk:' + p));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function pinPrompt(v) {
  modal(`<h2>🔒 PIN kod</h2><label>PIN daxil edin<input id="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" onkeydown="if(event.key==='Enter')pinCheck('${v}')"></label>
  <div class="row2"><button class="btn gh" onclick="closeModal()">Ləğv et</button><button class="btn" onclick="pinCheck('${v}')">Daxil ol</button></div>`);
  $('#pin').focus();
}
async function pinCheck(v) {
  if (await hash($('#pin').value) === cfg.pin) { unlocked = true; closeModal(); go(v); }
  else { toast('PIN səhvdir', 'err'); $('#pin').value = ''; }
}
function pinSet() {
  modal(`<h2>PIN təyin et</h2><label>Yeni PIN (4–6 rəqəm)<input id="p1" type="password" inputmode="numeric" maxlength="6"></label><label>Təkrar yazın<input id="p2" type="password" inputmode="numeric" maxlength="6"></label>
  <div class="row2"><button class="btn gh" onclick="closeModal()">Ləğv et</button><button class="btn" onclick="pinSave()">Yadda saxla</button></div>`);
}
async function pinSave() {
  const a = $('#p1').value;
  if (!/^\d{4,6}$/.test(a)) return toast('PIN 4–6 rəqəm olmalıdır', 'err');
  if (a !== $('#p2').value) return toast('PIN-lər eyni deyil', 'err');
  cfg.pin = await hash(a); unlocked = true; save(); closeModal(); rSet(); toast('PIN təyin edildi', 'ok');
}
function pinOff() { if (confirm('PIN silinsin?')) { delete cfg.pin; save(); rSet(); } }
const secCards = () => `${licCard()}${promoCard()}${loyCard()}<div class="card"><h2>📷 Skaner</h2><button class="btn gh" onclick="togConf()">Skanerdə təsdiq düyməsi: ${cfg.confirmScan !== false ? 'AÇIQ' : 'BAĞLI'}</button></div>
<div class="card"><h2>🔒 PIN kod</h2><small>${cfg.pin ? 'Hesabat və Parametrlər PIN ilə qorunur.' : 'PIN təyin etsəniz, Hesabat və Parametrlərə yalnız PIN ilə girmək olar.'} Bu, təsadüfi girişin qarşısını alır, telefonun özünü qorumur. PIN ehtiyat nüsxəyə yazılmır.</small><br><br>
<button class="btn" onclick="pinSet()">${cfg.pin ? 'PIN-i dəyiş' : 'PIN təyin et'}</button>${cfg.pin ? '<br><button class="btn gh" onclick="pinOff()">PIN-i sil</button>' : ''}</div>
<div class="card"><h2>👤 Satıcılar</h2>${cfg.sellers.map((n, i) => `<div class="item" style="margin-bottom:8px"><div class="grow"><b>${esc(n)}</b></div><button class="btn gh" style="width:auto;padding:6px 14px" onclick="delSeller(${i})" aria-label="Sil">✕</button></div>`).join('')}
<div class="bar"><input id="sn" placeholder="Yeni satıcı adı" maxlength="30"><button class="ic" onclick="addSeller()" aria-label="Əlavə et">+</button></div></div>`;
const bal = id => r2(ledger.filter(e => e.cid === id).reduce((a, e) => a + (e.type === 'debt' ? e.amt : -e.amt), 0));
function custList() {
  const tot = r2(customers.reduce((a, c) => a + bal(c.id), 0));
  modal(`<h2>📒 Nisyə dəftəri</h2><div class="change">Ümumi borc: ${money(tot)}</div>
  ${customers.slice().sort((a, b) => bal(b.id) - bal(a.id)).map(c => `<div class="card item" onclick="custView('${c.id}')"><div class="grow"><b>${esc(c.name)}</b><small>${esc(c.phone || '')}</small></div><b style="color:var(${bal(c.id) > 0 ? '--er' : '--ok'})">${money(bal(c.id))}</b></div>`).join('') || '<div class="empty">Müştəri yoxdur</div>'}
  <br><div class="row2"><button class="btn gh" onclick="closeModal()">Bağla</button><button class="btn" onclick="newCust()">+ Yeni müştəri</button></div>`);
}
function newCust(ctx) {
  modal(`<h2>Yeni müştəri</h2><label>Ad<input id="c-n" maxlength="40"></label><label>Telefon (ixtiyari)<input id="c-p" type="tel" inputmode="tel" maxlength="20" value="${esc(newPhone)}"></label>
  <div class="row2"><button class="btn gh" onclick="${ctx === 'loy' ? 'payModal(payMode)' : ctx ? "payModal('credit')" : 'custList()'}">Geri</button><button class="btn" onclick="saveCust('${ctx || ''}')">Yadda saxla</button></div>`);
}
function saveCust(ctx) {
  const n = $('#c-n').value.trim(); if (!n) return toast('Adı yazın', 'err');
  const c = { id: uid(), name: n, phone: $('#c-p').value.trim() }; customers.push(c);
  if (!save()) { customers.pop(); return; }
  toast('Müştəri əlavə olundu', 'ok'); newPhone = ''; if (ctx === 'loy') { loy.cid = c.id; loy.nf = false; payModal(payMode); } else if (ctx) { selCust = c.id; payModal('credit'); } else custList();
}
function custView(id) {
  const c = customers.find(x => x.id === id), b = bal(id), es = ledger.filter(e => e.cid === id).sort((x, y) => y.ts - x.ts);
  modal(`<h2>${esc(c.name)}</h2><small>${esc(c.phone || '')} • ⭐ ${c.pts || 0} xal</small><div class="big" style="color:var(${b > 0 ? '--er' : '--ok'})">${money(b)}</div>
  ${b > 0 ? `<label>Ödəniş məbləği (₼)<input id="cp" type="number" inputmode="decimal" step="0.01" min="0" value="${b}"></label><button class="btn" onclick="custPay('${id}')">💵 Ödəniş qəbul et</button><br>` : ''}
  <div class="rc">${es.slice(0, 30).map(e => `<div><span>${dt(e.ts)} ${e.type === 'debt' ? 'borc' : 'ödəniş'}</span><span>${e.type === 'debt' ? '+' : '−'}${money(e.amt)}</span></div>`).join('')}</div>
  <div class="row2"><button class="btn gh" onclick="custList()">Geri</button>${b === 0 ? `<button class="btn er" onclick="custDel('${id}')">Sil</button>` : '<span></span>'}</div>`);
}
function custPay(id) {
  const a = r2(parseFloat($('#cp').value));
  if (!(a > 0) || a > bal(id)) return toast('Məbləğ düzgün deyil', 'err');
  ledger.push({ id: uid(), cid: id, ts: Date.now(), amt: a, type: 'pay' });
  if (!save()) { ledger.pop(); return; }
  toast('Ödəniş qeydə alındı', 'ok'); custView(id);
}
function custDel(id) {
  if (!confirm('Müştəri silinsin?')) return;
  customers = customers.filter(c => c.id !== id); ledger = ledger.filter(e => e.cid !== id); save(); custList();
}

/* ---------- Qaytarma, qəbz paylaşma, günsonu ---------- */
let retQ = {}, dayD = {};
const payLines = s => s.ret ? [['Qaytarılan nağd', s.cash], ...(s.debtCut ? [['Borcdan silindi', s.debtCut]] : [])]
  : s.method === 'delivery' ? [[s.dlv.pay === 'cod' ? 'Kuryer alacaq' : 'Ödənilib (online)', s.total]]
  : s.method === 'credit' ? [['İndi ödənilən', s.paid], ['Borc: ' + (s.cname || ''), s.debt]] : [['Nağd', s.paid], ['Qaytarılan', s.change]];
const rText = s => [`🧾 ${cfg.shop}${s.ret ? ' (QAYTARMA)' : ''}`, dt(s.ts) + (s.seller ? ' • ' + s.seller : ''), '──────────',
  ...s.items.map(i => `${i.name} ×${Math.abs(i.qty)} — ${money(i.sell * i.qty)}`), '──────────', ...(dsum(s) ? ['Endirim: ' + money(-dsum(s))] : []), `CƏMİ: ${money(s.total)}`, ...(s.pe ? ['⭐ Qazanılan xal: +' + s.pe] : []),
  ...payLines(s).map(([k, v]) => `${k}: ${money(v)}`), ...dvText(s), '', 'Qeyri-fiskal qəbz', 'Lavanda™'].join('\n');
async function shareR(id, wa) {
  const t = rText(sales.find(x => x.id === id));
  if (!wa && navigator.share) { try { await navigator.share({ text: t }); } catch (e) { } return; }
  open('https://wa.me/?text=' + encodeURIComponent(t), '_blank');
}
function retModal(id) {
  const s = sales.find(x => x.id === id), done = {};
  sales.filter(x => x.ref === id).forEach(r => r.items.forEach(i => { done[i.id] = (done[i.id] || 0) - i.qty; }));
  const rows = s.items.map(i => ({ i, max: i.qty - (done[i.id] || 0) })).filter(r => r.max > 0);
  if (!rows.length) return toast('Bütün məhsullar artıq qaytarılıb', 'err');
  retQ = {};
  modal(`<h2>↩ Məhsul qaytarma</h2>${rows.map(({ i, max }) => `<div class="card item"><div class="grow"><b>${esc(i.name)}</b><small>${money((i.sell * i.qty - (i.d || 0)) / i.qty)} • maks. ${max}</small></div><div class="qty"><button onclick="retChg('${id}','${i.id}',-1,${max})">−</button><span id="rq-${i.id}">0</span><button onclick="retChg('${id}','${i.id}',1,${max})">+</button></div></div>`).join('')}
  <div class="change" id="rtot" style="margin-top:12px">Qaytarılacaq: ${money(0)}</div>
  <div class="row2"><button class="btn gh" onclick="showSale('${id}')">Geri</button><button class="btn" onclick="retDo('${id}')">Təsdiqlə</button></div>`);
}
function retChg(id, pid, d, max) {
  retQ[pid] = Math.min(max, Math.max(0, (retQ[pid] || 0) + d)); $('#rq-' + pid).textContent = retQ[pid];
  const s = sales.find(x => x.id === id); $('#rtot').textContent = 'Qaytarılacaq: ' + money(s.items.reduce((a, i) => a + (i.sell * i.qty - (i.d || 0)) / i.qty * (retQ[i.id] || 0), 0));
}
function retDo(id) {
  const s = sales.find(x => x.id === id), its = s.items.filter(i => retQ[i.id] > 0);
  if (!its.length) return toast('Qaytarılacaq məhsulu seçin', 'err');
  const left = {}; s.items.forEach(i => { left[i.id] = i.qty; }); sales.filter(x => x.ref === id).forEach(r => r.items.forEach(i => { left[i.id] += i.qty; }));
  if (its.some(i => retQ[i.id] > left[i.id])) return toast('Qaytarma miqdarı satılandan çoxdur', 'err');
  const amt = r2(its.reduce((a, i) => a + (i.sell * i.qty - (i.d || 0)) / i.qty * retQ[i.id], 0)), cut = s.method === 'credit' ? Math.min(amt, Math.max(0, bal(s.cid))) : 0;
  const r = { id: uid(), ts: Date.now(), total: -amt, paid: 0, change: 0, method: 'return', ret: true, ref: id, seller: cfg.seller, cash: s.method === 'delivery' ? 0 : r2(amt - cut), debtCut: cut, cname: s.cname,
    items: its.map(i => ({ id: i.id, name: i.name, barcode: i.barcode, qty: -retQ[i.id], buy: i.buy, sell: i.sell, d: -r2((i.d || 0) / i.qty * retQ[i.id]) })) };
  const bak = JSON.stringify(products);
  its.forEach(i => { const p = products.find(x => x.id === i.id); if (p) p.stock += retQ[i.id]; });
  sales.push(r); if (cut) ledger.push({ id: uid(), cid: s.cid, ts: r.ts, amt: cut, type: 'pay', sid: r.id });
  const cu = s.lc && customers.find(x => x.id === s.lc), pts0 = cu ? cu.pts || 0 : 0;
  if (cu) { const f = s.total ? amt / s.total : 0; cu.pts = Math.max(0, pts0 + Math.round((s.pu || 0) * f) - Math.round((s.pe || 0) * f)); }
  if (!save()) { products = JSON.parse(bak); sales.pop(); if (cut) ledger.pop(); if (cu) cu.pts = pts0; return; }
  rRep(); receipt(r, true);
}
function dayEnd() {
  const f = range('day'), l = sales.filter(s => s.ts >= f), sl = l.filter(s => !s.ret), rt = l.filter(s => s.ret);
  const sum = (a, fn) => r2(a.reduce((x, y) => x + fn(y), 0)), last = (cfg.closings || []).slice(-1)[0];
  dayD = { ts: Date.now(), n: sl.length, rev: sum(l, s => s.total), prof: sum(l, s => sum(s.items, i => (i.sell - i.buy) * i.qty - (i.d || 0))),
    cashIn: sum(sl, s => s.paid - s.change), credit: sum(sl, s => s.debt || 0), debtPaid: sum(ledger.filter(e => e.ts >= f && e.type === 'pay' && !e.sid), e => e.amt),
    refunds: sum(rt, s => s.cash), courier: sum(sales.filter(s => !s.ret && s.dlv && s.dlv.col >= f), s => s.total), open: last ? last.counted : 0 };
  const R = (k, v) => `<div><span>${k}</span><span>${v}</span></div>`, d = dayD;
  modal(`<h2>🌙 Günsonu</h2><div class="rc">${R('Satış sayı', d.n)}${R('Dövriyyə (xalis)', money(d.rev))}${R('Təxmini qazanc', money(d.prof))}<hr>${R('Nağd satışlar', money(d.cashIn))}${R('Borc ödənişləri', money(d.debtPaid))}${R('Kuryerdən nağd', money(d.courier))}${R('Qaytarılan nağd', '−' + money(d.refunds))}${R('Nisyə verildi', money(d.credit))}</div>
  <label>Açılış kassası (₼)<input id="de-o" type="number" inputmode="decimal" step="0.01" value="${d.open}" oninput="deCalc()"></label>
  <label>Kassada faktiki nağd (₼)<input id="de-c" type="number" inputmode="decimal" step="0.01" oninput="deCalc()"></label>
  <div class="change" id="de-x"></div>
  ${(cfg.closings || []).slice(-3).reverse().map(c => `<small>${dt(c.ts)} — dövriyyə ${money(c.rev)}, fərq ${money(c.diff)}</small><br>`).join('')}
  <div class="row2" style="margin-top:10px"><button class="btn gh" onclick="deShare()">📤 Paylaş</button><button class="btn" onclick="deSave()">Qeyd et</button></div><br><button class="btn gh" onclick="closeModal()">Bağla</button>`);
  deCalc();
}
function deCalc() {
  const d = dayD, o = r2(parseFloat($('#de-o').value)), c = parseFloat($('#de-c').value);
  d.open = o; d.exp = r2(o + d.cashIn + d.debtPaid + d.courier - d.refunds); d.counted = isNaN(c) ? null : r2(c); d.diff = d.counted == null ? null : r2(d.counted - d.exp);
  $('#de-x').textContent = 'Gözlənilən nağd: ' + money(d.exp) + (d.diff == null ? '' : ' • Fərq: ' + (d.diff > 0 ? '+' : '') + money(d.diff));
}
const deText = d => ['🌙 Günsonu — ' + cfg.shop, dt(d.ts), `Satış: ${d.n} • Dövriyyə: ${money(d.rev)}`, `Təxmini qazanc: ${money(d.prof)}`,
  `Nağd satış: ${money(d.cashIn)} • Borc ödənişi: ${money(d.debtPaid)} • Kuryerdən: ${money(d.courier || 0)}`, `Qaytarma: ${money(d.refunds)} • Nisyə: ${money(d.credit)}`,
  `Açılış: ${money(d.open)} • Gözlənilən: ${money(d.exp)}`, d.counted == null ? '' : `Sayılan: ${money(d.counted)} • Fərq: ${money(d.diff)}`, '', 'Lavanda™'].join('\n');
function deShare() { deCalc(); const t = deText(dayD); if (navigator.share) navigator.share({ text: t }).catch(() => { }); else open('https://wa.me/?text=' + encodeURIComponent(t), '_blank'); }
function deSave() {
  deCalc(); if (dayD.counted == null) return toast('Kassadakı faktiki nağdı yazın', 'err');
  cfg.closings = [...(cfg.closings || []), { ...dayD }].slice(-60);
  if (!save()) return; closeModal(); toast('Günsonu qeyd olundu', 'ok');
}

/* ---------- Şəkil, sürətli satış, barkod/etiket, skaner təsdiqi, yenilik ---------- */
const thumb = p => p.img ? `<img src="${esc(p.img)}" alt="">` : esc((p.name || '?').trim().charAt(0).toUpperCase() || '?');
function pickImg(e) {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const im = new Image(), u = URL.createObjectURL(f);
  im.onload = () => {
    const c = document.createElement('canvas'), S = 220, m = Math.min(im.width, im.height); c.width = c.height = S;
    c.getContext('2d').drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, S, S);
    formImg = c.toDataURL('image/jpeg', 0.72); URL.revokeObjectURL(u); $('#f-th').innerHTML = `<img src="${formImg}" alt="">`;
  };
  im.onerror = () => toast('Şəkil açılmadı', 'err'); im.src = u;
}
function rQs() {
  const m = {}; sales.forEach(s => s.items.forEach(i => { m[i.id] = (m[i.id] || 0) + i.qty; }));
  const top = Object.entries(m).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]).map(e => e[0]);
  const pin = products.filter(p => p.quick || !p.barcode).sort((a, b) => a.name.localeCompare(b.name, 'az')).map(p => p.id);
  const l = [...new Set([...pin, ...top])].slice(0, 12).map(id => products.find(p => p.id === id)).filter(Boolean);
  $('#qs').innerHTML = l.length ? `<div class="qh" onclick="togQs()"><span>⚡ Sürətli satış</span><span>${cfg.qsHide ? '▸' : '▾'}</span></div>` +
    (cfg.qsHide ? '' : `<div class="qg">${l.map(p => `<button class="qt${p.stock <= 0 ? ' off' : ''}" onclick="quick('${p.id}')"><div class="th">${thumb(p)}</div><b>${esc(p.name)}</b><small>${money(p.sell)}</small></button>`).join('')}</div>`) : '';
}
function togQs() { cfg.qsHide = !cfg.qsHide; save(); rQs(); }
function quick(id) { const p = products.find(x => x.id === id); if (p && addToCart(p) && navigator.vibrate) navigator.vibrate(20); }
const ean = b => { let s = 0; for (let i = 0; i < 12; i++) s += (+b[i]) * (i % 2 ? 3 : 1); return (10 - s % 10) % 10; };
function genBc() {
  let c; do { cfg.bcSeq = (cfg.bcSeq || 0) + 1; const b = '200' + String(cfg.bcSeq).padStart(9, '0'); c = b + ean(b); } while (products.some(p => p.barcode === c));
  $('#f-bc').value = c; save(); toast('Yeni barkod yaradıldı', 'ok');
}
function lblCode(b) { b = (b || '').trim(); if (/^\d{12}$/.test(b)) b = '0' + b; return /^\d{13}$/.test(b) && ean(b) === +b[12] ? b : null; }
function ean13svg(c) {
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'],
    G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'],
    R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'],
    P = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  let b = '101'; for (let i = 1; i < 7; i++) b += (P[c[0]][i - 1] === 'L' ? L : G)[c[i]];
  b += '01010'; for (let i = 7; i < 13; i++) b += R[c[i]]; b += '101';
  let d = '', i = 0;
  while (i < b.length) { if (b[i] === '1') { let j = i; while (b[j] === '1') j++; d += `M${9 + i} 0h${j - i}v44h-${j - i}z`; i = j; } else i++; }
  const t = (x, s) => `<text x="${x}" y="54" text-anchor="middle" font-size="9" font-family="monospace">${s}</text>`;
  let tx = t(4, c[0]); for (let k = 1; k < 7; k++) tx += t(15.5 + 7 * (k - 1), c[k]); for (let k = 7; k < 13; k++) tx += t(62.5 + 7 * (k - 7), c[k]);
  return `<svg viewBox="0 0 113 58" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><path d="${d}"/>${tx}</svg>`;
}
const labelHtml = (p, c) => `<div class="lb"><b>${esc(p.name)}</b>${ean13svg(c)}<span>${money(p.sell)}</span></div>`;
function labelModal(id) {
  const p = products.find(x => x.id === id), c = lblCode(p.barcode);
  if (!c) return toast('Etiket üçün düzgün EAN-13 barkod lazımdır. Məhsulda 🔢 düyməsi ilə yeni barkod yaradın.', 'err');
  modal(`<h2>🏷 Etiket</h2><div style="display:flex;justify-content:center;margin-bottom:12px">${labelHtml(p, c)}</div>
  <label>Nüsxə sayı<input id="l-n" type="number" inputmode="numeric" min="1" max="100" value="1"></label>
  <div class="row2"><button class="btn gh" onclick="editProduct('${id}')">Geri</button><button class="btn" onclick="printLabels('${id}')">🖨 Çap et</button></div>
  <small>Çap pəncərəsində printeri və ya "PDF kimi saxla" seçin.</small>`);
}
function printLabels(id) {
  const p = products.find(x => x.id === id), c = lblCode(p.barcode), n = Math.max(1, Math.min(100, parseInt($('#l-n').value, 10) || 1));
  $('#prn').innerHTML = Array(n).fill(labelHtml(p, c)).join(''); document.body.classList.add('prn'); setTimeout(() => print(), 80);
}
addEventListener('afterprint', () => { document.body.classList.remove('prn'); $('#prn').innerHTML = ''; });
function scanAsk(c, p) {
  hold = true; pend = p || null; pendCode = c; beep(!p); $('#smsg').style.display = 'none';
  $('#spanel').innerHTML = p
    ? `<div class="item"><div class="th">${thumb(p)}</div><div class="grow"><b>${esc(p.name)}</b><small>${money(p.sell)} • stok ${p.stock}</small></div></div><div class="row2" style="margin-top:12px"><button class="btn gh" onclick="scanSkip()">Ləğv et</button><button class="btn" onclick="scanOk()">✔ Əlavə et</button></div>`
    : `<b>⚠ Barkod bazada tapılmadı</b><br><small>${esc(c)}</small><div class="row2" style="margin-top:12px"><button class="btn gh" onclick="scanSkip()">Davam et</button><button class="btn" onclick="scanNew()">➕ Yeni məhsul</button></div>`;
  $('#spanel').classList.add('on');
}
function scanDone() { hold = false; lastT = Date.now(); $('#spanel').classList.remove('on'); $('#smsg').style.display = ''; }
function scanOk() { if (pend && addToCart(pend)) { beep(); $('#smsg').textContent = '✔ ' + pend.name + ' əlavə olundu'; } else beep(true); scanDone(); }
function scanSkip() { scanDone(); }
function scanNew() { const c = pendCode; closeScan(); go('prod'); editProduct(null, c); }
function togConf() { cfg.confirmScan = cfg.confirmScan === false; save(); rSet(); }
function showUpd() {
  if ($('#upd')) return;
  const d = document.createElement('div'); d.id = 'upd';
  d.innerHTML = '<span>🔄 Yeni versiya hazırdır</span><button onclick="doUpd()">Yenilə</button>'; document.body.appendChild(d);
}
function doUpd() { if (cart.length && !confirm('Səbətdəki məhsullar silinəcək. Yenilənsin?')) return; location.reload(); }

/* ---------- Lisenziya (abunəlik) ---------- */
const SELLER = { contact: 'Əlaqə: Lavanda™ — nömrənizi buraya yazın' };
const TRIAL = 14, GRACE = 3, DAY = 864e5;
const PUB = {"kty": "EC", "crv": "P-256", "x": "yDDZQWLdIZdqHT-Nt6WVxA9K3kvKMUltihUVQLOSypw", "y": "wJ9i1P3iSZSHr_Q4KX_13vWg-WmnahpNrrQhhqVEzMM"};
let LS = null, lockShown = false;
const b64d = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function licParse(key) {
  try {
    const [v, p, s] = String(key).replace(/\s+/g, '').split('.'); if (v !== 'LK1' || !p || !s) return null;
    const k = await crypto.subtle.importKey('jwk', PUB, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, b64d(s), new TextEncoder().encode(p))) return null;
    return JSON.parse(new TextDecoder().decode(b64d(p)));
  } catch (e) { return null; }
}
function nowT() { const n = Date.now(), m = +localStorage.getItem('mk_maxt') || 0, t = Math.max(n, m); if (t > m) localStorage.setItem('mk_maxt', t); return t; }
async function licStatus() {
  const t = nowT(), raw = localStorage.getItem('mk_lic'), lic = raw ? await licParse(raw) : null;
  let tr = +localStorage.getItem('mk_trial'); if (!tr) { tr = t; localStorage.setItem('mk_trial', tr); }
  if (lic) {
    if (t <= lic.e) return { ok: true, type: 'lic', lic, left: Math.ceil((lic.e - t) / DAY) };
    if (t <= lic.e + GRACE * DAY) return { ok: true, type: 'grace', lic, left: Math.ceil((lic.e + GRACE * DAY - t) / DAY) };
    return { ok: false, lic };
  }
  const end = tr + TRIAL * DAY; return t <= end ? { ok: true, type: 'trial', left: Math.ceil((end - t) / DAY) } : { ok: false, lic: null };
}
function lockHtml() {
  const l = LS.lic, skew = Date.now() < (+localStorage.getItem('mk_maxt') || 0) - DAY;
  return `<div class="lk"><div class="brand">Lavanda<sup>™</sup></div><h2>${l ? 'Abunəlik müddəti bitib' : 'Sınaq müddəti bitib'}</h2>
  <p class="muted">${l ? esc(l.n) + ' • bitmə tarixi: ' + dt(l.e).slice(0, 10) : 'Davam etmək üçün lisenziya açarı lazımdır.'}${skew ? '<br>⚠ Telefonun tarixi yanlış ola bilər, düzəldin.' : ''}</p>
  <label style="text-align:left">Lisenziya açarı<textarea id="lk" rows="4" placeholder="LK1...."></textarea></label>
  <button class="btn" onclick="licAct()">Aktivləşdir</button><br><button class="btn gh" onclick="backup()">💾 Məlumatlarımı yüklə (ehtiyat nüsxə)</button>
  <p class="muted">Məlumatlarınız telefonda qalır və silinmir.<br>${esc(SELLER.contact)}</p></div>`;
}
async function licInit() {
  LS = await licStatus();
  $('#lock').classList.toggle('on', !LS.ok);
  if (!LS.ok && !lockShown) { $('#lock').innerHTML = lockHtml(); lockShown = true; } else if (LS.ok) lockShown = false;
  $('#lbar').textContent = LS.type === 'trial' ? `⏳ Sınaq müddəti: ${LS.left} gün qalıb` : LS.type === 'grace' ? `⚠ Abunəlik bitib, ${LS.left} gün sonra bağlanacaq` : (LS.type === 'lic' && LS.left <= 7) ? `⏰ Abunəlik ${LS.left} gün sonra bitir` : '';
  if (view === 'set') rSet();
}
async function licAct() {
  const k = $('#lk').value.replace(/\s+/g, ''), l = await licParse(k);
  if (!l) return toast('Açar düzgün deyil', 'err');
  if (Date.now() > l.e) return toast('Bu açarın müddəti bitib', 'err');
  localStorage.setItem('mk_lic', k); localStorage.setItem('mk_maxt', Date.now());
  closeModal(); lockShown = false; await licInit(); toast('Lisenziya aktivləşdi', 'ok');
}
function licModal() {
  modal(`<h2>🔑 Lisenziya açarı</h2><label>Açarı yapışdırın<textarea id="lk" rows="5" placeholder="LK1...."></textarea></label>
  <div class="row2"><button class="btn gh" onclick="closeModal()">Ləğv et</button><button class="btn" onclick="licAct()">Aktivləşdir</button></div>`);
}
const licCard = () => { const s = LS || {};
  const t = s.ok === false ? 'Müddət bitib' : s.type === 'lic' ? `${esc(s.lic.n)} • ${esc(s.lic.p)} • ${s.left} gün qalıb (${dt(s.lic.e).slice(0, 10)}-ə qədər)` : s.type === 'grace' ? `Müddət bitib, güzəşt: ${s.left} gün` : s.type === 'trial' ? `Sınaq müddəti: ${s.left} gün qalıb` : 'Yoxlanılır…';
  return `<div class="card"><h2>🔑 Lisenziya</h2><small>${t}</small><br><br><button class="btn gh" onclick="licModal()">Açarı daxil et / yenilə</button></div>`; };
if (document.addEventListener) document.addEventListener('visibilitychange', () => { if (!document.hidden) licInit(); });

/* ---------- QR kod (öz kodum, kitabxanasız; bayt rejimi, düzəliş səviyyəsi L) ---------- */
const QR = (() => {
  const ECC = [7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28], BLK = [1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8];
  const raw = v => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const a = Math.floor(v / 7) + 2; r -= (25 * a - 10) * a - 55; if (v >= 7) r -= 36; } return r; };
  const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; };
  const gen = d => { const r = new Array(d).fill(0); r[d - 1] = 1; let root = 1; for (let i = 0; i < d; i++) { for (let j = 0; j < d; j++) { r[j] = mul(r[j], root); if (j + 1 < d) r[j] ^= r[j + 1]; } root = mul(root, 2); } return r; };
  const rem = (data, g) => { const r = new Array(g.length).fill(0); for (const b of data) { const f = b ^ r.shift(); r.push(0); g.forEach((c, i) => { r[i] ^= mul(c, f); }); } return r; };
  function make(text) {
    const bytes = [...new TextEncoder().encode(text)];
    let v = 1; for (; v <= 20; v++) if (bytes.length + 2 + (v > 9 ? 1 : 0) <= Math.floor(raw(v) / 8) - ECC[v - 1] * BLK[v - 1]) break;
    if (v > 20) return null;
    const nb = BLK[v - 1], el = ECC[v - 1], rw = Math.floor(raw(v) / 8), cap = rw - el * nb, bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v > 9 ? 16 : 8); bytes.forEach(b => put(b, 8)); put(0, Math.min(4, cap * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let p = 0xEC; data.length < cap; p ^= 0xEC ^ 0x11) data.push(p);
    const ns = nb - rw % nb, sl = Math.floor(rw / nb), g = gen(el), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) { const dl = sl - el + (i < ns ? 0 : 1), d = data.slice(k, k + dl); k += dl; blocks.push({ d, e: rem(d, g) }); }
    const out = []; for (let i = 0; i <= sl - el; i++) blocks.forEach(b => { if (i < b.d.length) out.push(b.d[i]); });
    for (let i = 0; i < el; i++) blocks.forEach(b => out.push(b.e[i]));
    const n = v * 4 + 17, M = Array.from({ length: n }, () => new Array(n).fill(false)), F = Array.from({ length: n }, () => new Array(n).fill(false));
    const set = (x, y, b) => { M[y][x] = b; F[y][x] = true; };
    for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < n && yy >= 0 && yy < n) set(xx, yy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
    if (v > 1) {
      const na = Math.floor(v / 7) + 2, st = Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2, pos = [6]; for (let p = n - 7; pos.length < na; p -= st) pos.splice(1, 0, p);
      for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) if (!((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)))
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const fmt = mask => {
      const d = (1 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412, q = i => ((b >>> i) & 1) === 1;
      for (let i = 0; i < 6; i++) set(8, i, q(i)); set(8, 7, q(6)); set(8, 8, q(7)); set(7, 8, q(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, q(i));
      for (let i = 0; i < 8; i++) set(n - 1 - i, 8, q(i)); for (let i = 8; i < 15; i++) set(8, n - 15 + i, q(i)); set(8, n - 8, true);
    };
    if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const b = (v << 12) | r; for (let i = 0; i < 18; i++) { const c = ((b >>> i) & 1) === 1, a = n - 11 + i % 3, q = Math.floor(i / 3); set(a, q, c); set(q, a, c); } }
    fmt(0);
    let k = 0; for (let right = n - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) { const x = right - j, y = ((right + 1) & 2) === 0 ? n - 1 - vert : vert; if (!F[y][x] && k < out.length * 8) { M[y][x] = ((out[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; } } }
    const mk = (m, x, y) => [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, x * y % 2 + x * y % 3 === 0, (x * y % 2 + x * y % 3) % 2 === 0, ((x + y) % 2 + x * y % 3) % 2 === 0][m];
    const apply = m => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!F[y][x] && mk(m, x, y)) M[y][x] = !M[y][x]; };
    const pen = () => {
      let p = 0, dark = 0;
      for (let y = 0; y < n; y++) {
        for (let t = 0; t < 2; t++) { let run = 1; for (let x = 1; x < n; x++) { if ((t ? M[x][y] : M[y][x]) === (t ? M[x - 1][y] : M[y][x - 1])) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
        for (let x = 0; x < n; x++) { if (M[y][x]) dark++; if (x && y && M[y][x] === M[y][x - 1] && M[y][x] === M[y - 1][x] && M[y][x] === M[y - 1][x - 1]) p += 3; }
      }
      return p + Math.max(0, Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1) * 10;
    };
    let best = 0, bp = 1e9; for (let m = 0; m < 8; m++) { apply(m); fmt(m); const p = pen(); if (p < bp) { bp = p; best = m; } apply(m); }
    apply(best); fmt(best); return M;
  }
  const svg = text => {
    const M = make(text); if (!M) return ''; const n = M.length, q = 3; let d = '';
    M.forEach((row, y) => { let x = 0; while (x < n) { if (row[x]) { let e = x; while (e < n && row[e]) e++; d += `M${x + q} ${y + q}h${e - x}v1h-${e - x}z`; x = e; } else x++; } });
    return `<svg viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  };
  return { make, svg };
})();

/* ---------- Çatdırılma ---------- */
let dPayMode = 'paid', dFilter = 'act';
const DST = { new: 'Hazırlanır', out: 'Kuryerdə', done: 'Çatdırıldı', fail: 'Çatdırılmadı' }, DBG = { new: 'wa', out: 'wa', done: 'ok', fail: 'er' };
const mapUrl = d => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(d.addr + (d.zip ? ' ' + d.zip : '') + ', Azerbaijan');
const dvText = s => s.dlv ? ['', '📦 ÇATDIRILMA', s.dlv.name, s.dlv.phone, s.dlv.addr, s.dlv.zip ? 'Poçt indeksi: ' + s.dlv.zip : '',
  s.dlv.pay === 'cod' ? 'Kuryer alacaq: ' + money(s.total) : 'Ödənilib (online)', 'Xəritə: ' + mapUrl(s.dlv)].filter((x, i) => i === 0 || x) : [];
function rcHtml(s) {
  const d = s.dlv, D = dsum(s);
  return `<div class="rcp"><div class="rc"><div><span>${esc(cfg.shop)}</span><span>${dt(s.ts)}</span></div>${cfg.phone ? `<div><span>${esc(cfg.phone)}</span></div>` : ''}<div><span>Satıcı: ${esc(s.seller || '—')}</span></div><hr>
  ${s.items.map(i => `<div><span>${esc(i.name)} ×${Math.abs(i.qty)}</span><span>${money(i.sell * i.qty)}</span></div>`).join('')}<hr>
  ${D ? `<div><span>Endirim</span><span>${money(-D)}</span></div>` : ''}<div><b>CƏMİ</b><b>${money(s.total)}</b></div>${payLines(s).map(([k, v]) => `<div><span>${esc(k)}</span><span>${money(v)}</span></div>`).join('')}
  ${s.pe ? `<div><span>⭐ Qazanılan xal</span><span>+${s.pe}</span></div>` : ''}${s.pu ? `<div><span>⭐ İşlədilən xal</span><span>−${s.pu}</span></div>` : ''}</div>
  ${d ? `<div class="dv"><b>📦 ÇATDIRILMA</b><div>${esc(d.name)}</div><div>${esc(d.phone)}</div><div>${esc(d.addr)}</div>${d.zip ? `<div>Poçt indeksi: <b style="display:inline">${esc(d.zip)}</b></div>` : ''}<div class="dpay">${d.pay === 'cod' ? 'KURYER ALACAQ: ' + money(s.total) : 'ÖDƏNİLİB (online)'}</div></div>` : ''}
  <small>Qeyri-fiskal qəbz — rəsmi fiskal çek deyil.</small><div class="brand">Lavanda<sup>™</sup></div>
  ${d ? `<div class="qr">${QR.svg(mapUrl(d)) || '<small>Ünvan QR üçün çox uzundur</small>'}<small>Ünvanı skan edin (xəritə)</small></div>` : ''}</div>`;
}
function printReceipt(id) { $('#prn').innerHTML = rcHtml(sales.find(x => x.id === id)); document.body.classList.add('prn'); setTimeout(() => print(), 80); }
function setDF(v) { dFilter = v; dlvList(); }
function dlvList() {
  const all = sales.filter(s => s.dlv).sort((a, b) => b.ts - a.ts), l = dFilter === 'act' ? all.filter(s => s.dlv.st === 'new' || s.dlv.st === 'out') : all;
  modal(`<h2>🚚 Çatdırılma</h2><div class="seg"><button class="${dFilter === 'act' ? 'on' : ''}" onclick="setDF('act')">Aktiv</button><button class="${dFilter === 'all' ? 'on' : ''}" onclick="setDF('all')">Hamısı</button></div>
  ${l.slice(0, 50).map(s => `<div class="card item" onclick="dlvView('${s.id}')"><div class="grow"><b>${esc(s.dlv.name)}</b><small>${esc(s.dlv.addr)}</small></div><div class="r"><b>${money(s.total)}</b><br><span class="badge ${DBG[s.dlv.st]}">${DST[s.dlv.st]}</span></div></div>`).join('') || '<div class="empty">Sifariş yoxdur</div>'}
  <br><button class="btn gh" onclick="closeModal()">Bağla</button>`);
}
function dlvView(id) {
  const s = sales.find(x => x.id === id), d = s.dlv;
  modal(`<h2>${esc(d.name)}</h2><span class="badge ${DBG[d.st]}">${DST[d.st]}</span>
  <div class="rc" style="margin-top:10px"><div><span>Telefon</span><span>${esc(d.phone)}</span></div><div><span>Ünvan</span><span style="text-align:right">${esc(d.addr)}</span></div>${d.zip ? `<div><span>Poçt</span><span>${esc(d.zip)}</span></div>` : ''}
  <div><span>Məbləğ</span><span>${money(s.total)}</span></div><div><span>Ödəniş</span><span>${d.pay === 'cod' ? 'Kuryer alacaq' : 'Ödənilib'}</span></div><hr>${s.items.map(i => `<div><span>${esc(i.name)} ×${i.qty}</span></div>`).join('')}</div>
  <div class="row2"><button class="btn gh" onclick="dSet('${id}','out')">🚚 Kuryerdə</button><button class="btn gh" onclick="dSet('${id}','done')">✅ Çatdırıldı</button></div>
  <button class="btn gh" style="margin-top:8px" onclick="dSet('${id}','fail')">✖ Çatdırıla bilmədi</button>
  <div class="row2" style="margin-top:8px"><button class="btn" onclick="printReceipt('${id}')">🖨 Çek çıxar</button><button class="btn gh" onclick="shareR('${id}')">📤 Paylaş</button></div>
  <small>Mal geri qayıdıbsa: Hesabat → satış → ↩ Məhsul qaytar (stok geri artır).</small><br><br><button class="btn gh" onclick="dlvList()">Geri</button>`);
}
function dSet(id, st) {
  const d = sales.find(x => x.id === id).dlv; d.st = st;
  if (st === 'done' && d.pay === 'cod') d.col = d.col || Date.now(); else delete d.col;
  save(); toast(DST[st], 'ok'); dlvView(id);
}

/* ---------- Aksiya, sadiqlik, kataloq, sifariş, şəkil çek, səs ---------- */
let loy = { cid: '', use: 0, ph: '', nf: false }, newPhone = '';
const PV = () => cfg.ptVal ?? 0.01, PE = () => cfg.ptEarn ?? 1, ptsOn = () => PE() > 0 || PV() > 0;
const dg = s => String(s || '').replace(/\D/g, '').slice(-9);
const dsum = s => r2(s.items.reduce((a, i) => a + (i.d || 0), 0));
const WD = [[1, 'B.e'], [2, 'Ç.a'], [3, 'Ç'], [4, 'C.a'], [5, 'C'], [6, 'Ş'], [0, 'B']];
const todayStr = () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
const promoOn = pr => { const ds = todayStr(); return (!pr.from || ds >= pr.from) && (!pr.to || ds <= pr.to) && (!(pr.wd || []).length || pr.wd.includes(new Date().getDay())); };
const promoSt = pr => { const ds = todayStr(); return pr.to && ds > pr.to ? 'bitib' : pr.from && ds < pr.from ? 'gözləyir' : promoOn(pr) ? 'aktiv' : 'bu gün deyil'; };
function bestPromo(p, qty) {
  let best = { d: 0, n: '' };
  (cfg.promos || []).filter(pr => promoOn(pr) && (pr.pid ? pr.pid === p.id : pr.type === 'pct')).forEach(pr => {
    const d = pr.type === 'bogo' ? Math.floor(qty / (pr.x + pr.y)) * pr.y * p.sell : pr.type === 'pct' ? p.sell * qty * pr.v / 100 : Math.max(0, p.sell - pr.v) * qty;
    if (d > best.d) best = { d: r2(d), n: pr.name };
  });
  return best;
}
const promoTag = (p, q) => { const b = bestPromo(p, q); return b.d ? ` • 🏷 ${esc(b.n)} −${money(b.d)}` : ''; };
function price() {
  const L = cart.map(i => { const p = products.find(x => x.id === i.id); if (!p) return null; const b = bestPromo(p, i.qty); return { p, qty: i.qty, d: b.d, n: b.n }; }).filter(Boolean);
  const sub = r2(L.reduce((a, l) => a + l.p.sell * l.qty - l.d, 0)), c = customers.find(x => x.id === loy.cid) || null;
  const max = c && PV() > 0 ? Math.min(c.pts || 0, Math.floor(sub / PV())) : 0, use = Math.max(0, Math.min(Math.floor(loy.use) || 0, max));
  const lv = r2(Math.min(sub, use * PV()));
  return { L, sub, c, use, loy: lv, total: r2(sub - lv) };
}
const loyInfo = P => P.c ? `<div class="card item"><div class="grow"><b>${esc(P.c.name)}</b><small>⭐ ${P.c.pts || 0} xal • ${money((P.c.pts || 0) * PV())}</small></div></div>
  <div class="bar" style="margin-top:8px"><input id="lu" type="number" inputmode="numeric" min="0" placeholder="Neçə xal işlət" value="${P.use || ''}" onchange="loyUse()"><button class="btn gh" style="width:auto;padding:0 14px" onclick="loyUse(1)">Hamısı</button></div>`
  : loy.nf ? '<small>Müştəri tapılmadı.</small><button class="btn gh" style="margin-top:6px" onclick="newCustLoy()">➕ Yeni müştəri</button>' : '';
function loyFind() {
  const ph = $('#lp').value, q = dg(ph), c = q.length >= 7 && customers.find(x => dg(x.phone) === q);
  loy = { cid: c ? c.id : '', use: 0, ph, nf: !c }; payModal(payMode);
}
function loyUse(all) {
  const P = price(); if (!P.c) return; const max = PV() > 0 ? Math.min(P.c.pts || 0, Math.floor(P.sub / PV())) : 0;
  loy.use = all ? max : Math.max(0, Math.min(max, parseInt($('#lu').value, 10) || 0)); $('#lu').value = loy.use || ''; calc();
}
function newCustLoy() { newPhone = $('#lp').value; newCust('loy'); }
const promoDesc = pr => { const p = products.find(x => x.id === pr.pid), n = p ? p.name : 'Bütün məhsullar';
  return (pr.type === 'bogo' ? `${n}: ${pr.x}-ni al, ${pr.y}-i pulsuz` : pr.type === 'pct' ? `${n}: ${pr.v}% endirim` : `${n}: ${money(pr.v)}`) + (pr.from || pr.to ? ` • ${pr.from || '…'} → ${pr.to || '…'}` : '') + ((pr.wd || []).length ? ' • ' + WD.filter(w => pr.wd.includes(w[0])).map(w => w[1]).join(',') : ''); };
const promoCard = () => `<div class="card"><h2>🏷 Aksiyalar</h2>${(cfg.promos || []).map(pr => `<div class="item" style="margin-bottom:10px" onclick="promoForm('${pr.id}')"><div class="grow"><b>${esc(pr.name)}</b><small style="white-space:normal">${esc(promoDesc(pr))}</small></div><span class="badge ${promoSt(pr) === 'aktiv' ? 'ok' : 'wa'}">${promoSt(pr)}</span></div>`).join('') || '<small>Aksiya yoxdur</small><br>'}<br><button class="btn gh" onclick="promoForm()">+ Yeni aksiya</button></div>`;
function promoForm(id) {
  const pr = (cfg.promos || []).find(x => x.id === id) || { type: 'bogo', x: 2, y: 1, v: '', wd: [] }, sel = t => pr.type === t ? ' selected' : '';
  modal(`<h2>${id ? 'Aksiyanı redaktə et' : 'Yeni aksiya'}</h2>
  <label>Ad<input id="pf-n" value="${esc(pr.name || '')}" placeholder="Məs: Həftəsonu endirimi"></label>
  <label>Növ<select id="pf-t" onchange="pfType()"><option value="bogo"${sel('bogo')}>N-ni al, M-i pulsuz</option><option value="pct"${sel('pct')}>Faiz endirimi</option><option value="price"${sel('price')}>Müddətli xüsusi qiymət</option></select></label>
  <label>Məhsul<select id="pf-p"><option value="">Bütün məhsullar (yalnız faiz endirimi)</option>${products.map(p => `<option value="${p.id}"${p.id === pr.pid ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
  <div id="pf-b" class="row2"><label>Al (N)<input id="pf-x" type="number" min="1" value="${pr.x || 2}"></label><label>Pulsuz (M)<input id="pf-y" type="number" min="1" value="${pr.y || 1}"></label></div>
  <label id="pf-vl"><span id="pf-vt">Dəyər</span><input id="pf-v" type="number" step="0.01" min="0" value="${pr.v}"></label>
  <div class="row2"><label>Başlanğıc tarix<input id="pf-f" type="date" value="${pr.from || ''}"></label><label>Son tarix<input id="pf-e" type="date" value="${pr.to || ''}"></label></div>
  <small>Günlər (heç biri seçilməsə, hər gün):</small><div class="wds">${WD.map(([d, l]) => `<label class="wd"><input type="checkbox" id="wd${d}"${(pr.wd || []).includes(d) ? ' checked' : ''}>${l}</label>`).join('')}</div>
  <small>Son tarixdən sonra aksiya avtomatik söndürülür.</small>
  <div class="row2" style="margin-top:12px">${id ? `<button class="btn er" onclick="promoDel('${id}')">Sil</button>` : '<button class="btn gh" onclick="closeModal()">Ləğv et</button>'}<button class="btn" onclick="promoSave('${id || ''}')">Yadda saxla</button></div>`);
  pfType();
}
function pfType() { const t = $('#pf-t').value; $('#pf-b').style.display = t === 'bogo' ? '' : 'none'; $('#pf-vl').style.display = t === 'bogo' ? 'none' : ''; $('#pf-vt').textContent = t === 'pct' ? 'Endirim (%)' : 'Xüsusi qiymət (₼)'; }
function promoSave(id) {
  const t = $('#pf-t').value, pid = $('#pf-p').value, x = parseInt($('#pf-x').value, 10), y = parseInt($('#pf-y').value, 10), v = parseFloat($('#pf-v').value);
  const pr = { id: id || uid(), name: $('#pf-n').value.trim(), type: t, pid, x, y, v, from: $('#pf-f').value, to: $('#pf-e').value, wd: WD.map(w => w[0]).filter(d => $('#wd' + d).checked) };
  if (!pr.name) return toast('Aksiyanın adını yazın', 'err');
  if (t === 'bogo' ? (!pid || !(x >= 1) || !(y >= 1)) : (!(v >= 0) || (t === 'price' && !pid) || (t === 'pct' && v > 100))) return toast(t === 'pct' ? 'Faizi düzgün yazın (0–100)' : 'Məhsulu və dəyərləri düzgün yazın', 'err');
  if (pr.from && pr.to && pr.to < pr.from) return toast('Son tarix başlanğıcdan əvvəl ola bilməz', 'err');
  cfg.promos = (cfg.promos || []).filter(p => p.id !== pr.id).concat(pr); save(); closeModal(); rSet(); toast('Aksiya saxlanıldı', 'ok');
}
function promoDel(id) { if (!confirm('Aksiya silinsin?')) return; cfg.promos = (cfg.promos || []).filter(p => p.id !== id); save(); closeModal(); rSet(); }
const loyCard = () => `<div class="card"><h2>⭐ Sadiqlik xalları</h2><div class="row2"><label>1 ₼-ə neçə xal<input id="le" type="number" step="0.1" min="0" value="${PE()}"></label><label>1 xal neçə ₼<input id="lv" type="number" step="0.001" min="0" value="${PV()}"></label></div><small>Məs: 1 və 0.01 = hər alışdan 1% xal geri. İkisini 0 etsəniz söndürülür. Müştəri telefon nömrəsi ilə tapılır.</small><br><br><button class="btn gh" onclick="saveLoy()">Yadda saxla</button></div>`;
function saveLoy() { cfg.ptEarn = Math.max(0, parseFloat($('#le').value) || 0); cfg.ptVal = Math.max(0, parseFloat($('#lv').value) || 0); save(); toast('Yadda saxlanıldı', 'ok'); }
/* şəkil paylaşma (kataloq, çek) */
const loadImg = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
const fitText = (x, s, w) => { if (x.measureText(s).width <= w) return s; while (s.length > 1 && x.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };
const rr = (x, a, b, w, h, r) => { x.beginPath(); if (x.roundRect) x.roundRect(a, b, w, h, r); else x.rect(a, b, w, h); };
const toBlob = c => new Promise(r => c.toBlob(r, 'image/png'));
async function shareFiles(files, text) {
  if (navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files, text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  files.forEach(f => dl(f.name, f, f.type)); toast('Şəkil yükləndi. Qalereyadan paylaşın', 'ok');
}
function catModal() {
  const l = products.filter(p => p.sell > 0 && p.stock > 0).sort((a, b) => a.name.localeCompare(b.name, 'az'));
  if (!l.length) return toast('Stokda məhsul yoxdur', 'err');
  modal(`<h2>📣 Kataloq</h2><small>Paylaşmaq istədiyiniz məhsulları seçin. Hər şəkildə 6 məhsul olur.</small>
  <div class="cl">${l.map(p => `<label class="chk"><input type="checkbox" class="cp" value="${p.id}" checked><span class="grow">${esc(p.name)}</span><b>${money(p.sell)}</b></label>`).join('')}</div>
  <div class="row2"><button class="btn gh" onclick="closeModal()">Ləğv et</button><button class="btn" onclick="catMake()">Şəkillər yarat</button></div>`);
}
async function catMake() {
  const l = [...document.querySelectorAll('.cp')].filter(e => e.checked).map(e => products.find(p => p.id === e.value)).filter(Boolean);
  if (!l.length) return toast('Məhsul seçin', 'err');
  toast('Şəkillər hazırlanır…'); const files = [], W = 1080, H = 1350, per = 6, cw = 480, ch = 540;
  for (let pg = 0; pg * per < l.length; pg++) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#3730a3'); g.addColorStop(1, '#6366f1'); x.fillStyle = '#f3f4fa'; x.fillRect(0, 0, W, H); x.fillStyle = g; x.fillRect(0, 0, W, 150);
    x.fillStyle = '#fff'; x.font = '700 54px system-ui,sans-serif'; x.textBaseline = 'middle'; x.fillText(fitText(x, cfg.shop, W - 80), 40, 75);
    const part = l.slice(pg * per, pg * per + per);
    for (let k = 0; k < part.length; k++) {
      const p = part[k], cx = 40 + (k % 2) * (cw + 40), cy = 190 + Math.floor(k / 2) * (ch + 30), im = p.img ? await loadImg(p.img) : null;
      x.fillStyle = '#fff'; rr(x, cx, cy, cw, ch, 28); x.fill();
      if (im) { x.save(); rr(x, cx + 20, cy + 20, cw - 40, 330, 20); x.clip(); x.drawImage(im, cx + 20, cy + 20, cw - 40, 330); x.restore(); }
      else { x.fillStyle = '#eef0ff'; rr(x, cx + 20, cy + 20, cw - 40, 330, 20); x.fill(); x.fillStyle = '#3730a3'; x.font = '700 120px system-ui,sans-serif'; x.textAlign = 'center'; x.fillText((p.name.trim()[0] || '?').toUpperCase(), cx + cw / 2, cy + 185); x.textAlign = 'left'; }
      x.fillStyle = '#14152b'; x.font = '600 34px system-ui,sans-serif'; x.fillText(fitText(x, p.name, cw - 40), cx + 20, cy + 395);
      x.fillStyle = '#3730a3'; x.font = '800 48px system-ui,sans-serif'; x.fillText(money(p.sell), cx + 20, cy + 465);
      if (p.stock <= 3) { x.fillStyle = '#d97706'; x.font = '600 26px system-ui,sans-serif'; x.fillText('Son ' + p.stock + ' ədəd', cx + 20, cy + 510); }
    }
    x.fillStyle = '#6b6f8a'; x.font = '600 30px system-ui,sans-serif'; x.textAlign = 'center'; x.fillText((cfg.phone ? '📞 Sifariş: ' + cfg.phone + '  •  ' : '') + 'Lavanda™', W / 2, H - 40);
    files.push(new File([await toBlob(c)], `kataloq-${pg + 1}.png`, { type: 'image/png' }));
  }
  closeModal(); await shareFiles(files, cfg.shop);
}
async function receiptImg(id) {
  const s = sales.find(q => q.id === id), W = 640, c = document.createElement('canvas'); c.width = W; c.height = 3000; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, 3000); x.fillStyle = '#000'; x.textBaseline = 'top'; let y = 30;
  const F = (w, z) => { x.font = `${w} ${z}px system-ui,sans-serif`; }, ctr = (t, z, w = 400) => { F(w, z); x.textAlign = 'center'; x.fillText(t, W / 2, y); y += z + 12; };
  const row = (a, b, bold) => { F(bold ? 700 : 400, 26); x.textAlign = 'left'; x.fillText(fitText(x, a, W - 250), 30, y); x.textAlign = 'right'; x.fillText(b, W - 30, y); y += 38; };
  const line = () => { x.fillStyle = '#999'; x.fillRect(30, y + 4, W - 60, 2); x.fillStyle = '#000'; y += 20; };
  const wr = t => { F(400, 26); x.textAlign = 'left'; let ln = ''; t.split(' ').forEach(w => { const tt = ln ? ln + ' ' + w : w; if (x.measureText(tt).width > W - 60 && ln) { x.fillText(ln, 30, y); y += 34; ln = w; } else ln = tt; }); x.fillText(ln, 30, y); y += 36; };
  x.fillStyle = '#000'; ctr(fitText(x, cfg.shop, W - 60), 40, 800); if (cfg.phone) ctr(cfg.phone, 24); ctr(dt(s.ts) + ' • ' + (s.seller || ''), 24); line();
  s.items.forEach(i => row(`${i.name} ×${Math.abs(i.qty)}`, money(i.sell * i.qty)));
  if (dsum(s)) row('Endirim', money(-dsum(s)));
  line(); row('CƏMİ', money(s.total), 1); payLines(s).forEach(([k, v]) => row(k, money(v))); if (s.pe) row('⭐ Qazanılan xal', '+' + s.pe);
  const d = s.dlv;
  if (d) { y += 8; line(); F(700, 26); x.textAlign = 'left'; x.fillText('📦 ÇATDIRILMA', 30, y); y += 38; [d.name, d.phone, d.addr, d.zip ? 'Poçt indeksi: ' + d.zip : '', d.pay === 'cod' ? 'KURYER ALACAQ: ' + money(s.total) : 'ÖDƏNİLİB (online)'].filter(Boolean).forEach(wr); }
  y += 10; ctr('Qeyri-fiskal qəbz', 22); const g = x.createLinearGradient(W / 2 - 120, 0, W / 2 + 120, 0); g.addColorStop(0, '#3730a3'); g.addColorStop(1, '#6366f1'); x.fillStyle = g; ctr('Lavanda™', 44, 800); x.fillStyle = '#000';
  const M = d && QR.make(mapUrl(d));
  if (M) { const n = M.length, px = Math.max(3, Math.floor(300 / (n + 6))), z = (n + 6) * px, ox = (W - z) / 2; x.fillStyle = '#fff'; x.fillRect(ox, y, z, z); x.fillStyle = '#000'; M.forEach((r, j) => r.forEach((v, k) => { if (v) x.fillRect(ox + (k + 3) * px, y + (j + 3) * px, px, px); })); y += z + 6; ctr('Ünvanı skan edin (xəritə)', 22); }
  const o = document.createElement('canvas'); o.width = W; o.height = Math.ceil(y + 20); o.getContext('2d').drawImage(c, 0, 0);
  return toBlob(o);
}
async function shareImg(id) { toast('Şəkil hazırlanır…'); const b = await receiptImg(id); if (!b) return toast('Şəkil yaradılmadı', 'err'); await shareFiles([new File([b], 'qebz.png', { type: 'image/png' })], ''); }
/* təchizatçıya sifariş */
const waNum = p => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('994') ? d : d.startsWith('0') ? '994' + d.slice(1) : d.length === 9 ? '994' + d : d; };
function supModal() {
  const l = products.filter(p => p.stock <= LOW).sort((a, b) => a.stock - b.stock); if (!l.length) return toast('Az qalan məhsul yoxdur', 'ok');
  const s = cfg.sup || {};
  modal(`<h2>📦 Təchizatçıya sifariş</h2><label>Təchizatçı<input id="sp-n" value="${esc(s.n || '')}" placeholder="Ad (ixtiyari)"></label><label>WhatsApp nömrəsi (ixtiyari)<input id="sp-p" type="tel" inputmode="tel" value="${esc(s.p || '')}" placeholder="050 123 45 67"></label>
  ${l.map(p => `<div class="card item"><label class="chk" style="margin:0;flex:1"><input type="checkbox" class="sk" value="${p.id}" checked><span class="grow"><b>${esc(p.name)}</b><small>stok: ${p.stock}</small></span></label><input class="sq" data-id="${p.id}" type="number" min="1" value="${Math.max(LOW * 2 - p.stock, 1)}" style="width:80px"></div>`).join('')}
  <div class="row2" style="margin-top:12px"><button class="btn gh" onclick="closeModal()">Ləğv et</button><button class="btn" onclick="supSend()">💬 WhatsApp</button></div>`);
}
function supSend() {
  const q = [...document.querySelectorAll('.sq')], items = [...document.querySelectorAll('.sk')].filter(e => e.checked).map(e => {
    const p = products.find(x => x.id === e.value), n = q.find(z => z.dataset.id === e.value); return p && `${p.name} — ${parseInt(n && n.value, 10) || 1} ədəd`; }).filter(Boolean);
  if (!items.length) return toast('Məhsul seçin', 'err');
  cfg.sup = { n: $('#sp-n').value.trim(), p: $('#sp-p').value.trim() }; save();
  const t = `Salam${cfg.sup.n ? ', ' + cfg.sup.n : ''}! Aşağıdakı malları sifariş vermək istəyirik:\n\n${items.map((v, i) => `${i + 1}. ${v}`).join('\n')}\n\nMağaza: ${cfg.shop}${cfg.phone ? '\nƏlaqə: ' + cfg.phone : ''}\nTəşəkkürlər!`;
  open('https://wa.me/' + waNum(cfg.sup.p) + '?text=' + encodeURIComponent(t), '_blank');
}
/* səslə axtarış */
function voice(id) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) return toast('Bu brauzer səsli axtarışı dəstəkləmir', 'err');
  const r = new R(); r.lang = 'az-AZ'; r.interimResults = false; r.maxAlternatives = 1; toast('🎤 Danışın…');
  r.onresult = e => { const el = $('#' + id); el.value = e.results[0][0].transcript.replace(/[.,!?]+$/, '').trim(); el.dispatchEvent(new Event('input')); };
  r.onerror = e => toast(e.error === 'not-allowed' ? 'Mikrofona icazə verilməyib' : 'Səs tanınmadı, yenidən cəhd edin', 'err'); r.start();
}

/* ---------- Başlanğıc ---------- */
function updNet() { const n = $('#net'); n.textContent = navigator.onLine ? 'Onlayn' : 'Offlayn'; n.classList.toggle('off', !navigator.onLine); }
addEventListener('online', updNet); addEventListener('offline', updNet);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); dp = e; if (view === 'set') rSet(); });
if ('serviceWorker' in navigator) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) showUpd(); });
  addEventListener('load', () => navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' }).then(reg => {
    const chk = () => reg.update().catch(() => { });
    setInterval(chk, 30 * 60 * 1000); document.addEventListener('visibilitychange', () => { if (!document.hidden) chk(); });
  }).catch(() => { }));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(g => { persisted = g; if (view === 'set') rSet(); }).catch(() => { });
applyCfg(); updNet(); go('sell'); licInit();
