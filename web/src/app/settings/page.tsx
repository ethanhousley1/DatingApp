"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, Button, ErrorNote, Screen, Spinner, Toggle } from "@/components/ui";
import { useMe } from "@/lib/hooks";
import { deletePhoto, MAX_PHOTOS, uploadPhoto } from "@/lib/photos";
import { errorText, supabase } from "@/lib/supabase";
import { age, height } from "@/lib/types";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com";

export default function Settings() {
  const router = useRouter();
  const { me, loading, reload } = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (loading || !me) return <Spinner />;
  const { profile, photos } = me;

  async function setFlag(field: "open_to_more" | "paused", value: boolean) {
    setError("");
    const { error } = await supabase().from("profiles").update({ [field]: value }).eq("id", profile.id);
    if (error) setError(errorText(error));
    reload();
  }

  async function addPhotos(files: File[]) {
    setBusy(true);
    setError("");
    try {
      let pos = photos.length ? Math.max(...photos.map((p) => p.position)) + 1 : 0;
      for (const f of files.slice(0, MAX_PHOTOS - photos.length)) await uploadPhoto(profile.id, f, pos++);
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
    reload();
  }

  async function removePhoto(id: string, path: string) {
    if (photos.length <= 1) return setError("You need at least one photo.");
    setBusy(true);
    try {
      await deletePhoto(id, path);
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
    reload();
  }

  async function signOut() {
    await supabase().auth.signOut();
    router.replace("/login");
  }

  return (
    <Screen className="gap-6 py-4">
      <header className="flex items-center gap-2">
        <Link href="/" aria-label="Back to your conversations" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-lav">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-[22px] font-extrabold">You</h1>
      </header>

      <section className="flex flex-col gap-3">
        <p className="text-[17px] font-bold">
          {profile.name} <span className="font-semibold text-muted">· {age(profile.birthdate)} · {height(profile.height_cm)}</span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <div key={p.id} className="relative">
              <Avatar path={p.path} size={112} label={`Your photo ${i + 1}`} />
              <button
                onClick={() => removePhoto(p.id, p.path)}
                disabled={busy}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute top-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/90"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-[1.5px] border-dashed border-[oklch(0.82_0.05_300)] text-brand-strong hover:bg-lav">
              <span className="text-[22px] leading-none" aria-hidden="true">+</span>
              <span className="text-[13px] font-semibold">{busy ? "Uploading…" : "Add photo"}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  addPhotos(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        <p className="text-[13px] text-muted">People you talk to see your first photo.</p>
      </section>

      <section className="flex flex-col divide-y divide-line rounded-[22px] border border-line px-4">
        <Toggle
          checked={profile.open_to_more}
          onChange={(v) => setFlag("open_to_more", v)}
          label="I'm open to more connections"
          hint="When your 3 slots are full, someone who's been waiting a while can still be paired with you."
        />
        <Toggle
          checked={profile.paused}
          onChange={(v) => setFlag("paused", v)}
          label="Pause matching"
          hint="Nobody new is paired with you. Your current conversations stay."
        />
      </section>

      <ErrorNote>{error}</ErrorNote>

      <section className="flex flex-col gap-2">
        <a href={`mailto:${SUPPORT_EMAIL}`} className="rounded-2xl px-1 py-2 text-[15px] font-semibold text-brand-strong hover:underline">
          Contact us
        </a>
        <Button variant="secondary" onClick={signOut}>
          Sign out
        </Button>
      </section>
    </Screen>
  );
}
