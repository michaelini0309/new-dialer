import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 8765);
const types = { '.html': 'text/html; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    const target = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
    if (target !== root && !target.startsWith(root + sep)) throw new Error('outside root');
    const body = await readFile(target);
    response.writeHead(200, {
      'Content-Type': types[extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`AresFit QA server listening on ${port}`));
