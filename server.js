// Dev server for testing the TV app in a desktop browser.
// - Serves ./app as static files
// - /proxy?url=<encoded>  forwards requests to the IPTV provider (avoids CORS),
//   follows redirects, and rewrites HLS playlists so every segment also goes
//   through the proxy.
// On the real TV the app talks to the provider directly (no CORS there).

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = path.join(__dirname, 'app');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.xml': 'application/xml',
};

function proxied(absUrl) {
  return '/proxy?url=' + encodeURIComponent(absUrl);
}

function isPlaylist(url, contentType) {
  return /mpegurl/i.test(contentType || '') || /\.m3u8?(\?|$)/i.test(url);
}

function rewritePlaylist(body, baseUrl) {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) {
        // URI="..." attributes (keys, alternate media, i-frame playlists)
        return line.replace(/URI="([^"]+)"/g, (_, u) => 'URI="' + proxied(new URL(u, baseUrl).href) + '"');
      }
      return proxied(new URL(t, baseUrl).href);
    })
    .join('\n');
}

// Logging with credentials masked (/live/<user>/<pass>/, username=..&password=..)
function mask(u) {
  return String(u)
    .replace(/\/(live|movie|series)\/[^/]+\/[^/]+\//, '/$1/***/***/')
    .replace(/(username|password|token)=[^&]+/g, '$1=***')
    .replace(/\/play\/hls\/[^/?]+/, '/play/hls/<token>')
    .slice(0, 140);
}
function log(status, ms, url, note) {
  console.log(`${new Date().toISOString().slice(11, 19)} ${String(status).padEnd(4)} ${String(ms).padStart(5)}ms ${mask(url)}${note ? '  ' + note : ''}`);
}

function forward(req, res, target, redirectsLeft) {
  const t0 = Date.now();
  let url;
  try {
    url = new URL(target);
  } catch (e) {
    res.writeHead(400);
    return res.end('Bad url');
  }
  const lib = url.protocol === 'https:' ? https : http;
  const headers = { 'User-Agent': 'Mozilla/5.0 (SMART-TV; Tizen) simple-iptv-dev' };
  if (req.headers.range) headers.Range = req.headers.range;

  const upstream = lib.request(url, { method: 'GET', headers }, (up) => {
    if (up.statusCode >= 300 && up.statusCode < 400 && up.headers.location && redirectsLeft > 0) {
      up.resume();
      log(up.statusCode, Date.now() - t0, url.href, '→ redirect');
      return forward(req, res, new URL(up.headers.location, url).href, redirectsLeft - 1);
    }

    const ct = up.headers['content-type'] || '';
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': '*' };

    if (isPlaylist(url.href, ct)) {
      const chunks = [];
      up.on('data', (c) => chunks.push(c));
      up.on('end', () => {
        const body = rewritePlaylist(Buffer.concat(chunks).toString('utf8'), url.href);
        log(up.statusCode, Date.now() - t0, url.href, 'playlist');
        res.writeHead(up.statusCode, { ...cors, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' });
        res.end(body);
      });
      return;
    }

    const pass = { ...cors };
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      if (up.headers[h]) pass[h] = up.headers[h];
    }
    res.writeHead(up.statusCode, pass);
    let bytes = 0;
    up.on('data', (c) => { bytes += c.length; });
    up.on('end', () => log(up.statusCode, Date.now() - t0, url.href, ct.split(';')[0] + ' ' + bytes + 'B'));
    up.pipe(res);
  });

  upstream.setTimeout(20000, () => upstream.destroy(new Error('Upstream timeout')));
  upstream.on('error', (err) => {
    log('ERR', Date.now() - t0, url.href, err.message);
    if (!res.headersSent) res.writeHead(502, { 'Access-Control-Allow-Origin': '*' });
    res.end('Proxy error: ' + err.message);
  });
  req.on('close', () => upstream.destroy());
  upstream.end();
}

function serveStatic(req, res) {
  const reqPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.normalize(path.join(ROOT, reqPath === '/' ? 'index.html' : reqPath));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

http
  .createServer((req, res) => {
    if (req.url.startsWith('/proxy?')) {
      const target = new URL(req.url, 'http://x').searchParams.get('url');
      return forward(req, res, target, 5);
    }
    serveStatic(req, res);
  })
  .listen(PORT, HOST, () => {
    console.log(`Simple IPTV dev server → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  });
