// js/blog.js — robust JSON blog: guaranteed previews + flexible debug + force-reveal + auto-hide banner
document.addEventListener("DOMContentLoaded", () => {
  const postsEl = document.getElementById("posts");
  const emptyEl = document.getElementById("empty");
  const searchEl = document.getElementById("search");
  const tagFilterEl = document.getElementById("tagFilter");
  const postSection = document.getElementById("post-section");
  const postEl = document.getElementById("post");

  // --- DEBUG detection: works with ?debug=1 in search or after the hash (…#anything?debug=1)
  const hasDebug = () => {
    const inSearch = new URLSearchParams(location.search).has("debug");
    const hash = location.hash || "";
    const qIndex = hash.indexOf("?");
    const inHashQuery = qIndex !== -1 && new URLSearchParams(hash.slice(qIndex+1)).has("debug");
    return inSearch || inHashQuery;
  };
  let DEBUG = hasDebug();

  // Prefer data-src on #posts, fallback to assets/blog.json
  const JSON_URL = postsEl?.dataset?.src || "assets/blog.json";
  let ALL_POSTS = [];

  // --- Status banner helpers (auto-hide on success)
  let bannerEl = null;
  const setBanner = (html) => {
    if (!bannerEl) {
      bannerEl = document.createElement("div");
      bannerEl.id = "blog-status";
      bannerEl.className = "blog-status";
      postsEl.insertAdjacentElement("beforebegin", bannerEl);
    }
    bannerEl.innerHTML = html;
    bannerEl.classList.remove("fade-out");
  };
  const clearBanner = (delayMs = 900) => {
    if (!bannerEl) return;
    setTimeout(() => {
      bannerEl.classList.add("fade-out");
      setTimeout(() => bannerEl?.remove(), 420);
      bannerEl = null;
    }, delayMs);
  };

  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  const escapeHtml = (s = "") =>
    (s + "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;","~":"&tilde;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

  const infoBox = (msg) => `<div class="calendar-loading">${msg}</div>`;
  const errorBox = (msg) => `<div class="calendar-error">${msg}</div>`;

  const stripHtml = (html = "") =>
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "$&\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim();

  const stripMarkdown = (md = "") =>
    (md + "")
      .replace(/^-{3}[\s\S]*?-{3}\s*/g, "")
      .replace(/`{3}[\s\S]*?`{3}/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[#>*_~\-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const firstNonEmpty = (...vals) => vals.find(v => v && String(v).trim().length) || "";

  function pickPreview(p) {
    const candidates = [
      { text: p.excerpt, source: "excerpt" },
      { text: p.content_text, source: "content_text" },
      { text: stripHtml(p.content_html || p.html || ""), source: "content_html/html" },
      { text: stripHtml(p.content || ""), source: "content" },
      { text: stripHtml(p.body || ""), source: "body" },
      { text: stripMarkdown(p.markdown || ""), source: "markdown" }
    ];
    const found = candidates.find(c => c.text && String(c.text).trim().length);
    if (!found) return { text: "", source: "none" };

    const raw = String(found.text).replace(/\s+/g, " ").trim();
    if (raw.length <= 240) return { text: raw, source: found.source };
    const clipped = raw.slice(0, 240);
    const lastSpace = clipped.lastIndexOf(" ");
    return { text: (lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped) + "…", source: found.source };
  }

  function renderTags(tags = []) {
    if (!tags.length) return "";
    return `<div class="tags">${tags.map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join("")}</div>`;
  }

  // --- Force newly added .reveal elements to be visible (global IO ran before these existed)
  function forceReveal(scope = document) {
    scope.querySelectorAll(".reveal").forEach(el => el.classList.add("in-view"));
  }

  function buildCard(p) {
    const hero = p.hero
      ? `<img class="post-hero" src="${escapeHtml(p.hero)}" alt="" style="width:100%; border-radius:10px; border:1px solid var(--line)">`
      : "";

    const { text: previewText, source } = pickPreview(p);
    const previewHtml = `<p style="border-left:3px solid rgba(33,212,253,.35); padding-left:10px; margin-top:6px">${escapeHtml(previewText || "(No preview provided)")}</p>`;
    const debugLine = DEBUG
      ? `<div class="small muted" style="opacity:.85; margin-top:6px">preview source: <code>${escapeHtml(source)}</code></div>`
      : "";

    return `
      <article class="post-card reveal" data-slug="${escapeHtml(p.slug)}">
        ${hero}
        <h3 class="jersey">${escapeHtml(p.title)}</h3>
        <div class="post-meta">${fmtDate(p.date)} ${p.readTime ? `• ${escapeHtml(p.readTime)}` : ""}</div>
        ${previewHtml}
        ${renderTags(p.tags)}
        ${debugLine}
        <a class="btn btn-ghost" href="#post/${encodeURIComponent(p.slug)}">Read</a>
      </article>
    `;
  }

  function renderList(posts) {
    postsEl.innerHTML = posts.map(buildCard).join("");
    forceReveal(postsEl); // ensure cards are visible
    emptyEl.style.display = posts.length ? "none" : "block";
    postSection.style.display = "none";
  }

  function uniqueTags(posts) {
    const s = new Set();
    posts.forEach(p => (p.tags || []).forEach(t => s.add(t)));
    return Array.from(s).sort((a,b)=>a.localeCompare(b));
  }

  function populateTagFilter(posts) {
    if (!tagFilterEl) return;
    const tags = uniqueTags(posts);
    tagFilterEl.innerHTML =
      `<option value="">All tags</option>` +
      tags.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
  }

  function applyFilters() {
    const q = (searchEl?.value || "").toLowerCase();
    const tag = tagFilterEl?.value || "";

    const filtered = ALL_POSTS.filter(p => {
      const searchPool = (
        (p.title || "") + " " +
        (p.excerpt || "") + " " +
        (p.content_text || "") + " " +
        stripHtml(p.content_html || p.html || "") + " " +
        stripHtml(p.content || "") + " " +
        stripHtml(p.body || "") + " " +
        stripMarkdown(p.markdown || "")
      ).toLowerCase();
      const matchesQ = !q || searchPool.includes(q);
      const matchesTag = !tag || (p.tags || []).includes(tag);
      return matchesQ && matchesTag;
    });
    renderList(filtered);
  }

  function normalizeOne(p) {
    return {
      slug: p.slug || p.id || p.permalink || "",
      title: p.title || p.name || p.heading || "",
      date: p.date || p.published_at || p.created_at || "",
      excerpt: p.excerpt || "",
      hero: p.hero || p.image || p.cover || "",
      tags: p.tags || p.labels || [],
      readTime: p.readTime || p.read_time || "",
      content_html: p.content_html || p.html || "",
      content_text: p.content_text || p.text || "",
      content: p.content,
      body: p.body,
      markdown: p.markdown
    };
  }

  function validateAndNormalize(rawPosts) {
    const out = [];
    const skipped = [];
    rawPosts.forEach((raw, i) => {
      const p = normalizeOne(raw);
      if (!p.slug || !p.title || !p.date) {
        skipped.push({ index: i, reason: `missing ${!p.slug ? "slug" : !p.title ? "title" : "date"}` });
        return;
      }
      out.push(p);
    });
    return { out, skipped };
  }

  async function loadPosts() {
    try {
      if (DEBUG) {
        setBanner(infoBox(`🛠️ Debug mode ON — JSON: <code>${escapeHtml(JSON_URL)}</code>`));
      } else {
        setBanner(infoBox(`Loading posts from <code>${escapeHtml(JSON_URL)}</code>…`));
      }

      const res = await fetch(JSON_URL, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) {
        postsEl.innerHTML = errorBox(`Failed to load <code>${escapeHtml(JSON_URL)}</code> — HTTP ${res.status}`);
        return; // keep banner visible on error
      }

      const text = await res.text();
      let json;
      try { json = JSON.parse(text); }
      catch (e) {
        postsEl.innerHTML =
          errorBox(`Invalid JSON in <code>${escapeHtml(JSON_URL)}</code>: ${escapeHtml(e.message)}`) +
          infoBox(`First 200 chars:<br><pre style="white-space:pre-wrap; max-height:200px; overflow:auto; padding:8px; border:1px solid var(--line); border-radius:8px; background:#0c1118">${escapeHtml(text.slice(0,200))}${text.length>200?'…':''}</pre>`);
        return; // keep banner visible on error
      }

      const rawPosts = Array.isArray(json) ? json : (json.posts || []);
      if (!Array.isArray(rawPosts)) {
        postsEl.innerHTML = errorBox(`Unexpected structure. Expected an array or { "posts": [] } in <code>${escapeHtml(JSON_URL)}</code>.`);
        return; // keep banner visible on error
      }

      const { out, skipped } = validateAndNormalize(rawPosts);
      ALL_POSTS = out.sort((a,b) => new Date(b.date) - new Date(a.date));

      if (DEBUG) {
        console.table(ALL_POSTS.map(p => ({
          slug: p.slug, title: p.title, date: p.date,
          has_excerpt: !!p.excerpt,
          len_html: (p.content_html||"").length,
          len_text: (p.content_text||"").length,
          len_content: (p.content||"").length,
          len_body: (p.body||"").length,
          len_md: (p.markdown||"").length
        })));
        setBanner(infoBox(`Found ${ALL_POSTS.length} post(s). Skipped ${skipped.length}.`));
      } else if (skipped.length) {
        setBanner(infoBox(`Skipped ${skipped.length} item(s) without slug/title/date.`));
      }

      populateTagFilter(ALL_POSTS);
      applyFilters();
      route();

      if (!ALL_POSTS.length) {
        postsEl.innerHTML = "";
        emptyEl.style.display = "block";
      }

      // Success: auto-hide the banner (debug or not)
      clearBanner(DEBUG ? 1400 : 900);
    } catch (err) {
      console.error(err);
      postsEl.innerHTML = errorBox(`Couldn’t load posts: ${escapeHtml(err.message)}`);
      // keep banner visible on error
    }
  }

  function renderPost(slug) {
    const p = ALL_POSTS.find(x => x.slug === slug);
    if (!p) {
      postEl.innerHTML = `<h1 class="jersey">Not found</h1><p class="muted">No post with slug “${escapeHtml(slug)}”.</p>`;
    } else {
      const hero = p.hero ? `<img class="post-hero" src="${escapeHtml(p.hero)}" alt="">` : "";
      const bodyHtml = p.content_html || p.html || "";
      const fallbackText = firstNonEmpty(p.content_text, p.content, p.body, p.markdown);

      const bodySource = bodyHtml ? "html"
        : p.content_text ? "content_text"
        : p.content ? "content"
        : p.body ? "body"
        : p.markdown ? "markdown"
        : "none";

      const debugLine = DEBUG
        ? `<div class="small muted" style="opacity:.85; margin:8px 0 0">body source: <code>${escapeHtml(bodySource)}</code></div>`
        : "";

      postEl.innerHTML = `
        <a class="btn btn-ghost" href="blog.html" style="margin-bottom:12px">&larr; Back to posts</a>
        <h1 class="jersey">${escapeHtml(p.title)}</h1>
        <div class="post-meta" style="margin-bottom:6px">${fmtDate(p.date)} ${p.readTime ? `• ${escapeHtml(p.readTime)}` : ""}</div>
        ${renderTags(p.tags)}
        ${hero}
        <div class="post-content reveal" style="margin-top:10px">
          ${bodyHtml || `<p class="muted" style="color:var(--ink); opacity:.92">${escapeHtml(stripMarkdown(fallbackText))}</p>`}
        </div>
        ${debugLine}
      `;
    }
    postSection.style.display = "block";
    forceReveal(postSection);
    postSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function route() {
    DEBUG = hasDebug(); // re-evaluate if hash changed to include debug
    const m = location.hash.match(/^#post\/([^?]+)/);
    if (m) renderPost(decodeURIComponent(m[1]));
    else postSection.style.display = "none";
  }

  // Events
  window.addEventListener("hashchange", route);
  searchEl?.addEventListener("input", applyFilters);
  tagFilterEl?.addEventListener("change", applyFilters);

  // Init
  loadPosts();
});
