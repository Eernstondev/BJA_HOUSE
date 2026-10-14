/* BJA HOUSE — espace admin : connexion Supabase Auth et gestion complète du site
   (réservations, scanner des billets, événements, photos, membres, messages, avis, abonnés,
   codes promo, statistiques, réglages) */
(() => {
  "use strict";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const cfg = window.BJA;
  const api = window.BJAApi;
  const esc = api.esc;
  const base = cfg.supabaseUrl.replace(/\/+$/, "");
  const KEY = "bja-admin-session";
  const EXPIRED = "Session expirée, reconnectez-vous.";

  const loginView = $("[data-login]");
  const appView = $("[data-app]");
  const list = $("[data-list]");
  const appStatus = $("[data-app-status]");
  const editor = $("[data-editor]");

  /* =====================================================================
     Session et accès à Supabase
     ===================================================================== */
  let session = null;
  const save = (s) => {
    session = s;
    try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
  };
  const restore = () => {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  };

  async function auth(grant, body) {
    const res = await fetch(`${base}/auth/v1/token?grant_type=${grant}`, {
      method: "POST",
      headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error_description || data.msg || `Erreur ${res.status}`);
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
      email: data.user?.email || "",
    };
  }

  async function token() {
    if (!session) throw new Error(EXPIRED);
    if (session.expires_at - 60 < Date.now() / 1000) {
      try {
        save(await auth("refresh_token", { refresh_token: session.refresh_token }));
      } catch {
        logout();
        throw new Error(EXPIRED);
      }
    }
    return session.access_token;
  }

  async function request(path, opts = {}) {
    const res = await fetch(base + path, {
      ...opts,
      headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${await token()}`, ...opts.headers },
    });
    if (res.status === 401) { logout(); throw new Error(EXPIRED); }
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(`Action refusée (${res.status})${detail.message ? ` : ${detail.message}` : ""}`);
    }
    return res;
  }

  const JSON_HEADERS = { "Content-Type": "application/json" };
  const KEYS = { codes_promo: "code" };
  const keyOf = (table, row) => String(row[KEYS[table] || "id"]);
  const db = {
    list: async (table, query) => (await request(`/rest/v1/${table}?${query}`)).json(),
    insert: async (table, row) =>
      (await request(`/rest/v1/${table}`, { method: "POST", headers: { ...JSON_HEADERS, Prefer: "return=representation" }, body: JSON.stringify(row) })).json(),
    update: async (table, id, row) =>
      (await request(`/rest/v1/${table}?${KEYS[table] || "id"}=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { ...JSON_HEADERS, Prefer: "return=representation" }, body: JSON.stringify(row) })).json(),
    remove: (table, id) => request(`/rest/v1/${table}?${KEYS[table] || "id"}=eq.${encodeURIComponent(id)}`, { method: "DELETE" }),
    rpc: async (name, args) =>
      (await request(`/rest/v1/rpc/${name}`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(args) })).json(),
  };

  const objectPath = (bucket, path) => `/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const files = {
    upload: (bucket, path, blob) =>
      request(objectPath(bucket, path), { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream", "x-upsert": "false" }, body: blob }),
    // Supprimer un fichier ne doit jamais bloquer la suppression de la fiche
    remove: (bucket, path) => (path ? request(objectPath(bucket, path), { method: "DELETE" }).catch(() => {}) : Promise.resolve()),
  };

  // Réduit les photos (souvent 5 à 12 Mo depuis un téléphone) à 1920 px en JPEG avant l'envoi.
  async function prepareImage(file) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (blob) return { blob, ext: "jpg" };
    } catch { /* format non lisible par le navigateur (ex. HEIC hors Safari) */ }
    const ext = api.extension(file);
    if (!ext) throw new Error(`${file.name} : format non pris en charge (JPG, PNG, WEBP ou HEIC).`);
    if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} dépasse 8 Mo.`);
    return { blob: file, ext };
  }

  function logout() {
    if (session) {
      fetch(`${base}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {});
    }
    stopScan();
    save(null);
    show(false);
  }

  function show(loggedIn) {
    loginView.hidden = loggedIn;
    appView.hidden = !loggedIn;
    $("[data-session]").hidden = !loggedIn;
    $("[data-user-email]").textContent = loggedIn ? session.email : "";
  }

  /* =====================================================================
     Connexion
     ===================================================================== */
  const loginForm = $("#login-form");
  const loginStatus = $(".form-status", loginForm);
  const sayLogin = (text) => { loginStatus.hidden = false; loginStatus.classList.add("is-error"); loginStatus.textContent = text; };

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = loginForm.email.value.trim();
    const password = loginForm.password.value;
    if (!email || !password) return sayLogin("Entrez votre e-mail et votre mot de passe.");
    const btn = $("button[type=submit]", loginForm);
    btn.disabled = true;
    loginStatus.hidden = true;
    try {
      save(await auth("password", { email, password }));
      const admin = await db.list("admins", "select=user_id");
      if (!admin.length) {
        logout();
        sayLogin("Ce compte n'a pas accès à l'espace admin.");
        return;
      }
      loginForm.reset();
      show(true);
      load();
    } catch (err) {
      save(null);
      sayLogin(/invalid/i.test(err.message) ? "E-mail ou mot de passe incorrect." : `Connexion impossible : ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });
  $("[data-logout]").addEventListener("click", logout);

  /* =====================================================================
     Données
     ===================================================================== */
  const data = { reservations: [], evenements: [], photos: [], membres: [], messages: [], avis: [], abonnes: [], codes_promo: [], reglages: {} };

  const isPastEvent = (ev) => api.isPast({ date: ev.debut });
  const TABS = {
    reservations: { label: "Réservations", filters: [["en_attente", "À vérifier"], ["confirmee", "Confirmées"], ["attente", "Liste d'attente"], ["refusee", "Refusées"], ["", "Toutes"]], pending: (r) => r.statut === "en_attente" && !r.liste_attente },
    scanner: { label: "Scanner", filters: [] },
    entrees: { label: "Entrées", filters: [] },
    evenements: { label: "Événements", filters: [["avenir", "À venir"], ["passes", "Passés"], ["masques", "Masqués"], ["", "Tous"]] },
    photos: { label: "Photos", filters: [["en_attente", "En attente"], ["approuvee", "Publiées"], ["refusee", "Refusées"], ["", "Toutes"]], pending: (r) => r.statut === "en_attente" },
    membres: { label: "Membres", filters: [] },
    messages: { label: "Messages", filters: [["non", "Non traités"], ["oui", "Traités"], ["", "Tous"]], pending: (r) => !r.traite },
    avis: { label: "Avis", filters: [["", "Tous"], ["visibles", "Visibles"], ["masques", "Masqués"]] },
    abonnes: { label: "Abonnés", filters: [["", "Tous"], ["email", "E-mail"], ["whatsapp", "WhatsApp"]] },
    codes_promo: { label: "Codes promo", filters: [["", "Tous"], ["actifs", "Actifs"]] },
    stats: { label: "Statistiques", filters: [] },
    reglages: { label: "Réglages", filters: [] },
  };
  let tab = "reservations";
  let filter = "en_attente";
  let eventFilter = ""; // réservations d'un seul événement

  const say = (text, isError = false) => {
    appStatus.hidden = !text;
    appStatus.classList.toggle("is-error", isError);
    appStatus.textContent = text;
  };

  async function load() {
    say("Chargement…");
    try {
      const q = "select=*&order=created_at.desc&limit=1000";
      const [reservations, evenements, photos, membres, messages, reglages, avis, abonnes, codes] = await Promise.all([
        db.list("reservations", q),
        db.list("evenements", "select=*&order=debut.desc"),
        db.list("photos", q),
        db.list("membres", "select=*&order=ordre.asc,created_at.asc"),
        db.list("messages", q),
        db.list("reglages", "select=*&id=eq.1"),
        db.list("avis", q),
        db.list("abonnes", q),
        db.list("codes_promo", "select=*&order=created_at.desc"),
      ]);
      Object.assign(data, { reservations, evenements, photos, membres, messages, reglages: reglages[0] || {}, avis, abonnes, codes_promo: codes });
      say("");
    } catch (err) {
      if (session) say(`${err.message}. Vérifiez que supabase/schema.sql a bien été exécuté.`, true);
      else sayLogin(err.message);
    }
    render();
  }

  /* =====================================================================
     Affichage
     ===================================================================== */
  const when = (iso) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const eventWhen = (ev) => new Date(ev.debut).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const STATUS = {
    en_attente: ["En attente", "wait"], confirmee: ["Confirmée", "ok"], refusee: ["Refusée", "no"], approuvee: ["Publiée", "ok"],
  };
  const badge = (statut) => `<span class="admin-badge admin-badge--${STATUS[statut][1]}">${STATUS[statut][0]}</span>`;
  const tag = (text, kind) => `<span class="admin-badge admin-badge--${kind}">${text}</span>`;
  const payLabel = (id) => cfg.paymentMethods.find((m) => m.id === id)?.label || id || "Gratuit";
  const siteImage = (path) => (path ? api.publicUrl("site", path) : "");
  const btn = (action, label, kind = "outline", extra = "") =>
    `<button class="btn btn--${kind} btn--sm" type="button" data-action="${action}"${extra}>${label}</button>`;

  // Lien WhatsApp vers le client : 8 chiffres = numéro haïtien sans indicatif
  const clientWa = (tel, text) => {
    let d = String(tel || "").replace(/\D/g, "");
    if (d.length === 8) d = "509" + d;
    return d.length >= 10 ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : null;
  };
  const stars = (n) => `<span class="stars" aria-label="${n} sur 5">${"★".repeat(n)}<span class="stars-off">${"★".repeat(5 - n)}</span></span>`;
  const eventTitle = (id) => data.evenements.find((e) => e.id === id)?.titre
    || data.reservations.find((r) => r.event_id === id)?.event_title || id;
  const confirmMsg = (r) => `Bonjour ${r.prenom}, votre paiement est vérifié : votre réservation ${r.reference} pour « ${r.event_title} » est confirmée. Voici votre billet avec QR code, à présenter à l'entrée : ${ticketUrl(r)} À bientôt ! BJA HOUSE`;
  const refuseMsg = (r) => `Bonjour ${r.prenom}, nous n'avons pas pu valider le paiement de votre réservation ${r.reference} pour « ${r.event_title} ». Répondez à ce message pour régulariser. BJA HOUSE`;
  const ticketUrl = (r) => new URL(`billet.html?t=${r.ticket_token}`, location.href).href;
  const waBtn = (href, label) =>
    href ? `<a class="btn btn--outline btn--sm" href="${esc(href)}" target="_blank" rel="noopener">${label}</a>` : "";

  function stats() {
    const confirmed = data.reservations.filter((r) => r.statut === "confirmee");
    const total = confirmed.reduce((sum, r) => sum + Number(r.montant || 0), 0);
    const plural = confirmed.length > 1 ? "s" : "";
    const upcoming = data.evenements.filter((e) => e.publie && !isPastEvent(e)).length;
    $("[data-stats]").innerHTML = `
      <div><b>${data.reservations.filter(TABS.reservations.pending).length}</b><span>Réservations à vérifier</span></div>
      <div><b>${data.photos.filter(TABS.photos.pending).length}</b><span>Photos en attente</span></div>
      <div><b>${data.messages.filter(TABS.messages.pending).length}</b><span>Messages non traités</span></div>
      <div><b>${upcoming}</b><span>Événement${upcoming > 1 ? "s" : ""} à venir</span></div>
      <div><b>${esc(total > 0 ? api.price(total) : `0 ${cfg.currency}`)}</b><span>${confirmed.length} place${plural} confirmée${plural}</span></div>`;
  }

  function tabsBar() {
    $("[data-tabs]").innerHTML = Object.entries(TABS).map(([key, t]) => {
      const n = t.pending ? data[key].filter(t.pending).length : 0;
      return `<button role="tab" type="button" data-tab="${key}" aria-selected="${key === tab}">${t.label}${n ? ` <span class="count">${n}</span>` : ""}</button>`;
    }).join("");
  }

  function toolbar() {
    const chips = TABS[tab].filters.map(([v, l]) => `
      <label class="chip"><input type="radio" name="filtre" value="${v}"${v === filter ? " checked" : ""}><span>${l}</span></label>`).join("");
    let extra = "";
    if (tab === "reservations" || tab === "entrees") {
      const rows = tab === "entrees" ? data.reservations.filter((r) => r.scanned_at) : data.reservations;
      const ids = new Set(rows.map((r) => r.event_id));
      const options = [...ids].map((id) => {
        const ev = data.evenements.find((e) => e.id === id);
        const title = ev?.titre || data.reservations.find((r) => r.event_id === id).event_title;
        return `<option value="${esc(id)}"${id === eventFilter ? " selected" : ""}>${esc(title)}</option>`;
      }).join("");
      extra = `<select class="admin-select" data-event-filter aria-label="Filtrer par événement"><option value="">Tous les événements</option>${options}</select>`;
    }
    $("[data-filters]").innerHTML = `${chips ? `<div class="chips">${chips}</div>` : ""}${extra}`;
    $("[data-tools]").innerHTML = {
      reservations: btn("export", "Exporter (Excel)"),
      evenements: btn("event-new", "+ Nouvel événement", "primary"),
      photos: btn("photos-add", "+ Ajouter des photos", "primary"),
      membres: btn("member-new", "+ Nouveau membre", "primary"),
      abonnes: `${btn("abonnes-export", "Exporter (Excel)")}${btn("copy-emails", "Copier les e-mails")}${btn("copy-numbers", "Copier les numéros")}`,
      codes_promo: btn("code-new", "+ Nouveau code", "primary"),
    }[tab] || "";
  }

  const matches = {
    reservations: (r) => (!filter || (filter === "attente" ? r.liste_attente : r.statut === filter && !r.liste_attente))
      && (!eventFilter || r.event_id === eventFilter),
    evenements: (e) => !filter || (filter === "masques" ? !e.publie : filter === "passes" ? isPastEvent(e) : !isPastEvent(e)),
    photos: (r) => !filter || r.statut === filter,
    membres: () => true,
    messages: (r) => !filter || (filter === "oui" ? r.traite : !r.traite),
    avis: (r) => !filter || (filter === "visibles" ? r.publie : !r.publie),
    abonnes: (r) => !filter || Boolean(r[filter]),
    codes_promo: (c) => !filter || codeUsable(c),
  };
  const codeUsable = (c) => c.actif && (!c.expire_le || new Date(c.expire_le) > new Date())
    && (c.max_utilisations == null || c.utilisations < c.max_utilisations);

  const cards = {
    reservations: (r) => `
      <article class="admin-card" data-id="${esc(r.id)}">
        <div class="admin-card-head"><span class="admin-ref">${esc(r.reference)}</span>${r.liste_attente ? tag("Liste d'attente", "wait") : badge(r.statut)}${r.scanned_at ? tag("Entré", "ok") : ""}<time>${when(r.created_at)}</time></div>
        <h3>${esc(r.event_title)}</h3>
        <dl class="admin-facts">
          <div><dt>Client</dt><dd>${esc(r.prenom)} ${esc(r.nom)}</dd></div>
          <div><dt>Téléphone</dt><dd><a href="tel:${esc(r.telephone)}">${esc(r.telephone)}</a></dd></div>
          <div><dt>E-mail</dt><dd>${esc(r.email)}</dd></div>
          <div><dt>Paiement</dt><dd>${esc(payLabel(r.moyen_paiement))} · ${esc(api.price(Number(r.montant)))}${r.code_promo ? ` · code ${esc(r.code_promo)}` : ""}</dd></div>
          ${r.scanned_at ? `<div><dt>Entrée</dt><dd>${when(r.scanned_at)}</dd></div>` : ""}
        </dl>
        <div class="admin-actions">
          ${r.recu_path ? btn("receipt", "Voir le reçu") : ""}
          ${r.liste_attente ? btn("waitlist-accept", "Donner une place", "primary") : r.statut !== "confirmee" ? btn("set", "Confirmer", "primary", ' data-value="confirmee"') : ""}
          ${r.statut !== "refusee" ? btn("set", "Refuser", "danger", ' data-value="refusee"') : ""}
          ${r.liste_attente ? waBtn(clientWa(r.telephone, `Bonjour ${r.prenom}, une place s'est libérée pour « ${r.event_title} ». Répondez à ce message pour la réserver. BJA HOUSE`), "Prévenir sur WhatsApp") : ""}
          ${r.statut === "en_attente" ? "" : waBtn(clientWa(r.telephone, r.statut === "refusee" ? refuseMsg(r) : confirmMsg(r)), r.statut === "refusee" ? "Prévenir sur WhatsApp" : "Renvoyer le billet sur WhatsApp")}
          ${r.statut === "confirmee" && !r.liste_attente ? btn("copy-ticket", "Copier le lien du billet") : ""}
          ${btn("delete", "Supprimer", "ghost-danger")}
        </div>
      </article>`,

    evenements: (e) => {
      const resa = data.reservations.filter((r) => r.event_id === e.id);
      const ok = resa.filter((r) => r.statut === "confirmee" && !r.liste_attente).length;
      const wait = resa.filter((r) => r.statut === "en_attente" && !r.liste_attente).length;
      const queue = resa.filter((r) => r.liste_attente).length;
      const taken = resa.filter((r) => !r.liste_attente && r.statut !== "refusee").length;
      return `
      <article class="admin-card" data-id="${esc(e.id)}">
        ${e.image_path ? `<img class="admin-cover" src="${esc(siteImage(e.image_path))}" alt="" loading="lazy">` : ""}
        <div class="admin-card-head">
          <span class="admin-ref">${esc(cfg.categories[e.categorie] || e.categorie)}</span>
          ${e.publie ? (isPastEvent(e) ? tag("Passé", "muted") : tag("En ligne", "ok")) : tag("Masqué", "no")}
        </div>
        <h3>${esc(e.titre)}</h3>
        <dl class="admin-facts">
          <div><dt>Date</dt><dd>${esc(eventWhen(e))}${e.horaires ? ` · ${esc(e.horaires)}` : ""}</dd></div>
          <div><dt>Lieu</dt><dd>${esc(e.lieu || "—")}</dd></div>
          <div><dt>Prix</dt><dd>${esc(api.price(Number(e.prix)))}</dd></div>
          <div><dt>Inscrits</dt><dd>${ok} confirmé${ok > 1 ? "s" : ""}${wait ? `, ${wait} à vérifier` : ""}${queue ? `, ${queue} en liste d'attente` : ""}</dd></div>
          <div><dt>Places</dt><dd>${e.places ? `${Math.min(taken, e.places)} / ${e.places} prises${taken >= e.places ? " · complet" : ""}` : "Illimitées"}</dd></div>
        </dl>
        <div class="admin-actions">
          ${btn("event-edit", "Modifier", "primary")}
          ${btn("toggle-publie", e.publie ? "Masquer" : "Mettre en ligne")}
          ${resa.length ? btn("event-resa", "Voir les inscrits") : ""}
          ${btn("delete", "Supprimer", "ghost-danger")}
        </div>
      </article>`;
    },

    photos: (r) => `
      <article class="admin-card admin-card--photo" data-id="${esc(r.id)}">
        <a class="admin-photo" href="${esc(api.publicUrl("galerie", r.path))}" target="_blank" rel="noopener">
          <img src="${esc(api.publicUrl("galerie", r.path))}" alt="Photo envoyée par ${esc(r.auteur)}" loading="lazy">
        </a>
        <div class="admin-card-head">${badge(r.statut)}<time>${when(r.created_at)}</time></div>
        <p class="admin-meta"><b>${esc(r.auteur)}</b> · ${esc(cfg.categories[r.categorie] || r.categorie)}${r.evenement ? ` · ${esc(r.evenement)}` : ""}</p>
        <div class="admin-actions">
          ${r.statut !== "approuvee" ? btn("set", "Publier", "primary", ' data-value="approuvee"') : ""}
          ${r.statut !== "refusee" ? btn("set", r.statut === "approuvee" ? "Retirer" : "Refuser", "danger", ' data-value="refusee"') : ""}
          ${btn("delete", "Supprimer", "ghost-danger")}
        </div>
      </article>`,

    membres: (m) => `
      <article class="admin-card admin-card--member" data-id="${esc(m.id)}">
        <div class="admin-avatar">${m.photo_path ? `<img src="${esc(siteImage(m.photo_path))}" alt="" loading="lazy">` : `<span>${esc(m.role.charAt(0))}</span>`}</div>
        <div class="admin-member-body">
          <div class="admin-card-head"><span class="admin-ref">N° ${esc(m.ordre)}</span>${m.publie ? tag("Visible", "ok") : tag("Masqué", "no")}</div>
          <h3>${esc(m.nom)}</h3>
          <p class="admin-meta">${esc(m.role)}${SOCIALS.some((k) => m[k]) ? ` · ${SOCIALS.filter((k) => m[k]).map((k) => SOCIAL_LABELS[k]).join(", ")}` : ""}</p>
        </div>
        <div class="admin-actions">
          ${btn("member-edit", "Modifier", "primary")}
          ${btn("toggle-publie", m.publie ? "Masquer" : "Afficher")}
          ${btn("delete", "Supprimer", "ghost-danger")}
        </div>
      </article>`,

    messages: (r) => `
      <article class="admin-card" data-id="${esc(r.id)}">
        <div class="admin-card-head"><span class="admin-ref">${esc(r.sujet)}</span>${r.traite ? tag("Traité", "ok") : tag("Nouveau", "wait")}<time>${when(r.created_at)}</time></div>
        <h3>${esc(r.nom)}</h3>
        <p class="admin-message">${esc(r.message)}</p>
        <dl class="admin-facts">
          <div><dt>Téléphone</dt><dd><a href="tel:${esc(r.telephone)}">${esc(r.telephone)}</a></dd></div>
          ${r.email ? `<div><dt>E-mail</dt><dd><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></dd></div>` : ""}
        </dl>
        <div class="admin-actions">
          ${waBtn(clientWa(r.telephone, `Bonjour ${r.nom.split(/\s+/)[0]}, merci pour votre message à BJA HOUSE. `), "Répondre sur WhatsApp")}
          ${btn("toggle-traite", r.traite ? "Remettre en non traité" : "Marquer comme traité", r.traite ? "outline" : "primary")}
          ${btn("delete", "Supprimer", "ghost-danger")}
        </div>
      </article>`,

    avis: (r) => `
      <article class="admin-card" data-id="${esc(r.id)}">
        <div class="admin-card-head">${stars(r.note)}${r.publie ? tag("Visible", "ok") : tag("Masqué", "no")}<time>${when(r.created_at)}</time></div>
        <h3>${esc(eventTitle(r.event_id))}</h3>
        ${r.commentaire ? `<p class="admin-message">${esc(r.commentaire)}</p>` : ""}
        <p class="admin-meta">Par <b>${esc(r.auteur)}</b></p>
        <div class="admin-actions">
          ${btn("toggle-publie", r.publie ? "Masquer" : "Afficher", r.publie ? "outline" : "primary")}
          ${btn("delete", "Supprimer", "ghost-danger")}
        </div>
      </article>`,

    abonnes: (r) => `
      <article class="admin-card" data-id="${esc(r.id)}">
        <div class="admin-card-head">${r.email ? tag("E-mail", "muted") : ""}${r.whatsapp ? tag("WhatsApp", "ok") : ""}<time>${when(r.created_at)}</time></div>
        <h3>${esc(r.email || `+${r.whatsapp}`)}</h3>
        <div class="admin-actions">
          ${r.email ? `<a class="btn btn--outline btn--sm" href="mailto:${esc(r.email)}">Écrire un e-mail</a>` : ""}
          ${waBtn(clientWa(r.whatsapp, "Bonjour, ici BJA HOUSE ! "), "Écrire sur WhatsApp")}
          ${btn("delete", "Supprimer", "ghost-danger")}
        </div>
      </article>`,

    codes_promo: (c) => {
      const expired = c.expire_le && new Date(c.expire_le) <= new Date();
      const used = c.max_utilisations != null && c.utilisations >= c.max_utilisations;
      return `
      <article class="admin-card" data-id="${esc(c.code)}">
        <div class="admin-card-head"><span class="admin-ref">${esc(c.code)}</span>${!c.actif ? tag("Désactivé", "no") : expired ? tag("Expiré", "muted") : used ? tag("Épuisé", "muted") : tag("Actif", "ok")}</div>
        <h3>${c.type === "pourcent" ? `−${Number(c.valeur)} %` : `−${esc(api.price(Number(c.valeur)))}`}</h3>
        <dl class="admin-facts">
          <div><dt>Événement</dt><dd>${c.event_id ? esc(eventTitle(c.event_id)) : "Tous les événements"}</dd></div>
          <div><dt>Utilisé</dt><dd>${c.utilisations}${c.max_utilisations != null ? ` / ${c.max_utilisations}` : " fois"}</dd></div>
          <div><dt>Expire</dt><dd>${c.expire_le ? when(c.expire_le) : "Jamais"}</dd></div>
        </dl>
        <div class="admin-actions">
          ${btn("code-edit", "Modifier", "primary")}
          ${btn("toggle-actif", c.actif ? "Désactiver" : "Activer")}
          ${btn("copy-code", "Copier")}
          ${btn("delete", "Supprimer", "ghost-danger")}
        </div>
      </article>`;
    },
  };

  const EMPTY = {
    reservations: "Aucune réservation ici.", evenements: "Aucun événement ici.", photos: "Aucune photo ici.",
    membres: "Aucun membre pour l'instant.", messages: "Aucun message ici.",
    avis: "Aucun avis pour l'instant. Ils arrivent après chaque événement.",
    abonnes: "Aucun abonné pour l'instant. Le formulaire d'alertes est sur l'accueil et l'agenda.",
    codes_promo: "Aucun code promo. Créez-en un avec « + Nouveau code ».",
  };

  function settingsForm() {
    const r = data.reglages;
    const field = (name, label, attrs = "", hint = "") => `
      <div class="field">
        <label for="set-${name}">${label}</label>
        <input id="set-${name}" name="${name}" value="${esc(r[name] ?? "")}" ${attrs}>
        ${hint ? `<span class="admin-hint">${hint}</span>` : ""}
      </div>`;
    return `
      <form class="form admin-settings" id="settings-form" novalidate>
        <div class="admin-settings-group">
          <h3>Contact</h3>
          ${field("whatsapp", "Numéro WhatsApp de BJA", 'inputmode="tel" placeholder="50937000000"', "Avec l'indicatif 509, sans + ni espaces. Il reçoit les réservations, photos et messages.")}
          ${field("email", "E-mail", 'type="email" placeholder="contact@bjahouse.com"')}
          ${field("instagram", "Lien Instagram", 'type="url" placeholder="https://www.instagram.com/bjahouse"')}
          ${field("tiktok", "Lien TikTok", 'type="url" placeholder="https://www.tiktok.com/@bjahouse"')}
        </div>
        <div class="admin-settings-group">
          <h3>Paiement</h3>
          <div class="form-row">
            ${field("moncash_numero", "Numéro MonCash", 'inputmode="tel" placeholder="+509 37 00 0000"')}
            ${field("moncash_nom", "Nom du compte MonCash")}
          </div>
          <div class="form-row">
            ${field("natcash_numero", "Numéro NatCash", 'inputmode="tel" placeholder="+509 40 00 0000"')}
            ${field("natcash_nom", "Nom du compte NatCash")}
          </div>
          <span class="admin-hint">Affichés aux personnes qui réservent un événement payant.</span>
        </div>
        <p class="form-status" role="status" hidden></p>
        <button class="btn btn--primary" type="submit">Enregistrer les réglages</button>
        <p class="admin-note">Pour ajouter d'autres admins, contactez l'équipe <b>URBVEC ATELIER</b>.</p>
      </form>`;
  }

  function render() {
    stats();
    tabsBar();
    toolbar();
    if (tab === "reglages") {
      list.className = "admin-list admin-list--single";
      list.innerHTML = settingsForm();
      return;
    }
    if (tab === "stats") {
      list.className = "admin-list admin-list--wide";
      list.innerHTML = statsView();
      return;
    }
    if (tab === "entrees") {
      list.className = "admin-list admin-list--wide";
      list.innerHTML = entreesView();
      return;
    }
    if (tab === "scanner") {
      list.className = "admin-list admin-list--scanner";
      if (!$(".admin-scanner", list)) list.innerHTML = scannerView(); // garde la caméra ouverte pendant « Actualiser »
      return;
    }
    const items = data[tab].filter(matches[tab]);
    list.className = `admin-list${tab === "photos" ? " admin-list--photos" : ""}`;
    list.innerHTML = items.length ? items.map(cards[tab]).join("") : `<p class="admin-empty">${EMPTY[tab]}</p>`;
  }

  function goTo(nextTab, nextFilter) {
    if (nextTab !== "scanner") stopScan();
    tab = nextTab;
    filter = nextFilter ?? TABS[tab].filters[0]?.[0] ?? "";
    if (tab !== "reservations" && tab !== "entrees") eventFilter = "";
    render();
  }

  $("[data-tabs]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) goTo(b.dataset.tab);
  });
  $("[data-filters]").addEventListener("change", (e) => {
    if (e.target.matches("[data-event-filter]")) eventFilter = e.target.value;
    else filter = e.target.value;
    render();
  });
  $("[data-refresh]").addEventListener("click", load);
  $("[data-tools]").addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "export") exportReservations();
    if (action === "event-new") eventEditor();
    if (action === "member-new") memberEditor();
    if (action === "photos-add") photosEditor();
    if (action === "code-new") codeEditor();
    if (action === "abonnes-export") exportAbonnes();
    if (action === "copy-emails") copy(data.abonnes.map((r) => r.email).filter(Boolean).join(", "), "e-mail");
    if (action === "copy-numbers") copy(data.abonnes.map((r) => r.whatsapp && `+${r.whatsapp}`).filter(Boolean).join("\n"), "numéro");
  });

  // Copie dans le presse-papiers ; sans permission, le texte est proposé à copier à la main
  async function copy(text, what) {
    if (!text) return say(`Aucun ${what} à copier.`, true);
    const n = text.split(/,\s|\n/).length;
    try {
      await navigator.clipboard.writeText(text);
      say(what === "lien" || what === "code" ? `${what === "lien" ? "Lien" : "Code"} copié.` : `${n} ${what}${n > 1 ? "s" : ""} copié${n > 1 ? "s" : ""}.`);
    } catch {
      window.prompt("Copiez ce texte :", text);
    }
  }

  /* =====================================================================
     Actions sur les fiches
     ===================================================================== */
  const BUCKET_FILE = {
    reservations: (r) => ["recus", r.recu_path],
    photos: (r) => ["galerie", r.path],
    evenements: (r) => ["site", r.image_path],
    membres: (r) => ["site", r.photo_path],
  };
  const CONFIRM_DELETE = {
    reservations: (r) => `Supprimer la réservation ${r.reference} de ${r.prenom} ${r.nom} ? Le reçu sera aussi supprimé.`,
    evenements: (r) => {
      const n = data.reservations.filter((x) => x.event_id === r.id).length;
      return `Supprimer « ${r.titre} » ?${n ? ` Les ${n} réservation(s) liées restent dans l'onglet Réservations.` : ""} Pour le cacher sans le supprimer, utilisez « Masquer ».`;
    },
    photos: () => "Supprimer définitivement cette photo ?",
    membres: (r) => `Supprimer ${r.nom} de la liste des membres ?`,
    messages: (r) => `Supprimer le message de ${r.nom} ?`,
    avis: (r) => `Supprimer l'avis de ${r.auteur} ? Pour le cacher sans le supprimer, utilisez « Masquer ».`,
    abonnes: (r) => `Retirer ${r.email || `+${r.whatsapp}`} de la liste des alertes ?`,
    codes_promo: (c) => `Supprimer le code ${c.code} ?${c.utilisations ? " Les réservations qui l'ont utilisé gardent leur prix." : ""}`,
  };

  async function updateItem(item, change) {
    const [row] = await db.update(tab, keyOf(tab, item), change);
    Object.assign(item, row || change);
  }

  list.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-action]");
    if (!b) return;
    const id = b.closest("[data-id]")?.dataset.id;
    const item = data[tab]?.find?.((r) => keyOf(tab, r) === id);
    if (!item) return;
    const action = b.dataset.action;

    if (action === "receipt") return openReceipt(item.recu_path, item.reference);
    if (action === "event-edit") return eventEditor(item);
    if (action === "member-edit") return memberEditor(item);
    if (action === "event-resa") { eventFilter = item.id; return goTo("reservations", ""); }
    if (action === "code-edit") return codeEditor(item);
    if (action === "copy-ticket") return copy(ticketUrl(item), "lien");
    if (action === "copy-code") return copy(item.code, "code");

    // Confirmer ou refuser une réservation ouvre aussitôt WhatsApp vers le client.
    // La fenêtre est ouverte pendant le clic, sinon le navigateur la bloque.
    const waTo = action === "set" && tab === "reservations"
      ? clientWa(item.telephone, b.dataset.value === "confirmee" ? confirmMsg(item) : refuseMsg(item)) : null;
    const win = waTo ? window.open("", "_blank") : null;

    b.disabled = true;
    try {
      if (action === "set") {
        await updateItem(item, { statut: b.dataset.value });
        if (win) win.location.href = waTo;
        else if (waTo) say(`Statut enregistré. WhatsApp n'a pas pu s'ouvrir : utilisez le bouton « ${b.dataset.value === "confirmee" ? "Renvoyer le billet" : "Prévenir"} sur WhatsApp ».`);
        else if (tab === "reservations") say("Statut enregistré. Numéro de téléphone invalide : prévenez la personne autrement.", true);
      }
      else if (action === "toggle-traite") await updateItem(item, { traite: !item.traite });
      else if (action === "toggle-publie") await updateItem(item, { publie: !item.publie });
      else if (action === "toggle-actif") await updateItem(item, { actif: !item.actif });
      else if (action === "waitlist-accept") {
        if (!confirm(`Donner une place à ${item.prenom} ${item.nom} ? La réservation passe « à vérifier » : prévenez la personne pour le paiement, puis confirmez-la.`)) { b.disabled = false; return; }
        await updateItem(item, { liste_attente: false, statut: "en_attente" });
      }
      else if (action === "delete") {
        if (!confirm(CONFIRM_DELETE[tab](item))) { b.disabled = false; return; }
        await db.remove(tab, keyOf(tab, item));
        if (BUCKET_FILE[tab]) await files.remove(...BUCKET_FILE[tab](item));
        data[tab] = data[tab].filter((r) => r !== item);
      }
      if (!waTo || win) say("");
      render();
    } catch (err) {
      win?.close();
      say(err.message, true);
      b.disabled = false;
    }
  });

  /* ---------- Réglages ---------- */
  list.addEventListener("submit", async (e) => {
    if (e.target.id !== "settings-form") return;
    e.preventDefault();
    const form = e.target;
    const status = $(".form-status", form);
    const v = (n) => form.elements[n].value.trim();
    const row = {
      whatsapp: v("whatsapp").replace(/\D/g, ""),
      email: v("email"), instagram: v("instagram"), tiktok: v("tiktok"),
      moncash_numero: v("moncash_numero"), moncash_nom: v("moncash_nom"),
      natcash_numero: v("natcash_numero"), natcash_nom: v("natcash_nom"),
      updated_at: new Date().toISOString(),
    };
    const error =
      row.whatsapp && !/^509\d{8}$/.test(row.whatsapp) ? "Le numéro WhatsApp doit commencer par 509 suivi de 8 chiffres." :
      row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(row.email) ? "Adresse e-mail invalide." :
      [row.instagram, row.tiktok].some((u) => u && !u.startsWith("https://")) ? "Les liens doivent commencer par https://" : "";
    status.hidden = false;
    status.classList.toggle("is-error", Boolean(error));
    if (error) { status.textContent = error; return; }
    const submit = $("button[type=submit]", form);
    submit.disabled = true;
    status.textContent = "Enregistrement…";
    try {
      const [saved] = await db.update("reglages", 1, row);
      data.reglages = saved || { ...data.reglages, ...row };
      status.textContent = "Réglages enregistrés. Le site les utilise dès le prochain chargement de page.";
    } catch (err) {
      status.classList.add("is-error");
      status.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });

  /* ---------- Exports (CSV ouvrable dans Excel) ---------- */
  function exportReservations() {
    const rows = data.reservations.filter(matches.reservations);
    if (!rows.length) return say("Aucune réservation à exporter avec ces filtres.", true);
    downloadCsv("reservations", rows, [
      ["Référence", (r) => r.reference], ["Date", (r) => new Date(r.created_at).toLocaleString("fr-FR")],
      ["Événement", (r) => r.event_title], ["Prénom", (r) => r.prenom], ["Nom", (r) => r.nom],
      ["Téléphone", (r) => r.telephone], ["E-mail", (r) => r.email], ["Paiement", (r) => payLabel(r.moyen_paiement)],
      ["Montant", (r) => String(r.montant).replace(".", ",")], ["Code promo", (r) => r.code_promo],
      ["Statut", (r) => (r.liste_attente ? "Liste d'attente" : STATUS[r.statut][0])],
      ["Entrée", (r) => (r.scanned_at ? new Date(r.scanned_at).toLocaleString("fr-FR") : "")],
    ]);
  }

  function exportAbonnes() {
    const rows = data.abonnes.filter(matches.abonnes);
    if (!rows.length) return say("Aucun abonné à exporter.", true);
    downloadCsv("abonnes", rows, [
      ["Inscription", (r) => new Date(r.created_at).toLocaleString("fr-FR")], ["E-mail", (r) => r.email],
      ["WhatsApp", (r) => (r.whatsapp ? `+${r.whatsapp}` : "")],
    ]);
  }

  function downloadCsv(name, rows, cols) {
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.map(([h]) => cell(h)).join(";"), ...rows.map((r) => cols.map(([, f]) => cell(f(r))).join(";"))].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${name}-bja-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* =====================================================================
     Fenêtre d'édition (événement, membre, ajout de photos)
     ===================================================================== */
  const catOptions = (current) => Object.entries(cfg.categories)
    .map(([k, l]) => `<option value="${k}"${k === current ? " selected" : ""}>${esc(l)}</option>`).join("");

  function openEditor(title, fieldsHtml, submitLabel, onSubmit) {
    editor.innerHTML = `
      <form class="admin-editor-form" novalidate>
        <div class="admin-editor-head">
          <h2 id="editor-title">${title}</h2>
          <button class="admin-x" type="button" data-close aria-label="Fermer">✕</button>
        </div>
        <div class="admin-editor-body">${fieldsHtml}</div>
        <div class="admin-editor-foot">
          <p class="form-status" role="status" hidden></p>
          <button class="btn btn--outline" type="button" data-close>Annuler</button>
          <button class="btn btn--primary" type="submit">${submitLabel}</button>
        </div>
      </form>`;
    const form = $("form", editor);
    const status = $(".form-status", form);
    const submit = $("button[type=submit]", form);
    $$("[data-close]", form).forEach((b) => b.addEventListener("click", () => editor.close()));

    // Aperçu des images choisies
    $$("input[type=file][data-preview]", form).forEach((input) => input.addEventListener("change", () => {
      const box = $(input.dataset.preview, form);
      box.querySelectorAll("img").forEach((img) => URL.revokeObjectURL(img.src));
      box.innerHTML = [...input.files].slice(0, 12).map((f) => `<img src="${URL.createObjectURL(f)}" alt="">`).join("");
    }));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fail = (msg) => { status.hidden = false; status.classList.add("is-error"); status.textContent = msg; };
      submit.disabled = true;
      status.hidden = false;
      status.classList.remove("is-error");
      status.textContent = "Enregistrement…";
      try {
        const error = await onSubmit(form, (msg) => (status.textContent = msg));
        if (error) return fail(error);
        editor.close();
        render();
      } catch (err) {
        fail(err.message);
      } finally {
        submit.disabled = false;
      }
    });
    editor.showModal();
    form.querySelector("input, select, textarea")?.focus();
  }

  const fileField = (name, label, currentUrl, multiple = false) => `
    <div class="field">
      <label for="ed-${name}">${label}</label>
      <input id="ed-${name}" name="${name}" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"${multiple ? " multiple" : ""} data-preview="[data-preview-${name}]">
      <div class="admin-preview" data-preview-${name}>${currentUrl ? `<img src="${esc(currentUrl)}" alt="">` : ""}</div>
    </div>`;

  async function uploadSiteImage(file, folder) {
    const { blob, ext } = await prepareImage(file);
    if (ext === "heic") throw new Error("Les photos HEIC ne sont pas acceptées ici : choisissez un JPG ou un PNG.");
    const path = `${folder}/${api.uuid()}.${ext}`;
    await files.upload("site", path, blob);
    return path;
  }

  const slug = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "evenement";

  /* ---------- Événement ---------- */
  function eventEditor(ev = null) {
    const v = (k, d = "") => esc(ev?.[k] ?? d);
    openEditor(ev ? "Modifier l'événement" : "Nouvel événement", `
      <div class="field"><label for="ed-titre">Titre</label><input id="ed-titre" name="titre" maxlength="160" required value="${v("titre")}"></div>
      <div class="form-row">
        <div class="field"><label for="ed-categorie">Catégorie</label><select id="ed-categorie" name="categorie">${catOptions(ev?.categorie)}</select></div>
        <div class="field"><label for="ed-debut">Date et heure</label><input id="ed-debut" name="debut" type="datetime-local" required value="${esc((ev?.debut || "").slice(0, 16))}"></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="ed-horaires">Horaires affichés</label><input id="ed-horaires" name="horaires" maxlength="80" placeholder="19h00 – 23h30" value="${v("horaires")}"></div>
        <div class="field"><label for="ed-prix">Prix (${esc(cfg.currency)}, 0 = gratuit)</label><input id="ed-prix" name="prix" type="number" min="0" step="1" inputmode="numeric" value="${v("prix", "0")}"></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="ed-lieu">Lieu</label><input id="ed-lieu" name="lieu" maxlength="160" value="${v("lieu")}"></div>
        <div class="field"><label for="ed-places">Nombre de places</label><input id="ed-places" name="places" type="number" min="1" step="1" inputmode="numeric" placeholder="Illimité" value="${v("places")}">
          <span class="admin-hint">Vide = illimité. Une fois complet, les inscriptions passent en liste d'attente.</span></div>
      </div>
      <div class="field"><label for="ed-description">Description</label><textarea id="ed-description" name="description" maxlength="1200">${v("description")}</textarea></div>
      ${fileField("image", "Image de l'événement (facultatif)", ev?.image_path ? siteImage(ev.image_path) : "")}
      <label class="consent"><input type="checkbox" name="publie"${!ev || ev.publie ? " checked" : ""}> Visible sur le site</label>`,
      ev ? "Enregistrer" : "Créer l'événement",
      async (form) => {
        const f = form.elements;
        const row = {
          titre: f.titre.value.trim(), categorie: f.categorie.value, debut: f.debut.value,
          horaires: f.horaires.value.trim(), lieu: f.lieu.value.trim(), prix: Math.max(0, Number(f.prix.value) || 0),
          description: f.description.value.trim(), publie: f.publie.checked,
          places: f.places.value ? Math.trunc(Number(f.places.value)) : null,
        };
        if (row.titre.length < 2) return "Indiquez un titre.";
        if (row.places !== null && !(row.places >= 1)) return "Le nombre de places doit être d'au moins 1 (ou vide pour illimité).";
        if (!row.debut) return "Indiquez la date et l'heure.";
        const file = f.image.files[0];
        const oldImage = ev?.image_path;
        if (file) row.image_path = await uploadSiteImage(file, "evenements");
        if (ev) {
          await updateItem(ev, row);
          if (file && oldImage) files.remove("site", oldImage);
        } else {
          row.id = `${slug(row.titre)}-${row.debut.slice(0, 4)}-${api.uuid().slice(0, 4)}`;
          const [created] = await db.insert("evenements", row);
          data.evenements.unshift(created);
          data.evenements.sort((a, b) => new Date(b.debut) - new Date(a.debut));
        }
        say(ev ? "Événement mis à jour." : "Événement créé. Il apparaît dans l'agenda du site.");
      });
  }

  /* ---------- Membre ---------- */
  const SOCIALS = ["instagram", "tiktok", "facebook", "linkedin"];
  const SOCIAL_LABELS = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", linkedin: "LinkedIn" };
  function memberEditor(m = null) {
    const v = (k, d = "") => esc(m?.[k] ?? d);
    const nextOrder = Math.max(0, ...data.membres.map((x) => x.ordre)) + 1;
    openEditor(m ? "Modifier le membre" : "Nouveau membre", `
      <div class="form-row">
        <div class="field"><label for="ed-nom">Nom et prénom</label><input id="ed-nom" name="nom" maxlength="80" required value="${v("nom")}"></div>
        <div class="field"><label for="ed-role">Rôle</label><input id="ed-role" name="role" maxlength="80" required placeholder="Président·e, Trésorier·e…" value="${v("role")}"></div>
      </div>
      <div class="field"><label for="ed-bio">Présentation</label><textarea id="ed-bio" name="bio" maxlength="600">${v("bio")}</textarea></div>
      <div class="form-row">
        <div class="field"><label for="ed-instagram">Instagram</label><input id="ed-instagram" name="instagram" type="url" maxlength="300" placeholder="https://www.instagram.com/…" value="${v("instagram")}"></div>
        <div class="field"><label for="ed-tiktok">TikTok</label><input id="ed-tiktok" name="tiktok" type="url" maxlength="300" placeholder="https://www.tiktok.com/@…" value="${v("tiktok")}"></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="ed-facebook">Facebook</label><input id="ed-facebook" name="facebook" type="url" maxlength="300" placeholder="https://www.facebook.com/…" value="${v("facebook")}"></div>
        <div class="field"><label for="ed-linkedin">LinkedIn</label><input id="ed-linkedin" name="linkedin" type="url" maxlength="300" placeholder="https://www.linkedin.com/in/…" value="${v("linkedin")}"></div>
      </div>
      <div class="field"><label for="ed-ordre">Position dans la liste (1 = en premier)</label><input id="ed-ordre" name="ordre" type="number" step="1" inputmode="numeric" value="${v("ordre", nextOrder)}"></div>
      ${fileField("photo", "Photo (facultatif)", m?.photo_path ? siteImage(m.photo_path) : "")}
      <label class="consent"><input type="checkbox" name="publie"${!m || m.publie ? " checked" : ""}> Visible sur le site</label>`,
      m ? "Enregistrer" : "Ajouter le membre",
      async (form) => {
        const f = form.elements;
        const row = {
          nom: f.nom.value.trim(), role: f.role.value.trim(), bio: f.bio.value.trim(),
          ordre: Math.trunc(Number(f.ordre.value) || 0), publie: f.publie.checked,
        };
        for (const k of SOCIALS) {
          let url = f[k].value.trim();
          if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
          row[k] = url ? url.replace(/^http:/i, "https:") : null;
          if (url && !/^https:\/\/[^\s]+\.[^\s]+$/i.test(row[k])) return `Lien ${SOCIAL_LABELS[k]} invalide.`;
        }
        if (row.nom.length < 2) return "Indiquez le nom.";
        if (row.role.length < 2) return "Indiquez le rôle.";
        const file = f.photo.files[0];
        const oldPhoto = m?.photo_path;
        if (file) row.photo_path = await uploadSiteImage(file, "membres");
        if (m) {
          await updateItem(m, row);
          if (file && oldPhoto) files.remove("site", oldPhoto);
        } else {
          const [created] = await db.insert("membres", row);
          data.membres.push(created);
        }
        data.membres.sort((a, b) => a.ordre - b.ordre);
        say(m ? "Membre mis à jour." : "Membre ajouté.");
      });
  }

  /* ---------- Ajout de photos à la galerie (publiées directement) ---------- */
  function photosEditor() {
    const events = data.evenements.map((e) => `<option>${esc(e.titre)}</option>`).join("");
    openEditor("Ajouter des photos", `
      ${fileField("photos", "Photos (20 maximum)", "", true)}
      <div class="form-row">
        <div class="field"><label for="ed-categorie">Catégorie</label><select id="ed-categorie" name="categorie">${catOptions()}</select></div>
        <div class="field"><label for="ed-evenement">Événement (facultatif)</label><select id="ed-evenement" name="evenement"><option value="">Aucun</option>${events}</select></div>
      </div>
      <p class="admin-hint">Les photos ajoutées ici sont publiées directement dans la galerie.</p>`,
      "Publier les photos",
      async (form, progress) => {
        const picked = [...form.elements.photos.files];
        if (!picked.length) return "Choisissez au moins une photo.";
        if (picked.length > 20) return "20 photos maximum à la fois.";
        const lot = api.uuid();
        const categorie = form.elements.categorie.value;
        const evenement = form.elements.evenement.value || null;
        let done = 0;
        const errors = [];
        for (const file of picked) {
          progress(`Envoi ${done + 1} sur ${picked.length}…`);
          try {
            const { blob, ext } = await prepareImage(file);
            const path = `${lot}/${api.uuid()}.${ext}`;
            await files.upload("galerie", path, blob);
            const [row] = await db.insert("photos", { lot, path, categorie, evenement, auteur: "BJA HOUSE", statut: "approuvee" });
            data.photos.unshift(row);
            done++;
          } catch (err) {
            errors.push(err.message);
          }
        }
        if (errors.length) {
          render();
          return `${done} photo(s) publiée(s). ${errors.length} échec(s) : ${errors[0]}`;
        }
        filter = "approuvee";
        say(`${done} photo${done > 1 ? "s" : ""} publiée${done > 1 ? "s" : ""} dans la galerie.`);
      });
  }

  /* ---------- Code promo ---------- */
  // datetime-local attend l'heure locale du navigateur, sans fuseau
  const toLocalInput = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  function codeEditor(c = null) {
    const events = data.evenements.filter((e) => Number(e.prix) > 0)
      .map((e) => `<option value="${esc(e.id)}"${e.id === c?.event_id ? " selected" : ""}>${esc(e.titre)}</option>`).join("");
    openEditor(c ? `Modifier le code ${esc(c.code)}` : "Nouveau code promo", `
      <div class="field"><label for="ed-code">Code</label>
        <input id="ed-code" name="code" maxlength="40" required autocapitalize="characters" autocomplete="off" placeholder="MEMBRE2026" value="${esc(c?.code ?? "")}"${c ? " readonly" : ""}>
        <span class="admin-hint">${c ? "Le code ne peut pas être renommé : créez-en un nouveau si besoin." : "Lettres, chiffres, - ou _, de 3 à 40 caractères."}</span></div>
      <div class="form-row">
        <div class="field"><label for="ed-type">Réduction</label><select id="ed-type" name="type">
          <option value="pourcent"${c?.type !== "montant" ? " selected" : ""}>Pourcentage (%)</option>
          <option value="montant"${c?.type === "montant" ? " selected" : ""}>Montant (${esc(cfg.currency)})</option></select></div>
        <div class="field"><label for="ed-valeur">Valeur</label><input id="ed-valeur" name="valeur" type="number" min="1" step="1" inputmode="numeric" required value="${esc(c ? Number(c.valeur) : "")}"></div>
      </div>
      <div class="field"><label for="ed-event">Valable pour</label><select id="ed-event" name="event_id"><option value="">Tous les événements payants</option>${events}</select></div>
      <div class="form-row">
        <div class="field"><label for="ed-max">Nombre d'utilisations max.</label><input id="ed-max" name="max_utilisations" type="number" min="1" step="1" inputmode="numeric" placeholder="Illimité" value="${esc(c?.max_utilisations ?? "")}">
          <span class="admin-hint">Ex. 20 pour les 20 premiers inscrits.</span></div>
        <div class="field"><label for="ed-expire">Expire le (facultatif)</label><input id="ed-expire" name="expire_le" type="datetime-local" value="${esc(toLocalInput(c?.expire_le))}"></div>
      </div>
      <label class="consent"><input type="checkbox" name="actif"${!c || c.actif ? " checked" : ""}> Code actif</label>`,
      c ? "Enregistrer" : "Créer le code",
      async (form) => {
        const f = form.elements;
        const row = {
          type: f.type.value, valeur: Number(f.valeur.value), event_id: f.event_id.value || null,
          max_utilisations: f.max_utilisations.value ? Math.trunc(Number(f.max_utilisations.value)) : null,
          expire_le: f.expire_le.value ? new Date(f.expire_le.value).toISOString() : null, actif: f.actif.checked,
        };
        const code = f.code.value.trim().toUpperCase();
        if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return "Code invalide : lettres, chiffres, - ou _, de 3 à 40 caractères.";
        if (!(row.valeur > 0)) return "Indiquez la valeur de la réduction.";
        if (row.type === "pourcent" && row.valeur > 100) return "Un pourcentage ne peut pas dépasser 100.";
        if (row.max_utilisations !== null && !(row.max_utilisations >= 1)) return "Le nombre d'utilisations doit être d'au moins 1.";
        if (c) {
          await updateItem(c, row);
        } else {
          if (data.codes_promo.some((x) => x.code === code)) return `Le code ${code} existe déjà.`;
          const [created] = await db.insert("codes_promo", { code, ...row });
          data.codes_promo.unshift(created);
        }
        say(c ? `Code ${code} mis à jour.` : `Code ${code} créé. Il s'utilise sur la page de réservation.`);
      });
  }

  editor.addEventListener("click", (e) => { if (e.target === editor) editor.close(); });

  /* =====================================================================
     Scanner des billets à l'entrée
     ===================================================================== */
  const scanner = { stream: null, timer: 0, busy: false, last: "", lastAt: 0 };
  let jsQRLoading = null;

  function scannerView() {
    return `
      <section class="admin-scanner">
        <div class="scanner-video" data-scan-video hidden><video playsinline muted></video><span class="scanner-frame" aria-hidden="true"></span></div>
        <div class="scanner-result" data-scan-result aria-live="assertive">
          <b>Prêt à scanner</b><span>Ouvrez la caméra et visez le QR code du billet.</span>
        </div>
        <div class="admin-actions">
          ${btn("scan-start", "Ouvrir la caméra", "primary")}
          ${btn("scan-stop", "Fermer la caméra", "outline", " hidden")}
        </div>
        <form class="scanner-manual" data-scan-form novalidate>
          <label for="scan-code">Ou tapez la référence du billet</label>
          <div class="scanner-manual-row">
            <input id="scan-code" name="code" autocomplete="off" autocapitalize="characters" placeholder="BJA-7K2M9P">
            <button class="btn btn--primary btn--sm" type="submit">Valider</button>
          </div>
        </form>
      </section>`;
  }

  function scanResult(kind, title, text) {
    const box = $("[data-scan-result]", list);
    if (!box) return;
    box.className = `scanner-result scanner-result--${kind}`;
    box.innerHTML = `<b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ""}`;
  }

  const loadJsQR = () => jsQRLoading || (jsQRLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "js/vendor/jsQR.js";
    s.onload = resolve;
    s.onerror = () => { jsQRLoading = null; reject(new Error("Lecteur QR indisponible.")); };
    document.head.append(s);
  }));

  async function qrReader(video) {
    if ("BarcodeDetector" in window) {
      try {
        if ((await window.BarcodeDetector.getSupportedFormats()).includes("qr_code")) {
          const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          return async () => (await detector.detect(video))[0]?.rawValue;
        }
      } catch { /* on passe à jsQR */ }
    }
    await loadJsQR();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    return async () => {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w) return null;
      const scale = Math.min(1, 720 / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data;
    };
  }

  async function startScan() {
    if (scanner.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      return scanResult("no", "Caméra indisponible", location.protocol === "https:"
        ? "Ce navigateur ne donne pas accès à la caméra. Tapez la référence ci-dessous."
        : "Ouvrez l'espace admin sur le site en ligne (https) pour utiliser la caméra, ou tapez la référence ci-dessous.");
    }
    try {
      scanner.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch {
      return scanResult("no", "Accès à la caméra refusé", "Autorisez la caméra dans le navigateur, ou tapez la référence ci-dessous.");
    }
    if (tab !== "scanner") return stopScan();
    const wrap = $("[data-scan-video]", list);
    const video = $("video", wrap);
    video.srcObject = scanner.stream;
    wrap.hidden = false;
    $("[data-action=scan-start]", list).hidden = true;
    $("[data-action=scan-stop]", list).hidden = false;
    await video.play().catch(() => {});
    let read;
    try { read = await qrReader(video); } catch (err) { stopScan(); return scanResult("no", err.message, "Tapez la référence ci-dessous."); }
    scanResult("idle", "Caméra ouverte", "Visez le QR code du billet.");
    const tick = async () => {
      if (!scanner.stream) return;
      if (!scanner.busy) {
        const value = await read().catch(() => null);
        // Tant que le même billet reste devant la caméra, on ne le revalide pas
        if (value && value === scanner.last && Date.now() - scanner.lastAt < 4000) scanner.lastAt = Date.now();
        else if (value) {
          scanner.last = value;
          scanner.lastAt = Date.now();
          await validate(value);
          scanner.lastAt = Date.now();
        }
      }
      if (scanner.stream) scanner.timer = setTimeout(tick, 200);
    };
    tick();
  }

  function stopScan() {
    clearTimeout(scanner.timer);
    scanner.stream?.getTracks().forEach((t) => t.stop());
    scanner.stream = null;
    const wrap = $("[data-scan-video]", list);
    if (!wrap) return;
    $("video", wrap).srcObject = null;
    wrap.hidden = true;
    $("[data-action=scan-start]", list).hidden = false;
    $("[data-action=scan-stop]", list).hidden = true;
  }

  async function validate(code) {
    scanner.busy = true;
    scanResult("idle", "Vérification…", "");
    try {
      const r = await db.rpc("valider_entree", { p_code: code });
      const who = r.nom ? `${r.nom} · ${r.reference}` : "";
      if (r.resultat === "ok") {
        scanResult("ok", "Entrée validée", `${who}\n${r.evenement}`);
        const resa = data.reservations.find((x) => x.reference === r.reference);
        if (resa) resa.scanned_at = r.scanned_at;
      } else if (r.resultat === "deja") {
        scanResult("warn", "Billet déjà utilisé", `${who}\nEntré le ${when(r.scanned_at)}`);
      } else if (r.resultat === "non_confirme") {
        scanResult("no", r.liste_attente ? "Personne en liste d'attente" : r.statut === "refusee" ? "Réservation refusée" : "Paiement pas encore confirmé", `${who}\n${r.evenement}`);
      } else {
        scanResult("no", "Billet inconnu", "Ce QR code ne correspond à aucune réservation.");
      }
      navigator.vibrate?.(r.resultat === "ok" ? 120 : [80, 60, 80]);
    } catch (err) {
      scanResult("no", "Vérification impossible", err.message);
    } finally {
      scanner.busy = false;
    }
  }

  list.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "scan-start") startScan();
    if (action === "scan-stop") { stopScan(); scanResult("idle", "Caméra fermée", "Rouvrez-la pour scanner le billet suivant."); }
  });
  list.addEventListener("submit", (e) => {
    if (!e.target.matches("[data-scan-form]")) return;
    e.preventDefault();
    const code = e.target.elements.code.value.trim();
    if (!code) return scanResult("no", "Référence manquante", "Tapez la référence inscrite sur le billet (ex. BJA-7K2M9P).");
    validate(code).then(() => e.target.reset());
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopScan(); });

  /* =====================================================================
     Entrées : personnes scannées, heure d'arrivée, remerciements
     ===================================================================== */
  const THANKS_KEY = "bja-admin-remercies";
  const thanked = new Set((() => { try { return JSON.parse(localStorage.getItem(THANKS_KEY)) || []; } catch { return []; } })());
  const saveThanked = () => { try { localStorage.setItem(THANKS_KEY, JSON.stringify([...thanked])); } catch { /* stockage indisponible */ } };
  let thanksText = "Bonjour {prenom}, merci d'être venu(e) à « {evenement} » ! On espère que vous avez passé un super moment. À très bientôt pour le prochain événement. BJA HOUSE";
  let queue = [];

  const entrees = () => data.reservations
    .filter((r) => r.scanned_at && (!eventFilter || r.event_id === eventFilter))
    .sort((a, b) => new Date(a.scanned_at) - new Date(b.scanned_at));
  const fillThanks = (r) => thanksText.replaceAll("{prenom}", r.prenom).replaceAll("{evenement}", r.event_title);

  function entreesView() {
    const rows = entrees();
    if (!rows.length) return `<p class="admin-empty">Aucune entrée scannée${eventFilter ? " pour cet événement" : ""}. Les personnes apparaissent ici dès que leur billet est scanné.</p>`;
    const byEvent = new Map();
    rows.forEach((r) => (byEvent.get(r.event_id) || byEvent.set(r.event_id, []).get(r.event_id)).push(r));
    const groups = [...byEvent.values()].map((list) => `
      <section class="entries-group">
        <h3>${esc(list[0].event_title)} <span>${list.length} entrée${list.length > 1 ? "s" : ""}</span></h3>
        <ul class="entries-list">${list.map((r) => `
          <li>
            <label class="entry">
              <input type="checkbox" data-entry value="${esc(r.id)}" checked>
              <span class="entry-name"><b>${esc(r.prenom)} ${esc(r.nom)}</b><small>${esc(r.telephone)} · ${esc(r.reference)}</small></span>
              <time>${new Date(r.scanned_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
              ${thanked.has(r.id) ? tag("Remercié", "ok") : ""}
            </label>
          </li>`).join("")}
        </ul>
      </section>`).join("");
    return `
      <section class="admin-entries">
        <div class="entries-head">
          <p><b>${rows.length}</b> personne${rows.length > 1 ? "s" : ""} entrée${rows.length > 1 ? "s" : ""}, de la première à la dernière arrivée.</p>
          <label class="consent"><input type="checkbox" data-entry-all checked> Tout sélectionner</label>
        </div>
        ${groups}
        <form class="entries-thanks" data-thanks-form novalidate>
          <label for="thanks-text">Message de remerciement</label>
          <textarea id="thanks-text" name="text" maxlength="600">${esc(thanksText)}</textarea>
          <div class="admin-actions">
            <button class="btn btn--primary btn--sm" type="submit" data-thanks-count>Envoyer à la sélection (${rows.length})</button>
            ${btn("thanks-copy", "Copier les numéros")}
          </div>
          <div class="entries-queue" data-thanks-queue hidden></div>
        </form>
      </section>`;
  }

  const selectedEntries = () => {
    const ids = new Set($$("[data-entry]:checked", list).map((c) => c.value));
    return entrees().filter((r) => ids.has(r.id));
  };
  function refreshThanksCount() {
    const n = selectedEntries().length;
    const b = $("[data-thanks-count]", list);
    if (b) { b.textContent = `Envoyer à la sélection (${n})`; b.disabled = !n; }
  }
  // WhatsApp n'autorise pas l'envoi groupé depuis un site : un clic ouvre la conversation suivante.
  function showQueue() {
    const box = $("[data-thanks-queue]", list);
    if (!box) return;
    box.hidden = false;
    const next = queue[0];
    box.innerHTML = next
      ? `<p>Prochain message : <b>${esc(next.prenom)} ${esc(next.nom)}</b> (${queue.length} restant${queue.length > 1 ? "s" : ""})</p>
         ${clientWa(next.telephone, fillThanks(next)) ? `<a class="btn btn--primary btn--sm" data-thanks-next href="${esc(clientWa(next.telephone, fillThanks(next)))}" target="_blank" rel="noopener">Ouvrir WhatsApp pour ${esc(next.prenom)}</a>` : `<span class="admin-hint">Numéro invalide.</span>`}
         ${btn("thanks-skip", "Passer")}`
      : `<p><b>Terminé.</b> Tous les messages ont été ouverts.</p>`;
  }
  const advanceQueue = (sent) => {
    const r = queue.shift();
    if (r && sent) { thanked.add(r.id); saveThanked(); }
    showQueue();
    const item = r && $(`[data-entry][value="${CSS.escape(r.id)}"]`, list)?.closest(".entry");
    if (item && sent && !$(".admin-badge", item)) item.insertAdjacentHTML("beforeend", tag("Remercié", "ok"));
  };

  list.addEventListener("change", (e) => {
    if (e.target.matches("[data-entry-all]")) $$("[data-entry]", list).forEach((c) => (c.checked = e.target.checked));
    if (e.target.matches("[data-entry], [data-entry-all]")) refreshThanksCount();
  });
  list.addEventListener("input", (e) => { if (e.target.id === "thanks-text") thanksText = e.target.value; });
  list.addEventListener("submit", (e) => {
    if (!e.target.matches("[data-thanks-form]")) return;
    e.preventDefault();
    queue = selectedEntries();
    if (!thanksText.trim()) return say("Écrivez le message de remerciement.", true);
    showQueue();
  });
  list.addEventListener("click", (e) => {
    if (e.target.closest("[data-thanks-next]")) setTimeout(() => advanceQueue(true), 0);
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "thanks-skip") advanceQueue(false);
    if (action === "thanks-copy") copy(selectedEntries().map((r) => r.telephone).join("\n"), "numéro");
  });

  /* =====================================================================
     Statistiques
     ===================================================================== */
  function statsView() {
    const rows = new Map();
    const row = (id) => rows.get(id) || rows.set(id, { id, ok: 0, wait: 0, queue: 0, in: 0, revenue: 0, notes: [] }).get(id);
    data.reservations.forEach((r) => {
      const x = row(r.event_id);
      if (r.liste_attente) x.queue++;
      else if (r.statut === "confirmee") { x.ok++; x.revenue += Number(r.montant || 0); }
      else if (r.statut === "en_attente") x.wait++;
      if (r.scanned_at) x.in++;
    });
    data.avis.forEach((a) => row(a.event_id).notes.push(a.note));
    const debut = (id) => data.evenements.find((e) => e.id === id)?.debut || "";
    const events = [...rows.values()].sort((a, b) => debut(b.id).localeCompare(debut(a.id)));

    const sum = (k) => events.reduce((s, x) => s + x[k], 0);
    const notes = data.avis.map((a) => a.note);
    const avg = (list) => (list.reduce((s, n) => s + n, 0) / list.length).toFixed(1).replace(".", ",");
    const usedCodes = data.codes_promo.reduce((s, c) => s + c.utilisations, 0);
    const kpi = (value, label) => `<div><b>${esc(value)}</b><span>${label}</span></div>`;
    const kpis = `
      <div class="admin-stats admin-kpis">
        ${kpi(sum("revenue") > 0 ? api.price(sum("revenue")) : `0 ${cfg.currency}`, "Recettes confirmées")}
        ${kpi(sum("ok"), "Places confirmées")}
        ${kpi(sum("in"), "Entrées scannées")}
        ${kpi(data.abonnes.length, "Abonnés aux alertes")}
        ${kpi(notes.length ? `${avg(notes)} / 5` : "—", `Note moyenne (${notes.length} avis)`)}
        ${kpi(usedCodes, "Codes promo utilisés")}
      </div>`;
    if (!events.length) return `<section class="admin-statsview">${kpis}<p class="admin-empty">Les graphiques apparaissent dès les premières réservations.</p></section>`;

    const label = (x) => {
      const d = debut(x.id);
      return `<span class="chart-label">${esc(eventTitle(x.id))}${d ? `<small>${new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</small>` : ""}</span>`;
    };
    const pct = (n, max) => (max ? Math.max(n ? 1.5 : 0, (n / max) * 100) : 0).toFixed(1);
    const maxResa = Math.max(1, ...events.map((x) => x.ok + x.wait + x.queue));
    const maxRevenue = Math.max(1, ...events.map((x) => x.revenue));
    const seg = (cls, n, max, title) => (n ? `<span class="seg seg--${cls}" style="width:${pct(n, max)}%" title="${n} ${title}"></span>` : "");

    const inscriptions = events.map((x) => `
      <div class="chart-row">
        ${label(x)}
        <div class="chart-bar">${seg("ok", x.ok, maxResa, "confirmée(s)")}${seg("wait", x.wait, maxResa, "à vérifier")}${seg("queue", x.queue, maxResa, "en liste d'attente")}</div>
        <b class="chart-value">${x.ok + x.wait + x.queue}</b>
      </div>`).join("");
    const recettes = events.map((x) => `
      <div class="chart-row">
        ${label(x)}
        <div class="chart-bar">${seg("ok", x.revenue, maxRevenue, cfg.currency)}</div>
        <b class="chart-value">${esc(x.revenue ? api.price(x.revenue) : "—")}</b>
      </div>`).join("");
    const rated = events.filter((x) => x.notes.length);
    const avisRows = rated.map((x) => `
      <div class="chart-row">
        ${label(x)}
        <div class="chart-bar">${seg("star", x.notes.reduce((s, n) => s + n, 0) / x.notes.length, 5, "sur 5")}</div>
        <b class="chart-value">${avg(x.notes)} <small>(${x.notes.length})</small></b>
      </div>`).join("");

    return `
      <section class="admin-statsview">
        ${kpis}
        <article class="chart-card">
          <h3>Inscriptions par événement</h3>
          <p class="chart-legend"><span class="seg--ok"></span>Confirmées <span class="seg--wait"></span>À vérifier <span class="seg--queue"></span>Liste d'attente</p>
          ${inscriptions}
        </article>
        <article class="chart-card">
          <h3>Recettes par événement</h3>
          <p class="chart-legend">Réservations confirmées, en ${esc(cfg.currency)}, après codes promo.</p>
          ${recettes}
        </article>
        ${rated.length ? `<article class="chart-card"><h3>Note moyenne par événement</h3>${avisRows}</article>` : ""}
      </section>`;
  }

  /* =====================================================================
     Reçus (bucket privé)
     ===================================================================== */
  const receipt = $("[data-receipt]");
  const receiptBody = $("[data-receipt-body]");
  let receiptUrl = null;

  async function openReceipt(path, ref) {
    $("[data-receipt-title]").textContent = `Reçu ${ref}`;
    receiptBody.innerHTML = "<p>Chargement…</p>";
    receipt.showModal();
    try {
      const res = await request(`/storage/v1/object/authenticated/recus/${path.split("/").map(encodeURIComponent).join("/")}`);
      if (receiptUrl) URL.revokeObjectURL(receiptUrl);
      receiptUrl = URL.createObjectURL(await res.blob());
      receiptBody.innerHTML = `
        <img src="${receiptUrl}" alt="Reçu de paiement ${esc(ref)}">
        <a class="btn btn--outline btn--sm" href="${receiptUrl}" download="recu-${esc(ref)}">Télécharger</a>`;
    } catch (err) {
      receiptBody.innerHTML = `<p class="form-status is-error">${esc(err.message)}</p>`;
    }
  }
  $("[data-receipt-close]").addEventListener("click", () => receipt.close());
  receipt.addEventListener("click", (e) => { if (e.target === receipt) receipt.close(); });

  /* =====================================================================
     Démarrage
     ===================================================================== */
  if (!api.isReady()) {
    loginView.hidden = false;
    sayLogin("Supabase n'est pas configuré (js/config.js).");
    $("button[type=submit]", loginForm).disabled = true;
    return;
  }
  session = restore();
  if (session?.refresh_token) {
    show(true);
    load();
  } else {
    show(false);
  }
})();
