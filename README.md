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
