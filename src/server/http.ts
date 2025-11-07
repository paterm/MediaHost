// src/server/http.ts
import express from 'express';
import path from 'path';
import fs from 'fs';

export function createHttp(port: number) {
  const app = express();

  const staticDir = path.resolve(process.cwd(), 'static');
  app.use('/', express.static(staticDir));

  // прокси для обложек: /art?src=file:///... или http(s)://...
  app.get('/art', (req, res) => {
    const src = String(req.query.src || '');
    if (src.startsWith('file://')) {
      const p = src.replace('file://', '');
      const stream = fs.createReadStream(p);
      stream.on('error', () => res.status(404).end());
      res.setHeader('Content-Type', guessMime(p));
      return stream.pipe(res);
    }
    if (/^https?:\/\//.test(src)) {
      return res.redirect(src);
    }
    return res.status(400).send('bad art src');
  });

  const server = app.listen(port, () => console.log(`[HTTP] listening on :${port}`));
  return server;
}

function guessMime(p: string) {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}
