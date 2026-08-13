// SignNow (airSlate) e-signature — sends the Operations governance docs (the
// HIPAA policy) out for signature and gets a signed PDF back.
//
// Auth is a long-lived Bearer API key (SIGNNOW_API_KEY) against production
// api.signnow.com — no OAuth password exchange. These are the practice's own
// governance documents, NOT patient PHI, but signer emails are still personal:
// NEVER log the API key, signer email, or document contents.

const BASE = process.env.SIGNNOW_BASE_URL ?? "https://api.signnow.com";

function apiKey(): string | undefined {
  return process.env.SIGNNOW_API_KEY;
}

/** True when a SignNow API key is present. */
export function signnowConfigured(): boolean {
  return !!apiKey();
}

export class SignNowError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SignNowError";
    this.status = status;
  }
}

async function sn(path: string, init: RequestInit = {}): Promise<unknown> {
  const key = apiKey();
  if (!key) throw new SignNowError("SignNow not configured", 503);
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const j = json as { error?: string; errors?: Array<{ message?: string }> } | null;
    throw new SignNowError(j?.errors?.[0]?.message ?? j?.error ?? `SignNow ${res.status}`, res.status);
  }
  return json;
}

/** The SignNow account's login email — required as the freeform-invite `from`. */
export async function accountEmail(): Promise<string> {
  const u = (await sn("/user")) as { primary_email?: string; emails?: string[] };
  const email = u.primary_email ?? u.emails?.[0];
  if (!email) throw new SignNowError("No SignNow account email", 502);
  return email;
}

/** Upload a PDF; returns its SignNow document id. */
export async function uploadDocument(bytes: Uint8Array, filename: string): Promise<string> {
  const form = new FormData();
  // Cast: a filesystem/Node buffer is never a SharedArrayBuffer, so it is a
  // valid BlobPart — TS 5.7's generic Uint8Array typing just can't see that.
  form.append("file", new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), filename);
  const res = (await sn("/document", { method: "POST", body: form })) as { id?: string };
  if (!res.id) throw new SignNowError("Upload returned no document id", 502);
  return res.id;
}

/** Freeform email invite: the signer adds their signature anywhere on the doc.
 *  Body is intentionally minimal — a personalized subject/message is a paid
 *  SignNow tier, so we let SignNow use its default invite copy. */
export async function sendFreeformInvite(opts: {
  documentId: string;
  from: string;
  to: string;
}): Promise<void> {
  await sn(`/document/${opts.documentId}/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      document_id: opts.documentId,
      from: opts.from,
      to: opts.to,
    }),
  });
}

export interface SendResult {
  documentId: string;
  from: string;
  to: string;
}

/** Upload one Operations PDF and email it to `to` for signature. */
export async function sendDocumentForSignature(input: {
  bytes: Uint8Array;
  filename: string;
  title: string;
  to: string;
  signerName?: string;
}): Promise<SendResult> {
  const from = await accountEmail();
  const documentId = await uploadDocument(input.bytes, input.filename);
  await sendFreeformInvite({ documentId, from, to: input.to });
  return { documentId, from, to: input.to };
}

/** Place one required signature field on a "Signer" role; returns the role id.
 *  Embedded signing needs a role+field — a bare uploaded PDF has neither. */
async function addSignatureField(documentId: string): Promise<string> {
  await sn(`/document/${documentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: [
        { x: 50, y: 650, width: 200, height: 40, page_number: 0, type: "signature", required: true, role: "Signer", label: "Signature" },
      ],
    }),
  });
  const doc = (await sn(`/document/${documentId}`)) as { roles?: Array<{ unique_id?: string }> };
  const roleId = doc.roles?.[0]?.unique_id;
  if (!roleId) throw new SignNowError("Could not create a signer role", 502);
  return roleId;
}

export interface SigningSession {
  documentId: string;
  link: string;
}

/** Upload a PDF, place a signature field, and return an in-app embedded signing
 *  link for `signerEmail`. SignNow forbids the account owner from signing their
 *  own document, so the signer must be a different email. */
export async function createSigningSession(input: {
  bytes: Uint8Array;
  filename: string;
  signerEmail: string;
  linkExpirationMinutes?: number;
}): Promise<SigningSession> {
  const documentId = await uploadDocument(input.bytes, input.filename);
  const roleId = await addSignatureField(documentId);

  let inv: { data?: Array<{ id?: string }> };
  try {
    inv = (await sn(`/v2/documents/${documentId}/embedded-invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invites: [{ email: input.signerEmail, role_id: roleId, order: 1, auth_method: "none" }],
      }),
    })) as { data?: Array<{ id?: string }> };
  } catch (e) {
    if (e instanceof SignNowError && /himself|owner/i.test(e.message)) {
      throw new SignNowError("The signer can't be the SignNow account owner — use a different email.", 400);
    }
    throw e;
  }

  const fieldInviteId = inv.data?.[0]?.id;
  if (!fieldInviteId) throw new SignNowError("Could not create the embedded invite", 502);

  const linkRes = (await sn(`/v2/documents/${documentId}/embedded-invites/${fieldInviteId}/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auth_method: "none", link_expiration: input.linkExpirationMinutes ?? 30 }),
  })) as { data?: { link?: string } };

  const link = linkRes.data?.link;
  if (!link) throw new SignNowError("Could not generate the signing link", 502);
  return { documentId, link };
}
