#!/usr/bin/env bash
# Stand up (or update) the running service: cluster, roles, log group, task
# definition, ALB, target group, listener, Fargate service.
#
# This is the script that starts billing meaningfully — an ALB is ~$16/month
# before traffic, and two Fargate tasks at 1 vCPU / 2 GB are ~$50/month. It says
# so before it does anything.
#
# Re-running is the deploy: it registers a new task definition revision pointing
# at :latest and tells ECS to roll. Two tasks plus a health check means the old
# revision serves until the new one is healthy.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_aws

exists aws ecr describe-images --repository-name "$ECR_REPO" --image-ids imageTag=latest \
  || die "no :latest image in $ECR_REPO — run ./deploy/20-build.sh first"

FIRST_RUN=1
exists aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --query 'services[0].status' --output text && \
  [[ "$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" --query 'length(services)' --output text)" == "1" ]] && FIRST_RUN=0

if [[ $FIRST_RUN == 1 ]]; then
  step "Create the $APP_NAME service"
  info "cluster   $CLUSTER"
  info "tasks     $DESIRED_COUNT × ${CPU}/${MEMORY} ($ARCH)"
  info "load bal. $ALB_NAME (internet-facing)"
  warn "ongoing cost: ~\$16/mo for the ALB + ~\$25/mo per task"
  confirm_or_run
else
  step "Deploy to the existing $APP_NAME service"
fi

# ── network ──────────────────────────────────────────────────────────────────
# The default VPC and its subnets. Fine for a first deployment; a dedicated VPC
# with private subnets and a NAT is the hardening step, and it is a change to
# this block alone.
step "Network"
VPC_ID="$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
[[ "$VPC_ID" != "None" ]] || die "no default VPC in $AWS_REGION — create one, or set VPC_ID/SUBNETS in app.env"
SUBNETS="$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[?MapPublicIpOnLaunch==`true`].SubnetId' --output text | tr '\t' ',')"
[[ -n "$SUBNETS" ]] || die "no public subnets in $VPC_ID"
info "vpc $VPC_ID"
info "subnets $SUBNETS"

sg_for() { # name description -> id
  local name="$1" desc="$2" id
  id="$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$name" "Name=vpc-id,Values=$VPC_ID" \
        --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo None)"
  if [[ "$id" == "None" || -z "$id" ]]; then
    id="$(aws ec2 create-security-group --group-name "$name" --description "$desc" \
          --vpc-id "$VPC_ID" --query GroupId --output text)"
  fi
  printf '%s' "$id"
}

ALB_SG="$(sg_for "$APP_NAME-alb-sg" "$APP_NAME load balancer")"
TASK_SG="$(sg_for "$APP_NAME-task-sg" "$APP_NAME tasks")"

# 80 is here only so the redirect-to-443 listener can answer. Nothing is served
# over it.
for port in 80 443; do
  aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" --protocol tcp --port $port \
    --cidr 0.0.0.0/0 >/dev/null 2>&1 || true
done
# Tasks accept traffic from the load balancer and from nowhere else. This is the
# line that keeps the container off the public internet even in a public subnet.
aws ec2 authorize-security-group-ingress --group-id "$TASK_SG" --protocol tcp \
  --port "$CONTAINER_PORT" --source-group "$ALB_SG" >/dev/null 2>&1 || true
ok "alb-sg $ALB_SG · task-sg $TASK_SG (tasks reachable only from the ALB)"

# ── roles ────────────────────────────────────────────────────────────────────
step "Task roles"
make_role() { # name  -> creates with the ecs-tasks trust policy
  exists aws iam get-role --role-name "$1" && return 0
  aws iam create-role --role-name "$1" --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{ "Effect": "Allow", "Principal": {"Service": "ecs-tasks.amazonaws.com"},
                    "Action": "sts:AssumeRole" }]
  }' >/dev/null
}
make_role "$EXEC_ROLE"
make_role "$TASK_ROLE"

aws iam attach-role-policy --role-name "$EXEC_ROLE" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy >/dev/null 2>&1 || true

# The EXECUTION role reads the secret (the agent injects env before the
# container starts). The TASK role is what the app itself runs as — Bedrock and
# nothing else, because the app reaches Postgres and S3 over the network with
# credentials of their own.
aws iam put-role-policy --role-name "$EXEC_ROLE" --policy-name "$APP_NAME-read-secret" \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",
    \"Action\":[\"secretsmanager:GetSecretValue\"],
    \"Resource\":\"arn:aws:secretsmanager:$AWS_REGION:$ACCOUNT_ID:secret:$SECRET_NAME-*\"}]}" >/dev/null

aws iam put-role-policy --role-name "$TASK_ROLE" --policy-name "$APP_NAME-bedrock" \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
    "Action":["bedrock:InvokeModel","bedrock:InvokeModelWithResponseStream"],
    "Resource":"*"}]}' >/dev/null
ok "$EXEC_ROLE (reads the secret) · $TASK_ROLE (Bedrock)"

# ── logs ─────────────────────────────────────────────────────────────────────
aws logs create-log-group --log-group-name "$LOG_GROUP" >/dev/null 2>&1 || true
aws logs put-retention-policy --log-group-name "$LOG_GROUP" --retention-in-days 30 >/dev/null
ok "logs $LOG_GROUP (30 days)"

# ── task definition ──────────────────────────────────────────────────────────
step "Task definition"
SECRET_ARN="$(aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --query ARN --output text)"
# Every key in the secret becomes one `secrets` entry. ECS resolves `arn:...:key`
# per variable, so adding an env var means re-running 10-secrets.sh and this —
# no task-definition editing by hand.
SECRET_KEYS="$(aws secretsmanager get-secret-value --secret-id "$SECRET_NAME" \
  --query SecretString --output text | jq -r 'keys[]')"
SECRETS_JSON="$(printf '%s\n' "$SECRET_KEYS" | jq -R -s --arg arn "$SECRET_ARN" \
  'split("\n") | map(select(length>0)) | map({name: ., valueFrom: ($arn + ":" + . + "::")})')"
info "$(printf '%s\n' "$SECRET_KEYS" | grep -c .) environment variables from $SECRET_NAME"

TD_ARN="$(aws ecs register-task-definition \
  --family "$TASK_FAMILY" \
  --network-mode awsvpc \
  --requires-compatibilities FARGATE \
  --cpu "$CPU" --memory "$MEMORY" \
  --runtime-platform "{\"cpuArchitecture\":\"$ARCH\",\"operatingSystemFamily\":\"LINUX\"}" \
  --execution-role-arn "arn:aws:iam::$ACCOUNT_ID:role/$EXEC_ROLE" \
  --task-role-arn "arn:aws:iam::$ACCOUNT_ID:role/$TASK_ROLE" \
  --container-definitions "$(cat <<JSON
[{
  "name": "$APP_NAME",
  "image": "$ECR_URI:latest",
  "essential": true,
  "portMappings": [{ "containerPort": $CONTAINER_PORT, "protocol": "tcp" }],
  "environment": [
    { "name": "NODE_ENV", "value": "production" },
    { "name": "PORT", "value": "$CONTAINER_PORT" },
    { "name": "HOSTNAME", "value": "0.0.0.0" }
  ],
  "secrets": $SECRETS_JSON,
  "logConfiguration": {
    "logDriver": "awslogs",
    "options": { "awslogs-group": "$LOG_GROUP", "awslogs-region": "$AWS_REGION",
                 "awslogs-stream-prefix": "task" }
  },
  "stopTimeout": 30
}]
JSON
)" --query 'taskDefinition.taskDefinitionArn' --output text)"
ok "${TD_ARN##*/}"

# ── load balancer ────────────────────────────────────────────────────────────
step "Load balancer"
ALB_ARN="$(aws elbv2 describe-load-balancers --names "$ALB_NAME" \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || echo "")"
if [[ -z "$ALB_ARN" || "$ALB_ARN" == "None" ]]; then
  ALB_ARN="$(aws elbv2 create-load-balancer --name "$ALB_NAME" --type application \
    --scheme internet-facing --security-groups "$ALB_SG" \
    --subnets ${SUBNETS//,/ } --query 'LoadBalancers[0].LoadBalancerArn' --output text)"
  ok "created"
else
  ok "exists"
fi
ALB_DNS="$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB_ARN" \
  --query 'LoadBalancers[0].DNSName' --output text)"

TG_ARN="$(aws elbv2 describe-target-groups --names "$TG_NAME" \
  --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || echo "")"
if [[ -z "$TG_ARN" || "$TG_ARN" == "None" ]]; then
  # 40s grace, 3 tries: Next needs a moment to warm, and failing a task that is
  # merely still starting produces a crash loop that looks like a broken app.
  TG_ARN="$(aws elbv2 create-target-group --name "$TG_NAME" --protocol HTTP \
    --port "$CONTAINER_PORT" --vpc-id "$VPC_ID" --target-type ip \
    --health-check-path "$HEALTHCHECK_PATH" --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 10 --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 --matcher HttpCode=200-399 \
    --query 'TargetGroups[0].TargetGroupArn' --output text)"
  # Next streams; draining a connection mid-response is a truncated answer.
  aws elbv2 modify-target-group-attributes --target-group-arn "$TG_ARN" \
    --attributes Key=deregistration_delay.timeout_seconds,Value=30 >/dev/null
fi
ok "target group ready"

if ! exists aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" \
      --query 'Listeners[?Port==`80`].ListenerArn' --output text | grep -q arn; then
  aws elbv2 create-listener --load-balancer-arn "$ALB_ARN" --protocol HTTP --port 80 \
    --default-actions "Type=forward,TargetGroupArn=$TG_ARN" >/dev/null 2>&1 || true
fi
ok "http://$ALB_DNS"
warn "HTTP only so far — 40-dns.sh covers the certificate and the 443 listener"

# ── cluster + service ────────────────────────────────────────────────────────
step "Service"
aws ecs create-cluster --cluster-name "$CLUSTER" \
  --settings name=containerInsights,value=enabled >/dev/null 2>&1 || true

if [[ $FIRST_RUN == 1 ]]; then
  aws ecs create-service --cluster "$CLUSTER" --service-name "$SERVICE" \
    --task-definition "$TD_ARN" --desired-count "$DESIRED_COUNT" --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$TASK_SG],assignPublicIp=ENABLED}" \
    --load-balancers "targetGroupArn=$TG_ARN,containerName=$APP_NAME,containerPort=$CONTAINER_PORT" \
    --health-check-grace-period-seconds 90 \
    --deployment-configuration "minimumHealthyPercent=100,maximumPercent=200" >/dev/null
  ok "service created — first tasks take ~2 min to pass health checks"
else
  aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
    --task-definition "$TD_ARN" --force-new-deployment >/dev/null
  ok "rolling to ${TD_ARN##*/}"
fi

step "Watch it come up"
info "aws ecs wait services-stable --cluster $CLUSTER --services $SERVICE --region $AWS_REGION"
info "curl -I http://$ALB_DNS"
info "./deploy/status.sh"
info ""
info "next: ./deploy/40-dns.sh"
