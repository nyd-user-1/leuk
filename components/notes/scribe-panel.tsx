"use client";

import { useEffect, useRef, useState } from "react";
import { mmss, TranscriptPanel, TrendList, type TrendItem } from "@/components/notes/ai-bits";
import { NoteSheet } from "@/components/notes/note-sheet";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ChoiceChip } from "@/components/ui/choice-chip";
import { Divider } from "@/components/ui/divider";
import { FieldLabel } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { CallAppointmentSummary } from "@/components/call/call-stage";
import { formatDate, formatDateLong, formatTime } from "@/lib/format";
import type { AppointmentStatus, TranscriptSegment } from "@/lib/types";

// AI Scribe (catalog §3b) — the docked right panel on the practitioner call
// stage (Carepatron pattern). Header: recording dot + title + session timer,
// gear (settings drill-down) and collapse. Tabs: Scribe (setup → recording
// waveform → generated note) · Transcript (live poll of the transcribe stub)
// · Add notes (extra context woven into the generated note) · Patient
// context (appointment details + last-appointment trends).

type Phase = "setup" | "recording" | "generating" | "done";

const NOTE_TYPES = [
  { value: "soap", label: "SOAP" },
  { value: "dap", label: "DAP" },
  { value: "progress", label: "Progress" },
] as const;
type NoteType = (typeof NOTE_TYPES)[number]["value"];
const PERSPECTIVES = ["Third person", "First person"] as const;
const DETAIL = ["Concise", "Standard", "Detailed"] as const;

const POLL_EVERY_S = 3; // live-transcript poll cadence (stub replays a script)

// ── scribe settings (persisted defaults) ─────────────────────────────────────

export interface ScribeSettings {
  template: NoteType;
  language: string;
  clientTerm: string;
  practitionerTerm: string;
  alwaysOn: boolean; // auto-start scribe when joining an appointment call
}

export const SCRIBE_SETTINGS_KEY = "leuk.scribeSettings";

export const DEFAULT_SCRIBE_SETTINGS: ScribeSettings = {
  template: "soap",
  language: "en-US",
  clientTerm: "Client",
  practitionerTerm: "Practitioner",
  alwaysOn: true,
};

export function loadScribeSettings(): ScribeSettings {
  try {
    const raw = localStorage.getItem(SCRIBE_SETTINGS_KEY);
    return raw ? { ...DEFAULT_SCRIBE_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SCRIBE_SETTINGS;
  } catch {
    return DEFAULT_SCRIBE_SETTINGS;
  }
}

// ── canned prior-appointment insights (same stub family as the note-sheet
//    AIPanel session summary — swap for real data with the ASR/LLM keys) ─────

const LAST_APPT_TRENDS: TrendItem[] = [
  { trend: "up", text: "Baseline anxiety reduced after 2 weeks on sertraline 50 mg" },
  { trend: "done", text: "Early GI upset resolved; sleep normalized at ~7 hours" },
  { trend: "down", text: "Anticipatory spikes persist before work meetings" },
  { trend: "flat", text: "Afternoon flatness — monitoring, no dose change yet" },
];

const statusVariant: Record<AppointmentStatus, "info" | "success" | "neutral" | "danger" | "warning"> = {
  scheduled: "info",
  confirmed: "success",
  arrived: "info",
  completed: "neutral",
  cancelled: "danger",
  no_show: "warning",
};

// ── small local bits ─────────────────────────────────────────────────────────

function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[] | ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return <ChoiceChip key={v} label={l} selected={value === v} onSelect={() => onChange(v)} />;
        })}
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm font-medium text-text-muted">{label}</span>
      <span className="text-[15px] text-text">{children}</span>
    </div>
  );
}

/** Animated navy audio bars shown while the scribe is recording. */
function Waveform() {
  const heights = [14, 24, 32, 20, 28, 16, 26, 12];
  return (
    <div className="flex h-9 items-center justify-center gap-1.5" aria-hidden>
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-1.5 rounded-full bg-navy-700"
          style={{ height: h, animation: `scribe-wave 1.1s ease-in-out ${i * 0.13}s infinite` }}
        />
      ))}
      <style>{`@keyframes scribe-wave{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}`}</style>
    </div>
  );
}

/** "→|" collapse-to-edge icon — not in the foundation set, local inline SVG. */
function CollapseToEdgeSvg() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12h12" />
      <path d="M11 6l6 6-6 6" />
      <path d="M21 4v16" />
    </svg>
  );
}

const TAB_ITEMS = [
  { key: "scribe", label: "Scribe" },
  { key: "transcript", label: "Transcript" },
  { key: "notes", label: "Add notes" },
  { key: "context", label: "Patient context" },
];

// ── panel ────────────────────────────────────────────────────────────────────

export function ScribePanel({
  appointmentId,
  appointment = null,
  autoStart = false,
  onCollapse,
  onRecordingChange,
}: {
  appointmentId: string;
  appointment?: CallAppointmentSummary | null;
  /** Start recording immediately (lobby "AI Scribe" toggle was on). */
  autoStart?: boolean;
  onCollapse?: () => void;
  /** Reports the actual transcribing state up (drives the Recording badge). */
  onRecordingChange?: (recording: boolean) => void;
}) {
  const toast = useToast();
  const [view, setView] = useState<"tabs" | "settings">("tabs");
  const [tab, setTab] = useState("scribe");
  const [phase, setPhase] = useState<Phase>("setup");
  const [settings, setSettings] = useState<ScribeSettings>(DEFAULT_SCRIBE_SETTINGS);
  const [draft, setDraft] = useState<ScribeSettings>(DEFAULT_SCRIBE_SETTINGS);
  const [noteType, setNoteType] = useState<NoteType>("soap");
  const [perspective, setPerspective] = useState<(typeof PERSPECTIVES)[number]>("Third person");
  const [detail, setDetail] = useState<(typeof DETAIL)[number]>("Standard");
  const [extraNotes, setExtraNotes] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [scriptDone, setScriptDone] = useState(false);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);

  // Poll bookkeeping lives in refs so the 1s ticker stays a single interval.
  const pollBusy = useRef(false);
  const pollDone = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoStarted = useRef(false);

  // Persisted defaults seed the setup chips (after mount — localStorage).
  useEffect(() => {
    const s = loadScribeSettings();
    setSettings(s);
    setNoteType(s.template);
  }, []);

  useEffect(() => {
    if (autoStart && !autoStarted.current) {
      autoStarted.current = true;
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const recording = phase === "recording";
  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);

  useEffect(() => {
    if (phase !== "recording") return;
    pollDone.current = false;
    const startedAt = Date.now();

    const poll = async (secs: number) => {
      if (pollBusy.current || pollDone.current) return;
      pollBusy.current = true;
      try {
        // STUB backend — wire ASR key in app/api/ai/transcribe (replays a script).
        const res = await fetch("/api/ai/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appointmentId, elapsed: secs }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Transcription failed");
        setSegments(json.segments);
        if (json.done) {
          pollDone.current = true;
          setScriptDone(true);
        }
      } catch {
        // transient poll failure — next tick retries
      } finally {
        pollBusy.current = false;
      }
    };

    poll(0);
    const timer = setInterval(() => {
      const secs = Math.round((Date.now() - startedAt) / 1000);
      setElapsed(secs);
      if (secs % POLL_EVERY_S === 0) void poll(secs);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, appointmentId]);

  // Keep the live transcript pinned to the newest utterance.
  useEffect(() => {
    if (tab !== "transcript") return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [segments, tab]);

  function start() {
    setSegments([]);
    setElapsed(0);
    setScriptDone(false);
    setPhase("recording");
  }

  async function endSession() {
    setPhase("generating");
    try {
      // STUB backend — wire LLM key in app/api/ai/generate-note.
      const res = await fetch("/api/ai/generate-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId,
          template: noteType,
          perspective: perspective.toLowerCase().replace(" ", "-"),
          verbosity: detail.toLowerCase(),
          extraNotes: extraNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Note generation failed");
      if (!json.note) throw new Error("Could not match this session to a client record.");
      setNoteId(json.note.id);
      setPhase("done");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Note generation failed", "danger");
      setPhase("recording");
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SCRIBE_SETTINGS_KEY, JSON.stringify(draft));
    } catch {}
    setSettings(draft);
    if (phase === "setup") setNoteType(draft.template);
    setView("tabs");
  }

  // ── settings drill-down (content swap, not an overlay) ─────────────────────
  if (view === "settings") {
    return (
      <div className="flex h-full flex-col bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <IconButton icon="arrow-left" label="Back to scribe" onClick={() => setView("tabs")} />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-text">Scribe settings</p>
            <p className="truncate text-[13px] text-text-muted">Defaults for how AI Scribe writes your notes.</p>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
          <Select
            label="Default template"
            options={NOTE_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            value={draft.template}
            onValueChange={(v) => setDraft({ ...draft, template: v as NoteType })}
          />
          <Select
            label="Default output language"
            options={[
              { value: "en-US", label: "English (United States)" },
              { value: "en-GB", label: "English (United Kingdom)" },
              { value: "es-US", label: "Spanish (United States)" },
            ]}
            value={draft.language}
            onValueChange={(v) => setDraft({ ...draft, language: v })}
          />
          <Select
            label="Refer to client as"
            options={[
              { value: "Client", label: "Client" },
              { value: "Patient", label: "Patient" },
            ]}
            value={draft.clientTerm}
            onValueChange={(v) => setDraft({ ...draft, clientTerm: v })}
          />
          <Select
            label="Refer to practitioner as"
            options={[
              { value: "Practitioner", label: "Practitioner" },
              { value: "Clinician", label: "Clinician" },
            ]}
            value={draft.practitionerTerm}
            onValueChange={(v) => setDraft({ ...draft, practitionerTerm: v })}
          />
          <div>
            <FieldLabel>AI Scribe is</FieldLabel>
            <Select
              options={[
                { value: "on", label: "always switched on for appointments" },
                { value: "off", label: "switched off until started manually" },
              ]}
              value={draft.alwaysOn ? "on" : "off"}
              onValueChange={(v) => setDraft({ ...draft, alwaysOn: v === "on" })}
            />
          </div>
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          <Button onClick={saveSettings}>Save</Button>
          <Button variant="secondary" onClick={() => setView("tabs")}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ── main panel: header + tabs ──────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {recording && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
          )}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-text">
            {recording ? "Transcribing call" : "AI Scribe"}
          </p>
          <p className="font-mono text-[12px] tabular-nums text-text-muted">{mmss(elapsed)}</p>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton
            icon="gear"
            label="Scribe settings"
            onClick={() => {
              setDraft(settings);
              setView("settings");
            }}
          />
          {onCollapse && (
            <button
              type="button"
              aria-label="Hide panel"
              title="Hide panel"
              onClick={onCollapse}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-field text-text-body transition-colors hover:bg-[#F3F4F6]"
            >
              <CollapseToEdgeSvg />
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto px-4 pt-2">
        <Tabs items={TAB_ITEMS} active={tab} onChange={setTab} className="!gap-4 whitespace-nowrap" />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "scribe" && (
          <div className="flex h-full flex-col gap-5">
            {phase === "setup" && (
              <>
                <p className="text-[15px] text-text-body">
                  AI Scribe listens to the session, builds a live transcript, and drafts a clinical
                  note when you end. Nothing is filed until you review and sign.
                </p>
                <ChipRow label="Note type" options={NOTE_TYPES} value={noteType} onChange={setNoteType} />
                <ChipRow label="Perspective" options={PERSPECTIVES} value={perspective} onChange={setPerspective} />
                <ChipRow label="Detail level" options={DETAIL} value={detail} onChange={setDetail} />
                <Button leftIcon="mic" fullWidth onClick={start} className="mt-1">
                  Start session
                </Button>
                <p className="text-[13px] text-text-muted">
                  Make sure the client has consented to AI-assisted note taking.
                </p>
              </>
            )}

            {phase === "recording" && (
              <>
                <div className="rounded-card bg-canvas px-4 py-8 text-center">
                  <Waveform />
                  <p className="mt-4 text-[15px] font-semibold text-danger">Scribe is recording</p>
                  <p className="mt-1 text-sm text-text-muted">
                    Your note is generated when you end the session
                  </p>
                </div>
                {scriptDone && (
                  <p className="text-[13px] text-text-muted">Session audio idle — ready to end.</p>
                )}
                <Button variant="danger-solid" leftIcon="stop" fullWidth onClick={endSession}>
                  End session
                </Button>
              </>
            )}

            {phase === "generating" && (
              <div className="flex flex-1 items-center justify-center gap-2.5 text-[15px] font-medium text-primary">
                <Spinner size={18} />
                Drafting {NOTE_TYPES.find((t) => t.value === noteType)?.label} note…
              </div>
            )}

            {phase === "done" && (
              <>
                <Banner
                  variant="success"
                  action={
                    <Button variant="secondary" size="sm" onClick={() => setViewing(true)}>
                      View note
                    </Button>
                  }
                >
                  Draft note created from this session.
                </Banner>
                <Button variant="ghost" leftIcon="mic" onClick={start}>
                  Start another session
                </Button>
              </>
            )}
          </div>
        )}

        {tab === "transcript" &&
          (segments.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-text-muted">Listening…</p>
          ) : (
            <TranscriptPanel segments={segments} />
          ))}

        {tab === "notes" && (
          <Textarea
            rows={10}
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            placeholder="Add custom notes — these will be included in the note generated from the transcript."
          />
        )}

        {tab === "context" && (
          <div className="flex flex-col">
            {appointment ? (
              <div className="flex flex-col gap-4">
                <DetailRow label="Time">
                  {formatDateLong(appointment.startsAt)}
                  <br />
                  {formatTime(appointment.startsAt)} – {formatTime(appointment.endsAt)}
                </DetailRow>
                <DetailRow label="Status">
                  <Badge variant={statusVariant[appointment.status]} className="capitalize">
                    {appointment.status.replace("_", " ")}
                  </Badge>
                </DetailRow>
                <DetailRow label="Client">{appointment.client}</DetailRow>
                <DetailRow label="Service">{appointment.service}</DetailRow>
                {appointment.notesBrief && <DetailRow label="Notes">{appointment.notesBrief}</DetailRow>}
              </div>
            ) : (
              <p className="text-[15px] text-text-body">
                No appointment is linked to this call — the room id doesn&apos;t match a scheduled
                appointment.
              </p>
            )}
            <Divider className="my-5" />
            <p className="mb-3 text-sm font-semibold text-text">
              Last appointment
              {appointment &&
                ` · ${formatDate(new Date(Date.parse(appointment.startsAt) - 14 * 86400_000))}`}
            </p>
            <TrendList items={LAST_APPT_TRENDS} />
          </div>
        )}
      </div>

      {viewing && noteId && <NoteSheet noteId={noteId} onClose={() => setViewing(false)} />}
    </div>
  );
}
