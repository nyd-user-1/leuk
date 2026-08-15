#!/usr/bin/env bash
# Push .env.local into Secrets Manager as ONE secret holding a JSON object.
#
# One secret per app, not one per variable: Secrets Manager bills per secret per
# month, the task definition maps each JSON key to an environment variable by
# name anyway, and thirty secrets is thirty things to keep in sync.
#
# Nothing here prints a value. Keys, counts, and lengths only — this script's
# output goes into terminal scrollback and screenshots.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_aws

ENV_FILE="${1:-$ROOT/.env.local}"
[[ -f "$ENV_FILE" ]] || die "no env file at $ENV_FILE"

# Variables that must NOT travel to production, either because they are
# meaningless there or because they are a local-only convenience.
EXCLUDE_RE='^(NODE_ENV|PORT|HOSTNAME|LEUK_LOCAL_TOOLS)='

# Build the JSON with jq so a value containing a quote, `$`, `&` or a space
# cannot corrupt the document.
#
# SPLIT ON THE FIRST `=` AND NOTHING ELSE. An earlier version of this split each
# line on whitespace after the key, which silently truncated every value
# containing a space — LEUK_EMAIL_FROM="Leuk <onboarding@resend.dev>" arrived as
# `"Leuk`, and every outbound email would have carried a broken From address.
# Values here legitimately contain spaces, `=` (base64 padding) and `&` (the
# Postgres query string). Slice at the first delimiter; touch nothing after it.
JSON="$(
  grep -vE '^\s*#' "$ENV_FILE" | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' | grep -vE "$EXCLUDE_RE" \
  | jq -R -s '
      split("\n")
      | map(select(test("^[A-Za-z_][A-Za-z0-9_]*=")))
      | map(index("=") as $i | { key: .[0:$i], value: .[$i+1:] })
      | map(.value |= (sub("^\"(?<s>.*)\"$"; "\(.s)") | sub("^'"'"'(?<s>.*)'"'"'$"; "\(.s)")))
      | from_entries'
)"

COUNT="$(printf '%s' "$JSON" | jq 'length')"
[[ "$COUNT" -gt 0 ]] || die "parsed 0 variables out of $ENV_FILE — refusing to write an empty secret"

step "Secret $SECRET_NAME"
info "$COUNT variables from $(basename "$ENV_FILE")"
printf '%s' "$JSON" | jq -r 'to_entries[] | "      \(.key) (\(.value|length) chars)"'
warn "these become environment variables on every running task"
confirm_or_run

if exists aws secretsmanager describe-secret --secret-id "$SECRET_NAME"; then
  aws secretsmanager put-secret-value --secret-id "$SECRET_NAME" --secret-string "$JSON" >/dev/null
  ok "updated (previous version retained — Secrets Manager keeps AWSPREVIOUS)"
else
  aws secretsmanager create-secret --name "$SECRET_NAME" \
    --description "$APP_NAME runtime environment" --secret-string "$JSON" >/dev/null
  ok "created"
fi

step "Done"
info "next: ./deploy/20-build.sh"
