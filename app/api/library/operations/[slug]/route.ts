import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireRole } from "@/lib/auth";

// Operations library documents (HIPAA policy) — admin-only, served straight
// off disk (assets/operations/), the same filesystem pattern as app/api/docs.
// These are the practice's own governance PDFs, NOT patient PHI, so the
// private-blob upload path is intentionally not involved. Slug is whitelisted,
// so no user input ever reaches the filesystem path. No DB.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCS: Record<string, { file: string; label: string }> = {
  "hipaa-policy": { file: "hipaa-policy.pdf", label: "HIPAA Compliance Policy.pdf" },
};

const ROOT = join(process.cwd(), "assets", "operations");

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireRole("admin");
    const { slug } = await params;
    const doc = DOCS[slug];
    if (!doc) return NextResponse.json({ error: "Unknown document." }, { status: 404 });
    let bytes: Buffer;
    try {
      bytes = await readFile(join(ROOT, doc.file));
    } catch {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.label}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
