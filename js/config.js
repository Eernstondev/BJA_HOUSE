/* BJA HOUSE — réglages du site. C'est le seul fichier à modifier pour changer
   les événements, les prix, les moyens de paiement et les accès à la base de données. */
window.BJA = {
  // Supabase (Settings → API). Uniquement l'URL du projet et la clé publique « anon » :
  // ne jamais mettre la clé « service_role » ici.
  supabaseUrl: "",
  supabaseAnonKey: "",

  // Numéro WhatsApp de BJA HOUSE, format international sans « + » ni espaces (ex. 33612345678).
  whatsapp: "",

  currency: "€",

  // Moyens de paiement proposés à la réservation, avec les instructions affichées.
  paymentMethods: [
    { id: "mobile-money", label: "Mobile money", details: "Envoyez le montant au +00 00 00 00 00 (bénéficiaire : BJA HOUSE)." },
    { id: "virement", label: "Virement bancaire", details: "IBAN : XXXX XXXX XXXX XXXX — Titulaire : BJA HOUSE. Indiquez votre nom en référence." },
    { id: "paypal", label: "PayPal", details: "Envoyez le montant à paiement@bjahouse.fr." },
  ],

  categories: { soirees: "Soirées", sport: "Sport", sorties: "Sorties", ateliers: "Ateliers" },

  // Événements. price: 0 = gratuit. date au format AAAA-MM-JJTHH:MM (heure locale).
  events: [
    { id: "soiree-automne-2026", date: "2026-10-25T19:00", title: "Soirée d'automne BJA", cat: "soirees",
      hours: "19h00 – 23h30", place: "Lieu communiqué aux inscrits", price: 10,
      desc: "Musique, jeux et bonne ambiance pour lancer la saison. Tenue correcte, bonne humeur obligatoire." },
    { id: "tournoi-foot-2026", date: "2026-11-08T14:00", title: "Tournoi de foot à 5", cat: "sport",
      hours: "14h00 – 18h00", place: "City stade, à confirmer", price: 5,
      desc: "Équipes de cinq, matchs courts, remise de prix en fin d'après-midi. Inscription par équipe ou en solo." },
    { id: "atelier-projet-2026", date: "2026-11-22T15:00", title: "Atelier : monter son projet", cat: "ateliers",
      hours: "15h00 – 17h30", place: "Salle partenaire", price: 0,
      desc: "Un après-midi pour passer d'une idée à un plan concret, avec des jeunes entrepreneurs de la région." },
    { id: "sortie-patinoire-2026", date: "2026-12-06T13:30", title: "Sortie patinoire", cat: "sorties",
      hours: "13h30 – 17h00", place: "Départ groupé, point de rendez-vous à venir", price: 12,
      desc: "Une sortie détente avant les fêtes. Location des patins comprise pour les inscrits." },
    { id: "gala-2026", date: "2026-12-19T20:00", title: "Gala de fin d'année", cat: "soirees",
      hours: "20h00 – 01h00", place: "Salle de réception, à confirmer", price: 25,
      desc: "La grande soirée de l'année : dress code chic, photos, surprises et bilan de la saison." },
    { id: "pique-nique-rentree-2026", date: "2026-09-27T12:00", title: "Pique-nique de rentrée", cat: "sorties",
      hours: "12h00 – 17h00", place: "Parc municipal", price: 0,
      desc: "Le rendez-vous de rentrée pour accueillir les nouveaux membres." },
  ],
};
