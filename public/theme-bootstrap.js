(function () {
  var assetRecoveryKey = "erudoza-asset-recovery";

  function recoverFromMissingAsset(assetId) {
    var recoveryUrl = new URL(window.location.href);
    if (recoveryUrl.searchParams.has("asset-recovery")) return false;

    try {
      if (sessionStorage.getItem(assetRecoveryKey) === assetId) return false;
      sessionStorage.setItem(assetRecoveryKey, assetId);
    } catch (error) {
      // The URL marker still prevents a reload loop when storage is unavailable.
    }

    recoveryUrl.searchParams.set("asset-recovery", Date.now().toString());
    window.location.replace(recoveryUrl.toString());
    return true;
  }

  function dynamicImportAsset(reason) {
    var message = reason && typeof reason.message === "string" ? reason.message : String(reason || "");
    if (!/failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module/i.test(message)) return null;
    var match = message.match(/https?:\/\/[^\s)\]]+\/assets\/[^\s)\]]+\.js|\/assets\/[^\s)\]]+\.js/i);
    return match ? match[0] : "dynamic-import:" + window.location.pathname;
  }

  window.addEventListener("error", function (event) {
    var target = event.target;
    if (!target || target.tagName !== "SCRIPT" || !target.src || target.src.indexOf("/assets/") === -1) return;
    recoverFromMissingAsset(target.src);
  }, true);

  window.addEventListener("vite:preloadError", function (event) {
    var assetId = dynamicImportAsset(event.payload);
    if (assetId && recoverFromMissingAsset(assetId)) event.preventDefault();
  });

  window.addEventListener("unhandledrejection", function (event) {
    var assetId = dynamicImportAsset(event.reason);
    if (assetId && recoverFromMissingAsset(assetId)) event.preventDefault();
  });

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
