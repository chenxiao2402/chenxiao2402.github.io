let model, token, version, section = 'profile', language = 'en', dirty = false, busy = false;
const $ = selector => document.querySelector(selector);
function previewURL(refresh = false) {
  const anchor = { profile: 'about', about: 'about', research: 'research', education: 'education', news: 'updates', home: 'about' }[section];
  return `/?lang=${language}${refresh ? `&preview=${Date.now()}` : ''}#${anchor}`;
}
const sections = {
  profile: ['Profile', 'Your name, contact details, portrait, and CV.'],
  about: ['Biography', 'Introduce yourself in your own words. Paragraphs and links are welcome.'],
  research: ['Research', 'Add research topics, change their descriptions, and choose the order.'],
  education: ['Education', 'One entry per row. Keep entries in reverse chronological order, newest first, using the move buttons.'],
  news: ['Updates', 'News is displayed newest first. Add an update whenever you have something to share.'],
  home: ['Page settings', 'Headings, the education highlight, last-updated date, and search engine details.'],
};
function status(text, type = '') { $('#status').textContent = text; $('#status').className = type; }
function changed() { dirty = true; $('#save').disabled = busy; $('#save').textContent = 'Save & preview'; status('You have unsaved changes.', 'pending'); }
function field(parent, label, value, update, { area = false, long = false, hint = '', type = 'text', required = false } = {}) {
  const wrapper = document.createElement('label'); wrapper.className = 'field';
  const title = document.createElement('span'); title.textContent = label;
  const input = document.createElement(area ? 'textarea' : 'input');
  if (!area) input.type = type;
  input.value = value ?? ''; input.required = required;
  if (long) input.className = 'long';
  input.addEventListener('input', () => { update(input.value); changed(); });
  wrapper.append(title, input);
  if (hint) { const small = document.createElement('small'); small.textContent = hint; wrapper.append(small); }
  parent.append(wrapper); return input;
}
function help(parent) {
  const box = document.createElement('p'); box.className = 'format-help';
  box.textContent = 'Write plain text. For formatting: **bold**, *italic*, or [link text](https://example.com). Leave a blank line between paragraphs.';
  parent.append(box);
}
function upload(parent, label, key, accept) {
  const wrapper = document.createElement('label'); wrapper.className = 'field upload';
  const title = document.createElement('span'); title.textContent = label;
  const input = document.createElement('input'); input.type = 'file'; input.accept = accept;
  input.addEventListener('change', async () => {
    const file = input.files[0]; if (!file) return;
    busy = true; $('#save').disabled = true; status('Uploading file…');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Choose a file smaller than 10 MB.');
      const response = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'X-Editor-Token': token }, body: file });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      model.data.profile[key] = result.path; dirty = true; render(); status('File added. Save & preview to use it on your website.', 'pending');
    } catch (error) { status(error.message, 'error'); }
    finally { busy = false; $('#save').disabled = !dirty; }
  });
  wrapper.append(title, input); parent.append(wrapper);
}
const schemas = {
  research: [['title', 'Title'], ['id', 'Page anchor', { hint: 'A unique short name, such as complete-monitoring. Its homepage link is #research-complete-monitoring.' }], ['category', 'Topics'], ['body', 'Full description on the homepage', { area: true, long: true }]],
  education: [['institution', 'University'], ['degree', 'Degree'], ['location', 'Location'], ['dates', 'Dates'], ['logo', 'Logo image path', { hint: 'Optional. Existing logos: /images/iub.png, /images/nwu.png, /images/nju.png' }]],
  news: [['date', 'Date', { type: 'date' }], ['body', 'Update', { area: true }]],
};
function collection(parent, key) {
  const list = model.data[key];
  if (!list.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No entries yet. Add your first one below.'; parent.append(p); }
  list.forEach((item, index) => {
    const record = document.createElement('fieldset'); record.className = 'record';
    const legend = document.createElement('legend'); legend.textContent = `${index + 1}. ${item.title || item.institution || item.date || 'New entry'}`; record.append(legend);
    schemas[key].forEach(([property, label, options]) => field(record, label, item[property], value => { item[property] = value; }, options));
    const actions = document.createElement('div'); actions.className = 'record-actions';
    [['↑ Move up', index === 0, () => { [list[index - 1], list[index]] = [list[index], list[index - 1]]; }], ['↓ Move down', index === list.length - 1, () => { [list[index + 1], list[index]] = [list[index], list[index + 1]]; }], ['Remove', false, () => { list.splice(index, 1); }]].forEach(([label, disabled, action]) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.disabled = disabled;
      button.setAttribute('aria-label', `${label} entry ${index + 1}`);
      if (label === 'Remove') button.className = 'remove';
      button.addEventListener('click', () => { action(); changed(); render(); }); actions.append(button);
    });
    record.append(actions); parent.append(record);
  });
  const add = document.createElement('button'); add.type = 'button'; add.className = 'add-button'; add.textContent = `+ Add ${key === 'news' ? 'update' : key === 'education' ? 'education' : 'research topic'}`;
  add.addEventListener('click', () => {
    const item = Object.fromEntries(schemas[key].map(([property]) => [property, '']));
    if (key === 'news') item.date = new Date().toLocaleDateString('en-CA');
    if (key === 'research') item.id = `topic-${Date.now()}`;
    list.push(item); changed(); render();
    $('#content-form').querySelector('fieldset:last-of-type input')?.focus();
  }); parent.append(add);
}
function render() {
  $('#section-title').textContent = sections[section][0]; $('#section-help').textContent = sections[section][1];
  $('#section-label').textContent = `${language === 'zh' ? '中文' : 'English'} / ${sections[section][0]}`;
  const nav = $('#sections'); nav.replaceChildren();
  for (const [key, [label]] of Object.entries(sections)) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.setAttribute('aria-current', String(section === key));
    button.addEventListener('click', () => { section = key; render(); $('#preview').src = previewURL(); }); nav.append(button);
  }
  const form = $('#content-form'); form.replaceChildren();
  if (section === 'profile') {
    const fields = [['name','Name'], ['nativeName','Alternate name'], ['role','Title / role'], ['affiliation','Affiliation'], ['location','Location'], ['email','Email'], ['github','GitHub URL'], ['linkedin','LinkedIn URL'], ['photo','Portrait image path'], ['cv','CV file path']];
    for (const [key, label] of fields) {
      field(form, label, model.data.profile[key], value => { model.data.profile[key] = value; });
      if (key === 'photo') upload(form, 'Or choose a new portrait (up to 10 MB)', key, 'image/jpeg,image/png,image/webp');
      if (key === 'cv') upload(form, 'Or choose a new CV (up to 10 MB)', key, 'application/pdf');
    }
    field(form, 'Research interests', model.data.profile.interests.join('\n'), value => { model.data.profile.interests = value.split('\n').map(x => x.trim()).filter(Boolean); }, { area: true, hint: 'One interest per line.' });
  } else if (section === 'about') {
    help(form); field(form, 'About you', model.about, value => { model.about = value; }, { area: true, long: true });
  } else if (section === 'home') {
    const fields = [['researchHeading','Research heading'], ['educationHeading','Education heading'], ['newsHeading','Updates heading'], ['contactHeading','Contact heading'], ['contactText','Contact message'], ['educationNote','Education highlight (optional)'], ['contentUpdated','Content last updated']];
    for (const [key,label] of fields) field(form, label, model.data.home[key], value => { model.data.home[key] = value; }, key === 'contentUpdated' ? { type: 'date' } : {});
    for (const [key,label] of [['title','Browser title'],['description','Search engine description'],['url','Website URL']]) field(form, label, model.data.site[key], value => { model.data.site[key] = value; });
  } else {
    help(form);
    if (section === 'research') field(form, 'Research introduction', model.researchIntro, value => { model.researchIntro = value; }, { area: true });
    collection(form, section);
  }
}
$('#content-form').addEventListener('submit', event => event.preventDefault());
$('#save').addEventListener('click', async () => {
  if (busy) return; busy = true; $('#save').disabled = true; $('#save').textContent = 'Saving…';
  // Disable fields during a save to avoid losing edits made while the request is in flight.
  document.querySelectorAll('#content-form input, #content-form textarea, #content-form button, #sections button, #content-language').forEach(el => { el.dataset.wasDisabled = String(el.disabled); el.disabled = true; });
  status('Validating content and building your website…');
  try {
    const response = await fetch(`/api/content?lang=${language}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Editor-Token': token }, body: JSON.stringify({ ...model, version }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    version = result.version; dirty = false;
    status(result.message); $('#preview').src = previewURL(true);
  } catch (error) { status(error.message, 'error'); }
  finally {
    busy = false; $('#save').disabled = !dirty; $('#save').textContent = 'Save & preview';
    document.querySelectorAll('[data-was-disabled]').forEach(el => { el.disabled = el.dataset.wasDisabled === 'true'; delete el.dataset.wasDisabled; });
  }
});
for (const id of ['desktop', 'mobile']) $(`#${id}`).addEventListener('click', () => {
  $('#preview').classList.toggle('mobile', id === 'mobile');
  for (const key of ['desktop', 'mobile']) $(`#${key}`).setAttribute('aria-pressed', String(key === id));
});
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
async function loadLanguage(next) {
  busy = true;
  $('#content-language').disabled = true;
  $('#content-form').inert = true;
  $('#sections').inert = true;
  status('Loading content…');
  try {
    const response = await fetch(`/api/content?lang=${next}`); const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (result.apiVersion !== 2) throw new Error('The editor server needs a restart. Stop it with Ctrl+C, then run ./edit.sh again.');
    ({ token, version } = result);
    model = { data: result.data, about: result.about, researchIntro: result.researchIntro };
    language = next;
    $('#content-language').value = language;
    render();
    $('#preview').src = previewURL();
    $('#open-preview').href = `/?lang=${language}`;
    status(`Editing ${language === 'zh' ? 'Chinese' : 'English'}. Saves update this language only; nothing is published automatically.`);
  } catch (error) {
    if (!model) $('#section-title').textContent = 'Could not load content';
    $('#content-language').value = language;
    status(error.message, 'error');
  } finally {
    busy = false;
    $('#content-language').disabled = false;
    $('#content-form').inert = false;
    $('#sections').inert = false;
  }
}
$('#content-language').addEventListener('change', event => {
  if (dirty || busy) {
    event.target.value = language;
    status(busy ? 'Please wait for the current operation to finish.' : 'Save your changes before switching languages.', 'pending');
    return;
  }
  loadLanguage(event.target.value);
});
loadLanguage('en');
