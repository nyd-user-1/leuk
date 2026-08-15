// The Leuk booking card — an MCP App rendered inline in the chat by the host
// (Claude.ai, ChatGPT, Claude Desktop, …) when list_bookable, get_availability
// or book_appointment runs.
//
// Five slides, one card, ← → in the top-right walk them like a tiny browser:
//   1 people   — available providers (from list_bookable). Name ↗ · Book now.
//   2 service  — session type.
//   3 times    — a day of open times, ‹ › to move days.
//   4 form     — name, email, phone, Book.
//   5 done     — "your appointment is set for …" with the practical reminders.
// A model that calls get_availability directly lands on slide 3; a booking
// the model makes itself lands on slide 5.
//
// Data the card needs (another day, another clinician, the booking) comes
// through the host from the app-only twin tools card_roster /
// card_availability / card_book — NOT the model-facing app tools, because a
// host renders a fresh card for every app-tool call. Nothing here reaches
// Leuk directly — no fetch, no cookies, no PHI beyond what the person types.

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
  price_usd?: number;
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

// What the person has chosen so far — carried across slides.
type Pick = {
  practitioner?: Practitioner;
  service?: Service;
  avail?: Availability;
  time?: string;
};

type Slide =
  | { kind: "people"; roster: Roster }
  | { kind: "service"; roster: Roster }
  | { kind: "times"; avail: Availability }
  | { kind: "form" }
  | { kind: "done"; booking: Booking };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
  back: $<HTMLButtonElement>("back"),
  fwd: $<HTMLButtonElement>("fwd"),
  title: $("title"),
  sub: $("sub"),
  sPeople: $("s-people"),
  people: $("people"),
  sService: $("s-service"),
  services: $("services"),
  sTimes: $("s-times"),
  prev: $<HTMLButtonElement>("prev"),
  next: $<HTMLButtonElement>("next"),
  date: $("date"),
  slots: $("slots"),
  empty: $("empty"),
  sForm: $("s-form"),
  summary: $("summary"),
  first: $<HTMLInputElement>("first"),
  last: $<HTMLInputElement>("last"),
  email: $<HTMLInputElement>("email"),
  phone: $<HTMLInputElement>("phone"),
  book: $<HTMLButtonElement>("book"),
  page: $<HTMLButtonElement>("page"),
  sDone: $("s-done"),
  receipt: $("receipt"),
  msg: $("msg"),
  steps: $("steps"),
  fine: $("fine"),
};

// ── State ────────────────────────────────────────────────────────────────────

const history: Slide[] = [];
let cursor = -1;
let busy = false;
let roster: Roster | null = null;
const pick: Pick = {};

const cur = (): Slide | null => history[cursor] ?? null;
function push(slide: Slide) {
  history.splice(cursor + 1);
  history.push(slide);
  cursor = history.length - 1;
  render();
}
function replace(slide: Slide) {
  if (cursor < 0) return push(slide);
  history[cursor] = slide;
  render();
}

// ── Formatting ───────────────────────────────────────────────────────────────

const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
};
const dateOf = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fmtDate = (ymd: string) => dateOf(ymd).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtDateLong = (ymd: string) =>
  dateOf(ymd).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const ymdOf = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const shiftDate = (ymd: string, days: number) => {
  const dt = dateOf(ymd);
  dt.setDate(dt.getDate() + days);
  return ymdOf(dt);
};
const todayYmd = () => ymdOf(new Date());
/** Tomorrow, skipping the weekend — a sensible first day to show. */
const firstDayToShow = () => {
  const dt = new Date();
  dt.setDate(dt.getDate() + 1);
  while (dt.getDay() === 0 || dt.getDay() === 6) dt.setDate(dt.getDate() + 1);
  return ymdOf(dt);
};
const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

// ── Rendering ────────────────────────────────────────────────────────────────

function setMsg(kind: "ok" | "err" | null, text = "") {
  el.msg.className = kind ? `msg ${kind}` : "msg hidden";
  el.msg.textContent = text;
}

function show(which: Slide["kind"] | null) {
  el.sPeople.classList.toggle("hidden", which !== "people");
  el.sService.classList.toggle("hidden", which !== "service");
  el.sTimes.classList.toggle("hidden", which !== "times");
  el.sForm.classList.toggle("hidden", which !== "form");
  el.sDone.classList.toggle("hidden", which !== "done");
}

const STEP_LABELS: Record<Slide["kind"], string> = {
  people: "Step 1 of 4 · provider",
  service: "Step 2 of 4 · session type",
  times: "Step 3 of 4 · date & time",
  form: "Step 4 of 4 · your details",
  done: "",
};

function render() {
  const s = cur();
  el.back.disabled = busy || cursor <= 0;
  el.fwd.disabled = busy || cursor >= history.length - 1;
  el.fine.textContent = "";
  el.steps.textContent = s ? STEP_LABELS[s.kind] : "";
  if (!s) return;
  show(s.kind);

  if (s.kind === "people") {
    setMsg(null);
    el.title.textContent = "Available providers";
    el.sub.textContent = "Manhattan · telehealth available";
    el.people.replaceChildren(
      ...s.roster.practitioners.map((p) => {
        const row = document.createElement("div");
        row.className = "person";
        const who = document.createElement("div");
        who.className = "who";
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = p.name;
        who.append(name);
        if (p.url) {
          const ext = document.createElement("button");
          ext.type = "button";
          ext.className = "ext";
          ext.title = `Open ${p.name}'s profile in a new tab`;
          ext.setAttribute("aria-label", ext.title);
          ext.textContent = "↗";
          ext.addEventListener("click", () => void app.openLink({ url: p.url! }));
          who.append(ext);
        }
        const go = document.createElement("button");
        go.type = "button";
        go.className = "go";
        go.textContent = "Book now";
        go.disabled = busy;
        go.addEventListener("click", () => {
          pick.practitioner = p;
          push({ kind: "service", roster: s.roster });
        });
        row.append(who, go);
        return row;
      }),
    );
    return;
  }

  if (s.kind === "service") {
    setMsg(null);
    el.title.textContent = pick.practitioner ? `Book with ${pick.practitioner.name}` : "Session type";
    el.sub.textContent = "What kind of visit?";
    el.services.replaceChildren(
      ...s.roster.services.map((sv) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pill" + (sv.id === pick.service?.id ? " sel" : "");
        b.innerHTML = `${sv.name} <small>· ${sv.minutes} min${sv.telehealth ? " · telehealth" : ""}</small>`;
        b.disabled = busy;
        b.addEventListener("click", () => {
          pick.service = sv;
          void openTimes();
        });
        return b;
      }),
    );
    return;
  }

  if (s.kind === "times") {
    const a = s.avail;
    el.title.textContent = pick.practitioner ? `Book with ${pick.practitioner.name}` : "Book an appointment";
    el.sub.textContent = a.error ? "" : `${a.service} · ${a.minutes} min${a.telehealth ? " · telehealth" : ""}`;
    if (a.error) {
      setMsg("err", a.error);
      el.slots.replaceChildren();
      return;
    }
    el.date.textContent = fmtDate(a.date);
    el.prev.disabled = busy || a.date <= todayYmd();
    el.next.disabled = busy;
    el.slots.replaceChildren(
      ...a.open_times.map((t) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "slot" + (t === pick.time && pick.avail?.date === a.date ? " sel" : "");
        b.textContent = fmtTime(t);
        b.disabled = busy;
        b.addEventListener("click", () => {
          pick.avail = a;
          pick.time = t;
          push({ kind: "form" });
          el.first.focus();
        });
        return b;
      }),
    );
    el.empty.classList.toggle("hidden", a.open_times.length > 0);
    el.fine.textContent = "Times are the practice's local time.";
    return;
  }

  if (s.kind === "form") {
    const a = pick.avail!;
    el.title.textContent = "Your details";
    el.sub.textContent = "For the confirmation and, on a first visit, your patient-portal invitation.";
    el.summary.innerHTML = `<b>${pick.practitioner?.name ?? a.practitioner_name ?? "Appointment"}</b> · ${a.service} · ${a.minutes} min${a.telehealth ? " · telehealth" : ""}<br><b>${fmtDate(a.date)} · ${fmtTime(pick.time!)}</b>`;
    el.book.textContent = `Book ${fmtDate(a.date)} · ${fmtTime(pick.time!)}`;
    el.book.disabled = busy;
    el.page.classList.toggle("hidden", !a.book_url);
    el.fine.textContent = "Booking creates a real appointment and emails a confirmation.";
    return;
  }

  // done
  const b = s.booking;
  const a = pick.avail;
  const who = pick.practitioner?.name ?? a?.practitioner_name ?? "your clinician";
  el.title.textContent = b.booked ? "You're booked" : "Not booked";
  el.sub.textContent = "";
  if (!b.booked) {
    el.receipt.innerHTML = "";
    setMsg("err", b.error ?? "The booking could not be completed.");
    return;
  }
  setMsg(null);
  const ymd = b.when?.slice(0, 10) ?? a?.date ?? "";
  const hhmm = b.when?.slice(11, 16) ?? pick.time ?? "";
  const when = ymd && hhmm ? `${fmtDateLong(ymd)}, ${fmtTime(hhmm)}` : "";
  const price = a?.price_usd ?? pick.service?.price_usd;
  const parts: string[] = [];
  parts.push(`<div class="when">Your appointment with ${who} is set for ${when}.</div>`);
  if (a?.telehealth) parts.push(`<p>This is a telehealth visit — the details are in your confirmation email.</p>`);
  parts.push(
    `<p>Please remember to bring a copy of your insurance card${price != null ? `, or be prepared to pay the cash rate of ${money(price)}` : ""}.</p>`,
  );
  parts.push(`<p>${b.confirmation ?? "A confirmation email is on its way."}</p>`);
  el.receipt.innerHTML = parts.join("");
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

const app = new App({ name: "Leuk booking", version: "1.2.0" });

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

app.ontoolinput = (p) => {
  const a = (p.arguments ?? {}) as Record<string, string>;
  el.title.textContent = a.date ? `Loading times for ${fmtDate(a.date)}…` : "Loading…";
};

/** Whatever tool the model called, land on the matching slide. */
function ingest(data: ToolData) {
  if ("kind" in data && data.kind === "roster") {
    roster = data;
    push({ kind: "people", roster: data });
    return;
  }
  if ("kind" in data && data.kind === "availability") {
    if (data.practitioner_id) pick.practitioner = { id: data.practitioner_id, name: data.practitioner_name ?? "" };
    if (data.service_id) {
      pick.service = { id: data.service_id, name: data.service, minutes: data.minutes, telehealth: data.telehealth, price_usd: data.price_usd ?? 0 };
    }
    push({ kind: "times", avail: data });
    return;
  }
  if ("kind" in data && data.kind === "booking") {
    push({ kind: "done", booking: data });
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

async function withBusy(fn: () => Promise<void>) {
  busy = true;
  render();
  try {
    await fn();
  } finally {
    busy = false;
    render();
  }
}

// Card-internal calls go to the app-only twins (see route.ts).
async function fetchAvailability(pid: string, sid: string, date: string): Promise<Availability | null> {
  const r = await app.callServerTool({ name: "card_availability", arguments: { practitioner_id: pid, service_id: sid, date } });
  return parse<Availability>(r);
}

/** Service chosen → the clinician's times. */
async function openTimes() {
  const p = pick.practitioner;
  const sv = pick.service;
  if (!p || !sv) return;
  await withBusy(async () => {
    const a = await fetchAvailability(p.id, sv.id, firstDayToShow()).catch(() => null);
    if (!a) return setMsg("err", "Could not load times. Try again.");
    setMsg(null);
    push({ kind: "times", avail: a });
  });
}

/** Another day — same slide, not a history step. */
async function loadDate(date: string) {
  const s = cur();
  const p = pick.practitioner;
  const sv = pick.service;
  if (!s || s.kind !== "times" || !p || !sv) return;
  await withBusy(async () => {
    const a = await fetchAvailability(p.id, sv.id, date).catch(() => null);
    if (!a) return setMsg("err", "Could not load that day.");
    setMsg(null);
    replace({ kind: "times", avail: a });
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
  if (s?.kind === "times") void loadDate(shiftDate(s.avail.date, -1));
});
el.next.addEventListener("click", () => {
  const s = cur();
  if (s?.kind === "times") void loadDate(shiftDate(s.avail.date, 1));
});
el.page.addEventListener("click", () => {
  const url = pick.avail?.book_url;
  if (!url) return;
  void app.openLink({ url: pick.time ? `${url}${url.includes("?") ? "&" : "?"}time=${pick.time}` : url });
});

// A plain button, not a <form> submit: sandboxed frames block form submission
// unless the host grants allow-forms, and we cannot assume it does.
el.book.addEventListener("click", async () => {
  const a = pick.avail;
  const time = pick.time;
  const p = pick.practitioner;
  const sv = pick.service;
  if (!a || !time || !p || !sv || busy) return;
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
  await withBusy(async () => {
    let b: Booking | null = null;
    try {
      b = parse<Booking>(
        await app.callServerTool({
          name: "card_book",
          arguments: {
            practitioner_id: p.id,
            service_id: sv.id,
            date: a.date,
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
        const fresh = await fetchAvailability(p.id, sv.id, a.date).catch(() => null);
        if (fresh) {
          pick.time = undefined;
          cursor--; // back to the times slide
          replace({ kind: "times", avail: fresh });
        }
      }
      return;
    }
    push({ kind: "done", booking: b });
    // Tell the conversation. The model does not see calls the card makes, so
    // post a message as the person; the host shows it and the model responds.
    const line = `I booked ${a.service} with ${p.name} on ${fmtDate(a.date)} at ${fmtTime(time)} using the booking card, as ${first} ${last}. It's confirmed and the email is on its way — no need to book it again.`;
    try {
      await app.sendMessage({ role: "user", content: [{ type: "text", text: line }] });
    } catch {
      await app.updateModelContext({ content: [{ type: "text", text: line }] }).catch(() => undefined);
    }
  });
});

app.connect().then(applyTheme).catch(() => setMsg("err", "Could not connect to the chat host."));
