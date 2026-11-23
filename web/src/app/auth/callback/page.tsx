"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote, Screen, Spinner } from "@/components/ui";
import { errorText, supabase } from "@/lib/supabase";

// The sign-in link lands here. The Supabase client reads the code from the URL
// and stores the session; then we send people on to the app.
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const sb = supabase();
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get("error_description");
    if (urlError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(urlError);
      return;
    }
    // Links made by the invite script (no email sent) put the session in the URL
    // fragment instead of a code.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    if (access_token && refresh_token) {
      sb.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
        window.history.replaceState(null, "", window.location.pathname);
        if (error) setError(errorText(error));
        else router.replace("/");
      });
      return;
    }
    const hashError = hash.get("error_description");
    if (hashError) {
      setError(hashError);
      return;
    }

    sb.auth.getSession().then(async ({ data, error }) => {
      if (data.session) return router.replace("/");
      const code = params.get("code");
      if (code) {
        const res = await sb.auth.exchangeCodeForSession(code);
        if (!res.error) return router.replace("/");
        setError(errorText(res.error));
        return;
      }
      setError(errorText(error) || "This sign-in link has expired. Ask for a new one.");
    });
  }, [router]);

  return (
    <Screen className="justify-center gap-4 py-10">
      {error ? (
        <>
          <ErrorNote>{error}</ErrorNote>
          <Button onClick={() => router.replace("/login")}>Back to sign in</Button>
        </>
      ) : (
        <Spinner label="Signing you in" />
      )}
    </Screen>
  );
}
