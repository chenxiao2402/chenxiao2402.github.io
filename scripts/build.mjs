import { cp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, readContent, validate, validateAssets, escape as e, md, dateLabel } from './content.mjs';
import { UI } from './i18n.mjs';

const link = (url, label, cls = '') => `<a class="${cls}" href="${e(url)}">${label}</a>`;
function social(profile) {
  return profile.github ? link(profile.github, 'GitHub') : '';
}
function researchList(projects, { collapsible = false, ui } = {}) {
  return `<div class="research-list">${projects.map(r => {
    const title = `<h3>${e(r.title)}</h3>`;
    const description = `<p class="research-category" lang="en">${e(r.category)}</p>${r.status?.trim() ? `<p class="research-status">${e(r.status)}</p>` : ''}<div class="prose" lang="en">${md(r.body)}</div>`;
    const content = collapsible ? `<details class="past-research-details"><summary><h3><span>${e(r.title)}</span><span class="research-toggle-label"><span class="research-show">${ui.showDetails}</span><span class="research-hide">${ui.hideDetails}</span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></span></h3></summary><div class="past-research-body">${description}</div></details>` : `${title}${description}`;
    return `<article class="research-row" id="research-${e(r.id)}">${content}</article>`;
  }).join('')}</div>`;
}

function shell(data, body, { page = 'home', language = 'en', contentUpdated } = {}) {
  const p = data.profile;
  const ui = UI[language];
  const homepage = language === 'zh' ? '/?lang=zh' : '/';
  const sectionURL = id => `${page === 'home' ? '' : homepage}#${id}`;
  return `<a class="skip-link" href="#main">${ui.skip}</a>
  <header class="site-header wrap">
    <a class="wordmark" href="${homepage}" aria-label="${e(p.name)} ${ui.home}">${e(p.name)}</a>
    <nav aria-label="${ui.navigation}">
      <a href="${sectionURL('about')}">${ui.about}</a>
      <a href="${sectionURL('research')}">${ui.research}</a>
      <a href="${sectionURL('misc')}">${ui.misc}</a>
      <a href="${e(p.cv)}" aria-label="${ui.cvLabel}">${ui.cv}</a>
    </nav>
    <div class="header-controls">
      <div class="language-switch" hidden>
        <button class="language-trigger" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="language-menu" aria-label="${ui.language}: ${language === 'zh' ? '简体中文' : 'English'}"><span class="language-flag" aria-hidden="true">${language === 'zh' ? '🇨🇳' : '🇺🇸'}</span><span lang="${language === 'zh' ? 'zh-CN' : 'en'}">${language === 'zh' ? '简体中文' : 'English'}</span><svg class="language-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>
        <div class="language-menu" id="language-menu" role="menu" aria-label="${ui.language}" hidden><button type="button" role="menuitemradio" aria-checked="${language === 'zh'}" data-language-option="zh" lang="zh-CN" tabindex="-1"><span class="language-flag" aria-hidden="true">🇨🇳</span>简体中文</button><button type="button" role="menuitemradio" aria-checked="${language === 'en'}" data-language-option="en" lang="en" tabindex="-1"><span class="language-flag" aria-hidden="true">🇺🇸</span>English</button></div>
      </div>
      <button class="theme-toggle" type="button" aria-label="${ui.darkTheme}" title="${ui.darkTheme}" hidden><svg class="sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg><svg class="moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20.6 13.2A8.7 8.7 0 0 1 10.8 3.4 8.7 8.7 0 1 0 20.6 13.2Z"/></svg></button>
    </div>
  </header>
  <main id="main">${body}</main>
  <footer class="site-footer wrap">
    <span>© ${contentUpdated.slice(0, 4)} ${e(p.name)} <span class="footer-native" lang="${language === 'zh' ? 'en' : 'zh-CN'}">${e(p.nativeName)}</span></span>
    <span>${ui.contentUpdated} <time datetime="${contentUpdated}">${dateLabel(contentUpdated, language)}</time></span>
    <div><a href="https://github.com/chenxiao2402/chenxiao2402.github.io">${ui.source}</a><a href="#main">${ui.backToTop}</a></div>
  </footer>`;
}

function home(bundle, language) {
  const { data, about, researchIntro } = bundle;
  const { profile: p, home: h } = data;
  const ui = UI[language];
  return `
  <section class="hero wrap" id="about" aria-labelledby="intro-title">
    <div class="hero-main">
      <h1 id="intro-title">${e(p.name)} <span class="native-name" lang="${language === 'zh' ? 'en' : 'zh-CN'}">${e(p.nativeName)}</span></h1>
      <p class="hero-role">${e(p.role)}</p>
      <div class="prose about-copy">${md(about)}</div>
    </div>
    <aside class="portrait-panel" aria-label="${ui.profile}">
      <div class="portrait-frame"><img src="${e(p.photo)}" alt="${ui.portrait} ${e(p.name)}" width="1952" height="2603" fetchpriority="high"></div>
      <div class="portrait-caption"><strong>${e(p.affiliation)}</strong><span>${e(p.location)}</span></div>
      <div class="portrait-links">${link(`mailto:${p.email}`, e(p.email), 'text-link')}${social(p)}${link(p.cv, ui.cvPDF, 'text-link')}</div>
    </aside>
  </section>
  <div class="interest-strip wrap"><span>${ui.interests}</span><ul>${p.interests.map(x => `<li>${e(x)}</li>`).join('')}</ul></div>
  <section class="research-section wrap section-space" id="research" aria-labelledby="research-title">
    <h2 id="research-title">${e(h.researchHeading)}</h2>
    <div class="prose research-intro" lang="en">${md(researchIntro)}</div>
    ${researchList(data.research)}
  </section>
  ${data.pastResearch.length ? `<section class="past-research-section wrap section-space" id="past-research" aria-labelledby="past-research-title">
    <h2 id="past-research-title">${e(h.pastResearchHeading)}</h2>
    ${researchList(data.pastResearch, { collapsible: true, ui })}
  </section>` : ''}
  ${data.education.length ? `<section class="education-section section-space" id="education" aria-labelledby="education-title"><div class="wrap split-section">
    <div class="section-intro"><h2 id="education-title">${e(h.educationHeading)}</h2>${h.educationNote ? `<div class="education-note">${md(h.educationNote)}</div>` : ''}</div>
    <div class="education-list">${data.education.map(r => `<article class="education-row"><div class="school-logo">${r.logo ? `<img src="${e(r.logo)}" alt="" width="48" height="48" loading="lazy">` : ''}</div><div class="education-content"><h3>${e(r.institution)}</h3><div class="education-details"><p class="education-degree">${e(r.degree)}</p><p class="muted education-location">${e(r.location)}</p></div></div><p class="education-dates">${e(r.dates)}</p></article>`).join('')}</div>
  </div></section>` : ''}
  <section class="misc-section wrap section-space" id="misc" aria-labelledby="misc-title">
    <h2 id="misc-title">${e(h.miscHeading)}</h2>
    <div class="prose">${md(data.misc)}</div>
  </section>`;
}

function layout(bundles, contentUpdated, page = 'home') {
  const versions = Object.fromEntries(Object.entries(bundles).map(([language, bundle]) => {
    const { data } = bundle;
    const ui = UI[language];
    const body = page === 'home' ? home(bundle, language) : `<section class="wrap not-found"><p class="eyebrow">${ui.missingLabel}</p><h1>${ui.missingTitle}</h1><p>${ui.missingText}</p>${link(language === 'zh' ? '/?lang=zh' : '/', ui.backHome, 'button')}</section>`;
    return [language, { html: shell(data, body, { page, language, contentUpdated }), lang: data.site.language,
      title: page === 'home' ? data.site.title : `${ui.missingBrowserTitle} · ${data.profile.name}`,
      description: data.site.description, image: new URL(data.profile.photo, data.site.url).href,
      darkTheme: ui.darkTheme, lightTheme: ui.lightTheme }];
  }));
  const initial = versions.en;
  const canonical = `${bundles.en.data.site.url.replace(/\/$/, '')}/${page === '404' ? '404.html' : ''}`;
  // Escape '<' so content can never close this JSON script element.
  const languageData = JSON.stringify(versions).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="${e(initial.lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${e(initial.title)}</title>
  <meta name="description" content="${e(initial.description)}">
  ${page === '404' ? '<meta name="robots" content="noindex">' : ''}
  <link rel="canonical" href="${e(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${e(initial.title)}">
  <meta property="og:description" content="${e(initial.description)}">
  <meta property="og:url" content="${e(canonical)}">
  <meta property="og:image" content="${e(initial.image)}">
  <meta name="twitter:card" content="summary">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <script src="/assets/theme.js"></script>
  <link rel="stylesheet" href="/assets/site.css">
  <script defer src="/assets/site.js"></script>
</head>
<body>
  <div id="site-shell">${initial.html}</div>
  <div class="visually-hidden" id="language-status" role="status" aria-live="polite"></div>
  <script id="language-data" type="application/json">${languageData}</script>
</body>
</html>`;
}

export async function build({ root = ROOT, bundle, language = 'en', out = path.join(root, 'dist'), now = new Date() } = {}) {
  if (!['en', 'zh'].includes(language)) throw new Error('Unsupported language.');
  // Stamp the static output once, consistently on local machines and GitHub runners.
  const contentUpdated = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const bundles = Object.fromEntries(await Promise.all(['en', 'zh'].map(async code => [code, validate(code === language && bundle ? bundle : await readContent(root, code))])));
  for (const [code, content] of Object.entries(bundles)) {
    if (content.data.site.language !== (code === 'zh' ? 'zh-CN' : 'en')) throw new Error(`${code}: the page language must be ${code === 'zh' ? 'zh-CN' : 'en'}.`);
    await validateAssets(content, root);
  }
  const data = bundles.en.data;
  // Build in staging, so a validation or rendering failure leaves the last good site intact.
  const staging = `${out}.staging`;
  await rm(staging, { recursive: true, force: true });
  try {
    await mkdir(path.join(staging, 'assets'), { recursive: true });
    await cp(path.join(root, 'public'), staging, { recursive: true });
    for (const file of ['site.css', 'site.js', 'theme.js']) await cp(path.join(root, 'src', file), path.join(staging, 'assets', file));
    const base = data.site.url.replace(/\/$/, '');
    await Promise.all(Object.entries({
      'index.html': layout(bundles, contentUpdated), '404.html': layout(bundles, contentUpdated, '404'),
      'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${e(base)}/</loc></url></urlset>`,
      'robots.txt': `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`,
      '.nojekyll': '',
    }).map(([file, content]) => writeFile(path.join(staging, file), content)));
    await rm(out, { recursive: true, force: true });
    await rename(staging, out);
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
  return out;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(`Built website → ${await build()}`); }
  catch (error) { console.error(`Build failed: ${error.message}`); process.exitCode = 1; }
}
