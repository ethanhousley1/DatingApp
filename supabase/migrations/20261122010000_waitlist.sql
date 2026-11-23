-- Waitlist from the marketing site's "Join the waitlist" form.
-- Anyone can join through join_waitlist(); nobody but admins can read the list.

create table public.waitlist (
  id bigint generated always as identity primary key,
  email text not null unique check (email = lower(email) and char_length(email) <= 254),
  source text not null default 'landing' check (char_length(source) <= 40),
  created_at timestamptz not null default now(),
  invited_at timestamptz   -- set when you let this person into the alpha
);
alter table public.waitlist enable row level security;
-- No policies: the list is only visible in the Supabase dashboard / to the service role.
revoke all on public.waitlist from anon, authenticated;

-- Always answers the same way, so the form can't be used to check whether an
-- email is already on the list.
create function public.join_waitlist(email text, source text default 'landing') returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  clean text := lower(trim(join_waitlist.email));
  src text := left(coalesce(nullif(trim(join_waitlist.source), ''), 'landing'), 40);
begin
  if clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(clean) > 254 then
    raise exception 'That email address doesn''t look right.';
  end if;
  insert into waitlist (email, source)
  values (clean, src)
  on conflict (email) do nothing;
end $$;

revoke execute on function public.join_waitlist(text, text) from public;
grant execute on function public.join_waitlist(text, text) to anon, authenticated;
