-- Local development only (runs on `supabase db reset`).
-- Lets the local database call the dev server's /api/notify for emails.
update public.app_settings
set notify_url = 'http://host.docker.internal:3100/api/notify',
    notify_secret = 'local-dev-secret';
