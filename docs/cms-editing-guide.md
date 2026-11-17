# Editing the Breaking and Entering archive

Open [the editor](https://breaking-entering-archive.netlify.app/admin/) and choose **Login with GitHub**.

An administrator must configure GitHub authentication for the Netlify site once. Each editor also needs a GitHub account with write access to `simonwinkler101/breaking-entering-archive`.

If the sign-in popup returns **Not Found**, complete the one-time authentication setup under [Enable the editor](../README.md#enable-the-editor). Keep the client secret in Netlify’s provider form, outside repository files and chat.

## Editing an interview

Under **Archive entries**, open the artist and interview you want to change.

- **Summary** is the short description of the entry, separate from the transcript introduction.
- **Transcript** contains the complete reading copy as plain text. Its first paragraph is the transcript introduction. Keep a blank line after that introduction and between speaker turns. Start each turn with the speaker’s name and a colon, for example `Lauren:`, followed by their words. Do not add Markdown formatting or HTML. Keep private review notes, uncertainty markers and music annotations out of this field.
- **Presented by** changes presenter metadata used by search. It does not change speaker names or other wording inside the Transcript. Correct those separately wherever they appear.
- **Pull quote** is optional. When adding one, complete both the exact quotation and its speaker. Leave both blank to omit it.
- **Alternate artist names** supplies additional search spellings without displaying them on the page.

Leaving Transcript empty removes the reading section and its **Read** link. If the entry has a pull quote, remove that too before clearing the transcript.

Other editable fields include the artist, entry title, display date, duration, subjects, source labels and related entries. Keep the artist field to the artist’s name. The permanent ID is managed behind the editor; changing an artist or title does not change its address. Change format, sort date, year, source links and access only when correcting the corresponding facts. When adding hosted audio, complete both its permanent HTTPS address and audio type; recordings stay outside the website repository.

Adding and deleting whole archive entries is disabled in this editor.

## Editing the site introduction and links

Under **Site settings → Text and layout**, edit the credit line, wordmark, homepage introduction, archive line, search prompt and footer. This also contains the site title, description and public address used by search engines. Change the public address only as part of connecting the custom domain.

Under **Site settings → Projects and pages**, edit the Lauren Taylor + Simon Winkler popup and its separate `/about/` page: title, introduction, group headings, link names and addresses. The introduction appears on the separate page; the popup displays the title and grouped links. Keep link names plain, without arrows or icons. Spotify links are excluded.

Some interface labels, including **Read**, **Listen** and the format filters, are defined in the code rather than these settings.

## Saving and publishing

Use **Save** to preserve an edit as a draft without changing the public site. A draft can still trigger a preview build. Open it again under **Workflow** to continue editing; another save updates the same draft.

For the current batched releases, leave completed drafts unpublished so they can be combined into one release. The CMS does not combine multiple entries automatically. Publishing one entry merges that entry’s change and normally triggers a separate production deployment.

When an individual release is intended, check the draft’s external preview if available and confirm that the build checks have passed before using **Publish → Publish now**. The editor has no inline page preview.

Moving a draft between Workflow columns changes its status; it does not discard the edit. To abandon it, use the action for deleting the unpublished draft, if available. This removes the draft rather than the existing published entry. Verify that the draft has disappeared and the public version remains unchanged.

If saving or publishing fails, leave the draft in place and keep the error message. Possible causes include incomplete authentication, repository permissions, pending or failed build checks, branch rules or a conflict with another edit. Do not assume that every refusal is a build failure.

To correct something already published, edit it and save a new draft. Earlier versions remain in Git history for recovery.
