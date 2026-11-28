(function () {
  var raw;
  try {
    raw = window.localStorage.getItem("kidease-theme");
  } catch {
    // On a fresh install or with storage disabled, use the device setting.
  }
  var pref = raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
  var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  var resolved = pref === "dark" || (pref === "system" && dark) ? "dark" : "light";
  var root = document.documentElement;
  root.dataset.theme = pref;
  root.dataset.resolvedTheme = resolved;
  root.style.colorScheme = resolved;
})();
