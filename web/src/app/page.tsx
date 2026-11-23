"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar, Button, ErrorNote, Logo, Screen, Spinner, Toggle } from "@/components/ui";
import { useMe, usePublicSettings } from "@/lib/hooks";
import { errorText, supabase } from "@/lib/supabase";
import { age, height, partnerId, timeAgo, type Conversation, type MatchRequest, type Message } from "@/lib/types";

type Partner = { id: string; name: string; birthdate: string; height_cm: number; photo: string | null };
type Card = { conv: Conversation; partner: Partner | null; last: Message | null };

export default function Home() {
  const { me, loading, reload } = useMe();
  const settings = usePublicSettings();
  const [cards, setCards] = useState<Card[]>([]);
  const [ended, setEnded] = useState<Card[]>([]);
  const [request, setRequest] = useState<MatchRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [justPaired, setJustPaired] = useState(false);

  const myId = me?.user.id;

  const load = useCallback(async () => {
    if (!myId) return;
    const sb = supabase();
    const [{ data: convs }, { data: reqs }] = await Promise.all([
      sb.from("conversations").select("*").order("created_at", { ascending: false }),
      sb.from("match_requests").select("*").is("matched_at", null).is("cancelled_at", null),
    ]);
    const all = (convs ?? []) as Conversation[];
    const visible = all.filter(
      (c) => c.status === "active" || !(c.user_a === myId ? c.closed_a : c.closed_b),
    );
    const ids = [...new Set(visible.map((c) => partnerId(c, myId)))];
    const [{ data: profiles }, { data: photos }, lasts] = await Promise.all([
      ids.length
        ? sb.from("profiles").select("id,name,birthdate,height_cm").in("id", ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? sb.from("photos").select("user_id,path,position").in("user_id", ids).order("position")
        : Promise.resolve({ data: [] }),
      Promise.all(
        visible
          .filter((c) => c.status === "active")
          .map((c) =>
            sb
              .from("messages")
              .select("*")
              .eq("conversation_id", c.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
              .then(({ data }) => [c.id, data as Message | null] as const),
          ),
      ),
    ]);
    const lastBy = new Map(lasts);
    const partners = new Map<string, Partner>();
    for (const p of profiles ?? []) {
      const photo = (photos ?? []).find((ph) => ph.user_id === p.id)?.path ?? null;
      partners.set(p.id, { ...p, photo });
    }
    const toCard = (c: Conversation): Card => ({
      conv: c,
      partner: partners.get(partnerId(c, myId)) ?? null,
      last: lastBy.get(c.id) ?? null,
    });
    const active = visible.filter((c) => c.status === "active").map(toCard);
    active.sort((a, b) => {
      const ta = new Date(a.last?.created_at ?? a.conv.created_at).getTime();
      const tb = new Date(b.last?.created_at ?? b.conv.created_at).getTime();
      return tb - ta;
    });
    setCards(active);
    setEnded(visible.filter((c) => c.status !== "active").map(toCard));
    setRequest((reqs?.[0] as MatchRequest) ?? null);
    setLoaded(true);
  }, [myId]);

  useEffect(() => {
    if (!myId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const channel = supabase()
      .channel(`home-${myId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "match_requests" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => load())
      .subscribe();
    return () => {
      supabase().removeChannel(channel);
    };
  }, [myId, load]);

  if (loading || !me || !loaded || !settings) return <Spinner />;

  const MAX_SLOTS = settings.max_slots;
  const profile = me.profile;
  const activeCount = cards.length;
  const full = activeCount >= MAX_SLOTS;

  async function findSomeone() {
    setBusy(true);
    setError("");
    setJustPaired(false);
    const { data, error } = await supabase().rpc("request_match");
    setBusy(false);
    if (error) setError(errorText(error));
    else if (data) setJustPaired(true);
    load();
  }

  async function stopLooking() {
    setBusy(true);
    await supabase().rpc("cancel_match_request");
    setBusy(false);
    load();
  }

  async function setFlag(field: "open_to_more" | "paused", value: boolean) {
    setError("");
    const { error } = await supabase().from("profiles").update({ [field]: value }).eq("id", me!.user.id);
    if (error) setError(errorText(error));
    await reload();
    load();
  }

  return (
    <Screen className="gap-6 py-4">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/settings" aria-label="Settings" className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-lav">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
        </Link>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="yours">
        <div className="flex items-baseline justify-between">
          <h1 id="yours" className="text-[24px] font-extrabold">Your conversations</h1>
          <span className="text-[13.5px] font-semibold text-muted">
            {activeCount} of {MAX_SLOTS}
          </span>
        </div>

        {justPaired && (
          <p role="status" className="rounded-2xl bg-brand-soft px-4 py-3 text-[14.5px] font-semibold text-brand-strong">
            You&apos;ve been paired. Say hi.
          </p>
        )}

        {cards.length === 0 && (
          <p className="rounded-2xl bg-lav px-4 py-5 text-[15px] leading-relaxed text-muted">
            No conversations yet. Press <strong className="text-ink">Find someone new</strong> and we&apos;ll pair you with someone.
            {settings.match_everyone && " During the pre-alpha, anyone can be paired with anyone."}
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {cards.map(({ conv, partner, last }) => {
            const mineOffApp = conv.user_a === me.user.id ? conv.off_app_a : conv.off_app_b;
            const theirsOffApp = conv.user_a === me.user.id ? conv.off_app_b : conv.off_app_a;
            return (
              <li key={conv.id}>
                <Link
                  href={`/c/${conv.id}`}
                  className="flex items-center gap-3.5 rounded-[22px] border border-line bg-white p-3 transition-colors hover:bg-lav"
                >
                  <Avatar path={partner?.photo} size={64} label={partner?.name ?? "Their photo"} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[16.5px] font-bold">
                        {partner?.name ?? "Someone"}
                        {partner && (
                          <span className="font-semibold text-muted">
                            {" "}
                            · {age(partner.birthdate)} · {height(partner.height_cm)}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[12.5px] text-muted">{timeAgo(last?.created_at ?? conv.created_at)}</span>
                    </div>
                    <p className="truncate text-[14.5px] text-muted">
                      {last ? (last.sender_id === me.user.id ? `You: ${last.body}` : last.body) : "You were just paired. Say hi."}
                    </p>
                    {(theirsOffApp || mineOffApp || conv.overflow_for === me.user.id) && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {theirsOffApp && !mineOffApp && (
                          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[12px] font-bold text-brand-strong">
                            Says you took it off the app
                          </span>
                        )}
                        {mineOffApp && !theirsOffApp && (
                          <span className="rounded-full bg-lav-2 px-2.5 py-0.5 text-[12px] font-bold text-muted">Waiting on off-the-app</span>
                        )}
                        {conv.overflow_for === me.user.id && (
                          <span className="rounded-full bg-lav-2 px-2.5 py-0.5 text-[12px] font-bold text-muted">Extra connection</span>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* The "+" bar */}
        {profile.paused ? (
          <div className="flex flex-col gap-3 rounded-[22px] bg-lav p-4">
            <p className="text-[15px] leading-relaxed">
              <strong>Matching is paused.</strong> <span className="text-muted">Nobody new will be paired with you.</span>
            </p>
            <Button variant="secondary" onClick={() => setFlag("paused", false)}>
              Turn matching back on
            </Button>
          </div>
        ) : request ? (
          <div className="flex items-center gap-3 rounded-[22px] border-[1.5px] border-dashed border-[oklch(0.82_0.05_300)] p-4">
            <span className="relative flex h-3 w-3 shrink-0" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-brand" />
            </span>
            <div className="flex flex-1 flex-col">
              <span className="text-[15px] font-bold">Looking for someone…</span>
              <span className="text-[13.5px] text-muted">We&apos;ll email you when you&apos;re paired.</span>
            </div>
            <Button variant="ghost" onClick={stopLooking} disabled={busy}>
              Stop
            </Button>
          </div>
        ) : full ? (
          <div className="flex flex-col gap-1 rounded-[22px] bg-lav px-4 pt-3 pb-1">
            <p className="text-[14.5px] leading-relaxed text-muted">
              All {MAX_SLOTS} slots are full. End a conversation to find someone new.
            </p>
            <Toggle
              checked={profile.open_to_more}
              onChange={(v) => setFlag("open_to_more", v)}
              label="I'm open to more connections"
              hint="Someone who's been waiting a while can be paired with you as an extra."
            />
          </div>
        ) : (
          <button
            onClick={findSomeone}
            disabled={busy}
            className="flex min-h-16 items-center justify-center gap-2.5 rounded-[22px] border-[1.5px] border-dashed border-[oklch(0.75_0.09_300)] text-[16px] font-bold text-brand-strong transition-colors hover:bg-lav disabled:opacity-60"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {busy ? "Looking…" : "Find someone new"}
          </button>
        )}
        <ErrorNote>{error}</ErrorNote>
      </section>

      {ended.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="ended">
          <h2 id="ended" className="text-[13px] font-bold tracking-wide text-muted uppercase">
            Ended
          </h2>
          <ul className="flex flex-col gap-2">
            {ended.map(({ conv, partner }) => (
              <li key={conv.id}>
                <Link href={`/c/${conv.id}`} className="flex items-center gap-3 rounded-[18px] bg-lav p-2.5 pr-4 hover:bg-lav-2">
                  <div className="opacity-60 grayscale">
                    <Avatar path={partner?.photo} size={44} label={partner?.name ?? "Their photo"} />
                  </div>
                  <div className="flex flex-1 flex-col">
                    <span className="text-[15px] font-bold">{partner?.name ?? "Someone"}</span>
                    <span className="text-[13px] text-muted">
                      {conv.status === "off_app" ? "Taken off the app" : "This conversation ended"} · rate and close
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>
  );
}
