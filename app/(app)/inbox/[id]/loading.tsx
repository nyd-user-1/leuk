import { Logo } from "@/components/ui/logo";

// Suspense boundary for the THREAD PANE only. The list, the tabs and the shell
// are already on screen and stay there — switching threads should swap one
// pane, not blank the surface (see ContentSurface's section-scoped reveal key).
export default function Loading() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <Logo size="lg" className="logo-pulse" />
    </div>
  );
}
