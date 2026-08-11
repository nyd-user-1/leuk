import { NextResponse, type NextRequest } from "next/server";
import { AuthError } from "@/lib/auth";
import { requireApiKey } from "@/lib/api-key";

// Shared plumbing for the /api/v1 reference surface. Every v1 route is the same
// three things — authenticate, read query params, call one repo function — so
// the wrapper owns auth and error shape and the route files stay short enough
// to audit at a glance. That legibility is the point: this is the surface a
// third party's agent reaches, and "you can read the whole route in ten lines"
// is a security property.
//
// See lib/api-key.ts for the import boundary that keeps PHI out of this graph.

export type V1Handler = (req: NextRequest) => Promise<unknown>;

/** Wrap a v1 handler: key auth, JSON body, uniform errors, no caching. */
export function v1(handler: V1Handler) {
  return async function GET(req: NextRequest): Promise<NextResponse> {
    try {
      requireApiKey(req);
      const data = await handler(req);
      return NextResponse.json(data, {
        headers: {
          // Reference data changes on an ingest cadence, not per request, but a
          // shared cache must never hold a keyed response — the key is in the
          // request, and a cache that ignores it would serve one customer's
          // response to another.
          "Cache-Control": "private, no-store",
        },
      });
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      if (e instanceof V1BadRequest) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      // Never leak an internal message to a third party's agent.
      console.error("[api/v1] unhandled", e instanceof Error ? e.message : String(e));
      return NextResponse.json({ error: "Upstream error." }, { status: 500 });
    }
  };
}

export class V1BadRequest extends Error {}

/** A required NPI, validated to ten digits. */
export function npiParam(req: NextRequest, name = "npi"): string {
  const v = (req.nextUrl.searchParams.get(name) ?? "").trim();
  if (!/^\d{10}$/.test(v)) throw new V1BadRequest(`${name} must be a 10-digit NPI.`);
  return v;
}

/** A required non-empty string param. */
export function strParam(req: NextRequest, name: string, max = 200): string {
  const v = (req.nextUrl.searchParams.get(name) ?? "").trim();
  if (!v) throw new V1BadRequest(`${name} is required.`);
  return v.slice(0, max);
}

/** An optional string param. */
export function optParam(req: NextRequest, name: string, max = 200): string | undefined {
  const v = (req.nextUrl.searchParams.get(name) ?? "").trim();
  return v ? v.slice(0, max) : undefined;
}

/** A bounded integer param with a default. */
export function intParam(req: NextRequest, name: string, dflt: number, max: number): number {
  const raw = req.nextUrl.searchParams.get(name);
  if (raw == null || raw === "") return dflt;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) throw new V1BadRequest(`${name} must be a positive integer.`);
  return Math.min(n, max);
}

/** A comma-separated list of 5-digit CPT codes. */
export function codesParam(req: NextRequest, max = 20): string[] {
  const codes = [...new Set((req.nextUrl.searchParams.get("codes") ?? "").split(","))]
    .map((s) => s.trim())
    .filter((s) => /^\d{5}$/.test(s));
  if (codes.length === 0) throw new V1BadRequest("Provide one or more 5-digit CPT codes.");
  return codes.slice(0, max);
}
