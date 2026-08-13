import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icons";
import { TextLink } from "@/components/ui/text-link";
import { CareCarousel } from "@/components/marketing/care-carousel";
import { InsurerStrip } from "@/components/site/insurer-strip";
import { HeroSearch } from "@/components/marketing/hero-search";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Nav } from "@/components/marketing/nav";
import { ProviderSpotlightRail, type ProviderSpotlight } from "@/components/marketing/provider-spotlight-card";
import { silhouetteUrl } from "@/components/providers/provider-illustration";
import { headshotFor } from "@/lib/headshots";
import { Reveal } from "@/components/marketing/reveal";
import { ReviewsCarousel, type Review } from "@/components/marketing/reviews-carousel";
import { ScrollCue } from "@/components/marketing/scroll-cue";
import { WatercolorHover } from "@/components/marketing/watercolor-hover";
import { WatercolorPlayground } from "@/components/marketing/watercolor-playground";
import { getProfileByUserId, nextAvailableLabel, spotlightRatingFor } from "@/lib/repos/provider-profiles";
import { listAvailability, listPractitioners } from "@/lib/repos/services";

export const dynamic = "force-dynamic";

// Spotlight-card placeholder art: the same painted silhouette busts the
// directory rows use (see provider-illustration.tsx). Seeded off the card id
// rather than drawn at random, so a given provider doesn't switch bodies
// between page loads — `dynamic = "force-dynamic"` above means every load is a
// fresh render.

// Home — "First Light" redesign.
// ────────────────────────────────────────────────────────────────────────────
// The old page floated the watercolours on a cream "paper" ground (the 2026 AI
// default) and braided patient→provider→patient down a very long scroll. This
// version commits to three things:
//   1. Patient-first. The find-care job is the loudest thing on the page; the
//      provider pitch is one concentrated band (#for-providers), never a braid.
//   2. A warm paper ground (--color-page, #f7f3e8) the watercolours dissolve
//      into. Warmth is carried by the paper, the amber accent, and the paintings'
//      own light; distinctiveness rides the type, layout, and the dusk band.
//   3. Headings in the Bricolage grotesque (font-display, extrabold/bold);
//      body in Inter. One assured display voice, no serif.
// A dusk-teal CTA closes the page and continues into the footer as one dark
// block (MarketingFooter's bg is overridden to the same dusk).

// Blob illustration hosts. CUT = background-removed watercolour scenes
// (transparent, soft deckled edges) that dissolve into the warm paper with no
// box; ILLO = framed scenes (e.g. the dusk landscapes) that carry their own edge.
const ILLO = "https://c1vijjkvyt1skkfe.public.blob.vercel-storage.com/illustrations";
const CUT = `${ILLO}/cut`;

// The find-care entry points. Each row is a real directory query; the whole
// section is the page's conversion spine, so it leads (not the mood).
const SPECIALTIES: Array<{ name: string; note: string; q: string }> = [
  { name: "Anxiety & depression", note: "The most-searched reason to reach out", q: "Anxiety and Depression" },
  { name: "Trauma & PTSD", note: "EMDR, CPT, trauma-informed clinicians", q: "Trauma and PTSD" },
  { name: "ADHD", note: "Evaluation, coaching, and medication", q: "ADHD" },
  { name: "Couples & family", note: "Relationships and family dynamics", q: "Couples" },
  { name: "Grief & loss", note: "Bereavement and major life change", q: "Grief and Loss" },
  { name: "LGBTQIA+ affirming", note: "Care that centers who you are", q: "LGBTQIA+" },
  { name: "Bipolar disorder", note: "Psychiatric management, steady and consistent", q: "Bipolar Disorder" },
  { name: "Sleep", note: "CBT-I and care for what's keeping you up", q: "Sleep" },
  { name: "Addiction & recovery", note: "Judgment-free care, at your own pace", q: "Addiction" },
];

// Reach stats (Headway "found support" layout, Leuk content). Provider count
// held at 116,000+ to match the hero rather than Headway's 70K+.
const STATS: Array<{ n: string; label: string; body: string }> = [
  {
    n: "30M+",
    label: "sessions held",
    body: "Millions of meaningful care moments — connecting people to the personalized support they need.",
  },
  {
    n: "116,000+",
    label: "licensed providers",
    body: "No matter what you’re facing, Leuk helps you find a therapist or psychiatrist who’s ready to help.",
  },
];

// Review rail — first three are the original social quotes; the rest are
// placeholder testimonials in the same voice (swap for real ones). Each gets a
// short title in the teal display style.
const REVIEWS: Review[] = [
  {
    name: "Rachel Bouton",
    title: "It just works",
    text: "You plug in your insurance and Leuk lists therapists who take it — then handles all the payment and billing for you.",
  },
  {
    name: "Caiti Donovan",
    title: "Found the right fit",
    text: "I found my therapist through Leuk and love her. It takes the hassle out of insurance and payment so you focus on fit.",
  },
  {
    name: "tikh",
    title: "Highly recommend",
    text: "Woah, def recommend this for anyone looking for a therapist — Leuk made the whole thing painless.",
  },
  {
    name: "Marcus Lee",
    title: "Booked the same week",
    text: "I picked a real open time and booked online — my first session was that same week. No waitlist, no phone tag.",
  },
  {
    name: "Priya N.",
    title: "No surprise bills",
    text: "I filtered by my plan and saw the cost before booking. In-network meant exactly that — no surprise bill later.",
  },
  {
    name: "Deja W.",
    title: "Care that gets me",
    text: "Finding someone who understood my background mattered. I filtered for it and clicked on the first try.",
  },
  {
    name: "Sam Rivera",
    title: "Ten minutes, done",
    text: "The whole thing took about ten minutes. I fully expected to give up halfway through like every other time.",
  },
  {
    name: "Hannah K.",
    title: "No more phone tag",
    text: "My old routine was calling ten offices to ask if they took my plan. Leuk just showed me the ones that did.",
  },
  {
    name: "Andre T.",
    title: "I told my friends",
    text: "I’ve already sent it to three friends. It’s the first time getting care felt easy instead of exhausting.",
  },
];

// ── Provider spotlight rail (replaces the testimonial cards in the first
// "Reach" section — Image 1's cards, turned into real provider cards). Real
// bookable demo practitioners get their live profile + availability; rating/
// review-count comes from spotlightRatingFor (lib/repos/provider-profiles —
// no backing field yet, authored there, shared with the real provider page).
// The rest of the rail is entirely authored copy for providers that don't
// exist in the DB yet (minimum-9-cards ask) — their CTAs point at /providers
// rather than a dead profile link.

const FICTIONAL_SPOTLIGHT: ProviderSpotlight[] = [
  {
    id: "spotlight-amara",
    name: "Dr. Amara Okafor",
    credentialLine: "PMHNP · 8 years of experience",
    rating: 4.9,
    reviewCount: 142,
    availableLabel: "Fri, Jul 10",
    quote: "I want you to feel like a partner in your own care, not a passenger — we’ll figure out what’s working together.",
    specialties: ["Medication management", "ADHD", "Anxiety"],
    moreCount: 6,
    careType: "medication",
    illustrationKey: "leuk_4ji9244ji9244ji9",
    href: "/providers",
  },
  {
    id: "spotlight-jordan",
    name: "Jordan Kessler",
    credentialLine: "LMFT · 11 years of experience",
    rating: 5.0,
    reviewCount: 98,
    availableLabel: "Mon, Jul 13",
    quote: "Most couples don’t need to fall back in love — they need better tools to fight fair and actually hear each other.",
    specialties: ["Couples counseling", "Family conflict", "Communication"],
    moreCount: 5,
    careType: "therapy",
    illustrationKey: "leuk-9",
    href: "/providers",
  },
  {
    id: "spotlight-naomi",
    name: "Dr. Naomi Chen",
    credentialLine: "Clinical Psychologist, PhD · 16 years of experience",
    rating: 4.9,
    reviewCount: 211,
    availableLabel: "Tue, Jul 14",
    quote: "Healing from trauma isn’t about forgetting — it’s about the memory finally losing its grip on your nervous system.",
    specialties: ["Trauma & PTSD", "EMDR", "Grief"],
    moreCount: 4,
    careType: "therapy",
    illustrationKey: "leuk_a2t92la2t92la2t9",
    href: "/providers",
  },
  {
    id: "spotlight-malik",
    name: "Malik Owens",
    credentialLine: "LCSW · 6 years of experience",
    rating: 4.8,
    reviewCount: 76,
    availableLabel: "Wed, Jul 15",
    quote: "A lot of men get to me after years of white-knuckling it — my job is to show you there’s a better way to carry it.",
    specialties: ["Men’s mental health", "Anger management", "Career & burnout"],
    moreCount: 3,
    careType: "therapy",
    illustrationKey: "leuk_n1y3w0n1y3w0n1y3",
    href: "/providers",
  },
  {
    id: "spotlight-sofia",
    name: "Dr. Sofia Reyes",
    credentialLine: "LMHC · 9 years of experience",
    rating: 5.0,
    reviewCount: 134,
    availableLabel: "Thu, Jul 16",
    quote: "Teenagers can smell a script from a mile away — I just try to be a real adult who actually listens.",
    specialties: ["Teens", "Anxiety", "School stress"],
    moreCount: 4,
    careType: "therapy",
    illustrationKey: "maya11",
    href: "/providers",
  },
];

// Section 2 — the getting-started steps.
const HOW_IT_WORKS: Array<{ title: string; body: string }> = [
  {
    title: "Find the right fit",
    body: "We filter 116,000 New York providers to find you care.",
  },
  {
    title: "Schedule care",
    body: "Add your insurance details and schedule your appointment.",
  },
  {
    title: "See you soon",
    body: "We'll handle everything from here.",
  },
];

// #for-patients — the feature grid inside the band, written to the person
// looking for care; one line per pillar, icons from the kit's Icon set.
const PATIENT_FEATURES: Array<{ title: string; body: string; icon: IconName }> = [
  {
    title: "Book online",
    body: "See real openings, pick a time that works, and get reminders so nothing slips.",
    icon: "calendar-check",
  },
  {
    title: "Meet from anywhere",
    body: "Secure video visits from home — no new app to download, no links to chase.",
    icon: "monitor-check",
  },
  {
    title: "Undivided attention",
    body: "Your clinician stays present with you, not buried in paperwork — the notes take care of themselves.",
    icon: "wand-sparkles",
  },
  {
    title: "Clear costs",
    body: "See what you'll owe, pay from your phone, and get superbills for out-of-network reimbursement.",
    icon: "credit-card",
  },
  {
    title: "Your private portal",
    body: "Book, message your provider, pay, and find your documents in one secure place.",
    icon: "users-round",
  },
  {
    title: "Find the right fit",
    body: "Search by specialty, borough, and the insurance you carry to reach someone who takes your plan.",
    icon: "search",
  },
];

// Provider band features (section 9, #for-providers) — the practice-management
// pitch. Distinct from PATIENT_FEATURES (section 2, the client-side band).
const PROVIDER_FEATURES: Array<{ title: string; body: string; icon: IconName }> = [
  {
    title: "Scheduling",
    body: "Online booking, a shared team calendar, and reminders that cut no-shows.",
    icon: "calendar-check",
  },
  {
    title: "Telehealth",
    body: "Secure video sessions built in — no extra subscriptions, no juggling links.",
    icon: "monitor-check",
  },
  {
    title: "AI progress notes",
    body: "First drafts of your session notes, ready to review and sign — documentation ends when the session does.",
    icon: "wand-sparkles",
  },
  {
    title: "Billing & payments",
    body: "Invoices, superbills, and card payments handled in one place.",
    icon: "credit-card",
  },
  {
    title: "Client portal",
    body: "Clients book, message, and pay through their own secure portal.",
    icon: "users-round",
  },
  {
    title: "Directory referrals",
    body: "A profile in the Leuk directory that puts you in front of clients searching by specialty, borough, and plan.",
    icon: "search",
  },
];

export default async function Home() {
  const practitioners = await listPractitioners();
  const realSpotlights = (
    await Promise.all(
      practitioners
        .filter((pr) => spotlightRatingFor(pr.slug))
        .map(async (pr): Promise<ProviderSpotlight | null> => {
          const [profile, availability] = await Promise.all([getProfileByUserId(pr.id), listAvailability(pr.id)]);
          if (!profile) return null;
          const meta = spotlightRatingFor(pr.slug)!;
          const isPrescriber =
            (profile.roleTitle?.toLowerCase().includes("psychiatr") ?? false) ||
            profile.topSpecialties.some((s) => s.toLowerCase().includes("medication"));
          return {
            id: pr.id,
            name: pr.name,
            credentialLine: `${profile.licenseType ?? profile.roleTitle ?? "Therapist"} · ${profile.yearsExperience ?? 0} year${profile.yearsExperience === 1 ? "" : "s"} of experience`,
            rating: meta.rating,
            reviewCount: meta.reviewCount,
            availableLabel: nextAvailableLabel(availability.map((a) => a.weekday)),
            quote: profile.styleIs ?? "",
            specialties: profile.topSpecialties.slice(0, 3),
            moreCount: profile.moreSpecialties.length,
            careType: isPrescriber ? "medication" : "therapy",
            illustrationKey: profile.illustrationKey,
            avatarHue: pr.avatarHue,
            href: `/providers/${pr.slug}`,
          };
        }),
    )
  ).filter((p): p is ProviderSpotlight => p !== null && p.quote !== "");
  const spotlightProviders = [...realSpotlights, ...FICTIONAL_SPOTLIGHT].map((p) => ({
    ...p,
    photoUrl: headshotFor(p.id) ?? silhouetteUrl(p.id),
  }));

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <Nav ground="bg-page" />

      {/* ── Hero — the promise + the search, on first light ────────────────── */}
      <section className="relative overflow-hidden bg-page lg:flex lg:min-h-[calc(100svh-72px)] lg:items-center">
        {/* first-light wash — soft teal bloom on the right, feathered edges */}
        <div aria-hidden className="mkt-firstlight pointer-events-none absolute inset-0" />

        {/* large hero painting, bleeding off the right (desktop) — pointer events
            enabled so the watercolour bloom can track the cursor over it */}
        <div className="absolute top-1/2 right-0 z-0 hidden w-[72vw] max-w-[1280px] -translate-y-1/2 lg:block">
          <WatercolorHover>
            <img
              src={`${CUT}/lakeside.avif`}
              alt="A watercolour illustration — a person wrapped in a shawl sits on a bench by a still lake at dawn, holding a warm mug."
              width={1600}
              height={1200}
              className="mkt-develop mkt-d1 block w-full"
              loading="eager"
            />
          </WatercolorHover>
        </div>

        <div className="pointer-events-none relative z-10 mx-auto w-full max-w-6xl px-6 py-16 sm:py-20 lg:py-16">
          {/* mobile painting — leads the page below lg; pointer-events-auto
              re-enables hover inside the pointer-events-none overlay so the
              watercolour bloom works here like everywhere else */}
          <div className="pointer-events-auto mkt-develop -mx-6 mb-10 w-[calc(100%+3rem)] lg:hidden">
            <WatercolorHover>
              <img
                src={`${CUT}/lakeside.avif`}
                alt="A watercolour illustration — a person wrapped in a shawl sits on a bench by a still lake at dawn, holding a warm mug."
                width={1600}
                height={1200}
                className="block w-full"
                loading="eager"
              />
            </WatercolorHover>
          </div>

          <div className="pointer-events-auto lg:max-w-[54%]">
            <h1
              className="mkt-rise text-balance font-display font-extrabold tracking-[-0.03em] text-text"
              style={{ fontSize: "clamp(2.75rem, 6vw, 5.25rem)", lineHeight: 1.01 }}
            >
              Healing belongs to{" "}
              <span className="text-primary">everyone.</span>
            </h1>
            <p className="mkt-rise mkt-d1 mt-6 max-w-lg text-pretty text-lg leading-relaxed text-text-body sm:text-xl">
              Search 116,000+ licensed therapists and psychiatrists across New York — filter by your insurance, see your
              cost before you book, and start as soon as this week.
            </p>
            <div className="mkt-rise mkt-d2 mt-8 max-w-[577px]">
              <HeroSearch autoFocus />
            </div>
            <TextLink href="/providers" icon="check" className="mkt-rise mkt-d3 mt-4">
              Free to search — no sign-up required.
            </TextLink>
          </div>

        </div>

        {/* scroll cue — fades/rises in after load, out on first scroll (client) */}
        <ScrollCue targetId="section-2" label="Scroll to run your New York practice on Leuk" />
      </section>

      {/* ── 2 · Provider band (duplicate) — same content as the #for-providers
          band further down; own id ("section-2") so /#for-providers still
          anchors to the original instance while the hero's ScrollCue can
          target this one. Full viewport height, same calc the hero uses. ── */}
      <section id="section-2" className="scroll-mt-[70px] bg-primary-wash lg:min-h-[calc(100dvh-70px)]">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pt-24 sm:pt-28 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
          <Reveal className="lg:order-last lg:mr-0 lg:w-auto lg:-mr-16 xl:-mr-28">
            <WatercolorHover>
              <img
                src="https://c1vijjkvyt1skkfe.public.blob.vercel-storage.com/car.png"
                alt="A watercolour illustration of a sunlit car interior — dashboard, steering wheel, and a warm cup resting in the console."
                width={1024}
                height={559}
                className="block w-full"
                loading="lazy"
              />
            </WatercolorHover>
          </Reveal>
          <div className="max-w-md">
            <p className="font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-primary-deep">
              For you
            </p>
            <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-primary sm:text-[40px] sm:leading-[1.08]">
              Care that fits your life.
            </h2>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-text-body">
              Search by specialty, borough, and the plan you carry, book in a few taps, and meet by secure
              video or in person — with everything you need in one private portal.
            </p>
            <div className="mt-8">
              <Link
                href="/providers"
                className="group inline-flex h-12 items-center justify-center gap-1.5 rounded-field bg-primary px-7 text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover"
              >
                Find a provider
              </Link>
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-6 pt-14 pb-24 sm:pb-28">
          <Reveal>
            <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {PATIENT_FEATURES.map((f) => (
                <li key={f.title} className="flex gap-4">
                  <Icon name={f.icon} size={22} className="mt-0.5 shrink-0 fill-[#f7f3e8] text-text" />
                  <div>
                    <h3 className="font-display text-lg font-semibold text-text">{f.title}</h3>
                    <p className="mt-1 text-pretty leading-relaxed text-text-body">{f.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── Reach — stats + social proof (Headway "found support" layout) ──── */}
      <section id="reach" className="relative scroll-mt-24 overflow-hidden bg-page">
        <div className="mx-auto w-full max-w-6xl px-6 pt-10 sm:pt-12">
          {/* heading lives in the grid: below lg it stacks image → heading →
              steps; at lg it spans the top row via order-first + col-span-2 */}
          <div className="grid items-center gap-6 lg:grid-cols-[2.2fr_1fr] lg:gap-10">
            <Reveal className="-ml-6 -mr-6 w-[calc(100%+3rem)] lg:-ml-24 lg:mr-0 lg:w-auto xl:-ml-40" delay={80}>
              <WatercolorHover>
                <img
                  src={`${CUT}/gardening.avif`}
                  alt="A watercolour illustration — a person kneels in a garden bed, planting a seedling, a copper watering can beside them."
                  width={1166}
                  height={730}
                  className="mkt-soft block w-full"
                  loading="lazy"
                />
              </WatercolorHover>
            </Reveal>

            <Reveal className="text-center lg:order-first lg:col-span-2">
              <h2 className="text-balance font-display text-4xl font-bold tracking-tight text-primary sm:text-5xl">
                Millions have found support
              </h2>
            </Reveal>

            <Reveal delay={220}>
              <ol className="flex flex-col justify-center gap-4">
                {HOW_IT_WORKS.map((s, i) => (
                  <li key={s.title} className="flex gap-4">
                    <span className="mt-0.5 w-7 shrink-0 font-display text-lg font-bold text-primary-deep">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="font-display text-lg font-semibold text-text">{s.title}</h3>
                      <p className="mt-1 text-pretty leading-relaxed text-text-body">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </div>

        <Reveal className="pt-8 pb-10 sm:pb-12">
          <ProviderSpotlightRail providers={spotlightProviders} />
        </Reveal>
      </section>

      {/* ══ Sections 3–5 — the care grid, the insurance case, social proof. ══ */}

      {/* ── 3 · Find care carousel ────────────────────────────────────────── */}
      <section className="bg-page py-16 sm:py-20">
        <Reveal>
          <CareCarousel />
        </Reveal>
      </section>

      {/* ── 4 · Use your insurance — the savings claim + the plans behind it ── */}
      <section className="bg-page py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="grid items-center gap-10 lg:grid-cols-[1.7fr_1fr] lg:gap-12">
            <Reveal className="-ml-6 -mr-6 w-[calc(100%+3rem)] lg:mx-0 lg:w-auto">
              <WatercolorHover>
                <img
                  src={`${ILLO}/maya10.avif`}
                  alt="A watercolour illustration — two people walk a small dog along a path through a meadow at dawn, soft light on the horizon."
                  width={2030}
                  height={1211}
                  className="mkt-soft block w-full"
                  loading="lazy"
                />
              </WatercolorHover>
            </Reveal>
            <Reveal delay={100} className="max-w-md">
              <p className="font-display text-[13px] font-semibold uppercase tracking-[0.16em] text-primary-deep">
                Use your insurance
              </p>
              <h2 className="mt-3 text-balance font-display text-4xl font-bold tracking-tight text-primary sm:text-[42px] sm:leading-[1.1]">
                See how much you save on sessions
              </h2>
              <p className="mt-5 text-pretty text-lg leading-relaxed text-text-body">
                Our clients save an average of 60% on sessions through Leuk. We partner with 100+ of New
                York&apos;s top insurance plans — in-person and virtual care, across 40+ languages.
              </p>
              <Link
                href="/providers"
                className="mt-8 inline-flex h-11 items-center justify-center rounded-field border border-border bg-surface px-6 text-[15px] font-medium text-text transition-colors hover:border-primary hover:text-primary"
              >
                Find your price
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* In-network logo strip — real payer marks in place of the coloured
          insurer wordmarks (components/site/insurer-strip.tsx). */}
      <InsurerStrip ground="page" caption="" />

      {/* ── 5 · Trusted across New York — stats + the reviews rail ─────────── */}
      <section className="relative overflow-hidden bg-page">
        <div className="mx-auto w-full max-w-6xl px-6 pt-10 sm:pt-12">
          {/* image leads below lg (DOM order: image, header, stats); at lg the
              header returns to a full-width top row via explicit grid placement */}
          <div className="grid items-center gap-6 lg:grid-cols-[1fr_1.9fr] lg:gap-10">
            <Reveal
              className="-ml-6 -mr-6 w-[calc(100%+3rem)] lg:ml-0 lg:w-auto lg:col-start-2 lg:row-start-2 lg:-mr-16 xl:-mr-28"
              delay={80}
            >
              <WatercolorHover>
                <img
                  src={`${CUT}/gardening.avif`}
                  alt="A watercolour illustration — a person kneels in a garden bed, planting a seedling, a watering can beside them."
                  width={1166}
                  height={730}
                  className="mkt-soft block w-full"
                  loading="lazy"
                />
              </WatercolorHover>
            </Reveal>

            <Reveal className="text-center lg:col-span-2 lg:row-start-1">
              <p className="font-display text-[13px] font-semibold uppercase tracking-[0.16em] text-primary-deep">
                Through Leuk
              </p>
              <h2 className="mt-3 text-balance font-display text-4xl font-bold tracking-tight text-primary sm:text-5xl">
                Trusted across New York
              </h2>
            </Reveal>

            <Reveal delay={220} className="lg:col-start-1 lg:row-start-2">
              <dl className="flex flex-col justify-center">
                {STATS.map((s, i) => (
                  <div key={s.n} className={`py-5 ${i > 0 ? "border-t border-page-edge" : ""}`}>
                    <dt className="font-display text-[44px] font-extrabold leading-none tracking-tight text-text sm:text-[50px]">
                      {s.n}
                    </dt>
                    <p className="mt-2 font-display text-base font-semibold text-text">{s.label}</p>
                    <dd className="mt-2 max-w-md text-pretty leading-relaxed text-text-body">{s.body}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </div>

        <Reveal className="pt-10 pb-12 sm:pb-14">
          <ReviewsCarousel reviews={REVIEWS} bleed="left" />
        </Reveal>
      </section>

      {/* ── Find care — the conversion spine: browse by what you're facing ─── */}
      <section className="bg-page">
        <div className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-3 lg:gap-12">
            {/* Col 1 — image stacked above the heading */}
            <div>
              <Reveal>
                <WatercolorHover>
                  <img
                    src={`${CUT}/one-thing.avif`}
                    alt="A watercolour illustration — a mug, an open journal reading “one thing at a time”, and a laptop in soft morning light."
                    width={1600}
                    height={1120}
                    className="block w-full"
                    loading="lazy"
                  />
                </WatercolorHover>
              </Reveal>
              <h2 className="mt-8 text-balance font-display text-4xl font-bold tracking-tight text-primary sm:text-[40px] sm:leading-[1.08]">
                Getting care shouldn&apos;t be the hard part.
              </h2>
              <p className="mt-4 max-w-lg text-pretty text-lg leading-relaxed text-text-body">
                No phone tag, no waitlists, no guessing what it&apos;ll cost. Three steps, and you&apos;re booked.
              </p>
            </div>

            {/* Cols 2–3 — care categories split across two columns, "View more" as
                the 10th cell. */}
            <div className="lg:col-span-2">
              <ul className="grid gap-x-10 self-start sm:grid-cols-2">
                {SPECIALTIES.map((s) => (
                  <li key={s.name}>
                    <Link
                      href={`/providers?q=${encodeURIComponent(s.q)}`}
                      className="group relative block border-b border-page-edge py-4"
                    >
                      <span className="font-display text-lg font-semibold text-text transition-colors group-hover:text-primary">
                        {s.name}
                      </span>
                      <span className="mt-0.5 block text-sm text-text-body/80">{s.note}</span>
                      <span
                        aria-hidden
                        className="absolute inset-x-0 bottom-0 h-[1.5px] w-0 bg-primary transition-[width] duration-[400ms] ease-out group-hover:w-full"
                      />
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/specialty" className="group relative flex h-full items-center border-b border-page-edge py-4">
                    <span className="font-display text-lg font-semibold text-primary transition-colors group-hover:text-primary-hover">
                      View more →
                    </span>
                    <span
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-[1.5px] w-0 bg-primary transition-[width] duration-[400ms] ease-out group-hover:w-full"
                    />
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Provider band — the single provider moment, on the mint wash ───── */}
      <section id="for-providers" className="scroll-mt-20 bg-primary-wash">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pt-24 sm:pt-28 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
          <Reveal className="lg:order-last lg:mr-0 lg:w-auto lg:-mr-16 xl:-mr-28">
            <WatercolorHover>
              <img
                src="https://c1vijjkvyt1skkfe.public.blob.vercel-storage.com/Gemini_Generated_Image_tep72ltep72ltep7-Photoroom.avif"
                alt="A watercolour illustration — a doctor's office desk with a stethoscope on a clipboard, a succulent, and a sweater draped over a chair."
                width={2400}
                height={1309}
                className="block w-full"
                loading="lazy"
              />
            </WatercolorHover>
          </Reveal>
          <div className="max-w-md">
            <p className="font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-primary-deep">
              For providers
            </p>
            <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-primary sm:text-[40px] sm:leading-[1.08]">
              Run your New York practice on Leuk.
            </h2>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-text-body">
              Scheduling, telehealth, AI progress notes, and billing on one platform — plus a directory that sends you
              clients. The practice behind the care can go home on time.
            </p>
            <div className="mt-8">
              <Link
                href="/join"
                className="group inline-flex h-12 items-center justify-center gap-1.5 rounded-field bg-primary px-7 text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover"
              >
                Join as a provider
              </Link>
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-6 pt-14 pb-24 sm:pb-28">
          <Reveal>
            <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {PROVIDER_FEATURES.map((f) => (
                <li key={f.title} className="flex gap-4">
                  <Icon name={f.icon} size={22} className="mt-0.5 shrink-0 fill-[#f7f3e8] text-text" />
                  <div>
                    <h3 className="font-display text-lg font-semibold text-text">{f.title}</h3>
                    <p className="mt-1 text-pretty leading-relaxed text-text-body">{f.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── Closing dusk CTA — the last invitation; the dark teal continues
          into the footer as one block (footer bg is overridden to match). ──── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "radial-gradient(120% 90% at 80% 12%, color-mix(in oklab, var(--color-accent) 20%, transparent) 0%, transparent 45%), linear-gradient(to bottom, var(--color-dusk) 0%, var(--color-dusk-deep) 100%)",
        }}
      >
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-24 sm:py-28 lg:grid-cols-2 lg:gap-16">
          <div className="max-w-md">
            <h2
              className="text-balance font-display font-extrabold tracking-[-0.03em] text-[#f4efe6]"
              style={{ fontSize: "clamp(2.25rem, 4.8vw, 3.75rem)", lineHeight: 1.06 }}
            >
              Whenever you&apos;re ready, we&apos;re here.
            </h2>
            <p className="mt-5 max-w-md text-pretty text-lg leading-relaxed text-[#c9d6d4]">
              You don&apos;t have to have it all figured out. Search when you&apos;re ready — the first step is smaller than
              it looks.
            </p>
            <div className="mt-8">
              <Link
                href="/providers"
                className="group inline-flex h-12 items-center justify-center gap-1.5 rounded-field bg-accent px-7 text-[15px] font-semibold text-[#12292f] transition-colors hover:bg-[#e7a244]"
              >
                Find your provider
              </Link>
            </div>
          </div>

          <div className="relative lg:order-last lg:-mr-6">
            <WatercolorHover>
              <img
                src={`${CUT}/dusk-lake.avif`}
                alt="A watercolour illustration — a person sits by a lake beneath a bare tree at dusk, a warm band of light along the horizon."
                width={1600}
                height={900}
                className="mkt-soft block w-full"
                loading="lazy"
              />
            </WatercolorHover>
          </div>
        </div>
      </section>

      <MarketingFooter />

      {/* Live watercolor tuner — visitors can explore the illustration bloom. */}
      <WatercolorPlayground />
    </div>
  );
}
