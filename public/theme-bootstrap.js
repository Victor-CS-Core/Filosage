(function () {
  var assetRecoveryKey = "erudoza-asset-recovery";

  window.addEventListener("error", function (event) {
    var target = event.target;
    if (!target || target.tagName !== "SCRIPT" || !target.src || target.src.indexOf("/assets/") === -1) return;

    try {
      if (sessionStorage.getItem(assetRecoveryKey) === target.src) return;
      sessionStorage.setItem(assetRecoveryKey, target.src);
    } catch (error) {
      // Storage can be unavailable in private browsing; a one-time reload is still safe.
    }

    var recoveryUrl = new URL(window.location.href);
    recoveryUrl.searchParams.set("asset-recovery", Date.now().toString());
    window.location.replace(recoveryUrl.toString());
  }, true);

  var theme = "light";
  try {
    var stored = localStorage.getItem("erudoza-theme") || localStorage.getItem("teach-theme");
    theme = stored === "light" || stored === "dark" ? stored : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch (error) {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", theme);
  var themeColor = theme === "dark" ? "#071127" : "#FAFAF7";
  document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
    meta.setAttribute("content", themeColor);
  });
}());
