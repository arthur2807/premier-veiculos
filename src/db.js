'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'loja.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  neighborhood TEXT DEFAULT '',
  city TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  hours TEXT DEFAULT '',
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  version TEXT DEFAULT '',
  year_fab INTEGER,
  year_model INTEGER,
  km INTEGER DEFAULT 0,
  price INTEGER DEFAULT 0,
  price_old INTEGER DEFAULT 0,
  fuel TEXT DEFAULT 'Flex',
  transmission TEXT DEFAULT 'Automático',
  body TEXT DEFAULT '',
  color TEXT DEFAULT '',
  doors INTEGER DEFAULT 4,
  plate_end TEXT DEFAULT '',
  condition TEXT DEFAULT 'seminovo',
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'disponivel',
  featured INTEGER DEFAULT 0,
  description TEXT DEFAULT '',
  options TEXT DEFAULT '[]',
  photos TEXT DEFAULT '[]',
  views INTEGER DEFAULT 0,
  contacts INTEGER DEFAULT 0,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  message TEXT DEFAULT '',
  vehicle_id INTEGER,
  unit_id INTEGER,
  data TEXT DEFAULT '{}',
  status TEXT DEFAULT 'novo',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

const DEFAULT_SETTINGS = {
  instagram: require('./brand').instagram || '',
  facebook: '',
  email: require('./brand').email,
  finance_rate: '1.89',
  about: require('./brand').about,
  site_url: '',
  ga_id: '',
  watermark: '0'
};

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}
function saveSettings(obj) {
  const st = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in obj) st.run(k, String(obj[k] ?? ''));
}

function parseVehicle(v) {
  if (!v) return v;
  v.options = safeJson(v.options, []);
  v.photos = safeJson(v.photos, []);
  return v;
}
function safeJson(s, d) { try { return JSON.parse(s); } catch { return d; } }

function seed() {
  const n = db.prepare('SELECT COUNT(*) c FROM units').get().c;
  if (n > 0) return;
  const u = db.prepare('INSERT INTO units(name,address,neighborhood,city,phone,whatsapp,hours,sort) VALUES (?,?,?,?,?,?,?,?)');
  require('./brand').units.forEach((x, i) => u.run(x.name, x.address, x.neighborhood, x.city, x.phone, x.whatsapp, '', i + 1));

  if (process.env.SEED_DEMO === 'false') return;
  const cars = [
    ['Toyota', 'Corolla', 'XEi 2.0 Flex', 2022, 2022, 38500, 139900, 0, 'Flex', 'Automático', 'Sedã', 'Prata', 1, 1, 'seminovo'],
    ['Jeep', 'Compass', 'Longitude 1.3 T270', 2023, 2023, 21000, 159900, 167900, 'Flex', 'Automático', 'SUV', 'Preto', 1, 2, 'seminovo'],
    ['Volkswagen', 'T-Cross', 'Highline 1.4 TSI', 2022, 2023, 30200, 134900, 0, 'Flex', 'Automático', 'SUV', 'Branco', 1, 1, 'seminovo'],
    ['Hyundai', 'HB20', 'Platinum 1.0 TGDI', 2023, 2024, 15800, 99900, 0, 'Flex', 'Automático', 'Hatch', 'Vermelho', 0, 2, 'seminovo'],
    ['Chevrolet', 'Onix Plus', 'Premier 1.0 Turbo', 2022, 2022, 42000, 94900, 0, 'Flex', 'Automático', 'Sedã', 'Cinza', 0, 1, 'seminovo'],
    ['Fiat', 'Toro', 'Volcano 2.0 Diesel 4x4', 2021, 2022, 61000, 154900, 0, 'Diesel', 'Automático', 'Picape', 'Branco', 1, 2, 'seminovo'],
    ['Honda', 'Civic', 'Touring 1.5 Turbo', 2020, 2021, 54000, 144900, 0, 'Gasolina', 'Automático', 'Sedã', 'Preto', 0, 1, 'seminovo'],
    ['Toyota', 'Hilux', 'SRX 2.8 Diesel 4x4', 2021, 2021, 78000, 239900, 0, 'Diesel', 'Automático', 'Picape', 'Prata', 1, 2, 'seminovo'],
    ['Renault', 'Kwid', 'Zen 1.0', 2022, 2023, 27500, 59900, 0, 'Flex', 'Manual', 'Hatch', 'Branco', 0, 1, 'seminovo'],
    ['Hyundai', 'Creta', 'Limited 1.0 TGDI', 2024, 2024, 9800, 144900, 0, 'Flex', 'Automático', 'SUV', 'Azul', 0, 2, 'seminovo'],
    ['Volkswagen', 'Polo', 'Highline 200 TSI', 2021, 2022, 47000, 92900, 0, 'Flex', 'Automático', 'Hatch', 'Cinza', 0, 1, 'seminovo'],
    ['Nissan', 'Kicks', 'Advance 1.6 CVT', 2022, 2022, 36000, 109900, 0, 'Flex', 'Automático', 'SUV', 'Vermelho', 0, 2, 'seminovo'],
    ['Fiat', 'Strada', 'Volcano 1.3 CVT', 2026, 2026, 0, 129990, 0, 'Flex', 'Automático', 'Picape', 'Branco', 1, 1, '0km'],
    ['BYD', 'Dolphin', 'GS 180 cv Elétrico', 2026, 2026, 0, 149800, 0, 'Elétrico', 'Automático', 'Hatch', 'Azul', 0, 2, '0km']
  ];
  const opts = ['Ar-condicionado', 'Direção elétrica', 'Vidros elétricos', 'Travas elétricas', 'Central multimídia', 'Câmera de ré', 'Sensor de estacionamento', 'Airbags', 'Freios ABS', 'Rodas de liga leve', 'Piloto automático', 'Bancos em couro', 'Chave presencial', 'Apple CarPlay / Android Auto'];
  const ins = db.prepare(`INSERT INTO vehicles(brand,model,version,year_fab,year_model,km,price,price_old,fuel,transmission,body,color,featured,unit_id,condition,description,options,is_demo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`);
  const unitIds = db.prepare('SELECT id FROM units ORDER BY sort').all().map((r) => r.id);
  cars.forEach((c, i) => {
    c = [...c]; c[13] = unitIds[(c[13] - 1) % unitIds.length];
    const o = opts.filter((_, j) => (j + i) % 3 !== 0);
    const desc = c[14] === '0km'
      ? 'Veículo zero km, pronta entrega. Consulte condições especiais de financiamento e taxa.'
      : 'Veículo revisado, com procedência e laudo cautelar aprovado. Aceitamos seu usado na troca e financiamos em até 60x.';
    ins.run(...c, desc, JSON.stringify(o));
  });
}
seed();

// Colunas novas em bancos antigos
try { db.exec("ALTER TABLE units ADD COLUMN hours_json TEXT DEFAULT ''"); } catch {}

// Horário estruturado: [{open:'08:00', close:'18:00'} | null] de segunda (0) a domingo (6)
const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const fmtTime = (t) => { const [h, m] = String(t).split(':'); return `${+h}h${m && m !== '00' ? m : ''}`; };
function hoursText(sched) {
  if (!Array.isArray(sched) || sched.length !== 7) return '';
  const groups = [];
  sched.forEach((d, i) => {
    const key = d ? `${d.open}-${d.close}` : 'x';
    const last = groups[groups.length - 1];
    if (last && last.key === key && last.end === i - 1) last.end = i; else groups.push({ key, start: i, end: i, d });
  });
  return groups.filter((g) => g.d).map((g) => {
    const days = g.start === g.end ? DAYS[g.start] : g.end - g.start === 1 ? `${DAYS[g.start]} e ${DAYS[g.end]}` : `${DAYS[g.start]} a ${DAYS[g.end]}`;
    return `${days} ${fmtTime(g.d.open)} às ${fmtTime(g.d.close)}`;
  }).join(' · ');
}
function parseSchedule(raw) {
  let a; try { a = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!Array.isArray(a) || a.length !== 7) return null;
  const ok = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  return a.map((d) => (d && ok(d.open) && ok(d.close) && d.open < d.close ? { open: d.open, close: d.close } : null));
}
/** Está aberta agora? (fuso UTC-3) */
function openNow(raw) {
  const s = parseSchedule(raw); if (!s) return null;
  const now = new Date(Date.now() - 3 * 3600e3);
  const d = s[(now.getUTCDay() + 6) % 7]; if (!d) return false;
  const hm = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  return hm >= d.open && hm < d.close;
}
const DEFAULT_SCHEDULE = JSON.stringify([...Array(5)].map(() => ({ open: '08:00', close: '18:00' })).concat([{ open: '08:00', close: '12:00' }, null]));

// Migrações de dados que rodam uma única vez
function migrate(key, fn) {
  if (db.prepare('SELECT 1 FROM settings WHERE key=?').get('mig_' + key)) return;
  fn();
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('mig_' + key, new Date().toISOString());
}
migrate('horarios_estruturados', () => {
  const seeds = require('./brand').units;
  for (const u of db.prepare("SELECT id, sort FROM units WHERE hours_json='' OR hours_json IS NULL").all()) {
    const b = seeds[(u.sort || 1) - 1];
    db.prepare('UPDATE units SET hours_json=? WHERE id=?').run(b && b.hours_json ? JSON.stringify(b.hours_json) : DEFAULT_SCHEDULE, u.id);
  }
  for (const u of db.prepare('SELECT id, hours_json FROM units').all()) db.prepare('UPDATE units SET hours=? WHERE id=?').run(hoursText(parseSchedule(u.hours_json)), u.id);
});

module.exports = { hoursText, parseSchedule, openNow, db, DATA_DIR, UPLOAD_DIR, getSettings, saveSettings, parseVehicle, safeJson };
