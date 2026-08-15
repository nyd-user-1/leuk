#!/usr/bin/env bash
# Where everything stands. Read-only — safe to run any time, including when
# something is on fire.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_aws

line() { printf "  %-16s %s\n" "$1" "$2"; }

step "$APP_NAME · $AWS_REGION · account $ACCOUNT_ID"

IMG="$(aws ecr describe-images --repository-name "$ECR_REPO" --image-ids imageTag=latest \
  --query 'imageDetails[0].[imagePushedAt,imageSizeInBytes]' --output text 2>/dev/null || echo "")"
if [[ -n "$IMG" ]]; then
  read -r PUSHED BYTES <<<"$IMG"
  line "image" "pushed ${PUSHED%%.*}  ($(awk -v b="$BYTES" 'BEGIN{printf "%.0f MB", b/1048576}'))"
else
  line "image" "none — run 20-build.sh"
fi

SVC="$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --query 'services[0].[status,desiredCount,runningCount,pendingCount,taskDefinition]' \
  --output text 2>/dev/null || echo "")"
if [[ -n "$SVC" && "$SVC" != "None"* ]]; then
  read -r ST DESIRED RUNNING PENDING TD <<<"$SVC"
  line "service" "$ST  running $RUNNING/$DESIRED  pending $PENDING"
  line "task def" "${TD##*/}"
  aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
    --query 'services[0].events[0:3].[createdAt,message]' --output text 2>/dev/null \
    | sed 's/^/    /' | cut -c1-150
else
  line "service" "none — run 30-service.sh"
fi

ALB_DNS="$(aws elbv2 describe-load-balancers --names "$ALB_NAME" \
  --query 'LoadBalancers[0].DNSName' --output text 2>/dev/null || echo "")"
if [[ -n "$ALB_DNS" && "$ALB_DNS" != "None" ]]; then
  line "load balancer" "$ALB_DNS"
  TG_ARN="$(aws elbv2 describe-target-groups --names "$TG_NAME" --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null)"
  if [[ -n "$TG_ARN" && "$TG_ARN" != "None" ]]; then
    HEALTH="$(aws elbv2 describe-target-health --target-group-arn "$TG_ARN" \
      --query 'TargetHealthDescriptions[].TargetHealth.State' --output text 2>/dev/null | tr '\t' ' ')"
    line "targets" "${HEALTH:-none registered}"
  fi
  line "http" "$(curl -s -o /dev/null -w '%{http_code} in %{time_total}s' -m 15 "http://$ALB_DNS" 2>/dev/null || echo unreachable)"
fi

if [[ -n "${DOMAIN:-}" ]]; then
  line "domain" "$(curl -s -o /dev/null -w '%{http_code}' -m 15 "https://$DOMAIN" 2>/dev/null || echo unreachable)  https://$DOMAIN"
fi

step "Recent logs"
STREAM="$(aws logs describe-log-streams --log-group-name "$LOG_GROUP" \
  --order-by LastEventTime --descending --max-items 1 \
  --query 'logStreams[0].logStreamName' --output text 2>/dev/null || echo "")"
if [[ -n "$STREAM" && "$STREAM" != "None" ]]; then
  aws logs get-log-events --log-group-name "$LOG_GROUP" --log-stream-name "$STREAM" \
    --limit 12 --no-start-from-head --query 'events[].message' --output text 2>/dev/null \
    | sed 's/^/    /' | cut -c1-160
else
  info "no log streams yet"
fi
