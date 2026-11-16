# Audio delivery

The website stays on Netlify. Audio files live in the Cloudflare R2 Standard
bucket `breaking-entering-audio`, separately from the website repository.

`worker.js` streams those files through the R2 binding `AUDIO`. It supports
GET, HEAD, conditional requests and single byte ranges for seeking. It does
not expose bucket listings or writes. Native playback needs no credentials.
Keep bucket public access disabled: the Worker reads it through its binding.

Use content-hash filenames and never overwrite them. The Worker gives those
files a one-year immutable cache lifetime. Record the original source page,
checksum and upload receipt in the private media manifest. Do not put media,
private paths, raw transcripts, cookies or API credentials in this directory.

## Deployment

The initial Worker is `breaking-entering-audio` in the archive owner's
Cloudflare account. Bind `breaking-entering-audio` as `AUDIO`, then deploy
this exact module. `wrangler.jsonc` supplies the same configuration for a
future authenticated CLI deployment; no credentials are stored here.

The initial public address is
`https://breaking-entering-audio.simon-winkler.workers.dev`. Once the domain
is registered and configured, use `audio.breakingandentering.com.au` as the
final audio hostname. The website's primary domain can continue to point to
Netlify. Update entry audio URLs only after the new hostname serves and seeks
the existing objects successfully.

## Verification and rollback

Run `node infrastructure/audio/worker.test.mjs` for HTTP and range checks.
After deployment, verify one actual object with HEAD, GET, a suffix range
and playback seeking. Compare the returned bytes with the private upload
checksum. The Worker streams data rather than buffering full recordings.

If audio delivery fails, remove only the affected entry's optional `audio`
field and rebuild; its original Triple R link remains available. Revert to
the previous working Worker version in Cloudflare if the failure affects
every recording. Preserve all stored objects and private originals.

Only publish recordings covered by the applicable permission. Mixcloud and
SoundCloud downloads and reuploads are deferred; their existing links remain.
