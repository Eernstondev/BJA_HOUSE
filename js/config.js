/* BJA HOUSE — réglages du site. Une fois Supabase installé, les événements, les membres,
   les coordonnées et les numéros de paiement se gèrent depuis l'espace admin (admin.html) ;
   les valeurs ci-dessous ne servent alors que de secours si la base ne répond pas. */
window.BJA = {
  // Supabase (Settings → API). Uniquement l'URL du projet et la clé publique « anon » :
  // ne jamais mettre la clé « service_role » ici.
  supabaseUrl: "https://dfgwpxugiexxfxqouohm.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmZ3dweHVnaWV4eGZ4cW91b2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MzYzMDcsImV4cCI6MjEwNzUxMjMwN30.J9QOlI2ywl3FSWhGbZLvhU5hxZq7PfdnZEenisEfTxg",

  // Numéro WhatsApp de BJA HOUSE, format international sans « + » ni espaces (ex. 50937000000).
  whatsapp: "",

  currency: "HTG",

  // Coordonnées affichées (remplacées par celles de l'espace admin → Réglages).
  contact: { email: "contact@bjahouse.fr", instagram: "https://www.instagram.com/", tiktok: "https://www.tiktok.com/" },

  // Moyens de paiement proposés à la réservation, avec les instructions affichées.
  paymentMethods: [
    { id: "moncash", label: "MonCash", details: "Envoyez le montant par MonCash au +509 XX XX XX XX (nom : BJA HOUSE), puis faites une capture du reçu." },
    { id: "natcash", label: "NatCash", details: "Envoyez le montant par NatCash au +509 XX XX XX XX (nom : BJA HOUSE), puis faites une capture du reçu." },
  ],

  categories: { soirees: "Soirées", sport: "Sport", sorties: "Sorties", ateliers: "Ateliers" },

  /* Événements de secours, affichés uniquement si Supabase ne répond pas.
     Les vrais événements se gèrent dans l'espace admin (table « evenements ») :
     laisser cette liste vide évite d'afficher de faux événements en cas de panne. */
  events: [],
};
