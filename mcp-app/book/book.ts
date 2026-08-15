// The Leuk booking card — an MCP App rendered inline in the chat by the host
// (Claude.ai, Claude Desktop, …) when list_bookable, get_availability or
// book_appointment runs.
//
// Three screens, one card:
//   roster   — who you can book (from list_bookable): service pills + names.
//              Click a name → their open times. ↗ opens the profile in a tab.
//   slots    — open times for one practitioner/service/day (from
//              get_availability), ‹ › to move days; pick a time → the form.
//   done     — the receipt (after book_appointment, from the card or the model).
// ← → in the top-right walk a history stack, like a tiny browser.
//
// It talks to the same MCP server through the host: every button that needs
// data calls a server tool via the host. Nothing here reaches Leuk directly —
// no fetch, no cookies, no PHI beyond what the person types into the form.

import { App } from "@modelcontextprotocol/ext-apps";

type Service = { id: string; name: string; minutes: number; telehealth: boolean; price_usd: number };
type Practitioner = { id: string; name: string; url?: string; book_url?: string };
type Roster = { kind: "roster"; practitioners: Practitioner[]; services: Service[] };
type Availability = {
  kind: "availability";
  date: string;
  practitioner_id?: string;
  practitioner_name?: string;
  service_id?: string;
  service: string;
  minutes: number;
  telehealth: boolean;
  open_times: string[];
  book_url?: string;
  error?: string;
};
type Booking = {
  kind: "booking";
  booked: boolean;
  when?: string;
  confirmation?: string;
  manage_url?: string;
  error?: string;
  retry?: string;
};
type ToolData = Roster | Availability | Booking | { error: string };

// One entry per screen the person has seen. Enough state to re-render it.
type Screen =
  | { kind: "roster"; roster: Roster; serviceId: string }
  | { kind: "slots"; avail: Availability; time: string }
  | { kind: "done"; booking: Booking; summary: string };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
  back: $<HTMLButtonElement>("back"),
  fwd: $<HTMLButtonElement>("fwd"),
  title: $("title"),
  sub: $("sub"),
  roster: $("roster"),
  services: $("services"),
  people: $("people"),
  picker: $("picker"),
  prev: $<HTMLButtonElement>("prev"),
  next: $<HTMLButtonElement>("next"),
  date: $("date"),
  slots: $("slots"),
  empty: $("empty"),
  form: $("form"),
  first: $<HTMLInputElement>("first"),
  last: $<HTMLInputElement>("last"),
  email: $<HTMLInputElement>("email"),
  phone: $<HTMLInputElement>("phone"),
  book: $<HTMLButtonElement>("book"),
  page: $<HTMLButtonElement>("page"),
  msg: $("msg"),
  fine: $("fine"),
};

// ── State ────────────────────────────────────────────────────────────────────

const history: Screen[] = [];
let cursor = -1; // index into history of the screen on display
let busy = false;
// Remembered across screens so "back to roster → another name" keeps the
// service, and so the slots screen can re-query without the roster.
let roster: Roster | null = null;
let serviceId = "";
let practitionerId = "";
let practitionerName = "";

const cur = (): Screen | null => history[cursor] ?? null;

function push(screen: Screen) {
  history.splice(cursor + 1); // a new screen discards any "forward" branch
  history.push(screen);
  cursor = history.length - 1;
  render();
}
function replace(screen: Screen) {
  if (cursor < 0) return push(screen);
  history[cursor] = screen;
  render();
}

// ── Formatting ───────────────────────────────────────────────────────────────

const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
};
const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};
const ymdOf = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const shiftDate = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return ymdOf(new Date(y, m - 1, d + days));
};
const todayYmd = () => ymdOf(new Date());
/** Tomorrow, skipping to Monday from a Friday/Saturday — a sensible first day to show. */
const firstDayToShow = () => {
  const dt = new Date();
  dt.setDate(dt.getDate() + 1);
  while (dt.getDay() === 0 || dt.getDay() === 6) dt.setDate(dt.getDate() + 1);
  return ymdOf(dt);
};

// ── Rendering ────────────────────────────────────────────────────────────────

function setMsg(kind: "ok" | "err" | null, text = "") {
  el.msg.className = kind ? `msg ${kind}` : "msg hidden";
  el.msg.textContent = text;
}

function show(which: "roster" | "picker" | null) {
  el.roster.classList.toggle("hidden", which !== "roster");
  el.picker.classList.toggle("hidden", which !== "picker");
}

function render() {
  const s = cur();
  el.back.disabled = busy || cursor <= 0;
  el.fwd.disabled = busy || cursor >= history.length - 1;
  el.fine.textContent = "";
  if (!s) return;

  if (s.kind === "roster") {
    setMsg(null);
    show("roster");
    el.title.textContent = "Who you can book";
    el.sub.textContent = "Pick a service, then a clinician. ↗ opens their profile.";
    el.services.replaceChildren(
      ...s.roster.services.map((sv) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pill" + (sv.id === s.serviceId ? " sel" : "");
        b.innerHTML = `${sv.name} <small>· ${sv.minutes} min · $${sv.price_usd}</small>`;
        b.addEventListener("click", () => {
          serviceId = sv.id;
          replace({ ...s, serviceId: sv.id });
        });
        return b;
      }),
    );
    el.people.replaceChildren(
      ...s.roster.practitioners.map((p) => {
        const row = document.createElement("div");
        row.className = "person";
        const name = document.createElement("button");
        name.type = "button";
        name.className = "name";
        name.innerHTML = `<span>${p.name}</span><span class="go">see times ›</span>`;
        name.disabled = busy;
        name.addEventListener("click", () => void openSlots(p, s.serviceId));
        row.append(name);
        if (p.url) {
          const ext = document.createElement("button");
          ext.type = "button";
          ext.className = "ext";
          ext.title = `Open ${p.name}'s profile in a new tab`;
          ext.setAttribute("aria-label", ext.title);
          ext.textContent = "↗";
          ext.addEventListener("click", () => void app.openLink({ url: p.url! }));
          row.append(ext);
        }
        return row;
      }),
    );
    el.fine.textContent = "";
    return;
  }

  if (s.kind === "slots") {
    const a = s.avail;
    show("picker");
    el.title.textContent = practitionerName ? `Book with ${practitionerName}` : "Book an appointment";
    el.sub.textContent = a.error ? "" : `${a.service} · ${a.minutes} min${a.telehealth ? " · telehealth" : ""}`;
    if (a.error) {
      setMsg("err", a.error);
      el.slots.replaceChildren();
      el.form.classList.add("hidden");
      return;
    }
    el.date.textContent = fmtDate(a.date);
    el.prev.disabled = busy || a.date <= todayYmd();
    el.next.disabled = busy;
    el.slots.replaceChildren(
      ...a.open_times.map((t) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "slot" + (t === s.time ? " sel" : "");
        b.textContent = fmtTime(t);
        b.disabled = busy;
        b.addEventListener("click", () => {
          replace({ ...s, time: t });
          el.first.focus();
        });
        return b;
      }),
    );
    el.empty.classList.toggle("hidden", a.open_times.length > 0);
    el.form.classList.toggle("hidden", !s.time);
    el.book.textContent = s.time ? `Book ${fmtDate(a.date)} · ${fmtTime(s.time)}` : "Book";
    el.book.disabled = busy;
    el.page.classList.toggle("hidden", !a.book_url);
    el.fine.textContent = "Times are the practice's local time. Booking creates a real appointment and emails a confirmation.";
    return;
  }

  // done
  show(null);
  el.title.textContent = s.booking.booked ? "You're booked" : "Not booked";
  el.sub.textContent = s.summary;
  const b = s.booking;
  const when = b.when ? `${fmtDate(b.when.slice(0, 10))} at ${fmtTime(b.when.slice(11, 16))}` : "";
  setMsg(
    b.booked ? "ok" : "err",
    b.booked ? `${when ? when + ". " : ""}${b.confirmation ?? "A confirmation email is on its way."}` : (b.error ?? "The booking could not be completed."),
  );
  if (b.manage_url) {
    const btn = document.createElement("button");
    btn.className = "link";
    btn.type = "button";
    btn.textContent = "Manage your appointment";
    btn.addEventListener("click", () => void app.openLink({ url: b.manage_url! }));
    el.fine.append(btn);
  }
}

// ── Host wiring ──────────────────────────────────────────────────────────────

const app = new App({ name: "Leuk booking", version: "1.1.0" });

const parse = <T,>(result: { content?: Array<{ type: string; text?: string }>; structuredContent?: unknown }): T | null => {
  if (result.structuredContent) return result.structuredContent as T;
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

function applyTheme() {
  const theme = app.getHostContext()?.theme;
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
}
app.onhostcontextchanged = applyTheme;

// The host streams the tool's arguments before the result.
app.ontoolinput = (p) => {
  const a = (p.arguments ?? {}) as Record<string, string>;
  if (a.practitioner_id) practitionerId = a.practitioner_id;
  if (a.service_id) serviceId = a.service_id;
  el.title.textContent = a.date ? `Loading times for ${fmtDate(a.date)}…` : "Loading…";
};

/** Whatever tool the model called, land on the matching screen. */
function ingest(data: ToolData) {
  if ("kind" in data && data.kind === "roster") {
    roster = data;
    if (!serviceId || !data.services.some((s) => s.id === serviceId)) serviceId = data.services[0]?.id ?? "";
    push({ kind: "roster", roster: data, serviceId });
    return;
  }
  if ("kind" in data && data.kind === "availability") {
    practitionerId = data.practitioner_id ?? practitionerId;
    practitionerName = data.practitioner_name ?? practitionerName;
    serviceId = data.service_id ?? serviceId;
    push({ kind: "slots", avail: data, time: "" });
    return;
  }
  if ("kind" in data && data.kind === "booking") {
    push({ kind: "done", booking: data, summary: practitionerName ? `with ${practitionerName}` : "" });
    return;
  }
  setMsg("err", (data as { error?: string }).error ?? "Something went wrong. Ask again in the chat.");
}

app.ontoolresult = (result) => {
  const data = parse<ToolData>(result);
  if (!data) {
    setMsg("err", "Could not read the result. Ask again in the chat.");
    return;
  }
  ingest(data);
};

async function withBusy<T>(fn: () => Promise<T>): Promise<T | undefined> {
  busy = true;
  render();
  try {
    return await fn();
  } finally {
    busy = false;
    render();
  }
}

async function fetchAvailability(pid: string, sid: string, date: string): Promise<Availability | null> {
  const r = await app.callServerTool({
    name: "get_availability",
    arguments: { practitioner_id: pid, service_id: sid, date },
  });
  return parse<Availability>(r);
}

/** Roster → a practitioner's times. */
async function openSlots(p: Practitioner, sid: string) {
  await withBusy(async () => {
    const a = await fetchAvailability(p.id, sid, firstDayToShow()).catch(() => null);
    if (!a) return setMsg("err", "Could not load times. Try again.");
    practitionerId = p.id;
    practitionerName = p.name;
    serviceId = sid;
    push({ kind: "slots", avail: a, time: "" });
  });
}

/** Slots → another day (stays on the same screen; not a history step). */
async function loadDate(date: string) {
  const s = cur();
  if (!s || s.kind !== "slots" || !practitionerId || !serviceId) return;
  await withBusy(async () => {
    const a = await fetchAvailability(practitionerId, serviceId, date).catch(() => null);
    if (!a) return setMsg("err", "Could not load that day.");
    setMsg(null);
    replace({ kind: "slots", avail: a, time: "" });
  });
}

// ── Controls ─────────────────────────────────────────────────────────────────

el.back.addEventListener("click", () => {
  if (cursor > 0) {
    cursor--;
    render();
  }
});
el.fwd.addEventListener("click", () => {
  if (cursor < history.length - 1) {
    cursor++;
    render();
  }
});
el.prev.addEventListener("click", () => {
  const s = cur();
  if (s?.kind === "slots") void loadDate(shiftDate(s.avail.date, -1));
});
el.next.addEventListener("click", () => {
  const s = cur();
  if (s?.kind === "slots") void loadDate(shiftDate(s.avail.date, 1));
});
el.page.addEventListener("click", () => {
  const s = cur();
  if (s?.kind !== "slots" || !s.avail.book_url) return;
  const url = s.avail.book_url;
  void app.openLink({ url: s.time ? `${url}${url.includes("?") ? "&" : "?"}time=${s.time}` : url });
});

// A plain button, not a <form> submit: sandboxed frames block form submission
// unless the host grants allow-forms, and we cannot assume it does.
el.book.addEventListener("click", async () => {
  const s = cur();
  if (!s || s.kind !== "slots" || !s.time || busy) return;
  const first = el.first.value.trim();
  const last = el.last.value.trim();
  const email = el.email.value.trim();
  if (!first || !last) {
    setMsg("err", "First and last name, please — the appointment is booked under them.");
    (first ? el.last : el.first).focus();
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setMsg("err", "A valid email, please — that is where the confirmation goes.");
    el.email.focus();
    return;
  }
  setMsg(null);
  const { date } = s.avail;
  const time = s.time;
  const serviceName = s.avail.service;
  await withBusy(async () => {
    let b: Booking | null = null;
    try {
      b = parse<Booking>(
        await app.callServerTool({
          name: "book_appointment",
          arguments: {
            practitioner_id: practitionerId,
            service_id: serviceId,
            date,
            time,
            first_name: first,
            last_name: last,
            email,
            phone: el.phone.value.trim() || undefined,
          },
        }),
      );
    } catch {
      b = null;
    }
    if (!b) return setMsg("err", "The booking could not be completed. Try again, or use the booking page.");
    if (!b.booked) {
      setMsg("err", b.error ?? "The booking could not be completed.");
      if (b.retry) {
        const a = await fetchAvailability(practitionerId, serviceId, date).catch(() => null);
        if (a) replace({ kind: "slots", avail: a, time: "" });
      }
      return;
    }
    push({ kind: "done", booking: b, summary: `${serviceName} with ${practitionerName}` });
    // Tell the conversation. The model does not see calls the card makes, so
    // post a message as the person — the host shows it in the thread and the
    // model acknowledges it — with a context note as the fallback.
    const line = `I booked ${serviceName} with ${practitionerName} on ${fmtDate(date)} at ${fmtTime(time)} using the booking card, as ${first} ${last}. It's confirmed and the email is on its way — no need to book it again.`;
    try {
      await app.sendMessage({ role: "user", content: [{ type: "text", text: line }] });
    } catch {
      await app.updateModelContext({ content: [{ type: "text", text: line }] }).catch(() => undefined);
    }
  });
});

app.connect().then(applyTheme).catch(() => setMsg("err", "Could not connect to the chat host."));
