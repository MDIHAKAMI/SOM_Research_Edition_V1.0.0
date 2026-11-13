// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const base = resolve(root);
const port = Number(process.env.PORT || 4173);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8', '.pdf':'application/pdf' };
try { await stat(resolve(base, 'index.html')); } catch { console.error('Built application missing. Run npm ci, then npm run build.'); process.exit(1); }
createServer(async (req,res)=>{
  if (!['GET','HEAD'].includes(req.method || '')) { res.writeHead(405); res.end('Method not allowed'); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    let file = resolve(base, '.' + pathname);
    if (file !== base && !file.startsWith(base + sep)) throw Error('Invalid path');
    if ((await stat(file)).isDirectory()) file = resolve(file,'index.html');
    const data = await readFile(file);
    res.writeHead(200, {'Content-Type': mime[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-cache'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404, {'Content-Type':'text/plain'}); res.end('Not found'); }
}).listen(port, '127.0.0.1', ()=>console.log(`SOM Research Edition: http://127.0.0.1:${port}/\nKeep this window open while using the application. Press Ctrl+C to stop.`));
