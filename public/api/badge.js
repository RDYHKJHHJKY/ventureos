(function () {
  var script = document.currentScript;
  var assetId = script && script.getAttribute("data-asset");
  if (!assetId || !/^[a-zA-Z0-9_-]+$/.test(assetId)) return;

  var origin = script && script.src ? new URL(script.src).origin : window.location.origin;
  var badge = document.createElement("a");
  badge.href = origin + "/asset/" + encodeURIComponent(assetId);
  badge.target = "_blank";
  badge.rel = "noopener noreferrer";
  badge.setAttribute("aria-label", "View VentureOS trust passport");
  badge.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "gap:8px",
    "padding:6px 10px",
    "border:1px solid #2A3448",
    "border-radius:6px",
    "background:#0F1318",
    "color:#E8EDF5",
    "font:600 12px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
    "text-decoration:none",
    "box-shadow:0 8px 24px rgba(0,0,0,.18)"
  ].join(";");

  function setTheme(theme) {
    var dark = theme === "dark" || (theme === "auto" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    if (!dark) {
      badge.style.background = "#F8FAFC";
      badge.style.color = "#0F172A";
      badge.style.border = "1px solid #CBD5E1";
    }
  }

  var theme = script.getAttribute("data-theme") || "auto";
  setTheme(theme);

  function render(label, color, href) {
    badge.href = href || badge.href;
    badge.innerHTML = '<span style="width:8px;height:8px;border-radius:999px;background:' + color + ';display:inline-block"></span><span>' + label + '</span>';
  }

  render("VentureOS Review", "#EAB308");
  script.parentNode.insertBefore(badge, script.nextSibling);

  fetch(origin + "/api/badge/" + encodeURIComponent(assetId) + "/status", { headers: { accept: "application/json" } })
    .then(function (response) { return response.ok ? response.json() : null; })
    .then(function (data) {
      if (!data) return;
      var status = data.status || "review";
      var label = status === "verified" ? "VentureOS Verified" : status === "conditional" ? "VentureOS Conditional" : status === "review" ? "VentureOS Review" : status === "expired" ? "VentureOS Expired" : status === "revoked" ? "VentureOS Revoked" : "VentureOS Review";
      var color = status === "verified" ? "#22C55E" : status === "conditional" ? "#EAB308" : status === "review" ? "#EAB308" : status === "expired" ? "#F97316" : status === "revoked" ? "#EF4444" : "#EAB308";
      render(label, color, origin + (data.publicUrl || "/passport/" + assetId));
      if (theme === "auto") {
        setTheme(window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      }
    })
    .catch(function () {});
})();
