/* BJA HOUSE — page de réservation : formulaire, code promo, reçu, liste d'attente, billet, WhatsApp.
   Le prix, les places et le code promo sont vérifiés côté serveur par la fonction SQL public.reserver(). */
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

  const full = ev.remaining === 0;           // complet : inscription sur liste d'attente
  let price = ev.price;                      // prix après code promo
  let promoCode = "";
  let qty = 1;                               // nombre de places réservées
  const maxQty = full || ev.remaining == null ? 10 : Math.min(10, ev.remaining);
  const needPayment = () => price > 0 && !full;
  document.title = `Réserver : ${ev.title} · BJA HOUSE`;

  /* ---------- Récapitulatif : prix, lieu, places ---------- */
  const seats = ev.remaining == null ? ""
    : `<div><dt>Places</dt><dd>${full ? "Complet" : `${ev.remaining} restante${ev.remaining > 1 ? "s" : ""}`}</dd></div>`;
  summary.innerHTML = `
    <p class="eyebrow">${esc(cfg.categories[ev.cat] || "")}</p>
    <h2>${esc(ev.title)}</h2>
    <dl class="event-facts event-facts--stack">
      <div><dt>Date</dt><dd>${esc(api.eventDate(ev))}</dd></div>
      <div><dt>Horaires</dt><dd>${esc(ev.hours)}</dd></div>
      <div><dt>Lieu</dt><dd>${esc(ev.place)}</dd></div>
      ${seats}
      <div><dt>Prix par place</dt><dd class="price" data-price>${esc(api.price(ev.price))}</dd></div>
      <div data-total-row><dt>Total</dt><dd class="price price--big" data-total></dd></div>
    </dl>
    <div class="pay-info" data-pay-info></div>`;

  const payInfo = $("[data-pay-info]");
  function refreshPayment() {
    payInfo.innerHTML = full
      ? `<b>Liste d'attente</b><p>L'événement est complet. Ne payez rien : on vous prévient si une place se libère.</p>`
      : price > 0
        ? `<b>Comment payer</b><p>Choisissez un moyen de paiement dans le formulaire : les instructions s'affichent. Gardez une photo du reçu, elle vous sera demandée.</p>`
        : `<b>${ev.price > 0 ? "Gratuit avec votre code" : "Événement gratuit"}</b><p>Aucun paiement n'est demandé, il suffit de réserver votre place.</p>`;
    $("[data-price]").innerHTML = price !== ev.price
      ? `<s>${esc(api.price(ev.price))}</s> ${esc(api.price(price))}`
      : esc(api.price(price));
    $("[data-total]").textContent = `${api.price(price * qty)}${qty > 1 ? ` · ${qty} places` : ""}`;
    $("[data-total-row]").hidden = ev.price <= 0 && qty === 1;
    // Les champs de paiement ne servent que si un montant reste à payer
    [$("[data-payment-options]"), $("#paiement-error"), $("#recu")?.closest(".field")].forEach((el) => { if (el) el.hidden = !needPayment(); });
  }

  /* ---------- Moyens de paiement ---------- */
  const payBlock = $("[data-payment-block]");
  if (ev.price <= 0 || full) {
    payBlock.remove();
  } else {
    $("[data-payment-options]").innerHTML = cfg.paymentMethods.map((m) => `
      <label class="pay-option">
        <input type="radio" name="paiement" value="${esc(m.id)}">
        <span class="pay-option-body"><b>${esc(m.label)}</b><span class="pay-option-details">${esc(m.details)}</span></span>
      </label>`).join("");
  }
  if (full) {
    $("[data-waitlist]").hidden = false;
    $("button[type=submit]", form).innerHTML = `Rejoindre la liste d'attente <span class="arrow" aria-hidden="true">→</span>`;
  }
  /* ---------- Nombre de places ---------- */
  const qtyInput = $("#places");
  const setQty = (n) => {
    qty = Math.min(maxQty, Math.max(1, Math.trunc(Number(n)) || 1));
    qtyInput.value = qty;
    refreshPayment();
  };
  qtyInput.max = maxQty;
  if (maxQty < 10) $("[data-qty-note]").textContent = `Un seul billet pour tout le groupe. Il reste ${maxQty} place${maxQty > 1 ? "s" : ""}.`;
  qtyInput.addEventListener("change", () => setQty(qtyInput.value));
  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-qty]");
    if (b) setQty(qty + Number(b.dataset.qty));
  });

  refreshPayment();
  form.hidden = false;

  /* ---------- Code promo (vérifié par le serveur) ---------- */
  const promoBtn = $("[data-promo-apply]");
  if (promoBtn) {
    const promoInput = $("#code");
    const promoMsg = $("[data-promo-msg]");
    const applyPromo = async () => {
      const code = promoInput.value.trim().toUpperCase();
      promoMsg.className = "promo-msg";
      if (!code) { promoCode = ""; price = ev.price; promoMsg.textContent = ""; refreshPayment(); return; }
      if (!api.isReady()) { promoMsg.textContent = "Codes promo indisponibles en mode démonstration."; return; }
      promoBtn.disabled = true;
      promoMsg.textContent = "Vérification…";
      try {
        const r = await api.rpc("verifier_code", { p_code: code, p_event_id: ev.id });
        if (r.valide) {
          promoCode = r.code;
          price = Number(r.prix_final);
          promoMsg.classList.add("is-ok");
          promoMsg.textContent = `Code ${r.code} appliqué (${r.message}).`;
        } else {
          promoCode = "";
          price = ev.price;
          promoMsg.classList.add("is-error");
          promoMsg.textContent = r.message;
        }
      } catch {
        promoMsg.classList.add("is-error");
        promoMsg.textContent = "Vérification impossible. Réessayez.";
      } finally {
        promoBtn.disabled = false;
        refreshPayment();
      }
    };
    promoBtn.addEventListener("click", applyPromo);
    promoInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } });
  }

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
    paiement: () => (!needPayment() || form.querySelector("input[name=paiement]:checked") ? "" : "Choisissez un moyen de paiement."),
    recu: () => {
      if (!needPayment()) return "";
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
  const buildMessage = (data, result) => {
    const n = result.places || qty;
    const seatsText = n > 1 ? `mes ${n} places` : "ma place";
    return [
    ...(!result.liste_attente && result.montant > 0
      ? [
          "*IMPORTANT : joignez la photo de votre reçu de paiement à ce message avant de l'envoyer. Sans le reçu, la réservation ne peut pas être vérifiée.*",
          "*Une fois votre paiement vérifié, l'équipe vous envoie votre billet avec un QR code ici sur WhatsApp. Il sera scanné à l'entrée : ce QR code est unique et vous donne accès à l'espace. Gardez-le précieusement ou mémorisez votre référence.*",
          "",
        ]
      : []),
    "Bonjour BJA HOUSE,",
    result.liste_attente
      ? `je viens de m'inscrire sur la liste d'attente pour « ${ev.title} ».`
      : `je viens de réserver ${seatsText} pour « ${ev.title} ».`,
    "",
    `Référence : ${result.reference}`,
    `Événement : ${ev.title}, ${api.eventDate(ev)} (${ev.hours})`,
    `Lieu : ${ev.place}`,
    `Nom : ${data.prenom} ${data.nom}`,
    `Places : ${n}`,
    `E-mail : ${data.email}`,
    `Téléphone : ${data.telephone}`,
    ...(result.liste_attente
      ? ["", "Merci de me prévenir si une place se libère."]
      : result.montant > 0
        ? [
            `Montant : ${api.price(result.montant)}${promoCode ? ` (code ${promoCode})` : ""}`,
            `Moyen de paiement : ${data.moyen}`,
          ]
        : ["", `Réservation gratuite : merci de me confirmer ${seatsText} et de m'envoyer mon billet.`]),
  ].join("\n");
  };

  /* ---------- Envoi ---------- */
  const submit = $("button[type=submit]", form);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = Object.keys(rules).map(check).every(Boolean);
    status.hidden = false;
    status.classList.remove("is-error");
    if (!ok) {
      status.classList.add("is-error");
      status.textContent = "Certains champs sont à corriger.";
      form.querySelector("[aria-invalid=true]")?.focus();
      return;
    }

    const method = needPayment() ? cfg.paymentMethods.find((m) => m.id === form.querySelector("input[name=paiement]:checked").value) : null;
    const data = {
      prenom: value("prenom"), nom: value("nom"), email: value("email"), telephone: value("telephone"),
      moyen: method ? method.label : null,
    };

    submit.disabled = true;
    status.textContent = "Enregistrement de votre réservation…";
    let note = "";
    let result;
    try {
      if (api.isReady()) {
        let recuPath = null;
        if (needPayment()) {
          const file = receipt.files[0];
          recuPath = `${api.uuid()}/${api.uuid()}.${api.extension(file)}`;
          status.textContent = "Envoi de la photo du reçu…";
          await api.upload("recus", recuPath, file);
        }
        result = await api.rpc("reserver", {
          p_event_id: ev.id, p_prenom: data.prenom, p_nom: data.nom, p_email: data.email, p_telephone: data.telephone,
          p_moyen_paiement: data.moyen, p_recu_path: recuPath, p_code: promoCode || null, p_places: qty,
        });
      } else {
        result = { reference: api.reference(), ticket_token: null, liste_attente: full, montant: price * qty, places: qty };
        note = "Mode démonstration : la base de données n'est pas encore reliée, rien n'a été enregistré.";
      }
    } catch (err) {
      status.classList.add("is-error");
      // Messages clairs renvoyés par le serveur (événement terminé, code invalide, reçu manquant…)
      status.textContent = /terminé|introuvable|code|reçu|MonCash|utilisations|place/i.test(err.message)
        ? err.message
        : "L'enregistrement a échoué. Vérifiez votre connexion et réessayez.";
      submit.disabled = false;
      return;
    }
    result.montant = Number(result.montant);

    // Réservation enregistrée : WhatsApp s'ouvre directement avec le message pré-rempli
    const link = api.whatsappLink(buildMessage(data, result));
    $("[data-ref]", done).textContent = result.reference;
    if (result.liste_attente) {
      $("[data-done-eyebrow]", done).textContent = "Liste d'attente";
      $("[data-done-title]", done).textContent = "Vous êtes sur la liste d'attente";
      $("[data-done-text]", done).textContent = "L'événement est complet. Ne payez rien pour l'instant : l'équipe vous contacte sur WhatsApp si une place se libère.";
    } else if (result.montant <= 0) {
      $("[data-done-title]", done).textContent = "Dernière étape : confirmez sur WhatsApp";
      $("[data-done-text]", done).textContent = "Envoyez le message WhatsApp : l'équipe confirme votre place et vous envoie votre billet.";
    }
    const waBtn = $("[data-wa-link]", done);
    if (link) waBtn.href = link;
    else { waBtn.hidden = true; note = (note ? note + " " : "") + "Le numéro WhatsApp de BJA HOUSE n'est pas encore configuré."; }
    $("[data-done-note]", done).textContent = note;
    if (link) {
      // Si WhatsApp ne s'ouvre pas (ou au retour sur la page), le lien reste disponible
      status.innerHTML = `Réservation ${api.esc(result.reference)} enregistrée. Ouverture de WhatsApp… <a href="${api.esc(link)}">Ouvrir WhatsApp</a>`;
      location.href = link;
      return;
    }
    form.hidden = true;
    done.hidden = false;
    done.focus();
  });
});
