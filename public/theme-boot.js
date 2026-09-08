(function () {
  try {
    var KEY = "kidease-theme";
    var raw = window.localStorage.getItem(KEY);
    var pref = raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
    var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var resolved = pref === "dark" || (pref === "system" && dark) ? "dark" : "light";
    var r = document.documentElement;
    r.dataset.theme = pref;
    r.dataset.resolvedTheme = resolved;
    r.style.colorScheme = resolved;
  } catch {
    document.documentElement.dataset.theme = "system";
  }
})();
