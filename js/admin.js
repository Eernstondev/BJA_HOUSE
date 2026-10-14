/* BJA HOUSE — espace admin : connexion Supabase Auth et gestion complète du site
   (réservations, événements, photos, membres, messages, réglages) */
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
  const db = {
    list: async (table, query) => (await request(`/rest/v1/${table}?${query}`)).json(),
    insert: async (table, row) =>
      (await request(`/rest/v1/${table}`, { method: "POST", headers: { ...JSON_HEADERS, Prefer: "return=representation" }, body: JSON.stringify(row) })).json(),
    update: async (table, id, row) =>
      (await request(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { ...JSON_HEADERS, Prefer: "return=representation" }, body: JSON.stringify(row) })).json(),
    remove: (table, id) => request(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }),
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
  const data = { reservations: [], evenements: [], photos: [], membres: [], messages: [], reglages: {} };

  const isPastEvent = (ev) => api.isPast({ date: ev.debut });
  const TABS = {
    reservations: { label: "Réservations", filters: [["en_attente", "À vérifier"], ["confirmee", "Confirmées"], ["refusee", "Refusées"], ["", "Toutes"]], pending: (r) => r.statut === "en_attente" },
    evenements: { label: "Événements", filters: [["avenir", "À venir"], ["passes", "Passés"], ["masques", "Masqués"], ["", "Tous"]] },
    photos: { label: "Photos", filters: [["en_attente", "En attente"], ["approuvee", "Publiées"], ["refusee", "Refusées"], ["", "Toutes"]], pending: (r) => r.statut === "en_attente" },
    membres: { label: "Membres", filters: [] },
    messages: { label: "Messages", filters: [["non", "Non traités"], ["oui", "Traités"], ["", "Tous"]], pending: (r) => !r.traite },
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
      const [reservations, evenements, photos, membres, messages, reglages] = await Promise.all([
        db.list("reservations", q),
        db.list("evenements", "select=*&order=debut.desc"),
        db.list("photos", q),
        db.list("membres", "select=*&order=ordre.asc,created_at.asc"),
        db.list("messages", q),
        db.list("reglages", "select=*&id=eq.1"),
      ]);
      Object.assign(data, { reservations, evenements, photos, membres, messages, reglages: reglages[0] || {} });
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
    if (tab === "reservations") {
      const ids = new Set(data.reservations.map((r) => r.event_id));
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
    }[tab] || "";
  }

  const matches = {
    reservations: (r) => (!filter || r.statut === filter) && (!eventFilter || r.event_id === eventFilter),
    evenements: (e) => !filter || (filter === "masques" ? !e.publie : filter === "passes" ? isPastEvent(e) : !isPastEvent(e)),
    photos: (r) => !filter || r.statut === filter,
    membres: () => true,
    messages: (r) => !filter || (filter === "oui" ? r.traite : !r.traite),
  };

  const cards = {
    reservations: (r) => `
      <article class="admin-card" data-id="${esc(r.id)}">
        <div class="admin-card-head"><span class="admin-ref">${esc(r.reference)}</span>${badge(r.statut)}<time>${when(r.created_at)}</time></div>
        <h3>${esc(r.event_title)}</h3>
        <dl class="admin-facts">
          <div><dt>Client</dt><dd>${esc(r.prenom)} ${esc(r.nom)}</dd></div>
          <div><dt>Téléphone</dt><dd><a href="tel:${esc(r.telephone)}">${esc(r.telephone)}</a></dd></div>
          <div><dt>E-mail</dt><dd>${esc(r.email)}</dd></div>
          <div><dt>Paiement</dt><dd>${esc(payLabel(r.moyen_paiement))} · ${esc(api.price(Number(r.montant)))}</dd></div>
        </dl>
        <div class="admin-actions">
          ${r.recu_path ? btn("receipt", "Voir le reçu") : ""}
          ${r.statut !== "confirmee" ? btn("set", "Confirmer", "primary", ' data-value="confirmee"') : ""}
          ${r.statut !== "refusee" ? btn("set", "Refuser", "danger", ' data-value="refusee"') : ""}
          ${r.statut === "en_attente" ? "" : waBtn(clientWa(r.telephone, r.statut === "refusee"
            ? `Bonjour ${r.prenom}, nous n'avons pas pu valider le paiement de votre réservation ${r.reference} pour « ${r.event_title} ». Répondez à ce message pour régulariser. BJA HOUSE`
            : `Bonjour ${r.prenom}, votre réservation ${r.reference} pour « ${r.event_title} » est confirmée. À bientôt ! BJA HOUSE`), "Prévenir sur WhatsApp")}
          ${btn("delete", "Supprimer", "ghost-danger")}
        </div>
      </article>`,

    evenements: (e) => {
      const resa = data.reservations.filter((r) => r.event_id === e.id);
      const ok = resa.filter((r) => r.statut === "confirmee").length;
      const wait = resa.filter((r) => r.statut === "en_attente").length;
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
          <div><dt>Inscrits</dt><dd>${ok} confirmé${ok > 1 ? "s" : ""}${wait ? `, ${wait} à vérifier` : ""}</dd></div>
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
          <p class="admin-meta">${esc(m.role)}</p>
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
  };

  const EMPTY = {
    reservations: "Aucune réservation ici.", evenements: "Aucun événement ici.", photos: "Aucune photo ici.",
    membres: "Aucun membre pour l'instant.", messages: "Aucun message ici.",
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
        <p class="admin-hint">Ajouter un autre admin : créez son compte dans Supabase (Authentication → Users), puis lancez dans SQL Editor :
          <code>insert into public.admins (user_id) select id from auth.users where email = 'son@email.com';</code></p>
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
    const items = data[tab].filter(matches[tab]);
    list.className = `admin-list${tab === "photos" ? " admin-list--photos" : ""}`;
    list.innerHTML = items.length ? items.map(cards[tab]).join("") : `<p class="admin-empty">${EMPTY[tab]}</p>`;
  }

  function goTo(nextTab, nextFilter) {
    tab = nextTab;
    filter = nextFilter ?? TABS[tab].filters[0]?.[0] ?? "";
    if (tab !== "reservations") eventFilter = "";
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
  });

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
  };

  async function updateItem(item, change) {
    const [row] = await db.update(tab, item.id, change);
    Object.assign(item, row || change);
  }

  list.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-action]");
    if (!b) return;
    const item = data[tab]?.find?.((r) => String(r.id) === b.closest("[data-id]")?.dataset.id);
    if (!item) return;
    const action = b.dataset.action;

    if (action === "receipt") return openReceipt(item.recu_path, item.reference);
    if (action === "event-edit") return eventEditor(item);
    if (action === "member-edit") return memberEditor(item);
    if (action === "event-resa") { eventFilter = item.id; return goTo("reservations", ""); }

    b.disabled = true;
    try {
      if (action === "set") await updateItem(item, { statut: b.dataset.value });
      else if (action === "toggle-traite") await updateItem(item, { traite: !item.traite });
      else if (action === "toggle-publie") await updateItem(item, { publie: !item.publie });
      else if (action === "delete") {
        if (!confirm(CONFIRM_DELETE[tab](item))) { b.disabled = false; return; }
        await db.remove(tab, item.id);
        if (BUCKET_FILE[tab]) await files.remove(...BUCKET_FILE[tab](item));
        data[tab] = data[tab].filter((r) => r !== item);
      }
      say("");
      render();
    } catch (err) {
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

  /* ---------- Export des réservations (ouvrable dans Excel) ---------- */
  function exportReservations() {
    const rows = data.reservations.filter(matches.reservations);
    if (!rows.length) return say("Aucune réservation à exporter avec ces filtres.", true);
    const cols = [
      ["Référence", (r) => r.reference], ["Date", (r) => new Date(r.created_at).toLocaleString("fr-FR")],
      ["Événement", (r) => r.event_title], ["Prénom", (r) => r.prenom], ["Nom", (r) => r.nom],
      ["Téléphone", (r) => r.telephone], ["E-mail", (r) => r.email], ["Paiement", (r) => payLabel(r.moyen_paiement)],
      ["Montant", (r) => String(r.montant).replace(".", ",")], ["Statut", (r) => STATUS[r.statut][0]],
    ];
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.map(([h]) => cell(h)).join(";"), ...rows.map((r) => cols.map(([, f]) => cell(f(r))).join(";"))].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `reservations-bja-${new Date().toISOString().slice(0, 10)}.csv`;
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
      <div class="field"><label for="ed-lieu">Lieu</label><input id="ed-lieu" name="lieu" maxlength="160" value="${v("lieu")}"></div>
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
        };
        if (row.titre.length < 2) return "Indiquez un titre.";
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
  function memberEditor(m = null) {
    const v = (k, d = "") => esc(m?.[k] ?? d);
    const nextOrder = Math.max(0, ...data.membres.map((x) => x.ordre)) + 1;
    openEditor(m ? "Modifier le membre" : "Nouveau membre", `
      <div class="form-row">
        <div class="field"><label for="ed-nom">Nom et prénom</label><input id="ed-nom" name="nom" maxlength="80" required value="${v("nom")}"></div>
        <div class="field"><label for="ed-role">Rôle</label><input id="ed-role" name="role" maxlength="80" required placeholder="Président·e, Trésorier·e…" value="${v("role")}"></div>
      </div>
      <div class="field"><label for="ed-bio">Présentation</label><textarea id="ed-bio" name="bio" maxlength="600">${v("bio")}</textarea></div>
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

  editor.addEventListener("click", (e) => { if (e.target === editor) editor.close(); });

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
