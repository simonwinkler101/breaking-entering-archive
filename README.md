# Breaking and Entering Archive

A quiet, searchable index of Breaking and Entering interviews, guest mixes, live sessions and special programs.

## What is public

The website builds from the 170 records in `content/archive/`. Weekly Breaking and Entering broadcasts are deliberately kept out of the public build and search index; the 475 source records are preserved separately in `content/private/broadcast-archive.json` for a future, independent archive.

## Editing the archive

After the Netlify authentication step below, Lauren and Simon can use `/admin/` to:

- edit existing archive records, sources, tags and summaries;
- edit full transcripts, including their first-paragraph introductions and speaker labels;
- change the credit line, introduction and footer text;
- manually connect related entries when the automatic artist-and-subject matching is not enough.

Each entry has a permanent page in the form `/archive/entry-id/`. In the index, a name opens in place and the address changes to that permanent page. Opening the address directly, or sharing it, loads a complete, readable page with its own title, description, sources and any transcript. Older `#entry/entry-id` links continue to work in the application.

## Design

One typeface (Geist, self-hosted from `@fontsource-variable/geist`), black on white with one grey, and three sizes: the title, sized in CSS to fill the page width; a large size for names and the statement; and a small size for everything else. Vertical gaps are multiples of one spacing unit (`--unit`, one large line), and everything aligns to the page edge or the index column. There are no rules, boxes or menus.

The first screen is a title page: the credit, the title and the statement. A row of four small words sits at its foot (Search, then Interviews, Live and Mixes) and pins to the top as the list scrolls. Search and the three words lead into the list: clicking either scrolls to where the list begins, and Search also puts the cursor in place. The list is newest first, grouped by year, and an address with a format (`/#live`) opens straight into it.

Most source titles repeat the artist and the program name, so `scripts/build-content.mjs` derives a display name, a shorter display title and a readable duration for each entry at build time. Special programs and the program's own mixes show their title as the name. The stored titles are unchanged and still searchable.

Saving a draft updates a separate working branch and preview. Publishing merges
the entry's changes into protected `main` after the required checks pass;
Netlify then publishes the site. Keep completed drafts for combined releases
where practical to conserve production-deployment credits. The CMS does not
combine several entries into one release automatically. See
[`docs/cms-editing-guide.md`](docs/cms-editing-guide.md). The relationship labels
used in the editor are internal and never appear on the public site.

## First Netlify deployment

1. In Netlify, choose **Add new project → Import an existing project**, connect GitHub, and select `simonwinkler101/breaking-entering-archive`.
2. Netlify will read `netlify.toml`; the build command is `npm run build` and the publish directory is `dist`.
3. The existing project is named `breaking-entering-archive`, at `https://breaking-entering-archive.netlify.app`.
4. Deploy the project.

## Enable the editor

This project uses Decap CMS's direct GitHub backend. Each editor needs push access to this repository.

1. In [GitHub OAuth Apps](https://github.com/settings/developers), register an application named **Breaking and Entering Archive Editor**. Use `https://breaking-entering-archive.netlify.app` as its homepage and `https://api.netlify.com/auth/done` as its redirect URI. Generate its client secret and keep it private.
2. In Netlify, open **Project configuration → Security → OAuth → Authentication providers**, choose **Install provider**, select **GitHub**, and enter the client ID and secret there. Do not put either secret or access tokens in repository files, transcripts or chat.
3. Visit `https://breaking-entering-archive.netlify.app/admin/` and sign in with GitHub. The configured scope is `public_repo`, because this repository is public. Each editor needs GitHub write access to the archive repository; registration alone does not give that access.

If the authentication popup returns **Not Found**, check that the GitHub provider
has been installed for this Netlify project. The configuration explicitly uses
the production Netlify hostname for authentication, including from previews.
See [Netlify's provider setup](https://docs.netlify.com/manage/security/secure-access-to-sites/oauth-provider-tokens/)
and [Decap's GitHub backend](https://decapcms.org/docs/github-backend/).

## Local development

```sh
npm install
npm run dev
```

`npm run build` validates the public content, generates the untracked `data/` build outputs from canonical `content/` sources (including `content/archive-research.json`), builds the application, and then creates permanent entry pages, social metadata, structured data, `sitemap.xml` and `robots.txt` in the deployable `dist/` directory. `npm run dev` generates `data/` automatically first.

## Content architecture

- `content/archive/*.json` — one editable public record per file
- `content/archive-associations.json` — hand-curated related-entry groups
- `content/site-settings.json` — editable credit, introduction, search prompt and footer text
- `content/private/broadcast-archive.json` — preserved broadcasts, never imported by the public application
- `scripts/build-content.mjs` — validation and build-time content compilation
- `scripts/build-static-pages.mjs` — permanent entry pages and search-engine files

Interview acquisition, private transcription, editing and human review follow
[`docs/transcription-workflow.md`](docs/transcription-workflow.md). The reading
version preserves the guest's meaning, voice, facts and qualifications while
allowing supported recognition corrections, punctuation, sentence repair and
justified omissions. Questions may be tightened more strongly than answers;
unclear content is never replaced with invented wording. The shared workflow
defines the current editing and publication rules.

The public site also associates records automatically using exact artist matches, artist mentions and shared non-generic subjects. Manually curated relationships take priority.

## Search behaviour

Internal search ranks exact artist and title matches first, followed by alternate names, subjects, presenters, summaries, source information and transcripts. Accents, punctuation, capitalisation and `&`/`and` variations are normalised, and restrained typo matching helps with longer names. Every query word must match somewhere in a record, which keeps broad transcript searching from overwhelming more intentional results.

Alternate names can be added to any entry in `/admin/` without displaying them publicly. When a future transcript is the reason a record matched, the index shows a short transcript excerpt beneath that result.

## Search-engine setup

The canonical site address is editable under **Site settings → Text and layout → Search metadata**. It currently points to the Netlify address. Change it to `https://breakingandentering.com.au` immediately before the custom domain becomes the primary Netlify domain, then rebuild.

After the custom domain is live:

1. Create a Domain property for `breakingandentering.com.au` in Google Search Console and complete Google's DNS verification.
2. Submit `https://breakingandentering.com.au/sitemap.xml`.
3. Inspect the homepage and two or three entry URLs, then request indexing.

There is also an optional Google verification-code field in the CMS if meta-tag verification is preferred. DNS verification is normally cleaner for a full domain.

## Custom domain

Once `breakingandentering.com.au` is purchased, add it under **Domain management → Production domains** in Netlify and follow the DNS instructions shown there.
