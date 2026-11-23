import { createClient } from "@supabase/supabase-js";

// Called by the database (see notify_conversation_event in the migration) when
// people are paired or a conversation ends. Sends emails through Resend, or
// prints them to the server log when RESEND_API_KEY isn't set.

type Event = { event: "paired" | "ended" | "off_app"; conversation_id: string };

export async function POST(request: Request) {
  if (!process.env.NOTIFY_SECRET || request.headers.get("x-notify-secret") !== process.env.NOTIFY_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  const { event, conversation_id } = (await request.json()) as Event;

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: conv } = await admin.from("conversations").select("*").eq("id", conversation_id).single();
  if (!conv) return new Response("Not found", { status: 404 });

  const people = await Promise.all(
    [conv.user_a, conv.user_b].map(async (id: string) => {
      const [{ data: auth }, { data: profile }] = await Promise.all([
        admin.auth.admin.getUserById(id),
        admin.from("profiles").select("name").eq("id", id).single(),
      ]);
      return { id, email: auth.user?.email, name: profile?.name ?? "there" };
    }),
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const link = `${appUrl}/c/${conversation_id}`;

  const emails: { to: string; subject: string; text: string }[] = [];
  for (const person of people) {
    if (!person.email) continue;
    const other = people.find((p) => p.id !== person.id)!;
    if (event === "paired") {
      emails.push({
        to: person.email,
        subject: "You have a new conversation",
        text: `Hi ${person.name},\n\nYou've been paired with ${other.name} on Connections. Say hi:\n${link}\n`,
      });
    } else if (event === "ended" && conv.ended_by !== person.id) {
      emails.push({
        to: person.email,
        subject: "A conversation ended",
        text: `Hi ${person.name},\n\nYour conversation with ${other.name} has ended, so you have a slot free. You can rate it and find someone new:\n${appUrl}\n`,
      });
    } else if (event === "off_app") {
      emails.push({
        to: person.email,
        subject: "You took it off the app",
        text: `Hi ${person.name},\n\nYou and ${other.name} both said you took it off the app. That's what we're here for. Good luck.\n`,
      });
    }
  }

  for (const email of emails) await sendEmail(email);
  return Response.json({ sent: emails.length });
}

async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email not sent: no RESEND_API_KEY] to=${to} subject="${subject}"\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "Connections <onboarding@resend.dev>", to, subject, text }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
}
