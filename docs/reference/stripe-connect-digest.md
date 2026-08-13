# Stripe Connect — Account Management docs digest

Research spike for the Leuk marketplace build (clients pay Leuk → Leuk pays
therapists as connected accounts → Leuk keeps an application fee). Read against
the founder-approved tonight build: **Accounts v1 with controller properties**
(`controller[stripe_dashboard][type]=express`, `controller[fees][payer]=application`,
`controller[losses][payments]=application`), **destination charges** first,
**application fee** as the platform cut, migrating later to separate charges &
transfers. Every claim carries its source URL. This is a decision brief, not a spec.

---

## 0. The controller-property variable that governs everything below

Tonight's three controller props map to the **Express-equivalent** bundle. The
fourth prop — `controller[requirement_collection]` — was not named in the build spec,
and it is the hinge for lenses 1–3.

- **Express-equivalent** (tonight): `stripe_dashboard.type=express` +
  `fees.payer=application` + `losses.payments=application` +
  `requirement_collection=stripe` (the default). **Stripe collects KYC**, hosts/embeds
  onboarding, and provides the therapist an Express Dashboard. Service agreement
  defaults to `full`. Source: https://docs.stripe.com/connect/account-capabilities.md ,
  https://docs.stripe.com/connect/service-agreement-types.md
- **Custom-equivalent**: `stripe_dashboard.type=none` + `requirement_collection=application`.
  **You** own KYC collection and can set `disable_stripe_user_authentication=true`,
  but you forfeit networked onboarding and the Express Dashboard.
  Source: https://docs.stripe.com/connect/service-agreement-types.md

**Load-bearing consequence:** with `requirement_collection=stripe` (tonight's default),
`disable_stripe_user_authentication` is **not available** and networked onboarding
**is** available. Confirm before build that `stripe_dashboard.type=express` +
`requirement_collection=application` is even a valid combination — the docs only
demonstrate express-with-stripe and none-with-application. **Verification gap.**
Source: https://docs.stripe.com/connect/supported-embedded-components/account-onboarding.md

---

## 1. Tonight's build — what changes, blocks, or adds a required step

**Charge shape.** The Accounts-v1 SaaS example builds with **direct** charges
(`Stripe-Account` header + `payment_intent_data[application_fee_amount]`). Our plan is
**destination** charges, which differ: the PaymentIntent is created on the *platform*
account with `transfer_data[destination]=acct_…` and `application_fee_amount=<cents>`;
the platform is merchant of record and its balance is debited for Stripe fees, refunds,
and chargebacks. That is consistent with `losses.payments=application`.
Source: https://docs.stripe.com/connect/end-to-end-saas-platform.md?platform=web ,
https://docs.stripe.com/connect/marketplace.md

**Onboarding is a required prerequisite to charging.** After account create you must
run the therapist through Stripe-hosted or embedded onboarding, then **poll
`charges_enabled` / `payouts_enabled` / `details_submitted`** before creating any
charge. `details_submitted=true` does **not** mean requirements are satisfied.
Source: https://docs.stripe.com/connect/end-to-end-saas-platform.md?platform=web ,
https://docs.stripe.com/connect/handling-api-verification.md

**Required verification for a US INDIVIDUAL therapist (v1 field names), card_payments + transfers:**

Collected **upfront**:
- `individual.first_name`, `individual.last_name`
- `individual.dob.day`, `individual.dob.month`, `individual.dob.year`
- `individual.address.line1`, `.city`, `.state`, `.postal_code`
- `individual.email`, `individual.phone`
- `individual.ssn_last_4`
- `business_profile.mcc`, `business_profile.url` (a product description substitutes if no URL)
- `external_account` (payout bank account)
- `tos_acceptance.date`, `tos_acceptance.ip`

Collected **later, on threshold / failed match**:
- `individual.id_number` (full SSN) — if `ssn_last_4` fails to verify, required before
  **1,500 USD** in charges or **30 days**, whichever first.
- `individual.verification.document.front` / `.back` (govt ID) — if identity still can't verify.
- Full validated address for **payouts** within **30 days** or payouts are disabled.

Source: https://docs.stripe.com/connect/required-verification-information.md?accounts-namespace=v1

**Test-mode note:** the v2 preview billing flow requires Sandboxes (not legacy test
mode); the v1 controller-properties flow runs in ordinary test mode.
Source: https://docs.stripe.com/connect/integrate-billing-connect.md

---

## 2. Individual vs org/TIN accounts (the model-shaping decision)

**Two business types, two verification weights.**
- `business_type=individual` — solo therapist. SSN-based, lightest KYC (see §1). Payout
  lands in the individual's bank account.
- `business_type=company` — group practice under a TIN/EIN. Requires `company.name`,
  `company.tax_id` (EIN), `company.address`, a **representative** `Person`
  (`relationship.representative` + owner/executive, with `ssn_last_4`), owners/directors
  provided flags, and `company.verification.document` (IRS **147C** or **SS-4**) if the
  EIN can't be verified. EIN required within **30 days** or before **1,500 USD** in charges.
  Source: https://docs.stripe.com/connect/required-verification-information.md?accounts-namespace=v1 ,
  https://docs.stripe.com/connect/handling-api-verification.md

**Service agreement.** Express-equivalent defaults to **`full`**
(`tos_acceptance[service_agreement]=full`): the account has a direct Stripe
relationship, can request `card_payments`, and gets the Express Dashboard + Stripe
support. The **`recipient`** agreement *cannot* process card payments and gets no direct
Stripe support — wrong for our therapists. Agreement type is **immutable** once accepted;
changing it means a new account. Source: https://docs.stripe.com/connect/service-agreement-types.md

**Networked onboarding — the answer to "can a group practice share KYC?":**
Networked onboarding lets one owner **reuse a verified legal entity across multiple
accounts they create**; `business_type`, `country`, `company`, and `individual` stay
**synchronized** across accounts sharing that legal entity, while `external_accounts`,
`business_profile`, and branding are **copied once**. It is keyed on **shared legal
entity**, i.e. the same underlying business/person — **not** a mechanism for many
different clinicians to inherit a practice's KYC.
Source: https://docs.stripe.com/connect/networked-onboarding.md

It only works when **`requirement_collection=stripe`** AND onboarding is **Stripe-hosted
or user-authenticated embedded**. It is **disqualified** by API-based onboarding, by
`disable_stripe_user_authentication=true`, and by **pre-filling** any `individual.*`,
`company.address`, owners/directors flags, Persons, or `external_accounts` via the API.
Source: https://docs.stripe.com/connect/networked-onboarding.md

**Recommendation given our TIN-billing model:** model a **group practice as ONE
`company` connected account under its TIN**, with clinicians as `Person` records on it
(payout to the practice bank account — matches how practices bill). Model a **solo
therapist as an `individual` account**. Do **not** reach for networked onboarding to
"share" a practice TIN across many clinician accounts — that's not what it does; it only
helps a single owner who legitimately spins up multiple same-legal-entity accounts, and
only if you let Stripe collect and don't pre-fill.

---

## 3. Embedded + Managed Risk fork

**Component catalog** (AccountSession key → purpose); onboarding/compliance ones first:
- `account_onboarding` — localized onboarding form, doc upload, identity verification,
  a `risk_intervention` step, and service-agreement acceptance.
- `notification_banner` — surfaces risk interventions + outstanding requirements **after**
  initial onboarding (renders only when action is needed and `details_submitted=true`).
- `account_management` — account holder views/edits details + bank account; also prompts
  outstanding `currently_due`/`eventually_due` (but is *not* for collecting missing info).
- Plus `payments`, `payment_details`, `disputes_list`, `payouts`, `payouts_list`,
  `balances`, `documents`, `tax_registrations`/`tax_settings`, `financial_account`,
  `issuing_card(s)_list`, `capital_*` (preview), reporting components.
Source: https://docs.stripe.com/connect/supported-embedded-components.md?platform=web ,
https://docs.stripe.com/connect/supported-embedded-components/account-onboarding.md ,
https://docs.stripe.com/connect/supported-embedded-components/notification-banner.md ,
https://docs.stripe.com/connect/supported-embedded-components/account-management.md

**Which are needed for embedded Managed Risk:** the trio
**`account_onboarding` + `notification_banner` (+ `account_management`)** are what keep a
connected account unblocked — they surface Stripe's risk interventions and new
requirements to the therapist inside our app. If we go embedded, ship all three.
Source: https://docs.stripe.com/connect/supported-embedded-components/notification-banner.md

**Setup + gates (web).** Server mints an **AccountSession** (`POST /v1/account_sessions`,
per-component `enabled` + `features`); client runs `loadConnectAndInitialize` from
`@stripe/connect-js` with the publishable key and a `fetchClientSecret` callback. Use a
**restricted** API key scoped to account sessions. CSP must allow Stripe;
`Cross-Origin-Opener-Policy` stays `unsafe-none`. The docs do **not** state an explicit
live-mode/platform-review gate for embedded components, but our own platform profile /
responsibilities must be set. Source: https://docs.stripe.com/connect/get-started-connect-embedded-components.md?platform=web

**The fork itself:** `disable_stripe_user_authentication=true` (the "fully embedded, no
Stripe popup" experience) is allowed **only when `requirement_collection=application`**
(Custom-equivalent) — and then **you assume liability for unrecoverable negative
balances**, and networked onboarding is off. Tonight's Express-equivalent
(`requirement_collection=stripe`) keeps Stripe user-auth on and, at minimum, the
**Express Dashboard** already gives therapists balances, payouts, payout-schedule edits,
refunds/disputes, and login via single-use link (no password) — no embedded build
required to launch. Source: https://docs.stripe.com/connect/supported-embedded-components/account-onboarding.md ,
https://docs.stripe.com/connect/express-dashboard.md

**Managed Risk when you own collection (`requirement_collection=application`):** poll the
`requirements` hash (`currently_due`, `eventually_due`, `past_due`, `pending_verification`,
`current_deadline`, `disabled_reason`, `errors`) on `account.updated`. Stripe **risk**
requirements (`business_model_verification`, `restricted_or_prohibited_industry_diligence`,
`identity_verification`, etc.) **can't be satisfied via the API** — you must route the
therapist to the embedded onboarding component, a hosted account link, or complete a
`form`-type requirement on their behalf.
Source: https://docs.stripe.com/connect/handling-api-verification.md

---

## 4. SaaS billing via Connect — charging therapists Leuk's own fee

**Cleanest for tonight (v1):** take the platform's cut as `application_fee_amount` on
each charge (destination charge: on the platform PaymentIntent alongside
`transfer_data[destination]`). This is a **per-transaction** cut, not a flat monthly SaaS
fee. If Stripe's Platform Pricing Tool is enabled, **omit** `application_fee_amount` or it
overrides the tool. Source: https://docs.stripe.com/connect/end-to-end-saas-platform.md?platform=web

**A flat/recurring SaaS subscription fee to therapists** is **not** covered by the v1
guide. Two realistic paths:
- **v1 today:** represent each therapist as a **Customer on the platform account**,
  attach a card, and bill a Stripe **Subscription** — separate from their connected-account
  balance (they pay by card, not out of payouts). No native "debit their payout balance for
  a monthly fee" exists in v1.
- **v2 future (not tonight):** Accounts v2 adds a `customer` **configuration** so the
  connected account can pay the platform **directly from its Stripe balance** — SetupIntent
  + Subscription using `payment_method_types=stripe_balance` and `customer_account=acct_…`
  (note: `customer_account`, an account id, **not** a Customer id). Requires the
  `merchant.card_payments` capability active and sufficient balance; Sandboxes only; v2
  and v1 accounts are not interchangeable. This is the clean long-term way to bill SaaS
  fees, and a reason the eventual v2 migration matters.
Source: https://docs.stripe.com/connect/integrate-billing-connect.md

---

## 5. Traps — deadlines, irreversibility, live-mode gates, fee surprises

- **Per-active-account fee.** Express/Custom connected accounts cost the platform
  **$2 per monthly active account** (any month a payout is sent) **+ 0.25% + $0.25 per
  payout** when the platform controls pricing. Standard accounts carry no such platform
  fee. Budget $2/therapist/month for anyone who gets paid that month.
  Source: https://stripe.com/connect/pricing
- **Instant Payouts** 1% of volume; **cross-border payouts** start at 0.25%.
  Source: https://stripe.com/connect/pricing
- **1099 tax handling.** With `controller.fees.payer=application` (us), **Stripe does NOT
  issue 1099-K** — **the platform is responsible for 1099-NEC/1099-MISC filing**. Stripe's
  1099 product can e-file/e-deliver for **$2.99 per 1099 e-filed with IRS**, **$1.49 per
  state**, **$2.99 per mailed** form. Turning on a `tax_reporting_us_1099_*` capability
  **disables payouts once an account passes $600 in charges** until tax info is collected —
  so wire tax-info collection in before enabling it. 1099-NEC threshold is **$600**;
  recipient delivery deadline is the standard **Jan 31** (confirm current-year date).
  Source: https://docs.stripe.com/connect/tax-reporting.md ,
  https://docs.stripe.com/connect/required-verification-information-taxes.md ,
  https://stripe.com/connect/pricing
- **Service agreement is immutable** once accepted — pick `full` from the start.
  Source: https://docs.stripe.com/connect/service-agreement-types.md
- **Verification deadlines bite payouts, then charges.** Miss `current_deadline` →
  payouts disabled; keep ignoring → charges can be disabled too. `disabled_reason` values
  like `rejected.fraud` / `rejected.listed` / `rejected.terms_of_service` are **not
  remediable**. Source: https://docs.stripe.com/connect/handling-api-verification.md
- **`disable_stripe_user_authentication=true` ⇒ platform eats negative balances** and only
  works under `requirement_collection=application`. Don't reach for the fully-embedded
  no-popup UX without accepting that liability.
  Source: https://docs.stripe.com/connect/supported-embedded-components/account-onboarding.md
- **Direct vs destination dispute liability.** On **direct** charges the *connected
  account* handles disputes; on **destination** charges the *platform* does. Our
  destination-first plan means Leuk owns disputes/refunds against its balance.
  Source: https://docs.stripe.com/connect/end-to-end-saas-platform.md?platform=web
- **Account links are single-use, short-lived, must not be emailed/texted.**
  Source: https://docs.stripe.com/connect/end-to-end-saas-platform.md?platform=web

---

## Could not verify / open questions
- Whether `stripe_dashboard.type=express` + `requirement_collection=application` is a
  valid combo (docs only show express+stripe and none+application). Confirm before
  assuming we can have Express Dashboard *and* own KYC collection.
- Exact current-year 1099 recipient-delivery and IRS-filing dates (page states thresholds,
  not the calendar dates; Jan 31 is the standard recipient deadline).
- `track-onboarding-status.md` is a dead slug (404); the status fields it would document
  live on the `requirements` hash + `account.updated` webhook (captured in §3).
