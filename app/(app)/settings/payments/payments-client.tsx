"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ConnectAccountManagement,
  ConnectAccountOnboarding,
  ConnectBalances,
  ConnectNotificationBanner,
  ConnectPayouts,
} from "@stripe/react-connect-js";
import { TopBarActions } from "@/components/shell/topbar-slot";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Card, SettingsCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/spinner";
import { Tag } from "@/components/ui/tag";
import { useToast } from "@/components/ui/toast";
import { formatCents } from "@/lib/format";
import { ConnectEmbed } from "./connect-embed";
import {
  connectStage,
  createConnectAccount,
  fetchAccountLinkUrl,
  fetchConnectStatus,
  fetchLoginLinkUrl,
  type ConnectAccountStatus,
} from "./connect-api";

// Settings › Finance — the practitioner's payouts surface. One card, four
// states: no account → create · created → embedded onboarding · submitted but
// unverified → what's outstanding · charges enabled → balance/payouts/account.
// The title lives in the TopBar (canonical layout rule); nothing here renders
// an H1.

/** Stripe hands back raw requirement keys; these are the ones worth naming. */
const REQUIREMENT_LABELS: Record<string, string> = {
  "id_number": "ID number",
  "ssn_last_4": "Last 4 of SSN",
  "dob": "Date of birth",
  "verification_document": "Photo ID",
  "external_account": "Bank account",
  "tos_acceptance_date": "Terms acceptance",
};

function requirementLabel(key: string): string {
  const tail = key.split(".").slice(1).join(" ") || key;
  const leaf = key.split(".").pop() ?? key;
  const known = REQUIREMENT_LABELS[leaf];
  if (known) return known;
  const words = tail.replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

type View = "balance" | "payouts" | "account";

export function PaymentsSettings({
  publishableKey,
  lifetimeNetCents,
  sessionCount,
}: {
  publishableKey: string;
  lifetimeNetCents: number;
  sessionCount: number;
}) {
  const toast = useToast();
  const [account, setAccount] = useState<ConnectAccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("balance");
  // Stripe renders the notification banner as an iframe even with nothing to
  // say, which leaves a dead gap in the card. Keep it mounted (it's the source
  // of the count) but collapsed until it has something.
  const [notices, setNotices] = useState(0);

  const refresh = useCallback(async () => {
    // Without a publishable key nothing downstream can render, so don't bother
    // the API for a status we can't act on.
    if (!publishableKey) {
      setLoading(false);
      return;
    }
    setError("");
    try {
      setAccount(await fetchConnectStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your payment status.");
    } finally {
      setLoading(false);
    }
  }, [publishableKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startSetup = async () => {
    setBusy(true);
    try {
      setAccount(await createConnectAccount());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start setup.");
    } finally {
      setBusy(false);
    }
  };

  // Hosted-onboarding fallback and the Express Dashboard both hand back a
  // single-use URL. Open it rather than emailing or storing it.
  const openLink = async (get: () => Promise<string>, label: string) => {
    setBusy(true);
    try {
      window.location.href = await get();
    } catch (e) {
      toast(e instanceof Error ? e.message : `Could not open ${label}.`, "danger");
      setBusy(false);
    }
  };

  const stage = connectStage(account);

  if (!publishableKey) {
    return (
      <Banner variant="warning">
        Payments aren&rsquo;t configured on this environment — no Stripe publishable key is set.
      </Banner>
    );
  }

  if (loading) {
    return (
      <Card className="flex items-center gap-2.5 text-[15px] text-text-muted">
        <Spinner size={18} /> Checking your payment setup…
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <TopBarActions>
        <Button size="sm" variant="secondary" leftIcon="refresh-cw" onClick={() => void refresh()}>
          Refresh
        </Button>
      </TopBarActions>

      {error && (
        <Banner
          variant="danger"
          action={
            <Button size="sm" variant="secondary" onClick={() => void refresh()}>
              Try again
            </Button>
          }
        >
          {error}
        </Banner>
      )}

      {stage === "none" && (
        <SettingsCard icon="credit-card" title="Finance">
          <EmptyState
            className="py-8"
            icon="dollar"
            title="Set up payments"
            subtext="Clients pay Leuk for their sessions and Leuk pays you, minus a platform fee. Stripe collects your identity and bank details — it takes about five minutes."
            actions={
              <Button loading={busy} onClick={() => void startSetup()}>
                Set up payments
              </Button>
            }
          />
        </SettingsCard>
      )}

      {stage !== "none" && account && (
        <ConnectEmbed publishableKey={publishableKey}>
          {stage === "onboarding" && (
            <SettingsCard
              icon="credit-card"
              title="Finish setting up payments"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy}
                  onClick={() => void openLink(fetchAccountLinkUrl, "the setup page")}
                >
                  Open on Stripe instead
                </Button>
              }
            >
              <ConnectAccountOnboarding
                onExit={() => void refresh()}
                onLoadError={() => setError("The setup form could not load. Try refreshing.")}
              />
            </SettingsCard>
          )}

          {stage === "pending" && (
            <SettingsCard icon="clock" title="Verification in progress">
              <p className="text-[15px] text-text-body">
                Stripe is reviewing your details. You can&rsquo;t take client payments until this clears.
              </p>
              <div className="mt-4">
                <ConnectNotificationBanner
                  onLoadError={() => undefined}
                  collectionOptions={{ fields: "eventually_due", futureRequirements: "include" }}
                />
              </div>
              {account.requirementsDue.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium text-text-muted">Still needed</p>
                  <div className="flex flex-wrap gap-2">
                    {account.requirementsDue.map((r) => (
                      <Tag key={r} hue="orange">
                        {requirementLabel(r)}
                      </Tag>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-5">
                <ConnectAccountManagement
                  onLoadError={() => undefined}
                  collectionOptions={{ fields: "eventually_due", futureRequirements: "include" }}
                />
              </div>
            </SettingsCard>
          )}

          {stage === "active" && (
            <>
              <SettingsCard
                icon="credit-card"
                title="Finance"
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy}
                    onClick={() => void openLink(fetchLoginLinkUrl, "the Stripe dashboard")}
                  >
                    Stripe dashboard
                  </Button>
                }
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="success">
                    <Icon name="circle-check" size={13} /> Accepting payments
                  </Badge>
                  {account.payoutsEnabled ? (
                    <Badge variant="success">Payouts on</Badge>
                  ) : (
                    <Badge variant="warning">Payouts paused</Badge>
                  )}
                  <span className="text-sm text-text-muted">{account.stripeAccountId}</span>
                </div>
                {sessionCount > 0 && (
                  <div className="mt-4 flex items-baseline gap-2 border-t border-border pt-4">
                    <span className="text-[28px] font-bold leading-none tabular-nums text-text">
                      {formatCents(lifetimeNetCents)}
                    </span>
                    <span className="text-sm text-text-muted">
                      lifetime revenue, net of fees · {sessionCount.toLocaleString("en-US")} paid {sessionCount === 1 ? "session" : "sessions"}
                    </span>
                  </div>
                )}
                <div className={notices > 0 ? "mt-4" : "hidden"}>
                  <ConnectNotificationBanner
                    onLoadError={() => undefined}
                    onNotificationsChange={({ total }) => setNotices(total)}
                  />
                </div>
              </SettingsCard>

              <Card className="p-5">
                <SegmentedControl
                  segments={[
                    { value: "balance", label: "Balance", icon: "dollar" },
                    { value: "payouts", label: "Payouts", icon: "arrow-right" },
                    { value: "account", label: "Account", icon: "gear" },
                  ]}
                  value={view}
                  onChange={(v) => setView(v as View)}
                  className="mb-5"
                />
                {view === "balance" && (
                  <ConnectBalances onLoadError={() => setError("Balance could not load.")} />
                )}
                {view === "payouts" && (
                  <ConnectPayouts onLoadError={() => setError("Payouts could not load.")} />
                )}
                {view === "account" && (
                  <ConnectAccountManagement onLoadError={() => setError("Account details could not load.")} />
                )}
              </Card>
            </>
          )}
        </ConnectEmbed>
      )}
    </div>
  );
}
