'use strict';
// Busca fotos de exemplo (Wikipedia / Wikimedia Commons, licenças livres) para os veículos de demonstração.
// Roda só no servidor, uma vez por veículo de exemplo sem foto. Desligue com DEMO_PHOTOS=false.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, UPLOAD_DIR, parseVehicle } = require('./db');

const TITLES = {
  'Toyota Corolla': 'Toyota Corolla (E210)',
  'Jeep Compass': 'Jeep Compass',
  'Volkswagen T-Cross': 'Volkswagen T-Cross',
  'Hyundai HB20': 'Hyundai HB20',
  'Chevrolet Onix Plus': 'Chevrolet Onix',
  'Fiat Toro': 'Fiat Toro',
  'Honda Civic': 'Honda Civic (tenth generation)',
  'Toyota Hilux': 'Toyota Hilux (AN120)',
  'Renault Kwid': 'Renault Kwid',
  'Hyundai Creta': 'Hyundai Creta',
  'Volkswagen Polo': 'Volkswagen Polo Mk6',
  'Nissan Kicks': 'Nissan Kicks',
  'Fiat Strada': 'Fiat Strada',
  'BYD Dolphin': 'BYD Dolphin'
};
const UA = `${require('./brand').slug}-demo/1.0 (site de demonstração)`;

async function get(url, tries = 3) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    if (r.status !== 429 || i >= tries) return r;
    await new Promise((ok) => setTimeout(ok, 5000 * (i + 1)));
  }
}
async function getJson(url) {
  const r = await get(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function thumbFor(name) {
  const base = 'https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=thumbnail&pithumbsize=1280&format=json&formatversion=2&redirects=1';
  const t = TITLES[name];
  if (t) {
    const j = await getJson(`${base}&titles=${encodeURIComponent(t)}`);
    const src = j?.query?.pages?.[0]?.thumbnail?.source;
    if (src) return src;
  }
  const j = await getJson(`${base}&generator=search&gsrlimit=1&gsrsearch=${encodeURIComponent(name + ' car')}`);
  return j?.query?.pages?.[0]?.thumbnail?.source || null;
}

async function fetchDemoPhotos() {
  if (process.env.DEMO_PHOTOS === 'false') return;
  const list = db.prepare("SELECT * FROM vehicles WHERE is_demo=1 AND photos='[]'").all().map(parseVehicle);
  for (const v of list) {
    const name = `${v.brand} ${v.model}`;
    try {
      const src = await thumbFor(name);
      if (!src) { console.warn('[fotos-exemplo] sem imagem para', name); continue; }
      const r = await get(src);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const sig = buf.subarray(0, 4).toString('hex');
      const ext = sig.startsWith('ffd8') ? 'jpg' : sig === '89504e47' ? 'png' : buf.subarray(8, 12).toString() === 'WEBP' ? 'webp' : null;
      if (!ext) throw new Error('formato desconhecido');
      const file = crypto.randomBytes(12).toString('hex') + '.' + ext;
      fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
      db.prepare('UPDATE vehicles SET photos=? WHERE id=?').run(JSON.stringify([file]), v.id);
      console.log('[fotos-exemplo]', name, 'ok');
    } catch (e) {
      console.warn('[fotos-exemplo] falhou para', name, '-', e.message);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

module.exports = { fetchDemoPhotos };
