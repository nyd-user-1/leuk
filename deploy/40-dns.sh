#!/usr/bin/env bash
# Certificate + DNS. This script REQUESTS the certificate and then prints the
# records for you to create in Cloudflare — it does not touch Cloudflare, on
# purpose. DNS is the one step where a wrong automated edit takes a live domain
# down, and reading two records off a screen costs thirty seconds.
#
# Ordering matters and is not obvious: ACM will not issue until the validation
# CNAME resolves, and the 443 listener cannot exist until the certificate is
# issued. So this runs in two passes — request, you add records, run again.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_aws
: "${DOMAIN:?app.env must set DOMAIN}"

step "Certificate for $DOMAIN"
CERT_ARN="$(aws acm list-certificates --certificate-statuses PENDING_VALIDATION ISSUED \
  --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn | [0]" --output text)"

if [[ -z "$CERT_ARN" || "$CERT_ARN" == "None" ]]; then
  CERT_ARN="$(aws acm request-certificate --domain-name "$DOMAIN" \
    --validation-method DNS --key-algorithm RSA_2048 \
    --query CertificateArn --output text)"
  ok "requested"
  sleep 5   # the validation record is not in the response immediately
else
  ok "already requested"
fi

STATUS="$(aws acm describe-certificate --certificate-arn "$CERT_ARN" \
  --query 'Certificate.Status' --output text)"
info "status $STATUS"

if [[ "$STATUS" != "ISSUED" ]]; then
  read -r VNAME VVALUE <<<"$(aws acm describe-certificate --certificate-arn "$CERT_ARN" \
    --query 'Certificate.DomainValidationOptions[0].ResourceRecord.[Name,Value]' --output text)"
  step "1 · Add this to Cloudflare to validate the certificate"
  printf "\n    %sType%s   CNAME\n" "$BOLD" "$OFF"
  printf "    %sName%s   %s\n" "$BOLD" "$OFF" "${VNAME%.}"
  printf "    %sValue%s  %s\n" "$BOLD" "$OFF" "${VVALUE%.}"
  printf "    %sProxy%s  DNS only (grey cloud) — ACM cannot validate through the proxy\n\n" "$BOLD" "$OFF"
  warn "then re-run this script; ACM usually issues within a few minutes"
fi

ALB_DNS="$(aws elbv2 describe-load-balancers --names "$ALB_NAME" \
  --query 'LoadBalancers[0].DNSName' --output text 2>/dev/null || echo "")"
[[ -n "$ALB_DNS" && "$ALB_DNS" != "None" ]] || die "no load balancer yet — run ./deploy/30-service.sh"

step "2 · Point $DOMAIN at the load balancer"
printf "\n    %sType%s   CNAME\n" "$BOLD" "$OFF"
printf "    %sName%s   %s\n" "$BOLD" "$OFF" "${DOMAIN%%.*}"
printf "    %sValue%s  %s\n" "$BOLD" "$OFF" "$ALB_DNS"
printf "    %sProxy%s  Proxied (orange cloud) — this is what puts Cloudflare's WAF\n" "$BOLD" "$OFF"
printf "           and bot management in front of the app\n\n"
info "Cloudflare SSL mode must be Full (strict). Flexible would terminate TLS at"
info "the edge and talk to the ALB over plain HTTP — encrypted to the visitor,"
info "cleartext across the internet, which for PHI is worse than useless."

if [[ "$STATUS" == "ISSUED" ]]; then
  step "3 · HTTPS listener"
  TG_ARN="$(aws elbv2 describe-target-groups --names "$TG_NAME" --query 'TargetGroups[0].TargetGroupArn' --output text)"
  ALB_ARN="$(aws elbv2 describe-load-balancers --names "$ALB_NAME" --query 'LoadBalancers[0].LoadBalancerArn' --output text)"
  HTTPS="$(aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" \
    --query 'Listeners[?Port==`443`].ListenerArn | [0]' --output text)"
  if [[ -z "$HTTPS" || "$HTTPS" == "None" ]]; then
    aws elbv2 create-listener --load-balancer-arn "$ALB_ARN" --protocol HTTPS --port 443 \
      --certificates "CertificateArn=$CERT_ARN" \
      --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
      --default-actions "Type=forward,TargetGroupArn=$TG_ARN" >/dev/null
    ok "443 listener created (TLS 1.2+)"
  else
    ok "443 listener exists"
  fi
  # Redirect rather than serve: anything on 80 is either a typo or a scanner.
  L80="$(aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" \
    --query 'Listeners[?Port==`80`].ListenerArn | [0]' --output text)"
  if [[ -n "$L80" && "$L80" != "None" ]]; then
    aws elbv2 modify-listener --listener-arn "$L80" --default-actions \
      'Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' >/dev/null
    ok "80 redirects to 443"
  fi
  step "Done"
  info "https://$DOMAIN once the CNAME propagates"
fi
