// Hand-pick who gets into the pre-alpha. Sign-ups are closed, so only people
// added here can sign in. Run from web/:
//
//   node scripts/invite.mjs --list                  show the waitlist and who's invited
//   node scripts/invite.mjs ana@x.com ben@y.com     let these people in, and print a sign-in link for each
//   node scripts/invite.mjs --link ana@x.com        a fresh sign-in link (new phone, signed out, link expired)
//   node scripts/invite.mjs --remove ana@x.com      take someone out (deletes their account and data)
//
// Sign-in links are sent by you (text, DM), not emailed, so no email service is
// needed yet. Each link works once and expires (1 hour by default; the hosted
// project's Auth settings can raise it to 24 hours).
//
// Uses .env.local (your local database) by default. For the hosted project, put
// its URL and service role key in a separate file and pass it:
//   node scripts/invite.mjs --env .env.production.local ana@x.com
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const envFile = envIndex >= 0 ? args.splice(envIndex, 2)[1] : ".env.local";
process.loadEnvFile(envFile);

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100";
console.log(`Database: ${URL}\n`);

async function allUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

const emailOk = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// A one-time sign-in link, without sending an email.
async function signInLink(email) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${appUrl}/auth/callback` },
  });
  if (error) throw error;
  return data.properties.action_link;
}

if (args[0] === "--link") {
  const users = await allUsers();
  for (const email of args.slice(1).map((e) => e.trim().toLowerCase())) {
    if (!users.some((u) => u.email === email)) {
      console.log(`  not invited ${email}`);
      continue;
    }
    console.log(`  ${email}\n    ${await signInLink(email)}\n`);
  }
  process.exit(0);
}

if (args[0] === "--list" || args.length === 0) {
  const [{ data: waitlist, error }, users] = await Promise.all([
    admin.from("waitlist").select("email,source,created_at,invited_at").order("created_at"),
    allUsers(),
  ]);
  if (error) throw error;
  const invited = new Set(users.map((u) => u.email));
  console.log("Waitlist:");
  if (!waitlist.length) console.log("  (empty)");
  for (const w of waitlist) {
    const status = invited.has(w.email) ? "invited" : "waiting";
    console.log(`  ${status.padEnd(8)} ${w.email.padEnd(36)} from ${w.source}, ${w.created_at.slice(0, 10)}`);
  }
  const extra = users.filter((u) => !waitlist.some((w) => w.email === u.email));
  if (extra.length) {
    console.log("\nAlso has access (not on the waitlist):");
    for (const u of extra) console.log(`  ${u.email}`);
  }
  if (args.length === 0) console.log("\nTo invite: node scripts/invite.mjs someone@example.com");
  process.exit(0);
}

if (args[0] === "--remove") {
  const users = await allUsers();
  for (const email of args.slice(1).map((e) => e.trim().toLowerCase())) {
    const user = users.find((u) => u.email === email);
    if (!user) {
      console.log(`  not found  ${email}`);
      continue;
    }
    const { data: files } = await admin.storage.from("photos").list(user.id);
    if (files?.length) await admin.storage.from("photos").remove(files.map((f) => `${user.id}/${f.name}`));
    const { error } = await admin.auth.admin.deleteUser(user.id);
    console.log(error ? `  failed     ${email}: ${error.message}` : `  removed    ${email}`);
  }
  process.exit(0);
}

const users = await allUsers();
for (const email of args.map((e) => e.trim().toLowerCase())) {
  if (!emailOk(email)) {
    console.log(`  skipped    ${email} (doesn't look like an email)`);
    continue;
  }
  if (users.some((u) => u.email === email)) {
    console.log(`  already in ${email}`);
  } else {
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) {
      console.log(`  failed     ${email}: ${error.message}`);
      continue;
    }
    console.log(`  invited    ${email}`);
  }
  await admin.from("waitlist").update({ invited_at: new Date().toISOString() }).eq("email", email).is("invited_at", null);
  console.log(`    sign-in link: ${await signInLink(email)}\n`);
}
console.log(`Send each person their own link. It works once. For a new one later:\n  node scripts/invite.mjs${envIndex >= 0 ? ` --env ${envFile}` : ""} --link <email>`);
