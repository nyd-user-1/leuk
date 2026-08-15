#!/usr/bin/env bash
# Zip the source, upload it, run CodeBuild, stream the outcome.
#
# The zip respects .dockerignore, so the ~10 GB working tree (.harvest is 4 GB,
# .next another 7) travels as ~11 MB. It excludes .env.local for the same reason
# the Dockerfile does: the build reads that from Secrets Manager, and a
# credential in an S3 object is a credential in S3.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_aws

BUCKET="$S3_BUCKET_PREFIX-$ACCOUNT_ID"
ZIP="$(mktemp -t "$APP_NAME-src").zip"
trap 'rm -f "$ZIP"' EXIT

step "Package source"
cd "$ROOT"

# Turn .dockerignore into zip exclusions. Not a perfect translation of Docker's
# pattern syntax, but it covers the directory excludes that matter, and
# anything that slips through only makes the upload larger — never wrong.
EXCLUDES=(-x '*.git/*' '*/node_modules/*' 'node_modules/*' '*/.next/*' '.next/*'
          '.harvest/*' '*/.harvest/*' '.env' '.env.*' 'uploads/*' 'docs/*'
          '.claude/*' '*.log' '.DS_Store' 'tsconfig.tsbuildinfo')

zip -qr "$ZIP" . "${EXCLUDES[@]}"
SIZE="$(du -h "$ZIP" | cut -f1)"
ok "source.zip $SIZE"

# The Dockerfile and buildspec have to survive the exclusions or the build has
# nothing to run. Cheap assertion, saves a five-minute round trip to find out.
unzip -l "$ZIP" | grep -q " Dockerfile$" || die "Dockerfile missing from the zip"
unzip -l "$ZIP" | grep -q "deploy/buildspec.yml" || die "buildspec.yml missing from the zip"
ok "Dockerfile and buildspec present"

step "Upload"
aws s3 cp "$ZIP" "s3://$BUCKET/source.zip" --only-show-errors
ok "s3://$BUCKET/source.zip"

step "Build"
BUILD_ID="$(aws codebuild start-build --project-name "$CODEBUILD_PROJECT" \
  --query 'build.id' --output text)"
ok "$BUILD_ID"
info "logs: https://$AWS_REGION.console.aws.amazon.com/codesuite/codebuild/$ACCOUNT_ID/projects/$CODEBUILD_PROJECT/build/${BUILD_ID//:/%3A}"

info "waiting (first build is slow — no layer cache yet)…"
while true; do
  read -r PHASE STATUS <<<"$(aws codebuild batch-get-builds --ids "$BUILD_ID" \
    --query 'builds[0].[currentPhase,buildStatus]' --output text)"
  [[ "$STATUS" != "IN_PROGRESS" ]] && break
  printf "    %s%s%s\r" "$DIM" "$PHASE                    " "$OFF"
  sleep 10
done
printf "\r%*s\r" 40 ""

if [[ "$STATUS" != "SUCCEEDED" ]]; then
  warn "build $STATUS in phase $PHASE"
  aws codebuild batch-get-builds --ids "$BUILD_ID" \
    --query 'builds[0].phases[?phaseStatus!=`SUCCEEDED`].[phaseType,phaseStatus,contexts[0].message]' \
    --output text | sed 's/^/    /'
  die "see the console link above for the full log"
fi

ok "build succeeded"

DIGEST="$(aws ecr describe-images --repository-name "$ECR_REPO" --image-ids imageTag=latest \
  --query 'imageDetails[0].imageDigest' --output text)"
SIZE_MB="$(aws ecr describe-images --repository-name "$ECR_REPO" --image-ids imageTag=latest \
  --query 'imageDetails[0].imageSizeInBytes' --output text | awk '{printf "%.0f", $1/1048576}')"

step "Image"
info "$ECR_URI:latest"
info "digest $DIGEST"
info "size   ${SIZE_MB} MB compressed"
info "next: ./deploy/30-service.sh"
