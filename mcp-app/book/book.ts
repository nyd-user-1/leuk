// The Leuk booking card — an MCP App rendered inline in the chat by the host
// (Claude.ai, Claude Desktop, …) when `get_availability` runs.
//
// It talks to the same MCP server through the host: date navigation re-calls
// `get_availability`, the Book button calls `book_appointment`. Nothing here
// reaches Leuk directly — no fetch, no cookies, no PHI beyond what the person
// types into the form themselves. See app/api/mcp/route.ts for the wiring.

import { App } from "@modelcontextprotocol/ext-apps";

type Availability = {
  date: string;
  service: string;
  minutes: number;
  telehealth: boolean;
  open_times: string[];
  book_url?: string;
  practitioner_id?: string;
  practitioner_name?: string;
  service_id?: string;
  error?: string;
};

type Booked = {
  booked: boolean;
  when?: string;
  confirmation?: string;
  manage_url?: string;
  error?: string;
  retry?: string;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
  title: $("title"),
  sub: $("sub"),
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

let current: Availability | null = null;
// Ids the widget needs to re-query; seeded from the tool input the host streams
// us, then confirmed by the tool result.
let practitionerId = "";
let serviceId = "";
let practitionerName = "";
let selectedTime = "";
let busy = false;
let done = false; // booked — the card is now a receipt, not a picker

// ── Formatting ───────────────────────────────────────────────────────────────

const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
};
const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};
const shiftDate = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};
const todayYmd = () => {
  const dt = new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

// ── Rendering ────────────────────────────────────────────────────────────────

function setMsg(kind: "ok" | "err" | null, text = "") {
  el.msg.className = kind ? `msg ${kind}` : "msg hidden";
  el.msg.textContent = text;
}

function render() {
  if (!current || done) return;
  const who = practitionerName ? `Book with ${practitionerName}` : "Book an appointment";
  el.title.textContent = who;
  el.sub.textContent = current.error
    ? ""
    : `${current.service} · ${current.minutes} min${current.telehealth ? " · telehealth" : ""}`;

  if (current.error) {
    setMsg("err", current.error);
    el.picker.classList.add("hidden");
    return;
  }
  el.picker.classList.remove("hidden");
  el.date.textContent = fmtDate(current.date);
  el.prev.disabled = busy || current.date <= todayYmd();
  el.next.disabled = busy;

  el.slots.replaceChildren(
    ...current.open_times.map((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "slot" + (t === selectedTime ? " sel" : "");
      b.textContent = fmtTime(t);
      b.disabled = busy;
      b.addEventListener("click", () => {
        selectedTime = t;
        render();
        el.first.focus();
      });
      return b;
    }),
  );
  el.empty.classList.toggle("hidden", current.open_times.length > 0);
  el.form.classList.toggle("hidden", !selectedTime);
  el.book.textContent = selectedTime ? `Book ${fmtDate(current.date)} · ${fmtTime(selectedTime)}` : "Book";
  el.book.disabled = busy;
  el.page.classList.toggle("hidden", !current.book_url);
}

function showBooked(b: Booked) {
  done = true;
  el.picker.classList.add("hidden");
  el.title.textContent = "You're booked";
  el.sub.textContent = practitionerName && current ? `${current.service} with ${practitionerName}` : "";
  const when = b.when ? `${fmtDate(b.when.slice(0, 10))} at ${fmtTime(b.when.slice(11, 16))}` : "";
  setMsg("ok", `${when ? when + ". " : ""}${b.confirmation ?? "A confirmation email is on its way."}`);
  el.fine.textContent = "";
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

const app = new App({ name: "Leuk booking", version: "1.0.0" });

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

// The host streams the tool's arguments before the result — enough to show a
// meaningful skeleton instead of a spinner.
app.ontoolinput = (p) => {
  const a = (p.arguments ?? {}) as Record<string, string>;
  practitionerId = a.practitioner_id ?? practitionerId;
  serviceId = a.service_id ?? serviceId;
  if (a.date) el.date.textContent = fmtDate(a.date);
  el.title.textContent = "Loading open times…";
};

app.ontoolresult = (result) => {
  const data = parse<Availability>(result);
  if (!data) {
    setMsg("err", "Could not read availability. Ask again in the chat.");
    return;
  }
  current = data;
  practitionerId = data.practitioner_id ?? practitionerId;
  serviceId = data.service_id ?? serviceId;
  practitionerName = data.practitioner_name ?? practitionerName;
  selectedTime = "";
  setMsg(null);
  render();
};

async function loadDate(date: string) {
  if (!practitionerId || !serviceId) return;
  busy = true;
  render();
  try {
    const r = await app.callServerTool({
      name: "get_availability",
      arguments: { practitioner_id: practitionerId, service_id: serviceId, date },
    });
    const data = parse<Availability>(r);
    if (data) {
      current = data;
      selectedTime = "";
      setMsg(null);
    } else {
      setMsg("err", "Could not load that day.");
    }
  } catch {
    setMsg("err", "Could not load that day.");
  } finally {
    busy = false;
    render();
  }
}

el.prev.addEventListener("click", () => current && void loadDate(shiftDate(current.date, -1)));
el.next.addEventListener("click", () => current && void loadDate(shiftDate(current.date, 1)));
el.page.addEventListener("click", () => {
  const url = current?.book_url;
  if (!url) return;
  const withTime = selectedTime ? `${url}${url.includes("?") ? "&" : "?"}time=${selectedTime}` : url;
  void app.openLink({ url: withTime });
});

// A plain button, not a <form> submit: sandboxed frames block form submission
// unless the host grants allow-forms, and we cannot assume it does.
el.book.addEventListener("click", async () => {
  if (!current || !selectedTime || busy) return;
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
  busy = true;
  setMsg(null);
  render();
  const args = {
    practitioner_id: practitionerId,
    service_id: serviceId,
    date: current.date,
    time: selectedTime,
    first_name: first,
    last_name: last,
    email,
    phone: el.phone.value.trim() || undefined,
  };
  try {
    const r = await app.callServerTool({ name: "book_appointment", arguments: args });
    const b = parse<Booked>(r);
    if (b?.booked) {
      showBooked(b);
      // The model does not see calls the widget makes; tell it what happened so
      // the conversation can continue coherently ("anything else?").
      await app.updateModelContext({
        content: [
          {
            type: "text",
            text: `The person booked ${current.service} with ${practitionerName || "the practitioner"} on ${current.date} at ${selectedTime} through the booking card, as ${args.first_name} ${args.last_name}. A confirmation email was sent. Do not book it again.`,
          },
        ],
      });
    } else {
      setMsg("err", b?.error ?? "The booking could not be completed.");
      if (b?.retry) await loadDate(current.date);
    }
  } catch {
    setMsg("err", "The booking could not be completed. Try again, or use the booking page.");
  } finally {
    busy = false;
    render();
  }
});

app.connect().then(applyTheme).catch(() => setMsg("err", "Could not connect to the chat host."));
