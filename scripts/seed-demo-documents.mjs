#!/usr/bin/env node
// Seed the demo clients' documents with REAL objects.
//
// Every file row must have bytes behind it. These four specimens live in
// scripts/seed-assets/ and are pushed through the same private-blob path a
// real upload takes (POST /api/files), so the blob keys are real and the
// download proxy serves them like any other document. They are then marked
// provenance='demo_seed' — real bytes, but seeded rather than clinician-
// supplied, and surfaces are expected to label them as demo data.
//
// The specimens are synthetic content for fictional demo clients. They carry a
// visible "DEMO DATA" stamp and name a fictional insurer.
//
// Usage:  node scripts/seed-demo-documents.mjs [--base http://localhost:3010]
// Requires: the app running, and DATABASE_URL in .env.local.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:3010";

const CLIENTS = {
  casey: "00000000-0000-4000-8000-000000002001",
  jordan: "00000000-0000-4000-8000-000000002002",
  ava: "00000000-0000-4000-8000-000000002004",
};

const DOCS = [
  { file: "insurance-card-front.jpg", mime: "image/jpeg", kind: "upload", client: CLIENTS.casey },
  { file: "phq9-2026-06-24.pdf", mime: "application/pdf", kind: "form_pdf", client: CLIENTS.casey },
  { file: "superbill-june-2026.pdf", mime: "application/pdf", kind: "superbill", client: CLIENTS.ava },
  { file: "prior-records-dr-feld.pdf", mime: "application/pdf", kind: "upload", client: CLIENTS.jordan },
];

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set (source .env.local).");
  const sql = neon(dbUrl);

  // Sign in as the demo practitioner and carry the session cookie.
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "brendan@leuk.demo", password: "demo" }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

  const seeded = [];
  for (const doc of DOCS) {
    const bytes = await readFile(path.join(HERE, "seed-assets", doc.file));
    const form = new FormData();
    form.set("file", new File([bytes], doc.file, { type: doc.mime }));
    form.set("clientId", doc.client);
    form.set("kind", doc.kind);

    const res = await fetch(`${BASE}/api/files`, { method: "POST", headers: { cookie }, body: form });
    if (!res.ok) throw new Error(`upload ${doc.file} failed: ${res.status} ${await res.text()}`);
    const { file } = await res.json();
    seeded.push(file.id);
    console.log(`uploaded ${doc.file} -> ${file.url} (${file.sizeBytes} bytes)`);
  }

  // These came from a seed script, not a clinician. Say so in the row.
  await sql`UPDATE files SET provenance = 'demo_seed' WHERE id = ANY(${seeded})`;

  // Retire any byte-less predecessors: rows whose url points at ./uploads have
  // no bytes anywhere on serverless.
  const dropped = await sql`
    DELETE FROM files WHERE storage = 'local' AND url LIKE '/uploads/%' RETURNING id, name
  `;
  for (const r of dropped) console.log(`removed byte-less row ${r.name} (${r.id})`);

  console.log(`\ndone — ${seeded.length} documents seeded, ${dropped.length} byte-less rows removed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
