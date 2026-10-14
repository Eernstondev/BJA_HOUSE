/* BJA HOUSE — page d'un événement : détails, places restantes, avis des participants */
window.BJAApi.ready.then(() => {
  "use strict";
  const $ = (sel, root = document) => root.querySelector(sel);
  const api = window.BJAApi;
  const cfg = window.BJA;
  const esc = api.esc;
  const ev = api.findEvent(decodeURIComponent(location.hash.slice(1)));
  const main = $("[data-event-main]");
  const side = $("[data-event-side]");

  if (!ev) {
    $("[data-event-title]").textContent = "Événement introuvable";
    main.innerHTML = `<p>Cet événement n'existe plus ou a été retiré.</p>
      <a class="btn btn--primary" href="activites.html">Voir l'agenda <span class="arrow" aria-hidden="true">→</span></a>`;
    side.remove();
    return;
  }

  const past = api.isPast(ev);
  const full = ev.remaining === 0;
  document.title = `${ev.title} · BJA HOUSE`;
  $("[data-event-title]").textContent = ev.title;
  $("[data-event-sub]").textContent = `${cfg.categories[ev.cat] || ""} · ${api.eventDate(ev, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;

  main.innerHTML = `
    ${ev.image ? `<img class="event-detail-img" src="${esc(ev.image)}" alt="">` : ""}
    <p class="event-detail-desc">${esc(ev.desc)}</p>`;

  /* ---------- Agenda : heure d'Haïti convertie en UTC ---------- */
  function haitiToUtc(y, mo, d, h, mi) {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Port-au-Prince", hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric"
    }).formatToParts(guess).map((p) => [p.type, Number(p.value)]));
    const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    return new Date(guess - (shown - guess));
  }
  function times() {
    const [y, mo, d, h, mi] = ev.date.split(/[-T:]/).map(Number);
    const start = haitiToUtc(y, mo, d, h || 0, mi || 0);
    const hm = String(ev.hours || "").match(/(\d{1,2})\s*h\s*(\d{2})?\D+(\d{1,2})\s*h\s*(\d{2})?/i);
    if (!hm) return [start, new Date(start.getTime() + 4 * 3600e3)];
    let end = haitiToUtc(y, mo, d, Number(hm[3]), Number(hm[4] || 0));
    if (end <= start) end = new Date(end.getTime() + 24 * 3600e3);
    return [start, end];
  }
  const stamp = (dt) => dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  function gcalUrl() {
    const [start, end] = times();
    const q = new URLSearchParams({
      action: "TEMPLATE", text: ev.title, dates: `${stamp(start)}/${stamp(end)}`,
      details: `${ev.desc || ""}\n${location.href}`, location: ev.place || ""
    });
    return `https://calendar.google.com/calendar/render?${q}`;
  }

  const seats = ev.remaining == null ? ""
    : `<div><dt>Places</dt><dd>${full ? "Complet" : `${ev.remaining} restante${ev.remaining > 1 ? "s" : ""}`}</dd></div>`;
  side.innerHTML = `
    <dl class="event-facts event-facts--stack">
      <div><dt>Date</dt><dd>${esc(api.eventDate(ev))}</dd></div>
      <div><dt>Horaires</dt><dd>${esc(ev.hours)}</dd></div>
      <div><dt>Lieu</dt><dd>${esc(ev.place)}</dd></div>
      ${past ? "" : seats}
      <div><dt>Prix</dt><dd class="price price--big">${esc(api.price(ev.price))}</dd></div>
    </dl>
    ${past ? `<span class="tag">Terminé</span>`
      : `<a class="btn btn--primary btn--block" href="reservation.html#${encodeURIComponent(ev.id)}">${full ? "Rejoindre la liste d'attente" : "Réserver ma place"} <span class="arrow" aria-hidden="true">→</span></a>`}
    ${past ? "" : `<div class="event-share">
      <div class="event-share-row">
        <button class="btn btn--ghost btn--sm" type="button" data-share>Partager</button>
        <button class="btn btn--ghost btn--sm" type="button" data-ics>Ajouter au calendrier</button>
      </div>
      <a class="gcal" href="${esc(gcalUrl())}" target="_blank" rel="noopener">Ou l'ajouter dans Google Agenda</a>
      <p class="event-share-msg" data-share-msg aria-live="polite"></p>
    </div>`}`;

  if (!past) {
    const msg = $("[data-share-msg]", side);
    const url = location.href.split("#")[0] + "#" + encodeURIComponent(ev.id);
    const text = `${ev.title} · ${api.eventDate(ev)}, ${ev.hours} · ${ev.place}`;
    $("[data-share]", side).addEventListener("click", async () => {
      if (navigator.share) {
        try { await navigator.share({ title: ev.title, text, url }); } catch { /* partage annulé */ }
        return;
      }
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        msg.innerHTML = `Lien copié. <a href="https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}" target="_blank" rel="noopener">Envoyer sur WhatsApp</a>`;
      } catch {
        window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, "_blank", "noopener");
      }
    });
    $("[data-ics]", side).addEventListener("click", () => {
      const [start, end] = times();
      const icsEsc = (t) => String(t).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
      const ics = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BJA HOUSE//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${ev.id}@bja-house`, `DTSTAMP:${stamp(new Date())}`,
        `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
        `SUMMARY:${icsEsc(ev.title)}`, `DESCRIPTION:${icsEsc(`${ev.desc || ""}\n${url}`)}`,
        `LOCATION:${icsEsc(ev.place || "")}`, `URL:${url}`,
        "END:VEVENT", "END:VCALENDAR", ""
      ].join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
      a.download = `${ev.id}.ics`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      msg.textContent = "Fichier ajouté : ouvrez-le pour l'enregistrer dans votre agenda.";
    });
  }

  /* ---------- Avis ---------- */
  const section = $("[data-reviews]");
  const list = $("[data-reviews-list]");
  const summary = $("[data-reviews-summary]");
  const form = $("#review-form");
  const query = `select=auteur,note,commentaire,created_at&event_id=eq.${encodeURIComponent(ev.id)}&order=created_at.desc`;
  let reviews = [];

  const stars = (n) => `<span class="stars" aria-label="${n} sur 5">${"★".repeat(n)}<span class="stars-off">${"★".repeat(5 - n)}</span></span>`;
  function renderReviews() {
    if (!reviews.length) {
      summary.textContent = past ? "Pas encore d'avis. Soyez le premier à partager votre expérience." : "";
      list.innerHTML = "";
      return;
    }
    const avg = reviews.reduce((s, r) => s + r.note, 0) / reviews.length;
    summary.innerHTML = `${stars(Math.round(avg))} <b>${avg.toFixed(1).replace(".", ",")}</b> sur 5 · ${reviews.length} avis`;
    list.innerHTML = reviews.map((r) => `
      <article class="review">
        <div class="review-head">${stars(r.note)}<b>${esc(r.auteur)}</b><time>${new Date(r.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</time></div>
        ${r.commentaire ? `<p>${esc(r.commentaire)}</p>` : ""}
      </article>`).join("");
  }

  (async () => {
    if (api.isReady()) reviews = await api.select("avis", query).catch(() => []);
    if (!past && !reviews.length) return;
    section.hidden = false;
    form.hidden = !past || !api.isReady();
    renderReviews();
  })();

  const status = $(".form-status", form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = Number(form.querySelector("input[name=note]:checked")?.value || 0);
    const code = form.elements.code.value.trim();
    const say = (t, err = true) => { status.hidden = false; status.classList.toggle("is-error", err); status.textContent = t; };
    if (!note) return say("Choisissez une note de 1 à 5 étoiles.");
    if (!code) return say("Indiquez la référence de votre réservation (ex. BJA-7K2M9P).");
    const btn = $("button[type=submit]", form);
    btn.disabled = true;
    say("Envoi…", false);
    try {
      await api.rpc("laisser_avis", { p_code: code, p_note: note, p_commentaire: form.elements.commentaire.value.trim(), p_event_id: ev.id });
      reviews = await api.select("avis", query).catch(() => reviews);
      renderReviews();
      form.reset();
      say("Merci, votre avis est publié.", false);
      form.querySelectorAll("fieldset, .field, button").forEach((el) => (el.hidden = true));
    } catch (err) {
      say(err.message);
    } finally {
      btn.disabled = false;
    }
  });
});
