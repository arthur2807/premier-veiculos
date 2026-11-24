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

db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS internal (key TEXT PRIMARY KEY, value TEXT);`);

const IS_PROD = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.NODE_ENV === 'production');
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
const VENDOR_PASSWORD = process.env.VENDOR_PASSWORD || '';
// Nomes de usuário dos acessos definidos por variável de ambiente
const ADMIN_USERNAME = String(process.env.ADMIN_USER || 'admin').trim().toLowerCase();
const VENDOR_USERNAME = String(process.env.VENDOR_USER || 'suporte').trim().toLowerCase();
// Em produção, o acesso "admin" só funciona com uma senha própria (8+ caracteres, diferente da padrão).
// O site público continua no ar; só o login "admin" fica bloqueado até a variável ser definida.
const adminLoginBlocked = IS_PROD && (ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8);
if (adminLoginBlocked) console.error('[SEGURANÇA] ADMIN_PASSWORD ausente, fraca ou igual à padrão. O login "admin" está BLOQUEADO até você definir ADMIN_PASSWORD (8+ caracteres) no Railway.');
else if (!process.env.ADMIN_PASSWORD) console.warn('[aviso] ADMIN_PASSWORD não definido; usando a senha padrão "admin123" (só funciona fora de produção).');

const internalGet = (k) => { const r = db.prepare('SELECT value FROM internal WHERE key=?').get(k); return r ? r.value : null; };
const internalSet = (k, v) => db.prepare('INSERT INTO internal(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v);

// Segredo para assinar o token do /suporte: SESSION_SECRET ou um valor aleatório guardado no banco (nunca derivado da senha)
let SECRET = process.env.SESSION_SECRET;
if (!SECRET) { SECRET = internalGet('session_secret'); if (!SECRET) { SECRET = crypto.randomBytes(32).toString('hex'); internalSet('session_secret', SECRET); } }

// Se a senha do admin mudou desde a última inicialização, derruba as sessões abertas do admin
const adminPwHash = crypto.createHash('sha256').update('admin-pw:' + ADMIN_PASSWORD).digest('hex');
if (internalGet('admin_pw_hash') !== adminPwHash) { db.prepare('DELETE FROM sessions WHERE user_id=0').run(); internalSet('admin_pw_hash', adminPwHash); }

const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

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
    const i = part.indexOf('='); if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {} }
  }
  return out;
}
function cookieHeader(req, name, value, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

/** IP real do visitante. O Railway acrescenta o IP de quem conectou no FIM do X-Forwarded-For;
 *  os primeiros valores podem ser inventados pelo próprio visitante. */
function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : (req.socket.remoteAddress || '');
}

// ---- loja (gerente / vendedor): sessões guardadas no banco, podem ser revogadas ----
const SESSION_DAYS = 14;
/** Cria uma sessão e devolve o valor do cookie. No banco fica só o hash. */
function createSession(uid) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(id, user_id, expires_at) VALUES(?,?,?)').run(sha(token), uid, Date.now() + SESSION_DAYS * 86400e3);
  return token;
}
function destroySession(req) { const t = cookies(req).ss_admin; if (t) db.prepare('DELETE FROM sessions WHERE id=?').run(sha(t)); }
/** Encerra todas as sessões de um usuário (troca de senha, desativação). */
function revokeUser(uid) { db.prepare('DELETE FROM sessions WHERE user_id=?').run(uid); }
setInterval(() => { try { db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()); } catch {} }, 3600e3).unref();

const ADMIN_USER = { id: 0, name: 'Administrador', username: ADMIN_USERNAME, role: 'gerente' };
/** Retorna {id, name, username, role} do usuário logado no painel da loja, ou null. */
function currentUser(req) {
  const t = cookies(req).ss_admin; if (!t || t.length > 100) return null;
  const s = db.prepare('SELECT user_id, expires_at FROM sessions WHERE id=?').get(sha(t));
  if (!s || s.expires_at < Date.now()) return null;
  if (s.user_id === 0) return adminLoginBlocked ? null : ADMIN_USER;
  const u = db.prepare('SELECT id, name, username, role, active FROM users WHERE id=?').get(s.user_id);
  return u && u.active ? u : null;
}
/** Confere usuário e senha (os dois obrigatórios). O usuário principal (ADMIN_USER, padrão "admin") usa ADMIN_PASSWORD. */
function login(username, password) {
  const un = String(username || '').trim().toLowerCase();
  if (!un || !password) return null;
  const raw = String(password), trimmed = raw.trim();
  if (un === ADMIN_USERNAME) return !adminLoginBlocked && (safeEq(raw, ADMIN_PASSWORD) || safeEq(trimmed, ADMIN_PASSWORD)) ? ADMIN_USER : null;
  const u = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(un);
  // senhas novas são gravadas sem espaços nas pontas; as antigas podem ter sido gravadas com eles
  if (!u || !(checkPassword(trimmed, u.pass_hash) || (trimmed !== raw && checkPassword(raw, u.pass_hash)))) return null;
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
/** Login do painel /suporte: usuário VENDOR_USER (padrão "suporte") e senha VENDOR_PASSWORD. */
const vendorLogin = (username, pw) => {
  if (!vendorEnabled()) return false;
  const userOk = safeEq(String(username || '').trim().toLowerCase(), VENDOR_USERNAME);
  const pwOk = safeEq(String(pw || ''), VENDOR_PASSWORD) || safeEq(String(pw || '').trim(), VENDOR_PASSWORD);
  return userOk && pwOk;
};

// limite de tentativas de login por IP
const tries = new Map();
function rateLimited(req, key) {
  const ip = clientIp(req) + ':' + key;
  const t = tries.get(ip) || { n: 0, at: Date.now() };
  if (Date.now() - t.at > 15 * 60e3) { t.n = 0; t.at = Date.now(); }
  tries.set(ip, t);
  return { blocked: t.n >= 10, fail: () => { t.n++; }, ok: () => tries.delete(ip) };
}

/** Limite simples por IP: até `max` chamadas a cada `windowMs`. Retorna true se passou do limite. */
const hits = new Map();
function throttled(req, key, max, windowMs) {
  const k = clientIp(req) + ':' + key; const now = Date.now();
  let h = hits.get(k);
  if (!h || now - h.at > windowMs) { h = { n: 0, at: now }; hits.set(k, h); }
  h.n++;
  return h.n > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of tries) if (now - t.at > 15 * 60e3) tries.delete(k);
  for (const [k, h] of hits) if (now - h.at > 3600e3) hits.delete(k);
}, 10 * 60e3).unref();

module.exports = { hashPassword, checkPassword, cookies, cookieHeader, clientIp, createSession, destroySession, revokeUser, currentUser, login, makeVendorToken, isVendor, vendorLogin, vendorEnabled, rateLimited, throttled, defaultPassword: !process.env.ADMIN_PASSWORD, adminLoginBlocked, ADMIN_USERNAME, VENDOR_USERNAME };
