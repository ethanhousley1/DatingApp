-- Pre-alpha: hand-picked testers, and anyone can be paired with anyone while
-- the chat experience is worked on. Turn match_everyone off to bring back the
-- alpha rules (same city, each fits what the other is looking for, age rule).

alter table public.app_settings add column match_everyone boolean not null default true;

create or replace function public.pair_eligible(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from profiles pa, profiles pb, app_settings s
    where pa.id = a and pb.id = b and a <> b
      and not pa.paused and not pb.paused
      and exists (select 1 from photos where user_id = a)
      and exists (select 1 from photos where user_id = b)
      and not exists (
        select 1 from conversations c
        where c.user_a = least(a, b) and c.user_b = greatest(a, b)
      )
      and (
        s.match_everyone
        or (
          pa.city = pb.city
          and pb.gender = any (pa.seeking) and pa.gender = any (pb.seeking)
          and ages_compatible(years_old(pa.birthdate), years_old(pb.birthdate))
        )
      )
  )
$$;

-- The few settings the app's screens need to know about.
create function public.public_settings() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('max_slots', max_slots, 'match_everyone', match_everyone)
  from app_settings
$$;
revoke execute on function public.public_settings() from public, anon;
grant execute on function public.public_settings() to authenticated;
