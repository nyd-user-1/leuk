import { Reveal } from "@/components/marketing/reveal";
import { Section } from "./section";
import { ArrowLink } from "./cta-link";

// The connected-record benefit, felt but never named. For patients this is a
// trust note — your care is continuous, your story carries over, your provider
// is present with you. The words "EHR"/"software" never appear here (they are
// allowed only on provider pages). NEW (public marketing site).

const ILLO = "https://c1vijjkvyt1skkfe.public.blob.vercel-storage.com/illustrations";

export function ConnectedCare() {
  return (
    <Section ground="canvas" innerClassName="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
      <div className="max-w-md">
        <h2 className="text-balance font-display text-3xl font-bold tracking-tight text-text sm:text-4xl">
          Your story stays with you.
        </h2>
        <p className="mt-5 text-pretty text-lg leading-relaxed text-text-body">
          The people who care for you already know it. Every visit picks up where the last one left off — no starting
          over, no repeating the hard parts. Your provider is present with you, not buried in a screen.
        </p>
        <ArrowLink href="/providers" className="mt-7">
          Find care that remembers
        </ArrowLink>
      </div>
      <Reveal className="lg:order-last">
        <img
          src={`${ILLO}/leuk_w5kx7ww5kx7ww5kx.avif`}
          alt="A watercolour illustration — a bedside nightstand at dawn: a lamp, a glass of water, folded glasses, a small plant, and a phone showing a morning appointment reminder."
          width={1407}
          height={768}
          className="block w-full"
          loading="lazy"
        />
      </Reveal>
    </Section>
  );
}
