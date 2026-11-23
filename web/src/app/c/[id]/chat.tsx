"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, Button, Chip, ErrorNote, Sheet, Spinner, ThumbsPicker } from "@/components/ui";
import { useMe } from "@/lib/hooks";
import { errorText, supabase } from "@/lib/supabase";
import { age, height, partnerId, type Conversation, type Message } from "@/lib/types";

type Partner = { id: string; name: string; birthdate: string; height_cm: number; photo: string | null };
type Panel = null | "menu" | "end" | "ghost" | "report" | "notes";

export default function Chat() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me, loading } = useMe();
  const myId = me?.user.id;

  const [conv, setConv] = useState<Conversation | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [rated, setRated] = useState(false);
  const [canGhost, setCanGhost] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const loadConv = useCallback(async () => {
    const sb = supabase();
    const { data } = await sb.from("conversations").select("*").eq("id", id).maybeSingle();
    if (!data) return setNotFound(true);
    setConv(data as Conversation);
    const { data: ghost } = await sb.rpc("can_claim_ghosted", { conv: id });
    setCanGhost(!!ghost);
  }, [id]);

  useEffect(() => {
    if (!myId) return;
    const sb = supabase();
    (async () => {
      const { data: c } = await sb.from("conversations").select("*").eq("id", id).maybeSingle();
      if (!c) return setNotFound(true);
      const other = partnerId(c as Conversation, myId);
      const [{ data: p }, { data: photo }, { data: msgs }, { data: rating }, { data: ghost }] = await Promise.all([
        sb.from("profiles").select("id,name,birthdate,height_cm").eq("id", other).maybeSingle(),
        sb.from("photos").select("path").eq("user_id", other).order("position").limit(1).maybeSingle(),
        sb.from("messages").select("*").eq("conversation_id", id).order("created_at").limit(1000),
        sb.from("ratings").select("thumbs").eq("conversation_id", id).maybeSingle(),
        sb.rpc("can_claim_ghosted", { conv: id }),
      ]);
      setConv(c as Conversation);
      setPartner(p ? { ...p, photo: photo?.path ?? null } : null);
      setMessages((msgs ?? []) as Message[]);
      setRated(!!rating);
      setCanGhost(!!ghost);
    })();

    const channel = sb
      .channel(`conv-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
          supabase().rpc("can_claim_ghosted", { conv: id }).then(({ data }) => setCanGhost(!!data));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${id}` },
        (payload) => setConv(payload.new as Conversation),
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [id, myId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (notFound) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-4 px-4">
        <p className="text-[16px]">This conversation isn&apos;t available.</p>
        <Button onClick={() => router.replace("/")}>Back home</Button>
      </main>
    );
  }
  if (loading || !me || !conv) return <Spinner />;

  const isA = conv.user_a === me.user.id;
  const mineOffApp = isA ? conv.off_app_a : conv.off_app_b;
  const theirsOffApp = isA ? conv.off_app_b : conv.off_app_a;
  const active = conv.status === "active";
  const name = partner?.name ?? "them";

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setError("");
    const { data, error } = await supabase()
      .from("messages")
      .insert({ conversation_id: id, sender_id: me!.user.id, body })
      .select()
      .single();
    if (error) {
      setError(errorText(error));
      setDraft(body);
      return;
    }
    const m = data as Message;
    setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
  }

  async function offApp(value: boolean) {
    setPanel(null);
    setError("");
    const { error } = await supabase().rpc("mark_off_app", { conv: id, value });
    if (error) setError(errorText(error));
    loadConv();
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col">
      <header className="flex items-center gap-2 border-b border-line px-2 py-2">
        <Link href="/" aria-label="Back to your conversations" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-lav">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <Avatar path={partner?.photo} size={40} label={name} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[16px] font-bold">{partner?.name ?? "Someone"}</span>
          {partner && (
            <span className="text-[12.5px] text-muted">
              {age(partner.birthdate)} · {height(partner.height_cm)}
            </span>
          )}
        </div>
        <button onClick={() => setPanel("notes")} aria-label="Your private notes" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-lav">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
        </button>
        <button onClick={() => setPanel("menu")} aria-label="Conversation options" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-lav">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M5 12h.01M12 12h.01M19 12h.01" />
          </svg>
        </button>
      </header>

      {active && theirsOffApp && !mineOffApp && (
        <div className="flex items-center gap-3 bg-brand-soft px-4 py-3">
          <p className="flex-1 text-[14px] leading-snug">
            <strong>{name}</strong> says you took it off the app. Did you?
          </p>
          <Button onClick={() => offApp(true)} className="min-h-10 px-4 text-[14px]">
            Yes, we did
          </Button>
        </div>
      )}
      {active && mineOffApp && !theirsOffApp && (
        <div className="flex items-center gap-3 bg-lav px-4 py-3">
          <p className="flex-1 text-[14px] leading-snug text-muted">
            You said you took it off the app. Waiting for {name} to confirm.
          </p>
          <Button variant="ghost" onClick={() => offApp(false)} className="min-h-10 px-3 text-[14px]">
            Undo
          </Button>
        </div>
      )}

      <ol className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-4" aria-label="Messages">
        {messages.length === 0 && (
          <li className="m-auto max-w-[260px] text-center text-[14.5px] leading-relaxed text-muted">
            You were just paired. Ask something you&apos;d actually want to know.
          </li>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === me.user.id;
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <span
                className={`max-w-[78%] rounded-[20px] px-4 py-2.5 text-[15.5px] leading-snug break-words whitespace-pre-wrap ${
                  mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-lav-2 text-ink"
                }`}
              >
                {m.body}
              </span>
            </li>
          );
        })}
        <div ref={bottom} />
      </ol>

      <div className="px-4">
        <ErrorNote>{error}</ErrorNote>
      </div>

      {active ? (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-line px-3 py-3">
          <label className="sr-only" htmlFor="draft">
            Message
          </label>
          <textarea
            id="draft"
            rows={1}
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Message ${partner?.name ?? ""}`}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-[22px] border border-line px-4 py-2.5 text-[16px] outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-40"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
      ) : (
        <EndedPanel
          conv={conv}
          myId={me.user.id}
          name={name}
          rated={rated}
          onRated={() => setRated(true)}
          onReport={() => setPanel("report")}
        />
      )}

      <Sheet open={panel === "menu"} onClose={() => setPanel(null)} title="Conversation">
        <div className="flex flex-col gap-2">
          {active && !mineOffApp && (
            <MenuItem
              title="We took it off the app"
              hint={`You both press this when you've swapped numbers or met. ${name} confirms it too.`}
              onClick={() => offApp(true)}
            />
          )}
          {active && (
            <MenuItem title="End conversation" hint="Frees up a slot. You'll rate how it went." onClick={() => setPanel("end")} />
          )}
          {active && (
            <MenuItem
              title="They ghosted"
              hint={canGhost ? `End it and let us know ${name} stopped replying.` : "Available after 2 days without a reply."}
              disabled={!canGhost}
              onClick={() => setPanel("ghost")}
            />
          )}
          <MenuItem title="Report" hint="Something wrong? Our team reviews every report." danger onClick={() => setPanel("report")} />
        </div>
      </Sheet>

      <EndSheet open={panel === "end"} onClose={() => setPanel(null)} conv={id} onDone={() => { setRated(true); setPanel(null); loadConv(); }} />
      <GhostSheet open={panel === "ghost"} onClose={() => setPanel(null)} conv={id} name={name} onDone={() => { setRated(true); setPanel(null); loadConv(); }} />
      <ReportSheet open={panel === "report"} onClose={() => setPanel(null)} conv={id} name={name} onDone={() => { setRated(true); setPanel(null); loadConv(); }} />
      <NotesSheet open={panel === "notes"} onClose={() => setPanel(null)} conv={id} myId={me.user.id} name={name} />
    </main>
  );
}

function MenuItem({ title, hint, onClick, disabled, danger }: { title: string; hint: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-start gap-0.5 rounded-2xl px-4 py-3 text-left hover:bg-lav disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className={`text-[15.5px] font-bold ${danger ? "text-danger" : ""}`}>{title}</span>
      <span className="text-[13.5px] leading-snug text-muted">{hint}</span>
    </button>
  );
}

function EndSheet({ open, onClose, conv, onDone }: { open: boolean; onClose: () => void; conv: string; onDone: () => void }) {
  const [thumbs, setThumbs] = useState<"up" | "down" | null>(null);
  const [good, setGood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (!thumbs) return;
    setBusy(true);
    const { error } = await supabase().rpc("end_conversation", {
      conv,
      reason: "ended",
      thumbs,
      tags: good ? ["especially_good"] : [],
    });
    setBusy(false);
    if (error) setError(errorText(error));
    else onDone();
  }
  return (
    <Sheet open={open} onClose={onClose} title="End this conversation?">
      <div className="flex flex-col gap-4">
        <p className="text-[14.5px] leading-relaxed text-muted">
          They&apos;ll see that it ended, and you&apos;ll never be paired again. Your rating is private.
        </p>
        <ThumbsPicker value={thumbs} onChange={setThumbs} />
        <div className="flex flex-wrap gap-2">
          <Chip selected={good} onClick={() => setGood(!good)}>
            Especially good
          </Chip>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <Button onClick={submit} disabled={!thumbs || busy}>
          {busy ? "Ending…" : "End conversation"}
        </Button>
      </div>
    </Sheet>
  );
}

function GhostSheet({ open, onClose, conv, name, onDone }: { open: boolean; onClose: () => void; conv: string; name: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    const { error } = await supabase().rpc("end_conversation", { conv, reason: "ghosted", thumbs: "down", tags: [] });
    setBusy(false);
    if (error) setError(errorText(error));
    else onDone();
  }
  return (
    <Sheet open={open} onClose={onClose} title={`Did ${name} ghost you?`}>
      <div className="flex flex-col gap-4">
        <p className="text-[14.5px] leading-relaxed text-muted">
          This ends the conversation and frees up your slot. It&apos;s fine to leave when someone stops replying.
        </p>
        <ErrorNote>{error}</ErrorNote>
        <Button onClick={submit} disabled={busy}>
          {busy ? "Ending…" : "Yes, end it"}
        </Button>
      </div>
    </Sheet>
  );
}

function ReportSheet({ open, onClose, conv, name, onDone }: { open: boolean; onClose: () => void; conv: string; name: string; onDone: () => void }) {
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    const { error } = await supabase().rpc("report_conversation", { conv, details: details.trim() || null });
    setBusy(false);
    if (error) setError(errorText(error));
    else onDone();
  }
  return (
    <Sheet open={open} onClose={onClose} title={`Report ${name}`}>
      <div className="flex flex-col gap-4">
        <p className="text-[14.5px] leading-relaxed text-muted">
          This ends the conversation, and our team gets a copy of it to review. {name} won&apos;t be told who reported them.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">What happened? (optional)</span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={2000}
            rows={4}
            className="rounded-2xl border border-line px-4 py-3 text-[16px] outline-none focus:border-brand"
          />
        </label>
        <ErrorNote>{error}</ErrorNote>
        <Button onClick={submit} disabled={busy} className="bg-danger hover:bg-danger">
          {busy ? "Sending…" : "Send report"}
        </Button>
      </div>
    </Sheet>
  );
}

function NotesSheet({ open, onClose, conv, myId, name }: { open: boolean; onClose: () => void; conv: string; myId: string; name: string }) {
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const loaded = useRef(false);

  useEffect(() => {
    if (!open || loaded.current) return;
    supabase()
      .from("notes")
      .select("body")
      .eq("conversation_id", conv)
      .maybeSingle()
      .then(({ data }) => {
        loaded.current = true;
        setBody(data?.body ?? "");
      });
  }, [open, conv]);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(async () => {
      setState("saving");
      const { error } = await supabase()
        .from("notes")
        .upsert({ conversation_id: conv, user_id: myId, body, updated_at: new Date().toISOString() });
      setState(error ? "error" : "saved");
    }, 600);
    return () => clearTimeout(t);
  }, [body, conv, myId]);

  return (
    <Sheet open={open} onClose={onClose} title="Private notes">
      <div className="flex flex-col gap-2">
        <p className="text-[13.5px] text-muted">Only you can see these. Jot down things you want to remember about {name}.</p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          rows={8}
          autoFocus
          aria-label="Private notes"
          className="rounded-2xl border border-line px-4 py-3 text-[16px] leading-relaxed outline-none focus:border-brand"
        />
        <span className="text-right text-[12.5px] text-muted" aria-live="polite">
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Couldn't save. Check your connection." : ""}
        </span>
      </div>
    </Sheet>
  );
}

function EndedPanel({
  conv,
  myId,
  name,
  rated,
  onRated,
  onReport,
}: {
  conv: Conversation;
  myId: string;
  name: string;
  rated: boolean;
  onRated: () => void;
  onReport: () => void;
}) {
  const router = useRouter();
  const [thumbs, setThumbs] = useState<"up" | "down" | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const heading =
    conv.status === "off_app"
      ? "You took it off the app. Good luck."
      : conv.ended_by === myId
        ? "You ended this conversation."
        : "This conversation ended.";

  const toggle = (t: string) => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));

  async function rate() {
    if (!thumbs) return;
    setBusy(true);
    const { error } = await supabase().rpc("rate_conversation", { conv: conv.id, thumbs, tags });
    setBusy(false);
    if (error) setError(errorText(error));
    else onRated();
  }

  async function close() {
    setBusy(true);
    await supabase().rpc("close_conversation", { conv: conv.id });
    router.replace("/");
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line bg-lav px-4 pt-4 pb-6">
      <p className="text-[16px] font-bold">{heading}</p>
      {!rated ? (
        <>
          <p className="text-[14px] text-muted">How was talking with {name}? Only we see this.</p>
          <ThumbsPicker value={thumbs} onChange={setThumbs} />
          <div className="flex flex-wrap gap-2">
            <Chip selected={tags.includes("especially_good")} onClick={() => toggle("especially_good")}>
              Especially good
            </Chip>
            {conv.status !== "off_app" && (
              <Chip selected={tags.includes("ghosted")} onClick={() => toggle("ghosted")}>
                They ghosted
              </Chip>
            )}
          </div>
          <ErrorNote>{error}</ErrorNote>
          <Button onClick={rate} disabled={!thumbs || busy}>
            Save rating
          </Button>
        </>
      ) : (
        <Button onClick={close} disabled={busy}>
          Close for good
        </Button>
      )}
      <button onClick={onReport} className="self-center py-2 text-[13.5px] font-semibold text-muted underline-offset-2 hover:underline">
        Report {name}
      </button>
    </div>
  );
}
