# BJA HOUSE

Site vitrine de BJA HOUSE, en HTML, CSS et JavaScript sans framework. Réalisé par URBVEC ATELIER.

## Pages
`index.html` (accueil), `galerie.html`, `activites.html`, `a-propos.html`, `contact.html`,
`reservation.html` (réservation d'une activité) et `partager.html` (envoi de photos pour la galerie).

## Mise en route
1. Créer un projet sur [supabase.com](https://supabase.com), puis exécuter `supabase/schema.sql` dans **SQL Editor**.
2. Dans `js/config.js`, renseigner :
   - `supabaseUrl` et `supabaseAnonKey` (Settings → API). Uniquement la clé **anon**, jamais la clé `service_role`.
   - `whatsapp` : numéro de BJA HOUSE au format international, sans `+` (ex. `33612345678`).
   - `currency`, `paymentMethods` et `events` (prix, lieux, dates).
3. Déployer le dossier tel quel (GitHub Pages, Vercel ou Netlify).

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
- **Réservations** : voir le reçu, confirmer, refuser, prévenir le client sur WhatsApp, filtrer par événement, exporter pour Excel, supprimer.
- **Événements** : créer, modifier (date, prix, lieu, image), masquer ou supprimer ; voir les inscrits.
- **Photos** : publier ou refuser les photos envoyées, ajouter directement des photos à la galerie, supprimer.
- **Membres** : ajouter, modifier (photo, rôle, présentation, ordre), masquer ou supprimer.
- **Messages** : lire, répondre sur WhatsApp, marquer comme traité, supprimer.
- **Réglages** : numéro WhatsApp, e-mail, Instagram, TikTok, numéros et noms MonCash/NatCash.

Le site lit ces données dans Supabase ; `js/config.js` ne sert que de secours si la base ne répond pas.
