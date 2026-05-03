#!/bin/sh
set -e

OPTIONS_FILE=/data/options.json

if [ -f "$OPTIONS_FILE" ]; then
    TANDOOR_URL=$(jq -r '.tandoor_url // empty' "$OPTIONS_FILE")
fi

if [ -z "$TANDOOR_URL" ]; then
    TANDOOR_URL="http://tandoor:8080"
fi

export TANDOOR_URL

envsubst '${TANDOOR_URL}' \
    < /etc/nginx/conf.d/darkhold.conf.template \
    > /etc/nginx/conf.d/darkhold.conf

# Start WebSocket broadcast server in background
deno run --allow-net --allow-read=/package.json /server.ts &

exec nginx -g "daemon off;"
