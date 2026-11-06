'use strict';
// Informações de saúde do sistema para o painel do vendedor do software.
const fs = require('node:fs');
const path = require('node:path');
const { db, DATA_DIR, UPLOAD_DIR } = require('./db');

const STARTED = Date.now();
const errors = []; // últimos erros do servidor (sem dados pessoais)
const reqStats = { total: 0, s5xx: 0, s4xx: 0, slow: 0 };

function logError(e, pathName) {
  errors.unshift({ at: new Date().toISOString(), path: String(pathName || '').slice(0, 120), message: String(e && e.message || e).slice(0, 300) });
  if (errors.length > 50) errors.length = 50;
}
function countResponse(status, ms) {
  reqStats.total++;
  if (status >= 500) reqStats.s5xx++; else if (status >= 400) reqStats.s4xx++;
  if (ms > 1500) reqStats.slow++;
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
    storage: { dbBytes, uploads: dirSize(UPLOAD_DIR), disk, persistent: !!process.env.DATA_DIR },
    requests: { ...reqStats },
    errors: errors.slice(0, 20),
    config: {
      adminPasswordSet: !!process.env.ADMIN_PASSWORD,
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

module.exports = { info, logError, countResponse };
