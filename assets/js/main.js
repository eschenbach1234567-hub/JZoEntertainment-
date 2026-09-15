// JZO Entertainment - main.js
// Mobil-Navigation + Rendering von Events/Blog/Kontakt/Preisen aus /data/*.json
// Die JSON-Dateien sind ueber den Admin-Bereich (/admin) mit dem CMS editierbar.

document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
    });
  }

  loadJson("data/contact.json").then(renderContact);
  loadJson("data/events.json").then(function (data) { renderEvents(data && data.events); });
  loadJson("data/blog.json").then(function (data) { renderBlog(data && data.posts); });
  loadJson("data/prices.json").then(renderPrices);
  loadJson("data/services.json").then(function (data) { renderServices(data && data.services); });
});

function loadJson(path) {
  return fetch(path)
    .then(function (res) { return res.ok ? res.json() : null; })
    .catch(function () { return null; });
}

function renderContact(contact) {
  if (!contact) return;

  var actions = {
    "phone-href": function (el) {
      el.setAttribute("href", "tel:" + contact.phoneHref);
      el.textContent = contact.phoneDisplay;
    },
    "email-href": function (el) {
      el.setAttribute("href", "mailto:" + contact.email);
      el.textContent = contact.email;
    },
    "email-href-subject": function (el) {
      el.setAttribute("href", "mailto:" + contact.email + "?subject=" + encodeURIComponent("Anfrage über die Website"));
    },
    "name-text": function (el) { el.textContent = contact.name; },
    "address-text": function (el) { el.textContent = contact.addressLine; },
    "ig-href": function (el) { el.setAttribute("href", contact.instagramUrl); },
    "yt-href": function (el) { el.setAttribute("href", contact.youtubeUrl); },
    "ig-handle": function (el) { el.textContent = contact.instagramHandle; },
  };

  document.querySelectorAll("[data-c]").forEach(function (el) {
    var action = actions[el.getAttribute("data-c")];
    if (action) action(el);
  });
}

function renderPrices(prices) {
  if (!prices) return;

  var map = {
    "price-hourly-amount": prices.hourly.amount,
    "price-hourly-note": prices.hourly.note,
    "price-vhs-amount": prices.vhs.amount,
    "price-vhs-note": prices.vhs.note,
    "price-digital8-amount": prices.digital8.amount,
    "price-digital8-note": prices.digital8.note,
    "price-other-amount": prices.other.amount,
    "price-other-note": prices.other.note,
  };

  Object.keys(map).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.textContent = map[id];
  });
}

function formatDate(iso) {
  if (!iso) return "";
  var d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

function renderEvents(items) {
  var container = document.getElementById("events-list");
  if (!container) return;

  items = (items || []).slice();

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

function renderBlog(items) {
  var container = document.getElementById("blog-list");
  if (!container) return;

  items = (items || []).slice();

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
        (post.image ? '<div class="card-img-wrap"><img class="card-img" src="' + escapeHtml(post.image) + '" alt="' + escapeHtml(post.title || "") + '"></div>' : "") +
        (post.date ? '<p style="color:var(--gold-1);font-weight:600;margin-bottom:8px;">' + escapeHtml(formatDate(post.date)) + "</p>" : "") +
        "<h3>" + escapeHtml(post.title || "") + "</h3>" +
        "<p>" + escapeHtml(post.text || "") + "</p>" +
      "</div>"
    );
  }).join("");
}

function renderServices(items) {
  var container = document.getElementById("services-list");
  if (!container) return;

  items = items || [];

  if (!items.length) {
    container.innerHTML =
      '<div class="empty-state">' +
      "<p>Aktuell sind hier keine Dienstleistungen hinterlegt.</p>" +
      "</div>";
    return;
  }

  container.innerHTML = items.map(function (s) {
    return (
      '<div class="card">' +
        '<div class="card-icon">' + iconForService(s.icon) + "</div>" +
        "<h3>" + escapeHtml(s.title || "") + "</h3>" +
        "<p>" + escapeHtml(s.description || "") + "</p>" +
        (s.badge ? '<span class="price-tag">' + escapeHtml(s.badge) + "</span>" : "") +
      "</div>"
    );
  }).join("");
}

function iconForService(key) {
  var icons = {
    kamera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l2-3h4l2 3"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
    videoschnitt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7l6 5-6 5V7z"/><path d="M14 7l6 5-6 5V7z"/></svg>',
    drohne: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v4M5 8l2.5 2.5M19 8l-2.5 2.5"/><circle cx="12" cy="13" r="3"/><path d="M4 21c1.5-2 4-3 8-3s6.5 1 8 3"/></svg>',
    digitalisierung: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="9" cy="12" r="2.4"/><circle cx="16" cy="12" r="1"/></svg>',
    beratung: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M14 3v5h5"/></svg>',
    sonstiges: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 16.9 6.4 20.1l1.4-6.3L3 9.5l6.4-.6z"/></svg>',
  };
  return icons[key] || icons.sonstiges;
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
