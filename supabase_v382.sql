-- NdooHlcc V3.8.2 — online social fixes + server-side moderation
-- Jalankan sekali di Supabase SQL Editor.

alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles
  add column if not exists banned_until timestamptz;

alter table public.profiles
  add column if not exists ban_reason text default '';

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_banned_until_idx on public.profiles (banned_until);

-- Jadikan akun bernama admin sebagai admin server-side jika profilnya sudah ada.
update public.profiles
set role = 'admin'
where lower(username) = 'admin';

create or replace function public.admin_set_ban(
  target_user uuid,
  until_at timestamptz,
  reason_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role <> 'admin' then
    raise exception 'Admin access required';
  end if;

  if target_user = auth.uid() then
    raise exception 'Admin cannot ban self';
  end if;

  update public.profiles
  set banned_until = until_at,
      ban_reason = coalesce(nullif(trim(reason_text), ''), 'Pelanggaran aturan komunitas.')
  where id = target_user;
end;
$$;

create or replace function public.admin_unban(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role <> 'admin' then
    raise exception 'Admin access required';
  end if;

  update public.profiles
  set banned_until = null,
      ban_reason = ''
  where id = target_user;
end;
$$;

revoke all on function public.admin_set_ban(uuid, timestamptz, text) from public;
grant execute on function public.admin_set_ban(uuid, timestamptz, text) to authenticated;
revoke all on function public.admin_unban(uuid) from public;
grant execute on function public.admin_unban(uuid) to authenticated;

-- DM: indeks untuk percakapan lintas perangkat.
create index if not exists messages_receiver_read_idx on public.messages (receiver_id, read, created_at desc);
create index if not exists messages_sender_receiver_idx on public.messages (sender_id, receiver_id, created_at desc);

-- Opsional: Realtime untuk tabel yang dipakai sinkronisasi. Jika tabel sudah terdaftar,
-- bagian ini aman dilewati dan aplikasi tetap memakai polling fallback.
