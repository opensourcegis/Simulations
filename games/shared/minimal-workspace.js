// Only setting groups use this enhancement, never renderers. Native details
// remains usable without JavaScript and keeps input nodes and values intact.
for (const settings of document.querySelectorAll(
  "[data-responsive-settings]",
)) {
  const media = window.matchMedia("(min-width: 801px)");
  const sync = () => {
    settings.open = media.matches;
  };
  sync();
  media.addEventListener("change", sync);
}
