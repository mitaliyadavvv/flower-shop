-- posy · bouquet storage
-- Run this once in Supabase → SQL Editor.

create table if not exists public.bouquets (
  id              text primary key,
  composition     jsonb       not null,           -- { version, flowers: [{ kind, color, petals, x, y, rotation, scale, seed }] }
  recipient_name  text,
  message         text        not null default '',
  sender_name     text,
  created_at      timestamptz not null default now(),
  constraint bouquets_id_format  check (id ~ '^[A-Za-z0-9]{8,16}$'),
  constraint bouquets_msg_length check (char_length(message) <= 800),
  constraint bouquets_to_length  check (recipient_name is null or char_length(recipient_name) <= 60),
  constraint bouquets_from_length check (sender_name is null or char_length(sender_name) <= 60)
);

-- Lock the table down. The app talks to it only from the server using the
-- secret key, which bypasses RLS. No anonymous reads or writes are allowed.
alter table public.bouquets enable row level security;
revoke all on public.bouquets from anon, authenticated;
