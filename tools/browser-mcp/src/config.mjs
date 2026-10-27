export function settings(env = process.env) {
  const port = Number(env.BROWSER_MCP_PORT || 3333);
  const cdpPort = Number(env.BROWSER_CDP_PORT || 9223);
  if (![port, cdpPort].every(n => Number.isInteger(n) && n > 0 && n < 65536)) {
    throw new Error('Ports must be integers from 1 through 65535');
  }
  const origins = (env.BROWSER_MCP_ALLOWED_ORIGINS ||
    'http://localhost:3002,http://127.0.0.1:3002').split(',').map(s => s.trim());
  if (!origins.length || origins.some(s => !s)) throw new Error('Missing allowed origins');
  const allowed = new Set(origins.map(s => {
    const u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password ||
        u.pathname !== '/' || u.search || u.hash || s.replace(/\/$/, '') !== u.origin) {
      throw new Error(`Invalid allowed origin: ${s}`);
    }
    return u.origin;
  }));
  return { port, cdpPort, allowed, token: env.BROWSER_MCP_TOKEN || '' };
}

export function safeUrl(value, allowed) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid URL');
  let url;
  try { url = new URL(value); } catch { throw new Error('URL must be absolute'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      !allowed.has(url.origin)) throw new Error(`Origin not allowed: ${url.origin}`);
  return url.href;
}

export function requireTab(tabs, id, allowed) {
  const t = tabs.find(p => p.id === id && p.type === 'page');
  if (!t) throw new Error('Tab not found');
  safeUrl(t.url, allowed);
  return t;
}
