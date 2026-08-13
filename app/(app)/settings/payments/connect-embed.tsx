"use client";

import { useEffect, useState, type ReactNode } from "react";
import { loadConnectAndInitialize, type StripeConnectInstance } from "@stripe/connect-js";
import { ConnectComponentsProvider } from "@stripe/react-connect-js";
import { Banner } from "@/components/ui/banner";
import { Spinner } from "@/components/ui/spinner";
import { fetchAccountSessionSecret } from "./connect-api";

// Boots the Stripe Connect embedded-components runtime and themes it to the
// Leuk kit, so the Stripe-rendered iframes read as part of the app rather
// than a bolted-on widget. Values are the light-mode tokens from
// app/globals.css — the authenticated app never renders dark (AppShell strips
// the `dark` class), so a static map is correct here.
const APPEARANCE = {
  variables: {
    fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
    fontSizeBase: "15px",
    borderRadius: "12px", // --radius-card
    buttonBorderRadius: "8px", // --radius-field
    formBorderRadius: "8px",
    colorPrimary: "#3f8290", // teal-600
    colorBackground: "#ffffff", // --color-surface
    colorText: "#212a47", // navy ink
    colorSecondaryText: "#4b5563",
    colorBorder: "#e6e7eb",
    colorDanger: "#dc2626",
    buttonPrimaryColorBackground: "#3f8290",
    buttonPrimaryColorBorder: "#3f8290",
    buttonPrimaryColorText: "#ffffff",
    badgeSuccessColorBackground: "#dcfce7",
    badgeSuccessColorText: "#16a34a",
    badgeWarningColorBackground: "#fbe8c9",
    badgeWarningColorText: "#b7791f",
    badgeDangerColorBackground: "#fee2e2",
    badgeDangerColorText: "#dc2626",
    offsetBackgroundColor: "#f2f3f6", // --color-canvas
  },
};

/**
 * Wraps children in a `ConnectComponentsProvider`. The instance is created once
 * in an effect (not during render) because this component is still server-
 * rendered on the first pass and `loadConnectAndInitialize` injects a script
 * tag — it must only ever run in the browser.
 *
 * `fetchClientSecret` is handed to Stripe as a callback rather than a value:
 * Stripe re-invokes it whenever the AccountSession expires, so the surface
 * keeps working through a long onboarding sit-down without a reload.
 */
export function ConnectEmbed({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
  const [instance, setInstance] = useState<StripeConnectInstance | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    try {
      const connect = loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret: fetchAccountSessionSecret,
        appearance: APPEARANCE,
      });
      if (!cancelled) setInstance(connect);
    } catch (e) {
      if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the Stripe components.");
    }
    return () => {
      cancelled = true;
    };
  }, [publishableKey]);

  if (error) return <Banner variant="danger">{error}</Banner>;
  if (!instance) {
    return (
      <div className="flex items-center gap-2.5 py-8 text-[15px] text-text-muted">
        <Spinner size={18} /> Loading secure payment forms…
      </div>
    );
  }
  return <ConnectComponentsProvider connectInstance={instance}>{children}</ConnectComponentsProvider>;
}
