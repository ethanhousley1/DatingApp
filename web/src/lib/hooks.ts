"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Photo, Profile } from "./types";

export type Me = {
  user: User;
  profile: Profile;
  photos: Photo[];
};

// Loads the signed-in user, their profile and photos. Sends people who aren't
// signed in to /login, and people without a finished profile to /onboarding.
export function useMe(options: { requireProfile?: boolean } = { requireProfile: true }) {
  const router = useRouter();
  const requireProfile = options.requireProfile ?? true;
  const [me, setMe] = useState<Me | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const sb = supabase();
    const { data } = await sb.auth.getUser();
    if (!data.user) {
      router.replace("/login");
      return;
    }
    setUser(data.user);
    const [{ data: profile }, { data: photos }] = await Promise.all([
      sb.from("profiles").select("*").eq("id", data.user.id).maybeSingle(),
      sb.from("photos").select("*").eq("user_id", data.user.id).order("position"),
    ]);
    if (requireProfile && (!profile || !photos?.length)) {
      router.replace("/onboarding");
      return;
    }
    setMe(profile ? { user: data.user, profile, photos: photos ?? [] } : null);
    setLoading(false);
  }, [router, requireProfile]);

  useEffect(() => {
    // Runs once on mount; load() only sets state after its awaits resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { me, user, loading, reload: load };
}

export type PublicSettings = { max_slots: number; match_everyone: boolean };
let settingsPromise: Promise<PublicSettings> | null = null;

// Settings the screens need (slot count, pre-alpha "anyone with anyone" mode).
export function usePublicSettings() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  useEffect(() => {
    settingsPromise ??= Promise.resolve(supabase().rpc("public_settings")).then(
      ({ data }) => (data as PublicSettings) ?? { max_slots: 3, match_everyone: false },
    );
    let cancelled = false;
    settingsPromise.then((s) => !cancelled && setSettings(s));
    return () => {
      cancelled = true;
    };
  }, []);
  return settings;
}

const urlCache = new Map<string, { url: string; expires: number }>();

// Signed, short-lived links for private photos.
export function usePhotoUrl(path: string | null | undefined) {
  const cached = path ? urlCache.get(path) : undefined;
  // A cached link is shown right away; the effect below replaces it if it has expired.
  const [url, setUrl] = useState<string | null>(cached ? cached.url : null);

  useEffect(() => {
    if (!path) return;
    const hit = urlCache.get(path);
    if (hit && hit.expires > Date.now()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl(hit.url);
      return;
    }
    let cancelled = false;
    supabase()
      .storage.from("photos")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!data?.signedUrl || cancelled) return;
        urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
        setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return url;
}
