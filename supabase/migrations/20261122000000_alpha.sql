-- Connections alpha: profiles, 3-slot matching, chat, endings, ratings, reports.
-- Product rules live in docs/product-decisions.md. Numbers that may change are in
-- app_settings, so they can be tuned without a new migration.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- Settings (one row). Only reachable through the functions below.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  city text not null default 'alpha',
  max_slots int not null default 3,
  overflow_cap int not null default 5,
  overflow_after interval not null default '24 hours',
  ghost_after interval not null default '2 days',
  message_retention interval not null default '30 days',
  age_gap_base numeric not null default 3,
  age_gap_per_year numeric not null default 0.3,
  min_age int not null default 18,
  max_age int not null default 35,
  max_photos int not null default 6,
  notify_url text,      -- e.g. https://<app>/api/notify ; null = no emails
  notify_secret text
);
insert into public.app_settings default values;
alter table public.app_settings enable row level security;

create function public.years_old(d date) returns int
language sql stable as $$ select extract(year from age(current_date, d))::int $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  birthdate date not null,
  height_cm int not null check (height_cm between 120 and 230),
  gender text not null check (gender in ('man', 'woman', 'other')),
  seeking text[] not null check (cardinality(seeking) > 0 and seeking <@ array['man', 'woman', 'other']),
  city text not null default 'alpha',
  open_to_more boolean not null default false,   -- "I'm open to more connections" (overflow)
  paused boolean not null default false,         -- "I don't want to match with anyone right now"
  created_at timestamptz not null default now()
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  path text not null unique,       -- storage path in the "photos" bucket: <user id>/<file>
  position int not null default 0, -- 0 is shown first; the rest are kept for the reveal system
  created_at timestamptz not null default now()
);
create index photos_user_idx on public.photos (user_id, position);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles on delete cascade,
  user_b uuid not null references public.profiles on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended', 'off_app')),
  overflow_for uuid references public.profiles on delete set null, -- the full person who took this as a 4th/5th
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles on delete set null,
  end_reason text check (end_reason in ('ended', 'ghosted', 'reported', 'off_app')),
  off_app_a boolean not null default false,
  off_app_b boolean not null default false,
  closed_a boolean not null default false, -- each person closes an ended conversation for good
  closed_b boolean not null default false,
  check (user_a < user_b),
  unique (user_a, user_b)                  -- one row per pair, ever: unmatching is permanent
);
create index conversations_a_idx on public.conversations (user_a, status);
create index conversations_b_idx on public.conversations (user_b, status);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- Every press of the "+" bar. Open = not matched and not cancelled.
create table public.match_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  matched_at timestamptz,
  cancelled_at timestamptz,
  conversation_id uuid references public.conversations on delete set null
);
create unique index match_requests_one_open on public.match_requests (user_id)
  where matched_at is null and cancelled_at is null;

create table public.ratings (
  conversation_id uuid not null references public.conversations on delete cascade,
  rater_id uuid not null references public.profiles on delete cascade,
  thumbs text not null check (thumbs in ('up', 'down')),
  tags text[] not null default '{}' check (tags <@ array['ghosted', 'especially_good', 'report']),
  created_at timestamptz not null default now(),
  primary key (conversation_id, rater_id)
);

-- Private notes each person keeps about the other person in a conversation.
create table public.notes (
  conversation_id uuid not null references public.conversations on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null default '' check (char_length(body) <= 5000),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- Reports are only visible to admins (Supabase dashboard / service role).
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations on delete set null,
  reporter_id uuid references public.profiles on delete set null,
  reported_id uuid references public.profiles on delete set null,
  details text check (char_length(details) <= 2000),
  messages_snapshot jsonb not null default '[]',
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.is_member(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations c
    where c.id = conv and auth.uid() in (c.user_a, c.user_b)
  )
$$;

create function public.is_active_member(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations c
    where c.id = conv and c.status = 'active' and auth.uid() in (c.user_a, c.user_b)
  )
$$;

-- True when the signed-in user has ever been in a conversation with this person.
-- Takes text so storage policies can pass a folder name safely.
create function public.shares_conversation(other text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations c
    where (c.user_a = auth.uid() and c.user_b::text = other)
       or (c.user_b = auth.uid() and c.user_a::text = other)
  )
$$;

create function public.active_count(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from conversations
  where status = 'active' and (user_a = uid or user_b = uid)
$$;

-- Age rule: allowed gap = base + per_year * (younger age - 18).
create function public.ages_compatible(age1 int, age2 int) returns boolean
language sql stable security definer set search_path = public as $$
  select abs(age1 - age2) <= s.age_gap_base + s.age_gap_per_year * (least(age1, age2) - 18)
  from app_settings s
$$;

-- Can these two people be paired? (Alpha rules: same city, each fits what the
-- other is looking for, age rule, neither paused, never paired before, has a photo.)
create function public.pair_eligible(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from profiles pa, profiles pb
    where pa.id = a and pb.id = b and a <> b
      and pa.city = pb.city
      and pb.gender = any (pa.seeking) and pa.gender = any (pb.seeking)
      and not pa.paused and not pb.paused
      and ages_compatible(years_old(pa.birthdate), years_old(pb.birthdate))
      and exists (select 1 from photos where user_id = a)
      and exists (select 1 from photos where user_id = b)
      and not exists (
        select 1 from conversations c
        where c.user_a = least(a, b) and c.user_b = greatest(a, b)
      )
  )
$$;

create function public.check_profile_age() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s app_settings;
  a int;
begin
  select * into s from app_settings;
  a := years_old(new.birthdate);
  if a < s.min_age or a > s.max_age then
    raise exception 'Connections is open to people aged % to % right now.', s.min_age, s.max_age;
  end if;
  new.city := s.city;
  return new;
end $$;
create trigger profiles_check_age before insert on public.profiles
  for each row execute function public.check_profile_age();

create function public.check_photo_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from photos where user_id = new.user_id)
     >= (select max_photos from app_settings) then
    raise exception 'You can add up to % photos.', (select max_photos from app_settings);
  end if;
  return new;
end $$;
create trigger photos_limit before insert on public.photos
  for each row execute function public.check_photo_limit();

-- ---------------------------------------------------------------------------
-- Matching
-- ---------------------------------------------------------------------------

-- Try to pair one waiting user. Returns the new conversation id, or null.
-- First looks for someone else who is also waiting; if allowed, falls back to
-- overflow: someone full who has turned on "open to more connections".
create function public.try_match(p_user uuid, p_allow_overflow boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s app_settings;
  my_req bigint;
  other uuid;
  other_req bigint;
  conv uuid;
  is_overflow boolean := false;
begin
  select * into s from app_settings;

  -- Lock my own open request so two pairings can't both use it.
  select id into my_req from match_requests
  where user_id = p_user and matched_at is null and cancelled_at is null
  for update;
  if my_req is null then return null; end if;

  if active_count(p_user) >= s.max_slots then return null; end if;

  select r.user_id, r.id into other, other_req
  from match_requests r
  where r.matched_at is null and r.cancelled_at is null
    and r.user_id <> p_user
    and active_count(r.user_id) < s.max_slots
    and pair_eligible(p_user, r.user_id)
  order by random()
  limit 1
  for update of r skip locked;

  if other is null and p_allow_overflow then
    select p.id into other
    from profiles p
    where p.open_to_more and p.id <> p_user
      and active_count(p.id) >= s.max_slots
      and active_count(p.id) < s.overflow_cap
      and pair_eligible(p_user, p.id)
    order by random()
    limit 1;
    is_overflow := other is not null;
  end if;

  if other is null then return null; end if;

  insert into conversations (user_a, user_b, overflow_for)
  values (least(p_user, other), greatest(p_user, other), case when is_overflow then other end)
  returning id into conv;

  update match_requests set matched_at = now(), conversation_id = conv
  where id = my_req or id = other_req;

  return conv;
end $$;

-- The "+" bar. Opens a request (if none is open) and tries to pair right away.
create function public.request_match() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  s app_settings;
begin
  select * into me from profiles where id = auth.uid();
  if not found then raise exception 'Finish setting up your profile first.'; end if;
  if not exists (select 1 from photos where user_id = me.id) then
    raise exception 'Add a photo first.';
  end if;
  if me.paused then raise exception 'Matching is paused. Turn it back on in Settings.'; end if;
  select * into s from app_settings;
  if active_count(me.id) >= s.max_slots then
    raise exception 'All % of your slots are full. End a conversation to meet someone new.', s.max_slots;
  end if;

  insert into match_requests (user_id) values (me.id)
  on conflict (user_id) where matched_at is null and cancelled_at is null do nothing;

  return try_match(me.id, false);
end $$;

create function public.cancel_match_request() returns void
language sql security definer set search_path = public as $$
  update match_requests set cancelled_at = now()
  where user_id = auth.uid() and matched_at is null and cancelled_at is null
$$;

-- Run on a schedule: retry everyone waiting, oldest first. People who have
-- waited longer than overflow_after may be paired as someone's 4th or 5th.
create function public.match_waiting() returns int
language plpgsql security definer set search_path = public as $$
declare
  s app_settings;
  r record;
  made int := 0;
begin
  select * into s from app_settings;
  for r in
    select user_id, created_at from match_requests
    where matched_at is null and cancelled_at is null
    order by created_at
  loop
    if try_match(r.user_id, r.created_at < now() - s.overflow_after) is not null then
      made := made + 1;
    end if;
  end loop;
  return made;
end $$;

-- Pausing also withdraws an open "+" request.
create function public.cancel_request_on_pause() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.paused and not old.paused then
    update match_requests set cancelled_at = now()
    where user_id = new.id and matched_at is null and cancelled_at is null;
  end if;
  return new;
end $$;
create trigger profiles_pause after update of paused on public.profiles
  for each row execute function public.cancel_request_on_pause();

-- ---------------------------------------------------------------------------
-- Ending a conversation
-- ---------------------------------------------------------------------------

-- "They ghosted" is allowed once the other person hasn't replied for ghost_after.
create function public.can_claim_ghosted(conv uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  c conversations;
  me uuid := auth.uid();
  other uuid;
  last_other timestamptz;
  waiting_since timestamptz;
begin
  select * into c from conversations where id = conv;
  if not found or me not in (c.user_a, c.user_b) or c.status <> 'active' then return false; end if;
  other := case when c.user_a = me then c.user_b else c.user_a end;

  select max(created_at) into last_other from messages
  where conversation_id = conv and sender_id = other;

  -- My first message they haven't answered.
  select min(created_at) into waiting_since from messages
  where conversation_id = conv and sender_id = me
    and created_at > coalesce(last_other, '-infinity'::timestamptz);

  if waiting_since is null then
    if last_other is not null then return false; end if; -- they spoke last
    waiting_since := c.created_at;                       -- nobody has said anything
  end if;

  return waiting_since < now() - (select ghost_after from app_settings);
end $$;

create function public.end_conversation(conv uuid, reason text, thumbs text, tags text[] default '{}')
returns void
language plpgsql security definer set search_path = public as $$
declare
  c conversations;
begin
  select * into c from conversations where id = conv for update;
  if not found or auth.uid() not in (c.user_a, c.user_b) then raise exception 'Conversation not found.'; end if;
  if c.status <> 'active' then raise exception 'This conversation has already ended.'; end if;
  if reason not in ('ended', 'ghosted') then raise exception 'Unknown reason.'; end if;
  if reason = 'ghosted' then
    if not can_claim_ghosted(conv) then
      raise exception 'You can mark this as ghosted after 2 days without a reply.';
    end if;
    tags := array(select distinct unnest(tags || array['ghosted']));
  end if;

  update conversations
  set status = 'ended', ended_at = now(), ended_by = auth.uid(), end_reason = reason
  where id = conv;

  insert into ratings (conversation_id, rater_id, thumbs, tags)
  values (conv, auth.uid(), thumbs, coalesce(tags, '{}'))
  on conflict (conversation_id, rater_id) do update set thumbs = excluded.thumbs, tags = excluded.tags;
end $$;

-- The other person rates after a conversation has ended.
create function public.rate_conversation(conv uuid, thumbs text, tags text[] default '{}')
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from conversations c
    where c.id = conv and auth.uid() in (c.user_a, c.user_b) and c.status <> 'active'
  ) then
    raise exception 'You can rate a conversation once it has ended.';
  end if;
  insert into ratings (conversation_id, rater_id, thumbs, tags)
  values (conv, auth.uid(), thumbs, coalesce(tags, '{}'))
  on conflict (conversation_id, rater_id) do update set thumbs = excluded.thumbs, tags = excluded.tags;
end $$;

-- Close an ended conversation for good (hides it from your home screen).
create function public.close_conversation(conv uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update conversations
  set closed_a = closed_a or (user_a = auth.uid()),
      closed_b = closed_b or (user_b = auth.uid())
  where id = conv and status <> 'active' and auth.uid() in (user_a, user_b);
end $$;

-- "We took it off the app". Both people press it; the second press archives it.
create function public.mark_off_app(conv uuid, value boolean default true) returns text
language plpgsql security definer set search_path = public as $$
declare
  c conversations;
begin
  select * into c from conversations where id = conv for update;
  if not found or auth.uid() not in (c.user_a, c.user_b) then raise exception 'Conversation not found.'; end if;
  if c.status <> 'active' then raise exception 'This conversation has already ended.'; end if;

  update conversations
  set off_app_a = case when user_a = auth.uid() then value else off_app_a end,
      off_app_b = case when user_b = auth.uid() then value else off_app_b end
  where id = conv
  returning * into c;

  if c.off_app_a and c.off_app_b then
    update conversations
    set status = 'off_app', ended_at = now(), end_reason = 'off_app'
    where id = conv;
    return 'off_app';
  end if;
  return 'waiting';
end $$;

-- Report: saves a copy of the messages for support, then ends the conversation.
create function public.report_conversation(conv uuid, details text) returns void
language plpgsql security definer set search_path = public as $$
declare
  c conversations;
  other uuid;
begin
  select * into c from conversations where id = conv for update;
  if not found or auth.uid() not in (c.user_a, c.user_b) then raise exception 'Conversation not found.'; end if;
  other := case when c.user_a = auth.uid() then c.user_b else c.user_a end;

  insert into reports (conversation_id, reporter_id, reported_id, details, messages_snapshot)
  values (
    conv, auth.uid(), other, details,
    coalesce((
      select jsonb_agg(jsonb_build_object('sender_id', m.sender_id, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
      from messages m where m.conversation_id = conv
    ), '[]'::jsonb)
  );

  if c.status = 'active' then
    update conversations
    set status = 'ended', ended_at = now(), ended_by = auth.uid(), end_reason = 'reported'
    where id = conv;
  end if;

  insert into ratings (conversation_id, rater_id, thumbs, tags)
  values (conv, auth.uid(), 'down', array['report'])
  on conflict (conversation_id, rater_id)
  do update set thumbs = 'down', tags = array(select distinct unnest(ratings.tags || array['report']));
end $$;

-- Delete messages from ended conversations after the retention window, unless
-- the conversation has an open report. Archived (off the app) ones are kept.
create function public.purge_old_messages() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  delete from messages m
  using conversations c
  where m.conversation_id = c.id
    and c.status = 'ended'
    and c.ended_at < now() - (select message_retention from app_settings)
    and not exists (select 1 from reports r where r.conversation_id = c.id and r.status = 'open');
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Email notifications: calls the app's /api/notify when people are paired or
-- a conversation ends. Does nothing until app_settings.notify_url is set.
-- ---------------------------------------------------------------------------
create function public.notify_conversation_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s app_settings;
  evt text;
begin
  select * into s from app_settings;
  if s.notify_url is null then return new; end if;
  if tg_op = 'INSERT' then
    evt := 'paired';
  elsif new.status <> old.status then
    evt := new.status; -- 'ended' or 'off_app'
  else
    return new;
  end if;
  perform net.http_post(
    url := s.notify_url,
    body := jsonb_build_object('event', evt, 'conversation_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', coalesce(s.notify_secret, ''))
  );
  return new;
end $$;
create trigger conversations_notify after insert or update of status on public.conversations
  for each row execute function public.notify_conversation_event();

-- ---------------------------------------------------------------------------
-- Row level security: who can read and write what
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.photos enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.match_requests enable row level security;
alter table public.ratings enable row level security;
alter table public.notes enable row level security;
alter table public.reports enable row level security;

-- Nothing for signed-out visitors.
revoke all on all tables in schema public from anon;
-- Signed-in users only get the columns and actions granted below; everything
-- else goes through the functions above.
revoke insert, update, delete on all tables in schema public from authenticated;

create policy "see yourself and people you've talked to" on public.profiles
  for select to authenticated using (id = auth.uid() or shares_conversation(id::text));
create policy "create your own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "edit your own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
grant insert (id, name, birthdate, height_cm, gender, seeking) on public.profiles to authenticated;
grant update (name, height_cm, gender, seeking, open_to_more, paused) on public.profiles to authenticated;

create policy "see your photos and those of people you've talked to" on public.photos
  for select to authenticated using (user_id = auth.uid() or shares_conversation(user_id::text));
create policy "add your own photos" on public.photos
  for insert to authenticated with check (user_id = auth.uid());
create policy "reorder your own photos" on public.photos
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "remove your own photos" on public.photos
  for delete to authenticated using (user_id = auth.uid());
grant insert (user_id, path, position) on public.photos to authenticated;
grant update (position) on public.photos to authenticated;
grant delete on public.photos to authenticated;

create policy "see your conversations" on public.conversations
  for select to authenticated using (auth.uid() in (user_a, user_b));

create policy "read messages in your conversations" on public.messages
  for select to authenticated using (is_member(conversation_id));
create policy "send messages in your active conversations" on public.messages
  for insert to authenticated with check (sender_id = auth.uid() and is_active_member(conversation_id));
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;

create policy "see your own requests" on public.match_requests
  for select to authenticated using (user_id = auth.uid());

create policy "see your own ratings" on public.ratings
  for select to authenticated using (rater_id = auth.uid());

create policy "your private notes" on public.notes
  for all to authenticated
  using (user_id = auth.uid() and is_member(conversation_id))
  with check (user_id = auth.uid() and is_member(conversation_id));
grant insert (conversation_id, user_id, body, updated_at) on public.notes to authenticated;
-- Saving uses an upsert, which updates every column it sends; the policy above
-- still stops anyone writing to someone else's notes or conversation.
grant update (conversation_id, user_id, body, updated_at) on public.notes to authenticated;

-- reports: no policies, so only admins can read them.

-- Functions: internal ones are not callable from the app.
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.try_match(uuid, boolean) from authenticated;
revoke execute on function public.match_waiting() from authenticated;
revoke execute on function public.purge_old_messages() from authenticated;
revoke execute on function public.notify_conversation_event() from authenticated;
revoke execute on function public.pair_eligible(uuid, uuid) from authenticated;
revoke execute on function public.active_count(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Live updates for chat and the home screen
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages, public.conversations, public.match_requests;

-- ---------------------------------------------------------------------------
-- Photo storage: a private bucket, one folder per user.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

create policy "upload to your own photo folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "view your photos and those of people you've talked to" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and ((storage.foldername(name))[1] = auth.uid()::text
         or public.shares_conversation((storage.foldername(name))[1]))
  );
create policy "delete your own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------
select cron.schedule('match-waiting', '*/10 * * * *', 'select public.match_waiting()');
select cron.schedule('purge-old-messages', '15 3 * * *', 'select public.purge_old_messages()');
