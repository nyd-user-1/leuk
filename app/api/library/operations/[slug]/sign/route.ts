import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { logEvent } from "@/lib/audit";
import { AuthError, requireRole } from "@/lib/auth";
import { createSigningSession, signnowConfigured } from "@/lib/signnow";

// POST /api/library/operations/{slug}/sign  { email, name? }
// Admin-only. Uploads the governance PDF to SignNow, places a signature field,
// and returns an embedded signing link the browser opens so the signer can sign
// in-app. The signer cannot be the SignNow account owner.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCS: Record<string, { file: string; label: string }> = {
  "hipaa-policy": { file: "hipaa-policy.pdf", label: "HIPAA Compliance Policy.pdf" },
};

const ROOT = join(process.cwd(), "assets", "operations");
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Params = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireRole("admin");
    const { slug } = await params;
    const doc = DOCS[slug];
    if (!doc) return NextResponse.json({ error: "Unknown document." }, { status: 404 });
    if (!signnowConfigured()) return NextResponse.json({ error: "SignNow is not configured." }, { status: 503 });

    let body: { email?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "A valid signer email is required." }, { status: 400 });
    }

    const bytes = await readFile(join(ROOT, doc.file));
    try {
      const session = await createSigningSession({
        bytes: new Uint8Array(bytes),
        filename: doc.label,
        signerEmail: email,
      });
      await logEvent({
        actorId: user.id,
        action: "esign.sign_session",
        entity: "document",
        entityId: session.documentId,
        meta: { slug, via: "signnow" },
      });
      return NextResponse.json({ ok: true, link: session.link });
    } catch (err) {
      const se = err as { status?: number; message?: string; name?: string };
      console.error("operations/sign: SignNow failed", se?.name ?? "error", se?.status ?? "");
      return NextResponse.json(
        { error: se?.message ?? "Could not start the signing session." },
        { status: se?.status && se.status >= 400 && se.status < 500 ? se.status : 502 },
      );
    }
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
