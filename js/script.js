// script.js — header effects, reveal, 4-up calendar with today highlight + note popover + mailto contact
document.addEventListener("DOMContentLoaded", () => {
  /* Header scroll state */
  const header = document.getElementById("site-header");
  const onScroll = () => {
    if (window.scrollY > 12) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* Reveal-on-scroll */
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!prefersReduced && "IntersectionObserver" in window) {
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in-view");
            obs.unobserve(e.target);
          }
        }),
      { root: null, rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
    );
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
  } else {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in-view"));
  }

  /* ===== TRAINING CALENDAR (fetch JSON from /assets/training-plan.json) ===== */
  const DEFAULT_MONTHS = 4;
  const DEFAULT_JSON_URL = "assets/training-plan.json"; // <-- your file location

  // Utilities
  const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const monthLabel = (date) => date.toLocaleString(undefined, { month: "long", year: "numeric" });

  // ===== Note popover helpers =====
  let notePopover;
  function ensureNotePopover() {
    if (notePopover) return notePopover;
    notePopover = document.createElement("div");
    notePopover.className = "note-popover";
    notePopover.innerHTML = `
      <div class="note-popover__arrow"></div>
      <div class="note-popover__content">
        <div class="note-popover__date"></div>
        <div class="note-popover__text"></div>
        <button class="note-popover__close" aria-label="Close">×</button>
      </div>`;
    document.body.appendChild(notePopover);

    // Close on click outside or on the × button
    document.addEventListener(
      "click",
      (e) => {
        if (!notePopover) return;
        if (!notePopover.contains(e.target) && !e.target.closest(".day.has-note")) hideNote();
      },
      { capture: true }
    );

    notePopover.querySelector(".note-popover__close").addEventListener("click", hideNote);

    // Close on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideNote();
    });

    return notePopover;
  }

  function showNote(dateISO, text, anchorEl) {
    const pop = ensureNotePopover();
    pop.querySelector(".note-popover__date").textContent = new Date(dateISO).toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    pop.querySelector(".note-popover__text").textContent = text || "(No details)";

    // Position next to the clicked cell
    const r = anchorEl.getBoundingClientRect();
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

    const popW = 260; // approximate; style controls max width
    const popH = 120;
    const margin = 8;

    let top = r.top + scrollY - popH - margin;
    let left = r.left + scrollX + r.width / 2 - popW / 2;
    let placeAbove = true;

    if (top < scrollY + 8) {
      top = r.bottom + scrollY + margin;
      placeAbove = false;
    }

    left = Math.max(
      scrollX + 8,
      Math.min(left, scrollX + document.documentElement.clientWidth - popW - 8)
    );

    pop.style.setProperty("--popover-left", `${left}px`);
    pop.style.setProperty("--popover-top", `${top}px`);
    pop.style.setProperty("--popover-width", `${popW}px`);
    pop.classList.toggle("below", !placeAbove);
    pop.classList.add("open");
  }

  function hideNote() {
    if (notePopover) notePopover.classList.remove("open");
  }

  // Normalize different JSON shapes into { planStart: Date, months: number, data: Record<ISO, {note,type}> }
  function normalizePlan(json) {
    if (!json || typeof json !== "object") throw new Error("Invalid JSON");
    const planStartStr = json.planStart || json.start || json.plan_start;
    const months = Number(json.months ?? json.monthsToShow ?? DEFAULT_MONTHS) || DEFAULT_MONTHS;

    let data = {};
    if (Array.isArray(json.entries)) {
      for (const it of json.entries) {
        if (!it?.date) continue;
        data[it.date] = { note: it.note || "", type: it.type || "easy" };
      }
    } else if (json.data && typeof json.data === "object") {
      for (const [k, v] of Object.entries(json.data)) {
        if (!v || typeof v !== "object") continue;
        data[k] = { note: v.note || "", type: v.type || "easy" };
      }
    } else {
      const looksLikeMap = Object.keys(json).some((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
      if (looksLikeMap) {
        for (const [k, v] of Object.entries(json)) {
          if (!v || typeof v !== "object") continue;
          data[k] = { note: v.note || "", type: v.type || "easy" };
        }
      }
    }

    if (!Object.keys(data).length) throw new Error("No entries found in JSON");

    // If planStart missing, infer from earliest date
    const firstDate = Object.keys(data).sort()[0];
    const planStart = planStartStr ? new Date(planStartStr) : new Date(firstDate);

    if (isNaN(planStart)) throw new Error("planStart is invalid");

    return { planStart, months, data };
  }

  async function loadTrainingJSON(root) {
    // Use data-src on #calendar if present; otherwise default to /assets/training-plan.json
    const src = root?.dataset?.src || DEFAULT_JSON_URL;
    const res = await fetch(src, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Failed to load ${src}: ${res.status}`);
    const json = await res.json();
    return normalizePlan(json);
  }

  function buildMonth(year, month, data) {
    const wrap = document.createElement("div");
    wrap.className = "month";

    const head = document.createElement("div");
    head.className = "month-header";
    head.innerHTML = `<span>${monthLabel(new Date(year, month, 1))}</span>`;
    wrap.appendChild(head);

    const weekdaysRow = document.createElement("div");
    weekdaysRow.className = "weekdays";
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((d) => {
      const el = document.createElement("div");
      el.textContent = d;
      weekdaysRow.appendChild(el);
    });
    wrap.appendChild(weekdaysRow);

    const grid = document.createElement("div");
    grid.className = "days";

    const first = new Date(year, month, 1);
    const startIdx = (first.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // leading blanks
    for (let i = 0; i < startIdx; i++) {
      const empty = document.createElement("div");
      empty.className = "day empty";
      grid.appendChild(empty);
    }

    // today
    const today = new Date();
    const isToday = (yy, mm, dd) =>
      yy === today.getFullYear() && mm === today.getMonth() && dd === today.getDate();

    // real days
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement("div");
      cell.className = "day";
      const id = iso(year, month, d);
      const info = data[id];

      cell.innerHTML = `<div class="date">${d}</div>`;

      if (info) {
        cell.classList.add("has-note", info.type || "easy");
        cell.setAttribute("data-note", info.note);

        const dot = document.createElement("span");
        dot.className = "note-dot";
        cell.appendChild(dot);

        // Show popover on click
        cell.addEventListener("click", (ev) => {
          ev.stopPropagation();
          showNote(id, info.note, cell);
        });
      } else {
        // Clicking an empty day hides any open popover
        cell.addEventListener("click", hideNote);
      }

      if (isToday(year, month, d)) {
        cell.classList.add("today");
      }

      grid.appendChild(cell);
    }

    wrap.appendChild(grid);
    return wrap;
  }

  function buildCalendar(root, startDate, months, data) {
    root.innerHTML = "";
    const rangeLabel = document.getElementById("cal-range");
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end = new Date(start.getFullYear(), start.getMonth() + months - 1, 1);

    if (rangeLabel) rangeLabel.textContent = `${monthLabel(start)} — ${monthLabel(end)}`;

    for (let i = 0; i < months; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      root.appendChild(buildMonth(d.getFullYear(), d.getMonth(), data));
    }
  }

  const root = document.getElementById("calendar");
  if (root) {
    root.innerHTML = '<div class="calendar-loading">Loading plan…</div>';
    loadTrainingJSON(root)
      .then(({ planStart, months, data }) => {
        const start = new Date(planStart.getFullYear(), planStart.getMonth(), 1);
        buildCalendar(root, start, months || DEFAULT_MONTHS, data);
      })
      .catch((err) => {
        console.error(err);
        root.innerHTML = `<div class="calendar-error">Couldn’t load training plan. ${err.message}</div>`;
      });
  }

  /* ===== CONTACT: open default mail client with prefilled message ===== */
  const FALLBACK_TO_EMAIL = "beyondthepace@pm.me"; // or set data-user/domain on the form
  const CC_SENDER = true;
  const MAX_MAILTO_LEN = 1900;

  const form =
    document.getElementById("contact-form") ||
    document.querySelector("#contact form[name='contact']") ||
    document.querySelector("form[name='contact']");

  if (form) {
    const $ = (sel, root = document) => root.querySelector(sel);
    const resolveToEmail = (f) => {
      const user = f.getAttribute("data-user");
      const domain = f.getAttribute("data-domain");
      return user && domain ? `${user}@${domain}` : FALLBACK_TO_EMAIL;
    };
    const buildMailto = ({ to, subject, body, cc }) => {
      const params = new URLSearchParams();
      if (subject) params.set("subject", subject);
      if (body) params.set("body", body);
      if (cc) params.set("cc", cc);
      // Replace "+" (space encoding) with "%20" for proper rendering
      return `mailto:${encodeURIComponent(to)}?${params.toString().replace(/\+/g, "%20")}`;
    };

    const copyToClipboard = (text) => {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(
          () => true,
          () => false
        );
      }
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return Promise.resolve(ok);
      } catch {
        return Promise.resolve(false);
      }
    };

    const nameEl = $("#name", form);
    const emailEl = $("#email", form);
    const messageEl = $("#message", form);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = (nameEl?.value || "").trim();
      const email = (emailEl?.value || "").trim();
      const message = (messageEl?.value || "").trim();

      if (!name || !email || !message) {
        alert("Please fill in your name, email, and message.");
        return;
      }

      const to = resolveToEmail(form);
      const subject = `Beyond the Pace message from ${name}`;
      const bodyLines = [`Name: ${name}`, `Email: ${email}`, "", "Message:", message];
      const body = bodyLines.join("\n");
      const cc = CC_SENDER ? email : "";

      let url = buildMailto({ to, subject, body, cc });

      if (url.length > MAX_MAILTO_LEN) {
        const shortBody =
          body.slice(0, 900) +
          "\n\n[Message truncated in mailto. Full text copied to clipboard.]";
        url = buildMailto({ to, subject, body: shortBody, cc });

        const copied = await copyToClipboard(body);
        if (copied) {
          alert(
            "Your mail app will open. The full message is copied to your clipboard — paste it into the email body."
          );
        } else {
          alert(
            "Your mail app will open. If your message looks truncated, please paste the full text manually."
          );
        }
      }

      // Open the user's default email client
      window.location.href = url;

      // Clear form fields after small delay
      setTimeout(() => form.reset(), 600);
    });
  }
});
