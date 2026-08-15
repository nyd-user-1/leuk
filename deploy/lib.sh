#!/usr/bin/env bash
# Shared by every deploy script. Sourced, never executed.
#
# set -euo pipefail is not decoration here: these scripts create billable AWS
# resources in sequence, and a step that fails silently and lets the next one
# run is how you end up with an ALB pointing at nothing and no idea which call
# went wrong.

set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"

# shellcheck disable=SC1091
source "$DEPLOY_DIR/app.env"

: "${APP_NAME:?app.env must set APP_NAME}"
: "${AWS_REGION:?app.env must set AWS_REGION}"

export AWS_REGION
export AWS_PAGER=""   # or every describe-* opens less and hangs the script

# ── naming ───────────────────────────────────────────────────────────────────
# Every resource derives its name from APP_NAME. That is what makes these
# scripts portable to the next project: change one variable, get a parallel set
# of resources that cannot collide with this one.
ECR_REPO="$APP_NAME"
S3_BUCKET_PREFIX="$APP_NAME-deploy-src"
CODEBUILD_PROJECT="$APP_NAME-build"
CODEBUILD_ROLE="$APP_NAME-codebuild-role"
CLUSTER="$APP_NAME-cluster"
SERVICE="$APP_NAME-service"
TASK_FAMILY="$APP_NAME-task"
TASK_ROLE="$APP_NAME-task-role"
EXEC_ROLE="$APP_NAME-exec-role"
SECRET_NAME="$APP_NAME/env"
ALB_NAME="$APP_NAME-alb"
TG_NAME="$APP_NAME-tg"
LOG_GROUP="/ecs/$APP_NAME"

# ── output ───────────────────────────────────────────────────────────────────
BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; OFF=$'\033[0m'

step() { printf "\n%s==>%s %s\n" "$BOLD" "$OFF" "$*"; }
info() { printf "    %s\n" "$*"; }
ok()   { printf "    %s✓%s %s\n" "$GREEN" "$OFF" "$*"; }
warn() { printf "    %s!%s %s\n" "$YELLOW" "$OFF" "$*"; }
die()  { printf "\n%serror:%s %s\n" "$RED" "$OFF" "$*" >&2; exit 1; }

# Every script prints what it will create before creating it. These are the
# calls that start costing money; they should never be a surprise.
confirm_or_run() {
  if [[ "${ASSUME_YES:-}" == "1" ]]; then return 0; fi
  printf "    %scontinue? [y/N]%s " "$DIM" "$OFF"
  read -r reply </dev/tty
  [[ "$reply" == "y" || "$reply" == "Y" ]] || die "stopped"
}

# ── aws helpers ──────────────────────────────────────────────────────────────
need_aws() {
  command -v aws >/dev/null 2>&1 || die "aws CLI not found"
  ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)" \
    || die "aws credentials are not working"
  export ACCOUNT_ID
  ECR_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO"
  export ECR_URI
}

# `aws ... 2>/dev/null` swallows real errors too, so existence checks are
# explicit about what they expect to fail.
exists() { "$@" >/dev/null 2>&1; }
