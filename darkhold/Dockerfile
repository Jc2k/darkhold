# Stage 1: Build the React SPA
# Use the build platform so deno runs natively (output is platform-independent)
FROM --platform=$BUILDPLATFORM denoland/deno:debian AS builder
WORKDIR /app
COPY package.json package-lock.json deno.json deno.lock* ./
RUN deno install
COPY . .
RUN deno task build

# Stage 2: Cross-compile the Deno server for the target platform, running natively.
# deno compile downloads the denort runtime for $TARGETPLATFORM from dl.deno.land
# and bundles the compiled application and dependencies into it.
FROM --platform=$BUILDPLATFORM denoland/deno:debian AS deno-compiler
ARG TARGETPLATFORM
WORKDIR /app
COPY server.ts ./
COPY server ./server
COPY src/api ./src/api
COPY src/utils ./src/utils
# Compile server/main.ts into a standalone binary for the target platform.
RUN set -e; \
    case "$TARGETPLATFORM" in \
      linux/arm64) DENO_TARGET="aarch64-unknown-linux-gnu" ;; \
      linux/amd64) DENO_TARGET="x86_64-unknown-linux-gnu" ;; \
      *) echo "Unsupported TARGETPLATFORM: $TARGETPLATFORM" >&2; exit 1 ;; \
    esac; \
    deno compile \
      --config server/deno.json \
      --node-modules-dir=auto \
      --target "$DENO_TARGET" \
      --allow-net \
      --allow-read=/package.json,/data \
      --allow-env \
      --allow-write=/data \
      --output /app/server server/main.ts

# Stage 3: Serve with nginx
FROM nginx:1.27-bookworm
# Install jq (JSON parser) and gettext-base (provides envsubst)
RUN apt-get update \
    && apt-get install -y --no-install-recommends jq gettext-base \
    && rm -rf /var/lib/apt/lists/*
# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf
# Add config template (TANDOOR_URL is substituted at container startup)
COPY nginx.conf /etc/nginx/conf.d/darkhold.conf.template
# Copy startup script
COPY run.sh /run.sh
RUN chmod +x /run.sh
# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html
# Copy package.json for the server (reads version at startup)
COPY --from=builder /app/package.json /package.json
# Copy the pre-compiled server binary.
COPY --from=deno-compiler /app/server /server
EXPOSE 8099
CMD ["/run.sh"]
