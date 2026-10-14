/* BJA HOUSE — page de réservation : formulaire, reçu, base de données, message WhatsApp */
window.BJAApi.ready.then(() => {
  "use strict";
  const $ = (sel, root = document) => root.querySelector(sel);
  const api = window.BJAApi;
  const cfg = window.BJA;
  const esc = api.esc;
  const MAX_RECEIPT = 5 * 1024 * 1024;

  const summary = $("[data-event-summary]");
  const form = $("#reservation-form");
  const done = $("[data-done]");
  const ev = api.findEvent(decodeURIComponent(location.hash.slice(1)));

  /* ---------- Événement introuvable ou passé ---------- */
  if (!ev || api.isPast(ev)) {
    summary.innerHTML = `
      <p class="eyebrow">Réservation</p>
      <h2>${ev ? "Cet événement est terminé" : "Choisissez d'abord un événement"}</h2>
      <p>Retrouvez les prochains rendez-vous dans l'agenda.</p>
      <a class="btn btn--primary" href="activites.html">Voir l'agenda <span class="arrow" aria-hidden="true">→</span></a>`;
    return;
  }

  const paid = ev.price > 0;
  document.title = `Réserver : ${ev.title} · BJA HOUSE`;

  /* ---------- Récapitulatif : prix, lieu, paiement ---------- */
  summary.innerHTML = `
    <p class="eyebrow">${esc(cfg.categories[ev.cat] || "")}</p>
    <h2>${esc(ev.title)}</h2>
    <dl class="event-facts event-facts--stack">
      <div><dt>Date</dt><dd>${esc(api.eventDate(ev))}</dd></div>
      <div><dt>Horaires</dt><dd>${esc(ev.hours)}</dd></div>
      <div><dt>Lieu</dt><dd>${esc(ev.place)}</dd></div>
      <div><dt>Prix</dt><dd class="price price--big">${esc(api.price(ev.price))}</dd></div>
    </dl>
    ${paid
      ? `<div class="pay-info"><b>Comment payer</b><p>Choisissez un moyen de paiement dans le formulaire : les instructions s'affichent. Gardez une photo du reçu, elle vous sera demandée.</p></div>`
      : `<div class="pay-info"><b>Événement gratuit</b><p>Aucun paiement n'est demandé, il suffit de réserver votre place.</p></div>`}`;

  /* ---------- Moyens de paiement ---------- */
  const payBlock = $("[data-payment-block]");
  if (!paid) {
    payBlock.remove();
  } else {
    $("[data-payment-options]").innerHTML = cfg.paymentMethods.map((m, i) => `
      <label class="pay-option">
        <input type="radio" name="paiement" value="${esc(m.id)}">
        <span class="pay-option-body"><b>${esc(m.label)}</b><span class="pay-option-details">${esc(m.details)}</span></span>
      </label>`).join("");
  }
  form.hidden = false;

  /* ---------- Reçu : aperçu et glisser-déposer ---------- */
  const receipt = $("#recu");
  const preview = $(".dropzone-preview");
  const dropzone = $("[data-dropzone]");
  if (receipt) {
    receipt.addEventListener("change", () => {
      const file = receipt.files[0];
      if (preview.src) URL.revokeObjectURL(preview.src);
      preview.hidden = !file;
      dropzone.classList.toggle("has-file", Boolean(file));
      if (file) preview.src = URL.createObjectURL(file);
      check("recu");
    });
    ["dragover", "dragenter"].forEach((t) => dropzone.addEventListener(t, (e) => { e.preventDefault(); dropzone.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((t) => dropzone.addEventListener(t, () => dropzone.classList.remove("is-over")));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) { receipt.files = e.dataTransfer.files; receipt.dispatchEvent(new Event("change")); }
    });
  }

  /* ---------- Validation ---------- */
  const status = $(".form-status", form);
  const value = (name) => (form.elements[name] ? String(form.elements[name].value || "").trim() : "");
  const rules = {
    prenom: () => (value("prenom") ? "" : "Indiquez votre prénom."),
    nom: () => (value("nom") ? "" : "Indiquez votre nom."),
    email: () => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value("email")) ? "" : "Adresse e-mail invalide."),
    telephone: () => (/^\+?[0-9 ().-]{8,20}$/.test(value("telephone")) && value("telephone").replace(/\D/g, "").length >= 8
      ? "" : "Numéro invalide (8 chiffres minimum, ex. +509 37 00 0000)."),
    paiement: () => (!paid || form.querySelector("input[name=paiement]:checked") ? "" : "Choisissez un moyen de paiement."),
    recu: () => {
      if (!paid) return "";
      const file = receipt.files[0];
      if (!file) return "Ajoutez la photo de votre reçu.";
      if (!api.extension(file)) return "Format non accepté : utilisez une photo JPG, PNG ou WEBP.";
      if (file.size > MAX_RECEIPT) return "La photo dépasse 5 Mo.";
      return "";
    },
  };
  function check(name) {
    const msg = rules[name]();
    const err = $(`#${name}-error`);
    if (err) err.textContent = msg;
    const input = form.elements[name];
    if (input && input.closest) {
      input.setAttribute("aria-invalid", String(Boolean(msg)));
      const field = input.closest(".field");
      if (field) field.classList.toggle("invalid", Boolean(msg));
    }
    return !msg;
  }
  ["prenom", "nom", "email", "telephone"].forEach((n) => form.elements[n].addEventListener("blur", () => check(n)));
  form.addEventListener("change", (e) => { if (e.target.name === "paiement") check("paiement"); });
  form.addEventListener("input", () => { if (status.classList.contains("is-error")) status.hidden = true; });

  /* ---------- Message WhatsApp ---------- */
  const buildMessage = (data) => [
    "Bonjour BJA HOUSE,",
    `je viens de réserver ma place pour « ${ev.title} ».`,
    "",
    `Référence : ${data.reference}`,
    `Événement : ${ev.title}, ${api.eventDate(ev)} (${ev.hours})`,
    `Lieu : ${ev.place}`,
    `Nom : ${data.prenom} ${data.nom}`,
    `E-mail : ${data.email}`,
    `Téléphone : ${data.telephone}`,
    ...(paid
      ? [
          `Montant : ${api.price(ev.price)}`,
          `Moyen de paiement : ${data.moyen}`,
          "",
          "IMPORTANT : j'envoie la photo de mon reçu de paiement juste après ce message, pour la vérification complète de ma réservation.",
        ]
      : ["", "Événement gratuit : merci de me confirmer ma place."]),
  ].join("\n");

  /* ---------- Envoi ---------- */
  const submit = $("button[type=submit]", form);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fields = Object.keys(rules);
    const ok = fields.map(check).every(Boolean);
    status.hidden = false;
    status.classList.remove("is-error");
    if (!ok) {
      status.classList.add("is-error");
      status.textContent = "Certains champs sont à corriger.";
      form.querySelector("[aria-invalid=true]")?.focus();
      return;
    }

    const method = paid ? cfg.paymentMethods.find((m) => m.id === form.querySelector("input[name=paiement]:checked").value) : null;
    const data = {
      reference: api.reference(),
      prenom: value("prenom"), nom: value("nom"), email: value("email"), telephone: value("telephone"),
      moyen: method ? method.label : null,
    };

    submit.disabled = true;
    status.textContent = "Enregistrement de votre réservation…";
    let note = "";
    try {
      if (api.isReady()) {
        let recuPath = null;
        if (paid) {
          const file = receipt.files[0];
          recuPath = `${api.uuid()}/${api.uuid()}.${api.extension(file)}`;
          status.textContent = "Envoi de la photo du reçu…";
          await api.upload("recus", recuPath, file);
        }
        await api.insert("reservations", {
          reference: data.reference, event_id: ev.id, event_title: ev.title,
          prenom: data.prenom, nom: data.nom, email: data.email, telephone: data.telephone,
          moyen_paiement: data.moyen, montant: ev.price, recu_path: recuPath,
        });
      } else {
        note = "Mode démonstration : la base de données n'est pas encore reliée, rien n'a été enregistré.";
      }
    } catch (err) {
      status.classList.add("is-error");
      status.textContent = "L'enregistrement a échoué. Vérifiez votre connexion et réessayez.";
      submit.disabled = false;
      return;
    }

    // Réservation enregistrée : on affiche l'étape finale puis on ouvre WhatsApp
    const link = api.whatsappLink(buildMessage(data));
    $("[data-ref]", done).textContent = data.reference;
    const waBtn = $("[data-wa-link]", done);
    if (link) waBtn.href = link;
    else { waBtn.hidden = true; note = (note ? note + " " : "") + "Le numéro WhatsApp de BJA HOUSE n'est pas encore configuré."; }
    $("[data-done-note]", done).textContent = note;
    if (!paid) $("[data-done-text]", done).textContent = "WhatsApp s'ouvre avec un message pré-rempli : envoyez-le pour que l'équipe confirme votre place.";
    form.hidden = true;
    done.hidden = false;
    done.focus();
    if (link) location.href = link;
  });
});
