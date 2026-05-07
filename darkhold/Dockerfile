# Stage 1: Build the React SPA
# Use the build platform so deno runs natively (output is platform-independent)
FROM --platform=$BUILDPLATFORM denoland/deno:debian AS builder
WORKDIR /app
COPY package.json package-lock.json deno.json deno.lock* ./
RUN deno install
COPY . .
RUN deno task build
# Pre-cache server.ts npm dependencies (ical.js) into a dedicated directory so
# the final image can run the server without network access at startup.
RUN DENO_DIR=/deno-server-cache deno cache --no-config server.ts

# Stage 2: Pull the Deno binary for the target platform
FROM --platform=$TARGETPLATFORM denoland/deno:alpine AS deno-runtime
# Normalize the deno binary to a known path (location varies by architecture)
RUN cp "$(which deno)" /tmp/deno

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
# Copy package.json for the WebSocket server (reads version at startup)
COPY --from=builder /app/package.json /package.json
# Copy Deno binary (target-platform build) + its bundled glibc runtime, then
# wire up the glibc dynamic linker symlink for the target architecture.
# The deno:alpine image bundles glibc at /usr/local/lib/glibc/ and exposes the
# interpreter via a /lib64 (x86-64) or /lib (arm64) symlink; copy both so the
# binary resolves its loader inside the musl-based nginx:alpine final image.
COPY --from=deno-runtime /tmp/deno /usr/local/bin/deno
COPY --from=deno-runtime /usr/local/lib/glibc /usr/local/lib/glibc
RUN set -e; \
    ld=$(find /usr/local/lib/glibc/ -name 'ld-linux-*.so*' | head -1); \
    name=$(basename "$ld"); \
    case "$name" in \
      ld-linux-x86-64*) mkdir -p /lib64 && ln -sf "$ld" "/lib64/$name" ;; \
      *) mkdir -p /lib && ln -sf "$ld" "/lib/$name" ;; \
    esac
COPY server.ts /server.ts
# Use the pre-cached Deno module cache so ical.js is available without network at runtime
COPY --from=builder /deno-server-cache /deno-server-cache
ENV DENO_DIR=/deno-server-cache
EXPOSE 8099
CMD ["/run.sh"]
