# Xiao Chen's website

A bilingual personal academic website with a browser-based content editor. No frontend coding is needed for everyday updates. English content works without JavaScript; language switching, theme switching, and the slower animated scrolling are progressive enhancements.

## Start here

Open Terminal in this folder and run:

```bash
./setup.sh       # Install what's missing; skip what's already installed
./edit.sh        # Start the browser editor and local preview
```

Open **http://127.0.0.1:4321/editor/** in any browser. No extension, login, or paid service is required. Keep the Terminal window running while you edit; press **Ctrl+C** to stop.

In the editor:

1. Choose **🇺🇸 English** or **🇨🇳 中文** under **Content language**, then pick **Profile**, **Biography**, **Ongoing research**, **Past research**, **Education**, **Misc**, or **Page settings**.
2. Change the text. Add, remove, or reorder entries with the buttons. Research entries also have a button to move between ongoing and past research while preserving their links. Choose a portrait or PDF CV directly from your computer when needed.
3. Click **Save & preview**. This writes your content files and rebuilds the local preview. The desktop/mobile buttons switch the embedded preview width.
4. When you're happy, commit and push with GitHub Desktop or Git. The GitHub Actions workflow builds and publishes the website.

**Saving in the editor is local. It does not publish to the internet.** The editor automatically backs up the selected language's three content files before each save in `.cache/content-backups/`. A stale tab cannot overwrite newer edits silently. If you see a conflict, copy any unsaved text before reloading. Save before changing the editor's language so unsaved edits are never discarded.

## Languages and appearance

Visitors can select **🇺🇸 English** or **🇨🇳 中文** in the header dropdown. The language changes on the same page and is remembered in that browser. Share `/?lang=zh` or `/?lang=en` to open a specific language; section links still work, for example `/?lang=zh#research`. A language switch retains the theme and the reader's position within the current section.

The Chinese version translates the biography, research project titles and progress, education, Misc, dates, headings, navigation, and accessibility labels. Research keywords, the research introduction, and all ongoing and past project descriptions stay in English, including subsection headings and tables. The CV remains the existing PDF. English and Chinese have separate editable files: future changes are not automatically translated or synchronized. When updating research keywords or descriptions, use the same English text in both versions. Both use the same portrait and CV; update the file paths in both versions if you want a replacement to appear in both.

The sun/moon button switches between pale grey and graphite, with a gentle color and icon transition. Section navigation uses an eased scroll of about one second. Manual scrolling interrupts it; the browser's reduced-motion preference disables animation.

## Build or preview without editing

```bash
./build.sh       # Compile to dist/
./preview.sh     # Compile and serve at http://127.0.0.1:4321/
```

`dist/` contains the complete public site, including the CV and images. You can also upload its contents to any static host. The editor, source files, and local backups are never included in the public build.

If port 4321 is busy, use `./edit.sh --port=4322` or `./preview.sh --port=4322`.

## Publish with GitHub Pages (one-time setup)

Open [this repository's Pages settings](https://github.com/chenxiao2402/chenxiao2402.github.io/settings/pages). Under **Build and deployment → Source**, select **GitHub Actions**. The publishing workflow already exists in `.github/workflows/pages.yml`; no additional workflow template is needed. Then commit and push your changes to `main`, or open **Actions → Build and deploy website → Run workflow** and choose `main`.

After that, every push to `main` automatically runs the tests, compiles the site, and publishes it at **https://chenxiao2402.github.io/**. Check the **Actions** tab for deployment progress. Pull requests run the same checks but do not deploy. You can also run the workflow manually from Actions.

The build uses Node.js and the `marked` and `yaml` packages. It has no Jekyll, Ruby, Bundler, Liquid, or theme dependencies. The empty `dist/.nojekyll` marker tells GitHub to skip Jekyll processing; it is not a dependency.

If the live homepage displays this README, check the Pages source setting above. **Deploy from a branch** can start GitHub's built-in **pages build and deployment** workflow, which renders the repository with Jekyll and can overwrite the custom workflow's deployment. Removing template files does not disable that repository setting. Select **GitHub Actions**, then rerun **Build and deploy website** to publish `dist/`.

The `github.io` address is the default Pages address, so no `CNAME` file is needed. If you use a custom domain later, configure it in GitHub Pages, change the Website URL in the editor, and add a `public/CNAME` file containing the domain.

See [GitHub's custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) for hosting details.

## Where your content lives

Use the browser editor for normal changes. The underlying files are intentionally simple, so you can also edit them on GitHub or in a text editor:

| File | Contents |
| --- | --- |
| `content/site.yml` | Profile, links, headings, ongoing and past research, education, Misc |
| `content/about.md` | Biography |
| `content/research.md` | Research introduction |
| `content/zh/site.yml` | Chinese profile, headings, ongoing and past research, education, and Misc |
| `content/zh/about.md` | Chinese biography |
| `content/zh/research.md` | Chinese research introduction |
| `public/images/` | Existing portrait, avatar, and university logos |
| `public/file/XiaoChen_CV.pdf` | Existing CV; its old public URL still works |
| `public/uploads/` | New images and PDFs uploaded through the editor |

Write ordinary paragraphs. Optional Markdown formatting:

```text
**bold text**
*italic text*
[a link](https://example.com)
```

Leave a blank line between paragraphs. Start a line with `- ` to make a bullet, as in Misc. Raw HTML is displayed as text, so you never need HTML tags. Research IDs use lowercase letters, numbers, and hyphens; an ID of `types-as-obligations` links to `/#research-types-as-obligations`. IDs must be unique across ongoing and past research; keep an ID stable when moving a project to preserve its link. Education appears one entry per row, newest first; use the move buttons to maintain reverse chronological order. Lists can be empty. Clear the education highlight to remove it.

The footer's **Content updated / 内容更新于** date is automatic: each build records its date in the **Asia/Shanghai** timezone for both languages. Saving in the editor, running `./build.sh`, or publishing through GitHub Actions refreshes it. The published date stays fixed until the next build; there is no date field to maintain.

Each research project has an optional **Progress** field in the editor (`status` in the content file). It appears beneath the topic labels; leave it blank to hide the line.

## Installation details

`setup.sh` supports macOS (Apple Silicon and Intel), Linux (ARM64 and x64), and Windows through WSL. It uses standard shell tools (`bash`, `curl`, `tar`, `awk`, and `shasum` or `sha256sum`). macOS and most Linux installations already include them; on minimal Linux, install those system utilities with your package manager first.

The script reuses Node.js 22+ and npm if available. Otherwise it downloads the official Node.js 24 LTS binary, verifies its SHA-256 checksum, and installs it **only inside `.tools/node/`**. It needs no administrator access and does not replace your system Node. Downloads require internet access on the first run.

It installs the two pinned dependencies (`marked` for Markdown and `yaml` for content) from `package-lock.json`. A fingerprint plus installed-package and import checks let subsequent runs skip installation. Changing the lockfile or deleting dependencies triggers a fresh installation. Local npm downloads are cached in `.cache/npm/`.

The build and editor scripts automatically run setup first. If Node is already on your PATH, the equivalent commands are `npm run build`, `npm run edit`, `npm run preview`, and `npm test`. If Node was installed locally, run `.tools/node/bin/node --test` for the checks.

## Rebuild notes

The original migration used the **published homepage** as its source of truth. The biography and research have since been updated. Ongoing projects and past research appear in separate sections, followed by education and Misc. Email, GitHub, and CV links appear beneath the portrait. About, Research, and Misc in the header jump to sections on the same page. CV is the only separate document and links directly to the PDF. The former Updates and Contact sections and their news feeds have been removed.

The old Jekyll layouts, Liquid includes, LESS files, jQuery plugins, icon fonts, IDE files, example publications, blog posts, papers, hobby pages, and unused funding configuration were removed. Earlier versions remain recoverable from Git history. The old template's license notice is retained in `LICENSE`.

Inspired by [ddadaal/ddadaal.me](https://github.com/ddadaal/ddadaal.me): separating content from implementation, static publishing, Markdown, and a theme preference. This implementation is independent, with just two build dependencies and no client-side framework. Typography uses system fonts, so the public pages require no external fonts or CDN requests.

## For a future developer

`scripts/build.mjs` validates both languages and builds to a staging directory before replacing `dist/`. It pre-renders English and embeds escaped, pre-rendered language content in the same HTML document; the browser swaps the content without another page or translation service. `scripts/i18n.mjs` holds interface labels. `src/` contains the public styles, language and theme controls, and scrolling behavior. `editor/` is a local-only form interface, served by `scripts/server.mjs` on loopback. Write requests require a same-origin session token; the editor is never deployed. `test/site.test.mjs` covers both translations, generated links, section placement, validation failures, Markdown, independent language saves and backups, project moves, stale writes, upload handling, and preview-only isolation.

The website is intended for a root-domain Pages site, not a project hosted under a subpath. No analytics, tracking scripts, remote database, or CMS service is needed.
