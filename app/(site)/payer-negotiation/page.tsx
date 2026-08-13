import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";
import { Section, SectionHeading } from "@/components/site/section";
import { FeatureGrid } from "@/components/site/feature-grid";
import { CtaBand } from "@/components/site/cta-band";
import { PayerSpreadTable } from "@/components/site/payer-spread-table";
import { RateIntelFamily } from "@/components/site/rate-intel-family";
import { get90837Spread } from "@/lib/repos/public-stats";

// /payer-negotiation — the leverage page. You cannot negotiate a rate you
// cannot see; the payer already published theirs, and we hold it next to every
// other payer's. Arms the clinician with the market median, made of live data,
// not adjectives. NEW (public marketing site) — rate-intelligence family.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payer negotiation — argue from the payer's own number | Leuk",
  description:
    "You can't negotiate a rate you can't see. The payer already published theirs. See the market median for a session, by payer, and walk into the conversation with evidence.",
};

const CONTACT = "mailto:partnerships@leuk.demo";

export default async function PayerNegotiationPage() {
  const spread = await get90837Spread();

  return (
    <>
      <PageHero
        eyebrow="Negotiate from evidence"
        title="You can't argue a number you can't see."
        lede="Every plan already published what it pays in-network. The problem was never leverage — it was visibility. We hold each payer's own figure next to all the others, so the conversation starts from evidence instead of a hunch."
        primary={{ href: "/for-providers", label: "For providers" }}
        secondary={{ href: CONTACT, label: "Talk to us" }}
        innerClassName="pb-15 sm:pb-15"
      />

      {/* The leverage moment — the spread IS the argument, straight off the hero. */}
      <Section ground="page" innerClassName="pt-0 sm:pt-0">
        <PayerSpreadTable spread={spread} />
      </Section>

      {/* What a Leuk practice actually gets — described truthfully. */}
      <Section ground="page">
        <SectionHeading
          title="What a Leuk practice sees."
          lede="Not a promise of a raise — a clear picture of where you stand. Everything here is built from payers' own published attestations; none of it is a projection."
        />
        <FeatureGrid
          className="mt-12"
          columns={2}
          items={[
            {
              icon: "activity",
              title: "Your books, ranked by what they pay",
              body: "Every New York book you're published in, ordered by its median for your codes — so you know which contracts are carrying you and which are quietly below market.",
            },
            {
              icon: "list-filter",
              title: "Flat schedule or negotiated per group",
              body: "We show whether a payer publishes one rate for everyone or a wide band — the difference between a take-it-or-leave-it schedule and a number groups actually move.",
            },
            {
              icon: "graduation-cap",
              title: "Priced within your license tier",
              body: "Bands are computed inside license tiers — masters-level, psychologist, prescriber — from the statewide directory, so the median you compare against is your peers, not a blended average.",
            },
            {
              icon: "calendar-check",
              title: "Every figure carries its date",
              body: "A rate proves a contract existed on a file date. Each median travels with an as-of, so you're never negotiating off a number that went stale two refreshes ago.",
            },
          ]}
        />
      </Section>

      <CtaBand
        eyebrow="Walk in prepared"
        title="Bring the payer's own number to the table."
        lede="Join Leuk and see your payer mix beside the market median, by code, kept current."
        ground="page"
        primary={{ href: "/join", label: "Bring your practice onto Leuk" }}
        secondary={{ href: "/for-providers", label: "For providers" }}
      />

      <RateIntelFamily current="payer-negotiation" />
    </>
  );
}
