import { redirect } from "next/navigation";
import { PrintActions } from "@/components/billing/print-actions";
import { clinicianName } from "@/components/rates/clinician-name";
import { Logo } from "@/components/ui/logo";
import { getUser } from "@/lib/auth";
import { getCredentialingFootprint } from "@/lib/repos/rate-signals";

// The roster-dispute letter — the other half of "is this listing you?".
//
// A payer publishing a clinician it no longer contracts with is the zombie-rate
// problem from the patient's side: the directory sends someone to a provider who
// cannot see them. The clinician is the only person who knows, and until now the
// product's answer to "this is NOT me" was nothing. This writes the letter FOR
// them, citing the payer's own published file and the exact rows — they forward
// it; we never submit on their behalf.
//
// Deliberately OUTSIDE the (app) route group (the print-surface H1 exception),
// same as /rates/packet, whose pattern this follows.

export const dynamic = "force-dynamic";

export default async function RosterDisputePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ npi?: string; payer?: string; tin?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  if (user.role === "client") redirect("/portal");

  const { npi: npiParam, payer, tin } = await searchParams;
  const npi = npiParam?.trim() ?? "";
  if (!/^\d{10}$/.test(npi) || !payer) redirect("/rates");

  const footprint = await getCredentialingFootprint(npi);
  const name = footprint.identity ? clinicianName(footprint.identity.name) : npi;
  // The disputed book: the one the clinician pressed the button on. Falling back
  // to every book this payer publishes them under keeps the letter truthful if
  // the tin param is missing rather than inventing a holder.
  const books = footprint.foundIn.filter((b) => b.payer === payer && (!tin || b.tin === tin));
  const today = new Date().toISOString().slice(0, 10);

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
            <h1 className="text-[20px] font-bold tracking-wide text-text">DIRECTORY CORRECTION REQUEST</h1>
            <p className="mt-1 text-sm text-text-muted">to {payer} · {today}</p>
          </div>
        </div>

        <div className="mt-8 space-y-4 text-[14px] leading-relaxed text-text-body">
          <p>To the {payer} provider-data team,</p>
          <p>
            I am <span className="font-semibold text-text">{name}</span> (NPI{" "}
            <span className="font-semibold text-text">{npi}</span>). Your published machine-readable in-network file
            lists me under {books.length === 1 ? "the contract holder below" : "the contract holders below"}. That
            listing is <span className="font-semibold text-text">not accurate</span>, and I am asking you to correct it.
          </p>
        </div>

        <div className="mt-7">
          <h2 className="text-[16px] font-semibold text-text">The rows I am disputing</h2>
          {books.length === 0 ? (
            <p className="mt-2 text-[13.5px] text-text-muted">
              No published rows for this payer are on file for this NPI — nothing to dispute.
            </p>
          ) : (
            <table className="mt-2 w-full border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-text/80 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
                  <th className="py-1.5 pr-3">Contract holder</th>
                  <th className="py-1.5 pr-3">TIN as published</th>
                  <th className="py-1.5 pr-3">Published rates</th>
                  <th className="py-1.5">File as-of</th>
                </tr>
              </thead>
              <tbody>
                {books.map((b) => (
                  <tr key={b.tin} className="border-b border-border align-top text-[13.5px] text-text-body">
                    <td className="py-1.5 pr-3 font-medium text-text">{b.holder}</td>
                    <td className="py-1.5 pr-3 font-mono text-[12.5px]">{b.tin}</td>
                    <td className="py-1.5 pr-3">
                      {Object.entries(b.codes).map(([code, display]) => (
                        <div key={code}>
                          {code} — {display}
                        </div>
                      ))}
                    </td>
                    <td className="py-1.5 whitespace-nowrap">{b.asOf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-7 space-y-4 text-[14px] leading-relaxed text-text-body">
          <h2 className="text-[16px] font-semibold text-text">What I am asking for</h2>
          <p>
            Please remove or correct the above {books.length === 1 ? "entry" : "entries"} in your published in-network
            file and in any consumer-facing directory that derives from it, and confirm in writing once the correction
            is scheduled to appear.
          </p>
          <p className="text-[13px] text-text-muted">
            Why this matters to you as much as to me: a directory entry for a clinician who does not hold that contract
            sends your members to an appointment that cannot happen, and it is the kind of inaccuracy that federal
            network-adequacy and directory-accuracy rules ask you to fix.
          </p>
        </div>

        <div className="mt-8 space-y-1 text-[14px] text-text-body">
          <p>Sincerely,</p>
          <p className="mt-6 font-semibold text-text">{name}</p>
          <p>NPI {npi}</p>
          {footprint.identity?.license && <p>License {footprint.identity.license}</p>}
          {footprint.identity?.address && <p>{footprint.identity.address}</p>}
        </div>

        <p className="mt-8 border-t border-border pt-4 text-[12.5px] leading-relaxed text-text-muted">
          Prepared from {payer}&rsquo;s own published Transparency-in-Coverage file as of the dates shown. Leuk does
          not submit this on your behalf — send it to the payer&rsquo;s provider-data or network-management contact.
          Keep a copy: the file date above is what makes the claim checkable.
        </p>
      </div>
    </div>
  );
}
