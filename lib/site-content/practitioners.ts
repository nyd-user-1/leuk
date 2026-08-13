// PLACEHOLDER bookable practitioners for the homepage "book this week" strip.
// These are intentionally obvious placeholders — classic John/Jane Doe names —
// so no one mistakes them for real clinicians. They are NOT written to the
// database; they render straight from this file. Swap for real Leuk
// practitioners + live availability before launch. NEW (public marketing site).
//
// Avatars are initials only (design-system rule: never photos).

import type { AvatarHue } from "@/lib/types";

export interface PlaceholderPractitioner {
  id: string;
  /** Obvious placeholder name (title-cased already). */
  name: string;
  credential: string; // MD / PMHNP / LCSW / PhD / LMHC
  title: string; // human-readable role
  /** Care this person offers. */
  care: "Therapy" | "Medication" | "Therapy + medication";
  focus: string[]; // a few focus areas
  borough: string; // NYC borough or "Virtual"
  telehealth: boolean;
  nextAvailable: string; // e.g. "Tomorrow", "This week"
  hue: AvatarHue;
}

// Book CTAs point at the existing public booking route (/book/leuk).
export const BOOK_HREF = "/book/leuk";

export const PLACEHOLDER_PRACTITIONERS: PlaceholderPractitioner[] = [
  {
    id: "pp-john-smith",
    name: "John Smith",
    credential: "MD",
    title: "Psychiatrist",
    care: "Medication",
    focus: ["Anxiety", "Depression", "ADHD"],
    borough: "Manhattan",
    telehealth: true,
    nextAvailable: "Tomorrow",
    hue: "teal",
  },
  {
    id: "pp-jane-doe",
    name: "Jane Doe",
    credential: "PMHNP",
    title: "Psychiatric Nurse Practitioner",
    care: "Therapy + medication",
    focus: ["Depression", "Bipolar", "Sleep"],
    borough: "Brooklyn",
    telehealth: true,
    nextAvailable: "This week",
    hue: "amber",
  },
  {
    id: "pp-john-doe",
    name: "John Doe",
    credential: "LCSW",
    title: "Therapist",
    care: "Therapy",
    focus: ["Trauma & PTSD", "Grief", "Relationships"],
    borough: "Queens",
    telehealth: true,
    nextAvailable: "Thu, this week",
    hue: "blue",
  },
  {
    id: "pp-jane-smith",
    name: "Jane Smith",
    credential: "PhD",
    title: "Psychologist",
    care: "Therapy",
    focus: ["Anxiety", "OCD", "LGBTQIA+ affirming"],
    borough: "Virtual",
    telehealth: true,
    nextAvailable: "This week",
    hue: "pink",
  },
  {
    id: "pp-richard-roe",
    name: "Richard Roe",
    credential: "MD",
    title: "Psychiatrist",
    care: "Therapy + medication",
    focus: ["ADHD", "Anxiety", "Depression"],
    borough: "Bronx",
    telehealth: true,
    nextAvailable: "Fri, this week",
    hue: "teal",
  },
  {
    id: "pp-mary-major",
    name: "Mary Major",
    credential: "LMHC",
    title: "Mental Health Counselor",
    care: "Therapy",
    focus: ["Stress", "Relationships", "Life transitions"],
    borough: "Virtual",
    telehealth: true,
    nextAvailable: "Next week",
    hue: "amber",
  },
];
