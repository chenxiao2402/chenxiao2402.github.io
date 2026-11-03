import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm, access, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { runInNewContext } from 'node:vm';
import YAML from 'yaml';
import { ROOT, readContent, validate, md, escape } from '../scripts/content.mjs';
import { build } from '../scripts/build.mjs';
import { startServer } from '../scripts/server.mjs';

const versions = html => JSON.parse(html.match(/<script id="language-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const projects = bundle => [...bundle.data.research, ...bundle.data.pastResearch];
const homeCopy = project => project.summary?.trim() ? project.summary : project.body;

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
  const translations = documents.map(versions);
  const chinese = await readContent(root, 'zh');
  const japanese = await readContent(root, 'ja');
  assert.deepEqual(Object.keys(translations[0]).sort(), ['en', 'ja', 'zh']);
  assert.match(documents[0], /<html lang="en">/);
  assert.equal(translations[0].ja.lang, 'ja');
  assert.equal(translations[0].ja.title, japanese.data.site.title);
  assert.equal(translations[0].ja.description, japanese.data.site.description);
  assert.ok(translations[0].ja.html.includes(md(japanese.about)));
  const japaneseBiography = translations[0].ja.html.match(/<div class="prose about-copy">([\s\S]*?)<\/div>/)[1];
  assert.ok(!japaneseBiography.includes('**'), 'Japanese biography emphasis must render without literal Markdown markers.');
  assert.notEqual(japanese.about, bundle.about);
  assert.ok(translations[0].ja.html.includes(`<div class="prose research-intro" lang="en">${md(japanese.researchIntro)}</div>`));
  for (const html of documents) {
    const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)[1];
    const alternate = html.match(/<link\b[^>]*hreflang="ja"[^>]*>/)?.[0];
    assert.ok(alternate?.includes('rel="alternate"'));
    assert.ok(alternate.includes(`href="${canonical}?lang=ja"`));
  }
  assert.equal(translations[0].zh.lang, 'zh-CN');
  assert.equal(translations[0].zh.title, chinese.data.site.title);
  assert.ok(translations[0].zh.html.includes(md(chinese.about)));
  assert.ok(translations[0].zh.html.includes(md(chinese.researchIntro)));
  for (const row of chinese.data.research) assert.ok(translations[0].zh.html.includes(md(homeCopy(row))));
  for (const row of chinese.data.education) assert.ok(translations[0].zh.html.includes(escape(row.institution)));
  for (const row of chinese.data.pastResearch) assert.ok(translations[0].zh.html.includes(md(homeCopy(row))));
  assert.ok(translations[0].zh.html.includes(md(chinese.data.misc)));
  assert.match(translations[0].zh.html, /🇺🇸/);
  assert.match(translations[0].zh.html, /🇨🇳/);
  assert.match(translations[0].zh.html, /简体中文/);
  assert.match(translations[0].zh.html, /aria-haspopup="menu"/);
  assert.match(translations[0].zh.html, /role="menuitemradio" aria-checked="true" data-language-option="zh"/);
  assert.match(translations[0].en.html, /role="menuitemradio" aria-checked="true" data-language-option="en"/);
  assert.match(translations[0].zh.html, /sun-icon/);
  assert.match(translations[0].zh.html, /moon-icon/);
  assert.match(translations[1].zh.html, /页面未找到/);
  assert.match(translations[0].ja.html, /🇯🇵/);
  assert.match(translations[0].ja.html, /日本語/);
  assert.match(translations[0].ja.html, /role="menuitemradio" aria-checked="true" data-language-option="ja"/);
  assert.equal(translations[1].ja.lang, 'ja');
  assert.ok(translations[1].ja.html.includes('href="/?lang=ja"'));
  assert.notEqual(translations[1].ja.title, translations[1].en.title);
  assert.ok(documents[0].includes(md(bundle.about)));
  assert.ok(documents[0].includes(md(bundle.researchIntro)));
  const navigation = documents[0].match(/<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/)[1];
  assert.deepEqual([...navigation.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ['#about', '#research', '#misc', escape(bundle.data.profile.cv)]);
  const education = [...documents[0].matchAll(/<article class="education-row">([\s\S]*?)<\/article>/g)].map(match => match[1]);
  assert.equal(education.length, bundle.data.education.length);
  for (const [i, row] of bundle.data.education.entries()) {
    assert.ok(education[i].includes(escape(row.institution)));
    assert.ok(education[i].includes(escape(row.dates)));
    assert.ok(education[i].includes(escape(row.degree)));
  }
  for (const [language, content] of [['en', bundle], ['zh', chinese], ['ja', japanese]]) {
    const html = translations[0][language].html;
    for (const [id, rows] of [['research', content.data.research], ['past-research', content.data.pastResearch]]) {
      const section = html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?<\\/section>`))[0];
      for (const row of rows) {
        assert.ok(section.includes(md(homeCopy(row))), `${row.id} belongs in ${id}`);
        if (row.summary?.trim()) {
          assert.ok(section.includes(`href="/research/${row.id}/${language === 'en' ? '' : `?lang=${language}`}"`));
          if (row.summary !== row.body) assert.ok(!section.includes(md(row.body)), `${row.id} keeps its full description on its detail page.`);
        }
        if (row.status) assert.ok(section.includes(escape(row.status)), `${row.id} preserves its progress description`);
        assert.equal(html.split(`id="research-${row.id}"`).length - 1, 1, 'Project anchors must appear exactly once.');
      }
    }
    const misc = html.match(/<section[^>]*id="misc"[\s\S]*?<\/section>/)[0];
    assert.ok(misc.includes(md(content.data.misc)));
    assert.ok(!/id="updates"|contact-section|feed(?:-zh)?\.xml/.test(html));
  }
  await assert.rejects(access(path.join(out, 'research/index.html')), 'Research must not have a separate index page.');
  const detailIDs = new Set([...projects(bundle), ...projects(chinese), ...projects(japanese)].filter(row => row.summary?.trim()).map(row => row.id));
  const detailDocuments = await Promise.all([...detailIDs].map(id => readFile(path.join(out, 'research', id, 'index.html'), 'utf8')));
  for (const html of [...documents, ...translations.flatMap(t => Object.values(t).map(version => version.html)), ...detailDocuments, ...detailDocuments.flatMap(html => Object.values(versions(html)).map(version => version.html))]) {
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
  for (const file of ['.nojekyll', 'robots.txt', 'sitemap.xml', 'file/XiaoChen_CV.pdf']) await access(path.join(out, file));
  assert.ok(!(await readFile(path.join(out, 'sitemap.xml'), 'utf8')).includes('/research/'));
  for (const file of ['feed.xml', 'feed-zh.xml']) await assert.rejects(access(path.join(out, file)));
  await assert.rejects(access(path.join(out, 'editor'))); await assert.rejects(access(path.join(out, 'content')));
});
test('research summaries link to complete localized details while blank summaries retain homepage bodies', async t => {
  const root = await fixture(t);
  const english = await readContent(root);
  const chinese = await readContent(root, 'zh');
  const japanese = await readContent(root, 'ja');
  for (const bundle of [english, chinese, japanese]) for (const project of projects(bundle)) delete project.summary;
  const project = english.data.research[0];
  const translated = projects(chinese).find(row => row.id === project.id);
  project.summary = 'A short **homepage overview** with a [reference](https://example.com).';
  translated.summary = '这是一段用于首页的**研究概述**。';
  translated.title = '本地化的研究标题';
  translated.category = '类型理论 · 程序语言';
  translated.status = '论文准备中。';
  const japaneseProject = projects(japanese).find(row => row.id === project.id);
  japaneseProject.summary = project.summary;
  const blank = english.data.research[1];
  blank.summary = ' \n\t ';
  projects(chinese).find(row => row.id === blank.id).summary = '';
  const past = chinese.data.pastResearch[0];
  past.summary = '仅中文版包含这个项目的概述。';
  await writeFile(path.join(root, 'content/zh/site.yml'), YAML.stringify(chinese.data));
  await writeFile(path.join(root, 'content/ja/site.yml'), YAML.stringify(japanese.data));
  const out = await build({ root, bundle: english });
  const home = versions(await readFile(path.join(out, 'index.html'), 'utf8'));
  const detail = await readFile(path.join(out, 'research', project.id, 'index.html'), 'utf8');
  const detailVersions = versions(detail);
  assert.match(detail, /<meta name="robots" content="[^"]*\bnoindex\b/);
  const canonical = `${english.data.site.url.replace(/\/$/, '')}/research/${project.id}/`;
  assert.ok(detail.includes(`<link rel="canonical" href="${escape(canonical)}">`));
  assert.ok(detail.includes(`<meta property="og:url" content="${escape(canonical)}">`));
  const alternate = detail.match(/<link\b[^>]*hreflang="ja"[^>]*>/)?.[0];
  assert.ok(alternate?.includes(`href="${escape(canonical)}?lang=ja"`));
  for (const [language, bundle, row] of [['en', english, project], ['zh', chinese, translated], ['ja', japanese, japaneseProject]]) {
    const version = detailVersions[language];
    const homepage = language === 'en' ? '/' : `/?lang=${language}`;
    assert.equal(version.lang, bundle.data.site.language);
    assert.ok(version.title.includes(row.title));
    assert.ok(version.html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1].includes(escape(row.title)));
    assert.ok(version.html.includes(escape(row.category)));
    assert.ok(version.html.includes(escape(row.status)));
    assert.ok(version.html.includes(md(row.body)), 'The full Markdown body must reach the detail page unchanged.');
    assert.ok(home[language].html.includes(md(row.summary)));
    assert.ok(!home[language].html.includes(md(row.body)));
    assert.ok(home[language].html.includes(`href="/research/${row.id}/${language === 'en' ? '' : `?lang=${language}`}"`));
    assert.ok(version.html.includes(`href="${homepage}#research-${row.id}"`));
    const navigation = version.html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/)[1];
    assert.deepEqual([...navigation.matchAll(/href="([^"]+)"/g)].map(match => match[1]), [`${homepage}#about`, `${homepage}#research`, `${homepage}#misc`, escape(bundle.data.profile.cv)]);
    assert.match(version.html, /data-language-option="en"/);
    assert.match(version.html, /data-language-option="zh"/);
    assert.match(version.html, /data-language-option="ja"/);
    assert.match(version.html, /theme-toggle/);
  }
  assert.ok(home.en.html.includes(md(blank.body)));
  assert.ok(home.zh.html.includes(md(projects(chinese).find(row => row.id === blank.id).body)));
  assert.ok(home.ja.html.includes(md(projects(japanese).find(row => row.id === blank.id).body)));
  assert.ok(!home.en.html.includes(`href="/research/${blank.id}/"`));
  await assert.rejects(access(path.join(out, 'research', blank.id, 'index.html')));
  const pastVersions = versions(await readFile(path.join(out, 'research', past.id, 'index.html'), 'utf8'));
  const englishPast = projects(english).find(row => row.id === past.id);
  assert.ok(pastVersions.en.html.includes(md(englishPast.body)), 'A Chinese-only summary still generates every detail language.');
  assert.ok(pastVersions.ja.html.includes(md(projects(japanese).find(row => row.id === past.id).body)));
  assert.ok(pastVersions.zh.html.includes(md(past.body)));
  assert.ok(home.en.html.includes(md(englishPast.body)));
  assert.ok(!home.en.html.includes(`href="/research/${past.id}/"`));
  assert.ok(home.zh.html.includes(`href="/research/${past.id}/?lang=zh"`));
});
test('footer records the latest build date in Shanghai for every language and page type', async t => {
  const root = await fixture(t);
  const sourceBefore = await readFile(path.join(root, 'content/site.yml'), 'utf8');
  const bundle = await readContent(root);
  // Older content files may still contain a manual date; it must not override the build date.
  bundle.data.home.contentUpdated = '2000-01-01';
  for (const [instant, date, english, chinese, japanese] of [
    ['2026-12-31T15:59:59Z', '2026-12-31', 'Dec 31, 2026', '2026年12月31日', '2026年12月31日'],
    ['2026-12-31T16:00:00Z', '2027-01-01', 'Jan 1, 2027', '2027年1月1日', '2027年1月1日'],
  ]) {
    const out = await build({ root, bundle, now: new Date(instant) });
    for (const file of ['index.html', '404.html', `research/${bundle.data.research[0].id}/index.html`]) {
      const html = await readFile(path.join(out, file), 'utf8');
      const versions = JSON.parse(html.match(/<script id="language-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
      for (const [markup, label] of [[html, english], [versions.en.html, english], [versions.zh.html, chinese], [versions.ja.html, japanese]]) {
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
  const bundle = await readContent(root); bundle.data.misc = null;
  assert.throws(() => validate(bundle), /Misc/);
  bundle.data.misc = ''; bundle.data.profile.photo = '/images/missing.jpg';
  await assert.rejects(build({ root, bundle }), /Missing file/);
  assert.equal(await readFile(path.join(root, 'dist/index.html'), 'utf8'), before);
  bundle.data.profile.photo = '/images/xiaochen.jpg';
  const originalPast = bundle.data.pastResearch;
  bundle.data.pastResearch = [structuredClone(bundle.data.research[0])];
  assert.throws(() => validate(bundle), /unique/);
  bundle.data.pastResearch = originalPast;
  for (const collection of ['research', 'pastResearch']) {
    const project = bundle.data[collection][0];
    for (const invalid of [null, 42, false, [], {}]) {
      project.summary = invalid;
      assert.throws(() => validate(bundle), /summary/, 'Optional summaries must still be strings when present.');
    }
    for (const valid of ['', ' \n\t ', '**Short summary.**']) {
      project.summary = valid;
      assert.doesNotThrow(() => validate(bundle));
    }
    delete project.summary;
    assert.doesNotThrow(() => validate(bundle));
  }
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
  const originalBodies = projects(session).map(({ id, body }) => ({ id, body }));
  session.data.profile.name = 'Test Researcher';
  session.data.research[0].summary = 'Edited **homepage summary**.';
  let result = await request(server, '/api/content', { method: 'PUT', headers, body: JSON.stringify(session) });
  assert.equal(result.status, 200, result.text); assert.equal((await readContent(root)).data.profile.name, 'Test Researcher');
  const saved = await readContent(root);
  assert.deepEqual(projects(saved).map(({ id, body }) => ({ id, body })), originalBodies, 'Saving a summary must preserve every full description verbatim.');
  assert.equal(saved.data.research[0].summary, session.data.research[0].summary);
  assert.ok((await readFile(path.join(root, 'dist/index.html'), 'utf8')).includes(md(saved.data.research[0].summary)));
  const detail = await request(server, `/research/${saved.data.research[0].id}/`);
  assert.equal(detail.status, 200);
  assert.ok(detail.text.includes(md(saved.data.research[0].body)));
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
  assert.equal(session.apiVersion, 3);
  session.about += '\n\n这是中文编辑保存测试。\n';
  session.data.misc += '\n- 新的个人项目。\n';
  const movedProject = session.data.research.shift();
  movedProject.summary = '移动到过往研究后仍保留完整项目说明。';
  session.data.pastResearch.push(movedProject);
  const headers = { 'Content-Type': 'application/json', 'X-Editor-Token': session.token, Origin: `http://127.0.0.1:${server.address().port}` };
  const result = await request(server, '/api/content?lang=zh', { method: 'PUT', headers, body: JSON.stringify(session) });
  assert.equal(result.status, 200, result.text);
  assert.equal(await readFile(path.join(root, 'content/site.yml'), 'utf8'), englishBefore);
  assert.match((await readContent(root, 'zh')).about, /这是中文编辑保存测试/);
  const saved = await readContent(root, 'zh');
  assert.match(saved.data.misc, /新的个人项目/);
  assert.ok(saved.data.pastResearch.some(project => project.id === movedProject.id));
  assert.ok(!saved.data.research.some(project => project.id === movedProject.id));
  const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
  const translations = JSON.parse(html.match(/<script id="language-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.match(translations.zh.html, /这是中文编辑保存测试/);
  assert.ok(!translations.en.html.includes('这是中文编辑保存测试'));
  assert.match(translations.zh.html, /新的个人项目/);
  const pastSection = translations.zh.html.match(/<section[^>]*id="past-research"[\s\S]*?<\/section>/)[0];
  assert.ok(pastSection.includes(`id="research-${movedProject.id}"`), 'Moving a project preserves its public anchor.');
  assert.ok(pastSection.includes(`href="/research/${movedProject.id}/?lang=zh"`));
  assert.ok(pastSection.includes(md(movedProject.summary)));
  const detail = await request(server, `/research/${movedProject.id}/?lang=zh`);
  assert.equal(detail.status, 200);
  const detailVersions = versions(detail.text);
  assert.ok(detailVersions.zh.html.includes(md(movedProject.body)), 'Moving a project in one language preserves its full detail page.');
  assert.ok(detailVersions.zh.html.includes(`href="/?lang=zh#research-${movedProject.id}"`));
  const englishProject = projects(await readContent(root)).find(row => row.id === movedProject.id);
  assert.ok(detailVersions.en.html.includes(md(englishProject.body)));
  const [backup] = await readdir(path.join(root, '.cache/content-backups'));
  assert.equal(await readFile(path.join(root, '.cache/content-backups', backup, 'zh/about.md'), 'utf8'), chineseBefore);
  assert.equal((await request(server, '/api/content?lang=zh', { method: 'PUT', headers, body: JSON.stringify(session) })).status, 409);
  assert.equal((await request(server, '/api/content?lang=../../')).status, 400);
  assert.equal((await request(server, '/api/content?lang=fr', { method: 'PUT', headers, body: JSON.stringify(session) })).status, 400);
});

test('Japanese editor saves are isolated, backed up, and protected against stale writes', async t => {
  const root = await fixture(t); const server = await startServer({ root, edit: true, port: 0 });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const names = ['site.yml', 'about.md', 'research.md'];
  const otherPaths = ['', 'zh/'].flatMap(prefix => names.map(name => path.join(root, 'content', `${prefix}${name}`)));
  const originals = await Promise.all(otherPaths.map(file => readFile(file, 'utf8')));
  const japaneseOriginals = await Promise.all(names.map(name => readFile(path.join(root, 'content/ja', name), 'utf8')));
  const get = await request(server, '/api/content?lang=ja');
  assert.equal(get.status, 200, get.text);
  const editor = await request(server, '/editor/');
  assert.match(editor.text, /<option\b[^>]*value="ja"[^>]*>[^<]*日本語/);
  const session = JSON.parse(get.text);
  assert.equal(session.apiVersion, 3);
  assert.equal(session.data.site.language, 'ja');
  const originalBodies = projects(session).map(({ id, body }) => ({ id, body }));
  session.about += '\n\n日本語の編集保存テストです。\n';
  session.data.research[0].status = '日本語版で進捗を更新しました。';
  const headers = { 'Content-Type': 'application/json', 'X-Editor-Token': session.token, Origin: `http://127.0.0.1:${server.address().port}` };
  const result = await request(server, '/api/content?lang=ja', { method: 'PUT', headers, body: JSON.stringify(session) });
  assert.equal(result.status, 200, result.text);
  const saved = await readContent(root, 'ja');
  assert.equal(saved.about, session.about);
  assert.equal(saved.data.research[0].status, session.data.research[0].status);
  assert.deepEqual(projects(saved).map(({ id, body }) => ({ id, body })), originalBodies);
  assert.deepEqual(await Promise.all(otherPaths.map(file => readFile(file, 'utf8'))), originals, 'Japanese saves must not rewrite English or Chinese content.');
  const home = versions(await readFile(path.join(root, 'dist/index.html'), 'utf8'));
  assert.match(home.ja.html, /日本語の編集保存テストです。/);
  for (const locale of ['en', 'zh']) assert.ok(!home[locale].html.includes('日本語の編集保存テストです。'));
  const detail = await request(server, `/research/${saved.data.research[0].id}/?lang=ja`);
  assert.equal(detail.status, 200);
  assert.ok(versions(detail.text).ja.html.includes(escape(session.data.research[0].status)));
  const backups = await readdir(path.join(root, '.cache/content-backups'));
  assert.equal(backups.length, 1);
  const backup = path.join(root, '.cache/content-backups', backups[0]);
  assert.deepEqual(await Promise.all(names.map(name => readFile(path.join(backup, 'ja', name), 'utf8'))), japaneseOriginals);
  await assert.rejects(access(path.join(backup, 'site.yml')));
  await assert.rejects(access(path.join(backup, 'zh')));
  assert.equal((await request(server, '/api/content?lang=ja', { method: 'PUT', headers, body: JSON.stringify(session) })).status, 409);
  assert.equal((await readContent(root, 'ja')).about, session.about);
});

test('client language selection honors Japanese URLs and saved preferences while retaining the current page', async () => {
  const source = await readFile(path.join(ROOT, 'src/site.js'), 'utf8');
  const translations = Object.fromEntries(['en', 'zh', 'ja'].map(code => [code, {
    lang: code === 'zh' ? 'zh-CN' : code, html: `<main>${code}</main>`, title: `${code} title`, description: `${code} description`, image: '/photo.jpg',
    darkTheme: `${code} dark`, lightTheme: `${code} light`, languageChanged: `${code} selected`,
  }]));
  function open(url, saved, { storageBlocked = false } = {}) {
    const location = new URL(url);
    const storage = new Map(saved === undefined ? [] : [['xiao-language', saved]]);
    const listeners = new Map();
    const node = () => ({ dataset: {}, hidden: true, setAttribute() {}, removeAttribute() {}, focus() {} });
    const ids = { 'language-data': { textContent: JSON.stringify(translations) }, 'site-shell': { innerHTML: translations.en.html }, 'language-status': { textContent: '' } };
    const selectors = new Map();
    const document = {
      documentElement: { dataset: {}, lang: 'en' }, title: translations.en.title,
      getElementById: id => ids[id] ?? null,
      querySelector: selector => {
        if (!selectors.has(selector)) selectors.set(selector, node());
        return selectors.get(selector);
      },
      querySelectorAll: () => [],
      addEventListener: (type, listener) => listeners.set(type, listener),
    };
    const window = { scrollY: 0, scrollTo() {}, addEventListener() {} };
    runInNewContext(source, {
      document, window, location, URL, navigator: { language: 'ja-JP' },
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      requestAnimationFrame: callback => { callback(); return 1; }, cancelAnimationFrame() {},
      history: { state: null, replaceState: (_state, _title, next) => { location.href = new URL(next, location).href; } },
      localStorage: {
        getItem(key) { if (storageBlocked) throw new Error('Storage unavailable'); return storage.get(key) ?? null; },
        setItem(key, value) { if (storageBlocked) throw new Error('Storage unavailable'); storage.set(key, value); },
      },
    }, { filename: 'site.js' });
    return { document, location, storage, ids, select: language => listeners.get('click')({ target: { closest: selector => selector === '[data-language-option]' ? { dataset: { languageOption: language } } : null } }) };
  }
  for (const [query, saved, expected] of [
    ['', undefined, 'en'], ['', 'ja', 'ja'], ['?lang=ja', 'zh', 'ja'], ['?lang=en', 'ja', 'en'],
    ['?lang=fr', 'ja', 'ja'], ['?lang=toString', 'invalid', 'en'], ['', 'toString', 'en'],
  ]) {
    const page = open(`https://example.com/research/example/${query}`, saved);
    assert.equal(page.document.documentElement.dataset.language, expected, `URL ${query || '(none)'}, saved ${saved}`);
    assert.equal(page.document.documentElement.lang, translations[expected].lang);
    assert.equal(page.document.title, translations[expected].title);
    assert.equal(page.document.querySelector('meta[name="description"]').content, translations[expected].description);
    assert.equal(page.storage.get('xiao-language'), expected);
  }
  const page = open('https://example.com/research/example/?preview=1#research-example', 'en');
  page.select('ja');
  assert.equal(page.document.documentElement.lang, 'ja');
  assert.equal(page.ids['site-shell'].innerHTML, translations.ja.html);
  assert.equal(page.storage.get('xiao-language'), 'ja');
  assert.equal(page.location.pathname, '/research/example/');
  assert.equal(page.location.searchParams.get('lang'), 'ja');
  assert.equal(page.location.searchParams.get('preview'), '1');
  assert.equal(page.location.hash, '#research-example');
  assert.equal(page.ids['language-status'].textContent, translations.ja.languageChanged);
  page.select('constructor');
  assert.equal(page.document.documentElement.lang, 'ja', 'Unsupported selections leave the current language intact.');
  const blocked = open('https://example.com/?lang=ja', undefined, { storageBlocked: true });
  assert.equal(blocked.document.documentElement.lang, 'ja');
});
