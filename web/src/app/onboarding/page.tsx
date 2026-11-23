"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, ErrorNote, Logo, Screen, Spinner } from "@/components/ui";
import { useMe, usePublicSettings } from "@/lib/hooks";
import { MAX_PHOTOS, uploadPhoto } from "@/lib/photos";
import { errorText, supabase } from "@/lib/supabase";
import { GENDER_LABELS, SEEKING_LABELS, type Gender } from "@/lib/types";

const GENDERS: Gender[] = ["man", "woman", "other"];

export default function Onboarding() {
  const router = useRouter();
  const { me, user, loading } = useMe({ requireProfile: false });
  const settings = usePublicSettings();

  const [name, setName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [feet, setFeet] = useState(5);
  const [inches, setInches] = useState(7);
  const [gender, setGender] = useState<Gender | null>(null);
  const [seeking, setSeeking] = useState<Gender[]>([]);
  const [adult, setAdult] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const hasProfile = !!me?.profile;

  // Someone who already finished onboarding goes straight home.
  useEffect(() => {
    if (me?.profile && me.photos.length) router.replace("/");
  }, [me, router]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  if (loading || !user) return <Spinner />;

  const profileReady = hasProfile || (name.trim() && birthdate && gender && seeking.length && adult);
  const ready = profileReady && files.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !ready) return;
    setBusy(true);
    setError("");
    try {
      if (!hasProfile) {
        const { error } = await supabase()
          .from("profiles")
          .insert({
            id: user.id,
            name: name.trim(),
            birthdate,
            height_cm: Math.round((feet * 12 + inches) * 2.54),
            gender,
            seeking,
          });
        if (error) throw error;
      }
      for (let i = 0; i < files.length; i++) {
        await uploadPhoto(user.id, files[i], i);
      }
      router.replace("/");
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const field = "h-12 rounded-2xl border border-line bg-white px-4 text-[16px] outline-none focus:border-brand";

  return (
    <Screen className="gap-7 py-6">
      <Logo />
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-extrabold">{hasProfile ? "Add your photos" : "Set up your profile"}</h1>
        <p className="text-[15.5px] leading-relaxed text-muted">
          {hasProfile
            ? "You need at least one photo before you can be paired."
            : "Just the basics. The people you talk to see your name, age, height and first photo."}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-6">
        {!hasProfile && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">First name</span>
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" required />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Birthday</span>
              <input type="date" className={field} value={birthdate} onChange={(e) => setBirthdate(e.target.value)} required />
              <span className="text-[13px] text-muted">The alpha is open to ages 18 to 35. You can&apos;t change this later.</span>
            </label>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-semibold">Height</legend>
              <div className="flex gap-3">
                <label className="flex flex-1 items-center gap-2">
                  <select className={`${field} flex-1`} value={feet} onChange={(e) => setFeet(Number(e.target.value))} aria-label="Feet">
                    {[4, 5, 6, 7].map((f) => (
                      <option key={f} value={f}>{f} ft</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-1 items-center gap-2">
                  <select className={`${field} flex-1`} value={inches} onChange={(e) => setInches(Number(e.target.value))} aria-label="Inches">
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i}>{i} in</option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">I am a</legend>
              <div className="flex flex-wrap gap-2">
                {GENDERS.map((g) => (
                  <Chip key={g} selected={gender === g} onClick={() => setGender(g)}>
                    {GENDER_LABELS[g]}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">I&apos;d like to meet</legend>
              <div className="flex flex-wrap gap-2">
                {GENDERS.map((g) => (
                  <Chip
                    key={g}
                    selected={seeking.includes(g)}
                    onClick={() => setSeeking((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]))}
                  >
                    {SEEKING_LABELS[g]}
                  </Chip>
                ))}
              </div>
              <span className="text-[13px] text-muted">
                {settings?.match_everyone
                  ? "Pick as many as you like. During the pre-alpha, anyone can be paired with anyone while we work on how conversations feel."
                  : "Pick as many as you like."}
              </span>
            </fieldset>
          </>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Photos</legend>
          <div className="grid grid-cols-3 gap-2">
            {previews.map((src, i) => (
              <div key={src} className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-brand-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
                  className="absolute top-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
                {i === 0 && (
                  <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-brand-strong">First</span>
                )}
              </div>
            ))}
            {files.length < MAX_PHOTOS && (
              <label className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-[1.5px] border-dashed border-[oklch(0.82_0.05_300)] text-brand-strong hover:bg-lav">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span className="text-[13px] font-semibold">Add</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    setFiles((f) => [...f, ...picked].slice(0, MAX_PHOTOS));
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          <span className="text-[13px] text-muted">
            At least one, up to {MAX_PHOTOS}. In the alpha people see your first photo.
          </span>
        </fieldset>

        {!hasProfile && (
          <label className="flex items-start gap-3 text-[14.5px] leading-snug">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[oklch(0.55_0.19_300)]" />
            I confirm I&apos;m 18 or older.
          </label>
        )}

        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" disabled={!ready || busy}>
          {busy ? "Saving…" : "Continue"}
        </Button>
      </form>
    </Screen>
  );
}
