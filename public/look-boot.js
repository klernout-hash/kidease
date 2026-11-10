/* Clean look preview. Today's look stays the default. Open any page with ?look=clean
   to try the new look on this device, and ?look=classic to go back. */
(function () {
  try {
    var KEY = "kidease-look";
    var DEFAULT_LOOK = "classic";
    var asked = /[?&]look=(clean|classic)(?:&|#|$)/.exec(window.location.search || "");
    var look = asked ? asked[1] : null;
    try {
      if (look) window.localStorage.setItem(KEY, look);
      else look = window.localStorage.getItem(KEY);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    if (look !== "clean" && look !== "classic") look = DEFAULT_LOOK;
    if (look === "clean") document.documentElement.dataset.look = "clean";
  } catch {
    /* keep today's look */
  }
})();
