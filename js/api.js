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

  return { isReady, insert, select, upload, publicUrl, uuid, reference, extension, whatsappLink, price, eventDate, isPast, findEvent, esc };
})();
