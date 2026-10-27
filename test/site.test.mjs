import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, rm, access, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { ROOT, readContent, validate, md, escape } from '../scripts/content.mjs';
import { build } from '../scripts/build.mjs';
import { startServer } from '../scripts/server.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'xiao-website-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of ['content', 'src', 'public', 'editor']) await cp(path.join(ROOT, folder), path.join(root, folder), { recursive: true });
  return root;
}
async function request(server, pathname, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: pathname, method, headers }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', c => { text += c; }); res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
    }); req.on('error', reject); req.end(body);
  });
}
test('build preserves content and resolves local links and anchors', async t => {
  const root = await fixture(t); const out = await build({ root });
  const bundle = await readContent(root);
  const documents = await Promise.all(['index.html', '404.html'].map(p => readFile(path.join(out, p), 'utf8')));
  const translations = documents.map(html => JSON.parse(html.match(/<script id="language-data" type="application\/json">([\s\S]*?)<\/script>/)[1]));
  const chinese = await readContent(root, 'zh');
  assert.equal(translations[0].zh.lang, 'zh-CN');
  assert.equal(translations[0].zh.title, chinese.data.site.title);
  assert.ok(translations[0].zh.html.includes(md(chinese.about)));
  assert.ok(translations[0].zh.html.includes(md(chinese.researchIntro)));
  for (const row of chinese.data.research) assert.ok(translations[0].zh.html.includes(md(row.body)));
  for (const row of chinese.data.education) assert.ok(translations[0].zh.html.includes(escape(row.institution)));
  for (const row of chinese.data.news) assert.ok(translations[0].zh.html.includes(md(row.body)));
  assert.match(translations[0].zh.html, /🇺🇸/);
  assert.match(translations[0].zh.html, /🇨🇳/);
  assert.match(translations[0].zh.html, /简体中文/);
  assert.match(translations[0].zh.html, /aria-haspopup="menu"/);
  assert.match(translations[0].zh.html, /role="menuitemradio" aria-checked="true" data-language-option="zh"/);
  assert.match(translations[0].en.html, /role="menuitemradio" aria-checked="true" data-language-option="en"/);
  assert.match(translations[0].zh.html, /sun-icon/);
  assert.match(translations[0].zh.html, /moon-icon/);
  assert.match(translations[1].zh.html, /页面未找到/);
  assert.ok(documents[0].includes(md(bundle.about)));
  assert.ok(documents[0].includes(md(bundle.researchIntro)));
  const navigation = documents[0].match(/<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/)[1];
  assert.deepEqual([...navigation.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ['#about', '#research', '#updates', escape(bundle.data.profile.cv)]);
  const education = [...documents[0].matchAll(/<article class="education-row">([\s\S]*?)<\/article>/g)].map(match => match[1]);
  assert.equal(education.length, bundle.data.education.length);
  for (const [i, row] of bundle.data.education.entries()) {
    assert.ok(education[i].includes(escape(row.institution)));
    assert.ok(education[i].includes(escape(row.dates)));
    assert.ok(education[i].includes(escape(row.degree)));
  }
  for (const row of bundle.data.news) assert.ok(documents[0].includes(row.date));
  for (const row of bundle.data.research) assert.ok(documents[0].includes(md(row.body)));
  await assert.rejects(access(path.join(out, 'research')), 'Research should be on the homepage, not a separate page.');
  for (const html of [...documents, ...translations.map(t => t.zh.html)]) {
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    for (const [, raw] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (!raw.startsWith('/') && !raw.startsWith('#')) continue;
      const url = new URL(raw, 'https://test.example/');
      const file = path.join(out, url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname);
      await access(file);
      if (url.hash) {
        const destination = raw.startsWith('#') ? html : await readFile(file, 'utf8');
        assert.ok(destination.includes(`id="${url.hash.slice(1)}"`), `Missing anchor: ${raw}`);
      }
    }
  }
  for (const file of ['.nojekyll', 'robots.txt', 'sitemap.xml', 'feed.xml', 'feed-zh.xml', 'file/XiaoChen_CV.pdf']) await access(path.join(out, file));
  assert.match(await readFile(path.join(out, 'feed-zh.xml'), 'utf8'), /<language>zh-CN<\/language>/);
  await assert.rejects(access(path.join(out, 'editor'))); await assert.rejects(access(path.join(out, 'content')));
});
test('footer records the latest build date in Shanghai for both languages and pages', async t => {
  const root = await fixture(t);
  const sourceBefore = await readFile(path.join(root, 'content/site.yml'), 'utf8');
  const bundle = await readContent(root);
  // Older content files may still contain a manual date; it must not override the build date.
  bundle.data.home.contentUpdated = '2000-01-01';
  for (const [instant, date, english, chinese] of [
    ['2026-12-31T15:59:59Z', '2026-12-31', 'Dec 31, 2026', '2026年12月31日'],
    ['2026-12-31T16:00:00Z', '2027-01-01', 'Jan 1, 2027', '2027年1月1日'],
  ]) {
    const out = await build({ root, bundle, now: new Date(instant) });
    for (const file of ['index.html', '404.html']) {
      const html = await readFile(path.join(out, file), 'utf8');
      const versions = JSON.parse(html.match(/<script id="language-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
      for (const [markup, label] of [[html, english], [versions.en.html, english], [versions.zh.html, chinese]]) {
        const footer = markup.match(/<footer[\s\S]*?<\/footer>/)[0];
        assert.ok(footer.includes(`<time datetime="${date}">${label}</time>`));
        assert.ok(footer.includes(`© ${date.slice(0, 4)}`));
        assert.ok(!footer.includes('2000-01-01'));
      }
    }
  }
  assert.equal(await readFile(path.join(root, 'content/site.yml'), 'utf8'), sourceBefore);
});
test('invalid content fails clearly and preserves the last good build', async t => {
  const root = await fixture(t); await build({ root });
  const before = await readFile(path.join(root, 'dist/index.html'), 'utf8');
  const bundle = await readContent(root); bundle.data.news = [{ date: '2023-02-30', body: 'Test update' }];
  assert.throws(() => validate(bundle), /valid date/);
  bundle.data.news[0].date = '2023-10-06'; bundle.data.profile.photo = '/images/missing.jpg';
  await assert.rejects(build({ root, bundle }), /Missing file/);
  assert.equal(await readFile(path.join(root, 'dist/index.html'), 'utf8'), before);
  bundle.data.profile.photo = '/images/xiaochen.jpg';
  bundle.data.research = [{ id: 'duplicate', title: 'Topic', category: 'Types', body: 'Description' }, { id: 'duplicate', title: 'Topic two', category: 'Types', body: 'Description two' }];
  assert.throws(() => validate(bundle), /unique/);
});
test('Markdown supports formatting and links while neutralizing scripts', () => {
  const html = md('**Hello** [link](https://example.com)\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))');
  assert.match(html, /<strong>Hello<\/strong>/); assert.match(html, /href="https:\/\/example.com"/);
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('href="javascript:'));
});
test('editor saves, backs up, detects conflicts, handles uploads, and rejects unsafe writes', async t => {
  const root = await fixture(t); const server = await startServer({ root, edit: true, port: 0 });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const original = await readFile(path.join(root, 'content/site.yml'), 'utf8');
  const get = await request(server, '/api/content'); assert.equal(get.status, 200);
  const session = JSON.parse(get.text);
  const headers = { 'Content-Type': 'application/json', 'X-Editor-Token': session.token, Origin: `http://127.0.0.1:${server.address().port}` };
  session.data.profile.name = 'Test Researcher';
  let result = await request(server, '/api/content', { method: 'PUT', headers, body: JSON.stringify(session) });
  assert.equal(result.status, 200, result.text); assert.equal((await readContent(root)).data.profile.name, 'Test Researcher');
  assert.match(await readFile(path.join(root, 'dist/index.html'), 'utf8'), /Test Researcher/);
  const backups = await readdir(path.join(root, '.cache/content-backups')); assert.equal(backups.length, 1);
  assert.equal(await readFile(path.join(root, '.cache/content-backups', backups[0], 'site.yml'), 'utf8'), original);
  assert.equal((await request(server, '/api/content', { method: 'PUT', headers, body: JSON.stringify(session) })).status, 409);
  for (const modified of [{ Origin: 'https://untrusted.example' }, { 'X-Editor-Token': 'wrong' }]) assert.equal((await request(server, '/api/content', { method: 'PUT', headers: { ...headers, ...modified }, body: '{}' })).status, 403);
  for (const headers of [{ Host: 'untrusted.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) assert.equal((await request(server, '/api/content', { headers })).status, 403);
  assert.equal((await request(server, '/%2e%2e%2fcontent/site.yml')).status, 403);
  const fresh = JSON.parse((await request(server, '/api/content')).text); fresh.data.profile.email = 'invalid';
  assert.equal((await request(server, '/api/content', { method: 'PUT', headers, body: JSON.stringify(fresh) })).status, 400);
  assert.equal((await readContent(root)).data.profile.name, 'Test Researcher');
  result = await request(server, '/api/upload?name=cv.pdf', { method: 'POST', headers, body: await readFile(path.join(root, 'public/file/XiaoChen_CV.pdf')) });
  assert.equal(result.status, 200); await access(path.join(root, 'public', JSON.parse(result.text).path));
  assert.equal((await request(server, '/api/upload?name=evil.svg', { method: 'POST', headers, body: '<svg><script>alert(1)</script></svg>' })).status, 400);
  assert.equal((await request(server, '/editor/')).status, 200); assert.equal((await request(server, '/research/')).status, 404);
  assert.equal((await request(server, '/missing')).status, 404);
});
test('preview mode never exposes the editor or write API', async t => {
  const root = await fixture(t); const server = await startServer({ root, port: 0 });
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.equal((await request(server, '/api/content')).status, 404); assert.equal((await request(server, '/editor/')).status, 404);
  assert.equal((await request(server, '/')).status, 200);
});

test('Chinese edits save independently, back up Chinese files, and reject unsupported languages', async t => {
  const root = await fixture(t); const server = await startServer({ root, edit: true, port: 0 });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const englishBefore = await readFile(path.join(root, 'content/site.yml'), 'utf8');
  const chineseBefore = await readFile(path.join(root, 'content/zh/about.md'), 'utf8');
  const session = JSON.parse((await request(server, '/api/content?lang=zh')).text);
  assert.equal(session.apiVersion, 2);
  session.about += '\n\n这是中文编辑保存测试。\n';
  const headers = { 'Content-Type': 'application/json', 'X-Editor-Token': session.token, Origin: `http://127.0.0.1:${server.address().port}` };
  const result = await request(server, '/api/content?lang=zh', { method: 'PUT', headers, body: JSON.stringify(session) });
  assert.equal(result.status, 200, result.text);
  assert.equal(await readFile(path.join(root, 'content/site.yml'), 'utf8'), englishBefore);
  assert.match((await readContent(root, 'zh')).about, /这是中文编辑保存测试/);
  const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
  const translations = JSON.parse(html.match(/<script id="language-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.match(translations.zh.html, /这是中文编辑保存测试/);
  assert.ok(!translations.en.html.includes('这是中文编辑保存测试'));
  const [backup] = await readdir(path.join(root, '.cache/content-backups'));
  assert.equal(await readFile(path.join(root, '.cache/content-backups', backup, 'zh/about.md'), 'utf8'), chineseBefore);
  assert.equal((await request(server, '/api/content?lang=zh', { method: 'PUT', headers, body: JSON.stringify(session) })).status, 409);
  assert.equal((await request(server, '/api/content?lang=../../')).status, 400);
  assert.equal((await request(server, '/api/content?lang=fr', { method: 'PUT', headers, body: JSON.stringify(session) })).status, 400);
});
