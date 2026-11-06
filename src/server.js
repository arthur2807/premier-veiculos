'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, UPLOAD_DIR, getSettings, saveSettings, parseVehicle, hoursText, parseSchedule } = require('./db');
const auth = require('./auth');
const stats = require('./analytics');
const system = require('./system');
const pages = require('./pages');
const { esc, vehicleUrl } = require('./views');

const BRAND = require('./brand');
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon', '.json': 'application/json' };

// ---------- helpers ----------
function send(res, status, body, type = 'text/html; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', ...headers });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });

function serveFile(res, base, rel, cache = 'public, max-age=86400', extra = {}) {
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) return false;
  let st; try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', ...extra });
  fs.createReadStream(file).pipe(res);
  return true;
}

function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Arquivo muito grande'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function ctx() {
  const units = db.prepare('SELECT * FROM units ORDER BY sort, id').all();
  const unitsById = Object.fromEntries(units.map((u) => [u.id, u]));
  return { units, unitsById, settings: getSettings() };
}
const all = (sql, ...p) => db.prepare(sql).all(...p).map(parseVehicle);
const one = (sql, ...p) => parseVehicle(db.prepare(sql).get(...p));
const distinct = (col) => db.prepare(`SELECT DISTINCT ${col} v FROM vehicles WHERE status!='vendido' AND ${col}!='' ORDER BY ${col}`).all().map((r) => r.v);
const idList = (s) => [...new Set(String(s || '').split(',').map((x) => parseInt(x, 10)).filter((n) => n > 0))].slice(0, 30);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ---------- imagem "Fotos em breve" ----------
let LOGO_B64 = '';
try { LOGO_B64 = fs.readFileSync(path.join(PUBLIC_DIR, 'img', 'logo-360.png')).toString('base64'); } catch {}
function placeholderSvg(v) {
  const label = v ? esc(`${v.brand} ${v.model}`) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 440"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f8fc"/><stop offset="1" stop-color="#e2e8f3"/></linearGradient></defs>
<rect width="640" height="440" fill="url(#g)"/>
<path d="M0 392 L640 330 L640 352 L0 414Z" fill="${BRAND.colors.accent}" opacity=".9"/><path d="M0 414 L640 352 L640 440 L0 440Z" fill="${BRAND.colors.dark}"/>
${LOGO_B64 ? `<image href="data:image/png;base64,${LOGO_B64}" x="170" y="96" width="300" height="121"/>` : ''}
<text x="320" y="262" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="${BRAND.colors.dark}" letter-spacing="1">FOTOS EM BREVE</text>
${label ? `<text x="320" y="296" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="19" fill="#5b6880">${label}</text>` : ''}</svg>`;
}

// ---------- estoque ----------
function stockQuery(q) {
  const f = {
    q: (q.get('q') || '').trim().slice(0, 60), marca: q.get('marca') || '', carroceria: q.get('carroceria') || '',
    preco_min: q.get('preco_min') || '', preco_max: q.get('preco_max') || '', ano_min: q.get('ano_min') || '', km_max: q.get('km_max') || '',
    cambio: q.get('cambio') || '', combustivel: q.get('combustivel') || '', condicao: q.get('condicao') || '', unidade: q.get('unidade') || '',
    ordem: q.get('ordem') || '', pagina: q.get('pagina') || ''
  };
  const where = ["status != 'vendido'"]; const p = [];
  if (f.q) { where.push("(brand || ' ' || model || ' ' || version) LIKE ?"); p.push(`%${f.q}%`); }
  if (f.marca) { where.push('brand = ?'); p.push(f.marca); }
  if (f.carroceria) { where.push('body = ?'); p.push(f.carroceria); }
  if (+f.preco_min) { where.push('price >= ?'); p.push(+f.preco_min); }
  if (+f.preco_max) { where.push('price <= ?'); p.push(+f.preco_max); }
  if (+f.ano_min) { where.push('year_model >= ?'); p.push(+f.ano_min); }
  if (+f.km_max) { where.push('km <= ?'); p.push(+f.km_max); }
  if (f.cambio) { where.push('transmission = ?'); p.push(f.cambio); }
  if (f.combustivel) { where.push('fuel = ?'); p.push(f.combustivel); }
  if (f.condicao === '0km' || f.condicao === 'seminovo') { where.push('condition = ?'); p.push(f.condicao); }
  if (+f.unidade) { where.push('unit_id = ?'); p.push(+f.unidade); }
  const order = { menor_preco: 'price ASC', maior_preco: 'price DESC', recentes: 'id DESC', menor_km: 'km ASC', ano: 'year_model DESC, km ASC' }[f.ordem] || "featured DESC, (status='reservado') ASC, id DESC";
  const W = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM vehicles WHERE ${W}`).get(...p).c;
  const per = 24; const pagesN = Math.max(1, Math.ceil(total / per)); const page = Math.min(pagesN, Math.max(1, +f.pagina || 1));
  const list = all(`SELECT * FROM vehicles WHERE ${W} ORDER BY ${order} LIMIT ${per} OFFSET ${(page - 1) * per}`, ...p);
  const years = db.prepare("SELECT DISTINCT year_model v FROM vehicles WHERE status!='vendido' ORDER BY v DESC").all().map((r) => r.v);
  return { list, total, page, pages: pagesN, f, facets: { brands: distinct('brand'), bodies: distinct('body'), transmissions: distinct('transmission'), fuels: distinct('fuel'), years } };
}

// Alertas "me avise quando chegar" compatíveis com um veículo
function alertMatches(v) {
  if (!v || v.status === 'vendido') return [];
  const out = [];
  for (const l of db.prepare("SELECT id, name, phone, data FROM leads WHERE type='alerta' AND status='novo'").all()) {
    let d = {}; try { d = JSON.parse(l.data || '{}'); } catch {}
    const want = norm(d.wish || '');
    const carText = norm(`${v.brand} ${v.model} ${v.version} ${v.body}`);
    const words = want.split(/\s+/).filter((w) => w.length >= 2);
    const textOk = !words.length || words.every((w) => carText.includes(w));
    const priceOk = !(+d.max_price) || v.price <= +d.max_price;
    if (textOk && priceOk && words.length) out.push({ id: l.id, name: l.name, phone: l.phone });
  }
  return out;
}

// ---------- API do painel da loja ----------
const VEH_FIELDS = ['brand', 'model', 'version', 'year_fab', 'year_model', 'km', 'price', 'price_old', 'fuel', 'transmission', 'body', 'color', 'doors', 'plate_end', 'condition', 'unit_id', 'status', 'featured', 'description', 'options', 'photos'];
const INT_FIELDS = new Set(['year_fab', 'year_model', 'km', 'price', 'price_old', 'doors', 'unit_id', 'featured']);
function cleanVehicle(b) {
  const out = {};
  for (const k of VEH_FIELDS) {
    if (!(k in b)) continue;
    let v = b[k];
    if (INT_FIELDS.has(k)) v = v === '' || v == null ? (k === 'unit_id' ? null : 0) : Math.round(Number(String(v).replace(/\D/g, '')) || 0);
    else if (k === 'options') v = JSON.stringify((Array.isArray(v) ? v : String(v).split(/\n|,/)).map((s) => String(s).trim()).filter(Boolean).slice(0, 80));
    else if (k === 'photos') v = JSON.stringify((Array.isArray(v) ? v : []).filter((s) => /^[a-f0-9]{24}\.(jpg|png|webp)$/.test(s)).slice(0, 40));
    else v = String(v ?? '').slice(0, k === 'description' ? 4000 : 120).trim();
    if (k === 'featured') v = v ? 1 : 0;
    if (k === 'condition' && !['seminovo', '0km'].includes(v)) v = 'seminovo';
    if (k === 'status' && !['disponivel', 'reservado', 'vendido'].includes(v)) v = 'disponivel';
    out[k] = v;
  }
  return out;
}
const vName = (v) => v ? `#${v.id} ${v.brand} ${v.model} ${v.year_model}` : '';

async function adminApi(req, res, url) {
  const p = url.pathname.replace('/api/admin', '');
  const m = req.method;
  if (p === '/login' && m === 'POST') {
    const rl = auth.rateLimited(req, 'admin');
    if (rl.blocked) return json(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos.' });
    const b = await readBody(req, 10e3);
    const u = auth.login(b.username, b.password);
    if (!u) { rl.fail(); return json(res, 401, { error: 'Usuário ou senha incorretos' }); }
    rl.ok();
    stats.audit(u.username, 'login');
    res.setHeader('Set-Cookie', auth.cookieHeader(req, 'ss_admin', auth.makeAdminToken(u.id), 14 * 86400));
    return json(res, 200, { ok: true });
  }
  if (p === '/logout' && m === 'POST') { res.setHeader('Set-Cookie', 'ss_admin=; Path=/; Max-Age=0'); return json(res, 200, { ok: true }); }
  const user = auth.currentUser(req);
  if (!user) return json(res, 401, { error: 'Não autorizado' });
  const manager = user.role === 'gerente';
  const onlyManager = () => json(res, 403, { error: 'Apenas o gerente pode fazer isso.' });
  if (p === '/me') return json(res, 200, { ok: true, user, store: BRAND.name, defaultPassword: auth.defaultPassword && manager });

  // veículos
  if (p === '/vehicles' && m === 'GET') return json(res, 200, all('SELECT * FROM vehicles ORDER BY (status=\'vendido\'), id DESC'));
  if (p === '/vehicles' && m === 'POST') {
    const v = cleanVehicle(await readBody(req));
    if (!v.brand || !v.model) return json(res, 400, { error: 'Marca e modelo são obrigatórios' });
    const keys = Object.keys(v);
    const r = db.prepare(`INSERT INTO vehicles(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map((k) => v[k]));
    const saved = one('SELECT * FROM vehicles WHERE id=?', r.lastInsertRowid);
    stats.audit(user.username, 'veiculo_criado', vName(saved));
    return json(res, 201, { ...saved, matches: alertMatches(saved) });
  }
  let mm = p.match(/^\/vehicles\/(\d+)$/);
  if (mm && m === 'PUT') {
    const before = one('SELECT * FROM vehicles WHERE id=?', +mm[1]);
    const v = cleanVehicle(await readBody(req)); const keys = Object.keys(v);
    if (keys.length) db.prepare(`UPDATE vehicles SET ${keys.map((k) => k + '=?').join(',')}, updated_at=datetime('now') WHERE id=?`).run(...keys.map((k) => v[k]), +mm[1]);
    const saved = one('SELECT * FROM vehicles WHERE id=?', +mm[1]);
    if (before && saved && before.status !== saved.status) stats.audit(user.username, 'veiculo_' + saved.status, vName(saved));
    else stats.audit(user.username, 'veiculo_editado', vName(saved));
    const reopened = before && (before.status === 'vendido') !== (saved.status === 'vendido');
    return json(res, 200, { ...saved, matches: reopened || (before && before.price !== saved.price) ? alertMatches(saved) : [] });
  }
  if (mm && m === 'DELETE') {
    const v = one('SELECT * FROM vehicles WHERE id=?', +mm[1]);
    if (v) { for (const f of v.photos) fs.rm(path.join(UPLOAD_DIR, f), () => {}); db.prepare('DELETE FROM vehicles WHERE id=?').run(v.id); stats.audit(user.username, 'veiculo_excluido', vName(v)); }
    return json(res, 200, { ok: true });
  }
  mm = p.match(/^\/vehicles\/(\d+)\/matches$/);
  if (mm) return json(res, 200, alertMatches(one('SELECT * FROM vehicles WHERE id=?', +mm[1])));
  if (p === '/demo' && m === 'DELETE') {
    if (!manager) return onlyManager();
    for (const v of all('SELECT * FROM vehicles WHERE is_demo=1')) for (const f of v.photos) fs.rm(path.join(UPLOAD_DIR, f), () => {});
    const r = db.prepare('DELETE FROM vehicles WHERE is_demo=1').run();
    stats.audit(user.username, 'exemplos_apagados', `${r.changes} veículos`);
    return json(res, 200, { removed: Number(r.changes) });
  }
  if (p === '/upload' && m === 'POST') {
    const b = await readBody(req);
    const mt = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || ''));
    if (!mt) return json(res, 400, { error: 'Imagem inválida' });
    const buf = Buffer.from(mt[2], 'base64');
    const sig = buf.subarray(0, 4).toString('hex');
    const ok = (mt[1] === 'jpeg' && sig.startsWith('ffd8')) || (mt[1] === 'png' && sig === '89504e47') || (mt[1] === 'webp' && buf.subarray(8, 12).toString() === 'WEBP');
    if (!ok) return json(res, 400, { error: 'Formato não reconhecido' });
    const name = crypto.randomBytes(12).toString('hex') + '.' + (mt[1] === 'jpeg' ? 'jpg' : mt[1]);
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    return json(res, 201, { file: name });
  }

  // lojas e configurações
  if (p === '/units' && m === 'GET') return json(res, 200, db.prepare('SELECT * FROM units ORDER BY sort, id').all());
  mm = p.match(/^\/units\/(\d+)$/);
  if (mm && m === 'PUT') {
    if (!manager) return onlyManager();
    const b = await readBody(req); const f = ['name', 'address', 'neighborhood', 'city', 'phone', 'whatsapp', 'hours'];
    if (b.hours_json != null) {
      const sched = parseSchedule(b.hours_json);
      if (!sched) return json(res, 400, { error: 'Horário inválido. Confira se o horário de fechar é depois do de abrir.' });
      b.hours = hoursText(sched); b.hours_json = JSON.stringify(sched); f.push('hours_json');
    }
    db.prepare(`UPDATE units SET ${f.map((k) => k + '=?').join(',')} WHERE id=?`).run(...f.map((k) => String(b[k] ?? '').slice(0, 400)), +mm[1]);
    stats.audit(user.username, 'loja_editada', `#${mm[1]}`);
    return json(res, 200, db.prepare('SELECT * FROM units WHERE id=?').get(+mm[1]));
  }
  if (p === '/units' && m === 'POST') {
    if (!manager) return onlyManager();
    const sort = (db.prepare('SELECT MAX(sort) s FROM units').get().s || 0) + 1;
    const def = JSON.stringify([...Array(5)].map(() => ({ open: '08:00', close: '18:00' })).concat([{ open: '08:00', close: '12:00' }, null]));
    const r = db.prepare("INSERT INTO units(name, address, neighborhood, city, phone, whatsapp, hours, hours_json, sort) VALUES(?, '', '', '', '', '', ?, ?, ?)").run(`Loja ${sort}`, hoursText(parseSchedule(def)), def, sort);
    stats.audit(user.username, 'loja_criada', `#${r.lastInsertRowid}`);
    return json(res, 201, db.prepare('SELECT * FROM units WHERE id=?').get(r.lastInsertRowid));
  }
  if (mm && m === 'DELETE') {
    if (!manager) return onlyManager();
    if (db.prepare('SELECT COUNT(*) c FROM units').get().c <= 1) return json(res, 400, { error: 'O site precisa ter pelo menos uma loja.' });
    const other = db.prepare('SELECT id FROM units WHERE id!=? ORDER BY sort LIMIT 1').get(+mm[1]);
    db.prepare('UPDATE vehicles SET unit_id=? WHERE unit_id=?').run(other.id, +mm[1]);
    db.prepare('DELETE FROM units WHERE id=?').run(+mm[1]);
    stats.audit(user.username, 'loja_removida', `#${mm[1]}`);
    return json(res, 200, { ok: true });
  }
  if (p === '/settings' && m === 'GET') return json(res, 200, getSettings());
  if (p === '/settings' && m === 'PUT') { if (!manager) return onlyManager(); saveSettings(await readBody(req)); stats.audit(user.username, 'configuracoes'); return json(res, 200, getSettings()); }

  // contatos
  if (p === '/leads' && m === 'GET') {
    const leads = db.prepare('SELECT l.*, v.brand, v.model, v.year_model FROM leads l LEFT JOIN vehicles v ON v.id=l.vehicle_id ORDER BY l.id DESC LIMIT 500').all();
    const stock = all("SELECT * FROM vehicles WHERE status!='vendido'");
    for (const l of leads) {
      if (l.type !== 'alerta' || l.status !== 'novo') continue;
      l.matches = stock.filter((v) => alertMatches(v).some((a) => a.id === l.id)).map((v) => ({ id: v.id, title: `${v.brand} ${v.model} ${v.year_model}`, url: vehicleUrl(v) })).slice(0, 5);
    }
    return json(res, 200, leads);
  }
  mm = p.match(/^\/leads\/(\d+)$/);
  if (mm && m === 'PUT') { const b = await readBody(req); db.prepare('UPDATE leads SET status=? WHERE id=?').run(b.status === 'atendido' ? 'atendido' : 'novo', +mm[1]); return json(res, 200, { ok: true }); }
  if (mm && m === 'DELETE') { db.prepare('DELETE FROM leads WHERE id=?').run(+mm[1]); return json(res, 200, { ok: true }); }

  // números e relatórios
  if (p === '/stats') {
    const g = (sql) => db.prepare(sql).get().c;
    return json(res, 200, {
      available: g("SELECT COUNT(*) c FROM vehicles WHERE status='disponivel'"), reserved: g("SELECT COUNT(*) c FROM vehicles WHERE status='reservado'"),
      sold: g("SELECT COUNT(*) c FROM vehicles WHERE status='vendido'"), newLeads: g("SELECT COUNT(*) c FROM leads WHERE status='novo'"),
      demo: g('SELECT COUNT(*) c FROM vehicles WHERE is_demo=1')
    });
  }
  if (p === '/report') return json(res, 200, stats.report(+url.searchParams.get('dias') || 30));

  // usuários (gerente)
  if (p.startsWith('/users')) {
    if (!manager) return onlyManager();
    if (p === '/users' && m === 'GET') return json(res, 200, db.prepare('SELECT id, name, username, role, active, last_login, created_at FROM users ORDER BY active DESC, name').all());
    if (p === '/users' && m === 'POST') {
      const b = await readBody(req, 10e3);
      const username = norm(b.username).replace(/[^a-z0-9._-]/g, '');
      if (!String(b.name || '').trim() || username.length < 3 || username === 'admin') return json(res, 400, { error: 'Informe nome e um usuário com pelo menos 3 letras (sem espaços).' });
      if (String(b.password || '').length < 6) return json(res, 400, { error: 'A senha precisa ter pelo menos 6 caracteres.' });
      if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return json(res, 400, { error: 'Esse usuário já existe.' });
      db.prepare('INSERT INTO users(name, username, pass_hash, role) VALUES(?,?,?,?)').run(String(b.name).trim().slice(0, 80), username, auth.hashPassword(b.password), b.role === 'gerente' ? 'gerente' : 'vendedor');
      stats.audit(user.username, 'usuario_criado', username);
      return json(res, 201, { ok: true });
    }
    mm = p.match(/^\/users\/(\d+)$/);
    if (mm && m === 'PUT') {
      const b = await readBody(req, 10e3); const id = +mm[1];
      if ('active' in b) db.prepare('UPDATE users SET active=? WHERE id=?').run(b.active ? 1 : 0, id);
      if (b.role) db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role === 'gerente' ? 'gerente' : 'vendedor', id);
      if (b.password) {
        if (String(b.password).length < 6) return json(res, 400, { error: 'A senha precisa ter pelo menos 6 caracteres.' });
        db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(auth.hashPassword(b.password), id);
      }
      stats.audit(user.username, 'usuario_editado', `#${id}`);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'Rota não encontrada' });
  }
  if (p === '/backup' && m === 'GET') {
    if (!manager) return onlyManager();
    stats.audit(user.username, 'backup_baixado');
    return require('./backup').streamBackup(res);
  }
  return json(res, 404, { error: 'Rota não encontrada' });
}

// ---------- API do painel do vendedor do software ----------
async function vendorApi(req, res, url) {
  if (!auth.vendorEnabled()) return json(res, 404, { error: 'Rota não encontrada' });
  const p = url.pathname.replace('/api/suporte', '');
  if (p === '/login' && req.method === 'POST') {
    const rl = auth.rateLimited(req, 'vendor');
    if (rl.blocked) return json(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos.' });
    const b = await readBody(req, 10e3);
    if (!auth.vendorLogin(b.password)) { rl.fail(); return json(res, 401, { error: 'Senha incorreta' }); }
    rl.ok();
    res.setHeader('Set-Cookie', auth.cookieHeader(req, 'ss_vendor', auth.makeVendorToken(), 7 * 86400));
    return json(res, 200, { ok: true });
  }
  if (p === '/logout' && req.method === 'POST') { res.setHeader('Set-Cookie', 'ss_vendor=; Path=/; Max-Age=0'); return json(res, 200, { ok: true }); }
  if (!auth.isVendor(req)) return json(res, 401, { error: 'Não autorizado' });
  if (p === '/resumo') return json(res, 200, { report: stats.report(+url.searchParams.get('dias') || 30), system: system.info() });
  return json(res, 404, { error: 'Rota não encontrada' });
}

// ---------- rotas ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  let p; try { p = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Endereço inválido', 'text/plain'); }

  if (p.startsWith('/static/')) { if (serveFile(res, PUBLIC_DIR, p.slice(8), 'public, max-age=3600')) return; return send(res, 404, 'Não encontrado', 'text/plain'); }
  if (p.startsWith('/uploads/')) { if (serveFile(res, UPLOAD_DIR, p.slice(9), 'public, max-age=31536000, immutable')) return; return send(res, 404, 'Não encontrado', 'text/plain'); }
  if (p.startsWith('/api/admin')) return adminApi(req, res, url);
  if (p.startsWith('/api/suporte')) return vendorApi(req, res, url);
  if (p === '/admin' || p === '/admin/') return serveFile(res, PUBLIC_DIR, 'admin/index.html', 'no-store');
  if (p === '/suporte' || p === '/suporte/') {
    if (!auth.vendorEnabled()) return send(res, 404, pages.notFound(ctx()));
    return serveFile(res, PUBLIC_DIR, 'suporte/index.html', 'no-store', { 'X-Robots-Tag': 'noindex, nofollow' });
  }

  if (p === '/api/leads' && req.method === 'POST') {
    const b = await readBody(req, 20e3);
    if (b.website) return json(res, 200, { ok: true }); // honeypot
    if (!String(b.name || '').trim() || String(b.phone || '').replace(/\D/g, '').length < 10) return json(res, 400, { error: 'Informe nome e WhatsApp com DDD.' });
    const type = ['troca', 'contato', 'financiamento', 'alerta'].includes(b.type) ? b.type : 'contato';
    if (type === 'alerta' && !String(b.wish || '').trim()) return json(res, 400, { error: 'Conte qual carro você procura.' });
    const extra = {}; for (const k of ['car_brand', 'car_model', 'car_year', 'car_km', 'wish', 'max_price']) if (b[k]) extra[k] = String(b[k]).slice(0, 80);
    if (extra.max_price) extra.max_price = String(parseInt(String(extra.max_price).replace(/\D/g, ''), 10) || '');
    db.prepare('INSERT INTO leads(type,name,phone,email,message,vehicle_id,unit_id,data) VALUES(?,?,?,?,?,?,?,?)')
      .run(type, String(b.name).slice(0, 100), String(b.phone).slice(0, 30), String(b.email || '').slice(0, 100), String(b.message || '').slice(0, 2000), +b.vehicle_id || null, +b.unit_id || null, JSON.stringify(extra));
    stats.trackEvent('lead', type);
    const unit = db.prepare('SELECT whatsapp FROM units WHERE id=?').get(+b.unit_id || 0) || db.prepare('SELECT whatsapp FROM units ORDER BY sort LIMIT 1').get();
    return json(res, 201, { ok: true, whatsapp: unit ? unit.whatsapp.replace(/\D/g, '') : '' });
  }
  // eventos do site (clique no WhatsApp)
  if (p === '/api/evt' && req.method === 'POST') {
    const b = await readBody(req, 2e3).catch(() => ({}));
    if (!stats.isBot(req) && !auth.currentUser(req) && b.t === 'wa') {
      const vid = parseInt(b.v, 10);
      stats.trackEvent('wa', vid > 0 ? vid : 'geral');
      if (vid > 0) db.prepare('UPDATE vehicles SET contacts=contacts+1 WHERE id=?').run(vid);
    }
    return json(res, 200, { ok: true });
  }

  let m = p.match(/^\/placeholder\/(\d+)\.svg$/);
  if (m) { const v = db.prepare('SELECT brand, model FROM vehicles WHERE id=?').get(+m[1]); return send(res, 200, placeholderSvg(v), 'image/svg+xml', { 'Cache-Control': 'public, max-age=3600' }); }

  if (p === '/robots.txt') return send(res, 200, `User-agent: *\nDisallow: /admin\nDisallow: /suporte\nDisallow: /api/\nDisallow: /favoritos\nDisallow: /comparar\nSitemap: ${(getSettings().site_url || `https://${req.headers.host}`).replace(/\/$/, '')}/sitemap.xml\n`, 'text/plain');
  if (p === '/sitemap.xml') {
    const base = (getSettings().site_url || `https://${req.headers.host}`).replace(/\/$/, '');
    const urls = ['/', '/estoque', '/estoque?condicao=seminovo', '/estoque?condicao=0km', '/venda-seu-carro', '/lojas', '/privacidade', ...all("SELECT * FROM vehicles WHERE status!='vendido'").map(vehicleUrl)];
    return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${esc(base + u)}</loc></url>`).join('')}</urlset>`, 'application/xml');
  }
  if (p === '/health') return send(res, 200, 'ok', 'text/plain');
  if (p === '/theme.css') {
    const c = BRAND.colors;
    return send(res, 200, `:root{--navy:${c.dark};--blue:${c.primary};--blue-2:${c.primary2};--red:${c.accent};--red-2:${c.accent2};--accent-soft:${c.accentSoft};--accent-bright:${c.accentBright};--hero-1:${c.hero1};--hero-2:${c.hero2};--hero-3:${c.hero3};--hero-glow:${c.heroGlow};--footer:${c.footer};--on-dark-muted:${c.onDarkMuted}}`, 'text/css; charset=utf-8', { 'Cache-Control': 'public, max-age=600' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método não permitido', 'text/plain');
  const c = ctx();
  const H = { 'Cache-Control': 'no-cache' };
  const staff = !!auth.currentUser(req);
  const track = (type, vid) => { if (!staff) stats.trackPage(req, url, type, vid); };

  if (p === '/') {
    track('Início');
    const featured = all("SELECT * FROM vehicles WHERE featured=1 AND status!='vendido' ORDER BY id DESC LIMIT 4");
    const latest = all("SELECT * FROM vehicles WHERE status!='vendido' ORDER BY id DESC LIMIT 8");
    const total = db.prepare("SELECT COUNT(*) c FROM vehicles WHERE status!='vendido'").get().c;
    return send(res, 200, pages.home(c, { featured, latest, brands: distinct('brand'), bodies: distinct('body'), total }), undefined, H);
  }
  if (p === '/estoque') {
    track('Estoque');
    const q = stockQuery(url.searchParams);
    if (!staff && !stats.isBot(req) && (q.f.marca || q.f.q) && !q.f.pagina) stats.trackEvent('search', `${q.f.marca} ${q.f.q}`.trim());
    return send(res, 200, pages.stock(c, q), undefined, H);
  }
  m = p.match(/^\/veiculo\/(\d+)(?:-[a-z0-9-]*)?$/);
  if (m) {
    const v = one('SELECT * FROM vehicles WHERE id=?', +m[1]);
    if (!v) return send(res, 404, pages.notFound(c));
    if (p !== vehicleUrl(v)) { res.writeHead(301, { Location: vehicleUrl(v) }); return res.end(); }
    track('Veículo', v.id);
    if (!staff && !stats.isBot(req)) db.prepare('UPDATE vehicles SET views=views+1 WHERE id=?').run(v.id);
    const similar = all(`SELECT * FROM vehicles WHERE id!=? AND status!='vendido' ORDER BY (body=?) DESC, ABS(price-?) ASC LIMIT 4`, v.id, v.body, v.price);
    return send(res, 200, pages.vehicle(c, v, similar), undefined, H);
  }
  if (p === '/venda-seu-carro') {
    track('Venda seu carro');
    const vid = +url.searchParams.get('veiculo');
    return send(res, 200, pages.sell(c, vid ? one('SELECT * FROM vehicles WHERE id=?', vid) : null), undefined, H);
  }
  if (p === '/lojas') { track('Nossas lojas'); return send(res, 200, pages.stores(c), undefined, H); }
  if (p === '/privacidade') { track('Privacidade'); return send(res, 200, pages.privacy(c), undefined, H); }
  if (p === '/favoritos' || p === '/comparar') {
    const ids = idList(url.searchParams.get('ids'));
    const list = ids.length ? all(`SELECT * FROM vehicles WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids) : [];
    list.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    track(p === '/favoritos' ? 'Favoritos' : 'Comparar');
    return send(res, 200, p === '/favoritos' ? pages.favorites(c, list) : pages.compare(c, list.slice(0, 3)), undefined, { ...H, 'X-Robots-Tag': 'noindex' });
  }
  return send(res, 404, pages.notFound(c));
}

http.createServer((req, res) => {
  const t0 = Date.now();
  res.on('finish', () => system.countResponse(res.statusCode, Date.now() - t0));
  handle(req, res).catch((e) => {
    if (!e.status || e.status >= 500) { console.error(e); system.logError(e, req.url); }
    if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Erro interno' });
    else res.end();
  });
}).listen(PORT, () => {
  console.log(`${BRAND.name} rodando em http://localhost:${PORT}`);
  if (!auth.vendorEnabled()) console.log('[suporte] painel do vendedor desativado (defina VENDOR_PASSWORD com 8+ caracteres para ativar)');
  require('./demo-photos').fetchDemoPhotos().catch((e) => console.warn('[fotos-exemplo]', e.message));
});
