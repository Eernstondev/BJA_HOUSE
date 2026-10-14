/* BJA HOUSE — billet : lu avec le jeton secret du lien (?t=…), QR code affiché une fois la place confirmée */
(() => {
  "use strict";
  const api = window.BJAApi;
  const esc = api.esc;
  const box = document.querySelector("[data-ticket]");
  const token = new URLSearchParams(location.search).get("t") || "";

  const show = (html) => { box.innerHTML = html; };
  const fail = (title, text) => show(`
    <p class="eyebrow">Billet</p><h1 class="eticket-title">${title}</h1><p>${text}</p>
    <a class="btn btn--primary" href="activites.html">Voir l'agenda <span class="arrow" aria-hidden="true">→</span></a>`);

  if (!/^[0-9a-f-]{36}$/i.test(token)) return fail("Lien incomplet", "Ouvrez le lien « Mon billet » reçu après votre réservation.");
  if (!api.isReady()) return fail("Billet indisponible", "La base de données n'est pas encore reliée.");

  const dateTime = (d) => new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  let cancelled = null; // réponse de l'annulation, pour proposer de prévenir l'équipe

  function render(b) {

    const when = b.debut
      ? new Date(b.debut).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
      : "";
    const past = b.debut && new Date(b.debut).getTime() < Date.now();
    const confirmed = b.statut === "confirmee" && !b.liste_attente;
    const places = Number(b.places) || 1;
    const entered = b.entrees != null ? Number(b.entrees) : b.scanned_at ? places : 0;
    const full = entered >= places;
    const paid = Number(b.montant) > 0 && !b.liste_attente;
    const canCancel = !b.annulee_le && b.statut !== "refusee" && !b.scanned_at && !past;
    const state = b.annulee_le ? ["Réservation annulée", "no", `Annulée le ${dateTime(b.annulee_le)}. ${places > 1 ? "Vos places ont été libérées" : "Votre place a été libérée"}.${paid ? " Le remboursement n'est pas automatique : écrivez à l'équipe sur WhatsApp." : ""}`]
      : b.liste_attente ? ["Liste d'attente", "wait", "L'événement est complet. On vous prévient sur WhatsApp si une place se libère."]
      : b.statut === "refusee" ? ["Réservation refusée", "no", "Le paiement n'a pas pu être validé. Contactez l'équipe sur WhatsApp."]
      : b.statut !== "confirmee" ? ["En attente de vérification", "wait", "Votre QR code apparaîtra ici dès que l'équipe aura vérifié votre reçu. Gardez ce lien."]
      : full ? ["Entrée validée", "ok", places > 1
          ? `Tout le groupe est entré (${places}/${places}).`
          : `Billet scanné le ${dateTime(b.scanned_at)}.`]
      : entered ? ["Entrées en cours", "ok", `${entered} sur ${places} personnes sont entrées. Le QR code reste valable pour les ${places - entered} autres.`]
      : places > 1 ? ["Places confirmées", "ok", `Ce QR code est valable pour ${places} personnes. Partagez ce lien avec votre groupe : chacun peut entrer à son heure.`]
      : ["Place confirmée", "ok", "Présentez ce QR code à l'entrée."];

    let qrSvg = "";
    if (confirmed && window.qrcode) {
      const qr = window.qrcode(0, "M");
      qr.addData(location.href);
      qr.make();
      qrSvg = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true, alt: `QR code du billet ${b.reference}` });
    }
    document.title = `Billet ${b.reference} · BJA HOUSE`;

    show(`
      <div class="eticket-head">
        <img class="eticket-logo" src="assets/logo.png" alt="BJA HOUSE">
        <span class="eticket-badges">${b.type === "vip" ? `<span class="admin-badge admin-badge--vip">VIP</span>` : ""}<span class="admin-badge admin-badge--${state[1]}">${state[0]}</span></span>
      </div>
      <h1 class="eticket-title">${esc(b.evenement)}</h1>
      <p class="eticket-when">${esc(when)}${b.horaires ? ` · ${esc(b.horaires)}` : ""}</p>
      ${qrSvg ? `<div class="eticket-qr${full ? " is-used" : ""}">${qrSvg}</div>` : ""}
      <p class="eticket-state">${state[2]}</p>
      <dl class="eticket-facts">
        <div><dt>Nom</dt><dd>${esc(b.prenom)} ${esc(b.nom)}</dd></div>
        ${b.type === "vip" ? `<div><dt>Billet</dt><dd>VIP</dd></div>` : ""}
        ${b.places > 1 ? `<div><dt>Places</dt><dd>${b.places} personnes</dd></div>` : ""}
        <div><dt>Référence</dt><dd class="ref">${esc(b.reference)}</dd></div>
        ${b.lieu ? `<div><dt>Lieu</dt><dd>${esc(b.lieu)}</dd></div>` : ""}
        <div><dt>Montant</dt><dd>${esc(api.price(Number(b.montant)))}</dd></div>
      </dl>
      ${confirmed && past ? `<a class="btn btn--outline" href="evenement.html#${encodeURIComponent(b.event_id)}">Laisser un avis</a>` : ""}
      ${cancelled && teamWa(b) ? `<a class="btn btn--primary" href="${esc(teamWa(b))}" target="_blank" rel="noopener">Prévenir l'équipe sur WhatsApp</a>` : ""}
      ${canCancel ? `
      <details class="eticket-cancel">
        <summary>Annuler ma réservation</summary>
        <form class="eticket-cancel-form" data-cancel-form novalidate>
          <p>${places > 1 ? `Les ${places} places` : "Votre place"} ${places > 1 ? "seront libérées" : "sera libérée"} pour d'autres personnes. C'est définitif.${paid ? " Le remboursement n'est pas automatique : voyez-le avec l'équipe sur WhatsApp." : ""}</p>
          <label for="tel-fin">Pour confirmer, tapez les 4 derniers chiffres du numéro utilisé pour réserver</label>
          <div class="eticket-cancel-row">
            <input id="tel-fin" name="tel" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="1234">
            <button class="btn btn--outline btn--sm" type="submit">Confirmer l'annulation</button>
          </div>
          <p class="form-status is-error" data-cancel-status hidden></p>
        </form>
      </details>` : ""}`);
  }

  const teamWa = (b) => api.whatsappLink(`Bonjour BJA HOUSE, je viens d'annuler ma réservation ${b.reference} pour « ${b.evenement} ».${Number(b.montant) > 0 && !b.liste_attente ? " Merci de me dire comment se passe le remboursement." : ""}`);

  box.addEventListener("submit", async (e) => {
    if (!e.target.matches("[data-cancel-form]")) return;
    e.preventDefault();
    const form = e.target;
    const status = form.querySelector("[data-cancel-status]");
    const tel = form.elements.tel.value.replace(/\D/g, "");
    const say = (t) => { status.hidden = !t; status.textContent = t; };
    if (tel.length !== 4) return say("Tapez les 4 derniers chiffres de votre numéro.");
    const btn = form.querySelector("button");
    btn.disabled = true;
    say("");
    try {
      cancelled = await api.rpc("annuler_reservation", { p_token: token, p_tel_fin: tel });
      await api.ready;
      render(await api.rpc("billet", { p_token: token }));
    } catch (err) {
      say(err.message || "Annulation impossible. Réessayez.");
      btn.disabled = false;
    }
  });

  api.rpc("billet", { p_token: token }).then((b) => {
    if (!b) return fail("Billet introuvable", "Ce lien ne correspond à aucune réservation.");
    render(b);
  }).catch(() => fail("Billet indisponible", "Vérifiez votre connexion puis rechargez la page."));
})();
