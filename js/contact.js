/* BJA HOUSE — page contact : lien WhatsApp, formulaire enregistré dans Supabase puis envoyé sur WhatsApp */
(() => {
  "use strict";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const api = window.BJAApi;

  /* ---------- Carte WhatsApp ---------- */
  const waLink = api.whatsappLink("Bonjour BJA HOUSE, ");
  if (waLink) {
    const a = $("[data-whatsapp-link]");
    a.href = waLink;
    a.target = "_blank";
    a.rel = "noopener";
    a.hidden = false;
    $("[data-whatsapp-missing]").hidden = true;
  }

  /* ---------- Formulaire ---------- */
  const form = $("#contact-form");
  const status = $(".form-status", form);
  const btn = $("button[type=submit]", form);

  const rules = {
    sujet: () => (form.sujet.value ? "" : "Choisissez un sujet."),
    nom: (el) => (el.value.trim().length >= 2 ? "" : "Indiquez votre nom."),
    telephone: (el) => (/^\+?[0-9 ().-]{8,20}$/.test(el.value.trim()) ? "" : "Numéro invalide (ex. +509 37 00 0000)."),
    email: (el) => (!el.value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.value.trim()) ? "" : "Adresse e-mail invalide."),
    message: (el) => (el.value.trim().length >= 10 ? "" : "Votre message doit faire au moins 10 caractères."),
    consentement: (el) => (el.checked ? "" : "Merci d'accepter d'être recontacté."),
  };

  const check = (name) => {
    const el = name === "sujet" ? $("input[name=sujet]", form) : form.elements[name];
    const msg = rules[name](el);
    const field = el.closest(".field, .consent");
    if (field) field.classList.toggle("invalid", Boolean(msg));
    $(`#${name}-error`).textContent = msg;
    $$(`[name=${name}]`, form).forEach((input) => input.setAttribute("aria-invalid", String(Boolean(msg))));
    return !msg;
  };

  Object.keys(rules).forEach((name) =>
    $$(`[name=${name}]`, form).forEach((el) =>
      el.addEventListener(el.type === "radio" || el.type === "checkbox" ? "change" : "blur", () => check(name))
    )
  );

  const say = (text, isError = false) => {
    status.hidden = false;
    status.classList.toggle("is-error", isError);
    status.textContent = text;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!Object.keys(rules).map(check).every(Boolean)) {
      say("Certains champs sont à corriger.", true);
      $$("[aria-invalid=true]", form)[0]?.focus();
      return;
    }
    if (form.website.value) return; // champ piège anti-spam

    const data = {
      sujet: form.sujet.value,
      nom: form.nom.value.trim(),
      telephone: form.telephone.value.trim(),
      email: form.email.value.trim() || null,
      message: form.message.value.trim(),
    };
    const prenom = data.nom.split(/\s+/)[0];

    if (!api.isReady()) {
      say(`Merci ${prenom} ! Formulaire en mode démonstration : il sera relié à la base de données à la mise en ligne.`);
      form.reset();
      return;
    }

    btn.disabled = true;
    say("Envoi en cours…");
    try {
      await api.insert("messages", data);
    } catch {
      say("L'envoi a échoué. Réessayez, ou écrivez-nous directement sur WhatsApp.", true);
      btn.disabled = false;
      return;
    }

    form.reset();
    btn.disabled = false;
    const wa = api.whatsappLink(
      `Bonjour BJA HOUSE, je suis ${data.nom}.\nSujet : ${data.sujet}\n\n${data.message}\n\nTéléphone : ${data.telephone}` +
        (data.email ? `\nE-mail : ${data.email}` : "")
    );
    if (wa) {
      say(`Merci ${prenom}, votre message est enregistré. WhatsApp s'ouvre pour l'envoyer à l'équipe.`);
      setTimeout(() => (location.href = wa), 900);
    } else {
      say(`Merci ${prenom}, votre message est bien arrivé. On vous recontacte au ${data.telephone}.`);
    }
  });
})();
