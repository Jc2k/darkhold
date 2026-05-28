# Stage 1: Build the React SPA
# Use the build platform so deno runs natively (output is platform-independent)
FROM --platform=$BUILDPLATFORM denoland/deno:debian AS builder
WORKDIR /app
COPY package.json package-lock.json deno.json deno.lock* ./
RUN deno install
COPY . .
RUN deno task build

# Stage 2: Compile the Deno server for the target platform.
# Running deno compile here (potentially under QEMU for arm64) is intentional:
# the JIT compilation cost is paid once at build time so the compiled binary
# starts near-instantly at runtime, eliminating intermittent QEMU startup timeouts.
FROM --platform=$TARGETPLATFORM denoland/deno:alpine AS deno-runtime
WORKDIR /app
COPY package.json deno.json deno.lock* ./
COPY server.ts ./
# Reuse the npm packages already downloaded in the builder stage.
COPY --from=builder /app/node_modules/ical.js /app/node_modules/ical.js
COPY --from=builder /app/node_modules/tsdav /app/node_modules/tsdav
# Compile server.ts into a standalone binary for this target platform.
RUN deno compile \
    --no-config \
    --node-modules-dir=manual \
    --allow-net \
    --allow-read=/package.json \
    --allow-env=ICAL_FEEDS,WEATHER_LATITUDE,WEATHER_LONGITUDE,WEATHER_TIMEZONE \
    --output /server server.ts

# Stage 3: Serve with nginx
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
# The compiled binary is dynamically linked against glibc (same as the deno
# binary it is derived from), so we wire up the glibc dynamic-linker symlink
# inside this musl-based nginx:alpine image.
COPY --from=deno-runtime /server /server
COPY --from=deno-runtime /usr/local/lib/glibc /usr/local/lib/glibc
RUN set -e; \
    ld=$(find /usr/local/lib/glibc/ -name 'ld-linux-*.so*' | head -1); \
    name=$(basename "$ld"); \
    case "$name" in \
      ld-linux-x86-64*) mkdir -p /lib64 && ln -sf "$ld" "/lib64/$name" ;; \
      *) mkdir -p /lib && ln -sf "$ld" "/lib/$name" ;; \
    esac
EXPOSE 8099
CMD ["/run.sh"]
