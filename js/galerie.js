/* BJA HOUSE — galerie : photos validées depuis la base de données et diaporama aléatoire */
window.BJAApi.ready.then(() => {
  "use strict";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const api = window.BJAApi;
  const cfg = window.BJA;
  const gallery = $(".gallery");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // Sans photo validée, le bandeau montre la photo d'accueil
  const localSlides = () => {
    const candidates = [
      { src: "assets/hero.jpg", title: "BJA HOUSE", sub: "Nos rencontres" },
    ];
    return Promise.all(candidates.map((c) => new Promise((resolve) => {
      const probe = new Image();
      probe.onload = () => resolve({ ...c, src: probe.src }); // URL absolue
      probe.onerror = () => resolve(null);
      probe.src = c.src;
    }))).then((list) => list.filter(Boolean));
  };

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
      return [];
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
    $(".gallery-empty").hidden = true;
    const active = $(".filter[aria-pressed=true]");
    if (active && active.dataset.filter !== "tout") active.click();
  }

  /* ---------- Bandeau « Nos moments » : photos tirées au hasard, en fondu ---------- */
  const hero = $("[data-hero-slides]");
  const stage = hero && $(".hero-slides", hero);
  const caption = hero && Object.assign(document.createElement("p"), { className: "hero-slide-caption" });
  if (caption) hero.appendChild(caption);

  function show(slide) {
    const layer = document.createElement("div");
    layer.className = "hero-slide";
    layer.style.setProperty("--img", `url("${slide.src.replace(/"/g, "%22")}")`);
    stage.appendChild(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add("is-visible")));
    caption.textContent = `${slide.title} · ${slide.sub}`;
    const old = $$(".hero-slide", stage).slice(0, -1);
    setTimeout(() => old.forEach((o) => o.remove()), 1600);
  }

  function startSlides(slides) {
    if (!stage || !slides.length) return;
    let pool = shuffle([...slides]);
    let cursor = 0;
    const next = () => {
      if (cursor >= pool.length) {
        const last = pool[pool.length - 1];
        pool = shuffle([...slides]);
        if (pool.length > 1 && pool[0] === last) pool.push(pool.shift()); // évite deux fois la même photo
        cursor = 0;
      }
      return pool[cursor++];
    };
    show(next());
    if (reduceMotion || slides.length < 2) return;
    setInterval(() => { if (!document.hidden) show(next()); }, 5000);
  }

  loadApproved().then(async (approved) => {
    if (approved.length) addTiles(approved);
    // tirage au hasard dans les photos validées, sinon dans les photos du site
    startSlides(approved.length ? approved : await localSlides());
  });
});
