# In-place video

An entry whose primary link (`href`) is a YouTube video plays on the archive
itself. There is nothing to add to the entry: `scripts/build-content.mjs` reads
the video's id from the link and records it as `display.youtubeId`. An entry
with a hosted recording (`audio`) keeps its audio player instead.

In the open index entry the word is **Watch**. On the entry's permanent page
the top row says **Watch** and the Watch section says **Play**. Pressing either
opens the video beneath it, in a frame the width of the text column that keeps
the shape of the screen. The word takes the signal colour while the video is
open; pressing it again, or closing the entry, removes the video. A link to the
video on YouTube stays under the frame as the source credit.

`public/video-player.js` does this for both the index and the permanent pages.
Nothing is requested from YouTube until someone asks to watch, and the player
then loads from YouTube's privacy-enhanced address (`youtube-nocookie.com`).
Without the script, the same words are ordinary links that open the video on
YouTube in a new tab; a modified click (Command or Control) does the same.

Limits to know about:

- YouTube draws its own controls, title and logo inside the frame. They cannot
  be restyled.
- On a phone, YouTube usually waits for a second tap on its own play button
  before the video starts.
- A video that is removed, made private or closed to embedding shows YouTube's
  own message in the frame. The source link under it still goes to YouTube.
  Correct or replace the entry's link in the editor.
- One thing plays at a time: opening a video pauses a recording, and starting a
  recording closes the video.

Verify a change at desktop and phone widths in the index and on a permanent
page: open and close with the pointer and with the keyboard, and check that
closing an index entry removes the frame.
