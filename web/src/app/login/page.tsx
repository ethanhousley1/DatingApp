"use client";

import { useState } from "react";
import { Button, ErrorNote, Logo, Screen } from "@/components/ui";
import { errorText, supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      // Invite-only: never create an account from this page.
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false },
    });
    setBusy(false);
    if (!error) return setSent(true);
    const notInvited = error.code === "otp_disabled" || /signups not allowed/i.test(error.message);
    // Until an email service is set up, Supabase only emails its own team.
    const cantEmail = /not authori[sz]ed/i.test(error.message);
    setError(
      notInvited
        ? "Connections is invite-only right now, and this email isn't on the list. Check for typos, or join the waitlist."
        : cantEmail
          ? "We can't email sign-in links yet. Ask the person who invited you for a link."
          : errorText(error),
    );
  }

  return (
    <Screen className="justify-center gap-8 py-10">
      <Logo />
      {sent ? (
        <div className="flex flex-col gap-3">
          <h1 className="text-[28px] leading-tight font-extrabold">Check your email</h1>
          <p className="text-[15.5px] leading-relaxed text-muted">
            We sent a sign-in link to <strong className="text-ink">{email}</strong>. Open it on this device to continue.
          </p>
          <Button variant="ghost" className="self-start px-0" onClick={() => setSent(false)}>
            Use a different email
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] leading-tight font-extrabold">Three conversations at a time.</h1>
            <p className="text-[15.5px] leading-relaxed text-muted">
              Invite-only for now. Sign in with the email you were invited with, and we&apos;ll send you a link.
            </p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-2xl border border-line px-4 text-[16px] outline-none focus:border-brand"
              placeholder="you@example.com"
            />
          </label>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" disabled={busy || !email}>
            {busy ? "Sending…" : "Send me a sign-in link"}
          </Button>
        </form>
      )}
    </Screen>
  );
}
