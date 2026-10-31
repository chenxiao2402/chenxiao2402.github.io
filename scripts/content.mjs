import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { Marked } from 'marked';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const escape = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function safeURL(value) {
  return typeof value === 'string' && /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(value) && !/[\s\u0000-\u001f\\]/.test(value);
}
const markdown = new Marked({
  gfm: true,
  renderer: {
    html({ text }) { return escape(text); },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      return safeURL(href) ? `<a href="${escape(href)}"${title ? ` title="${escape(title)}"` : ''}>${label}</a>` : label;
    },
    image({ href, text }) {
      return safeURL(href) ? `<img src="${escape(href)}" alt="${escape(text)}" loading="lazy">` : escape(text);
    },
  },
});
export const md = (value = '') => markdown.parse(value);
export const dateLabel = (date, language = 'en') => new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
export function contentFiles(language = 'en') {
  if (!['en', 'zh'].includes(language)) throw new Error('Unsupported language. Choose en or zh.');
  return ['site.yml', 'about.md', 'research.md'].map(file => language === 'zh' ? `zh/${file}` : file);
}

const required = (object, key, label, optional = false) => {
  if (typeof object?.[key] !== 'string' || (!optional && !object[key].trim())) throw new Error(`${label}: “${key}” must be ${optional ? 'text' : 'nonempty text'}.`);
};
export function validate(bundle) {
  const data = bundle?.data;
  if (!data || typeof data !== 'object') throw new Error('Site content is missing.');
  for (const key of ['title', 'description', 'url', 'language']) required(data.site, key, 'Site');
  let url;
  try { url = new URL(data.site.url); } catch { throw new Error('Site URL must be an absolute https:// or http:// URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Site URL must be a root URL, for example https://chenxiao2402.github.io.');
  for (const key of ['name', 'role', 'affiliation', 'location', 'email', 'photo', 'cv']) required(data.profile, key, 'Profile');
  for (const key of ['nativeName', 'github']) required(data.profile, key, 'Profile', true);
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(data.profile.email)) throw new Error('Enter a valid email address.');
  for (const key of ['github', 'photo', 'cv']) if (data.profile[key] && !safeURL(data.profile[key])) throw new Error(`Profile: invalid ${key} URL.`);
  if (!Array.isArray(data.profile.interests) || data.profile.interests.some(x => typeof x !== 'string' || !x.trim())) throw new Error('Interests must be a list of nonempty text labels.');
  for (const key of ['researchHeading', 'pastResearchHeading', 'educationHeading', 'miscHeading', 'educationNote']) required(data.home, key, 'Homepage', key === 'educationNote');
  required(data, 'misc', 'Misc', true);
  for (const key of ['about', 'researchIntro']) required(bundle, key, 'Content');
  for (const [collection, fields] of Object.entries({research: ['id', 'title', 'category', 'body'], pastResearch: ['id', 'title', 'category', 'body'], education: ['institution', 'degree', 'location', 'dates', 'logo']})) {
    if (!Array.isArray(data[collection])) throw new Error(`${collection} must be a list.`);
    for (const [i, item] of data[collection].entries()) {
      for (const key of fields) required(item, key, `${collection} entry ${i + 1}`, key === 'logo');
      if (item.logo && !safeURL(item.logo)) throw new Error(`Education entry ${i + 1}: invalid logo URL.`);
      if (item.id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)) throw new Error(`Research entry ${i + 1}: ID must use lowercase letters, numbers, and hyphens.`);
    }
  }
  const projects = [...data.research, ...data.pastResearch];
  for (const project of projects) if (project.status !== undefined) required(project, 'status', 'Research progress', true);
  if (new Set(projects.map(x => x.id)).size !== projects.length) throw new Error('Research IDs must be unique across ongoing and past research.');
  return bundle;
}
export async function validateAssets(bundle, root = ROOT) {
  const paths = [bundle.data.profile.photo, bundle.data.profile.cv, ...bundle.data.education.map(e => e.logo)].filter(p => p?.startsWith('/'));
  for (const asset of paths) {
    if (asset.includes('..') || asset.includes('?') || asset.includes('#')) throw new Error(`Invalid asset path: ${asset}`);
    try { await access(path.join(root, 'public', asset)); } catch { throw new Error(`Missing file: public${asset}. Add the file or update its path in the editor.`); }
  }
}
export async function readContent(root = ROOT, language = 'en') {
  const [yaml, about, researchIntro] = await Promise.all(contentFiles(language).map(f => readFile(path.join(root, 'content', f), 'utf8')));
  return validate({ data: YAML.parse(yaml), about, researchIntro });
}
