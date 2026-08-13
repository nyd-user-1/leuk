import { redirect } from "next/navigation";
import { PrintActions } from "@/components/billing/print-actions";
import { clinicianName } from "@/components/rates/clinician-name";
import { Logo } from "@/components/ui/logo";
import { getUser } from "@/lib/auth";
import { getCredentialingFootprint } from "@/lib/repos/rate-signals";

// The credentialing-packet one-pager — deliberately OUTSIDE the (app) route
// group (the print-surface H1 exception). Everything the directory holds,
// formatted for transcription into any payer's application; explicit blank
// lines for what we don't hold. We never submit on the provider's behalf.

export const dynamic = "force-dynamic";

const BLANK_FIELDS = ["CAQH ID", "Malpractice carrier / policy #", "W-9 on file"];

export default async function CredentialingPacketPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ npi?: string; payer?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  if (user.role === "client") redirect("/portal");

  const { npi: npiParam, payer } = await searchParams;
  const npi = npiParam?.trim() ?? "";
  if (!/^\d{10}$/.test(npi) || !payer) redirect("/rates");

  const footprint = await getCredentialingFootprint(npi);
  const name = footprint.identity ? clinicianName(footprint.identity.name) : npi;

  return (
    <div className="print-page min-h-screen bg-canvas py-8">
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          .print-page { background: white !important; padding: 0 !important; }
          .print-sheet { box-shadow: none !important; border: none !important; border-radius: 0 !important; margin: 0 !important; max-width: none !important; padding: 0 !important; }
          @page { margin: 16mm; }
        }
      `}</style>

      <PrintActions />

      <div className="print-sheet mx-auto max-w-[820px] rounded-card border border-border bg-surface p-10 shadow-card">
        <div className="flex items-start justify-between">
          <Logo size="md" />
          <div className="text-right">
            <h1 className="text-[20px] font-bold tracking-wide text-text">CREDENTIALING PACKET</h1>
            <p className="mt-1 text-sm text-text-muted">prepared for {payer}</p>
          </div>
        </div>

        <p className="mt-6 text-[15px] text-text-body">
          Credentialing packet — <span className="font-semibold text-text">{name}</span>, prepared for{" "}
          <span className="font-semibold text-text">{payer}</span>.
        </p>

        <div className="mt-7">
          <h2 className="text-[16px] font-semibold text-text">Identity — held by Leuk</h2>
          <table className="mt-2 w-full border-collapse text-left text-[13.5px]">
            <tbody>
              <tr className="border-b border-border">
                <td className="w-48 py-1.5 pr-3 font-medium text-text-muted">NPI</td>
                <td className="py-1.5 text-text">{npi}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-1.5 pr-3 font-medium text-text-muted">Name</td>
                <td className="py-1.5 text-text">{name}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-1.5 pr-3 font-medium text-text-muted">Profession</td>
                <td className="py-1.5 text-text">{footprint.identity?.profession ?? "—"}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-1.5 pr-3 font-medium text-text-muted">License</td>
                <td className="py-1.5 text-text">{footprint.identity?.license ?? "—"}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-1.5 pr-3 font-medium text-text-muted">Taxonomy</td>
                <td className="py-1.5 text-text">{footprint.identity?.taxonomy ?? "—"}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-1.5 pr-3 font-medium text-text-muted">Practice address</td>
                <td className="py-1.5 text-text">{footprint.identity?.address ?? "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-7">
          <h2 className="text-[16px] font-semibold text-text">Current network participation</h2>
          {footprint.foundIn.length === 0 ? (
            <p className="mt-2 text-[13.5px] text-text-muted">No other published NY-book participation on file.</p>
          ) : (
            <table className="mt-2 w-full border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-text/80 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
                  <th className="py-1.5 pr-3">Payer</th>
                  <th className="py-1.5 pr-3">Holder</th>
                  <th className="py-1.5">As-of</th>
                </tr>
              </thead>
              <tbody>
                {footprint.foundIn.map((b) => (
                  <tr key={`${b.payer}|${b.tin}`} className="border-b border-border text-[13.5px] text-text-body">
                    <td className="py-1.5 pr-3 font-medium text-text">{b.payer}</td>
                    <td className="py-1.5 pr-3">{b.holder}</td>
                    <td className="py-1.5">{b.asOf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-7">
          <h2 className="text-[16px] font-semibold text-text">Not on file — for you to fill in</h2>
          <table className="mt-2 w-full border-collapse text-left text-[13.5px]">
            <tbody>
              {BLANK_FIELDS.map((f) => (
                <tr key={f} className="border-b border-border">
                  <td className="w-56 py-2.5 pr-3 font-medium text-text-muted">{f}</td>
                  <td className="py-2.5 text-text-muted">________________________________</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-8 border-t border-border pt-4 text-[12.5px] leading-relaxed text-text-muted">
          Formatted for transcription into any payer&rsquo;s application — Leuk does not submit applications on
          your behalf. Presence in current network participation is the payer&rsquo;s own published attestation as
          of the file date, not a guarantee this payer will credential you.
        </p>
      </div>
    </div>
  );
}
