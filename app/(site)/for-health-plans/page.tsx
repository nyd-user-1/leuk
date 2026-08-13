import type { Metadata } from "next";
import { Icon } from "@/components/ui/icons";
import { PageHero } from "@/components/site/page-hero";
import { Section, SectionHeading } from "@/components/site/section";
import { FeatureGrid } from "@/components/site/feature-grid";
import { StatBand } from "@/components/site/stat-band";
import { CtaBand } from "@/components/site/cta-band";
import { Placeholder } from "@/components/site/placeholder";
import { searchProviders } from "@/lib/repos/directory";

// /for-health-plans — payor network & clinical teams. Sober, data-forward.
// Factual integration/compliance posture, no advice. NEW (public marketing
// site).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "For health plans — Leuk network partnership",
  description:
    "A statewide network of verified mental health providers with measured outcomes, clean claims, and reporting your clinical team can act on.",
};

const PARTNER_EMAIL = "mailto:partnerships@leuk.demo";

async function getNetworkSize(): Promise<number | null> {
  try {
    const page = await searchProviders({ pageSize: 1 });
    return page.total ?? null;
  } catch {
    return null;
  }
}

export default async function HealthPlansPage() {
  const size = await getNetworkSize();
  const sizeLabel = size ? `${new Intl.NumberFormat("en-US").format(size)}+` : null;

  return (
    <>
      <PageHero
        eyebrow="For health plans"
        title="A network built for access and outcomes."
        lede="Leuk connects your members to verified mental health providers across New York — with the measurement, integration, and reporting a modern plan expects."
        primary={{ href: PARTNER_EMAIL, label: "Explore a partnership" }}
        secondary={{ href: "#offer", label: "What we offer" }}
      />

      <Section id="offer">
        <SectionHeading
          title="What Leuk offers plans."
          lede="Four things a plan cares about — access, quality, integration, and reporting — in one network."
        />
        <FeatureGrid
          className="mt-12"
          columns={4}
          items={[
            {
              icon: "users",
              title: "Access",
              body: "A statewide network of therapists and prescribers with real-time availability and same-week booking.",
            },
            {
              icon: "shield-plus",
              title: "Quality",
              body: "Licensed, verified providers with measured outcomes across the network.",
            },
            {
              icon: "link",
              title: "Integration",
              body: "Eligibility and clean claims built into the clinical workflow — not bolted on afterward.",
            },
            {
              icon: "file-text",
              title: "Reporting",
              body: "Utilization, access, and outcome reporting your clinical team can act on.",
            },
          ]}
        />
      </Section>

      {/* Outcomes */}
      <Section ground="canvas">
        <SectionHeading eyebrow="By the numbers" title="Measured, not asserted." />
        <StatBand
          className="mt-12"
          stats={[
            {
              value: sizeLabel ?? <Placeholder token="{{STAT:network_size}}" />,
              label: "Providers in the New York network",
              note: sizeLabel ? "Live from the Leuk directory" : undefined,
            },
            { value: <Placeholder token="{{STAT:time_to_first_visit}}" />, label: "Median time to first visit" },
            { value: <Placeholder token="{{STAT:measured_improvement}}" />, label: "Members showing measurable improvement" },
          ]}
        />
      </Section>

      {/* Integration & compliance posture — factual, no advice */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div className="max-w-md">
            <SectionHeading
              title="Integration & compliance posture."
              lede="How the platform is built. This describes Leuk's safeguards — it isn't legal or compliance advice."
            />
          </div>
          <ul className="space-y-4">
            {[
              "HIPAA-aligned safeguards across the platform",
              "Role-based access controls on every clinical record",
              "An append-only audit trail on reads and writes of protected data",
              "Encrypted sessions; protected health information is never written to logs",
              "Standards-based claims and eligibility",
            ].map((f) => (
              <li key={f} className="flex items-start gap-3">
                <Icon name="lock" size={20} className="mt-0.5 shrink-0 text-primary" />
                <span className="text-[17px] leading-relaxed text-text-body">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <CtaBand
        title="Let's talk about your network."
        lede="Tell us about your members and coverage area, and we'll show you the network, the measurement, and the integration path."
        ground="canvas"
        primary={{ href: PARTNER_EMAIL, label: "Contact our team" }}
      />
    </>
  );
}
