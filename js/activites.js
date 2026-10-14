/* BJA HOUSE — agenda de la page Activités, lu dans la base (ou config.js) */
window.BJAApi.ready.then(() => {
  "use strict";
  const list = document.querySelector("[data-events-list]");
  if (!list) return;
  const { events, categories, paymentMethods } = window.BJA;
  const api = window.BJAApi;
  const esc = api.esc;

  const byDate = (a, b) => new Date(a.date) - new Date(b.date);
  const upcoming = events.filter((e) => !api.isPast(e)).sort(byDate);
  const past = events.filter((e) => api.isPast(e)).sort(byDate).reverse();
  const payLabels = paymentMethods.map((m) => m.label).join(", ");

  const card = (ev, isPast) => {
    const d = new Date(ev.date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
    const paid = ev.price > 0;
    const full = ev.remaining === 0;
    const closed = api.salesClosed(ev);
    const page = `evenement.html#${encodeURIComponent(ev.id)}`;
    const rating = ratings[ev.id];
    const action = isPast
      ? `<span class="tag">Terminé</span>${rating ? `<span class="event-rating">★ ${rating.avg.toFixed(1).replace(".", ",")} · ${rating.n} avis</span>` : ""}
         <a class="btn btn--outline btn--sm" href="${page}">${rating ? "Voir les avis" : "Laisser un avis"}</a>`
      : `${ev.remaining != null && !closed ? `<span class="seats${full ? " seats--full" : ev.remaining <= 10 ? " seats--low" : ""}">${full ? "Complet" : `${ev.remaining} place${ev.remaining > 1 ? "s" : ""} restante${ev.remaining > 1 ? "s" : ""}`}</span>` : ""}
         ${closed ? `<span class="tag">Réservations fermées</span>`
           : `<a class="btn btn--primary" href="reservation.html#${encodeURIComponent(ev.id)}">${full ? "Liste d'attente" : "S'inscrire"} <span class="arrow" aria-hidden="true">→</span></a>`}
         <a class="event-more" href="${page}">Détails</a>`;
    return `
      <article class="event${isPast ? " is-past" : ""}" data-cat="${esc(ev.cat)}">
        <div class="ticket-date"><span class="ticket-day">${day}</span><span class="ticket-month">${esc(month)}</span></div>
        <div class="event-body">
          ${ev.image ? `<img class="event-cover" src="${esc(ev.image)}" alt="" loading="lazy">` : ""}
          <span class="tag">${esc(categories[ev.cat] || ev.cat)}</span>
          <h3><a class="event-link" href="evenement.html#${encodeURIComponent(ev.id)}">${esc(ev.title)}</a></h3>
          <p>${esc(ev.desc)}</p>
          <dl class="event-facts">
            <div><dt>Date</dt><dd>${esc(api.eventDate(ev))}, ${esc(ev.hours)}</dd></div>
            <div><dt>Lieu</dt><dd>${esc(ev.place)}</dd></div>
            <div><dt>Prix</dt><dd class="price">${esc(api.price(ev.price))}</dd></div>
            ${ev.priceVip != null ? `<div><dt>VIP</dt><dd class="price">${ev.remainingVip === 0 ? "Complet" : esc(api.price(ev.priceVip))}</dd></div>` : ""}
            <div><dt>Paiement</dt><dd>${paid ? esc(payLabels) : "Aucun paiement demandé"}</dd></div>
          </dl>
        </div>
        <div class="event-side">${action}</div>
      </article>`;
  };

  // Notes moyennes des événements passés (avis des participants)
  const ratings = {};
  const render = () => {
    list.innerHTML = [...upcoming.map((e) => card(e, false)), ...past.map((e) => card(e, true))].join("");
  };
  render();
  if (api.isReady() && past.length) {
    api.select("avis", "select=event_id,note").then((rows) => {
      rows.forEach((r) => {
        const x = (ratings[r.event_id] ||= { sum: 0, n: 0 });
        x.sum += r.note; x.n++;
      });
      Object.values(ratings).forEach((x) => (x.avg = x.sum / x.n));
      render();
    }).catch(() => {});
  }
});
