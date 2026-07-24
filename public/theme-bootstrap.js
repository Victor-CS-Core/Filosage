(function () {
  var theme = "light";
  try {
    var stored = localStorage.getItem("erudoza-theme") || localStorage.getItem("teach-theme");
    theme = stored === "light" || stored === "dark" ? stored : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch (error) {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", theme);
}());
