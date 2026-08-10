import { Logo } from "@/components/ui/logo";

// Shown by app/(app)/loading.tsx and app/portal/loading.tsx — Next's Suspense
// boundary for a route segment whose server component hasn't resolved yet.
// Centered in the same content region ContentSurface renders pages into, so
// the shell (sidebar, header) never disappears — only the page body pulses
// in its place, and RevealFx takes over the instant real content lands.
export function RouteLoading() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <Logo size="lg" className="logo-pulse" />
    </div>
  );
}
