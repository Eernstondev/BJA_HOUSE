-- BJA HOUSE — base de données Supabase
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le site n'utilise que la clé publique « anon » ; ces règles (RLS) limitent ce qu'elle peut faire.

-- ============ Réservations ============
create table if not exists public.reservations (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  reference      text not null unique check (reference ~ '^BJA-[A-Z0-9]{6}$'),
  event_id       text not null check (char_length(event_id) <= 80),
  event_title    text not null check (char_length(event_title) <= 160),
  prenom         text not null check (char_length(prenom) between 1 and 80),
  nom            text not null check (char_length(nom) between 1 and 80),
  email          text not null check (char_length(email) <= 160 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telephone      text not null check (telephone ~ '^\+?[0-9 ().-]{8,20}$'),
  moyen_paiement text check (char_length(moyen_paiement) <= 60),
  montant        numeric(10,2) not null default 0 check (montant >= 0),
  recu_path      text check (char_length(recu_path) <= 200),
  statut         text not null default 'en_attente' check (statut in ('en_attente', 'confirmee', 'refusee'))
);

alter table public.reservations enable row level security;

-- Le public peut seulement créer une réservation « en attente ». Aucune lecture publique.
drop policy if exists "reservations: creation publique" on public.reservations;
create policy "reservations: creation publique" on public.reservations
  for insert to anon with check (statut = 'en_attente');

-- ============ Photos partagées ============
create table if not exists public.photos (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lot        uuid not null,
  path       text not null unique check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|heic)$'),
  categorie  text not null check (categorie in ('soirees', 'sport', 'sorties', 'ateliers')),
  evenement  text check (char_length(evenement) <= 160),
  auteur     text not null check (char_length(auteur) between 1 and 80),
  telephone  text check (telephone ~ '^\+?[0-9 ().-]{8,20}$'),
  statut     text not null default 'en_attente' check (statut in ('en_attente', 'approuvee', 'refusee'))
);

alter table public.photos enable row level security;

drop policy if exists "photos: envoi public" on public.photos;
create policy "photos: envoi public" on public.photos
  for insert to anon with check (statut = 'en_attente');

-- Le site n'affiche que les photos validées par l'équipe.
drop policy if exists "photos: lecture des photos approuvees" on public.photos;
create policy "photos: lecture des photos approuvees" on public.photos
  for select to anon using (statut = 'approuvee');

-- Le nom et le téléphone de l'auteur ne sont jamais lisibles publiquement.
revoke select on public.photos from anon;
grant select (id, created_at, path, categorie, evenement, statut) on public.photos to anon;

-- ============ Messages du formulaire de contact ============
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sujet      text not null check (sujet in ('Événement', 'Devenir membre', 'Partenariat', 'Idée', 'Autre')),
  nom        text not null check (char_length(nom) between 2 and 120),
  telephone  text not null check (telephone ~ '^\+?[0-9 ().-]{8,20}$'),
  email      text check (email is null or (char_length(email) <= 160 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  message    text not null check (char_length(message) between 10 and 2000),
  traite     boolean not null default false
);

alter table public.messages enable row level security;

-- Le public peut seulement envoyer un message. Aucune lecture publique.
drop policy if exists "messages: envoi public" on public.messages;
create policy "messages: envoi public" on public.messages
  for insert to anon with check (traite = false);

-- ============ Stockage des fichiers ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('recus',   'recus',   false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  ('galerie', 'galerie', true,  8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

-- Le public peut déposer des fichiers, mais ni les lister, ni les modifier, ni les supprimer.
-- Les reçus (bucket privé) ne sont visibles que depuis le tableau de bord Supabase.
drop policy if exists "recus: depot public" on storage.objects;
create policy "recus: depot public" on storage.objects
  for insert to anon with check (bucket_id = 'recus');

drop policy if exists "galerie: depot public" on storage.objects;
create policy "galerie: depot public" on storage.objects
  for insert to anon with check (bucket_id = 'galerie');

-- ============ Contenu du site (modifiable depuis l'espace admin) ============
create table if not exists public.evenements (
  id          text primary key check (id ~ '^[a-z0-9-]{3,80}$'),
  created_at  timestamptz not null default now(),
  titre       text not null check (char_length(titre) between 2 and 160),
  categorie   text not null check (categorie in ('soirees', 'sport', 'sorties', 'ateliers')),
  debut       timestamp not null,                 -- heure locale d'Haïti
  horaires    text not null default '' check (char_length(horaires) <= 80),
  lieu        text not null default '' check (char_length(lieu) <= 160),
  prix        numeric(10,2) not null default 0 check (prix >= 0),
  description text not null default '' check (char_length(description) <= 1200),
  image_path  text check (char_length(image_path) <= 200),
  publie      boolean not null default true
);
alter table public.evenements enable row level security;
drop policy if exists "evenements: lecture publique" on public.evenements;
create policy "evenements: lecture publique" on public.evenements
  for select to anon using (publie);

create table if not exists public.membres (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nom        text not null check (char_length(nom) between 2 and 80),
  role       text not null check (char_length(role) between 2 and 80),
  bio        text not null default '' check (char_length(bio) <= 600),
  photo_path text check (char_length(photo_path) <= 200),
  ordre      integer not null default 0,
  publie     boolean not null default true
);
alter table public.membres enable row level security;
drop policy if exists "membres: lecture publique" on public.membres;
create policy "membres: lecture publique" on public.membres
  for select to anon using (publie);

-- Une seule ligne (id = 1) : coordonnées et moyens de paiement affichés sur le site.
create table if not exists public.reglages (
  id             integer primary key default 1 check (id = 1),
  whatsapp       text not null default '' check (whatsapp ~ '^[0-9]{0,15}$'),
  email          text not null default '' check (char_length(email) <= 160),
  instagram      text not null default '' check (instagram = '' or instagram ~ '^https://'),
  tiktok         text not null default '' check (tiktok = '' or tiktok ~ '^https://'),
  moncash_numero text not null default '' check (char_length(moncash_numero) <= 30),
  moncash_nom    text not null default '' check (char_length(moncash_nom) <= 80),
  natcash_numero text not null default '' check (char_length(natcash_numero) <= 30),
  natcash_nom    text not null default '' check (char_length(natcash_nom) <= 80),
  updated_at     timestamptz not null default now()
);
alter table public.reglages enable row level security;
insert into public.reglages (id) values (1) on conflict (id) do nothing;
drop policy if exists "reglages: lecture publique" on public.reglages;
create policy "reglages: lecture publique" on public.reglages
  for select to anon using (true);

grant select on public.evenements, public.membres, public.reglages to anon;

-- Événements et membres de départ (exemples), ajoutés seulement si les tables sont vides.
insert into public.evenements (id, titre, categorie, debut, horaires, lieu, prix, description)
select * from (values
  ('soiree-automne-2026', 'Soirée d''automne BJA', 'soirees', timestamp '2026-10-25 19:00', '19h00 – 23h30', 'Lieu communiqué aux inscrits', 500, 'Musique, jeux et bonne ambiance pour lancer la saison. Tenue correcte, bonne humeur obligatoire.'),
  ('tournoi-foot-2026', 'Tournoi de foot à 5', 'sport', timestamp '2026-11-08 14:00', '14h00 – 18h00', 'City stade, à confirmer', 250, 'Équipes de cinq, matchs courts, remise de prix en fin d''après-midi. Inscription par équipe ou en solo.'),
  ('atelier-projet-2026', 'Atelier : monter son projet', 'ateliers', timestamp '2026-11-22 15:00', '15h00 – 17h30', 'Salle partenaire', 0, 'Un après-midi pour passer d''une idée à un plan concret, avec des jeunes entrepreneurs de la région.'),
  ('sortie-patinoire-2026', 'Sortie patinoire', 'sorties', timestamp '2026-12-06 13:30', '13h30 – 17h00', 'Départ groupé, point de rendez-vous à venir', 750, 'Une sortie détente avant les fêtes. Location des patins comprise pour les inscrits.'),
  ('gala-2026', 'Gala de fin d''année', 'soirees', timestamp '2026-12-19 20:00', '20h00 – 01h00', 'Salle de réception, à confirmer', 1500, 'La grande soirée de l''année : dress code chic, photos, surprises et bilan de la saison.'),
  ('pique-nique-rentree-2026', 'Pique-nique de rentrée', 'sorties', timestamp '2026-09-27 12:00', '12h00 – 17h00', 'Parc municipal', 0, 'Le rendez-vous de rentrée pour accueillir les nouveaux membres.')
) as v
where not exists (select 1 from public.evenements);

insert into public.membres (nom, role, bio, ordre)
select * from (values
  ('Prénom Nom', 'Président·e', 'Fondateur·rice de BJA HOUSE, coordonne l''équipe et les grands projets de l''année.', 1),
  ('Prénom Nom', 'Vice-président·e', 'Supervise l''organisation des événements et accompagne les nouveaux membres.', 2),
  ('Prénom Nom', 'Trésorier·e', 'Gère le budget, les partenaires financiers et les inscriptions payantes.', 3),
  ('Prénom Nom', 'Secrétaire', 'Tient les comptes rendus, le planning et la relation avec les lieux.', 4),
  ('Prénom Nom', 'Communication', 'Anime les réseaux sociaux, les visuels et la couverture photo des événements.', 5),
  ('Prénom Nom', 'Responsable événements', 'Pilote la logistique le jour J : matériel, accueil et sécurité.', 6)
) as v
where not exists (select 1 from public.membres);

-- Images des événements et photos des membres (lecture publique).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('site', 'site', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ============ Espace admin ============
-- Seuls les comptes listés ici (créés dans Authentication → Users) accèdent à admin.html.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "admins: lecture de sa propre ligne" on public.admins;
create policy "admins: lecture de sa propre ligne" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

-- Anciennes règles admin (versions précédentes de ce fichier), remplacées ci-dessous.
drop policy if exists "reservations: admin lecture" on public.reservations;
drop policy if exists "reservations: admin statut" on public.reservations;
drop policy if exists "photos: admin lecture" on public.photos;
drop policy if exists "photos: admin statut" on public.photos;
drop policy if exists "messages: admin lecture" on public.messages;
drop policy if exists "messages: admin traite" on public.messages;
drop policy if exists "recus: lecture admin" on storage.objects;

-- Un admin a tous les droits sur les données du site.
do $$
declare t text;
begin
  foreach t in array array['reservations', 'photos', 'messages', 'evenements', 'membres', 'reglages'] loop
    execute format('drop policy if exists "admin: acces complet" on public.%I', t);
    execute format('create policy "admin: acces complet" on public.%I for all to authenticated
                    using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- … et sur tous les fichiers : reçus, galerie, images du site.
drop policy if exists "admin: fichiers" on storage.objects;
create policy "admin: fichiers" on storage.objects
  for all to authenticated
  using (bucket_id in ('recus', 'galerie', 'site') and (select public.is_admin()))
  with check (bucket_id in ('recus', 'galerie', 'site') and (select public.is_admin()));

-- ============ Modération (à faire depuis le tableau de bord) ============
-- Valider une photo :     update public.photos set statut = 'approuvee' where id = '...';
-- Valider tout un envoi : update public.photos set statut = 'approuvee' where lot = '...';
-- Confirmer une réservation après vérification du reçu :
--   update public.reservations set statut = 'confirmee' where reference = 'BJA-XXXXXX';
-- Messages de contact non traités :
--   select * from public.messages where not traite order by created_at desc;

-- ============ Créer un compte admin ============
-- 1. Authentication → Users → Add user → Create new user (e-mail + mot de passe, « Auto Confirm User » coché).
-- 2. Puis ici, avec le même e-mail :
--   insert into public.admins (user_id) select id from auth.users where email = 'admin@exemple.com';
