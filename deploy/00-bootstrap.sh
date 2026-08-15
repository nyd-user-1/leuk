#!/usr/bin/env bash
# Create the things a build needs: an image registry, somewhere to put source,
# and a build project. Nothing here runs a build or serves traffic.
#
# Idempotent — every step checks first, so re-running after a partial failure
# picks up where it stopped rather than erroring on "already exists".

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_aws

step "Bootstrap $APP_NAME in $AWS_REGION (account $ACCOUNT_ID)"
info "ECR repo        $ECR_REPO"
info "S3 source       $S3_BUCKET_PREFIX-$ACCOUNT_ID"
info "CodeBuild       $CODEBUILD_PROJECT"
info "IAM role        $CODEBUILD_ROLE"
confirm_or_run

BUCKET="$S3_BUCKET_PREFIX-$ACCOUNT_ID"

# ── ECR ──────────────────────────────────────────────────────────────────────
step "Image registry"
if exists aws ecr describe-repositories --repository-names "$ECR_REPO"; then
  ok "repository exists"
else
  aws ecr create-repository \
    --repository-name "$ECR_REPO" \
    --image-scanning-configuration scanOnPush=true \
    --image-tag-mutability MUTABLE \
    --encryption-configuration encryptionType=AES256 >/dev/null
  ok "created"
fi

# Untagged layers accumulate on every rebuild and are billed by the GB. Ten
# images is more history than anyone reads.
aws ecr put-lifecycle-policy --repository-name "$ECR_REPO" --lifecycle-policy-text '{
  "rules": [{
    "rulePriority": 1,
    "description": "Keep the last 10 images",
    "selection": { "tagStatus": "any", "countType": "imageCountMoreThan", "countNumber": 10 },
    "action": { "type": "expire" }
  }]
}' >/dev/null
ok "lifecycle policy: keep 10"

# ── S3 source bucket ─────────────────────────────────────────────────────────
step "Source bucket"
if exists aws s3api head-bucket --bucket "$BUCKET"; then
  ok "bucket exists"
else
  if [[ "$AWS_REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$BUCKET" >/dev/null
  else
    aws s3api create-bucket --bucket "$BUCKET" \
      --create-bucket-configuration "LocationConstraint=$AWS_REGION" >/dev/null
  fi
  ok "created"
fi

# The zip contains the whole source tree. It is never public, and it does not
# need to outlive the build that reads it.
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" >/dev/null
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' >/dev/null
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration '{
  "Rules": [{ "ID": "expire-source", "Status": "Enabled", "Filter": {"Prefix": ""},
              "Expiration": { "Days": 7 } }]
}' >/dev/null
ok "private, encrypted, source expires after 7 days"

# ── CodeBuild service role ───────────────────────────────────────────────────
step "Build role"
if exists aws iam get-role --role-name "$CODEBUILD_ROLE"; then
  ok "role exists"
else
  aws iam create-role --role-name "$CODEBUILD_ROLE" --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{ "Effect": "Allow", "Principal": {"Service": "codebuild.amazonaws.com"},
                    "Action": "sts:AssumeRole" }]
  }' >/dev/null
  ok "created"
fi

# Scoped to this app's own resources — not AdministratorAccess, and not the
# managed PowerUser policy. A build server that can only push to one repository
# and read one secret is a much smaller thing to get wrong.
aws iam put-role-policy --role-name "$CODEBUILD_ROLE" --policy-name "$APP_NAME-build" \
  --policy-document "$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],
      "Resource": "arn:aws:logs:$AWS_REGION:$ACCOUNT_ID:log-group:/aws/codebuild/$CODEBUILD_PROJECT*" },
    { "Effect": "Allow",
      "Action": ["s3:GetObject","s3:GetObjectVersion"],
      "Resource": "arn:aws:s3:::$BUCKET/*" },
    { "Effect": "Allow",
      "Action": ["ecr:GetAuthorizationToken"],
      "Resource": "*" },
    { "Effect": "Allow",
      "Action": ["ecr:BatchCheckLayerAvailability","ecr:CompleteLayerUpload",
                 "ecr:InitiateLayerUpload","ecr:PutImage","ecr:UploadLayerPart",
                 "ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],
      "Resource": "arn:aws:ecr:$AWS_REGION:$ACCOUNT_ID:repository/$ECR_REPO" },
    { "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:$AWS_REGION:$ACCOUNT_ID:secret:$SECRET_NAME-*" }
  ]
}
JSON
)" >/dev/null
ok "policy attached (scoped to $ECR_REPO and $SECRET_NAME)"

# ── CodeBuild project ────────────────────────────────────────────────────────
step "Build project"
ENV_JSON="$(cat <<JSON
{
  "type": "ARM_CONTAINER",
  "image": "aws/codebuild/amazonlinux2-aarch64-standard:3.0",
  "computeType": "BUILD_GENERAL1_LARGE",
  "privilegedMode": true,
  "environmentVariables": [
    { "name": "ECR_URI", "value": "$ECR_URI" },
    { "name": "AWS_REGION", "value": "$AWS_REGION" },
    { "name": "SECRET_NAME", "value": "$SECRET_NAME" }
  ]
}
JSON
)"

# privilegedMode is required to run a Docker daemon inside the build container.
# ARM_CONTAINER because app.env asks for Graviton tasks and an image has to be
# built for the architecture it runs on.
if exists aws codebuild batch-get-projects --names "$CODEBUILD_PROJECT" \
     --query 'projects[0].name' --output text \
   && [[ "$(aws codebuild batch-get-projects --names "$CODEBUILD_PROJECT" --query 'length(projects)' --output text)" == "1" ]]; then
  aws codebuild update-project --name "$CODEBUILD_PROJECT" \
    --source "{\"type\":\"S3\",\"location\":\"$BUCKET/source.zip\",\"buildspec\":\"deploy/buildspec.yml\"}" \
    --artifacts '{"type":"NO_ARTIFACTS"}' \
    --environment "$ENV_JSON" \
    --service-role "arn:aws:iam::$ACCOUNT_ID:role/$CODEBUILD_ROLE" \
    --timeout-in-minutes 30 >/dev/null
  ok "project updated"
else
  # IAM is eventually consistent; a role created seconds ago is often not yet
  # assumable. Retry rather than fail the whole bootstrap on a race.
  for attempt in 1 2 3 4 5 6; do
    if aws codebuild create-project --name "$CODEBUILD_PROJECT" \
        --source "{\"type\":\"S3\",\"location\":\"$BUCKET/source.zip\",\"buildspec\":\"deploy/buildspec.yml\"}" \
        --artifacts '{"type":"NO_ARTIFACTS"}' \
        --environment "$ENV_JSON" \
        --service-role "arn:aws:iam::$ACCOUNT_ID:role/$CODEBUILD_ROLE" \
        --timeout-in-minutes 30 >/dev/null 2>&1; then
      ok "project created"
      break
    fi
    [[ $attempt == 6 ]] && die "could not create the build project (IAM role may not have propagated)"
    info "waiting for the IAM role to propagate ($attempt/6)…"
    sleep 10
  done
fi

step "Bootstrap complete"
info "next: ./deploy/10-secrets.sh"
