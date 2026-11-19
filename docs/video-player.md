# In-place video

An entry whose primary link (`href`) is a YouTube video shows that video on the
archive itself. There is nothing to add to the entry: `scripts/build-content.mjs`
reads the video's id from the link and records it as `display.youtubeId`. An
entry with a hosted recording (`audio`) keeps its audio player instead.

The video is there as soon as the entry is opened in the index, and on the
entry's permanent page, the way a recording's player is. It sits in a frame the
width of the text column that keeps the shape of the screen. It does not start
by itself: the visitor presses YouTube's own play button. Closing the index
entry removes it. A link to the video on YouTube stays under the frame as the
source credit. On the permanent page the top row's **Watch** leads to the
video, as **Listen** leads to a recording.

There is no script: `src/App.tsx` and `scripts/build-static-pages.mjs` write
the same frame, which loads YouTube's player from its privacy-enhanced address
(`youtube-nocookie.com`). On a permanent page the browser fetches the player
only as the frame nears the screen (`loading="lazy"`).

Decided on 20 November 2026, at Simon's request, in place of a first version
that loaded the player only when a **Watch** word was pressed. The reasons:
one tap fewer on a phone, where YouTube needs its own play button pressed
anyway, and the same behaviour as recordings. What it costs: a visitor's
browser contacts YouTube whenever a video entry is opened, played or not, and
YouTube's still image, title and play button show in the open entry.

Limits to know about:

- YouTube draws its own picture, controls, title and logo inside the frame.
  They cannot be restyled.
- Nothing plays by itself, and it should stay that way: opening an entry must
  not start sound, and Safari and phones would block it in any case.
- A video that is removed, made private or closed to embedding shows YouTube's
  own message in the frame. The source link under it still goes to YouTube.
  Correct or replace the entry's link in the editor.
- With scripting off, the frame shows YouTube's notice; the source link works.

Verify a change at desktop and phone widths in the index and on a permanent
page, and check that closing an index entry removes the frame.
