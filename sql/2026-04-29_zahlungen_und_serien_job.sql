-- 1) Zahlungshistorie fuer Teilzahlungen
create table if not exists public.zahlungen (
  id uuid primary key default gen_random_uuid(),
  dokument_id uuid not null references public.dokumente(id) on delete cascade,
  betrag numeric(12,2) not null check (betrag > 0),
  zahlungsdatum date not null default current_date,
  notiz text,
  created_at timestamptz not null default now()
);

create index if not exists zahlungen_dokument_id_idx on public.zahlungen(dokument_id);
create index if not exists zahlungen_datum_idx on public.zahlungen(zahlungsdatum desc);

alter table public.zahlungen enable row level security;

drop policy if exists "zahlungen_select_authenticated" on public.zahlungen;
create policy "zahlungen_select_authenticated"
  on public.zahlungen
  for select
  to authenticated
  using (true);

drop policy if exists "zahlungen_insert_authenticated" on public.zahlungen;
create policy "zahlungen_insert_authenticated"
  on public.zahlungen
  for insert
  to authenticated
  with check (true);

drop policy if exists "zahlungen_update_authenticated" on public.zahlungen;
create policy "zahlungen_update_authenticated"
  on public.zahlungen
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "zahlungen_delete_authenticated" on public.zahlungen;
create policy "zahlungen_delete_authenticated"
  on public.zahlungen
  for delete
  to authenticated
  using (true);

-- 2) Serienfelder auf dokumente (falls noch nicht vorhanden)
alter table public.dokumente add column if not exists wiederholung_aktiv boolean not null default false;
alter table public.dokumente add column if not exists wiederholung_intervall_tage integer;
alter table public.dokumente add column if not exists wiederholung_naechste_faelligkeit date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dokumente_wiederholung_intervall_check'
  ) then
    alter table public.dokumente
      add constraint dokumente_wiederholung_intervall_check
      check (wiederholung_intervall_tage is null or wiederholung_intervall_tage >= 1);
  end if;
end $$;

-- 3) Hilfs-View fuer kommende Serienrechnungen
create or replace view public.v_serien_rechnungen_faellig as
select
  d.id,
  d.nummer,
  d.datum,
  d.wiederholung_aktiv,
  d.wiederholung_intervall_tage,
  d.wiederholung_naechste_faelligkeit
from public.dokumente d
where d.typ = 'Rechnung'
  and coalesce(d.wiederholung_aktiv, false) = true
  and d.wiederholung_intervall_tage is not null
  and d.wiederholung_naechste_faelligkeit <= current_date;

-- 4) Optional: pg_cron Job (nur ausfuehren, wenn pg_cron verfuegbar ist)
-- Erwartet Edge Function URL + Service Role Key als Secret in SQL Editor Session:
-- set local app.settings.serien_url = 'https://<project-ref>.functions.supabase.co/serien-faellig';
-- set local app.settings.serien_key = '<SERVICE_ROLE_KEY>';
--
-- select cron.schedule(
--   'serien-rechnungen-taeglich',
--   '5 3 * * *',
--   format(
--     $f$select net.http_post(
--       url := %L,
--       headers := jsonb_build_object('Authorization', 'Bearer ' || %L, 'Content-Type', 'application/json'),
--       body := '{"source":"pg_cron"}'::jsonb
--     );$f$,
--     current_setting('app.settings.serien_url', true),
--     current_setting('app.settings.serien_key', true)
--   )
-- );
