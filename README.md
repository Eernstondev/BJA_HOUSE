# BJA HOUSE

Site vitrine de BJA HOUSE, en HTML, CSS et JavaScript sans framework. Réalisé par URBVEC ATELIER.

## Pages
`index.html` (accueil), `galerie.html`, `activites.html`, `a-propos.html`, `contact.html`,
`reservation.html` (réservation de 1 à 10 places, un seul billet pour le groupe, billet Standard ou VIP), `evenement.html` (détails, places restantes, avis,
boutons Partager et Ajouter au calendrier), `billet.html` (billet avec QR code), `partager.html` (envoi de photos pour la galerie)
`confidentialite.html` (données personnelles) et `404.html` (page introuvable).

## Mise en route
1. Créer un projet sur [supabase.com](https://supabase.com), puis exécuter `supabase/schema.sql` dans **SQL Editor**.
2. Dans `js/config.js`, renseigner :
   - `supabaseUrl` et `supabaseAnonKey` (Settings → API). Uniquement la clé **anon**, jamais la clé `service_role`.
   - `whatsapp` : numéro de BJA HOUSE au format international, sans `+` (ex. `33612345678`).
   - `currency`, `paymentMethods` et `events` (prix, lieux, dates).
3. Déployer le dossier tel quel (GitHub Pages, Vercel ou Netlify).

**Adresse du site** : l'aperçu des liens partagés (image `assets/og.jpg`), `sitemap.xml` et `robots.txt` utilisent `https://bja-house.vercel.app/` (projet Vercel « bja-house »). Avec un nom de domaine, remplacer cette adresse partout (rechercher-remplacer dans les fichiers `.html`, `sitemap.xml` et `robots.txt`).

Sans Supabase configuré, les formulaires fonctionnent en mode démonstration : rien n'est enregistré.

## Modération
- **Réservations** : table `reservations`, reçus dans le bucket privé `recus`. Une fois le reçu vérifié,
  passer `statut` à `confirmee`.
- **Photos partagées** : table `photos`, fichiers dans le bucket `galerie`. Elles n'apparaissent sur le site
  qu'une fois `statut` passé à `approuvee` (les requêtes sont en bas de `supabase/schema.sql`).

## Espace admin (`admin.html`)

Page non listée dans le menu, réservée aux comptes admin.

1. Exécuter `supabase/schema.sql` (SQL Editor → Run). Le fichier peut être relancé sans risque.
2. Supabase → Authentication → Users → Add user → Create new user : e-mail + mot de passe, cocher « Auto Confirm User ».
3. Dans SQL Editor : `insert into public.admins (user_id) select id from auth.users where email = 'votre@email.com';`
4. Conseillé : Authentication → Sign In / Providers → désactiver « Allow new users to sign up ».

Depuis le tableau de bord, l'admin gère tout le site :
- **Réservations** : voir le reçu, confirmer ou refuser (WhatsApp s'ouvre aussitôt vers la personne avec son billet ou le refus), gérer la liste d'attente, filtrer par événement, exporter pour Excel, supprimer.
- **Scanner** : à l'entrée, ouvrir l'espace admin sur le téléphone et scanner le QR code du billet (ou taper sa référence). Un billet d'une place n'est accepté qu'une fois. La caméra demande le site en ligne (https). Billet de groupe : le même QR code sert à tout le groupe, et à chaque scan l'admin choisit combien de personnes entrent (ex. 3 sur 10), jusqu'à ce que tout le groupe soit entré.
- **Billets VIP** : dans l'événement, renseigner « Prix VIP » (vide = pas de VIP) et, si besoin, « Places VIP » (comprises dans le total). Les billets VIP sont marqués ★ VIP dans l'admin, au scanner et sur le billet.
- **Fin des ventes** : dans l'événement, « Fin des ventes (heures avant le début) » (vide = jusqu'au début). Passé ce délai, le site affiche « Réservations fermées » et le serveur refuse toute réservation.
- **Annulation par le client** : sur son billet, « Annuler ma réservation », confirmé avec les 4 derniers chiffres du téléphone. Les places sont libérées, le client peut prévenir l'équipe sur WhatsApp ; le remboursement se fait à la main. Filtre « Annulées » dans les réservations. Quand des places se libèrent et qu'il y a une liste d'attente, la carte de l'événement l'indique : prévenir les personnes dans l'ordre (n° 1 d'abord) avec « Donner une place ».
- **Rappels** : les inscrits confirmés d'un événement à venir ; la veille, leur envoyer un rappel WhatsApp un par un avec le lien de leur billet (aussi via « Rappel la veille » sur la carte de l'événement).
- **Entrées** : les personnes scannées avec leur heure d'arrivée, par événement ; sélectionner et leur envoyer un remerciement sur WhatsApp, ou copier leurs numéros.
- **Événements** : créer, modifier (date, prix, lieu, nombre de places, image), masquer ou supprimer ; voir les inscrits. Quand un événement est complet, les inscriptions passent en liste d'attente.
- **Photos** : publier ou refuser les photos envoyées, ajouter directement des photos à la galerie, supprimer.
- **Membres** : ajouter, modifier (photo, rôle, présentation, liens Instagram/TikTok/Facebook/LinkedIn, ordre), masquer ou supprimer.
- **Messages** : lire, répondre sur WhatsApp, marquer comme traité, supprimer.
- **Avis** : notes et commentaires laissés après un événement (avec la référence du billet) ; masquer ou supprimer.
- **Abonnés** : e-mails et numéros WhatsApp inscrits aux alertes ; exporter, copier la liste pour un envoi groupé.
- **Codes promo** : pourcentage ou montant, pour un événement ou tous, avec limite d'utilisations et date d'expiration.
- **Statistiques** : inscriptions, recettes et notes par événement, en graphiques.
- **Réglages** : numéro WhatsApp, e-mail, Instagram, TikTok, numéros et noms MonCash/NatCash.

Sécurité : le prix, les places, les codes promo, le billet et la validation à l'entrée sont calculés dans la base
(fonctions `reserver`, `verifier_code`, `billet`, `valider_entree`, `laisser_avis`) ; le navigateur ne peut ni lire
les réservations des autres, ni voir les codes promo, ni valider un billet sans être admin.

Le site lit ces données dans Supabase ; `js/config.js` ne sert que de secours si la base ne répond pas.
