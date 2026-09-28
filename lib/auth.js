// Optional access control for self-hosted instances (Render, Docker…).
// TUBEGRAB_USERS="ana:clave1,luis:clave2" turns on HTTP Basic auth: the browser
// asks for a user and password once and remembers them. Unset → open, as before
// (the desktop app and localhost never set it).
const crypto = require('crypto');

function parseUsers(spec) {
  const users = new Map();
  for (const entry of String(spec || '').split(',')) {
    const i = entry.indexOf(':');
    if (i <= 0) continue;
    const user = entry.slice(0, i).trim();
    const pass = entry.slice(i + 1).trim();
    if (user && pass) users.set(user, pass);
  }
  return users;
}

// Compares hashes so the time taken doesn't reveal the password's length or prefix.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function checkCredentials(users, header) {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(String(header || ''));
  if (!m) return false;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const user = decoded.slice(0, i);
  const pass = decoded.slice(i + 1);
  // Always run one comparison, even for unknown users, so timing doesn't reveal which exist.
  const expected = users.get(user);
  const ok = safeEqual(pass, expected === undefined ? crypto.randomBytes(16).toString('hex') : expected);
  return ok && expected !== undefined;
}

function basicAuth(users) {
  return (req, res, next) => {
    if (checkCredentials(users, req.headers.authorization)) return next();
    res.set('WWW-Authenticate', 'Basic realm="TubeGrab", charset="UTF-8"');
    res.status(401).send('Acceso restringido.');
  };
}

module.exports = { parseUsers, checkCredentials, basicAuth };
