// tubegrab://download?url=… — the link the browser extension opens. Any web
// page could open one too (the browser asks first), so it's read strictly:
// only that exact form, only a link to a supported site; anything else is
// ignored. The app then only fills in its download box with it.
const { normalizeMediaUrl } = require('./download');

const MAX_LENGTH = 4096;

/** The media link inside a tubegrab:// argument of `argv`, or null. */
function protocolUrlFrom(argv) {
  const arg = (Array.isArray(argv) ? argv : []).find((a) => typeof a === 'string' && /^tubegrab:\/\//i.test(a));
  if (!arg || arg.length > MAX_LENGTH) return null;
  try {
    const u = new URL(arg);
    if (u.protocol !== 'tubegrab:' || u.hostname !== 'download' || (u.pathname && u.pathname !== '/')) return null;
    const url = u.searchParams.get('url');
    return url ? normalizeMediaUrl(url) : null;
  } catch {
    return null;
  }
}

module.exports = { protocolUrlFrom };
