/* BJA HOUSE — espace admin : connexion Supabase Auth, réservations, photos, messages */
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

  /* ---------- Session ---------- */
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
    if (!res.ok) throw new Error(`Action refusée (${res.status})`);
    return res;
  }
  const rows = async (table, query) => (await request(`/rest/v1/${table}?${query}`)).json();
  const patch = (table, id, data) =>
    request(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(data),
    });

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

  /* ---------- Connexion ---------- */
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
      const admin = await rows("admins", "select=user_id");
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

  /* ---------- Données ---------- */
  const data = { reservations: [], photos: [], messages: [] };
  const TABS = {
    reservations: { filters: [["en_attente", "À vérifier"], ["confirmee", "Confirmées"], ["refusee", "Refusées"], ["", "Toutes"]], pending: (r) => r.statut === "en_attente" },
    photos: { filters: [["en_attente", "En attente"], ["approuvee", "Publiées"], ["refusee", "Refusées"], ["", "Toutes"]], pending: (r) => r.statut === "en_attente" },
    messages: { filters: [["non", "Non traités"], ["oui", "Traités"], ["", "Tous"]], pending: (r) => !r.traite },
  };
  let tab = "reservations";
  let filter = "en_attente";

  const say = (text, isError = false) => {
    appStatus.hidden = !text;
    appStatus.classList.toggle("is-error", isError);
    appStatus.textContent = text;
  };

  async function load() {
    say("Chargement…");
    try {
      const q = "select=*&order=created_at.desc&limit=500";
      [data.reservations, data.photos, data.messages] = await Promise.all([
        rows("reservations", q), rows("photos", q), rows("messages", q),
      ]);
      say("");
    } catch (err) {
      if (session) say(err.message, true);
      else sayLogin(err.message);
    }
    render();
  }

  /* ---------- Affichage ---------- */
  const when = (iso) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const STATUS = {
    en_attente: ["En attente", "wait"], confirmee: ["Confirmée", "ok"], refusee: ["Refusée", "no"], approuvee: ["Publiée", "ok"],
  };
  const badge = (statut) => `<span class="admin-badge admin-badge--${STATUS[statut][1]}">${STATUS[statut][0]}</span>`;
  const payLabel = (id) => cfg.paymentMethods.find((m) => m.id === id)?.label || id || "Gratuit";

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
    $("[data-stats]").innerHTML = `
      <div><b>${data.reservations.filter(TABS.reservations.pending).length}</b><span>Réservations à vérifier</span></div>
      <div><b>${data.photos.filter(TABS.photos.pending).length}</b><span>Photos en attente</span></div>
      <div><b>${data.messages.filter(TABS.messages.pending).length}</b><span>Messages non traités</span></div>
      <div><b>${esc(total > 0 ? api.price(total) : `0 ${cfg.currency}`)}</b><span>${confirmed.length} place${plural} confirmée${plural}</span></div>`;
    Object.keys(TABS).forEach((t) => {
      $(`[data-count="${t}"]`).textContent = data[t].filter(TABS[t].pending).length || "";
    });
  }

  function filtersBar() {
    $("[data-filters]").innerHTML = TABS[tab].filters.map(([v, l]) => `
      <label class="chip"><input type="radio" name="filtre" value="${v}"${v === filter ? " checked" : ""}><span>${l}</span></label>`).join("");
  }

  const matches = (r) => {
    if (!filter) return true;
    if (tab === "messages") return filter === "oui" ? r.traite : !r.traite;
    return r.statut === filter;
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
          ${r.recu_path ? `<button class="btn btn--outline btn--sm" type="button" data-receipt-open="${esc(r.recu_path)}" data-ref="${esc(r.reference)}">Voir le reçu</button>` : ""}
          ${r.statut !== "confirmee" ? `<button class="btn btn--primary btn--sm" type="button" data-set="confirmee">Confirmer</button>` : ""}
          ${r.statut !== "refusee" ? `<button class="btn btn--danger btn--sm" type="button" data-set="refusee">Refuser</button>` : ""}
          ${r.statut === "en_attente" ? "" : waBtn(clientWa(r.telephone, r.statut === "refusee"
            ? `Bonjour ${r.prenom}, nous n'avons pas pu valider le paiement de votre réservation ${r.reference} pour « ${r.event_title} ». Répondez à ce message pour régulariser. BJA HOUSE`
            : `Bonjour ${r.prenom}, votre réservation ${r.reference} pour « ${r.event_title} » est confirmée. À bientôt ! BJA HOUSE`), "Prévenir sur WhatsApp")}
        </div>
      </article>`,
    photos: (r) => `
      <article class="admin-card admin-card--photo" data-id="${esc(r.id)}">
        <a class="admin-photo" href="${esc(api.publicUrl("galerie", r.path))}" target="_blank" rel="noopener">
          <img src="${esc(api.publicUrl("galerie", r.path))}" alt="Photo envoyée par ${esc(r.auteur)}" loading="lazy">
        </a>
        <div class="admin-card-head">${badge(r.statut)}<time>${when(r.created_at)}</time></div>
        <p class="admin-meta"><b>${esc(r.auteur)}</b> · ${esc(cfg.categories[r.categorie] || r.categorie)}${r.evenement ? ` · ${esc(r.evenement)}` : ""}</p>
        <div class="admin-actions">
          ${r.statut !== "approuvee" ? `<button class="btn btn--primary btn--sm" type="button" data-set="approuvee">Publier</button>` : ""}
          ${r.statut !== "refusee" ? `<button class="btn btn--danger btn--sm" type="button" data-set="refusee">${r.statut === "approuvee" ? "Retirer" : "Refuser"}</button>` : ""}
        </div>
      </article>`,
    messages: (r) => `
      <article class="admin-card" data-id="${esc(r.id)}">
        <div class="admin-card-head"><span class="admin-ref">${esc(r.sujet)}</span>${r.traite ? `<span class="admin-badge admin-badge--ok">Traité</span>` : `<span class="admin-badge admin-badge--wait">Nouveau</span>`}<time>${when(r.created_at)}</time></div>
        <h3>${esc(r.nom)}</h3>
        <p class="admin-message">${esc(r.message)}</p>
        <dl class="admin-facts">
          <div><dt>Téléphone</dt><dd><a href="tel:${esc(r.telephone)}">${esc(r.telephone)}</a></dd></div>
          ${r.email ? `<div><dt>E-mail</dt><dd><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></dd></div>` : ""}
        </dl>
        <div class="admin-actions">
          ${waBtn(clientWa(r.telephone, `Bonjour ${r.nom.split(/\s+/)[0]}, merci pour votre message à BJA HOUSE. `), "Répondre sur WhatsApp")}
          <button class="btn btn--${r.traite ? "outline" : "primary"} btn--sm" type="button" data-done-toggle>${r.traite ? "Remettre en non traité" : "Marquer comme traité"}</button>
        </div>
      </article>`,
  };

  const EMPTY = { reservations: "Aucune réservation ici.", photos: "Aucune photo ici.", messages: "Aucun message ici." };

  function render() {
    stats();
    $$("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    filtersBar();
    const items = data[tab].filter(matches);
    list.className = `admin-list${tab === "photos" ? " admin-list--photos" : ""}`;
    list.innerHTML = items.length ? items.map(cards[tab]).join("") : `<p class="admin-empty">${EMPTY[tab]}</p>`;
  }

  $$("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    tab = b.dataset.tab;
    filter = TABS[tab].filters[0][0];
    render();
  }));
  $("[data-filters]").addEventListener("change", (e) => { filter = e.target.value; render(); });
  $("[data-refresh]").addEventListener("click", load);

  /* ---------- Actions ---------- */
  list.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.receiptOpen) return openReceipt(btn.dataset.receiptOpen, btn.dataset.ref);

    const item = data[tab].find((r) => r.id === btn.closest("[data-id]")?.dataset.id);
    const change = btn.hasAttribute("data-done-toggle") ? { traite: !item?.traite } : btn.dataset.set ? { statut: btn.dataset.set } : null;
    if (!item || !change) return;
    btn.disabled = true;
    try {
      await patch(tab, item.id, change);
      Object.assign(item, change);
      say("");
      render();
    } catch (err) {
      say(err.message, true);
      btn.disabled = false;
    }
  });

  /* ---------- Reçus (bucket privé) ---------- */
  const dialog = $("[data-receipt]");
  const receiptBody = $("[data-receipt-body]");
  let receiptUrl = null;

  async function openReceipt(path, ref) {
    $("[data-receipt-title]").textContent = `Reçu ${ref}`;
    receiptBody.innerHTML = "<p>Chargement…</p>";
    dialog.showModal();
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
  $("[data-receipt-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

  /* ---------- Démarrage ---------- */
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
