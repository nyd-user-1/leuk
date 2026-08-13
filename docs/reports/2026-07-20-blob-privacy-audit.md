# Blob privacy audit — document storage, 2026-07-20

Verification-only pass over the document storage shipped in 881431c / b7b28a4
(report: `docs/reports/2026-07-20-ehr-storage.md`). No code was changed. Every
verdict below is backed by a command and its quoted output.

**Headline: the local/private-store design is sound and every runtime control
passed — but Production does not use the private store.** All three deployed
environments carry a `BLOB_READ_WRITE_TOKEN` scoped to a *public* store, so
document upload in Production fails closed rather than leaking. Details in item 5.

| # | Claim under test | Verdict |
|---|---|---|
| 1 | Upload lands in the PRIVATE store | **PASS** |
| 2 | Raw blob URL is not publicly fetchable | **PASS** |
| 3 | Proxy authorizes correctly, both directions | **PASS** |
| 4 | Audit rows for read + write, no PHI | **PASS** (one fidelity caveat) |
| 5 | Production uses the private store | **FAIL** |

---

## 1. Upload lands in the PRIVATE store — PASS

Driven through the **real UI** with Playwright against the dev server on :3010 —
real sign-in form, real client record, `setInputFiles` on the actual `FileUpload`
dropzone, not a direct API call. Uploaded as Casey Morgan
(`00000000-0000-4000-8000-000000002001`).

The filename was chosen adversarially: `hiv-test-results-AUDITTEST.pdf`, a name
that *does* name a condition, to test whether it leaks into the storage key or
the audit trail.

The `POST /api/files` response, verbatim:

```json
{"file":{"id":"c8585c68-c265-4260-bc48-ec66f301818c",
 "clientId":"00000000-0000-4000-8000-000000002001",
 "uploaderId":"00000000-0000-4000-8000-000000001001",
 "name":"hiv-test-results-AUDITTEST.pdf","mime":"application/pdf","sizeBytes":232,
 "url":"clients/00000000-0000-4000-8000-000000002001/6f5e5a81-dad8-470e-a6f7-d7bfd381c960.pdf",
 "kind":"upload","storage":"blob","provenance":"user_upload",
 "createdAt":"2026-07-20T16:31:16.631Z"}}
```

Status 201, and the row rendered in the UI (`rows rendering the uploaded document
in the UI: 1`) — verified as rendered output, not just a 2xx.

**The response does not surface a store id directly** (it returns the blob
*pathname*, deliberately — see item 2). Derived it instead by `head()`-ing the
pathname with each store's token:

```
=== A. HEAD with the PRIVATE token (vercel_blob_rw_AiBVM9…) ===
FOUND in private store
  url        : https://aibvm9yweidc0qgp.private.blob.vercel-storage.com/clients/…/6f5e5a81-….pdf
  size       : 232
  contentType: application/pdf

=== B. HEAD the same pathname with the PUBLIC token (vercel_blob_rw_C1vIJJ…) ===
NOT found in public store: Error - Vercel Blob: The requested blob does not exist

=== C. Store id derived from the returned URL host ===
  host prefix : aibvm9yweidc0qgp
  BLOB_STORE_ID       : store_AiBVM9YwEidc0qgp
  PUBLIC_BLOB_STORE_ID: store_C1vIJJKVYt1skkFe
  host starts with PRIVATE store id suffix? true
  host starts with PUBLIC  store id suffix? false
```

Three independent confirmations: the URL host `aibvm9yweidc0qgp` is
`store_AiBVM9YwEidc0qgp` lowercased; the host's subdomain is literally
`.private.`; and the object is absent from the public store.

Store counts before → after: **private 4 → 5, public 195 → 195**. The public
store gained nothing and holds zero `clients/`-prefixed objects.

The stored key is opaque — `clients/<clientId>/<uuid>.pdf`. The
condition-naming filename appears nowhere in it; the extension came from the
browser MIME type. The display name lives only in the `files` row.

## 2. The blob URL is not publicly fetchable — PASS

Raw store URL, `curl` with no cookies and no headers:

```
$ curl -sS -i "https://aibvm9yweidc0qgp.private.blob.vercel-storage.com/clients/…/6f5e5a81-….pdf"
HTTP/2 403
content-security-policy: default-src 'none'; …
x-content-type-options: nosniff
server: Vercel

Forbidden

$ curl -sS -o /dev/null -w "HTTP %{http_code}  bytes=%{size_download}\n" "$URL"
HTTP 403  bytes=10
```

403 Forbidden, 10 bytes — the string `Forbidden`, not the 232-byte PDF. No
document bytes are served to an anonymous caller.

Worth recording *why* this holds beyond store configuration: the app never puts a
fetchable URL into circulation. `saveFile` stores `blob.pathname`, not
`blob.url`, and the download route streams bytes rather than redirecting to a
signed URL — a signed URL is a bearer token that can be copied out of a browser
and replayed until expiry.

## 3. The proxy authorizes correctly, both directions — PASS

Sessions obtained through the real `POST /api/auth/login` (both returned 200),
cookies carried per request.

Casey is the *owner* of her own documents, so requesting them is not a genuine
non-entitlement. Two real denials were constructed instead: Casey requesting a
**different client's** document (Jordan Lee, client `…2002`), and a request with
no session at all.

```
=== 3a. ENTITLED: staff (brendan, admin) downloads the test doc ===
HTTP 200  bytes=232  type=application/pdf
cache-control: private, no-store
content-disposition: attachment; filename="hiv-test-results-AUDITTEST.pdf"
marker present in downloaded bytes? 1

=== 3b. ENTITLED: Casey downloads HER OWN doc ===
HTTP 200  bytes=129806  type=application/pdf

=== 3c. NOT ENTITLED: Casey requests JORDAN LEE's doc ===
Not found
HTTP 404  bytes=9

=== 3d. NOT ENTITLED: no session at all ===
{"error":"Sign in required."}
HTTP 401  bytes=29
```

The entitled download returned the exact bytes uploaded (the embedded marker
string matched), so this is a real byte-for-byte round trip, not just a 200.

The cross-client denial returns **404, not 403** — the handler declines to
confirm that another client's document even exists. That is the better choice.

## 4. Audit rows for both read and write, no PHI — PASS (with a caveat)

Every audit row touching the test document:

```
  id=2604  action=file.upload    entity=file
  actor_id=00000000-0000-4000-8000-000000001001
  entity_id=c8585c68-c265-4260-bc48-ec66f301818c
  meta={"kind":"upload","clientId":"00000000-0000-4000-8000-000000002001","sizeBytes":232}

  id=2609  action=file.view      entity=file
  meta={"clientId":"00000000-0000-4000-8000-000000002001"}

  id=2610  action=file.download  entity=file
  meta={"clientId":"00000000-0000-4000-8000-000000002001"}

  has a WRITE (file.upload)? true
  has a READ  (file.download)? true
```

PHI scan across all 35 audit rows written during the test window:

```
  absent  : filename 'hiv-test-results'
  absent  : the word 'hiv'
  absent  : client first name 'Casey'
  absent  : client last name 'Morgan'
  absent  : other client 'Jordan'
  absent  : '.pdf' (any filename)
  absent  : 'diagnos'
  absent  : blob pathname 'clients/'
```

Every distinct `meta` key and value in the window:

```
  keys  : clientId, count, kind, scope, sizeBytes, status
  values: count: 3, 2, 4, 18 | status: null | scope: "all" | kind: "upload"
          clientId: "…2001", "…2002" | sizeBytes: 232
```

Identifiers and enums only. The adversarial filename — which a careless
implementation would have logged — appears in no audit row.

**Caveat (audit fidelity, not a leak).** In
`app/api/files/download/route.ts:24`, `getFile(id)` runs before the
authorization check at lines 28–34, and `getFile` calls `auditRead("file.view")`
internally. So Casey's *denied* request for Jordan's document still wrote a row:

```
  action=file.view actor=00000000-0000-4000-8000-000000001003 meta={"clientId":"…2002"}
```

No bytes were served and there is no `file.download` row — the denial worked. But
the trail records a denied attempt as an apparently successful `file.view`, so an
auditor reading this table would over-count access. Recommend a distinct action
(`file.access.denied`) or moving `auditRead` after authorization. Flagged, not
fixed — this pass changes no code.

## 5. Deployed-environment token scoping — FAIL

`vercel env ls` shows three separate `BLOB_READ_WRITE_TOKEN` entries (Production
created 6d ago; Preview and Development 14d ago) and a `BLOB_STORE_ID` scoped
Production+Preview reading `store_AiBVM9YwEidc…`. Names alone looked right.

Values were pullable, so this did not have to rest on inference. Pulled each
environment to a temp path (never `.env.local`) and read only the store handle
embedded in each token — `vercel_blob_rw_<STOREID>_<secret>`:

```
=== PROD ===
  BLOB_READ_WRITE_TOKEN          -> store handle pEUdPNgwDxSyMRzx    *** UNKNOWN STORE ***
  BLOB_STORE_ID                  -> store_AiBVM9YwEidc0qgp
  PUBLIC_BLOB_READ_WRITE_TOKEN   -> store handle C1vIJJKVYt1skkFe    PUBLIC store_C1vIJJ

=== PREVIEW ===
  BLOB_READ_WRITE_TOKEN          -> store handle pEUdPNgwDxSyMRzx    *** UNKNOWN STORE ***
  BLOB_STORE_ID                  -> store_AiBVM9YwEidc0qgp

=== DEVELOPMENT ===
  BLOB_READ_WRITE_TOKEN          -> store handle pEUdPNgwDxSyMRzx    *** UNKNOWN STORE ***
```

The token every deployed environment uses points at a **third** store, matching
neither the audited private store nor the marketing public store. Identifying it:

```
Production BLOB_READ_WRITE_TOKEN store handle: pEUdPNgwDxSyMRzx
blobs in the store Production actually writes to: 10
URL host of that store: peudpngwdxsymrzx.public.blob.vercel-storage.com
  -> subdomain marker: PUBLIC
  pathnames under clients/ : 0
  sample pathname SHAPE    : assets/leuk-10.avif
Same store as local BLOB_READ_WRITE_TOKEN (store_AiBVM9…)? NO
```

It is a **public** store holding 10 legacy marketing assets and **zero**
`clients/` objects. `lib/blob.ts` selects the store by *token*, and ignores
`BLOB_STORE_ID` entirely — so the correct-looking `BLOB_STORE_ID` in Production
is vestigial and actively misleading.

**Does this leak PHI?** No — it fails closed. Simulating exactly what production
app code does (`put(key, bytes, { access: "private" })` with the Production
token), with a non-PHI probe file since deleted:

```
RESULT: upload FAILED (this is the safer failure mode)
  error name   : Error
  error message: Vercel Blob: Cannot use private access on a public store.
                 The store must be configured with private access.
```

So the impact is **availability, not confidentiality**: document upload in
Production is broken. `POST /api/files` has no handler for this throw — it falls
through to a 500, surfacing to the user as "Upload failed (500)". The existing
guard does not catch it either: it tests only that `BLOB_READ_WRITE_TOKEN` is
*present*, never that it points at a private store. Zero `clients/` objects in
that public store confirms no document has ever been written there.

**Fix (not applied — outside this pass):** repoint `BLOB_READ_WRITE_TOKEN` in
Production, Preview and Development at `store_AiBVM9YwEidc0qgp`, then re-run
items 1–3 against a deployment. Items 1–4 above were proven against the **local**
environment only.

## Test-data cleanup

One document uploaded, one probe blob written to the Production public store.
Both removed; counts returned to baseline.

```
BEFORE: files for Casey: 3 | private store blobs: 5 | audit_events: 2624
DELETE: blob deleted (head 404s) | files rows deleted: 1 hiv-test-results-AUDITTEST.pdf
AFTER : files for Casey: 2 | private store blobs: 4 | audit_events: 2624
```

Baseline at the start of the session was **Casey 2 / private 4 / public 195** —
matched exactly. The Production probe blob was deleted and its absence verified
(`head` 404s). The public marketing store was never written to. Pulled env files
containing real secrets were removed with `rm -P`; no token or secret value
appears in this report.

**One deliberate exception:** the 3 `audit_events` rows for the test document
were **retained**. `audit_events` is append-only by design and the rows contain
no PHI (proven above); deleting audit history to tidy up is the habit the table
exists to prevent. They reference a `file` id that no longer exists, which is the
normal state of any deleted document. Overrule me if you want them gone.

## Claims this audit supports

Minimal, exact statements a UI trust indicator may make. **Scoped to the local
environment** — item 5 means none of these are yet proven for Production.

1. Documents are stored in a private storage bucket, separate from the bucket
   used for public marketing assets.

2. A document's storage URL returns "403 Forbidden" to anyone without
   authorization; the file's bytes are not served.

3. Every download is checked against the signed-in user: practice staff can
   retrieve a client's documents, and a client can retrieve only their own. A
   request for someone else's document is refused, as is a request with no
   sign-in.

4. The stored filename is a random identifier. The name you upload is never used
   as the storage key and never appears in system logs.

5. Uploads and downloads are both recorded in an append-only audit log that
   holds identifiers and timestamps only — no names, no filenames, no clinical
   detail.

### Explicitly NOT supported — do not imply these

- **Encryption at rest was not tested.** Say nothing about encryption, at rest or
  in transit, on the basis of this audit.
- **"Private" here means access-controlled storage**, not end-to-end or
  zero-knowledge encryption. Anthropic-hosted infrastructure and Vercel Blob
  operators are not excluded from access by anything measured here.
- **No claim about Production.** Until item 5 is fixed and items 1–3 re-run
  against a deployment, these statements describe the local environment only.
- No HIPAA compliance, BAA, or certification claim follows from any of this.
- Audit-log completeness is not proven: a denied access is currently recorded as
  a view (item 4 caveat), so "every access is accurately logged" is not yet true.
