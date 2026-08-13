(function () {
  var theme = "light";
  try {
    var stored = localStorage.getItem("filosage-theme") || localStorage.getItem("teach-theme");
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
