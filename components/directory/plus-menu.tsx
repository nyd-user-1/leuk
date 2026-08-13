"use client";

import { useEffect, useRef, useState } from "react";
import { RATE_TABLE_PAYERS } from "@/lib/rate-table";

// PlusMenu — ported from ~/Code/insurance src/components/PlusMenu.tsx (the +
// button in ChatInput's bottom-left: category menu → drill-down drawer with
// search, back arrow, and breadcrumb). The insurance drill-downs (vehicle →
// coverage → driver) are replaced with directory ones: sample questions,
// rates-by-insurer (insurer → service), and find-providers (role → borough).
// Same CSS var names as the source; ChatInput's root maps them to Leuk
// tokens, and this renders inside it.

const SERVICES = [
  { code: "90791", label: "Intake / diagnostic eval" },
  { code: "90834", label: "45-minute therapy" },
  { code: "90837", label: "60-minute therapy" },
  { code: "90853", label: "Group therapy" },
  { code: "99214", label: "Medication management" },
];

const ROLES = [
  { value: "psychiatrists", label: "Can prescribe" },
  { value: "therapists", label: "Talk therapy" },
  { value: "psychologists", label: "Testing & therapy" },
  { value: "psychiatric nurse practitioners", label: "Can prescribe" },
];

const PLACES = [
  { value: "Brooklyn", label: "Kings County" },
  { value: "Manhattan", label: "New York County" },
  { value: "Queens", label: "Queens County" },
  { value: "the Bronx", label: "Bronx County" },
  { value: "Staten Island", label: "Richmond County" },
  { value: "Westchester", label: "Westchester County" },
  { value: "Long Island", label: "Nassau/Suffolk" },
];

const SAMPLE_PROMPTS = [
  { title: "Cigna 60-minute rate", description: "What Cigna publishes for a 90837", prompt: "What does Cigna pay for a 60-minute therapy session?" },
  { title: "Brooklyn psychiatrists", description: "Accepting new patients now", prompt: "Find psychiatrists in Brooklyn accepting new patients" },
  { title: "Oxford vs Empire", description: "Medication-management rates compared", prompt: "Compare Oxford and Empire rates for medication management" },
  { title: "Top-paid groups", description: "Highest published intake rates", prompt: "Which group practices get paid the most for intakes?" },
  { title: "Best-paying insurer", description: "For a 45-minute session", prompt: "Which insurer publishes the highest median rate for a 45-minute therapy session?" },
  { title: "A provider's rates", description: "Look someone up by name", prompt: "Look up the published rates for " },
];

const ICON = {
  plus: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>,
  chevronRight: <svg className="h-4 w-4 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>,
  back: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>,
  x: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>,
  bulb: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></svg>,
  building: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M12 6h.01" /><path d="M12 10h.01" /><path d="M12 14h.01" /><path d="M16 10h.01" /><path d="M16 14h.01" /><path d="M8 10h.01" /><path d="M8 14h.01" /></svg>,
  users: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
};

type Step = "categories" | "prompts" | "pick-insurer" | "pick-service" | "pick-role" | "pick-place";

const CATEGORIES: Array<{ key: Step; label: string; icon: React.ReactNode }> = [
  { key: "prompts", label: "Sample questions", icon: ICON.bulb },
  { key: "pick-insurer", label: "Rates by insurer", icon: ICON.building },
  { key: "pick-role", label: "Find providers", icon: ICON.users },
];

const STEP_LABELS: Record<Step, string> = {
  categories: "",
  prompts: "Sample questions",
  "pick-insurer": "Select insurer",
  "pick-service": "Select service",
  "pick-role": "Provider type",
  "pick-place": "Where",
};

export function PlusMenu({ onSelect }: { onSelect: (text: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(true);
  const [step, setStep] = useState<Step>("categories");
  const [drawerSearch, setDrawerSearch] = useState("");
  const [insurer, setInsurer] = useState("");
  const [role, setRole] = useState("");

  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  const closeMenu = () => {
    setMenuOpen(false);
    setStep("categories");
    setDrawerSearch("");
    setInsurer("");
    setRole("");
  };

  const finish = (text: string) => {
    onSelect(text);
    closeMenu();
  };

  const goBack = () => {
    setDrawerSearch("");
    if (step === "pick-service") setStep("pick-insurer");
    else if (step === "pick-place") setStep("pick-role");
    else setStep("categories");
  };

  const search = drawerSearch.toLowerCase();
  const items: Array<{ value: string; subtitle: string }> =
    step === "pick-insurer"
      ? RATE_TABLE_PAYERS.map((p) => ({ value: p, subtitle: "" }))
      : step === "pick-service"
        ? SERVICES.map((s) => ({ value: s.label, subtitle: `CPT ${s.code}` }))
        : step === "pick-role"
          ? ROLES.map((r) => ({ value: r.value, subtitle: r.label }))
          : step === "pick-place"
            ? PLACES.map((p) => ({ value: p.value, subtitle: p.label }))
            : [];
  const filteredItems = search
    ? items.filter((i) => i.value.toLowerCase().includes(search) || i.subtitle.toLowerCase().includes(search))
    : items;
  const filteredPrompts = SAMPLE_PROMPTS.filter(
    (p) => !search || p.title.toLowerCase().includes(search) || p.description.toLowerCase().includes(search),
  );

  const handleItemClick = (value: string) => {
    setDrawerSearch("");
    if (step === "pick-insurer") {
      setInsurer(value);
      setStep("pick-service");
    } else if (step === "pick-service") {
      finish(`What does ${insurer} pay for a ${value.toLowerCase()} session?`);
    } else if (step === "pick-role") {
      setRole(value);
      setStep("pick-place");
    } else if (step === "pick-place") {
      finish(`Find ${role} in ${value} accepting new patients`);
    }
  };

  const breadcrumb = [insurer, role].filter(Boolean).join(" · ");
  const isDrawerStep = step !== "categories";

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={btnRef}
        type="button"
        aria-label="Prompt ideas"
        onClick={() => {
          if (menuOpen) closeMenu();
          else {
            if (btnRef.current) setOpenAbove(btnRef.current.getBoundingClientRect().top > 300);
            setMenuOpen(true);
          }
        }}
        className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors text-[var(--muted)] hover:bg-[rgba(0,0,0,0.05)] hover:text-[var(--txt)]"
      >
        {ICON.plus}
      </button>

      {/* ---- Category menu ---- */}
      {menuOpen && step === "categories" && (
        <div
          className={`absolute left-0 w-56 max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden z-50 ${
            openAbove ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="py-1">
            {CATEGORIES.map((cat, i) => (
              <button
                key={cat.key}
                onClick={() => {
                  setDrawerSearch("");
                  setStep(cat.key);
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-[var(--inp-bg)] transition-colors ${
                  i > 0 ? "border-t border-[var(--border)]" : ""
                }`}
              >
                <span className="text-[var(--muted)]">{cat.icon}</span>
                <span className="text-[var(--txt)]">{cat.label}</span>
                {ICON.chevronRight}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- Drawer ---- */}
      {menuOpen && isDrawerStep && (
        <div
          className={`absolute left-0 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden z-50 ${
            openAbove ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)]">
            <button onClick={goBack} className="text-[var(--muted)] hover:text-[var(--txt)] shrink-0" aria-label="Back">
              {ICON.back}
            </button>
            <input
              type="text"
              value={drawerSearch}
              onChange={(e) => setDrawerSearch(e.target.value)}
              placeholder={`Search ${STEP_LABELS[step].toLowerCase()}...`}
              className="flex-1 bg-transparent text-sm text-[var(--txt)] outline-none placeholder:text-[var(--muted2)]"
            />
            {drawerSearch && (
              <button onClick={() => setDrawerSearch("")} className="text-[var(--muted)] hover:text-[var(--txt)] shrink-0" aria-label="Clear">
                {ICON.x}
              </button>
            )}
          </div>

          {breadcrumb && (
            <div className="px-4 py-1.5 text-[10px] font-medium text-primary bg-primary-wash border-b border-[var(--border)]">
              {breadcrumb}
            </div>
          )}

          <div className="max-h-[320px] overflow-y-auto">
            {step === "prompts" ? (
              <>
                {filteredPrompts.map((p, i) => (
                  <button
                    key={p.title}
                    onClick={() => finish(p.prompt)}
                    className={`flex w-full flex-col items-start px-4 py-3 hover:bg-[var(--inp-bg)] transition-colors ${
                      i > 0 ? "border-t border-[var(--border)]" : ""
                    }`}
                  >
                    <span className="text-sm font-semibold text-[var(--txt)]">{p.title}</span>
                    <span className="text-xs text-[var(--muted)] line-clamp-2 text-left">{p.description}</span>
                  </button>
                ))}
                {filteredPrompts.length === 0 && <p className="px-4 py-3 text-xs text-[var(--muted)]">No matches</p>}
              </>
            ) : (
              <>
                {filteredItems.map((item, i) => (
                  <button
                    key={`${item.value}-${i}`}
                    onClick={() => handleItemClick(item.value)}
                    className={`flex w-full items-center gap-3 px-4 py-3 hover:bg-[var(--inp-bg)] transition-colors ${
                      i > 0 ? "border-t border-[var(--border)]" : ""
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-semibold text-[var(--txt)] capitalize">{item.value}</span>
                      {item.subtitle && <span className="text-xs text-[var(--muted)]">{item.subtitle}</span>}
                    </div>
                  </button>
                ))}
                {filteredItems.length === 0 && <p className="px-4 py-3 text-xs text-[var(--muted)]">No matches</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
