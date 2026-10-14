/* BJA HOUSE — agenda de la page Activités, généré depuis config.js */
(() => {
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
    const action = isPast
      ? `<span class="tag">Terminé</span>`
      : `<a class="btn btn--primary" href="reservation.html#${encodeURIComponent(ev.id)}">S'inscrire <span class="arrow" aria-hidden="true">→</span></a>`;
    return `
      <article class="event${isPast ? " is-past" : ""}" data-cat="${esc(ev.cat)}">
        <div class="ticket-date"><span class="ticket-day">${day}</span><span class="ticket-month">${esc(month)}</span></div>
        <div class="event-body">
          <span class="tag">${esc(categories[ev.cat] || ev.cat)}</span>
          <h3>${esc(ev.title)}</h3>
          <p>${esc(ev.desc)}</p>
          <dl class="event-facts">
            <div><dt>Date</dt><dd>${esc(api.eventDate(ev))}, ${esc(ev.hours)}</dd></div>
            <div><dt>Lieu</dt><dd>${esc(ev.place)}</dd></div>
            <div><dt>Prix</dt><dd class="price">${esc(api.price(ev.price))}</dd></div>
            <div><dt>Paiement</dt><dd>${paid ? esc(payLabels) : "Aucun paiement demandé"}</dd></div>
          </dl>
        </div>
        <div class="event-side">${action}</div>
      </article>`;
  };

  list.innerHTML = [...upcoming.map((e) => card(e, false)), ...past.map((e) => card(e, true))].join("");
})();
