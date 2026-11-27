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
function closeModal() { $('#mdl').classList.remove('on'); }
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
const total = () => r2(cart.reduce((s, i) => { const p = products.find(x => x.id === i.id); return s + (p ? p.sell * i.qty : 0); }, 0));

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
    ? rows.map(({ i, p }) => `<div class="card item${p.id === lastAdded ? ' pop' : ''}"><div class="grow"><b>${esc(p.name)}</b><small>${money(p.sell)} × ${i.qty} = ${money(p.sell * i.qty)}</small></div><div class="qty"><button onclick="chg('${p.id}',-1)" aria-label="Azalt">−</button><span>${i.qty}</span><button onclick="chg('${p.id}',1)" aria-label="Artır">+</button></div></div>`).join('') +
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
  payMode = mode || 'cash';
  const t = total(), cr = payMode === 'credit';
  const amts = [...new Set([t, ...[5, 10, 20, 50, 100].map(n => Math.ceil(t / n) * n)])].filter(a => a >= t).slice(0, 4);
  const body = cr
    ? `${customers.length ? `<label>Müştəri<select id="cust" onchange="calc()"><option value="">Seçin…</option>${customers.map(c => `<option value="${c.id}"${c.id === selCust ? ' selected' : ''}>${esc(c.name)} (borc ${money(bal(c.id))})</option>`).join('')}</select></label>` : ''}
    <button class="btn gh" style="margin-bottom:12px" onclick="newCust('pay')">+ Yeni müştəri</button>
    <label>İndi ödənilən (₼, ixtiyari)<input id="rcv" type="number" inputmode="decimal" step="0.01" min="0" oninput="calc()"></label>`
    : `<label>Alınan məbləğ (₼)<input id="rcv" type="number" inputmode="decimal" step="0.01" min="0" oninput="calc()"></label>
    <div class="chips">${amts.map((a, k) => `<button onclick="setRcv(${a})">${k ? money(a) : 'Dəqiq'}</button>`).join('')}</div>`;
  modal(`<h2>Ödəniş</h2><div class="big">${money(t)}</div>
  <div class="seg"><button class="${cr ? '' : 'on'}" onclick="payModal('cash')">💵 Nağd</button><button class="${cr ? 'on' : ''}" onclick="payModal('credit')">📒 Nisyə</button><button disabled>💳 Qoşulmayıb</button></div>
  ${body}<div class="change" id="chv"></div>
  <div class="row2"><button class="btn gh" onclick="closeModal()">Ləğv et</button><button class="btn" id="ok" onclick="finish()" disabled>Təsdiqlə</button></div>`);
  calc();
}
function setRcv(a) { $('#rcv').value = a; calc(); }
function calc() {
  const t = total(), v = r2(parseFloat($('#rcv').value)), c = $('#cust');
  if (payMode === 'credit') {
    $('#chv').textContent = 'Borca yazılacaq: ' + money(t - v);
    $('#ok').disabled = !(c && c.value && v >= 0 && v < t); return;
  }
  const ok = v >= t;
  $('#chv').textContent = ok ? 'Qaytarılacaq: ' + money(v - t) : 'Çatışmayan: ' + money(t - v);
  $('#ok').disabled = !ok;
}
function finish() {
  const t = total(), v = r2(parseFloat($('#rcv').value)), cr = payMode === 'credit', c = cr && customers.find(x => x.id === $('#cust').value);
  if (!cart.length || v < 0 || (cr ? !(c && v < t) : v < t)) return;
  for (const i of cart) { const p = products.find(x => x.id === i.id); if (!p || p.stock < i.qty) return toast('Stok kifayət deyil: ' + (p ? p.name : ''), 'err'); }
  const s = { id: uid(), ts: Date.now(), total: t, paid: v, change: cr ? 0 : r2(v - t), method: cr ? 'credit' : 'cash', seller: cfg.seller,
    items: cart.map(i => { const p = products.find(x => x.id === i.id); return { id: p.id, name: p.name, barcode: p.barcode, qty: i.qty, buy: p.buy, sell: p.sell }; }) };
  if (cr) { s.cid = c.id; s.cname = c.name; s.debt = r2(t - v); }
  const bak = JSON.stringify(products);
  cart.forEach(i => { products.find(x => x.id === i.id).stock -= i.qty; });
  sales.push(s);
  if (cr) ledger.push({ id: uid(), cid: c.id, ts: s.ts, amt: s.debt, type: 'debt', sid: s.id });
  if (!save()) { products = JSON.parse(bak); sales.pop(); if (cr) ledger.pop(); return; }
  cart = []; selCust = ''; rCart(); receipt(s, true);
}
function receipt(s, fresh) {
  const rt = s.ret, cr = s.method === 'credit';
  modal(`<h2>${fresh ? (rt ? '↩ Qaytarma tamamlandı' : '✅ Satış tamamlandı') : (rt ? 'Qaytarma №' : 'Satış №') + (sales.indexOf(s) + 1)}</h2>
  ${fresh ? `<div class="change">${rt ? 'Qaytarılacaq nağd: ' + money(s.cash) : cr ? 'Borca yazıldı: ' + money(s.debt) : 'Qaytarılacaq: ' + money(s.change)}</div>` : ''}
  <div class="rc"><div><span>${esc(cfg.shop)}</span><span>${dt(s.ts)}</span></div><div><span>Satıcı: ${esc(s.seller || '—')}</span></div><hr>
  ${s.items.map(i => `<div><span>${esc(i.name)} ×${Math.abs(i.qty)}</span><span>${money(i.sell * i.qty)}</span></div>`).join('')}<hr>
  <div><b>CƏMİ</b><b>${money(s.total)}</b></div>${payLines(s).map(([k, v]) => `<div><span>${esc(k)}</span><span>${money(v)}</span></div>`).join('')}</div>
  <small>Qeyri-fiskal qəbz — rəsmi fiskal çek deyil.</small>
  <div class="brand">Lavanda<sup>™</sup></div>
  <div class="row2"><button class="btn gh" onclick="shareR('${s.id}')">📤 Paylaş</button><button class="btn gh" onclick="shareR('${s.id}',1)">💬 WhatsApp</button></div><br>
  ${!fresh && !rt ? `<button class="btn gh" style="margin-bottom:10px" onclick="retModal('${s.id}')">↩ Məhsul qaytar</button>` : ''}
  <button class="btn" onclick="closeModal()">${fresh ? 'Yeni satış' : 'Bağla'}</button>`);
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
  const rev = sum(l, s => s.total), pr = sum(l, s => sum(s.items, i => (i.sell - i.buy) * i.qty)), n = sum(l, s => sum(s.items, i => i.qty));
  $('#v-rep').innerHTML = `<div class="seg">${[['day', 'Gün'], ['week', 'Həftə'], ['month', 'Ay'], ['all', 'Hamısı']].map(([k, t]) => `<button class="${period === k ? 'on' : ''}" onclick="setP('${k}')">${t}</button>`).join('')}</div>
  <div class="grid"><div class="stat hi"><small>Dövriyyə</small><b>${money(rev)}</b></div>
  <div class="stat"><small>Təxmini qazanc</small><b>${money(pr)}</b></div><div class="stat"><small>Satış sayı</small><b>${l.filter(s => !s.ret).length}</b></div>
  <div class="stat"><small>Satılan ədəd</small><b>${n}</b></div><div class="stat"><small>Ümumi dövriyyə</small><b>${money(sum(sales, s => s.total))}</b></div></div>
  <button class="btn" style="margin-top:12px" onclick="dayEnd()">🌙 Günsonu (kassanı bağla)</button>
  <button class="btn gh" style="margin-top:8px" onclick="exportSales()">📥 Satışları CSV-yə yüklə</button>
  ${bySeller(l)}<h3>Satış tarixçəsi</h3>
  ${l.slice(0, 100).map(s => `<div class="card item" onclick="showSale('${s.id}')"><div class="grow"><b>${dt(s.ts)}</b><small>${s.items.reduce((a, i) => a + i.qty, 0)} ədəd • ${esc(s.seller || '')}${s.method === 'credit' ? ' • nisyə' : ''}${s.ret ? ' • qaytarma' : ''}</small></div><b>${money(s.total)}</b></div>`).join('') || '<div class="empty">Bu dövrdə satış yoxdur</div>'}
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
    s.items.forEach(i => rows.push([dt(s.ts), no, i.name, i.barcode, i.qty, i.buy, i.sell, r2(i.sell * i.qty), r2((i.sell - i.buy) * i.qty), s.seller || '', s.ret ? 'Qaytarma' : s.method === 'credit' ? 'Nisyə' : 'Nağd']));
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
function saveShop() { cfg.shop = $('#shop').value.trim() || 'Mağaza Kassası'; save(); applyCfg(); toast('Yadda saxlanıldı', 'ok'); }
function install() { if (dp) { dp.prompt(); dp = null; rSet(); } }
function rSet() {
  const bk = +localStorage.getItem(K.b);
  $('#v-set').innerHTML = `<div class="card"><h2>Mağaza</h2><label>Mağaza adı<input id="shop" value="${esc(cfg.shop)}"></label><button class="btn" onclick="saveShop()">Yadda saxla</button></div>
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
  <p class="muted" style="text-align:center">Mağaza Kassası v1.4 • AZN</p>`;
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
const secCards = () => `${licCard()}<div class="card"><h2>📷 Skaner</h2><button class="btn gh" onclick="togConf()">Skanerdə təsdiq düyməsi: ${cfg.confirmScan !== false ? 'AÇIQ' : 'BAĞLI'}</button></div>
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
  modal(`<h2>Yeni müştəri</h2><label>Ad<input id="c-n" maxlength="40"></label><label>Telefon (ixtiyari)<input id="c-p" type="tel" inputmode="tel" maxlength="20"></label>
  <div class="row2"><button class="btn gh" onclick="${ctx ? "payModal('credit')" : 'custList()'}">Geri</button><button class="btn" onclick="saveCust('${ctx || ''}')">Yadda saxla</button></div>`);
}
function saveCust(ctx) {
  const n = $('#c-n').value.trim(); if (!n) return toast('Adı yazın', 'err');
  const c = { id: uid(), name: n, phone: $('#c-p').value.trim() }; customers.push(c);
  if (!save()) { customers.pop(); return; }
  toast('Müştəri əlavə olundu', 'ok'); if (ctx) { selCust = c.id; payModal('credit'); } else custList();
}
function custView(id) {
  const c = customers.find(x => x.id === id), b = bal(id), es = ledger.filter(e => e.cid === id).sort((x, y) => y.ts - x.ts);
  modal(`<h2>${esc(c.name)}</h2><small>${esc(c.phone || '')}</small><div class="big" style="color:var(${b > 0 ? '--er' : '--ok'})">${money(b)}</div>
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
  : s.method === 'credit' ? [['İndi ödənilən', s.paid], ['Borc: ' + (s.cname || ''), s.debt]] : [['Nağd', s.paid], ['Qaytarılan', s.change]];
const rText = s => [`🧾 ${cfg.shop}${s.ret ? ' (QAYTARMA)' : ''}`, dt(s.ts) + (s.seller ? ' • ' + s.seller : ''), '──────────',
  ...s.items.map(i => `${i.name} ×${Math.abs(i.qty)} — ${money(i.sell * i.qty)}`), '──────────', `CƏMİ: ${money(s.total)}`,
  ...payLines(s).map(([k, v]) => `${k}: ${money(v)}`), '', 'Qeyri-fiskal qəbz', 'Lavanda™'].join('\n');
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
  modal(`<h2>↩ Məhsul qaytarma</h2>${rows.map(({ i, max }) => `<div class="card item"><div class="grow"><b>${esc(i.name)}</b><small>${money(i.sell)} • maks. ${max}</small></div><div class="qty"><button onclick="retChg('${id}','${i.id}',-1,${max})">−</button><span id="rq-${i.id}">0</span><button onclick="retChg('${id}','${i.id}',1,${max})">+</button></div></div>`).join('')}
  <div class="change" id="rtot" style="margin-top:12px">Qaytarılacaq: ${money(0)}</div>
  <div class="row2"><button class="btn gh" onclick="showSale('${id}')">Geri</button><button class="btn" onclick="retDo('${id}')">Təsdiqlə</button></div>`);
}
function retChg(id, pid, d, max) {
  retQ[pid] = Math.min(max, Math.max(0, (retQ[pid] || 0) + d)); $('#rq-' + pid).textContent = retQ[pid];
  const s = sales.find(x => x.id === id); $('#rtot').textContent = 'Qaytarılacaq: ' + money(s.items.reduce((a, i) => a + i.sell * (retQ[i.id] || 0), 0));
}
function retDo(id) {
  const s = sales.find(x => x.id === id), its = s.items.filter(i => retQ[i.id] > 0);
  if (!its.length) return toast('Qaytarılacaq məhsulu seçin', 'err');
  const left = {}; s.items.forEach(i => { left[i.id] = i.qty; }); sales.filter(x => x.ref === id).forEach(r => r.items.forEach(i => { left[i.id] += i.qty; }));
  if (its.some(i => retQ[i.id] > left[i.id])) return toast('Qaytarma miqdarı satılandan çoxdur', 'err');
  const amt = r2(its.reduce((a, i) => a + i.sell * retQ[i.id], 0)), cut = s.method === 'credit' ? Math.min(amt, Math.max(0, bal(s.cid))) : 0;
  const r = { id: uid(), ts: Date.now(), total: -amt, paid: 0, change: 0, method: 'return', ret: true, ref: id, seller: cfg.seller, cash: r2(amt - cut), debtCut: cut, cname: s.cname,
    items: its.map(i => ({ id: i.id, name: i.name, barcode: i.barcode, qty: -retQ[i.id], buy: i.buy, sell: i.sell })) };
  const bak = JSON.stringify(products);
  its.forEach(i => { const p = products.find(x => x.id === i.id); if (p) p.stock += retQ[i.id]; });
  sales.push(r); if (cut) ledger.push({ id: uid(), cid: s.cid, ts: r.ts, amt: cut, type: 'pay', sid: r.id });
  if (!save()) { products = JSON.parse(bak); sales.pop(); if (cut) ledger.pop(); return; }
  rRep(); receipt(r, true);
}
function dayEnd() {
  const f = range('day'), l = sales.filter(s => s.ts >= f), sl = l.filter(s => !s.ret), rt = l.filter(s => s.ret);
  const sum = (a, fn) => r2(a.reduce((x, y) => x + fn(y), 0)), last = (cfg.closings || []).slice(-1)[0];
  dayD = { ts: Date.now(), n: sl.length, rev: sum(l, s => s.total), prof: sum(l, s => sum(s.items, i => (i.sell - i.buy) * i.qty)),
    cashIn: sum(sl, s => s.paid - s.change), credit: sum(sl, s => s.debt || 0), debtPaid: sum(ledger.filter(e => e.ts >= f && e.type === 'pay' && !e.sid), e => e.amt),
    refunds: sum(rt, s => s.cash), open: last ? last.counted : 0 };
  const R = (k, v) => `<div><span>${k}</span><span>${v}</span></div>`, d = dayD;
  modal(`<h2>🌙 Günsonu</h2><div class="rc">${R('Satış sayı', d.n)}${R('Dövriyyə (xalis)', money(d.rev))}${R('Təxmini qazanc', money(d.prof))}<hr>${R('Nağd satışlar', money(d.cashIn))}${R('Borc ödənişləri', money(d.debtPaid))}${R('Qaytarılan nağd', '−' + money(d.refunds))}${R('Nisyə verildi', money(d.credit))}</div>
  <label>Açılış kassası (₼)<input id="de-o" type="number" inputmode="decimal" step="0.01" value="${d.open}" oninput="deCalc()"></label>
  <label>Kassada faktiki nağd (₼)<input id="de-c" type="number" inputmode="decimal" step="0.01" oninput="deCalc()"></label>
  <div class="change" id="de-x"></div>
  ${(cfg.closings || []).slice(-3).reverse().map(c => `<small>${dt(c.ts)} — dövriyyə ${money(c.rev)}, fərq ${money(c.diff)}</small><br>`).join('')}
  <div class="row2" style="margin-top:10px"><button class="btn gh" onclick="deShare()">📤 Paylaş</button><button class="btn" onclick="deSave()">Qeyd et</button></div><br><button class="btn gh" onclick="closeModal()">Bağla</button>`);
  deCalc();
}
function deCalc() {
  const d = dayD, o = r2(parseFloat($('#de-o').value)), c = parseFloat($('#de-c').value);
  d.open = o; d.exp = r2(o + d.cashIn + d.debtPaid - d.refunds); d.counted = isNaN(c) ? null : r2(c); d.diff = d.counted == null ? null : r2(d.counted - d.exp);
  $('#de-x').textContent = 'Gözlənilən nağd: ' + money(d.exp) + (d.diff == null ? '' : ' • Fərq: ' + (d.diff > 0 ? '+' : '') + money(d.diff));
}
const deText = d => ['🌙 Günsonu — ' + cfg.shop, dt(d.ts), `Satış: ${d.n} • Dövriyyə: ${money(d.rev)}`, `Təxmini qazanc: ${money(d.prof)}`,
  `Nağd satış: ${money(d.cashIn)} • Borc ödənişi: ${money(d.debtPaid)}`, `Qaytarma: ${money(d.refunds)} • Nisyə: ${money(d.credit)}`,
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
    const c = document.createElement('canvas'), S = 160, m = Math.min(im.width, im.height); c.width = c.height = S;
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
