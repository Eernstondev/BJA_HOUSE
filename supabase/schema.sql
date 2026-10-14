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

-- ============ Modération (à faire depuis le tableau de bord) ============
-- Valider une photo :     update public.photos set statut = 'approuvee' where id = '...';
-- Valider tout un envoi : update public.photos set statut = 'approuvee' where lot = '...';
-- Confirmer une réservation après vérification du reçu :
--   update public.reservations set statut = 'confirmee' where reference = 'BJA-XXXXXX';
-- Messages de contact non traités :
--   select * from public.messages where not traite order by created_at desc;
