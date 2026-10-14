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
      : `<a class="btn btn--primary btn--block" href="reservation.html#${encodeURIComponent(ev.id)}">${full ? "Rejoindre la liste d'attente" : "Réserver ma place"} <span class="arrow" aria-hidden="true">→</span></a>`}`;

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
