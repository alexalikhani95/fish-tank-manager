#!/usr/bin/env bash
# Prod deploy from the laptop (ADR-0012; runbook in docs/design/lld.md → Prod runbook).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "✗ deploy: commit or stash your changes first; the image tag must be a real commit." >&2
  exit 1
fi
TAG=$(git rev-parse HEAD)
TF="terraform -chdir=infra/prod"

# 1. Init (idempotent, so a fresh clone works).
$TF init -input=false

# 2. The Lambda needs an image before it can exist: ECR first (the -target warning is expected),
#    then build and push. Docker v2 manifest, single platform: Lambda rejects OCI indexes.
# force_delete stays off on the repository: replacing one that holds images fails instead of wiping them.
$TF apply -target=aws_ecr_repository.api -var "image_tag=$TAG" -auto-approve
REPO=$($TF output -raw ecr_repository_url)
aws ecr get-login-password --region eu-west-2 | docker login --username AWS --password-stdin "${REPO%%/*}"
docker buildx build --platform linux/arm64 --provenance=false \
  -o "type=image,oci-mediatypes=false,push=true,name=$REPO:$TAG" .

# 3. Build the PWA, then the full apply, interactive: read the plan, type yes.
npm run build:web
$TF apply -var "image_tag=$TAG"
BASE=$($TF output -raw cloudfront_url)
BUCKET=$($TF output -raw pwa_bucket)

# 4. Upload. Hashed assets are immutable; everything else (index.html, sw.js, registerSW.js,
#    the manifest, icons) is revalidated on every load. New assets go up before the shell that
#    references them; files no longer in the build are deleted last.
aws s3 sync web/dist/assets "s3://$BUCKET/assets" --cache-control "public, max-age=31536000, immutable"
aws s3 sync web/dist "s3://$BUCKET" --exclude "assets/*" --cache-control "no-cache" --delete
aws s3 sync web/dist/assets "s3://$BUCKET/assets" --delete

# 5. Invalidate, and wait so the smoke check sees this deploy.
DIST=$($TF output -raw distribution_id)
INV=$(aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" --query Invalidation.Id --output text)
aws cloudfront wait invalidation-completed --distribution-id "$DIST" --id "$INV"

# 6. Smoke check through CloudFront; any miss fails the deploy.
H=$(mktemp)
trap 'rm -f "$H"' EXIT
fail() {
  echo "✗ smoke: $*" >&2
  exit 1
}
# expect PATH STATUS CONTENT-TYPE [curl args]: checks both, prints the body, leaves headers in $H.
expect() {
  local path=$1 status=$2 type=$3 out code
  shift 3
  out=$(curl -sS -D "$H" -w '\n%{http_code}' "$@" "$BASE$path") || fail "GET $path: request failed"
  code=${out##*$'\n'}
  [ "$code" = "$status" ] || fail "GET $path: HTTP $code, want $status"
  grep -qi "^content-type: *$type" "$H" || fail "GET $path: content-type is not $type"
  printf '%s' "${out%$'\n'*}"
}
header() { grep -i "^$1:" "$H" | tr -d '\r' || true; }

# Retries ride out a cold start (curl retries 5xx and timeouts). Bodies and headers go through
# variables, not pipes, so a fail inside expect exits the script.
BODY=$(expect /api/v1/health 200 application/json --retry 5 --retry-all-errors --retry-delay 3)
[[ $BODY == *'"database":"connected"'* ]] || fail "health: $BODY"
expect /api/v1/health 200 application/json >/dev/null
XCACHE=$(header x-cache)
[[ $XCACHE != *[Hh]it* ]] || fail "health: served from the CloudFront cache ($XCACHE)"
expect /api/v1/me 401 application/json >/dev/null
expect /api/v1/me 401 application/json -H "Cookie: token=garbage" >/dev/null
expect / 200 text/html >/dev/null
expect /tanks/x 200 text/html >/dev/null
for f in /index.html /sw.js; do
  expect "$f" 200 "" >/dev/null
  CC=$(header cache-control)
  [[ $CC == *no-cache* ]] || fail "$f: cache-control is '$CC', want no-cache"
done

# 7. Done.
echo "✓ deployed $TAG: $BASE"
