import { listPayers } from "@/lib/repos/policies";
import { listBookablePractitioners, listServices } from "@/lib/repos/services";
import { BookClient } from "./book-client";

// Pre-rename blob object name on purpose — the pathname is a storage key, and
// the object was never re-uploaded under `leuk-`. See the note in
// app/(app)/design-system/page.tsx.
const LOGO = "https://c1vijjkvyt1skkfe.public.blob.vercel-storage.com/logos/brand/liminal-dark.png";

// Public booking page (no auth). Slug = a practitioner id (their personal
// booking link) or anything else ("leuk") → the demo practice, where the
// client picks a practitioner.

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ service?: string; date?: string; time?: string; payer?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const [services, practitioners, payers] = await Promise.all([listServices(), listBookablePractitioners(), listPayers()]);
  const locked = practitioners.find((p) => p.id === slug || p.slug === slug) ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-page">
      {/* Minimal warm header — matches the home paper ground, focused-flow chrome. */}
      <header className="border-b border-page-edge">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-5">
          <img src={LOGO} alt="Leuk" className="h-8 w-auto" />
          <div className="ml-auto text-right">
            <p className="text-[15px] font-semibold text-text">Leuk Psychiatry</p>
            <p className="text-[13px] text-text-muted">
              {locked ? `Book with ${locked.name}` : "Online booking"}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <BookClient
          services={services.filter((s) => s.active)}
          practitioners={practitioners}
          payers={payers}
          lockedPractitionerId={locked?.id ?? null}
          prefill={{ serviceId: sp.service, date: sp.date, time: sp.time, payerId: sp.payer }}
        />
      </main>

      <footer className="px-6 pb-10 text-center text-[13px] text-text-muted">
        Powered by Leuk · 31 E 17th St, Suite 402, New York, NY
      </footer>
    </div>
  );
}
