import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/page-hero";
import { Section, SectionHeading } from "@/components/site/section";
import { Steps } from "@/components/site/steps";
import { FeatureGrid } from "@/components/site/feature-grid";
import { CtaBand } from "@/components/site/cta-band";
import { CONDITION_TOPICS } from "@/lib/site-content";

// /for-physicians — primary care & referring clinicians. The whole point is a
// frictionless, trusted referral channel with closed-loop communication back.
// NEW (public marketing site).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "For physicians — refer to Leuk with confidence",
  description:
    "Refer your patients to verified New York mental health providers — no portal login, no fax. Closed-loop communication back to you.",
};

const REFERRAL_EMAIL = "mailto:referrals@leuk.demo";

export default function PhysiciansPage() {
  return (
    <>
      <PageHero
        eyebrow="For physicians"
        title="Refer with confidence."
        lede="Most psychiatric referrals start in primary care. Send yours to a verified New York provider in minutes — and actually hear back."
        primary={{ href: "/providers", label: "Refer a patient" }}
        secondary={{ href: "#how", label: "How referral works" }}
      />

      {/* How referral works */}
      <Section id="how">
        <SectionHeading
          title="A referral that takes minutes, not faxes."
          lede="Make it genuinely easy — that's the whole point of the channel."
        />
        <Steps
          className="mt-12"
          steps={[
            {
              title: "Send the referral",
              body: "Search and book on your patient's behalf, or send us the details. No portal login, no fax machine.",
              icon: "send",
            },
            {
              title: "We match & schedule",
              body: "Your patient is matched to an in-network provider and booked — often the same week.",
              icon: "calendar-check",
            },
            {
              title: "You hear back",
              body: "Closed-loop: you get confirmation of the visit and, with your patient's consent, a summary back.",
              icon: "corner-down-right",
            },
          ]}
        />
      </Section>

      {/* Closed-loop / what your patient gets */}
      <Section ground="canvas">
        <SectionHeading title="What happens to your patient." />
        <FeatureGrid
          className="mt-12"
          items={[
            {
              icon: "person-circle",
              title: "A real match",
              body: "Matched to a provider by specialty, coverage, and availability — not the next open slot anywhere.",
            },
            {
              icon: "calendar-check",
              title: "Seen quickly",
              body: "Same-week booking is common, virtual or in person, so momentum from your visit isn't lost.",
            },
            {
              icon: "file-text",
              title: "You stay in the loop",
              body: "Confirmation and, with consent, a clinical summary come back to you — the loop actually closes.",
            },
          ]}
        />
      </Section>

      {/* Who we treat */}
      <Section>
        <SectionHeading title="Who we treat." lede="A full range of conditions across therapy and psychiatry." />
        <div className="mt-8 flex flex-wrap gap-2.5">
          {CONDITION_TOPICS.map((t) => (
            <Link
              key={t.slug}
              href={`/care/${t.slug}`}
              className="rounded-full border border-border bg-surface px-4 py-2 text-[15px] font-medium text-text transition-colors hover:border-primary hover:text-primary"
            >
              {t.label}
            </Link>
          ))}
        </div>
      </Section>

      <CtaBand
        title="Send your first referral."
        lede="Refer a patient now, or reach our care team to set up a standing referral relationship."
        ground="canvas"
        primary={{ href: "/providers", label: "Refer a patient" }}
        secondary={{ href: REFERRAL_EMAIL, label: "Contact our care team" }}
      />
    </>
  );
}
