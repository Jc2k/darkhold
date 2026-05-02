# Stage 1: Build the React SPA
# Use the build platform so deno runs natively (output is platform-independent)
FROM --platform=$BUILDPLATFORM denoland/deno:alpine AS builder
WORKDIR /app
COPY package.json package-lock.json deno.json deno.lock* ./
RUN deno install
COPY . .
RUN deno task build

# Stage 2: Pull the Deno binary for the target platform
FROM --platform=$TARGETPLATFORM denoland/deno:alpine AS deno-runtime

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
# Copy Deno binary (target-platform build) and WebSocket server
COPY --from=deno-runtime /usr/bin/deno /usr/local/bin/deno
COPY server.ts /server.ts
EXPOSE 8099
CMD ["/run.sh"]
