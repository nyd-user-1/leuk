import Link from "next/link";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "./section";
import { ArrowLink } from "./cta-link";
import { CONDITION_TOPICS } from "@/lib/site-content";

// "Browse by need" — condition rows in the patient's own first-person words,
// each linking to its /care/[topic] page. Mirrors the home page's specialty
// index pattern. NEW (public marketing site).

const ILLO = "https://c1vijjkvyt1skkfe.public.blob.vercel-storage.com/illustrations";

export function BrowseByNeed() {
  return (
    <Section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="max-w-xl text-balance font-display text-3xl font-bold tracking-tight text-text sm:text-4xl">
          What are you walking through?
        </h2>
        <ArrowLink href="/providers" className="shrink-0">
          Browse the full directory
        </ArrowLink>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
        <Reveal>
          <img
            src={`${ILLO}/leuk-13.avif`}
            alt="A watercolour illustration — two people walk a small dog along a stream at golden hour, mid-conversation."
            width={2560}
            height={1396}
            className="block w-full"
            loading="lazy"
          />
        </Reveal>

        <ul className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
          {CONDITION_TOPICS.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/care/${t.slug}`}
                className="group flex items-baseline justify-between gap-5 border-b border-border py-4"
              >
                <span className="min-w-0">
                  <span className="font-display text-lg font-semibold text-text transition-colors group-hover:text-primary">
                    {t.label}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-text-muted">{t.firstPerson}</span>
                </span>
                <span
                  aria-hidden
                  className="shrink-0 text-text-muted transition-all group-hover:translate-x-1 group-hover:text-primary"
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
