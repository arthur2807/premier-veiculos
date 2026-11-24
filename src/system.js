'use strict';
// Informações de saúde e uso do sistema para o painel do proprietário do software (/suporte).
// Nada aqui expõe dados pessoais de clientes da loja.
const fs = require('node:fs');
const path = require('node:path');
const { db, DATA_DIR, UPLOAD_DIR } = require('./db');
const { today, dayOffset } = require('./analytics');
const { ROLES, roleOf } = require('./roles');

db.exec(`CREATE TABLE IF NOT EXISTS sys_errors (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT DEFAULT (datetime('now')), path TEXT, message TEXT);`);

const STARTED = Date.now();
const reqStats = { total: 0, s5xx: 0, s4xx: 0, slow: 0 }; // desde o último reinício
const pending = { sys_req: 0, sys_4xx: 0, sys_5xx: 0, sys_slow: 0, sys_ms: 0 }; // ainda não gravado no banco
const latencies = []; // últimas 2000 respostas, para mediana e p95

const bump = db.prepare('INSERT INTO stats_daily(day,metric,key,n) VALUES(?,?,?,?) ON CONFLICT(day,metric,key) DO UPDATE SET n=n+excluded.n');
function flush() {
  try {
    const day = today();
    for (const [k, n] of Object.entries(pending)) { if (n) bump.run(day, k, '', Math.round(n)); pending[k] = 0; }
  } catch (e) { console.warn('[sistema]', e.message); }
}
setInterval(flush, 60e3).unref();
process.once('SIGTERM', () => { flush(); process.exit(0); });
process.once('SIGINT', () => { flush(); process.exit(0); });
try { bump.run(today(), 'sys_start', '', 1); } catch {}

function logError(e, pathName) {
  try {
    db.prepare('INSERT INTO sys_errors(path, message) VALUES(?,?)').run(String(pathName || '').split('?')[0].slice(0, 120), String((e && e.message) || e).slice(0, 300));
    db.prepare('DELETE FROM sys_errors WHERE id <= (SELECT MAX(id) - 300 FROM sys_errors)').run();
  } catch {}
}
function countResponse(status, ms) {
  reqStats.total++; pending.sys_req++; pending.sys_ms += ms;
  if (status >= 500) { reqStats.s5xx++; pending.sys_5xx++; } else if (status >= 400) { reqStats.s4xx++; pending.sys_4xx++; }
  if (ms > 1500) { reqStats.slow++; pending.sys_slow++; }
  latencies.push(ms); if (latencies.length > 2000) latencies.shift();
}
function percentile(p) {
  if (!latencies.length) return null;
  const s = latencies.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))];
}

function dirSize(dir) {
  let n = 0, bytes = 0;
  try { for (const f of fs.readdirSync(dir)) { const st = fs.statSync(path.join(dir, f)); if (st.isFile()) { n++; bytes += st.size; } } } catch {}
  return { files: n, bytes };
}

function info() {
  const dbFile = path.join(DATA_DIR, 'loja.db');
  let dbBytes = 0; try { dbBytes = fs.statSync(dbFile).size + (fs.existsSync(dbFile + '-wal') ? fs.statSync(dbFile + '-wal').size : 0); } catch {}
  let disk = null;
  try { const s = fs.statfsSync(DATA_DIR); disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; } catch {}
  const g = (sql, ...p) => db.prepare(sql).get(...p);
  const mem = process.memoryUsage();
  return {
    version: require('../package.json').version,
    commit: (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7),
    commitMessage: (process.env.RAILWAY_GIT_COMMIT_MESSAGE || '').split('\n')[0].slice(0, 120),
    deployment: process.env.RAILWAY_DEPLOYMENT_ID || '',
    domain: process.env.RAILWAY_PUBLIC_DOMAIN || '',
    node: process.version,
    startedAt: new Date(STARTED).toISOString(),
    uptimeSec: Math.round((Date.now() - STARTED) / 1000),
    memoryMB: Math.round(mem.rss / 1048576),
    latency: { p50: percentile(50), p95: percentile(95), samples: latencies.length },
    storage: { dbBytes, uploads: dirSize(UPLOAD_DIR), thumbs: dirSize(path.join(UPLOAD_DIR, 'thumbs')), disk, persistent: !!process.env.DATA_DIR },
    requests: { ...reqStats },
    errors: db.prepare('SELECT at, path, message FROM sys_errors ORDER BY id DESC LIMIT 20').all(),
    errorsSinceStart: g('SELECT COUNT(*) c FROM sys_errors WHERE at >= ?', new Date(STARTED).toISOString().slice(0, 19).replace('T', ' ')).c,
    billing: (() => { const b = require('./billing').state(); return { status: b.effective, deadline: b.deadline, autoSuspended: b.autoSuspended }; })(),
    config: {
      adminPasswordSet: !!process.env.ADMIN_PASSWORD,
      adminLoginBlocked: require('./auth').adminLoginBlocked,
      sessionSecretSet: !!process.env.SESSION_SECRET,
      dataDirSet: !!process.env.DATA_DIR,
      siteUrl: g("SELECT value v FROM settings WHERE key='site_url'")?.v || '',
      gaId: g("SELECT value v FROM settings WHERE key='ga_id'")?.v || ''
    },
    content: {
      vehicles: g("SELECT COUNT(*) c FROM vehicles WHERE status!='vendido'").c,
      sold: g("SELECT COUNT(*) c FROM vehicles WHERE status='vendido'").c,
      demo: g('SELECT COUNT(*) c FROM vehicles WHERE is_demo=1').c,
      withoutPhotos: g("SELECT COUNT(*) c FROM vehicles WHERE status!='vendido' AND photos='[]'").c,
      users: g('SELECT COUNT(*) c FROM users WHERE active=1').c,
      leadsTotal: g('SELECT COUNT(*) c FROM leads').c,
      leadsOpen: g("SELECT COUNT(*) c FROM leads WHERE status='novo'").c,
      unitsMissingHours: g("SELECT COUNT(*) c FROM units WHERE hours=''").c
    },
    activity: {
      lastLogin: g("SELECT at FROM audit WHERE action='login' ORDER BY id DESC LIMIT 1")?.at || null,
      logins30: g("SELECT COUNT(*) c FROM audit WHERE action='login' AND at > datetime('now','-30 days')").c,
      vehicleChanges30: g("SELECT COUNT(*) c FROM audit WHERE action LIKE 'veiculo_%' AND at > datetime('now','-30 days')").c,
      lastVehicleChange: g('SELECT MAX(updated_at) m FROM vehicles WHERE is_demo=0').m || null,
      recent: db.prepare('SELECT at, actor, action, detail FROM audit ORDER BY id DESC LIMIT 25').all()
    }
  };
}

/** Série diária do servidor e indicadores de uso e de negócio no período. */
function report(days = 30) {
  flush();
  days = Math.max(1, Math.min(365, Math.round(days) || 30));
  const from = dayOffset(days - 1), to = today();
  // audit.at está em UTC; o período é no fuso de João Pessoa
  const fromUtc = `${from} 03:00:00`;
  const byDay = {};
  for (const r of db.prepare("SELECT day, metric, SUM(n) n FROM stats_daily WHERE metric LIKE 'sys_%' AND day BETWEEN ? AND ? GROUP BY day, metric").all(from, to)) (byDay[r.day] ||= {})[r.metric] = r.n;
  const errByDay = Object.fromEntries(db.prepare("SELECT date(at,'-3 hours') d, COUNT(*) n FROM sys_errors WHERE date(at,'-3 hours') BETWEEN ? AND ? GROUP BY 1").all(from, to).map((r) => [r.d, r.n]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dayOffset(i), x = byDay[d] || {};
    series.push({ day: d, requests: x.sys_req || 0, errors: x.sys_5xx || 0, notFound: x.sys_4xx || 0, slow: x.sys_slow || 0, avgMs: x.sys_req ? Math.round(x.sys_ms / x.sys_req) : 0, restarts: x.sys_start || 0, logged: errByDay[d] || 0 });
  }
  const sum = (k) => series.reduce((a, s) => a + s[k], 0);
  const totalMs = series.reduce((a, s) => a + s.avgMs * s.requests, 0);
  const server = { requests: sum('requests'), errors: sum('errors'), notFound: sum('notFound'), slow: sum('slow'), restarts: sum('restarts'), avgMs: sum('requests') ? Math.round(totalMs / sum('requests')) : 0 };
  server.uptimePct = server.requests ? Math.max(0, 100 - server.errors / server.requests * 100) : 100;

  // uso do painel por perfil
  const users = db.prepare('SELECT username, role, active, last_login FROM users').all();
  const roleByUser = Object.fromEntries(users.map((u) => [u.username, roleOf(u.role)]));
  roleByUser[require('./auth').ADMIN_USERNAME] = 'gerente';
  const actions = db.prepare('SELECT actor, action, COUNT(*) n, MAX(at) last FROM audit WHERE at >= ? GROUP BY actor, action').all(fromUtc);
  const perRole = Object.fromEntries(Object.keys(ROLES).map((k) => [k, { role: k, label: ROLES[k].label, users: 0, activeUsers: 0, logins: 0, actions: 0 }]));
  for (const u of users) if (u.active) perRole[roleOf(u.role)].users++;
  perRole.gerente.users++; // o acesso principal (ADMIN_USER)
  for (const a of actions) if (a.action === 'login' && a.actor !== require('./auth').VENDOR_USERNAME) perRole[roleByUser[a.actor] || 'vendedor'].activeUsers++; // uma linha por pessoa que entrou
  const perUser = {};
  const vendorName = require('./auth').VENDOR_USERNAME;
  for (const a of actions) {
    if (a.actor === vendorName) { // ações feitas pelo suporte (você) não contam como uso da loja
      const pu = (perUser[a.actor] ||= { actor: a.actor, role: 'Suporte', logins: 0, actions: 0, last: '' });
      pu.actions += a.n; if (a.last > pu.last) pu.last = a.last; continue;
    }
    const r = roleByUser[a.actor] || 'vendedor';
    if (a.action === 'login') perRole[r].logins += a.n; else perRole[r].actions += a.n;
    const pu = (perUser[a.actor] ||= { actor: a.actor, role: ROLES[r].label, logins: 0, actions: 0, last: '' });
    if (a.action === 'login') pu.logins += a.n; else pu.actions += a.n;
    if (a.last > pu.last) pu.last = a.last;
  }
  const actionCount = (act) => actions.filter((a) => a.action === act).reduce((s, a) => s + a.n, 0);

  // negócio (sem dados pessoais)
  const g = (sql, ...p) => db.prepare(sql).get(...p);
  const stock = g("SELECT COUNT(*) n, COALESCE(SUM(price),0) total, COALESCE(AVG(price),0) avg, COALESCE(AVG(julianday('now') - julianday(created_at)),0) age FROM vehicles WHERE status!='vendido' AND is_demo=0");
  const soldTime = g("SELECT COALESCE(AVG(julianday(updated_at) - julianday(created_at)),0) d, COUNT(*) n FROM vehicles WHERE status='vendido' AND is_demo=0");
  const leadTypes = db.prepare("SELECT type key, COUNT(*) n FROM leads WHERE date(created_at,'-3 hours') BETWEEN ? AND ? GROUP BY type ORDER BY n DESC").all(from, to);
  const leadsAnswered = g("SELECT COUNT(*) n FROM leads WHERE status='atendido' AND date(created_at,'-3 hours') BETWEEN ? AND ?", from, to).n;
  const sumMetric = (m) => g('SELECT COALESCE(SUM(n),0) n FROM stats_daily WHERE metric=? AND day BETWEEN ? AND ?', m, from, to).n;
  const funnel = {
    visitors: g('SELECT COUNT(*) n FROM stats_visitors WHERE day BETWEEN ? AND ?', from, to).n,
    vehicleViewers: sumMetric('vehicle_uv'),
    contacts: sumMetric('wa') + sumMetric('call') + leadTypes.filter((l) => l.key !== 'alerta').reduce((a, l) => a + l.n, 0),
    shares: sumMetric('share')
  };
  const business = {
    stockCount: stock.n, stockValue: stock.total, avgPrice: Math.round(stock.avg), avgAgeDays: Math.round(stock.age),
    avgDaysToSell: soldTime.n ? Math.round(soldTime.d) : null,
    listed: actionCount('veiculo_criado'), sold: actionCount('veiculo_vendido'), reserved: actionCount('veiculo_reservado'),
    leadTypes, leadsTotal: leadTypes.reduce((a, l) => a + l.n, 0), leadsAnswered
  };

  return { days, from, to, series, server, roles: Object.values(perRole), users: Object.values(perUser).sort((a, b) => b.actions + b.logins - a.actions - a.logins), funnel, business };
}

module.exports = { info, report, logError, countResponse };
