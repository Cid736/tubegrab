// Optional access control for self-hosted instances (Render, Docker…).
// TUBEGRAB_USERS="ana:clave1,luis:clave2" turns on HTTP Basic auth: the browser
// asks for a user and password once and remembers them. Unset → open, as before
// (the desktop app and localhost never set it). Set but malformed → the server
// doesn't start. Passwords can't contain commas; only use it over HTTPS.
const crypto = require('crypto');

const MIN_PASSWORD = 8;

/**
 * "ana:clave1,luis:clave2" → { users: Map(user → password), problems: [...] }.
 * Any problem means the setting can't be trusted: the server refuses to start
 * rather than silently running open (fail closed).
 */
function parseUsers(spec) {
  const users = new Map();
  const problems = [];
  const entries = String(spec || '').split(',').map((e) => e.trim());
  if (!entries.some(Boolean)) return { users, problems: String(spec || '').trim() ? ['no hay ningún usuario'] : [] };
  entries.forEach((entry, n) => {
    const where = `entrada ${n + 1}`;
    const i = entry.indexOf(':');
    if (!entry) return problems.push(`${where}: vacía (¿una coma de más?)`);
    if (i <= 0) return problems.push(`${where}: falta "usuario:contraseña"`);
    const user = entry.slice(0, i).trim();
    const pass = entry.slice(i + 1).trim();
    if (!user) return problems.push(`${where}: falta el usuario`);
    if (pass.length < MIN_PASSWORD) return problems.push(`${where} (${user}): la contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
    if (users.has(user)) return problems.push(`${where}: el usuario "${user}" está repetido`);
    users.set(user, pass);
    return null;
  });
  return { users, problems };
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

module.exports = { parseUsers, checkCredentials, basicAuth, MIN_PASSWORD };
