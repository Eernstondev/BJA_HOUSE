/* BJA HOUSE — galerie : photos validées depuis la base de données et diaporama aléatoire */
(() => {
  "use strict";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const api = window.BJAApi;
  const cfg = window.BJA;
  const gallery = $(".gallery");
  const frames = $$(".showcase-frame");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // Photos du site déjà présentes dans la grille (fichiers locaux ou teintes de remplacement)
  const localSlides = () => $$(".tile", gallery).map((t) => ({
    src: $("img", t).src, // si le fichier manque, la teinte de l'emplacement reste visible
    title: $(".tile-caption b", t).textContent,
    sub: $(".tile-caption span", t).textContent,
    tones: t.style.cssText,
  }));

  async function loadApproved() {
    if (!api.isReady()) return [];
    try {
      const rows = await api.select("photos",
        "select=path,categorie,evenement,created_at&statut=eq.approuvee&order=created_at.desc&limit=200");
      return rows.map((r) => ({
        src: api.publicUrl("galerie", r.path),
        title: r.evenement || cfg.categories[r.categorie] || "BJA HOUSE",
        sub: new Date(r.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
        cat: r.categorie,
      }));
    } catch {
      return []; // la galerie locale reste affichée
    }
  }

  // Ajoute les photos validées en tête de la grille
  function addTiles(photos) {
    const html = photos.map((p) => `
      <button class="tile" type="button" data-cat="${api.esc(p.cat)}">
        <img src="${api.esc(p.src)}" alt="${api.esc(p.title)}" loading="lazy">
        <span class="tile-caption"><b>${api.esc(p.title)}</b><span>${api.esc(p.sub)}</span></span>
      </button>`).join("");
    gallery.insertAdjacentHTML("afterbegin", html);
    // respecte le filtre actif
    const active = $(".filter[aria-pressed=true]");
    if (active && active.dataset.filter !== "tout") active.click();
  }

  /* ---------- Diaporama : chaque cadre change de photo à son rythme, en fondu ---------- */
  function paint(frame, slide) {
    const layer = document.createElement("div");
    layer.className = "showcase-layer";
    layer.style.cssText = slide.tones || "";
    if (slide.src) layer.style.setProperty("--img", `url("${slide.src.replace(/"/g, "%22")}")`);
    frame.insertBefore(layer, frame.querySelector("figcaption"));
    frame.querySelector("figcaption").innerHTML = `<b>${api.esc(slide.title)}</b><span>${api.esc(slide.sub)}</span>`;
    requestAnimationFrame(() => layer.classList.add("is-visible"));
    // retire les anciennes couches une fois le fondu terminé
    const old = $$(".showcase-layer", frame).slice(0, -1);
    setTimeout(() => old.forEach((o) => o.remove()), 1200);
  }

  function startShowcase(slides) {
    if (!frames.length || !slides.length) return;
    let pool = shuffle([...slides]);
    let cursor = 0;
    const nextSlide = () => {
      if (cursor >= pool.length) { pool = shuffle([...slides]); cursor = 0; }
      return pool[cursor++];
    };
    frames.forEach((f) => paint(f, nextSlide()));
    if (reduceMotion || slides.length <= frames.length) return;
    frames.forEach((frame, i) => {
      // cadres décalés pour que les changements ne tombent pas en même temps
      setTimeout(() => setInterval(() => { if (!document.hidden) paint(frame, nextSlide()); }, 5200), 1700 * i + 2500);
    });
  }

  loadApproved().then((approved) => {
    if (approved.length) addTiles(approved);
    // le diaporama tire au hasard dans les photos validées, sinon dans la galerie du site
    startShowcase(approved.length ? approved : localSlides());
  });
})();
