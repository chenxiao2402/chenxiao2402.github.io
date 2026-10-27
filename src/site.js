const versions = JSON.parse(document.getElementById('language-data').textContent);
let language = 'en';
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
function isDark() { return (document.documentElement.dataset.theme ?? (systemTheme.matches ? 'dark' : 'light')) === 'dark'; }
function updateButton() {
  const button = document.querySelector('.theme-toggle');
  const label = versions[language][isDark() ? 'lightTheme' : 'darkTheme'];
  button.hidden = false;
  button.dataset.mode = isDark() ? 'dark' : 'light';
  button.setAttribute('aria-label', label);
  button.title = label;
}
systemTheme.addEventListener('change', updateButton);

function updateNavigation() {
  const target = document.getElementById(location.hash.slice(1));
  const section = target?.closest('section')?.id ?? 'about';
  for (const link of document.querySelectorAll('.site-header nav a[href^="#"]')) {
    if (link.hash === `#${section}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
window.addEventListener('hashchange', updateNavigation);

let scrollAnimation;
function stopScrolling() {
  if (scrollAnimation !== undefined) cancelAnimationFrame(scrollAnimation);
  scrollAnimation = undefined;
}
function scrollToSection(target) {
  stopScrolling();
  const start = window.scrollY;
  const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const limit = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const end = Math.max(0, Math.min(limit, start + target.getBoundingClientRect().top - padding));
  const focusTarget = () => {
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(end - start) < 2) {
    window.scrollTo({ top: end, behavior: 'instant' });
    focusTarget();
    return;
  }
  const duration = Math.min(1400, 900 + Math.abs(end - start) * 0.08);
  const began = performance.now();
  const frame = now => {
    const t = Math.min(1, (now - began) / duration);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    window.scrollTo({ top: start + (end - start) * eased, behavior: 'instant' });
    if (t < 1) scrollAnimation = requestAnimationFrame(frame);
    else { scrollAnimation = undefined; focusTarget(); }
  };
  scrollAnimation = requestAnimationFrame(frame);
}
for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
  window.addEventListener(event, stopScrolling, { passive: true });
}

function preferredLanguage() {
  const explicit = new URL(location.href).searchParams.get('lang');
  if (explicit === 'en' || explicit === 'zh') return explicit;
  try {
    const saved = localStorage.getItem('xiao-language');
    if (saved === 'en' || saved === 'zh') return saved;
  } catch { /* The language switch also works when storage is unavailable. */ }
  return 'en';
}

function showLanguage(next, { userInitiated = false } = {}) {
  if (!['en', 'zh'].includes(next)) return;
  stopScrolling();
  // Preserve the reader's position within the current section when its length changes.
  const current = [...document.querySelectorAll('#main section[id]')].filter(el => el.getBoundingClientRect().top <= 80).at(-1);
  const rect = current?.getBoundingClientRect();
  const progress = rect ? Math.max(0, Math.min(1, -rect.top / rect.height)) : 0;
  const previousScroll = window.scrollY;
  const changed = language !== next;
  language = next;
  const version = versions[language];
  if (changed) document.getElementById('site-shell').innerHTML = version.html;
  document.documentElement.lang = version.lang;
  document.documentElement.dataset.language = language;
  document.title = version.title;
  for (const [selector, value] of [
    ['meta[name="description"]', version.description],
    ['meta[property="og:title"]', version.title],
    ['meta[property="og:description"]', version.description],
    ['meta[property="og:image"]', version.image],
  ]) document.querySelector(selector).content = value;
  const feed = document.querySelector('link[type="application/rss+xml"]');
  feed.href = version.feed;
  feed.title = version.feedTitle;
  document.querySelector('.language-switch').hidden = false;
  updateButton();
  updateNavigation();
  try { localStorage.setItem('xiao-language', language); } catch { /* URL still records the selection. */ }
  if (userInitiated) {
    const url = new URL(location.href);
    url.searchParams.set('lang', language);
    history.replaceState(history.state, '', url);
    setLanguageMenu(false);
    document.querySelector('.language-trigger').focus({ preventScroll: true });
    if (changed) {
      const replacement = current && document.getElementById(current.id);
      const bounds = replacement?.getBoundingClientRect();
      const top = bounds ? bounds.top + window.scrollY + progress * bounds.height : previousScroll;
      window.scrollTo({ top, behavior: 'instant' });
    }
    document.getElementById('language-status').textContent = language === 'zh' ? '已切换为中文。' : 'Switched to English.';
  } else if (changed && location.hash) {
    requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' }));
  }
}

// Delegation keeps these controls working after the translated content is swapped in.
function setLanguageMenu(open, focus = false) {
  const trigger = document.querySelector('.language-trigger');
  const menu = document.querySelector('.language-menu');
  trigger.setAttribute('aria-expanded', String(open));
  menu.hidden = !open;
  if (focus) (open ? menu.querySelector('[aria-checked="true"]') : trigger).focus({ preventScroll: true });
}
document.addEventListener('click', event => {
  const languageButton = event.target.closest('[data-language-option]');
  if (languageButton) return showLanguage(languageButton.dataset.languageOption, { userInitiated: true });
  if (event.target.closest('.language-trigger')) {
    const open = document.querySelector('.language-trigger').getAttribute('aria-expanded') === 'true';
    setLanguageMenu(!open, event.detail === 0);
    return;
  }
  if (!event.target.closest('.language-switch')) setLanguageMenu(false);
  if (event.target.closest('.theme-toggle')) {
    const theme = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('xiao-theme', theme); } catch { /* Applies for this session. */ }
    updateButton();
    return;
  }
  const anchor = event.target.closest('a[href*="#"]');
  if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target || anchor.hasAttribute('download')) return;
  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash) return;
  let id;
  try { id = decodeURIComponent(url.hash.slice(1)); } catch { return; }
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  if (location.hash !== url.hash) history.pushState(history.state, '', url);
  updateNavigation();
  scrollToSection(target);
});
document.addEventListener('keydown', event => {
  const inTrigger = event.target.closest('.language-trigger');
  const inMenu = event.target.closest('.language-menu');
  if (!inTrigger && !inMenu) return;
  if (event.key === 'Escape') { event.preventDefault(); setLanguageMenu(false, true); return; }
  if (event.key === 'Tab') { setLanguageMenu(false, true); return; }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const menu = document.querySelector('.language-menu');
  const options = [...menu.querySelectorAll('[data-language-option]')];
  if (inTrigger) {
    setLanguageMenu(true);
    options[event.key === 'ArrowUp' || event.key === 'End' ? options.length - 1 : 0].focus();
  } else {
    const current = options.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[next].focus();
  }
});
window.addEventListener('popstate', () => showLanguage(preferredLanguage()));
showLanguage(preferredLanguage());
