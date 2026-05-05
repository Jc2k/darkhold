#!/bin/sh
set -e

OPTIONS_FILE=/data/options.json

TANDOOR_EXTERNAL_URL=""
TANDOOR_DEFAULT_TOKEN=""

if [ -f "$OPTIONS_FILE" ]; then
    TANDOOR_URL=$(jq -r '.tandoor_url // empty' "$OPTIONS_FILE")
    TANDOOR_EXTERNAL_URL=$(jq -r '.tandoor_external_url // empty' "$OPTIONS_FILE")
    TANDOOR_DEFAULT_TOKEN=$(jq -r '.tandoor_default_token // empty' "$OPTIONS_FILE")
fi

if [ -z "$TANDOOR_URL" ]; then
    TANDOOR_URL="http://tandoor:8080"
fi

export TANDOOR_URL
export TANDOOR_DEFAULT_TOKEN

envsubst '${TANDOOR_URL} ${TANDOOR_DEFAULT_TOKEN}' \
    < /etc/nginx/conf.d/darkhold.conf.template \
    > /etc/nginx/conf.d/darkhold.conf

# Write runtime config for the frontend.
# has_default_token tells the SPA it can skip the /settings redirect because
# nginx will inject the fallback token for unauthenticated requests.
jq -n \
    --arg url "$TANDOOR_EXTERNAL_URL" \
    --argjson has_default "$([ -n "$TANDOOR_DEFAULT_TOKEN" ] && echo 'true' || echo 'false')" \
    '{} |
     if $url != "" then . + {"tandoor_external_url": $url} else . end |
     if $has_default then . + {"has_default_token": true} else . end' \
    > /usr/share/nginx/html/app-config.json

# Start WebSocket broadcast server in background
deno run --allow-net --allow-read=/package.json /server.ts &

exec nginx -g "daemon off;"
