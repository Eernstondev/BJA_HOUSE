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

-- Aucun accès public direct : les réservations passent par la fonction public.reserver()
-- (plus bas), qui calcule le prix, les places restantes et le code promo côté serveur.
drop policy if exists "reservations: creation publique" on public.reservations;
revoke insert, update, delete on public.reservations from anon;

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
-- Réseaux sociaux de chaque membre (liens https, facultatifs)
alter table public.membres add column if not exists instagram text check (instagram is null or (instagram ~ '^https://' and char_length(instagram) <= 300));
alter table public.membres add column if not exists tiktok    text check (tiktok    is null or (tiktok    ~ '^https://' and char_length(tiktok)    <= 300));
alter table public.membres add column if not exists facebook  text check (facebook  is null or (facebook  ~ '^https://' and char_length(facebook)  <= 300));
alter table public.membres add column if not exists linkedin  text check (linkedin  is null or (linkedin  ~ '^https://' and char_length(linkedin)  <= 300));
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

-- ============ Billets, places limitées, codes promo, alertes, avis ============
alter table public.reservations add column if not exists ticket_token  uuid not null default gen_random_uuid();
alter table public.reservations add column if not exists liste_attente boolean not null default false;
-- Nombre de places réservées d'un coup (un seul billet pour tout le groupe)
alter table public.reservations add column if not exists places integer not null default 1 check (places between 1 and 10);
alter table public.reservations add column if not exists code_promo    text check (char_length(code_promo) <= 40);
alter table public.reservations add column if not exists scanned_at    timestamptz;
create unique index if not exists reservations_ticket_token_key on public.reservations (ticket_token);

alter table public.evenements add column if not exists places integer check (places is null or places > 0); -- vide = illimité

create table if not exists public.codes_promo (
  code             text primary key check (code ~ '^[A-Z0-9_-]{3,40}$'),
  created_at       timestamptz not null default now(),
  type             text not null default 'pourcent' check (type in ('pourcent', 'montant')),
  valeur           numeric(10,2) not null check (valeur > 0),
  event_id         text references public.evenements (id) on delete cascade, -- vide = tous les événements
  max_utilisations integer check (max_utilisations is null or max_utilisations > 0),
  utilisations     integer not null default 0,
  expire_le        timestamptz,
  actif            boolean not null default true,
  check (type <> 'pourcent' or valeur <= 100)
);
alter table public.codes_promo enable row level security; -- aucune lecture publique

create table if not exists public.abonnes (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email      text check (email is null or (char_length(email) <= 160 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  whatsapp   text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),
  check (email is not null or whatsapp is not null)
);
alter table public.abonnes enable row level security;
create unique index if not exists abonnes_email_key on public.abonnes (lower(email));
create unique index if not exists abonnes_whatsapp_key on public.abonnes (whatsapp);
drop policy if exists "abonnes: inscription publique" on public.abonnes;
create policy "abonnes: inscription publique" on public.abonnes for insert to anon with check (true);
grant insert on public.abonnes to anon;

create table if not exists public.avis (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  event_id       text not null,
  reservation_id uuid not null unique references public.reservations (id) on delete cascade,
  auteur         text not null check (char_length(auteur) <= 90),
  note           smallint not null check (note between 1 and 5),
  commentaire    text not null default '' check (char_length(commentaire) <= 800),
  publie         boolean not null default true
);
alter table public.avis enable row level security;
drop policy if exists "avis: lecture publique" on public.avis;
create policy "avis: lecture publique" on public.avis for select to anon using (publie);
revoke select on public.avis from anon;
grant select (id, created_at, event_id, auteur, note, commentaire) on public.avis to anon;

-- Heure actuelle en Haïti (les dates des événements sont en heure locale)
create or replace function public.maintenant_haiti() returns timestamp
language sql stable set search_path = '' as $$ select (now() at time zone 'America/Port-au-Prince') $$;

-- Places restantes par événement (seulement ceux qui ont un nombre de places)
create or replace function public.places_restantes()
returns table (event_id text, restantes integer)
language sql stable security definer set search_path = '' as $$
  select e.id, greatest(e.places - coalesce(sum(r.places), 0)::int, 0)
  from public.evenements e
  left join public.reservations r on r.event_id = e.id and not r.liste_attente and r.statut <> 'refusee'
  where e.publie and e.places is not null
  group by e.id, e.places;
$$;

-- Prix d'un événement avec un code promo (sans consommer le code)
create or replace function public.verifier_code(p_code text, p_event_id text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  ev public.evenements;
  c  public.codes_promo;
  final numeric;
begin
  select * into ev from public.evenements where id = p_event_id and publie;
  if not found then return json_build_object('valide', false, 'message', 'Événement introuvable.'); end if;
  select * into c from public.codes_promo where code = upper(trim(p_code));
  if not found or not c.actif
     or (c.event_id is not null and c.event_id <> ev.id)
     or (c.expire_le is not null and c.expire_le < now())
     or (c.max_utilisations is not null and c.utilisations >= c.max_utilisations) then
    return json_build_object('valide', false, 'message', 'Ce code n''est pas valable pour cet événement.');
  end if;
  final := greatest(0, case when c.type = 'pourcent' then round(ev.prix * (1 - c.valeur / 100)) else ev.prix - c.valeur end);
  return json_build_object('valide', true, 'code', c.code, 'prix_initial', ev.prix, 'prix_final', final,
    'message', case when c.type = 'pourcent' then '-' || trim(to_char(c.valeur, 'FM999')) || ' %' else '-' || trim(to_char(c.valeur, 'FM999999')) || ' HTG' end);
end $$;

-- Réservation : vérifie l'événement, compte les places, applique le code promo,
-- crée la référence et le billet. C'est la seule façon pour le public de réserver.
drop function if exists public.reserver(text, text, text, text, text, text, text, text);
create or replace function public.reserver(
  p_event_id text, p_prenom text, p_nom text, p_email text, p_telephone text,
  p_moyen_paiement text default null, p_recu_path text default null, p_code text default null,
  p_places integer default 1)
returns json language plpgsql security definer set search_path = '' as $$
declare
  ev      public.evenements;
  pris    integer;
  attente boolean := false;
  prix    numeric;
  v_code  text := nullif(upper(trim(coalesce(p_code, ''))), '');
  promo   json;
  ref     text;
  tok     uuid := gen_random_uuid();
  chars   constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  nb      integer := coalesce(p_places, 1);
begin
  if nb < 1 or nb > 10 then raise exception 'Vous pouvez réserver de 1 à 10 places à la fois.'; end if;
  -- verrou sur l'événement : deux réservations simultanées ne peuvent pas prendre la dernière place
  select * into ev from public.evenements where id = p_event_id and publie for update;
  if not found then raise exception 'Événement introuvable.'; end if;
  if ev.debut < public.maintenant_haiti() - interval '6 hours' then raise exception 'Cet événement est terminé.'; end if;

  if ev.places is not null then
    select coalesce(sum(places), 0) into pris from public.reservations
    where event_id = ev.id and not liste_attente and statut <> 'refusee';
    attente := pris >= ev.places;
    if not attente and pris + nb > ev.places then
      raise exception 'Il ne reste que % place(s) pour cet événement.', ev.places - pris;
    end if;
  end if;

  prix := ev.prix;
  if v_code is not null then
    promo := public.verifier_code(v_code, ev.id);
    if not (promo->>'valide')::boolean then raise exception '%', promo->>'message'; end if;
    prix := (promo->>'prix_final')::numeric;
    if not attente then
      update public.codes_promo set utilisations = utilisations + 1
      where codes_promo.code = v_code and (max_utilisations is null or utilisations < max_utilisations);
      if not found then raise exception 'Ce code a atteint son nombre maximum d''utilisations.'; end if;
    end if;
  end if;

  prix := prix * nb;  -- prix total du groupe (le code promo s'applique à chaque place)

  if prix > 0 and not attente then
    if coalesce(p_moyen_paiement, '') not in ('MonCash', 'NatCash') then raise exception 'Choisissez MonCash ou NatCash.'; end if;
    if coalesce(p_recu_path, '') = '' then raise exception 'La photo du reçu est obligatoire.'; end if;
  end if;

  loop
    ref := 'BJA-' || (select string_agg(substr(chars, 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from public.reservations where reference = ref);
  end loop;

  insert into public.reservations (reference, event_id, event_title, prenom, nom, email, telephone,
    moyen_paiement, montant, recu_path, ticket_token, liste_attente, code_promo, places)
  values (ref, ev.id, ev.titre, trim(p_prenom), trim(p_nom), trim(p_email), trim(p_telephone),
    case when prix > 0 and not attente then p_moyen_paiement end, prix,
    case when prix > 0 and not attente then p_recu_path end, tok, attente, v_code, nb);

  return json_build_object('reference', ref, 'ticket_token', tok, 'liste_attente', attente, 'montant', prix, 'places', nb);
end $$;

-- Billet : lisible uniquement avec son jeton secret (celui du QR code)
create or replace function public.billet(p_token uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'reference', r.reference, 'prenom', r.prenom, 'nom', r.nom, 'statut', r.statut,
    'liste_attente', r.liste_attente, 'montant', r.montant, 'scanned_at', r.scanned_at, 'places', r.places,
    'event_id', r.event_id, 'evenement', coalesce(e.titre, r.event_title),
    'debut', e.debut, 'horaires', e.horaires, 'lieu', e.lieu)
  from public.reservations r left join public.evenements e on e.id = r.event_id
  where r.ticket_token = p_token;
$$;

-- Scan à l'entrée (admin) : par QR code (jeton) ou par référence BJA-XXXXXX
create or replace function public.valider_entree(p_code text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  r public.reservations;
  v text := trim(coalesce(p_code, ''));
begin
  if not public.is_admin() then raise exception 'Réservé aux admins.'; end if;
  v := coalesce(substring(v from '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'), upper(v));
  if v ~ '^[0-9a-fA-F-]{36}$' then
    select * into r from public.reservations where ticket_token = v::uuid for update;
  else
    select * into r from public.reservations where reference = v for update;
  end if;
  if not found then return json_build_object('resultat', 'introuvable'); end if;
  if r.statut <> 'confirmee' or r.liste_attente then
    return json_build_object('resultat', 'non_confirme', 'reference', r.reference, 'nom', r.prenom || ' ' || r.nom, 'evenement', r.event_title, 'statut', r.statut, 'liste_attente', r.liste_attente);
  end if;
  if r.scanned_at is not null then
    return json_build_object('resultat', 'deja', 'reference', r.reference, 'nom', r.prenom || ' ' || r.nom, 'evenement', r.event_title, 'scanned_at', r.scanned_at, 'places', r.places);
  end if;
  update public.reservations set scanned_at = now() where id = r.id;
  return json_build_object('resultat', 'ok', 'reference', r.reference, 'nom', r.prenom || ' ' || r.nom, 'evenement', r.event_title, 'scanned_at', now(), 'places', r.places);
end $$;

-- Avis : seulement par une personne dont la réservation est confirmée, après l'événement, une fois.
drop function if exists public.laisser_avis(text, integer, text);
create or replace function public.laisser_avis(p_code text, p_note integer, p_commentaire text, p_event_id text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  r  public.reservations;
  ev public.evenements;
  v  text := trim(coalesce(p_code, ''));
begin
  if v ~ '^[0-9a-fA-F-]{36}$' then
    select * into r from public.reservations where ticket_token = v::uuid;
  else
    select * into r from public.reservations where reference = upper(v);
  end if;
  if not found or r.statut <> 'confirmee' or r.liste_attente then
    raise exception 'Référence introuvable ou réservation non confirmée.';
  end if;
  select * into ev from public.evenements where id = r.event_id;
  -- La référence doit correspondre à l'événement de la page
  if p_event_id is not null and r.event_id <> p_event_id then
    raise exception 'Cette référence correspond à une autre réservation (« % »), pas à cet événement.', r.event_title;
  end if;
  if found and ev.debut > public.maintenant_haiti() then
    raise exception 'Vous pourrez laisser un avis sur « % » après l''événement.', ev.titre;
  end if;
  if exists (select 1 from public.avis where reservation_id = r.id) then raise exception 'Vous avez déjà laissé un avis pour cet événement.'; end if;
  insert into public.avis (event_id, reservation_id, auteur, note, commentaire)
  values (r.event_id, r.id, r.prenom || ' ' || left(r.nom, 1) || '.', p_note, left(trim(coalesce(p_commentaire, '')), 800));
  return json_build_object('ok', true, 'event_id', r.event_id);
end $$;

revoke execute on function public.places_restantes(), public.verifier_code(text, text),
  public.reserver(text, text, text, text, text, text, text, text, integer), public.billet(uuid),
  public.valider_entree(text), public.laisser_avis(text, integer, text, text) from public;
grant execute on function public.places_restantes(), public.verifier_code(text, text),
  public.reserver(text, text, text, text, text, text, text, text, integer), public.billet(uuid),
  public.laisser_avis(text, integer, text, text) to anon, authenticated;
grant execute on function public.valider_entree(text) to authenticated;

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
  foreach t in array array['reservations', 'photos', 'messages', 'evenements', 'membres', 'reglages', 'codes_promo', 'abonnes', 'avis'] loop
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

-- Recharge les fonctions côté API (évite « Could not find the function … in the schema cache »).
notify pgrst, 'reload schema';
