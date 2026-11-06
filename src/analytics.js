'use strict';
// Estatísticas próprias, sem cookies: contagens diárias agregadas e visitantes únicos por hash diário
// (IP + navegador + dia + segredo). Nenhum dado pessoal é guardado.
const crypto = require('node:crypto');
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS stats_daily (day TEXT NOT NULL, metric TEXT NOT NULL, key TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day, metric, key));
CREATE TABLE IF NOT EXISTS stats_visitors (day TEXT NOT NULL, h TEXT NOT NULL, PRIMARY KEY(day, h));
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT DEFAULT (datetime('now')), actor TEXT, action TEXT, detail TEXT DEFAULT '');
`);

const SALT = process.env.SESSION_SECRET || 'ss-stats';
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|httpclient|headless|lighthouse|monitor|uptime|scan/i;
const bump = db.prepare('INSERT INTO stats_daily(day,metric,key,n) VALUES(?,?,?,1) ON CONFLICT(day,metric,key) DO UPDATE SET n=n+1');
const addVisitor = db.prepare('INSERT OR IGNORE INTO stats_visitors(day,h) VALUES(?,?)');

// Dia no fuso UTC-3 (, sem horário de verão)
const today = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const dayOffset = (d) => new Date(Date.now() - 3 * 3600e3 - d * 86400e3).toISOString().slice(0, 10);

function isBot(req) { const ua = req.headers['user-agent'] || ''; return !ua || BOT.test(ua); }

function sourceOf(req, url) {
  const utm = (url.searchParams.get('utm_source') || '').toLowerCase();
  if (utm) return utm.includes('insta') ? 'Instagram' : utm.includes('face') || utm === 'fb' ? 'Facebook' : utm.includes('google') ? 'Google' : utm.includes('whats') ? 'WhatsApp' : utm.includes('olx') ? 'OLX' : 'Outros';
  const ref = req.headers.referer || '';
  if (!ref) return 'Direto';
  let host = ''; try { host = new URL(ref).hostname.replace(/^www\./, ''); } catch { return 'Direto'; }
  if (host === (req.headers.host || '').split(':')[0]) return null; // navegação interna
  if (/google\./.test(host)) return 'Google';
  if (/instagram\./.test(host)) return 'Instagram';
  if (/facebook\.|fb\.com|fb\.me/.test(host)) return 'Facebook';
  if (/whatsapp|wa\.me/.test(host)) return 'WhatsApp';
  if (/bing\.|yahoo\.|duckduckgo/.test(host)) return 'Outros buscadores';
  if (/olx\.|webmotors|icarros|mercadolivre/.test(host)) return 'Portais de veículos';
  return 'Outros sites';
}

/** Registra uma visualização de página pública. */
function trackPage(req, url, pageType, vehicleId) {
  try {
    if (isBot(req)) return;
    const day = today();
    bump.run(day, 'pv', pageType);
    if (vehicleId) bump.run(day, 'vehicle_view', String(vehicleId));
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const h = crypto.createHash('sha256').update(`${SALT}|${day}|${ip}|${req.headers['user-agent'] || ''}`).digest('hex').slice(0, 20);
    const isNew = addVisitor.run(day, h).changes > 0;
    if (isNew) {
      bump.run(day, 'device', /mobi|android|iphone|ipad/i.test(req.headers['user-agent'] || '') ? 'Celular' : 'Computador');
      const src = sourceOf(req, url);
      bump.run(day, 'source', src || 'Direto');
    }
  } catch (e) { console.warn('[stats]', e.message); }
}

/** Registra um evento (clique no WhatsApp, contato enviado, busca...). */
function trackEvent(metric, key = '') {
  try { bump.run(today(), metric, String(key).slice(0, 60)); } catch (e) { console.warn('[stats]', e.message); }
}

function audit(actor, action, detail = '') {
  try { db.prepare('INSERT INTO audit(actor,action,detail) VALUES(?,?,?)').run(String(actor).slice(0, 60), action, String(detail).slice(0, 200)); } catch {}
}

function purgeOld() {
  db.prepare('DELETE FROM stats_visitors WHERE day < ?').run(dayOffset(400));
  db.prepare('DELETE FROM audit WHERE at < datetime(\'now\', \'-400 days\')').run();
}
purgeOld();
setInterval(purgeOld, 24 * 3600e3).unref();

/** Relatório agregado de um período (em dias). Não inclui dados pessoais. */
function report(days = 30) {
  days = Math.max(1, Math.min(365, Math.round(days) || 30));
  const from = dayOffset(days - 1), to = today();
  const prevFrom = dayOffset(days * 2 - 1), prevTo = dayOffset(days);
  const sum = (metric, a, b) => db.prepare('SELECT COALESCE(SUM(n),0) n FROM stats_daily WHERE metric=? AND day BETWEEN ? AND ?').get(metric, a, b).n;
  const uv = (a, b) => db.prepare('SELECT COUNT(*) n FROM stats_visitors WHERE day BETWEEN ? AND ?').get(a, b).n;
  const group = (metric) => db.prepare('SELECT key, SUM(n) n FROM stats_daily WHERE metric=? AND day BETWEEN ? AND ? GROUP BY key ORDER BY n DESC').all(metric, from, to);

  const series = [];
  const byDay = {};
  for (const r of db.prepare("SELECT day, metric, SUM(n) n FROM stats_daily WHERE day BETWEEN ? AND ? AND metric IN ('pv','wa','lead') GROUP BY day, metric").all(from, to)) {
    (byDay[r.day] ||= {})[r.metric] = r.n;
  }
  const uvByDay = Object.fromEntries(db.prepare('SELECT day, COUNT(*) n FROM stats_visitors WHERE day BETWEEN ? AND ? GROUP BY day').all(from, to).map((r) => [r.day, r.n]));
  for (let i = days - 1; i >= 0; i--) {
    const d = dayOffset(i); const x = byDay[d] || {};
    series.push({ day: d, visitors: uvByDay[d] || 0, pageviews: x.pv || 0, whatsapp: x.wa || 0, leads: x.lead || 0 });
  }

  const views = Object.fromEntries(group('vehicle_view').map((r) => [r.key, r.n]));
  const waByV = Object.fromEntries(group('wa').map((r) => [r.key, r.n]));
  const ids = [...new Set([...Object.keys(views), ...Object.keys(waByV)])].filter((k) => /^\d+$/.test(k));
  const vehicles = ids.length ? db.prepare(`SELECT id, brand, model, version, year_model, price, status FROM vehicles WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
  const top = vehicles.map((v) => ({ ...v, views: views[v.id] || 0, whatsapp: waByV[v.id] || 0 }))
    .sort((a, b) => b.whatsapp - a.whatsapp || b.views - a.views).slice(0, 10);

  return {
    days, from, to,
    totals: {
      visitors: uv(from, to), pageviews: sum('pv', from, to), whatsapp: sum('wa', from, to), leads: sum('lead', from, to),
      vehicleViews: sum('vehicle_view', from, to)
    },
    previous: {
      visitors: uv(prevFrom, prevTo), pageviews: sum('pv', prevFrom, prevTo), whatsapp: sum('wa', prevFrom, prevTo), leads: sum('lead', prevFrom, prevTo),
      vehicleViews: sum('vehicle_view', prevFrom, prevTo)
    },
    series,
    sources: group('source'), devices: group('device'), pages: group('pv'), leadTypes: group('lead'), searches: group('search').slice(0, 10),
    top
  };
}

module.exports = { trackPage, trackEvent, audit, report, today, dayOffset, isBot };
