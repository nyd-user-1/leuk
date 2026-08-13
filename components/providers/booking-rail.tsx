"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BookingModal } from "@/components/booking/booking-modal";
import { BookingSheet } from "@/components/providers/booking-sheet";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { Spinner } from "@/components/ui/spinner";
import { TextLink } from "@/components/ui/text-link";
import type { Payer, Service } from "@/lib/types";

// The universal booking widget — active for bookable Leuk practitioners,
// a graceful stopgap for directory providers (NPI-sourced, unclaimed, no
// availability yet). Same card, same chrome.
//
// Active state: the classic calendar-first layout — month grid up top (days
// with no availability struck through), then at most SIX slot chips (2 rows
// × 3 cols) for the selected day with a "+N more times" expander, so open
// times read as scarce/valuable rather than a wall of inventory. Picking a
// time doesn't navigate away: it lifts the BookingSheet (time-confirm →
// details+insurance → cost estimate), keeping the user on the provider page.
//
// Inactive state: rather than a dead "coming soon", this offers Leuk itself
// — deliberately not a named clinician. Naming one made a promise the booking
// flow doesn't keep (/book/leuk lets the client pick), and it read as though
// we'd matched this specific provider to that specific therapist. The generic
// hand-off plus the brand mark says what's true: Leuk will route you.
// A "claim this profile" link is offered to the actual provider alongside it.

const DAYS_AHEAD = 28;
const INITIAL_SLOTS = 6; // 2 rows × 3 cols

const slotLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(0, 0, 0, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

const dayKey = (d: Date) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const prettyDate = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

/** Lead capture for off-platform providers — posts to /api/directory/leads. */
function RequestAppointmentForm({ providerId }: { providerId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [payer, setPayer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/directory/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, name, email, phone, payer }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send your request.");
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-field bg-teal-100 p-4">
        <p className="flex items-start gap-2 text-[15px] font-medium text-text">
          <Icon name="circle-check" size={18} className="mt-0.5 shrink-0 text-primary" />
          Request sent
        </p>
        <p className="mt-1.5 text-sm text-text-body">
          Our care team will reach out within one business day to coordinate with this provider — or match you with a
          similar one who has openings this week.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Your name" name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" />
      <Field label="Email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      <Field label="Phone" name="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
      <Field label="Insurance" name="payer" value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="e.g. Aetna — optional" />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" fullWidth loading={sending}>
        Request appointment
      </Button>
      <p className="text-[12px] leading-relaxed text-text-muted">
        Leuk will contact this provider on your behalf and follow up with you by email.
      </p>
    </form>
  );
}

export function BookingRail({
  practitionerId,
  services,
  payers,
  availableWeekdays,
  active,
  directoryName,
  claimHref,
  className = "",
}: {
  practitionerId: string;
  /** Active Leuk services — ignored (never fetched against) when `active` is false. */
  services: Service[];
  /** Insurance options for the BookingSheet's details step. */
  payers?: Payer[];
  /** Weekdays (0–6) with availability rules — non-matching calendar days render struck through. */
  availableWeekdays?: number[];
  /** True for a bookable Leuk practitioner; false for a directory provider. */
  active: boolean;
  /** Directory provider's display name — inactive state only. */
  directoryName?: string;
  /** "Is this you? Claim this profile" link — inactive state only. */
  claimHref?: string;
  className?: string;
}) {
  const service = services[0];
  // Directory (inactive) rail: "Book with Leuk" opens the wizard in a dialog
  // rather than navigating to /book/leuk.
  const [bookOpen, setBookOpen] = useState(false);

  // Bookable days: tomorrow..DAYS_AHEAD whose weekday has an availability rule.
  const enabledDates = useMemo(() => {
    const set = new Set<string>();
    if (!availableWeekdays?.length) return set;
    const today = new Date();
    for (let i = 1; i <= DAYS_AHEAD; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      if (availableWeekdays.includes(d.getDay())) set.add(dayKey(d));
    }
    return set;
  }, [availableWeekdays]);

  const firstAvailable = useMemo(() => [...enabledDates].sort()[0], [enabledDates]);

  const [date, setDate] = useState<string | undefined>(undefined);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [picked, setPicked] = useState<{ date: string; time: string } | null>(null);

  // Preselect the soonest bookable day so real times show immediately.
  useEffect(() => {
    if (active && !date && firstAvailable) setDate(firstAvailable);
  }, [active, date, firstAvailable]);

  useEffect(() => {
    if (!active || !date || !service) {
      setSlots(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setExpanded(false);
    fetch(`/api/book?practitionerId=${encodeURIComponent(practitionerId)}&serviceId=${encodeURIComponent(service.id)}&date=${date}`)
      .then((r) => r.json())
      .then((d) => alive && setSlots(Array.isArray(d.slots) ? d.slots : []))
      .catch(() => alive && setSlots([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [active, practitionerId, service, date]);

  const shown = slots && !expanded ? slots.slice(0, INITIAL_SLOTS) : slots;

  return (
    <div
      id="book"
      className={`scroll-mt-6 rounded-card border border-border bg-surface p-5 shadow-card ${
        // Inactive, the widget is stretched to stand level with the panel beside
        // it — so its short content becomes a column and the claim link settles
        // on the bottom edge rather than leaving a hole beneath it.
        active ? "" : "flex flex-col"
      } ${className}`}
    >
      {active && <h2 className="text-[17px] font-semibold text-text">Book an appointment</h2>}

      {active && service && (
        <>
          <DatePicker
            value={date}
            onChange={setDate}
            enabledDates={enabledDates.size > 0 ? enabledDates : undefined}
            className="mt-4"
          />

          <p className="mb-2 mt-4 text-sm font-medium text-text-body">
            {date ? prettyDate(date) : "Select a date to see available times."}
          </p>

          {date && loading && <Spinner className="text-primary" />}

          {date && !loading && slots?.length === 0 && (
            <p className="text-[14px] text-text-muted">No availability on this day — try another date.</p>
          )}

          {date && !loading && shown && shown.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {shown.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPicked({ date, time: s })}
                    className="rounded-field border border-field-border px-2 py-2 text-center text-sm font-medium text-text-body transition-colors hover:border-primary hover:bg-teal-100 hover:text-primary"
                  >
                    {slotLabel(s)}
                  </button>
                ))}
              </div>
              {!expanded && slots && slots.length > INITIAL_SLOTS && (
                <TextLink onClick={() => setExpanded(true)} className="mt-2.5 text-sm">
                  +{slots.length - INITIAL_SLOTS} more times
                </TextLink>
              )}
            </>
          )}

          {picked && (
            <BookingSheet
              open={Boolean(picked)}
              onClose={() => setPicked(null)}
              practitionerId={practitionerId}
              service={service}
              payers={payers ?? []}
              date={picked.date}
              time={picked.time}
            />
          )}
        </>
      )}

      {!active && (
        <div className="mt-3 flex flex-1 flex-col gap-3">
          <div className="rounded-field border border-border bg-canvas p-3">
            <Logo size="sm" className="mb-2" />
            <p className="text-[13px] text-text-body">
              We can connect you with a Leuk mental-health professional who works with similar needs — in-person or
              telehealth, usually within a week.
            </p>
            <button
              type="button"
              onClick={() => setBookOpen(true)}
              className="mt-2.5 inline-flex h-8 items-center justify-center rounded-field bg-primary px-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              Book with Leuk
            </button>
          </div>

          <p className="text-[13px] text-text-muted">
            This is a directory listing sourced from the national provider registry — {directoryName ?? "this provider"}{" "}
            isn&apos;t on Leuk&apos;s booking platform yet.
          </p>

          <RequestAppointmentForm providerId={practitionerId} />

          {claimHref && (
            <TextLink href={claimHref} className="mt-auto pt-2 text-[13px]">
              Is this you? Claim this profile
            </TextLink>
          )}
          <BookingModal open={bookOpen} onClose={() => setBookOpen(false)} />
        </div>
      )}
    </div>
  );
}
