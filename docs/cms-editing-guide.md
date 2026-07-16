# Editing the archive at /admin/

A guide for Lauren and Simon. Everything here happens in the browser at
`https://breaking-entering-archive.netlify.app/admin/` — no Terminal, no
GitHub website.

## The normal flow

1. **Open the entry** you want to change and edit the text.
2. **Save draft** (top bar). Nothing is public yet — this quietly creates a
   working copy behind the scenes.
3. **Preview**: from the Workflow screen, open your draft and use the preview
   link once the automatic build finishes (usually one to two minutes).
4. **Publish**. When the small build check is green, choose
   **Publish → Publish now**. The site rebuilds and your change appears in
   production a minute or so later.

If Publish is refused, the build check probably hasn't finished — wait a
minute and try again. If it still refuses, the build found a real problem;
leave the draft in place and ask for help rather than forcing anything.

## Correcting a draft

Drafts live under **Workflow** in the top bar. Open the draft, edit again,
and Save draft — it updates the same working copy. You can keep refining a
draft as long as you like before publishing.

## Abandoning a draft

In the Workflow screen, drag the draft back or open it and choose
**Delete unpublished entry**. This discards only the draft; the published
site is untouched.

## Fixing a published mistake

There is no "undo" button, but fixing is the same as any edit: open the
entry, correct the text, Save draft, Publish. The previous version remains
safely in the site's history if it ever needs to be recovered.

## Fields to edit freely

Summary, transcript, pull quote, display date, duration, presenters,
subjects, alternate artist names and source labels are all ordinary text —
edit them whenever needed.

## Fields not to alter casually

- **ID** — never change after publishing; it is the entry's permanent
  address (`/archive/<id>/`) and changing it breaks shared links.
- **Format** — changes which section and colour the entry belongs to.
- **Sort date** — controls ordering; use `YYYY-MM-DD`.
- **Links (Primary link, Sources)** — must remain complete `https://`
  addresses.
- **Access** — reflects real availability; only change it when availability
  actually changed.

Adding or deleting whole entries is deliberately switched off in the CMS for
now — ask for that to be done deliberately when needed.
