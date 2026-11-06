'use strict';
// Gera um .tar.gz com uma cópia consistente do banco (VACUUM INTO) e todas as fotos.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { once } = require('node:events');
const { db, UPLOAD_DIR } = require('./db');

function tarHeader(name, size, mtime) {
  const h = Buffer.alloc(512);
  const put = (str, off, len) => h.write(String(str), off, len, 'utf8');
  const oct = (n, len) => n.toString(8).padStart(len - 1, '0') + '\0';
  put(name, 0, 100); put(oct(0o644, 8), 100, 8); put(oct(0, 8), 108, 8); put(oct(0, 8), 116, 8);
  put(oct(size, 12), 124, 12); put(oct(Math.floor(mtime / 1000), 12), 136, 12);
  h.fill(' ', 148, 156); put('0', 156, 1); put('ustar\0', 257, 6); put('00', 263, 2);
  let sum = 0; for (const b of h) sum += b;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}

async function writeOut(gz, buf) { if (!gz.write(buf)) await once(gz, 'drain'); }

async function streamBackup(res) {
  const stamp = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const tmp = path.join(os.tmpdir(), `ss-backup-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  res.writeHead(200, {
    'Content-Type': 'application/gzip',
    'Content-Disposition': `attachment; filename="backup-${require('./brand').slug}-${stamp}.tar.gz"`,
    'Cache-Control': 'no-store'
  });
  const gz = zlib.createGzip({ level: 1 });
  gz.pipe(res);
  const files = [{ name: 'loja.db', full: tmp }];
  for (const f of fs.readdirSync(UPLOAD_DIR)) if (/^[a-f0-9]{24}\.(jpg|png|webp)$/.test(f)) files.push({ name: 'uploads/' + f, full: path.join(UPLOAD_DIR, f) });
  try {
    for (const f of files) {
      const st = fs.statSync(f.full);
      await writeOut(gz, tarHeader(f.name, st.size, st.mtimeMs));
      for await (const chunk of fs.createReadStream(f.full)) await writeOut(gz, chunk);
      const pad = (512 - (st.size % 512)) % 512;
      if (pad) await writeOut(gz, Buffer.alloc(pad));
    }
    await writeOut(gz, Buffer.alloc(1024));
    gz.end();
  } finally {
    fs.rm(tmp, () => {});
  }
}

module.exports = { streamBackup };
