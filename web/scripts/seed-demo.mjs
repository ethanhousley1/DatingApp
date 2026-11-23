// Creates demo people in the LOCAL database who are already waiting to be
// paired, so you can try the app on your own. Run from web/:
//   node scripts/seed-demo.mjs          add demo people
//   node scripts/seed-demo.mjs --clear  remove them
// Demo accounts use demo-*@example.test. Sign in as one through the local
// mail viewer (Mailpit) to reply from the other side of a conversation.
import { createClient } from "@supabase/supabase-js";
import { deflateSync } from "node:zlib";

process.loadEnvFile(".env.local");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!/127\.0\.0\.1|localhost/.test(URL)) throw new Error("Refusing to run against a non-local database.");
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const PEOPLE = [
  { key: "maya", name: "Maya", age: 26, gender: "woman", seeking: ["man", "woman", "other"], color: [196, 160, 232] },
  { key: "jordan", name: "Jordan", age: 27, gender: "man", seeking: ["woman", "man", "other"], color: [150, 170, 230] },
  { key: "sam", name: "Sam", age: 24, gender: "other", seeking: ["man", "woman", "other"], color: [230, 170, 150] },
  { key: "priya", name: "Priya", age: 28, gender: "woman", seeking: ["man", "woman", "other"], color: [160, 210, 190] },
  { key: "alex", name: "Alex", age: 25, gender: "man", seeking: ["woman", "man", "other"], color: [220, 200, 140] },
];

// A simple soft gradient PNG, so demo profiles have a photo.
function png(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    const t = y / h;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3;
      raw[i] = Math.round(r * (1 - t * 0.35));
      raw[i + 1] = Math.round(g * (1 - t * 0.35));
      raw[i + 2] = Math.round(b * (1 - t * 0.2));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function clear() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data.users.filter((u) => u.email?.startsWith("demo-"))) {
    const { data: files } = await admin.storage.from("photos").list(u.id);
    if (files?.length) await admin.storage.from("photos").remove(files.map((f) => `${u.id}/${f.name}`));
    await admin.auth.admin.deleteUser(u.id);
  }
}

await clear();
if (process.argv.includes("--clear")) {
  console.log("Demo people removed.");
  process.exit(0);
}

for (const p of PEOPLE) {
  const email = `demo-${p.key}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  const d = new Date();
  d.setFullYear(d.getFullYear() - p.age);
  d.setMonth(d.getMonth() - 3);
  await admin.from("profiles").insert({
    id, name: p.name, birthdate: d.toISOString().slice(0, 10), height_cm: 165 + (p.age % 5) * 4, gender: p.gender, seeking: p.seeking,
  });
  const path = `${id}/demo.png`;
  await admin.storage.from("photos").upload(path, png(300, 400, p.color), { contentType: "image/png" });
  await admin.from("photos").insert({ user_id: id, path, position: 0 });
  await admin.from("match_requests").insert({ user_id: id });
  console.log(`${p.name.padEnd(7)} ${p.age} ${p.gender.padEnd(5)}  ${email}  (waiting to be paired)`);
}
// Demo people shouldn't be paired with each other: give every demo pair an
// already-ended conversation, so the "never again" rule keeps them apart.
const { data: demos } = await admin.from("profiles").select("id").in(
  "id",
  (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((u) => u.email?.startsWith("demo-")).map((u) => u.id),
);
const ids = demos.map((d) => d.id).sort();
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    await admin.from("conversations").insert({
      user_a: ids[i], user_b: ids[j], status: "ended", end_reason: "ended", ended_at: new Date().toISOString(), closed_a: true, closed_b: true,
    });
  }
}
console.log("\nDemo people are waiting. Sign up in the app and press \"Find someone new\".");
