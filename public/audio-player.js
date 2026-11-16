// Shared enhancement for the index and independent entry pages. Without this
// script, the same markup retains the browser's native audio controls.
(() => {
  if (!window.customElements || customElements.get("archive-audio")) return;

  const time = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
    const value = Math.floor(seconds);
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor(value / 60) % 60;
    const rest = String(value % 60).padStart(2, "0");
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
  };
  const durationHint = (value = "") => {
    if (!/^\d+(?::\d{2}){1,2}$/.test(value)) return NaN;
    return value.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);
  };

  class ArchiveAudio extends HTMLElement {
    connectedCallback() {
      // React may connect a custom element before inserting its children.
      queueMicrotask(() => this.isConnected && this.connect());
    }

    connect() {
      if (this.events) return;
      const audio = this.querySelector("audio");
      const source = audio?.querySelector("source");
      if (!audio || !source) return;
      this.audio = audio;
      this.source = source;
      this.sourceUrl ||= source.getAttribute("src");
      if (!this.sourceUrl) return;
      source.setAttribute("src", this.sourceUrl);
      this.events = new AbortController();
      const options = { signal: this.events.signal };
      const title = this.dataset.title || "recording";
      const controls = document.createElement("div");
      controls.className = "audio-controls";
      controls.setAttribute("role", "group");
      controls.setAttribute("aria-label", `Audio recording: ${title}`);
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "audio-toggle";
      const position = document.createElement("span");
      position.className = "audio-time";
      position.setAttribute("aria-hidden", "true");
      const seek = document.createElement("input");
      seek.type = "range";
      seek.className = "audio-seek";
      seek.min = "0";
      seek.max = "0";
      seek.step = "1";
      seek.value = "0";
      seek.disabled = true;
      seek.setAttribute("aria-label", `Seek in ${title}`);
      const status = document.createElement("span");
      status.className = "audio-status";
      status.setAttribute("role", "status");
      const knownDuration = durationHint(this.dataset.duration);
      const total = () => Number.isFinite(audio.duration) ? audio.duration : knownDuration;
      let pending = false;
      let failed = false;
      const update = () => {
        const playing = !audio.paused || pending;
        toggle.textContent = failed ? "Retry" : playing ? "Pause" : "Play";
        toggle.setAttribute("aria-label", `${failed ? "Retry" : playing ? "Pause" : "Play"} ${title}`);
        position.textContent = `${time(audio.currentTime)} / ${time(total())}`;
        seek.disabled = !Number.isFinite(audio.duration) || audio.duration <= 0;
        seek.max = seek.disabled ? "0" : String(audio.duration);
        seek.value = String(audio.currentTime);
        seek.setAttribute("aria-valuetext", `${time(audio.currentTime)} of ${time(total())}`);
        // Styling hooks: the played part of the line, and the playing state.
        const length = total();
        const played = Number.isFinite(length) && length > 0 ? Math.min(100, (audio.currentTime / length) * 100) : 0;
        this.style.setProperty("--played", `${played}%`);
        this.toggleAttribute("data-playing", playing && !failed);
      };
      // On a phone, the lock screen and notification controls name the
      // recording and can skip back or forward.
      const announce = () => {
        if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
        navigator.mediaSession.metadata = new MediaMetadata({
          title,
          artist: "Breaking and Entering",
          album: "Triple R",
        });
        const skip = (delta) => () => {
          const end = Number.isFinite(audio.duration) ? audio.duration : Infinity;
          audio.currentTime = Math.max(0, Math.min(end, audio.currentTime + delta));
        };
        for (const [action, handler] of [["seekbackward", skip(-15)], ["seekforward", skip(30)]]) {
          try {
            navigator.mediaSession.setActionHandler(action, handler);
          } catch {
            // Not every browser supports every action.
          }
        }
      };
      toggle.addEventListener("click", async () => {
        if (!audio.paused || pending) {
          pending = false;
          audio.pause();
          status.textContent = "";
          update();
          return;
        }
        if (failed || audio.error) audio.load();
        failed = false;
        pending = true;
        status.textContent = "Loading audio…";
        update();
        try {
          await audio.play();
        } catch (error) {
          if (!this.isConnected || error.name === "AbortError") return;
          pending = false;
          failed = true;
          status.textContent = "Audio could not be played. Try again or use the source link.";
          update();
        }
      }, options);
      seek.addEventListener("input", () => {
        if (!seek.disabled) audio.currentTime = Number(seek.value);
        update();
      }, options);
      audio.addEventListener("play", () => {
        document.querySelectorAll("archive-audio audio").forEach((other) => {
          if (other !== audio) other.pause();
        });
        announce();
        update();
      }, options);
      audio.addEventListener("playing", () => {
        pending = false;
        status.textContent = "";
        update();
      }, options);
      audio.addEventListener("waiting", () => {
        if (!audio.paused) status.textContent = "Loading audio…";
      }, options);
      audio.addEventListener("pause", () => {
        pending = false;
        if (!failed) status.textContent = "";
        update();
      }, options);
      const failedToLoad = () => {
        pending = false;
        failed = true;
        audio.pause();
        status.textContent = "Audio could not be loaded. Try again or use the source link.";
        update();
      };
      audio.addEventListener("error", failedToLoad, options);
      // A failed <source> can leave play() pending without an <audio> error.
      source.addEventListener("error", failedToLoad, options);
      ["loadedmetadata", "durationchange", "timeupdate", "ended"].forEach((event) => {
        audio.addEventListener(event, update, options);
      });
      controls.append(toggle, position, seek, status);
      this.append(controls);
      this.controls = controls;
      update();
      audio.controls = false;
      audio.hidden = true;
    }

    disconnectedCallback() {
      this.events?.abort();
      this.events = null;
      if (!this.audio) return;
      this.audio.pause();
      this.source?.removeAttribute("src");
      this.audio.load(); // Cancel an in-flight download when an entry closes.
      this.audio.controls = true;
      this.audio.hidden = false;
      this.controls?.remove();
    }
  }
  customElements.define("archive-audio", ArchiveAudio);
})();
