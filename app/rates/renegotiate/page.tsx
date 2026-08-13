import { redirect } from "next/navigation";
import { PrintActions } from "@/components/billing/print-actions";
import { clinicianName } from "@/components/rates/clinician-name";
import { Logo } from "@/components/ui/logo";
import { getUser } from "@/lib/auth";
import { getAffiliationEconomics, getCredentialingFootprint } from "@/lib/repos/rate-signals";

// The rate-renegotiation letter — the "Generate report" the economics dialog
// promises (NYS-91 item 5). Where the AFFILIATION ECONOMICS one-pager (/rates/
// economics) SHOWS the clinician the gap, this WRITES the argument for closing
// it: a letter to the payer citing its own two schedules for the same service
// and asking to bring the lower up to the higher. The clinician sends it; we
// never negotiate on their behalf.
//
// Outside the (app) route group (print-surface H1 exception), same as
// /rates/{packet,dispute,economics,card}.

export const dynamic = "force-dynamic";

export default async function RenegotiatePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ npi?: string; payer?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  if (user.role === "client") redirect("/portal");

  const { npi: npiParam, payer } = await searchParams;
  const npi = npiParam?.trim() ?? "";
  if (!/^\d{10}$/.test(npi)) redirect("/rates");

  const [footprint, allCards] = await Promise.all([
    getCredentialingFootprint(npi),
    getAffiliationEconomics(npi),
  ]);
  // The letter argues ONE payer's internal spread (a letter to Cigna citing
  // Aetna's rates would persuade nobody). Default to the payer the button named;
  // fall back to every multi-TIN payer if none was passed.
  const cards = payer ? allCards.filter((c) => c.payer === payer) : allCards;
  const name = footprint.identity ? clinicianName(footprint.identity.name) : npi;
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
            <h1 className="text-[20px] font-bold tracking-wide text-text">RATE RENEGOTIATION REQUEST</h1>
            <p className="mt-1 text-sm text-text-muted">
              {payer ? `to ${payer} · ` : ""}
              {today}
            </p>
          </div>
        </div>

        {cards.length === 0 ? (
          <p className="mt-8 text-[15px] text-text-body">
            No payer pays this NPI two different schedules for the same service on file, so there is no internal spread
            to cite. Nothing to renegotiate from here.
          </p>
        ) : (
          <>
            <div className="mt-8 space-y-4 text-[14px] leading-relaxed text-text-body">
              <p>To the {cards.length === 1 ? `${cards[0].payer} ` : ""}network-management team,</p>
              <p>
                I am <span className="font-semibold text-text">{name}</span> (NPI{" "}
                <span className="font-semibold text-text">{npi}</span>). Your own published in-network file pays me two
                different rates for the same service, depending on which contract holder the claim rides under. I am
                asking that the lower schedule be brought up to the higher.
              </p>
            </div>

            {cards.map((card) => (
              <div key={card.payer} className="mt-7">
                <h2 className="text-[16px] font-semibold text-text">
                  {card.payer} — the same code, two schedules
                </h2>
                <table className="mt-2 w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b-2 border-text/80 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
                      <th className="py-1.5 pr-3">Service</th>
                      <th className="py-1.5 pr-3">Higher schedule</th>
                      <th className="py-1.5 pr-3">Lower schedule</th>
                      <th className="py-1.5">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.codes.map((c) => {
                      const top = c.entries[0];
                      const bottom = c.entries[c.entries.length - 1];
                      // Two TINs can resolve to the SAME display name; show the
                      // TIN too so the higher and lower are visibly two billing
                      // groups, not one group named twice.
                      const sameHolder = top.holder === bottom.holder;
                      return (
                        <tr key={c.billingCode} className="border-b border-border align-top text-[13.5px] text-text-body">
                          <td className="py-1.5 pr-3 font-medium text-text">{c.billingCode}</td>
                          <td className="py-1.5 pr-3">
                            {top.display}
                            <span className="block text-[12.5px] text-text-muted">
                              {top.holder}
                              {sameHolder ? ` · ${top.tin}` : ""}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3">
                            {bottom.display}
                            <span className="block text-[12.5px] text-text-muted">
                              {bottom.holder}
                              {sameHolder ? ` · ${bottom.tin}` : ""}
                            </span>
                          </td>
                          <td className="py-1.5 font-medium text-text">{c.gapDisplay}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}

            <div className="mt-7 space-y-4 text-[14px] leading-relaxed text-text-body">
              <h2 className="text-[16px] font-semibold text-text">What I am asking for</h2>
              <p>
                Please align my lower schedule{cards.length === 1 ? "" : "s"} to the higher rate you already pay me for
                the identical service, and confirm the revised fee schedule in writing. The care rendered is the same;
                the rate should not turn on which billing group files it.
              </p>
            </div>

            <div className="mt-8 space-y-1 text-[14px] text-text-body">
              <p>Sincerely,</p>
              <p className="mt-6 font-semibold text-text">{name}</p>
              <p>NPI {npi}</p>
              {footprint.identity?.license && <p>License {footprint.identity.license}</p>}
            </div>
          </>
        )}

        <p className="mt-8 border-t border-border pt-4 text-[12.5px] leading-relaxed text-text-muted">
          Every figure here is {payer ?? "the payer"}&rsquo;s own published Transparency-in-Coverage rate. Rates belong
          to the contract that renders the care — this letter asks the payer to align its schedules, and does not change
          how any claim is coded. Leuk does not negotiate on your behalf.
        </p>
      </div>
    </div>
  );
}
