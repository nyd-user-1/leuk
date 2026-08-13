import type { Metadata } from "next";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Nav } from "@/components/marketing/nav";
import { Icon, type IconName } from "@/components/ui/icons";
import { PageHero } from "@/components/site/page-hero";
import { Section, SectionHeading } from "@/components/site/section";
import { FeatureGrid } from "@/components/site/feature-grid";
import { ListRow } from "@/components/ui/list-row";
import { TextLink } from "@/components/ui/text-link";
import { CtaBand } from "@/components/site/cta-band";

// /company/careers — team pitch + open roles. NEW.

export const dynamic = "force-dynamic";

const CAREERS_EMAIL = "mailto:careers@leuk.demo";

export const metadata: Metadata = {
  title: "Careers · Leuk",
  description: "Join the team building New York's mental-health directory and the practice-management platform behind it.",
};

const ROLES: Array<{ title: string; team: string; location: string; icon: IconName }> = [
  { title: "Licensed Clinical Social Worker", team: "Clinical network", location: "New York, NY · Hybrid", icon: "heart-handshake" },
  { title: "Full-Stack Engineer", team: "Product & Engineering", location: "Remote (US)", icon: "sparkle" },
  { title: "Care Operations Lead", team: "Operations", location: "New York, NY", icon: "clipboard" },
  { title: "Payer Partnerships Manager", team: "Growth", location: "Remote (US)", icon: "shield-plus" },
];

export default function CareersPage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Nav />
      <main className="flex-1">
        <PageHero
          eyebrow="Careers"
          title="Help New Yorkers find care that fits."
          lede="We're a small team building the directory and the practice software behind it — clinicians, engineers, and operators who think finding mental-health care should take minutes, not weeks."
          primary={{ href: "#roles", label: "See open roles" }}
        />

        <Section>
          <SectionHeading eyebrow="Why Leuk" title="What it's like to work here." />
          <FeatureGrid
            className="mt-12"
            columns={3}
            items={[
              {
                icon: "users-round",
                title: "Small, senior team",
                body: "Every hire owns real outcomes, not a sliver of a process. Little bureaucracy, direct impact.",
              },
              {
                icon: "map-pin",
                title: "NYC-rooted, remote-friendly",
                body: "Our office is in the Garment District; most roles flex between in-person and remote.",
              },
              {
                icon: "book-heart",
                title: "Mission over metrics",
                body: "We measure ourselves on whether people actually got seen — not just whether they clicked search.",
              },
            ]}
          />
        </Section>

        <Section ground="canvas" id="roles">
          <SectionHeading title="Open roles" />
          <div className="mt-8 flex flex-col gap-3">
            {ROLES.map((r) => (
              <ListRow
                key={r.title}
                leading={
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-field bg-primary-wash text-primary-deep">
                    <Icon name={r.icon} size={20} />
                  </span>
                }
                title={r.title}
                meta={`${r.team} · ${r.location}`}
                trailing={<TextLink href={`${CAREERS_EMAIL}?subject=${encodeURIComponent(r.title)}`}>Apply</TextLink>}
              />
            ))}
          </div>
        </Section>

        <CtaBand
          title="Don't see your role?"
          lede="We're always glad to hear from clinicians and builders who care about this problem. Reach out anyway."
          primary={{ href: CAREERS_EMAIL, label: "careers@leuk.demo" }}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
