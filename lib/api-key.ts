import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { AuthError } from "@/lib/auth";

// API-key auth for the /api/v1 surface — the ONLY authentication path that is
// not a signed-in session, and deliberately the narrowest one in the app.
//
// ── What a key may reach, and why that boundary is structural ────────────────
// A v1 key reaches PUBLIC-RECORD reference data only: payer rate bands from the
// federally mandated machine-readable files, credentialing footprint from
// payers' own FHIR directories, the NPPES/Medicaid provider directory. All of
// it is keyed by NPI or TIN, none of it is a patient, and none of it belongs to
// a practice.
//
// The boundary is structural at the DATABASE layer, which is stronger than any
// import rule: reference data lives in `sql` (DATABASE_URL) and PHI lives in
// `sqlPhi` (DATABASE_URL_PHI) — two separate Postgres projects, no joins
// possible between them. Every function a v1 route calls reads `sql`.
//
// The import graph is NOT perfectly clean and the claim should not be made
// carelessly: lib/repos/directory.ts exports `searchProviders` (reference, via
// `sql`) alongside `createReferral`/`listReferrals` (PHI, via `sqlPhi`). The v1
// route calls only the former, and the latter both require a clientId the route
// never has — but the module is shared. So the enforceable invariant is per
// SYMBOL, not per module:
//
//   No v1 route may import a symbol that touches sqlPhi.
//
// scripts/check-v1-boundary.mjs enforces exactly that and exits non-zero if it
// is ever violated. Run it in CI. A `requireApiKey()` bolted onto an existing
// session route is the refactor this whole design exists to prevent.
//
// ── Keys ─────────────────────────────────────────────────────────────────────
// Keys are `sk_ehr_` + 40 url-safe chars, minted out of band. Only their SHA-256
// hex digests are stored, in EHR_API_KEY_HASHES (comma-separated). The plaintext
// key exists in exactly two places: the customer's config and the AgentCore
// credential provider's managed secret. It is never in this repo, never in an
// env var on our side, and never logged — not the key, not a prefix of it.
//
// Absent or malformed config fails CLOSED: no hashes configured means every
// request is rejected, never allowed.

const KEY_RE = /^sk_ehr_[A-Za-z0-9_-]{40}$/;

function configuredHashes(): string[] {
  const raw = process.env.EHR_API_KEY_HASHES ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[0-9a-f]{64}$/.test(s));
}

/** Constant-time membership test over the configured digests. */
function digestIsKnown(digest: string, known: string[]): boolean {
  const probe = Buffer.from(digest, "hex");
  let hit = false;
  for (const k of known) {
    const candidate = Buffer.from(k, "hex");
    // Compare EVERY candidate — no early return, so the time taken does not
    // reveal which position matched or how many keys are configured.
    if (candidate.length === probe.length && timingSafeEqual(candidate, probe)) hit = true;
  }
  return hit;
}

/**
 * Authenticate an /api/v1 request. Throws AuthError(401) on any failure, with a
 * message that never distinguishes "no key" from "wrong key" — an attacker
 * learns nothing about which part they got wrong.
 */
export function requireApiKey(req: NextRequest): void {
  const known = configuredHashes();
  const presented = req.headers.get("x-api-key") ?? "";

  // Shape-check before hashing so a giant header body can't be used to make us
  // do work, and so a malformed key costs the same as a well-formed wrong one.
  const wellFormed = KEY_RE.test(presented);
  const digest = wellFormed ? createHash("sha256").update(presented).digest("hex") : "";

  if (known.length === 0 || !wellFormed || !digestIsKnown(digest, known)) {
    throw new AuthError("Invalid or missing API key.", 401);
  }
}

/** True when at least one key is configured — for health checks, never for auth. */
export function apiKeysConfigured(): boolean {
  return configuredHashes().length > 0;
}
