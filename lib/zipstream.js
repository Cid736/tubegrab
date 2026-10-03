// A .zip written on the fly while it's sent (several files to a phone in one
// download). Files are stored as they are (music and video don't compress
// further); each one's CRC and size go in a data descriptor after it, so
// nothing has to be read twice. Up to 4 GB in all (no ZIP64).
const fs = require('fs');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf, crc = 0) {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const MAX_ZIP_BYTES = 0xffffffff - 64 * 1024 * 1024;

function dosTime(ms) {
  const d = new Date(ms);
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/** A name safe inside the zip: no folders, no "..", unique. */
function entryNames(names) {
  const used = new Set();
  return names.map((raw) => {
    let n = String(raw).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '_').slice(0, 200) || 'archivo';
    const dot = n.lastIndexOf('.');
    const base = dot > 0 ? n.slice(0, dot) : n;
    const ext = dot > 0 ? n.slice(dot) : '';
    for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base} (${i})${ext}`;
    used.add(n.toLowerCase());
    return n;
  });
}

/**
 * Writes the zip of `files` ([{ path, name }]) to `out` (a writable, e.g. an
 * HTTP response). Resolves when done; rejects if a file can't be read.
 */
async function writeZip(files, out, { now = Date.now() } = {}) {
  const names = entryNames(files.map((f) => f.name));
  const central = [];
  let offset = 0;
  // One listener for the whole zip: the phone hanging up stops everything.
  let closed = false;
  let onClosed = () => {};
  out.once('close', () => { closed = true; onClosed(); });
  const write = (buf) => new Promise((resolve, reject) => {
    if (closed || out.destroyed) { reject(new Error('closed')); return; }
    offset += buf.length;
    if (out.write(buf)) resolve(); else { onClosed = () => reject(new Error('closed')); out.once('drain', resolve); }
  });
  for (let i = 0; i < files.length; i++) {
    const name = Buffer.from(names[i], 'utf8');
    const { time, date } = dosTime(now);
    const start = offset;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);            // version needed
    head.writeUInt16LE(0x0808, 6);        // data descriptor + UTF-8 names
    head.writeUInt16LE(0, 8);             // stored
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    head.writeUInt16LE(name.length, 26);
    await write(Buffer.concat([head, name]));
    let crc = 0;
    let size = 0;
    await new Promise((resolve, reject) => {
      const s = fs.createReadStream(files[i].path);
      s.on('data', (chunk) => {
        crc = crc32(chunk, crc);
        size += chunk.length;
        offset += chunk.length;
        if (offset > MAX_ZIP_BYTES) { s.destroy(new Error('too big')); return; }
        if (!out.write(chunk)) { s.pause(); out.once('drain', () => s.resume()); }
      });
      s.on('end', resolve);
      s.on('error', reject);
      onClosed = () => { s.destroy(); reject(new Error('closed')); };
      if (closed) onClosed();
    });
    const desc = Buffer.alloc(16);
    desc.writeUInt32LE(0x08074b50, 0);
    desc.writeUInt32LE(crc, 4);
    desc.writeUInt32LE(size, 8);
    desc.writeUInt32LE(size, 12);
    await write(desc);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0808, 8);
    c.writeUInt16LE(0, 10);
    c.writeUInt16LE(time, 12);
    c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(size, 20);
    c.writeUInt32LE(size, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(start, 42);
    central.push(Buffer.concat([c, name]));
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  await write(dir);
  await write(end);
}

module.exports = { writeZip, crc32, entryNames, MAX_ZIP_BYTES };
