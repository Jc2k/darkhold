# Stage 1: Build the React SPA
# Use the build platform so deno runs natively (output is platform-independent)
FROM --platform=$BUILDPLATFORM denoland/deno:debian AS builder
WORKDIR /app
COPY package.json package-lock.json deno.json deno.lock* ./
RUN deno install
COPY . .
RUN deno task build

# Stage 2: Provide the correct glibc for the target platform.
# We pull deno:alpine for the TARGET so we can copy its pre-patched glibc libs
# into the final image without having to run anything under QEMU.
FROM --platform=$TARGETPLATFORM denoland/deno:alpine AS glibc-source

# Stage 3: Cross-compile the Deno server for the target platform, running natively.
# deno compile downloads the denort runtime for $TARGETPLATFORM from dl.deno.land
# and bundles the compiled application into it.  That denort binary is a standard
# glibc-linked release binary with no RPATH set, so we patch RPATH to point at
# /usr/local/lib/glibc (where the glibc-source stage keeps glibc) so it resolves
# its shared libraries inside the musl-based nginx:alpine final image.
FROM --platform=$BUILDPLATFORM denoland/deno:alpine AS deno-compiler
ARG TARGETPLATFORM
WORKDIR /app
COPY package.json deno.json deno.lock* ./
COPY server.ts ./
# Reuse the npm packages already downloaded in the builder stage.
COPY --from=builder /app/node_modules/ical.js /app/node_modules/ical.js
COPY --from=builder /app/node_modules/tsdav /app/node_modules/tsdav
# Compile server.ts into a standalone binary for the target platform, then
# patch its RPATH so it can find the glibc libraries at runtime.
RUN set -e; \
    case "$TARGETPLATFORM" in \
      linux/arm64) DENO_TARGET="aarch64-unknown-linux-gnu" ;; \
      *)           DENO_TARGET="x86_64-unknown-linux-gnu" ;; \
    esac; \
    deno compile \
      --no-config \
      --node-modules-dir=manual \
      --target "$DENO_TARGET" \
      --allow-net \
      --allow-read=/package.json \
      --allow-env=ICAL_FEEDS,WEATHER_LATITUDE,WEATHER_LONGITUDE,WEATHER_TIMEZONE \
      --output /app/server server.ts; \
    apk add --no-cache patchelf; \
    patchelf --set-rpath /usr/local/lib/glibc /app/server

# Stage 4: Serve with nginx
FROM nginx:1.27-alpine
# Install jq (JSON parser) and gettext (provides envsubst)
RUN apk add --no-cache jq gettext
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
# Copy the pre-compiled server binary and the glibc runtime it requires.
# The denort-derived binary is dynamically linked against glibc; the symlink
# below wires up the glibc dynamic-linker inside this musl-based image.
COPY --from=deno-compiler /app/server /server
COPY --from=glibc-source /usr/local/lib/glibc /usr/local/lib/glibc
RUN set -e; \
    ld=$(find /usr/local/lib/glibc/ -name 'ld-linux-*.so*' | head -1); \
    name=$(basename "$ld"); \
    case "$name" in \
      ld-linux-x86-64*) mkdir -p /lib64 && ln -sf "$ld" "/lib64/$name" ;; \
      *) mkdir -p /lib && ln -sf "$ld" "/lib/$name" ;; \
    esac
EXPOSE 8099
CMD ["/run.sh"]
