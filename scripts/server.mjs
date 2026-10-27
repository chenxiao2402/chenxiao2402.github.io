import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile, mkdir, stat, realpath, rename, rm } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import YAML from 'yaml';
import { ROOT, readContent, validate, validateAssets, contentFiles } from './content.mjs';
import { build } from './build.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
async function body(req, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) { const error = new Error('Upload is too large. Maximum size is 10 MB (1 MB for text content).'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function startServer({ root = ROOT, edit = false, port = 4321 } = {}) {
  await build({ root });
  const token = randomBytes(32).toString('hex');
  let saving = false;
  const server = http.createServer(async (req, res) => {
    try {
      const address = server.address();
      const hosts = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
      if (!hosts.includes(req.headers.host)) return send(res, 403, { error: 'Only localhost requests are allowed.' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: 'Cross-site requests are not allowed.' });
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) {
        if (!edit) return send(res, 404, { error: 'The editor is not running.' });
        const language = url.searchParams.get('lang') ?? 'en';
        const names = contentFiles(language);
        if (req.method === 'GET' && url.pathname === '/api/content') {
          const content = await readContent(root, language);
          return send(res, 200, { ...content, version: digest(content), token, apiVersion: 2 });
        }
        if (req.method !== 'PUT' && req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
        if (req.headers['x-editor-token'] !== token || req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'Invalid editor session. Reload the editor and try again.' });
        if (url.pathname === '/api/upload' && req.method === 'POST') {
          const bytes = await body(req, 10 * 1024 * 1024);
          const ext = path.extname(url.searchParams.get('name') ?? '').toLowerCase();
          const valid = ((ext === '.jpg' || ext === '.jpeg') && bytes.subarray(0,3).equals(Buffer.from([255,216,255]))) || (ext === '.png' && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) || (ext === '.webp' && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') || (ext === '.pdf' && bytes.toString('ascii',0,5) === '%PDF-');
          if (!valid) return send(res, 400, { error: 'Choose a JPEG, PNG, WebP, or PDF file.' });
          const filename = `${randomBytes(8).toString('hex')}${ext}`;
          const directory = path.join(root, 'public/uploads');
          await mkdir(directory, { recursive: true });
          await writeFile(path.join(directory, filename), bytes, { flag: 'wx' });
          return send(res, 200, { path: `/uploads/${filename}` });
        }
        if (url.pathname !== '/api/content' || req.method !== 'PUT') return send(res, 404, { error: 'Unknown editor operation.' });
        if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: 'Expected JSON content.' });
        if (saving) return send(res, 409, { error: 'A save is already in progress. Please try again.' });
        saving = true;
        try {
          const incoming = JSON.parse((await body(req, 1024 * 1024)).toString());
          const current = await readContent(root, language);
          if (incoming.version !== digest(current)) return send(res, 409, { error: 'The content changed in another tab or on disk. Copy your unsaved edits, then reload before saving.' });
          const content = validate({ data: incoming.data, about: incoming.about, researchIntro: incoming.researchIntro });
          await validateAssets(content, root);
          const preview = path.join(root, '.cache/editor-build');
          await build({ root, bundle: content, language, out: preview });
          const originals = await Promise.all(names.map(f => readFile(path.join(root, 'content', f))));
          const backup = path.join(root, '.cache/content-backups', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`);
          await mkdir(backup, { recursive: true });
          await Promise.all(names.map(async (f,i) => {
            await mkdir(path.dirname(path.join(backup, f)), { recursive: true });
            await writeFile(path.join(backup, f), originals[i]);
          }));
          const values = ['# Edit with ./edit.sh, or edit this plain-text file directly.\n' + YAML.stringify(content.data, { lineWidth: 0 }), content.about, content.researchIntro];
          try {
            for (const [i, name] of names.entries()) {
              const destination = path.join(root, 'content', name);
              await writeFile(`${destination}.tmp`, values[i]);
              await rename(`${destination}.tmp`, destination);
            }
            await rm(path.join(root, 'dist'), { recursive: true, force: true });
            await rename(preview, path.join(root, 'dist'));
          } catch (error) {
            await Promise.all(names.map((f,i) => writeFile(path.join(root, 'content', f), originals[i])));
            throw error;
          }
          return send(res, 200, { version: digest(content), message: 'Saved locally and rebuilt. Push your changes to GitHub to publish.' });
        } finally { saving = false; }
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, 'Method not allowed', 'text/plain');
      if (url.pathname === '/editor' && edit) { res.writeHead(302, { Location: '/editor/' }); return res.end(); }
      let base = path.join(root, 'dist');
      let requestPath = decodeURIComponent(url.pathname);
      if (requestPath.startsWith('/editor/') && edit) {
        base = path.join(root, 'editor');
        requestPath = requestPath.slice('/editor'.length);
      }
      const target = path.resolve(base, `.${requestPath}`);
      if (!target.startsWith(`${base}${path.sep}`) && target !== base) return send(res, 403, 'Forbidden', 'text/plain');
      let file = target;
      try {
        if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
        const real = await realpath(file);
        if (!real.startsWith(`${await realpath(base)}${path.sep}`)) return send(res, 403, 'Forbidden', 'text/plain');
        const bytes = await readFile(file);
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        return send(res, 200, req.method === 'HEAD' ? '' : bytes, types[path.extname(file)] ?? 'application/octet-stream');
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
        return send(res, 404, req.method === 'HEAD' ? '' : await readFile(path.join(root, 'dist/404.html')), 'text/html; charset=utf-8');
      }
    } catch (error) { send(res, error.status ?? 400, { error: error.message }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv.find(a => a.startsWith('--port='));
  const port = Number(arg?.split('=')[1] ?? process.env.PORT ?? 4321);
  try {
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535.');
    const edit = process.argv.includes('--edit');
    const server = await startServer({ edit, port });
    console.log(`\nWebsite: http://127.0.0.1:${server.address().port}/`);
    if (edit) console.log(`Editor:  http://127.0.0.1:${server.address().port}/editor/\nSaves stay local. Use GitHub Desktop to commit and push when ready.`);
    console.log('Press Ctrl+C to stop.\n');
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
  } catch (error) { console.error(`Could not start: ${error.message}`); process.exitCode = 1; }
}
