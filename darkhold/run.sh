#!/bin/sh
set -e

OPTIONS_FILE=/data/options.json

TANDOOR_EXTERNAL_URL=""
TANDOOR_DEFAULT_TOKEN=""
ICAL_FEEDS="[]"
WEATHER_LATITUDE=""
WEATHER_LONGITUDE=""
WEATHER_TIMEZONE="Europe/London"

if [ -f "$OPTIONS_FILE" ]; then
    TANDOOR_URL=$(jq -r '.tandoor_url // empty' "$OPTIONS_FILE")
    TANDOOR_EXTERNAL_URL=$(jq -r '.tandoor_external_url // empty' "$OPTIONS_FILE")
    TANDOOR_DEFAULT_TOKEN=$(jq -r '.tandoor_default_token // empty' "$OPTIONS_FILE")
    ICAL_FEEDS=$(jq -c '.ical_feeds // []' "$OPTIONS_FILE")
    WEATHER_LATITUDE=$(jq -r '.weather_latitude // empty' "$OPTIONS_FILE")
    WEATHER_LONGITUDE=$(jq -r '.weather_longitude // empty' "$OPTIONS_FILE")
    WEATHER_TIMEZONE=$(jq -r '.weather_timezone // "Europe/London"' "$OPTIONS_FILE")
fi

if [ -z "$TANDOOR_URL" ]; then
    TANDOOR_URL="http://tandoor:8080"
fi

export TANDOOR_URL
export TANDOOR_DEFAULT_TOKEN
export ICAL_FEEDS
export WEATHER_LATITUDE
export WEATHER_LONGITUDE
export WEATHER_TIMEZONE

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
deno run --cached-only --node-modules-dir=manual --allow-net --allow-read=/package.json --allow-env /server.ts &

exec nginx -g "daemon off;"
