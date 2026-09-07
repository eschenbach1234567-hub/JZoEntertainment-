// JZO Entertainment - main.js
// Mobil-Navigation + Rendering fuer Events und Blog (Daten kommen aus /data/*.js)

document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
    });
  }

  renderEvents();
  renderBlog();
});

function formatDate(iso) {
  if (!iso) return "";
  var d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

function renderEvents() {
  var container = document.getElementById("events-list");
  if (!container) return;

  var items = (typeof EVENTS !== "undefined") ? EVENTS.slice() : [];

  if (!items.length) {
    container.innerHTML =
      '<div class="empty-state">' +
      "<p>Aktuell sind keine Events geplant &ndash; schauen Sie gerne bald wieder vorbei!</p>" +
      "</div>";
    return;
  }

  items.sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); });

  container.innerHTML = items.map(function (ev) {
    return (
      '<div class="card">' +
        '<div class="card-icon">' + iconCalendar() + "</div>" +
        "<h3>" + escapeHtml(ev.title || "") + "</h3>" +
        (ev.date ? '<p style="color:var(--gold-1);font-weight:600;margin-bottom:8px;">' + escapeHtml(formatDate(ev.date)) + (ev.location ? " &middot; " + escapeHtml(ev.location) : "") + "</p>" : "") +
        "<p>" + escapeHtml(ev.description || "") + "</p>" +
      "</div>"
    );
  }).join("");
}

function renderBlog() {
  var container = document.getElementById("blog-list");
  if (!container) return;

  var items = (typeof BLOG_POSTS !== "undefined") ? BLOG_POSTS.slice() : [];

  if (!items.length) {
    container.innerHTML =
      '<div class="empty-state">' +
      "<p>Hier entstehen bald Beitr&auml;ge rund um Foto, Video und Digitalisierung. Schauen Sie gerne wieder vorbei!</p>" +
      "</div>";
    return;
  }

  items.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });

  container.innerHTML = items.map(function (post) {
    return (
      '<div class="card">' +
        (post.date ? '<p style="color:var(--gold-1);font-weight:600;margin-bottom:8px;">' + escapeHtml(formatDate(post.date)) + "</p>" : "") +
        "<h3>" + escapeHtml(post.title || "") + "</h3>" +
        "<p>" + escapeHtml(post.text || "") + "</p>" +
      "</div>"
    );
  }).join("");
}

function iconCalendar() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
