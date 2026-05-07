# Recipes Configuration

Recipes is a React SPA frontend for [Tandoor](https://tandoor.dev). It is designed to be run as a [Home Assistant add-on](https://www.home-assistant.io/addons/).

## Home Assistant Add-on Setup

### Prerequisites

1. The [Tandoor add-on](https://github.com/alexbelgium/hassio-addons) must be installed and running.
2. Both add-ons must be on the same Docker network (the default HA add-on network, `hassio`, satisfies this).

### Installation

Add this repository to your Home Assistant add-on store and install **Recipes**.

### First Launch

1. Open the Recipes web UI via the HA ingress link.
2. You will be redirected to the **Settings** page on first launch (only when no default token is configured).
3. Generate a Tandoor API token:
   - Open Tandoor → User menu → API Token
   - Copy the token
4. Paste the token in the Recipes Settings page and click **Save**.
5. Choose your preferred homepage (Dashboard, All Recipes, or Meal Plan).

### Default (Read-Only) Token

For shared household use you can configure a **default token** in the add-on options.  When set, nginx injects that token into every API request that arrives without a personal token, so family members who haven't configured their own token can browse recipes without any setup.

```yaml
tandoor_default_token: "<your-read-only-api-token>"
```

Personal tokens (set on the Settings page) always take precedence, so the per-user write path still uses the correct token for attribution.  The default token itself is never sent to the browser; it lives only in the server-side nginx configuration.

## iCloud Calendar Feeds

You can display upcoming appointments alongside the meal plan by connecting one or more iCal calendar feeds. This is useful for seeing how scheduled events might affect meal choices.

```yaml
ical_feeds:
  - name: "Family calendar"
    url: "https://p123-caldav.icloud.com/published/2/Mx..."
  - name: "Work calendar"
    url: "https://..."
```

To find your iCloud calendar URL:
1. Open the Calendar app on macOS or at icloud.com.
2. Click the share icon next to the calendar you want.
3. Enable "Public Calendar" and copy the link.
4. Change the `webcal://` prefix to `https://`.

Events from all configured feeds appear in the meal plan view:
- **Desktop (table view)**: a new "Events" column shows event names and time ranges for each day.
- **Mobile (card view)**: events appear below the meal entries for each day in small muted text.

Times are displayed in the browser's local timezone. Recurring events (weekly standups, anniversaries, etc.) are fully supported. Historical event data is cached indefinitely; present and future events are refreshed every 15 minutes or when you pull-to-refresh.

> **Privacy note**: iCal feed URLs often contain authentication tokens. They are stored only in the Home Assistant add-on options and are never sent to the browser.

## Proxy / CORS Configuration

Recipes handles CORS by **proxying all Tandoor API requests through its own nginx server**. There is no need to configure CORS headers on Tandoor or on the Nginx Proxy Manager.

| Request path | Routed to |
|---|---|
| `/api/*` (inside Recipes container) | `<tandoor_url>/api/*` (defaults to `http://tandoor:8080/api/*`) |
| All other paths | Served as the React SPA |

The internal hostname `tandoor` and port `8080` are the defaults for the Tandoor add-on. If your Tandoor add-on uses a different hostname or port, set the **`tandoor_url`** option in the add-on configuration (e.g. `http://my-tandoor:8080`).

## Development Setup

```bash
# Clone the repo
git clone https://github.com/Jc2k/darkhold
cd darkhold

# Install dependencies
deno install

# Start the dev server (proxies /api/ to localhost:8080 by default)
deno task dev

# To proxy to a different Tandoor instance, set the TANDOOR_URL env variable:
TANDOOR_URL=http://my-tandoor-server:8080 deno task dev

# Production build
deno task build
```

## iOS "Add to Home Screen"

Recipes ships a PWA manifest (`public/manifest.json`) and the appropriate Apple meta tags. To use it as a standalone iOS app:

1. Open the Recipes URL in Safari on iOS.
2. Tap the **Share** button → **Add to Home Screen**.
3. The app will open full-screen without the Safari chrome.

## Architecture

- **Framework**: React 19 + TypeScript
- **Build tool**: Rsbuild (Rspack-based, fast rebuilds)
- **Styling**: React-Bootstrap + Bootstrap 5
- **Routing**: React Router v7
- **Data fetching**: TanStack Query v5 (caching, infinite scroll, mutations)
- **Drag & drop**: @dnd-kit (meal planner)
- **Auth**: API token stored in `localStorage`, injected as `Authorization: Token <token>` header

## API Token Security

The Tandoor API token is stored in the browser's `localStorage`. This is appropriate for a personal-use home network app. Do not expose the Recipes instance to the public internet without additional authentication (e.g. the HA authentication layer).
