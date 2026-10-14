/* BJA HOUSE — scripts communs à toutes les pages */
(() => {
  "use strict";

  // Adresse d'envoi du formulaire (ex. https://formspree.io/f/xxxxxxx). Vide = mode démonstration.
  const FORM_ENDPOINT = "";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Menu mobile ---------- */
  const header = $(".site-header");
  const toggle = $(".nav-toggle");
  if (header && toggle) {
    toggle.addEventListener("click", () => {
      const open = header.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    $$(".nav a", header).forEach((a) =>
      a.addEventListener("click", () => {
        header.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
      })
    );
  }

  /* ---------- Images : logo, photos, emplacements vides ---------- */
  // Appelle onOk ou onMissing selon que l'image charge ou non (y compris si elle a déjà échoué avant ce script).
  const watchImage = (img, onOk, onMissing) => {
    if (img.complete) return img.naturalWidth > 0 ? onOk() : onMissing();
    img.addEventListener("load", onOk, { once: true });
    img.addEventListener("error", onMissing, { once: true });
  };

  $$(".brand").forEach((brand) => {
    const logo = $(".brand-logo", brand);
    if (logo) watchImage(logo, () => brand.classList.add("has-logo"), () => {});
  });

  $$(".photo img, .tile img").forEach((img) => {
    const box = img.closest(".photo, .tile");
    watchImage(img, () => box.classList.remove("is-empty"), () => box.classList.add("is-empty"));
  });

  const hero = $(".hero[data-hero]");
  if (hero) {
    const src = hero.dataset.hero;
    const probe = new Image();
    probe.onload = () => hero.style.setProperty("--hero-img", `url("${probe.src}")`); // URL absolue : sinon résolue depuis css/
    probe.onerror = () => {
      const note = $(".hero-note", hero);
      if (note) note.hidden = false;
    };
    probe.src = src;
  }

  /* ---------- Prochain événement (accueil), lu depuis config.js ---------- */
  const ticket = $("[data-next-event]");
  if (ticket && window.BJA && window.BJAApi) {
    const next = window.BJA.events
      .filter((e) => !window.BJAApi.isPast(e))
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    if (next) {
      const d = new Date(next.date);
      $("[data-ne-day]", ticket).textContent = String(d.getDate()).padStart(2, "0");
      $("[data-ne-month]", ticket).textContent = d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
      $("[data-ne-title]", ticket).textContent = next.title;
      $("[data-ne-hours]", ticket).textContent = next.hours;
      $("[data-ne-price]", ticket).textContent = window.BJAApi.price(next.price);
      $("[data-countdown]", ticket).dataset.countdown = next.date;
      ticket.href = `reservation.html#${next.id}`;
    }
  }

  /* ---------- Compte à rebours ---------- */
  $$("[data-countdown]").forEach((el) => {
    const target = new Date(el.dataset.countdown).getTime();
    if (Number.isNaN(target)) return;
    const parts = { d: $("[data-d]", el), h: $("[data-h]", el), m: $("[data-m]", el), s: $("[data-s]", el) };
    const pad = (n) => String(n).padStart(2, "0");
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        el.textContent = diff > -6 * 3600e3 ? "C'est maintenant !" : "Événement terminé";
        return false;
      }
      parts.d.textContent = Math.floor(diff / 864e5);
      parts.h.textContent = pad(Math.floor((diff % 864e5) / 36e5));
      parts.m.textContent = pad(Math.floor((diff % 36e5) / 6e4));
      if (parts.s) parts.s.textContent = pad(Math.floor((diff % 6e4) / 1e3));
      return true;
    };
    if (tick()) {
      const id = setInterval(() => { if (!tick()) clearInterval(id); }, 1000);
    }
  });

  /* ---------- Filtres (galerie et activités) : les éléments sont relus à chaque clic ---------- */
  $$("[data-filter-group]").forEach((group) => {
    const empty = group.dataset.emptyTarget ? $(group.dataset.emptyTarget) : null;
    const buttons = $$(".filter", group);
    buttons.forEach((btn) =>
      btn.addEventListener("click", () => {
        const cat = btn.dataset.filter;
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        let visible = 0;
        $$(group.dataset.filterGroup).forEach((item) => {
          const show = cat === "tout" || item.dataset.cat === cat;
          item.hidden = !show;
          if (show) visible++;
        });
        if (empty) empty.hidden = visible > 0;
      })
    );
  });

  /* ---------- Visionneuse de la galerie (fonctionne aussi pour les photos ajoutées ensuite) ---------- */
  const lightbox = $(".lightbox");
  const gallery = $(".gallery:not(.gallery--preview)");
  if (lightbox && gallery) {
    const media = $(".lightbox-media", lightbox);
    const title = $(".lightbox-caption b", lightbox);
    const sub = $(".lightbox-caption span", lightbox);
    let current = 0;
    let lastFocus = null;

    const visibleTiles = () => $$(".tile", gallery).filter((t) => !t.hidden);
    const show = (tile) => {
      current = visibleTiles().indexOf(tile);
      const img = $("img", tile);
      media.style.cssText = tile.style.cssText; // reprend les teintes de l'emplacement
      media.innerHTML = "";
      if (!tile.classList.contains("is-empty")) {
        const big = new Image();
        big.src = img.src;
        big.alt = img.alt;
        media.appendChild(big);
      }
      title.textContent = $(".tile-caption b", tile).textContent;
      sub.textContent = $(".tile-caption span", tile).textContent;
    };
    const open = (tile) => {
      lastFocus = document.activeElement;
      show(tile);
      lightbox.hidden = false;
      document.body.style.overflow = "hidden";
      $(".lb-close", lightbox).focus();
    };
    const close = () => {
      lightbox.hidden = true;
      document.body.style.overflow = "";
      if (lastFocus) lastFocus.focus();
    };
    const step = (dir) => {
      const list = visibleTiles();
      if (!list.length) return;
      show(list[(current + dir + list.length) % list.length]);
    };

    gallery.addEventListener("click", (e) => {
      const tile = e.target.closest(".tile");
      if (tile) open(tile);
    });
    $(".lb-close", lightbox).addEventListener("click", close);
    $(".lb-prev", lightbox).addEventListener("click", () => step(-1));
    $(".lb-next", lightbox).addEventListener("click", () => step(1));
    lightbox.addEventListener("click", (e) => { if (e.target === lightbox) close(); });
    document.addEventListener("keydown", (e) => {
      if (lightbox.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    });
  }

  /* ---------- Formulaire de contact ---------- */
  const form = $("#contact-form");
  if (form) {
    const status = $(".form-status", form);
    const rules = {
      nom: (v) => (v.trim().length >= 2 ? "" : "Indiquez votre nom."),
      email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? "" : "Adresse e-mail invalide."),
      sujet: (v) => (v ? "" : "Choisissez un sujet."),
      message: (v) => (v.trim().length >= 10 ? "" : "Votre message doit faire au moins 10 caractères."),
      consentement: (_, el) => (el.checked ? "" : "Merci d'accepter d'être recontacté."),
    };
    const check = (el) => {
      const rule = rules[el.name];
      if (!rule) return true;
      const msg = rule(el.value, el);
      const field = el.closest(".field, .consent");
      const err = $(`#${el.id}-error`);
      if (field) field.classList.toggle("invalid", Boolean(msg));
      if (err) err.textContent = msg;
      el.setAttribute("aria-invalid", String(Boolean(msg)));
      return !msg;
    };
    $$("input, select, textarea", form).forEach((el) =>
      el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "blur", () => check(el))
    );

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fields = $$("input, select, textarea", form).filter((el) => rules[el.name]);
      const valid = fields.map(check).every(Boolean);
      status.hidden = false;
      status.classList.remove("is-error");
      if (!valid) {
        status.classList.add("is-error");
        status.textContent = "Certains champs sont à corriger.";
        fields.find((el) => el.getAttribute("aria-invalid") === "true")?.focus();
        return;
      }
      if (form.website.value) return; // champ piège anti-spam

      const prenom = form.nom.value.trim().split(/\s+/)[0];
      if (!FORM_ENDPOINT) {
        status.textContent = `Merci ${prenom} ! Formulaire en mode démonstration : il sera relié à notre boîte mail à la mise en ligne.`;
        form.reset();
        return;
      }
      const btn = $("button[type=submit]", form);
      btn.disabled = true;
      status.textContent = "Envoi en cours…";
      try {
        const res = await fetch(FORM_ENDPOINT, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: new FormData(form),
        });
        if (!res.ok) throw new Error(String(res.status));
        status.textContent = `Merci ${prenom}, votre message est bien parti. On vous répond rapidement.`;
        form.reset();
      } catch {
        status.classList.add("is-error");
        status.textContent = "L'envoi a échoué. Réessayez ou écrivez-nous directement par e-mail.";
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---------- Copier l'adresse e-mail ---------- */
  $$("[data-copy]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const text = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copié";
      } catch {
        btn.textContent = text;
      }
      setTimeout(() => (btn.textContent = "Copier"), 2000);
    })
  );

  /* ---------- Apparition douce des sections hors écran ---------- */
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        el.classList.remove("is-pending");
        io.unobserve(el);
        // retire le décalage une fois l'entrée finie, pour que les survols restent instantanés
        if (el.classList.contains("stagger")) setTimeout(() => el.classList.remove("stagger"), 1400);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    $$(".reveal").forEach((el) => {
      if (el.getBoundingClientRect().top <= innerHeight) return;
      // les grilles apparaissent élément par élément
      if (el.matches(".cards, .members, .gallery, .steps, .values, .team")) {
        el.classList.add("stagger");
        Array.from(el.children).forEach((child, i) => child.style.setProperty("--i", i));
      }
      el.classList.add("is-pending");
      io.observe(el);
    });
  }

  /* ---------- Année du pied de page ---------- */
  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
})();

/* ---------- Fiches membres ---------- */
(() => {
  const dialog = document.querySelector(".member-dialog");
  if (!dialog || typeof dialog.showModal !== "function") return;
  const photoBox = dialog.querySelector(".md-photo");
  const img = photoBox.querySelector("img");
  const initial = photoBox.querySelector(".member-initial");

  document.querySelectorAll(".member-card").forEach((card) =>
    card.addEventListener("click", () => {
      const { name, role, bio, photo } = card.dataset;
      dialog.querySelector("#md-name").textContent = name;
      dialog.querySelector(".md-role").textContent = role;
      dialog.querySelector(".md-bio").textContent = bio;
      initial.textContent = role.charAt(0);
      const hasPhoto = !card.querySelector(".photo").classList.contains("is-empty");
      photoBox.classList.toggle("is-empty", !hasPhoto);
      if (hasPhoto) { img.src = photo; img.alt = `${name}, ${role}`; } else { img.removeAttribute("src"); }
      dialog.showModal();
    })
  );
  dialog.querySelector(".md-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); }); // clic sur le fond
})();
