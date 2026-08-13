import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";
import { Section, SectionHeading } from "@/components/site/section";
import { FeatureGrid } from "@/components/site/feature-grid";
import { Steps } from "@/components/site/steps";
import { StatBand } from "@/components/site/stat-band";
import { CtaBand } from "@/components/site/cta-band";
import { Placeholder } from "@/components/site/placeholder";

// /for-employers — HR / benefits / EAP buyers. Access + outcomes for their
// people. NEW (public marketing site).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "For employers — mental health access for your people",
  description:
    "Give your people real access to therapy and psychiatric care across New York — with the engagement and outcomes a benefits team can measure.",
};

const EMPLOYER_EMAIL = "mailto:employers@leuk.demo";

export default function EmployersPage() {
  return (
    <>
      <PageHero
        eyebrow="For employers"
        title="Real mental health access for your people."
        lede="Therapy and psychiatric care your team can actually get to — quickly, in-network, virtual or in person — with outcomes you can report on."
        primary={{ href: EMPLOYER_EMAIL, label: "Talk to our team" }}
        secondary={{ href: "#how", label: "How it works" }}
      />

      {/* Coverage / access story */}
      <Section id="how">
        <SectionHeading
          title="Coverage your people will use."
          lede="Access is only real if it's fast, in-network, and easy to start."
        />
        <FeatureGrid
          className="mt-12"
          columns={4}
          items={[
            {
              icon: "calendar-check",
              title: "Fast access",
              body: "Same-week appointments across New York, so help arrives before a hard week becomes a hard month.",
            },
            {
              icon: "shield-plus",
              title: "In-network",
              body: "Works with the major plans your benefits already include — low or no out-of-pocket cost.",
            },
            {
              icon: "book-heart",
              title: "Therapy + medication",
              body: "Both kinds of care in one place, coordinated — not two vendors and two logins.",
            },
            {
              icon: "lock",
              title: "Private by design",
              body: "Care is confidential. You see engagement in aggregate, never an individual's clinical details.",
            },
          ]}
        />
      </Section>

      {/* Outcomes & engagement */}
      <Section ground="canvas">
        <SectionHeading eyebrow="By the numbers" title="Engagement and outcomes you can report." />
        <StatBand
          className="mt-12"
          stats={[
            { value: <Placeholder token="{{STAT:employer_engagement}}" />, label: "Eligible employees who engage" },
            { value: <Placeholder token="{{STAT:employer_time_to_care}}" />, label: "Median time to first visit" },
            { value: <Placeholder token="{{STAT:employer_satisfaction}}" />, label: "Member satisfaction" },
          ]}
        />
      </Section>

      {/* Implementation */}
      <Section>
        <SectionHeading title="Live in weeks, not quarters." />
        <Steps
          className="mt-12"
          steps={[
            {
              title: "Connect your benefits",
              body: "We confirm which plans your people carry and set up in-network access across New York.",
              icon: "link",
            },
            {
              title: "Launch to your team",
              body: "Simple materials your people can act on — no app to force, no long onboarding.",
              icon: "send",
            },
            {
              title: "Measure & report",
              body: "Aggregate engagement and outcome reporting your benefits team can bring to leadership.",
              icon: "file-text",
            },
          ]}
        />
      </Section>

      <CtaBand
        title="Give your people care that shows up."
        lede="Tell us about your team and coverage, and we'll put together an access and outcomes plan."
        ground="canvas"
        primary={{ href: EMPLOYER_EMAIL, label: "Talk to our team" }}
      />
    </>
  );
}
