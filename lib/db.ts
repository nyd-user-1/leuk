import { aurora, neon, usesAurora, type NeonQueryFunction } from "@/lib/aurora";

// Postgres clients. Both are tagged-template functions:
// sql`SELECT * FROM t WHERE id = ${id}` — parameters are bound, not
// interpolated, so it's safe against injection.
//
// Two databases, because PHI lives under a BAA and public reference data
// does not:
//   sql     — the reference/public dataset (NPPES, rate signals, FHIR
//             directories, Form 5500). No PHI, no HIPAA.
//   sqlPhi  — the clinical database (clients, notes, appointments, invoices,
//             users, sessions, audit_events). Keep public-data reads off it.
//
// They are separate Postgres servers: a single statement can never join across
// them. Fetch from each and merge in TypeScript.
//
// On AWS (2026-10-01) each is its own Aurora cluster reached over the Data API
// on the app's role (lib/aurora.ts): `leuk` named by AURORA_CLUSTER_ARN /
// AURORA_SECRET_ARN / AURORA_DATABASE, and `leuk-phi` by the same three with
// the AURORA_PHI_ prefix. The clinical cluster is never substituted by the
// public one. On a laptop the two are DATABASE_URL and DATABASE_URL_PHI, served
// by the Neon driver as before.
//
// Lazy: a client is only constructed on first use, so importing this module
// during `next build` (when the env vars may be absent) does not throw.
// Callers must branch on `hasDb`/`hasPhiDb` before querying; a query made
// with nothing configured throws at call time.

/** True when the reference database is attached. Repos branch: sql`…` vs lib/mock. */
export const hasDb = usesAurora() || !!process.env.DATABASE_URL;

/**
 * True when a clinical database is attached. Off AWS it falls back to
 * DATABASE_URL so environments that have not been given DATABASE_URL_PHI keep
 * working exactly as before the split.
 */
export const hasPhiDb = usesAurora("AURORA_PHI") || (!usesAurora() && !!(process.env.DATABASE_URL_PHI || process.env.DATABASE_URL));

function lazyClient(make: () => NeonQueryFunction<false, false>): NeonQueryFunction<false, false> {
  let _client: NeonQueryFunction<false, false> | null = null;
  const client = (): NeonQueryFunction<false, false> => (_client ??= make());
  // Proxy that forwards both the tagged-template call and any helper methods
  // (.query, etc.) to the lazily-created client.
  return new Proxy(function () {} as unknown as NeonQueryFunction<false, false>, {
    apply(_target, _thisArg, args) {
      return (client() as unknown as (...a: unknown[]) => unknown)(...args);
    },
    get(_target, prop) {
      const c = client() as unknown as Record<string | symbol, unknown>;
      const v = c[prop];
      return typeof v === "function" ? v.bind(c) : v;
    },
  }) as NeonQueryFunction<false, false>;
}

export const sql = lazyClient(() => {
  if (usesAurora()) return aurora();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
});

export const sqlPhi = lazyClient(() => {
  if (usesAurora("AURORA_PHI")) return aurora("AURORA_PHI");
  // On AWS the clinical data has its own cluster; never fall through to the
  // public one.
  if (usesAurora()) throw new Error("AURORA_PHI_CLUSTER_ARN is not set");
  const url = process.env.DATABASE_URL_PHI || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_PHI is not set");
  return neon(url);
});
