import type { Metadata } from "next";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Nav } from "@/components/marketing/nav";
import { PageHero } from "@/components/site/page-hero";
import { Section, SectionHeading } from "@/components/site/section";
import { FeatureGrid } from "@/components/site/feature-grid";
import { CtaBand } from "@/components/site/cta-band";

// /company/press — media inquiries + press kit. NEW.

export const dynamic = "force-dynamic";

const PRESS_EMAIL = "mailto:press@leuk.demo";

export const metadata: Metadata = {
  title: "Press · Leuk",
  description:
    "Media inquiries, brand assets, and background on Leuk's New York mental-health directory and practice-management platform.",
};

export default function PressPage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Nav />
      <main className="flex-1">
        <PageHero
          eyebrow="Press"
          title="Reporting on mental-health access in New York?"
          lede="We're happy to talk through the directory, the data behind it, or what practices are telling us about the state of care access. Reach out and we'll get back to you personally — no press office runaround."
          primary={{ href: PRESS_EMAIL, label: "Email our press contact" }}
        />

        <Section>
          <SectionHeading title="What we can help with" />
          <FeatureGrid
            className="mt-12"
            columns={3}
            items={[
              {
                icon: "activity",
                title: "Access & outcomes data",
                body: "Aggregate, de-identified data on time-to-appointment, in-network coverage, and demand across New York.",
              },
              {
                icon: "message-circle-heart",
                title: "Founder & clinician interviews",
                body: "Perspective from the team and from Leuk-network clinicians on what's actually broken in finding care.",
              },
              {
                icon: "download",
                title: "Brand & logo assets",
                body: "Logo files and usage guidelines for anyone writing about Leuk.",
              },
            ]}
          />
        </Section>

        <Section ground="canvas" innerClassName="text-center">
          <p className="mx-auto max-w-xl text-pretty text-[15px] leading-relaxed text-text-body">
            We haven't been covered yet — Leuk is early. If that changes, we'll list it here.
          </p>
        </Section>

        <CtaBand
          title="Let's talk."
          lede="Send us a note and we'll route it to the right person, usually within a day."
          primary={{ href: PRESS_EMAIL, label: "press@leuk.demo" }}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
