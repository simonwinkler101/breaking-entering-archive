# Breaking and Entering Archive

A quiet, searchable index of Breaking and Entering interviews, guest mixes, live sessions and special programs.

## What is public

The website builds from the 160 records in `content/archive/`. Weekly Breaking and Entering broadcasts are deliberately kept out of the public build and search index; the 475 source records are preserved separately in `content/private/broadcast-archive.json` for a future, independent archive.

## Editing the archive

After the Netlify authentication step below, Lauren and Simon can use `/admin/` to:

- add and edit archive records, sources, tags and summaries;
- paste full transcripts—entries only show the small `T` marker when transcript text exists;
- choose a featured mix and change introductory or footer text;
- alter the number of records initially shown;
- manually connect related entries when the automatic artist-and-subject matching is not enough.

Each open entry also has a stable share address in the form `#entry/entry-id`; copying the browser URL reopens that record directly.

Every save updates this GitHub repository. Netlify then rebuilds and publishes the site automatically. The relationship labels used in the editor are internal and never appear on the public site.

## First Netlify deployment

1. In Netlify, choose **Add new project → Import an existing project**, connect GitHub, and select `simonwinkler101/breaking-entering-archive`.
2. Netlify will read `netlify.toml`; the build command is `npm run build` and the publish directory is `dist`.
3. Set the project name to `break-enter-archive` if it is available. This produces `break-enter-archive.netlify.app`.
4. Deploy the project.

## Enable the editor

This project uses Decap CMS's direct GitHub backend. Each editor needs push access to this repository.

1. In GitHub, create an OAuth App. Use the Netlify URL as its homepage and `https://api.netlify.com/auth/done` as the authorization callback URL.
2. In Netlify, open **Project configuration → Access & security → OAuth → Authentication providers**, install the GitHub provider, and enter the OAuth client ID and secret.
3. Visit `https://YOUR-NETLIFY-NAME.netlify.app/admin/` and sign in with GitHub.

## Local development

```sh
npm install
npm run dev
```

`npm run build` validates the public content, regenerates `data/archive-data.json`, and creates the deployable `dist/` directory.

## Content architecture

- `content/archive/*.json` — one editable public record per file
- `content/archive-associations.json` — hand-curated related-entry groups
- `content/site-settings.json` — editable text, featured entry and page size
- `content/private/broadcast-archive.json` — preserved broadcasts, never imported by the public application
- `scripts/build-content.mjs` — validation and build-time content compilation

The public site also associates records automatically using exact artist matches, artist mentions and shared non-generic subjects. Manually curated relationships take priority.

## Custom domain

Once `breakingandentering.com.au` is purchased, add it under **Domain management → Production domains** in Netlify and follow the DNS instructions shown there.
