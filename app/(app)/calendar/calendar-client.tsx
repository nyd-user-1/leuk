"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { type IconName } from "@/components/ui/icons";
import { DatePicker } from "@/components/ui/date-picker";
import { Divider } from "@/components/ui/divider";
import { KebabMenu } from "@/components/ui/kebab-menu";
import { MenuItem } from "@/components/ui/dropdown-menu";
import { SearchInput } from "@/components/ui/search-input";
import { TopBarActions } from "@/components/shell/topbar-slot";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatTime } from "@/lib/format";
import type { Appointment } from "@/lib/types";
import type { Client, Location, Service } from "@/lib/types";
import type { ClientLite, CreateAppointmentInput } from "@/lib/repos/appointments";
import type { PractitionerLite } from "@/lib/repos/services";
import { SERVICE_COLOR_SLOTS } from "@/lib/service-colors";
import {
  addDays,
  dateKey,
  daysOfMonth,
  minutesOfDay,
  nextWorkday,
  parseKey,
  startOfWorkWeek,
} from "./calendar-utils";
import { AgendaList } from "@/components/calendar/agenda-list";
import { AppointmentDetailPanel, AppointmentFormPanel, type CreateDraft } from "./appointment-panels";
import { MonthGrid } from "./month-grid";
import { WeekGrid, type CalEvent } from "./week-grid";

// Chips are colored by PRACTITIONER — a stable slot per id (position in the
// practitioners list, not a hash) so colors stay distinct as long as the
// roster fits in SERVICE_COLOR_SLOTS.

// The flagship calendar surface: Toolbar (Today · prev/next · range label ·
// Day/Week · practitioner filter · + New) + rail (mini-month DatePicker +
// practitioner checkboxes) + WeekGrid + appointment SidePanels.

type Panel = { kind: "detail"; id: string } | { kind: "create"; draft: CreateDraft } | null;

// Leading icon for a calendar session chip, by service type.
function sessionIcon(svc?: Service): IconName | undefined {
  if (svc?.telehealth) return "video";
  const n = svc?.name.toLowerCase() ?? "";
  if (n.includes("therapy")) return "book-heart";
  if (n.includes("follow")) return "corner-down-right";
  if (n.includes("initial") || n.includes("evaluation")) return "corner-down-right";
  if (n.includes("group")) return "users";
  return undefined;
}

export function CalendarClient({
  initialAppointments,
  clients: initialClients,
  services,
  locations,
  practitioners,
}: {
  initialAppointments: Appointment[];
  clients: ClientLite[];
  services: Service[];
  locations: Location[];
  practitioners: PractitionerLite[];
}) {
  const toast = useToast();
  const [appointments, setAppointments] = useState(initialAppointments);
  // Local so a client quick-added from the New appointment panel is selectable
  // immediately, without a round trip back through the server component.
  const [clients, setClients] = useState(initialClients);
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [agendaRange, setAgendaRange] = useState<"day" | "week" | "month">("day");
  const [anchor, setAnchor] = useState(() => dateKey(new Date()));
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState<Set<string>>(() => new Set(practitioners.map((p) => p.id)));
  const [panel, setPanel] = useState<Panel>(null);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const practitionerById = useMemo(() => new Map(practitioners.map((p) => [p.id, p])), [practitioners]);
  const practitionerColor = useMemo(
    () => new Map(practitioners.map((p, i) => [p.id, SERVICE_COLOR_SLOTS[i % SERVICE_COLOR_SLOTS.length].hex])),
    [practitioners],
  );

  const days = useMemo(() => {
    if (view === "day") return [anchor];
    const start = startOfWorkWeek(anchor);
    return Array.from({ length: 5 }, (_, i) => addDays(start, i));
  }, [view, anchor]);

  const events: CalEvent[] = useMemo(
    () =>
      appointments
        .filter((a) => a.status !== "cancelled" && visible.has(a.practitionerId))
        .map((a) => {
          const svc = serviceById.get(a.serviceId);
          const loc = a.locationId ? locationById.get(a.locationId) : undefined;
          // Modality: location wins; fall back to the service flag if unset.
          const telehealth = loc ? loc.kind === "telehealth" : !!svc?.telehealth;
          return {
            id: a.id,
            date: dateKey(new Date(a.startsAt)),
            startMin: minutesOfDay(a.startsAt),
            endMin: Math.max(minutesOfDay(a.startsAt) + 15, minutesOfDay(a.endsAt)),
            title: clientById.get(a.clientId)?.name ?? "Client",
            timeLabel: `${formatTime(a.startsAt)} – ${formatTime(a.endsAt)}`,
            color: practitionerColor.get(a.practitionerId) ?? SERVICE_COLOR_SLOTS[0].hex,
            telehealth,
            icon: sessionIcon(svc),
            status: a.status,
            muted: a.status === "completed" || a.status === "no_show",
          };
        }),
    [appointments, visible, serviceById, clientById, locationById, practitionerColor],
  );

  // Search bar filters the grid + agenda by client name.
  const shownEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? events.filter((e) => e.title.toLowerCase().includes(q)) : events;
  }, [events, search]);

  // Rail agenda — upcoming appointments only (past ones drop off), over the
  // Day/Week/Month range around the anchor, grouped by day (empty days omitted).
  const agenda = useMemo(() => {
    let keys: string[];
    if (agendaRange === "day") {
      keys = [anchor];
    } else if (agendaRange === "week") {
      const start = startOfWorkWeek(anchor);
      keys = Array.from({ length: 5 }, (_, i) => addDays(start, i));
    } else {
      keys = daysOfMonth(anchor);
    }
    const inRange = new Set(keys);
    const now = new Date();
    const nowKey = dateKey(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const isPast = (ev: CalEvent) => ev.date < nowKey || (ev.date === nowKey && ev.endMin <= nowMin);
    const byDay = new Map<string, CalEvent[]>();
    for (const ev of shownEvents) {
      if (!inRange.has(ev.date) || isPast(ev)) continue;
      const bucket = byDay.get(ev.date);
      if (bucket) bucket.push(ev);
      else byDay.set(ev.date, [ev]);
    }
    return keys
      .filter((k) => byDay.has(k))
      .map((k) => ({
        key: k,
        label: parseKey(k).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        items: byDay.get(k)!.sort((a, b) => a.startMin - b.startMin),
      }));
  }, [shownEvents, anchor, agendaRange]);

  const agendaTotal = useMemo(() => agenda.reduce((n, g) => n + g.items.length, 0), [agenda]);

  // ── mutations (API + local state) ───────────────────────────────────────────

  const applyPatch = async (id: string, patch: Record<string, unknown>): Promise<Appointment | null> => {
    const res = await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.appointment) {
      toast(data.error ?? "Could not update the appointment.", "danger");
      return null;
    }
    const updated: Appointment = data.appointment;
    setAppointments((list) => list.map((a) => (a.id === id ? updated : a)));
    return updated;
  };

  const moveAppointment = async (id: string, date: string, startMin: number) => {
    const apt = appointments.find((a) => a.id === id);
    if (!apt) return;
    const durationMs = new Date(apt.endsAt).getTime() - new Date(apt.startsAt).getTime();
    const starts = new Date(`${date}T00:00:00`);
    starts.setMinutes(startMin);
    const updated = await applyPatch(id, {
      startsAt: starts.toISOString(),
      endsAt: new Date(starts.getTime() + durationMs).toISOString(),
    });
    if (updated) toast(`Moved to ${formatTime(updated.startsAt)}.`, "success");
  };

  const changeStatus = async (id: string, status: Appointment["status"]) => {
    const updated = await applyPatch(id, { status });
    if (updated) toast(`Marked ${status.replace("_", " ")}.`, "success");
  };

  const cancelAppointment = async (id: string, reason: string) => {
    const updated = await applyPatch(id, { status: "cancelled", cancelledReason: reason });
    if (updated) {
      toast("Appointment cancelled.", "success");
      setPanel(null);
    }
  };

  const createAppointment = async (input: CreateAppointmentInput): Promise<boolean> => {
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.appointment) return false;
    setAppointments((list) => [...list, data.appointment as Appointment]);
    toast("Appointment created.", "success");
    setPanel(null);
    return true;
  };

  // Quick-add from the Client picker — name only; the rest of the record gets
  // filled in on /clients. A booked person is a client, not a lead.
  const createClient = async (name: string, practitionerId: string | null): Promise<ClientLite | null> => {
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) {
      toast("Enter a first and last name.", "danger");
      return null;
    }
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: parts[0],
        lastName: parts.slice(1).join(" "),
        status: "active",
        primaryPractitionerId: practitionerId,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { client?: Client; error?: string };
    if (!res.ok || !data.client) {
      toast(data.error ?? "Could not add the client.", "danger");
      return null;
    }
    const c = data.client;
    const lite: ClientLite = {
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      status: c.status,
      userId: c.userId,
    };
    setClients((list) => [...list, lite].sort((a, b) => a.name.localeCompare(b.name)));
    toast(`${lite.name} added to your clients.`, "success");
    return lite;
  };

  // ── toolbar state helpers ───────────────────────────────────────────────────

  const filterValue = visible.size === practitioners.length ? "all" : visible.size === 1 ? [...visible][0] : "";
  const defaultPractitioner = visible.size >= 1 ? [...visible][0] : practitioners[0]?.id;

  const openCreate = (draft: CreateDraft) =>
    setPanel({ kind: "create", draft: { practitionerId: defaultPractitioner, ...draft } });

  const detail = panel?.kind === "detail" ? appointments.find((a) => a.id === panel.id) ?? null : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Page action lives in the TopBar (canonical rule — CLAUDE.md) */}
      <TopBarActions>
        <Button
          size="sm"
          leftIcon="plus"
          onClick={() => {
            const now = new Date();
            openCreate({ date: nextWorkday(dateKey(now)), startMin: Math.min(19 * 60, (now.getHours() + 1) * 60) });
          }}
        >
          New
        </Button>
      </TopBarActions>

      {/* Toolbar — search over the rail column; Today + view + practitioner
          grouped over the grid. Date navigation also lives in the rail. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 lg:flex-nowrap lg:gap-4">
        {/* Left column — mirrors the rail width; search sits above it */}
        <div className="flex items-center gap-2 lg:w-80 lg:shrink-0">
          <SearchInput
            aria-label="Search appointments"
            placeholder="Search appointments…"
            className="w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* Right column — flex-1 so the controls align with the grid */}
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setAnchor(nextWorkday(dateKey(new Date())))}>
            Today
          </Button>
          <Select
            aria-label="Calendar view"
            className="w-28"
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
            ]}
            value={view}
            onValueChange={(v) => setView(v as "day" | "week" | "month")}
          />
          <Select
            aria-label="Practitioner filter"
            className="w-52"
            placeholder="Some practitioners"
            options={[
              { value: "all", label: "All practitioners" },
              ...practitioners.map((p) => ({
                value: p.id,
                label: p.name,
                avatar: { name: p.name, hue: p.avatarHue, src: p.photoUrl },
              })),
            ]}
            value={filterValue}
            onValueChange={(v) =>
              setVisible(v === "all" || v === "" ? new Set(practitioners.map((p) => p.id)) : new Set([v]))
            }
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Rail: mini month + practitioner filter */}
        {/* w-80: DatePicker (w-64) + p-4 + borders need 290px — w-72 overflowed
            by 2px and rendered a horizontal scrollbar (always-show setting) */}
        <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto rounded-card border border-border bg-surface p-4 shadow-card lg:flex">
          {/* key remounts the mini-month so its view follows the anchor; its
              own ‹ › arrows are THE calendar navigation (single source) */}
          <DatePicker key={anchor.slice(0, 7)} value={anchor} onChange={setAnchor} />
          <Divider />
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[15px] font-semibold text-text">Agenda</p>
              <span className="-mr-2 shrink-0">
                <KebabMenu label="Agenda range" align="right">
                  {(["day", "week", "month"] as const).map((r) => (
                    <MenuItem
                      key={r}
                      label={r[0].toUpperCase() + r.slice(1)}
                      selected={agendaRange === r}
                      onClick={() => setAgendaRange(r)}
                    />
                  ))}
                </KebabMenu>
              </span>
            </div>
            {/* The rows live in components/calendar/agenda-list.tsx — /analytics
                renders the same list in its "Next up" card. */}
            <AgendaList groups={agenda} onSelect={(id) => setPanel({ kind: "detail", id })} />
          </div>
          {/* Dynamic sum of the range, pinned to the bottom of the panel */}
          <div className="border-t border-border pt-3 text-[13px] font-medium text-text-muted">
            {agendaTotal} {agendaTotal === 1 ? "appointment" : "appointments"}
          </div>
        </aside>

        {/* Grid */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card">
          {view === "month" ? (
            <MonthGrid
              anchor={anchor}
              events={shownEvents}
              onChipClick={(id) => setPanel({ kind: "detail", id })}
              onDayClick={(date) => {
                setAnchor(date);
                setView("day");
              }}
            />
          ) : (
            <WeekGrid
              days={days}
              events={shownEvents}
              onChipClick={(id) => setPanel({ kind: "detail", id })}
              onSlotClick={(date, startMin) => openCreate({ date, startMin })}
              onDragCreate={(date, startMin, endMin) => openCreate({ date, startMin, endMin })}
              onMove={moveAppointment}
            />
          )}
        </div>
      </div>

      {/* Panels */}
      {detail && (
        <AppointmentDetailPanel
          appointment={detail}
          client={clientById.get(detail.clientId)}
          service={serviceById.get(detail.serviceId)}
          location={detail.locationId ? locationById.get(detail.locationId) : undefined}
          practitioner={practitionerById.get(detail.practitionerId)}
          onClose={() => setPanel(null)}
          onStatusChange={changeStatus}
          onCancel={cancelAppointment}
        />
      )}
      <AppointmentFormPanel
        draft={panel?.kind === "create" ? panel.draft : null}
        clients={clients}
        services={services}
        locations={locations}
        practitioners={practitioners}
        onClose={() => setPanel(null)}
        onCreateClient={createClient}
        onCreate={createAppointment}
      />
    </div>
  );
}
