import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { logEvent } from "@/lib/audit";
import { AuthError, requireRole } from "@/lib/auth";
import { sendDocumentForSignature, signnowConfigured } from "@/lib/signnow";

// POST /api/library/operations/{slug}/send  { email, name? }
// Admin-only. Uploads the governance PDF to SignNow and emails the signer a
// secure signing link. Not patient PHI; the signer email is never logged.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCS: Record<string, { file: string; title: string; label: string }> = {
  "hipaa-policy": { file: "hipaa-policy.pdf", title: "HIPAA Compliance Policy", label: "HIPAA Compliance Policy.pdf" },
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

    let body: { email?: unknown; name?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "A valid signer email is required." }, { status: 400 });
    }

    const bytes = await readFile(join(ROOT, doc.file));
    try {
      const result = await sendDocumentForSignature({
        bytes: new Uint8Array(bytes),
        filename: doc.label,
        title: doc.title,
        to: email,
        signerName: name || undefined,
      });
      // Audit the send — slug + SignNow document id only, never the signer email.
      await logEvent({
        actorId: user.id,
        action: "esign.send",
        entity: "document",
        entityId: result.documentId,
        meta: { slug, via: "signnow" },
      });
      return NextResponse.json({ ok: true, documentId: result.documentId });
    } catch (err) {
      const se = err as { status?: number; message?: string; name?: string };
      console.error("operations/send: SignNow failed", se?.name ?? "error", se?.status ?? "");
      return NextResponse.json(
        { error: se?.message ? `Send failed: ${se.message}` : "Could not send for signature." },
        { status: 502 },
      );
    }
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
