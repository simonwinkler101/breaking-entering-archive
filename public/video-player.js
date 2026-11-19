// Shared enhancement for the index and independent entry pages: an entry whose
// source is a YouTube video plays in place. Without this script, the same
// markup is an ordinary link to the video on YouTube.
//
// Nothing is requested from YouTube until someone asks to watch. The player
// then loads from YouTube's privacy-enhanced address, in a frame the width of
// the text column. Closing the entry, or pressing the word again, removes it.
(() => {
  if (!window.customElements || customElements.get("archive-video")) return;

  const validId = (id = "") => /^[A-Za-z0-9_-]{11}$/.test(id);
  const unmodified = (event) =>
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  class ArchiveVideo extends HTMLElement {
    connectedCallback() {
      // React may connect a custom element before inserting its children.
      queueMicrotask(() => this.isConnected && this.connect());
    }

    connect() {
      if (this.events) return;
      const id = this.dataset.videoId;
      const control = this.querySelector("a");
      if (!validId(id) || !control || !this.id) return;
      this.control = control;
      this.watchUrl = control.href;
      this.events = new AbortController();
      const options = { signal: this.events.signal };
      control.classList.add("video-toggle");
      control.setAttribute("aria-controls", this.id);
      this.reflect(false);
      // The element's own word, and any other link that names it (the entry
      // page's top row), open and close the video. A modified click still
      // opens YouTube in a new tab.
      document.addEventListener("click", (event) => {
        const link = event.target instanceof Element && event.target.closest("a");
        if (!link || !unmodified(event)) return;
        const named = link.hasAttribute("data-video-toggle") && link.getAttribute("aria-controls") === this.id;
        if (link !== control && !named) return;
        event.preventDefault();
        if (this.frame) this.close();
        else this.open(link !== control);
      }, options);
      // One thing plays at a time: a recording that starts closes the video.
      document.addEventListener("play", (event) => {
        if (event.target instanceof HTMLMediaElement) this.close();
      }, { capture: true, signal: this.events.signal });
    }

    // Every link that controls this video shows whether it is open.
    reflect(open) {
      const links = [this.control, ...document.querySelectorAll("a[data-video-toggle]")]
        .filter((link) => link && (link === this.control || link.getAttribute("aria-controls") === this.id));
      for (const link of links) link.setAttribute("aria-expanded", String(open));
      this.toggleAttribute("data-open", open);
    }

    open(fromElsewhere = false) {
      if (this.frame || !this.events) return;
      document.querySelectorAll("audio").forEach((audio) => audio.pause());
      document.querySelectorAll("archive-video").forEach((other) => {
        if (other !== this && typeof other.close === "function") other.close();
      });
      const title = this.dataset.title || "video";
      const frame = document.createElement("div");
      frame.className = "video-frame";
      const player = document.createElement("iframe");
      player.src = `https://www.youtube-nocookie.com/embed/${this.dataset.videoId}?autoplay=1&playsinline=1&rel=0`;
      player.title = `Video: ${title}`;
      player.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      player.allowFullscreen = true;
      player.referrerPolicy = "strict-origin-when-cross-origin";
      frame.append(player);
      const credit = document.createElement("p");
      credit.className = "audio-credit";
      const source = document.createElement("a");
      source.href = this.watchUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = this.dataset.source || "YouTube";
      credit.append("Source: ", source);
      this.append(frame, credit);
      this.frame = frame;
      this.credit = credit;
      this.reflect(true);
      // Bring the whole frame on screen; from the top row, bring it to the top.
      this.scrollIntoView({ block: fromElsewhere ? "start" : "nearest", behavior: calm() ? "auto" : "smooth" });
    }

    close() {
      if (!this.frame) return;
      this.frame.remove();
      this.credit?.remove();
      this.frame = null;
      this.credit = null;
      if (this.control) this.reflect(false);
    }

    disconnectedCallback() {
      this.close();
      this.events?.abort();
      this.events = null;
      this.control?.removeAttribute("aria-expanded");
    }
  }
  customElements.define("archive-video", ArchiveVideo);
})();
