#!/bin/sh
# Prod deploy from the laptop (ADR-0012; runbook in docs/design/lld.md → Prod runbook).
set -eu
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
$TF apply -target=aws_ecr_repository.api -var "image_tag=$TAG" -auto-approve
REPO=$($TF output -raw ecr_repository_url)
aws ecr get-login-password --region eu-west-2 | docker login --username AWS --password-stdin "${REPO%%/*}"
docker buildx build --platform linux/arm64 --provenance=false \
  -o "type=image,oci-mediatypes=false,push=true,name=$REPO:$TAG" .

# 3. Full apply, interactive: read the plan, type yes.
$TF apply -var "image_tag=$TAG"

echo "✓ deployed $TAG: $($TF output -raw function_url)api/v1/health"
