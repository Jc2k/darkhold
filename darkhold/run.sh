#!/bin/sh
set -e

OPTIONS_FILE=/data/options.json

TANDOOR_EXTERNAL_URL=""

if [ -f "$OPTIONS_FILE" ]; then
    TANDOOR_URL=$(jq -r '.tandoor_url // empty' "$OPTIONS_FILE")
    TANDOOR_EXTERNAL_URL=$(jq -r '.tandoor_external_url // empty' "$OPTIONS_FILE")
fi

if [ -z "$TANDOOR_URL" ]; then
    TANDOOR_URL="http://tandoor:8080"
fi

export TANDOOR_URL

envsubst '${TANDOOR_URL}' \
    < /etc/nginx/conf.d/darkhold.conf.template \
    > /etc/nginx/conf.d/darkhold.conf

# Write runtime config for the frontend (omit key when URL is not configured)
jq -n --arg url "$TANDOOR_EXTERNAL_URL" \
    'if $url == "" then {} else {"tandoor_external_url": $url} end' \
    > /usr/share/nginx/html/app-config.json

# Start WebSocket broadcast server in background
deno run --allow-net --allow-read=/package.json /server.ts &

exec nginx -g "daemon off;"
