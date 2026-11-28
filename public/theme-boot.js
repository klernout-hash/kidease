(function () {
  // Light is the default for new visitors. A saved Light / Dark / System choice wins.
  var pref = "light";
  try {
    var raw = window.localStorage.getItem("kidease-theme");
    if (raw === "light" || raw === "dark" || raw === "system") pref = raw;
  } catch {
    /* storage blocked: keep the light default */
  }
  var dark = false;
  try {
    dark = pref === "system" && !!window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    dark = false;
  }
  var resolved = pref === "dark" || dark ? "dark" : "light";
  var r = document.documentElement;
  r.dataset.theme = pref;
  r.dataset.resolvedTheme = resolved;
  r.style.colorScheme = resolved;
})();
