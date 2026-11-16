(() => {
  const dialog = document.getElementById("projects-dialog");
  if (!dialog || typeof dialog.showModal !== "function") return;

  let opener;
  let previousOverflow;
  document.addEventListener("click", (event) => {
    const trigger = event.target instanceof Element && event.target.closest("[data-projects-trigger]");
    if (!trigger || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (dialog.open) return;
    opener = trigger;
    previousOverflow = document.documentElement.style.overflow;
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    document.querySelectorAll("[data-projects-trigger]").forEach((link) => link.setAttribute("aria-expanded", "true"));
  });

  const close = () => dialog.close();
  dialog.querySelector("[data-projects-close]").addEventListener("click", close);
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  dialog.addEventListener("keydown", (event) => {
    // Keep background archive shortcuts inactive while the dialog is open.
    event.stopPropagation();
    if (event.key !== "Tab") return;
    const links = [...dialog.querySelectorAll("button, a[href]")];
    const first = links[0];
    const last = links.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  dialog.addEventListener("close", () => {
    document.documentElement.style.overflow = previousOverflow;
    document.querySelectorAll("[data-projects-trigger]").forEach((link) => link.setAttribute("aria-expanded", "false"));
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  });

})();
