import type { Metadata } from "next";
import Link from "next/link";
import { HeroSearch } from "@/components/marketing/hero-search";
import { Section, SectionHeading } from "@/components/site/section";
import { ProviderStrip } from "@/components/site/provider-card";
import { BrowseByNeed } from "@/components/site/browse-by-need";
import { Steps } from "@/components/site/steps";
import { ConnectedCare } from "@/components/site/connected-care";
import { StatBand } from "@/components/site/stat-band";
import { InsurerStrip } from "@/components/site/insurer-strip";
import { FaqList } from "@/components/site/faq";
import { CtaBand } from "@/components/site/cta-band";
import { Placeholder } from "@/components/site/placeholder";
import { PLACEHOLDER_PRACTITIONERS, HOME_FAQS } from "@/lib/site-content";
import { searchProviders } from "@/lib/repos/directory";

// /home-2 — a self-contained parallel homepage I fully own. NOT wired to the
// real "/" (owned by the home redesign). Patient-primary, matching the home
// page's public aesthetic (Bricolage display, primary-wash grounds, watercolor
// illustrations) using documented tokens + primitives. NEW (public marketing
// site). No "EHR"/software jargon in patient copy.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leuk — therapy & psychiatric care across New York",
  description:
    "Therapy and medication support in one place — virtual or in person. Find the right provider, see your in-network price, and book this week.",
};

const ILLO = "https://c1vijjkvyt1skkfe.public.blob.vercel-storage.com/illustrations";

const CARE_CHOICES = [
  { label: "Therapy", href: "/care/therapy" },
  { label: "Medication", href: "/care/medication" },
  { label: "Both", href: "/care/both" },
];

async function getProviderCount(): Promise<number | null> {
  try {
    const page = await searchProviders({ pageSize: 1 });
    return page.total ?? null;
  } catch {
    return null;
  }
}

export default async function HomeTwo() {
  const providerCount = await getProviderCount();
  const countLabel = providerCount ? `${new Intl.NumberFormat("en-US").format(providerCount)}+` : null;

  return (
    <>
      {/* ── Hero — therapy + medication unified up front ─────────────────── */}
      <section className="relative bg-primary-wash lg:flex lg:min-h-[calc(100svh-64px)] lg:items-center">
        <div className="pointer-events-none absolute top-[47%] right-0 z-0 hidden w-[52vw] -translate-y-1/2 lg:block">
          <img
            src={`${ILLO}/leuk_e0mhvxe0mhvxe0mh-mint.avif`}
            alt="A watercolour illustration — a person wrapped in a knit blanket sits on a bench by a still lake at dawn, holding a warm mug."
            width={2816}
            height={1536}
            className="mkt-develop mkt-d2 block w-full"
            loading="eager"
          />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <div className="lg:max-w-[54%]">
            <p className="mkt-rise text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Therapy &amp; medication — one place
            </p>
            <h1
              className="mkt-rise mkt-d1 mt-4 text-balance font-display font-extrabold tracking-[-0.03em] text-text"
              style={{ fontSize: "clamp(2.5rem, 6vw, 4.75rem)", lineHeight: 1.02 }}
            >
              Find care that fits — <span className="text-primary">therapy, medication, or both.</span>
            </h1>
            <p className="mkt-rise mkt-d2 mt-6 max-w-xl text-pretty text-lg text-text-body sm:text-xl">
              One place for New York mental health care — virtual or in person. No switching apps, no repeating your
              story.
            </p>

            <div className="mkt-rise mkt-d3 mt-8 max-w-xl">
              <HeroSearch autoFocus />
            </div>

            <div className="mkt-rise mkt-d3 mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-text-body">I&apos;m looking for:</span>
              {CARE_CHOICES.map((c) => (
                <Link
                  key={c.href}
                  href={c.href}
                  className="rounded-full border border-primary-weak bg-surface px-3.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-white"
                >
                  {c.label}
                </Link>
              ))}
            </div>

            <p className="mkt-rise mkt-d4 mt-5 max-w-xl text-sm text-text-body">
              Most first visits are your plan&apos;s copay — about <Placeholder token="{{STAT:avg_session_cost}}" /> out
              of pocket. No sign-up required to search.
            </p>
          </div>

          {/* mobile illustration */}
          <div className="mt-10 lg:hidden">
            <img
              src={`${ILLO}/leuk_e0mhvxe0mhvxe0mh-mint.avif`}
              alt="A watercolour illustration — a person wrapped in a knit blanket sits on a bench by a still lake at dawn, holding a warm mug."
              width={2816}
              height={1536}
              className="mkt-develop block w-full"
              loading="eager"
            />
          </div>
        </div>
      </section>

      {/* ── Immediacy — real (placeholder) bookable providers ───────────── */}
      <Section>
        <SectionHeading
          eyebrow="Book this week"
          title="Providers with availability now."
          lede="Lead with real openings, not abstractions. Book a first session in the next few days — virtual or in person."
        />
        <ProviderStrip items={PLACEHOLDER_PRACTITIONERS} />
      </Section>

      {/* ── Browse by need (conditions, first-person) ───────────────────── */}
      <BrowseByNeed />

      {/* ── How it works — placed AFTER browse ──────────────────────────── */}
      <Section ground="canvas">
        <SectionHeading eyebrow="How Leuk works" title="Three steps, no guesswork." />
        <Steps
          className="mt-12"
          steps={[
            {
              title: "Find the right fit",
              body: "Search by specialty, borough, and coverage — or just say what you're working through.",
              icon: "search",
            },
            {
              title: "See your in-network price",
              body: "Filter to who takes your plan and see your expected cost before you book — never after.",
              icon: "dollar",
            },
            {
              title: "Book your session",
              body: "Pick a time that works, often this week, virtual or in person. That's it.",
              icon: "calendar-check",
            },
          ]}
        />
      </Section>

      {/* ── Connected-record benefit, felt not named ────────────────────── */}
      <ConnectedCare />

      {/* ── Trust scaffolding — stats, logos, testimonials ──────────────── */}
      <Section>
        <StatBand
          stats={[
            {
              value: countLabel ?? <Placeholder token="{{STAT:providers_count}}" />,
              label: "Licensed providers across New York",
              note: countLabel ? "Live from the Leuk directory" : undefined,
            },
            { value: <Placeholder token="{{STAT:sessions_held}}" />, label: "Sessions held on Leuk" },
            { value: <Placeholder token="{{STAT:plans_accepted}}" />, label: "Insurance plans accepted" },
          ]}
        />
      </Section>

      <InsurerStrip />

      <Section ground="canvas">
        <SectionHeading title="What clients say" />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <figure key={i} className="flex flex-col rounded-card border border-border bg-surface p-6 shadow-card">
              <blockquote className="font-display text-lg leading-relaxed text-text">
                <Placeholder token="{{TESTIMONIAL}}" />
              </blockquote>
              <figcaption className="mt-4 text-sm text-text-muted">
                — <Placeholder token="{{TESTIMONIAL_NAME}}" />
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      {/* ── FAQ — pre-answers objections ────────────────────────────────── */}
      <Section>
        <SectionHeading
          title="Questions people ask first"
          lede="Insurance, cost, and what actually happens at the first visit."
        />
        <FaqList items={HOME_FAQS} />
      </Section>

      {/* ── Closing CTA ─────────────────────────────────────────────────── */}
      <CtaBand
        title="Find care without the guesswork."
        lede="Search by specialty, borough, and coverage — and take the first step this week."
        primary={{ href: "/providers", label: "Find your provider" }}
        secondary={{ href: "/care/therapy", label: "See how care works" }}
        illo={{
          src: `${ILLO}/leuk-landscape_w68hevw68hevw68h.avif`,
          alt: "A watercolour illustration — a small figure walks a path through a wildflower meadow toward soft morning light.",
          width: 2560,
          height: 1396,
        }}
      />
    </>
  );
}
