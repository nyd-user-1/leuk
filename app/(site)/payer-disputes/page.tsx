import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { InsurerMark } from "@/components/rates/insurer-mark";
import { PageHero } from "@/components/site/page-hero";
import { Section, SectionHeading } from "@/components/site/section";
import { StatBand } from "@/components/site/stat-band";
import { CtaBand } from "@/components/site/cta-band";
import { Placeholder } from "@/components/site/placeholder";
import { CountUp } from "@/components/site/count-up";
import { RateIntelFamily } from "@/components/site/rate-intel-family";
import { getCorpusStats, get90837Spread } from "@/lib/repos/public-stats";
import { formatDate } from "@/lib/format";

// /payer-disputes — the evidence page. An underpayment dispute is strongest
// when the evidence is the payer's OWN published attestation — which is exactly
// what each row of the corpus is, with a file date. Shows the SHAPE of that
// evidence from real aggregate medians (no real org singled out) and the NY
// entity layer that makes an exhibit name an entity a regulator recognizes.
// NEW (public marketing site) — rate-intelligence family.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Underpayment disputes — the payer's own receipts | Leuk",
  description:
    "The strongest evidence in an underpayment dispute is the payer's own published in-network rate. That is exactly what the corpus is — an attestation, with a file date, tied to a real entity.",
};

const CONTACT = "mailto:partnerships@leuk.demo";

// A live corpus number that counts up on scroll-into-view, or a visible
// placeholder when a read is unavailable. Never a hardcoded number.
function statValue(n: number | null, opts: { compact?: boolean; suffix?: string }, token: string): ReactNode {
  return n != null ? (
    <CountUp to={n} format={opts.compact ? "compact" : "int"} suffix={opts.suffix ?? ""} />
  ) : (
    <Placeholder token={token} />
  );
}

// The exhibit — the shape of the evidence, built from a real aggregate median.
// A public entity is named (the payer); no org, provider, or claim is. Labeled
// illustrative so it reads as "what an exhibit looks like", never a real record.
function EvidenceExhibit({
  payer,
  code,
  codeLabel,
  median,
  asOf,
}: {
  payer: string;
  code: string;
  codeLabel: string;
  median: string;
  asOf: string | null;
}) {
  const rows: Array<{ label: string; value: ReactNode }> = [
    {
      label: "Payer",
      value: (
        <span className="flex items-center gap-2.5">
          <InsurerMark payer={payer} />
          <span className="font-medium text-text">{payer}</span>
        </span>
      ),
    },
    { label: "Billing code", value: <span className="text-text">{code} · {codeLabel}</span> },
    {
      label: "Published in-network median",
      value: <span className="font-display text-lg font-semibold text-text">{median}</span>,
    },
    { label: "As of", value: <span className="text-text">{asOf ? formatDate(asOf) : "—"}</span> },
    {
      label: "Source",
      value: <span className="text-text">Payer machine-readable file · Transparency in Coverage</span>,
    },
  ];
  return (
    <figure className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <figcaption className="flex items-center justify-between gap-3 border-b border-border bg-canvas px-6 py-4">
        <span className="flex items-center gap-2.5 font-display text-[17px] font-semibold text-text">
          <Icon name="file-text" size={20} className="text-primary" />
          Exhibit · the payer&rsquo;s own attestation
        </span>
        <span className="rounded-field border border-dashed border-accent-ink/50 bg-amber-100 px-2 py-0.5 text-[12px] font-medium text-accent-ink">
          Illustrative
        </span>
      </figcaption>
      <dl className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-1 gap-1 px-6 py-3.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center sm:gap-4">
            <dt className="text-[13px] font-medium uppercase tracking-[0.08em] text-text-muted">{r.label}</dt>
            <dd className="min-w-0">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-border px-6 py-4 text-[13px] leading-relaxed text-text-muted">
        Built from the aggregate published median across New York books — the shape of an exhibit, not a specific
        claim. On Leuk, the exact plan × provider × code figure appears privately to the clinician.
      </p>
    </figure>
  );
}

export default async function PayerDisputesPage() {
  const [stats, spread] = await Promise.all([getCorpusStats(), get90837Spread()]);
  // A representative book (the middle of the ranked spread) — not cherry-picked
  // to the extreme, and only ever a public payer entity, never an org.
  const exhibit = spread.rows.length ? spread.rows[Math.floor(spread.rows.length / 2)] : null;

  return (
    <>
      <PageHero
        eyebrow="Dispute with receipts"
        title="The best evidence is the payer's own file."
        lede="An underpayment dispute turns on one question: what did the plan agree to pay? The answer isn't yours to assert — the payer already published it. Each row of our corpus is that attestation, carrying the date it was filed."
        primary={{ href: CONTACT, label: "Talk to us" }}
        secondary={{ href: "/for-providers", label: "For providers" }}
      />

      {/* The argument + the exhibit, side by side. */}
      <Section ground="page">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <SectionHeading
              eyebrow="What evidence looks like"
              title="A number they filed, not a number you claim."
              lede="A dispute built on your own spreadsheet is an argument. A dispute built on the payer's own published rate is a receipt. The corpus is made entirely of the second kind."
            />
            <ul className="mt-8 space-y-4">
              {[
                "Each row is the payer's own in-network attestation — their disclosure, not our inference.",
                "Every figure carries a file date, so it proves what was on the record and when.",
                "It's matched to a real insurer and network, so the exhibit names an entity the payer recognizes.",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <Icon name="circle-check" size={20} className="mt-0.5 shrink-0 text-primary" />
                  <span className="text-[15px] leading-relaxed text-text-body">{point}</span>
                </li>
              ))}
            </ul>
          </div>
          {exhibit ? (
            <EvidenceExhibit
              payer={exhibit.payer}
              code={spread.code}
              codeLabel={spread.codeLabel}
              median={exhibit.median}
              asOf={exhibit.asOf}
            />
          ) : (
            <div className="rounded-card border border-border bg-surface p-8 text-center text-[15px] text-text-body shadow-card">
              The live exhibit is loading from the rate corpus.
            </div>
          )}
        </div>
      </Section>

      {/* NY credibility — the regulator's own registry, not name-matching. */}
      <Section ground="page">
        <SectionHeading
          eyebrow="Why it holds up in New York"
          title="Matched to the regulator's own registry."
          lede="Payer files name the same company a dozen different ways. Name-matching guesses; we don't. Every rate is matched to a real insurer drawn from the New York Department of Financial Services list — so an exhibit names the licensed entity, not a string that happened to match."
        />
        <StatBand
          className="mt-14"
          stats={[
            {
              value: statValue(stats.insurers, {}, "{{STAT:insurers}}"),
              label: "Insurers",
              note: "From the NY DFS registry",
            },
            {
              value: statValue(stats.networks, {}, "{{STAT:networks}}"),
              label: "Networks",
              note: "Across New York payer books",
            },
            {
              value: statValue(stats.planFilings, { compact: true, suffix: "+" }, "{{STAT:plan_filings}}"),
              label: "Plan filings",
              note: "DOL Form 5500 — the plan and its sponsor",
            },
          ]}
        />
      </Section>

      <CtaBand
        eyebrow="Build the case"
        title="Start from the payer's own number."
        lede="Tell us what you're seeing on underpayments, and we'll show you how the corpus turns a plan's own file into evidence."
        ground="page"
        primary={{ href: CONTACT, label: "Talk to us" }}
        secondary={{ href: "/for-providers", label: "For providers" }}
      />

      <RateIntelFamily current="payer-disputes" />
    </>
  );
}
