# API image (ticket prod-deploy/01). Build from the repo root:
#   docker buildx build --platform linux/arm64 --provenance=false --load -t fishtank-api .
# Single-platform, no attestation: Lambda rejects multi-manifest images. To push to ECR,
# use -o type=image,oci-mediatypes=false,push=true,name=<repo>:<tag> (Docker v2 manifest).
FROM node:24-slim AS build
WORKDIR /srv
# The only lockfile is the root one; every workspace's package.json must be present.
COPY package.json package-lock.json ./
COPY app/package.json app/
COPY web/package.json web/
RUN npm ci --workspace app --include-workspace-root=false
COPY app app
RUN cd app && node ace build

FROM node:24-slim AS deps
WORKDIR /srv
COPY package.json package-lock.json ./
COPY app/package.json app/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace app --include-workspace-root=false

FROM node:24-slim
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.0.0 /lambda-adapter /opt/extensions/lambda-adapter
WORKDIR /srv
ENV NODE_ENV=production
# The lockfile puts the API's dependencies in app/node_modules; copy both trees.
COPY --from=deps /srv/node_modules node_modules
COPY --from=build /srv/app/build app
COPY --from=deps /srv/app/node_modules app/node_modules
USER node
WORKDIR /srv/app
EXPOSE 8080
CMD ["node", "bin/server.js"]
