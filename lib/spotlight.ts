import type { ProviderSpotlight } from "@/components/marketing/provider-spotlight-card";
import { silhouetteUrl } from "@/components/providers/provider-illustration";
import { headshotFor } from "@/lib/headshots";
import { getProfileByUserId, nextAvailableLabel, spotlightRatingFor } from "@/lib/repos/provider-profiles";
import { listAvailability, listPractitioners } from "@/lib/repos/services";

// The "meet a few providers" rail data — Leuk's real bookable practitioners
// (those with a spotlight rating + profile) plus authored placeholder cards to
// keep the rail full. Mirrors the home page's spotlight build so /care/[topic]
// shows the same real cards as the front page instead of the fake John/Jane Doe
// strip. Server-only (repos import lib/db).

// Authored cards for providers that don't exist in the DB yet — their CTAs point
// at /providers rather than a dead profile link. (Same set the home rail uses.)
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

export async function getSpotlightProviders(): Promise<ProviderSpotlight[]> {
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
  return [...realSpotlights, ...FICTIONAL_SPOTLIGHT].map((p) => ({
    ...p,
    photoUrl: headshotFor(p.id) ?? silhouetteUrl(p.id),
  }));
}
