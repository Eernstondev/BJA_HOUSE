/* BJA HOUSE — accès à Supabase (REST) et outils partagés par les formulaires */
window.BJAApi = (() => {
  "use strict";
  const cfg = window.BJA;
  const base = () => cfg.supabaseUrl.replace(/\/+$/, "");
  const headers = (extra = {}) => ({ apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${cfg.supabaseAnonKey}`, ...extra });

  const isReady = () => Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);

  async function insert(table, row) {
    const res = await fetch(`${base()}/rest/v1/${table}`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify(row),
    });
    if (!res.ok) throw new Error(`Enregistrement refusé (${res.status})`);
  }

  async function select(table, query) {
    const res = await fetch(`${base()}/rest/v1/${table}?${query}`, { headers: headers() });
    if (!res.ok) throw new Error(`Lecture impossible (${res.status})`);
    return res.json();
  }

  async function upload(bucket, path, file) {
    const res = await fetch(`${base()}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: headers({ "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" }),
      body: file,
    });
    if (!res.ok) throw new Error(`Envoi du fichier refusé (${res.status})`);
    return path;
  }

  const publicUrl = (bucket, path) => `${base()}/storage/v1/object/public/${bucket}/${path}`;

  const uuid = () =>
    crypto.randomUUID ? crypto.randomUUID()
      : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
          (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));

  // Référence lisible, sans caractères ambigus (0/O, 1/I)
  const reference = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    return "BJA-" + Array.from(bytes, (b) => chars[b % chars.length]).join("");
  };

  const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heic" };
  const extension = (file) => IMAGE_TYPES[file.type] || null;

  const whatsappLink = (text) => (cfg.whatsapp ? `https://wa.me/${cfg.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(text)}` : null);

  const price = (n) => (n > 0 ? `${Number(n).toLocaleString("fr-FR")} ${cfg.currency}` : "Gratuit");

  const eventDate = (ev, opts = { weekday: "long", day: "numeric", month: "long" }) =>
    new Date(ev.date).toLocaleDateString("fr-FR", opts);

  const isPast = (ev) => new Date(ev.date).getTime() + 6 * 3600e3 < Date.now();

  const findEvent = (id) => cfg.events.find((e) => e.id === id);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Contenu géré depuis l'espace admin ----------
     Réglages, événements et membres sont lus dans la base. Si elle ne répond pas,
     le site garde les valeurs de config.js. Les pages attendent BJAApi.ready. */
  const PAY_LABELS = { moncash: "MonCash", natcash: "NatCash" };

  function applySettings(r) {
    if (!r) return;
    if (r.whatsapp) cfg.whatsapp = r.whatsapp;
    ["email", "instagram", "tiktok"].forEach((k) => { if (r[k]) cfg.contact[k] = r[k]; });
    cfg.paymentMethods = cfg.paymentMethods.map((m) => {
      const num = r[`${m.id}_numero`];
      if (!num) return m;
      const nom = r[`${m.id}_nom`];
      return { ...m, details: `Envoyez le montant par ${PAY_LABELS[m.id] || m.label} au ${num}${nom ? ` (nom : ${nom})` : ""}, puis faites une capture du reçu.` };
    });
  }

  const toEvent = (r) => ({
    id: r.id, date: r.debut.slice(0, 16), title: r.titre, cat: r.categorie, hours: r.horaires,
    place: r.lieu, price: Number(r.prix), desc: r.description,
    image: r.image_path ? publicUrl("site", r.image_path) : null,
  });

  const toMember = (r) => ({
    name: r.nom, role: r.role, bio: r.bio, photo: r.photo_path ? publicUrl("site", r.photo_path) : null,
  });

  const ready = (async () => {
    if (!isReady()) return;
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("délai dépassé")), 6000));
    try {
      const [settings, events, members] = await Promise.race([Promise.all([
        select("reglages", "select=*&id=eq.1"),
        select("evenements", "select=*&order=debut.asc"),
        select("membres", "select=nom,role,bio,photo_path&order=ordre.asc,created_at.asc"),
      ]), timeout]);
      applySettings(settings[0]);
      cfg.events = events.map(toEvent);
      cfg.members = members.map(toMember);
    } catch {
      /* base injoignable ou pas encore installée : config.js reste utilisé */
    }
  })();

  return { isReady, ready, insert, select, upload, publicUrl, uuid, reference, extension, whatsappLink, price, eventDate, isPast, findEvent, esc };
})();
