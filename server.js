import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/simulation.js': ['simulation.js', 'text/javascript; charset=utf-8']
};
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);

createServer(async (request, response) => {
  let path;
  try {
    path = new URL(request.url, 'http://localhost').pathname;
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  if (!Object.hasOwn(files, path)) {
    response.writeHead(404).end('Not found');
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const [file, type] = files[path];
    const body = await readFile(fileURLToPath(new URL(`./public/${file}`, import.meta.url)));
    response.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache'
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(500).end('Internal server error');
  }
}).listen(port, host, () => {
  console.log(`DNS cache demo listening on http://${host}:${port}`);
});
