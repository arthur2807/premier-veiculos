'use strict';
const crypto = require('node:crypto');
const { db } = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'vendedor',
  active INTEGER NOT NULL DEFAULT 1,
  last_login TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);`);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const VENDOR_PASSWORD = process.env.VENDOR_PASSWORD || '';
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('ss-' + ADMIN_PASSWORD).digest('hex');
if (!process.env.ADMIN_PASSWORD) console.warn('[aviso] ADMIN_PASSWORD não definido; usando a senha padrão "admin123". Defina no Railway!');

const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(String(pw), salt, 32).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [salt, h] = String(stored).split(':'); if (!salt || !h) return false;
  return safeEq(crypto.scryptSync(String(pw), salt, 32).toString('hex'), h);
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function cookieHeader(req, name, value, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

// ---- loja (gerente / vendedor) ----
function makeAdminToken(uid) { const exp = Date.now() + 14 * 86400e3; return `${exp}.${uid}.${sign(`admin:${uid}:${exp}`)}`; }
/** Retorna {id, name, username, role} do usuário logado no painel da loja, ou null. */
function currentUser(req) {
  const t = cookies(req).ss_admin; if (!t) return null;
  const [exp, uid, sig] = t.split('.');
  if (!exp || uid == null || !sig || Number(exp) < Date.now() || !safeEq(sig, sign(`admin:${uid}:${exp}`))) return null;
  if (uid === '0') return { id: 0, name: 'Administrador', username: 'admin', role: 'gerente' };
  const u = db.prepare('SELECT id, name, username, role, active FROM users WHERE id=?').get(+uid);
  return u && u.active ? u : null;
}
/** Confere usuário e senha. Usuário vazio ou "admin" usa a senha principal (ADMIN_PASSWORD). */
function login(username, password) {
  const un = String(username || '').trim().toLowerCase();
  if (!un || un === 'admin') return safeEq(password, ADMIN_PASSWORD) ? { id: 0, name: 'Administrador', username: 'admin', role: 'gerente' } : null;
  const u = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(un);
  if (!u || !checkPassword(password, u.pass_hash)) return null;
  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(u.id);
  return { id: u.id, name: u.name, username: u.username, role: u.role };
}

// ---- vendedor do software (painel /suporte) ----
const vendorEnabled = () => VENDOR_PASSWORD.length >= 8;
function makeVendorToken() { const exp = Date.now() + 7 * 86400e3; return `${exp}.${sign(`vendor:${exp}`)}`; }
function isVendor(req) {
  if (!vendorEnabled()) return false;
  const t = cookies(req).ss_vendor; if (!t) return false;
  const [exp, sig] = t.split('.');
  return !!exp && !!sig && Number(exp) > Date.now() && safeEq(sig, sign(`vendor:${exp}`));
}
const vendorLogin = (pw) => vendorEnabled() && safeEq(pw, VENDOR_PASSWORD);

// limite de tentativas de login por IP
const tries = new Map();
function rateLimited(req, key) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim() + ':' + key;
  const t = tries.get(ip) || { n: 0, at: Date.now() };
  if (Date.now() - t.at > 15 * 60e3) { t.n = 0; t.at = Date.now(); }
  tries.set(ip, t);
  return { blocked: t.n >= 10, fail: () => { t.n++; }, ok: () => tries.delete(ip) };
}

module.exports = { hashPassword, checkPassword, cookies, cookieHeader, makeAdminToken, currentUser, login, makeVendorToken, isVendor, vendorLogin, vendorEnabled, rateLimited, defaultPassword: !process.env.ADMIN_PASSWORD };
