/* BJA HOUSE — partage de photos : 3 photos max, catégorie, validation, base de données, WhatsApp */
window.BJAApi.ready.then(() => {
  "use strict";
  const $ = (sel, root = document) => root.querySelector(sel);
  const api = window.BJAApi;
  const cfg = window.BJA;
  const MAX_FILES = 3;
  const MAX_SIZE = 8 * 1024 * 1024;

  const form = $("#share-form");
  if (!form) return;
  const review = $("[data-review]");
  const done = $("[data-done]");
  const input = $("#photos");
  const dropzone = $("[data-dropzone]");
  const thumbs = $("[data-thumbs]");
  const count = $("[data-count]");
  let files = [];

  // Événements proposés : les plus récents d'abord
  const select = $("#evenement");
  [...cfg.events].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach((ev) => {
    select.add(new Option(`${ev.title} (${api.eventDate(ev, { day: "numeric", month: "short", year: "numeric" })})`, ev.title));
  });

  /* ---------- Sélection des photos ---------- */
  const renderThumbs = (list, target, removable) => {
    target.querySelectorAll("img").forEach((img) => URL.revokeObjectURL(img.src));
    target.innerHTML = "";
    list.forEach((file, i) => {
      const li = document.createElement("li");
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.alt = file.name;
      li.appendChild(img);
      if (removable) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "thumb-remove";
        btn.setAttribute("aria-label", `Retirer ${file.name}`);
        btn.textContent = "✕";
        btn.addEventListener("click", () => { files.splice(i, 1); update(); });
        li.appendChild(btn);
      }
      target.appendChild(li);
    });
  };

  const err = (id, msg) => { $(`#${id}-error`).textContent = msg; return !msg; };

  function addFiles(list) {
    const incoming = Array.from(list);
    const rejected = incoming.filter((f) => !api.extension(f) || f.size > MAX_SIZE);
    const accepted = incoming.filter((f) => !rejected.includes(f));
    const room = MAX_FILES - files.length;
    files = files.concat(accepted.slice(0, Math.max(room, 0)));
    update();
    if (rejected.length) err("photos", "Certaines photos ont été ignorées : JPG, PNG ou WEBP de 8 Mo maximum.");
    else if (accepted.length > room) err("photos", `${MAX_FILES} photos maximum : les suivantes ont été ignorées.`);
  }

  function update() {
    renderThumbs(files, thumbs, true);
    count.textContent = `${files.length} / ${MAX_FILES}`;
    dropzone.hidden = files.length >= MAX_FILES;
    err("photos", "");
  }

  input.addEventListener("change", () => { addFiles(input.files); input.value = ""; });
  ["dragover", "dragenter"].forEach((t) => dropzone.addEventListener(t, (e) => { e.preventDefault(); dropzone.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((t) => dropzone.addEventListener(t, () => dropzone.classList.remove("is-over")));
  dropzone.addEventListener("drop", (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });

  /* ---------- Étape 1 : Valider ---------- */
  const value = (name) => String(form.elements[name].value || "").trim();
  const category = () => form.querySelector("input[name=categorie]:checked")?.value || "";

  const validate = () => [
    err("photos", files.length ? "" : "Ajoutez au moins une photo."),
    err("categorie", category() ? "" : "Choisissez une catégorie."),
    err("auteur", value("auteur") ? "" : "Indiquez votre prénom et votre nom."),
    err("telephone", !value("telephone") || /^\+?[0-9 ().-]{8,20}$/.test(value("telephone")) ? "" : "Numéro invalide."),
  ].every(Boolean);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validate()) { form.querySelector(".field-error:not(:empty)")?.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    $("[data-review-cat]", review).textContent = cfg.categories[category()];
    renderThumbs(files, $("[data-review-thumbs]", review), false);
    form.hidden = true;
    review.hidden = false;
    review.focus();
  });

  $("[data-edit]", review).addEventListener("click", () => { review.hidden = true; form.hidden = false; });

  /* ---------- Étape 2 : Suivant (envoi + WhatsApp) ---------- */
  const status = $(".form-status", review);
  const next = $("[data-next]", review);

  next.addEventListener("click", async () => {
    const lot = api.uuid();
    const cat = category();
    const evenement = value("evenement") || null;
    const auteur = value("auteur");
    const telephone = value("telephone") || null;
    next.disabled = true;
    status.hidden = false;
    status.classList.remove("is-error");
    let note = "";
    try {
      if (api.isReady()) {
        for (const [i, file] of files.entries()) {
          status.textContent = `Envoi de la photo ${i + 1} sur ${files.length}…`;
          const path = `${lot}/${api.uuid()}.${api.extension(file)}`;
          await api.upload("galerie", path, file);
          await api.insert("photos", { lot, path, categorie: cat, evenement, auteur, telephone });
        }
      } else {
        note = "Mode démonstration : la base de données n'est pas encore reliée, les photos n'ont pas été envoyées.";
      }
    } catch {
      status.classList.add("is-error");
      status.textContent = "L'envoi a échoué. Vérifiez votre connexion et réessayez.";
      next.disabled = false;
      return;
    }

    const message = [
      "Bonjour BJA HOUSE,",
      `je viens d'envoyer ${files.length} photo${files.length > 1 ? "s" : ""} pour la galerie du site.`,
      "",
      `Nom : ${auteur}`,
      `Catégorie : ${cfg.categories[cat]}`,
      `Événement : ${evenement || "non précisé"}`,
      ...(telephone ? [`Téléphone : ${telephone}`] : []),
      `Référence de l'envoi : ${lot.slice(0, 8).toUpperCase()}`,
      "",
      "Merci de les vérifier avant publication !",
    ].join("\n");

    const link = api.whatsappLink(message);
    const waBtn = $("[data-wa-link]", done);
    if (link) waBtn.href = link;
    else { waBtn.hidden = true; note = (note ? note + " " : "") + "Le numéro WhatsApp de BJA HOUSE n'est pas encore configuré."; }
    $("[data-done-note]", done).textContent = note;
    review.hidden = true;
    done.hidden = false;
    done.focus();
    if (link) location.href = link;
  });
});
