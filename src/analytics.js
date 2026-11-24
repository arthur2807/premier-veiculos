'use strict';
// Estatísticas próprias, sem cookies: contagens diárias agregadas e visitantes únicos por hash diário
// (IP + navegador + dia + segredo). Nenhum dado pessoal é guardado.
const crypto = require('node:crypto');
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS stats_daily (day TEXT NOT NULL, metric TEXT NOT NULL, key TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day, metric, key));
CREATE TABLE IF NOT EXISTS stats_visitors (day TEXT NOT NULL, h TEXT NOT NULL, PRIMARY KEY(day, h));
CREATE TABLE IF NOT EXISTS stats_vehicle_visitors (day TEXT NOT NULL, vid INTEGER NOT NULL, h TEXT NOT NULL, PRIMARY KEY(day, vid, h));
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT DEFAULT (datetime('now')), actor TEXT, action TEXT, detail TEXT DEFAULT '');
`);

const SALT = process.env.SESSION_SECRET || 'ss-stats';
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|httpclient|headless|lighthouse|monitor|uptime|scan/i;
const bump = db.prepare('INSERT INTO stats_daily(day,metric,key,n) VALUES(?,?,?,1) ON CONFLICT(day,metric,key) DO UPDATE SET n=n+1');
const addVisitor = db.prepare('INSERT OR IGNORE INTO stats_visitors(day,h) VALUES(?,?)');
const addVehicleVisitor = db.prepare('INSERT OR IGNORE INTO stats_vehicle_visitors(day,vid,h) VALUES(?,?,?)');

// Dia no fuso UTC-3 (, sem horário de verão)
const today = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const dayOffset = (d) => new Date(Date.now() - 3 * 3600e3 - d * 86400e3).toISOString().slice(0, 10);

function isBot(req) { const ua = req.headers['user-agent'] || ''; return !ua || BOT.test(ua); }

function sourceOf(req, url) {
  const utm = (url.searchParams.get('utm_source') || '').toLowerCase();
  if (utm.startsWith('compart')) return 'Link compartilhado';
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
    const ip = require('./auth').clientIp(req);
    const h = crypto.createHash('sha256').update(`${SALT}|${day}|${ip}|${req.headers['user-agent'] || ''}`).digest('hex').slice(0, 20);
    const isNew = addVisitor.run(day, h).changes > 0;
    const src = sourceOf(req, url);
    if (isNew) {
      bump.run(day, 'device', /mobi|android|iphone|ipad/i.test(req.headers['user-agent'] || '') ? 'Celular' : 'Computador');
      bump.run(day, 'source', src || 'Direto');
    }
    // pessoas diferentes por anúncio e de onde elas chegaram ao anúncio
    if (vehicleId && addVehicleVisitor.run(day, +vehicleId, h).changes > 0) {
      bump.run(day, 'vehicle_uv', String(vehicleId));
      bump.run(day, 'vsource', `${vehicleId}|${src || 'Navegando no site'}`);
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
  db.prepare('DELETE FROM stats_vehicle_visitors WHERE day < ?').run(dayOffset(400));
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

// ---------- desempenho por anúncio ----------
const clampDays = (d) => Math.max(1, Math.min(365, Math.round(d) || 30));
const byKey = (metric, from, to) => Object.fromEntries(db.prepare('SELECT key, SUM(n) n FROM stats_daily WHERE metric=? AND day BETWEEN ? AND ? GROUP BY key').all(metric, from, to).map((r) => [r.key, r.n]));
// Formulários ligados a um anúncio (troca, contato, financiamento). created_at está em UTC; o dia é no fuso de João Pessoa.
const formsByVehicle = (from, to) => Object.fromEntries(db.prepare("SELECT vehicle_id k, COUNT(*) n FROM leads WHERE vehicle_id IS NOT NULL AND type!='alerta' AND date(created_at,'-3 hours') BETWEEN ? AND ? GROUP BY vehicle_id").all(from, to).map((r) => [String(r.k), r.n]));
const daysSince = (s) => s ? Math.max(0, Math.floor((Date.now() - new Date(String(s).replace(' ', 'T') + 'Z')) / 86400e3)) : 0;

/** Números de cada anúncio no período + totais desde o cadastro. Não inclui dados pessoais. */
function vehicleReport(days = 30) {
  days = clampDays(days);
  const from = dayOffset(days - 1), to = today();
  const views = byKey('vehicle_view', from, to), uv = byKey('vehicle_uv', from, to), wa = byKey('wa', from, to),
    calls = byKey('call', from, to), shares = byKey('share', from, to), forms = formsByVehicle(from, to);
  const rows = db.prepare('SELECT id, brand, model, version, year_model, price, status, photos, unit_id, featured, is_demo, created_at, views, contacts, shares, calls FROM vehicles').all();
  const vehicles = rows.map((v) => {
    const k = String(v.id);
    const r = { views: views[k] || 0, people: uv[k] || 0, shares: shares[k] || 0, whatsapp: wa[k] || 0, calls: calls[k] || 0, forms: forms[k] || 0 };
    r.contacts = r.whatsapp + r.calls + r.forms;
    let photo = ''; try { photo = JSON.parse(v.photos || '[]')[0] || ''; } catch {}
    return {
      id: v.id, brand: v.brand, model: v.model, version: v.version, year_model: v.year_model, price: v.price, status: v.status,
      unit_id: v.unit_id, featured: !!v.featured, demo: !!v.is_demo, photo, daysListed: daysSince(v.created_at), ...r,
      allTime: { views: v.views || 0, whatsapp: v.contacts || 0, shares: v.shares || 0, calls: v.calls || 0 }
    };
  }).filter((v) => v.status !== 'vendido' || v.views || v.contacts || v.shares);
  const sum = (k) => vehicles.reduce((a, v) => a + v[k], 0);
  const totals = { views: sum('views'), people: sum('people'), shares: sum('shares'), whatsapp: sum('whatsapp'), calls: sum('calls'), forms: sum('forms'), contacts: sum('contacts') };
  const site = {
    visitors: db.prepare('SELECT COUNT(*) n FROM stats_visitors WHERE day BETWEEN ? AND ?').get(from, to).n,
    pageviews: db.prepare("SELECT COALESCE(SUM(n),0) n FROM stats_daily WHERE metric='pv' AND day BETWEEN ? AND ?").get(from, to).n,
    allTimePageviews: db.prepare("SELECT COALESCE(SUM(n),0) n FROM stats_daily WHERE metric='pv'").get().n,
    allTimeVisitors: db.prepare("SELECT COALESCE(SUM(n),0) n FROM stats_daily WHERE metric='source'").get().n
  };
  const shareChannels = db.prepare("SELECT substr(key, instr(key,'|')+1) key, SUM(n) n FROM stats_daily WHERE metric='vshare' AND day BETWEEN ? AND ? GROUP BY 1 ORDER BY n DESC").all(from, to);
  return { days, from, to, site, totals, shareChannels, vehicles };
}

/** Detalhe de um anúncio: série diária, origem das visitas e canais de compartilhamento. */
function vehicleDetail(id, days = 30) {
  days = clampDays(days);
  const from = dayOffset(days - 1), to = today(), k = String(id);
  const daily = {};
  for (const r of db.prepare("SELECT day, metric, n FROM stats_daily WHERE key=? AND metric IN ('vehicle_view','vehicle_uv','wa','call','share') AND day BETWEEN ? AND ?").all(k, from, to)) (daily[r.day] ||= {})[r.metric] = r.n;
  for (const r of db.prepare("SELECT date(created_at,'-3 hours') day, COUNT(*) n FROM leads WHERE vehicle_id=? AND type!='alerta' AND date(created_at,'-3 hours') BETWEEN ? AND ? GROUP BY 1").all(+id, from, to)) (daily[r.day] ||= {}).form = r.n;
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dayOffset(i), x = daily[d] || {};
    series.push({ day: d, views: x.vehicle_view || 0, people: x.vehicle_uv || 0, shares: x.share || 0, contacts: (x.wa || 0) + (x.call || 0) + (x.form || 0), whatsapp: x.wa || 0, calls: x.call || 0, forms: x.form || 0 });
  }
  const split = (metric) => db.prepare('SELECT substr(key, instr(key,\'|\')+1) key, SUM(n) n FROM stats_daily WHERE metric=? AND key LIKE ? AND day BETWEEN ? AND ? GROUP BY 1 ORDER BY n DESC').all(metric, k + '|%', from, to);
  const SHARE_LABEL = { whatsapp: 'WhatsApp', facebook: 'Facebook', copiar: 'Link copiado', nativo: 'Menu do celular' };
  return { days, from, to, series, sources: split('vsource'), shareChannels: split('vshare').map((r) => ({ ...r, key: SHARE_LABEL[r.key] || r.key })) };
}

module.exports = { trackPage, trackEvent, audit, report, vehicleReport, vehicleDetail, today, dayOffset, isBot, daysSince };
