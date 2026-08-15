# The deployment pipeline

One shape, ten projects. This directory is the reusable half — nothing in it is
Leuk-specific except the values in `app.env`.

## Why a pipeline and not ten deploys

Ten Dockerfiles that are 90% identical cost nothing. Ten *different* deployment
setups cost a great deal: ten ways to configure secrets, ten health-check
conventions, ten places to look when something breaks at 2am. If every project
produces a container and lands the same way, they become interchangeable and
moving the fleet stops being ten migrations.

So the contract is deliberately small. A project is deployable if it:

1. has a `Dockerfile` producing an image that listens on `$PORT`
2. answers `GET /` (or `HEALTHCHECK_PATH`) with a 2xx once ready
3. takes all configuration from environment variables
4. has a `deploy/app.env` naming itself and its resources

Everything else — registry, build, service, load balancer, DNS — is the same
scripts.

## Why the build happens in the cloud

`build.sh` runs on **AWS CodeBuild**, not your laptop. That is a deliberate
reversal: the first attempt at this installed a local Linux VM, sized it wrong,
and took the machine down with it. A build server that belongs to AWS costs a
few cents, needs nothing installed here, and is the CI we want anyway — the same
project later triggers from a git push instead of a script.

Source travels as a zip to S3 rather than through a GitHub connection, because a
connection needs a browser click to authorize and a zip does not. When you want
push-to-deploy, swap the source type; nothing else changes.

## The scripts

| Script | What it does | Safe to re-run |
|---|---|---|
| `00-bootstrap.sh` | ECR repo, S3 source bucket, CodeBuild project, IAM role | yes — creates only what is missing |
| `10-secrets.sh` | Reads `.env.local`, writes one Secrets Manager secret | yes — updates in place |
| `20-build.sh` | Zips source, uploads, runs CodeBuild, waits, prints the image digest | yes |
| `30-service.sh` | ECS cluster, task definition, Fargate service, ALB, target group | yes |
| `40-dns.sh` | Prints the exact Cloudflare + ACM records to create | yes — read-only |
| `status.sh` | Where everything stands | yes |

Every script is idempotent and prints what it is about to do before it does it.
Run them in order the first time; after that `20-build.sh` alone ships a change.

## Configuration

`app.env` is the whole per-project surface:

```sh
APP_NAME=leuk              # names every resource
AWS_REGION=us-east-1
DOMAIN=leuk.nysgpt.com
CPU=1024                   # 1 vCPU
MEMORY=2048                # 2 GB
DESIRED_COUNT=2            # two tasks, so a deploy is not an outage
ARCH=ARM64                 # Graviton — ~20% cheaper, same image if built for it
HEALTHCHECK_PATH=/
```

## Secrets

`10-secrets.sh` reads `.env.local` and writes **one** Secrets Manager secret per
app, as a JSON object. The task definition maps each key to an environment
variable by name, so adding a variable is one line in `.env.local` and a re-run.

Secrets never appear in the task definition, in CloudWatch, in the image, or in
a script's output. The build gets `.env.local` through a BuildKit secret mount
so `next build` can prerender against the real database without the credential
landing in a layer.

## What this deliberately does not do

- **No CDK, no Terraform.** Both are better at fifty resources than at six, and
  both are another thing to learn before anything ships. These are `aws` CLI
  calls you can read. Port them when the fleet justifies it.
- **No blue/green.** ECS rolling deploys with two tasks and a health check are
  enough until traffic says otherwise.
- **No autoscaling policy yet.** Fixed count first; measure, then scale.

## The order, first time

```sh
./deploy/00-bootstrap.sh     # ~1 min, creates the registry and build project
./deploy/10-secrets.sh       # ~10s, pushes .env.local to Secrets Manager
./deploy/20-build.sh         # ~5-8 min, first build is slow (no layer cache)
./deploy/30-service.sh       # ~3 min, then the ALB takes ~2 min to pass health
./deploy/40-dns.sh           # prints records; you create them in Cloudflare
```

Afterwards, shipping is `./deploy/20-build.sh && ./deploy/30-service.sh`.
