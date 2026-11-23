// Backend checks against the LOCAL Supabase database.
// Run from web/:  node scripts/test-backend.mjs
// Creates throwaway test users (test-*@example.test) and removes them at the end.
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/127\.0\.0\.1|localhost/.test(URL)) throw new Error("Refusing to run against a non-local database.");

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const PASSWORD = "test-password-123";
let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};
const birthdate = (age) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setDate(d.getDate() - 10);
  return d.toISOString().slice(0, 10);
};

async function cleanup() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data.users.filter((u) => u.email?.startsWith("test-"))) {
    await admin.auth.admin.deleteUser(u.id);
  }
}

async function makeUser(key, { age, gender, seeking }) {
  const email = `test-${key}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (e2) throw e2;
  const id = data.user.id;
  const { error: e3 } = await client.from("profiles").insert({
    id, name: key.toUpperCase(), birthdate: birthdate(age), height_cm: 175, gender, seeking,
  });
  if (e3) throw e3;
  // Real upload, so storage rules are exercised too.
  const path = `${id}/photo-1.png`;
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000000000500010d0a2db40000000049454e44ae426082", "hex");
  const { error: e4 } = await client.storage.from("photos").upload(path, png, { contentType: "image/png" });
  if (e4) throw e4;
  const { error: e5 } = await client.from("photos").insert({ user_id: id, path, position: 0 });
  if (e5) throw e5;
  return { id, client, key };
}

const press = async (u) => {
  const { data, error } = await u.client.rpc("request_match");
  return { conv: data, error };
};

await cleanup();
// Anyone else waiting (e.g. demo people) would get paired with the test users,
// so set their open requests aside and give them back afterwards.
const { data: setAside } = await admin
  .from("match_requests")
  .select("id,user_id")
  .is("matched_at", null)
  .is("cancelled_at", null);
if (setAside?.length) {
  await admin.from("match_requests").update({ cancelled_at: new Date().toISOString() }).in("id", setAside.map((r) => r.id));
}
// Most checks are about the alpha rules, so switch off pre-alpha "anyone with
// anyone" mode while they run, and put the setting back afterwards.
const { data: settingsRow } = await admin.from("app_settings").select("match_everyone").single();
await admin.from("app_settings").update({ match_everyone: false }).eq("id", true);
try {
  // Under-age sign-up is refused.
  {
    const email = "test-young@example.test";
    const { data } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    const c = createClient(URL, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password: PASSWORD });
    const { error } = await c.from("profiles").insert({
      id: data.user.id, name: "Y", birthdate: birthdate(17), height_cm: 170, gender: "man", seeking: ["woman"],
    });
    check("17-year-old can't create a profile", !!error, error?.message);
  }

  const A = await makeUser("a", { age: 25, gender: "man", seeking: ["woman"] });
  const B = await makeUser("b", { age: 24, gender: "woman", seeking: ["man"] });
  const C = await makeUser("c", { age: 22, gender: "woman", seeking: ["man"] });
  const D = await makeUser("d", { age: 19, gender: "woman", seeking: ["man"] });
  const E = await makeUser("e", { age: 26, gender: "woman", seeking: ["man"] });
  const F = await makeUser("f", { age: 23, gender: "woman", seeking: ["man"] });
  const G = await makeUser("g", { age: 24, gender: "man", seeking: ["man"] });

  // Pairing needs two people waiting.
  let r = await press(A);
  check("A presses + with nobody waiting: no pair yet", !r.error && r.conv === null, r.error?.message);
  r = await press(B);
  check("B presses +: paired with A", !r.error && !!r.conv, r.error?.message);
  const ab = r.conv;

  // Gender preferences and the age rule.
  r = await press(G);
  const r2 = await press(D);
  check("G (seeking men) and D (19, too young for nobody else waiting) stay unpaired", r.conv === null && r2.conv === null);
  r = await press(A); // A (25) vs D (19): gap 6 > 3 + 0.3*1 → not allowed
  check("Age rule: A (25) isn't paired with D (19)", r.conv === null, r.error?.message);
  await A.client.rpc("cancel_match_request");
  await D.client.rpc("cancel_match_request");
  await G.client.rpc("cancel_match_request");

  // Who can see what.
  {
    const { data: seeB } = await A.client.from("profiles").select("id").eq("id", B.id);
    const { data: seeC } = await A.client.from("profiles").select("id").eq("id", C.id);
    check("A can see B's profile (they're talking)", seeB?.length === 1);
    check("A can't see C's profile (never talked)", seeC?.length === 0);
    const { data: url } = await A.client.storage.from("photos").createSignedUrl(`${B.id}/photo-1.png`, 60);
    const { data: url2 } = await A.client.storage.from("photos").createSignedUrl(`${C.id}/photo-1.png`, 60);
    check("A can open B's photo", !!url?.signedUrl);
    check("A can't open C's photo", !url2?.signedUrl);
  }

  // Messages.
  {
    const { error } = await A.client.from("messages").insert({ conversation_id: ab, sender_id: A.id, body: "hey!" });
    check("A sends a message", !error, error?.message);
    const { data } = await B.client.from("messages").select("body").eq("conversation_id", ab);
    check("B reads it", data?.[0]?.body === "hey!");
    const { data: cRead } = await C.client.from("messages").select("body").eq("conversation_id", ab);
    check("C can't read A and B's messages", cRead?.length === 0);
    const { error: cErr } = await C.client.from("messages").insert({ conversation_id: ab, sender_id: C.id, body: "hi" });
    check("C can't post into A and B's conversation", !!cErr);
    const { error: fake } = await A.client.from("messages").insert({ conversation_id: ab, sender_id: B.id, body: "fake" });
    check("A can't send as B", !!fake);
    const { error: upd } = await A.client.from("conversations").update({ status: "ended" }).eq("id", ab);
    const { data: still } = await A.client.from("conversations").select("status").eq("id", ab).single();
    check("A can't change the conversation directly", still.status === "active", upd?.message);
  }

  // Private notes.
  {
    const note = { conversation_id: ab, user_id: A.id, body: "likes film cameras", updated_at: new Date().toISOString() };
    const { error } = await A.client.from("notes").upsert(note);
    check("A saves a private note", !error, error?.message);
    const { error: again } = await A.client.from("notes").upsert({ ...note, body: "updated" });
    check("A updates the note", !again, again?.message);
    const { data: bRead } = await B.client.from("notes").select("body").eq("conversation_id", ab);
    check("B can't read A's note", bRead?.length === 0);
    const { error: forge } = await B.client.from("notes").upsert({ ...note, body: "hacked" });
    check("B can't write A's note", !!forge);
  }

  // Ghosting: not before 2 days.
  {
    const { data: early } = await B.client.rpc("can_claim_ghosted", { conv: ab });
    check("B can't claim ghosted right after a message", early === false);
    const { data: aEarly } = await A.client.rpc("can_claim_ghosted", { conv: ab });
    check("A can't claim ghosted yet either", aEarly === false);
    await admin.from("messages").update({ created_at: new Date(Date.now() - 3 * 864e5).toISOString() }).eq("conversation_id", ab);
    const { data: late } = await A.client.rpc("can_claim_ghosted", { conv: ab });
    const { data: bLate } = await B.client.rpc("can_claim_ghosted", { conv: ab });
    check("After 3 days with no reply, A can claim ghosted", late === true);
    check("B can't, because B is the one who didn't reply", bLate === false);
    const { error } = await A.client.rpc("end_conversation", { conv: ab, reason: "ghosted", thumbs: "down", tags: [] });
    check("A ends it as ghosted", !error, error?.message);
    const { data: conv } = await B.client.from("conversations").select("status,end_reason").eq("id", ab).single();
    check("B sees it ended as ghosted", conv.status === "ended" && conv.end_reason === "ghosted");
    const { error: rErr } = await B.client.rpc("rate_conversation", { conv: ab, thumbs: "up", tags: ["especially_good"] });
    check("B rates it afterwards", !rErr, rErr?.message);
    const { data: aRatings } = await A.client.from("ratings").select("rater_id");
    check("A can't see B's rating", aRatings.every((x) => x.rater_id === A.id));
  }

  // Unmatching is permanent.
  {
    const r1 = await press(A);
    const r2 = await press(B);
    check("A and B are never paired again", r1.conv === null && r2.conv === null);
    await A.client.rpc("cancel_match_request");
    await B.client.rpc("cancel_match_request");
  }

  // Fill A's three slots.
  const convs = [];
  for (const W of [C, E, F]) {
    await press(A);
    const res = await press(W);
    if (res.conv) convs.push(res.conv);
  }
  check("A fills 3 slots (C, E, F)", convs.length === 3);
  r = await press(A);
  check("A can't press + with 3 full", !!r.error, r.error?.message);

  // Overflow: B waits more than 24 hours; A is open to more connections.
  {
    const B2 = await makeUser("b2", { age: 25, gender: "woman", seeking: ["man"] });
    await press(B2);
    const { data: none } = await admin.rpc("match_waiting");
    check("Overflow doesn't happen before 24 hours", none === 0);
    await admin.from("match_requests").update({ created_at: new Date(Date.now() - 25 * 3600e3).toISOString() }).eq("user_id", B2.id);
    let { data: n } = await admin.rpc("match_waiting");
    check("A isn't used as overflow until opted in", n === 0);
    await A.client.from("profiles").update({ open_to_more: true }).eq("id", A.id);
    ({ data: n } = await admin.rpc("match_waiting"));
    const { data: oc } = await admin.from("conversations").select("overflow_for").eq("overflow_for", A.id);
    check("After 24h, B2 is paired with A as A's 4th", n === 1 && oc.length === 1);
  }

  // Taking it off the app.
  {
    const conv = convs[0]; // A and C
    const { data: first } = await A.client.rpc("mark_off_app", { conv });
    const { data: second } = await C.client.rpc("mark_off_app", { conv });
    const { data: c } = await A.client.from("conversations").select("status").eq("id", conv).single();
    check("Off the app needs both people", first === "waiting" && second === "off_app" && c.status === "off_app");
  }

  // Reporting keeps a copy of the messages.
  {
    const conv = convs[1]; // A and E
    await A.client.from("messages").insert({ conversation_id: conv, sender_id: A.id, body: "something bad" });
    const { error } = await E.client.rpc("report_conversation", { conv, details: "test report" });
    const { data: rep } = await admin.from("reports").select("messages_snapshot,reported_id").eq("conversation_id", conv).single();
    const { data: ePeek } = await E.client.from("reports").select("id");
    check("E reports A; support gets a copy of the messages", !error && rep?.messages_snapshot?.length === 1 && rep.reported_id === A.id, error?.message);
    check("Users can't read reports", ePeek?.length === 0);
  }

  // Pausing withdraws an open request.
  {
    await press(G);
    await G.client.from("profiles").update({ paused: true }).eq("id", G.id);
    const { data: open } = await G.client.from("match_requests").select("id").is("matched_at", null).is("cancelled_at", null);
    check("Pausing cancels G's open request", open.length === 0);
    const res = await press(G);
    check("G can't press + while paused", !!res.error, res.error?.message);
  }

  // Columns users must not change.
  {
    const { error } = await A.client.from("profiles").update({ birthdate: "2000-01-01" }).eq("id", A.id);
    check("A can't change their birthdate", !!error);
  }

  // Pre-alpha: anyone can be paired with anyone.
  {
    const H = await makeUser("h", { age: 20, gender: "man", seeking: ["woman"] });
    const I = await makeUser("i", { age: 34, gender: "man", seeking: ["man"] });
    await press(H);
    let res = await press(I);
    check("With alpha rules on, H and I aren't paired (gender, age)", res.conv === null);
    await admin.from("app_settings").update({ match_everyone: true }).eq("id", true);
    const { data: s } = await H.client.rpc("public_settings");
    check("The app can read the pre-alpha mode and slot count", s?.match_everyone === true && s?.max_slots === 3);
    await I.client.rpc("cancel_match_request");
    res = await press(I);
    check("In pre-alpha mode, H and I are paired", !!res.conv, res.error?.message);
  }
} finally {
  await admin.from("app_settings").update({ match_everyone: settingsRow.match_everyone }).eq("id", true);
  await cleanup();
  for (const r of setAside ?? []) {
    await admin.from("match_requests").insert({ user_id: r.user_id });
  }
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
