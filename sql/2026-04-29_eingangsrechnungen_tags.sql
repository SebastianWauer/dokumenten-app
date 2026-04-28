-- Dokumente: Kategorie + Tags
alter table public.dokumente add column if not exists kategorie text;
alter table public.dokumente add column if not exists tags text[];

create index if not exists dokumente_kategorie_idx on public.dokumente(kategorie);
create index if not exists dokumente_tags_gin_idx on public.dokumente using gin(tags);

-- Eingangsrechnungen-Archiv
create table if not exists public.eingangsrechnungen (
  id uuid primary key default gen_random_uuid(),
  lieferant text,
  rechnungsnummer text,
  rechnungsdatum date not null,
  brutto_betrag numeric(12,2) not null default 0,
  dateipfad text not null,
  dateiname text,
  created_at timestamptz not null default now()
);

create index if not exists eingangsrechnungen_datum_idx on public.eingangsrechnungen(rechnungsdatum desc);

alter table public.eingangsrechnungen enable row level security;

drop policy if exists "eingangsrechnungen_select_authenticated" on public.eingangsrechnungen;
create policy "eingangsrechnungen_select_authenticated"
  on public.eingangsrechnungen
  for select
  to authenticated
  using (true);

drop policy if exists "eingangsrechnungen_insert_authenticated" on public.eingangsrechnungen;
create policy "eingangsrechnungen_insert_authenticated"
  on public.eingangsrechnungen
  for insert
  to authenticated
  with check (true);

-- Storage-Bucket für Eingangsrechnungen
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('eingangsrechnungen', 'eingangsrechnungen', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "eingangsrechnungen_storage_select" on storage.objects;
create policy "eingangsrechnungen_storage_select"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'eingangsrechnungen');

drop policy if exists "eingangsrechnungen_storage_insert" on storage.objects;
create policy "eingangsrechnungen_storage_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'eingangsrechnungen');
