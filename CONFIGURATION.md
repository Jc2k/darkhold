# Darkhold Configuration

Darkhold is a React SPA frontend for [Tandoor](https://tandoor.dev). It is designed to be run as a [Home Assistant add-on](https://www.home-assistant.io/addons/).

## Home Assistant Add-on Setup

### Prerequisites

1. The [Tandoor add-on](https://github.com/alexbelgium/hassio-addons) must be installed and running.
2. Both add-ons must be on the same Docker network (the default HA add-on network, `hassio`, satisfies this).

### Installation

Add this repository to your Home Assistant add-on store and install **Darkhold**.

### First Launch

1. Open the Darkhold web UI via the HA ingress link.
2. You will be redirected to the **Settings** page on first launch.
3. Generate a Tandoor API token:
   - Open Tandoor → User menu → API Token
   - Copy the token
4. Paste the token in the Darkhold Settings page and click **Save**.
5. Choose your preferred homepage (Dashboard, All Recipes, or Meal Plan).

## Proxy / CORS Configuration

Darkhold handles CORS by **proxying all Tandoor API requests through its own nginx server**. There is no need to configure CORS headers on Tandoor or on the Nginx Proxy Manager.

| Request path | Routed to |
|---|---|
| `/api/*` (inside Darkhold container) | `http://tandoor:8080/api/*` |
| All other paths | Served as the React SPA |

The internal hostname `tandoor` is the default Docker service name for the Tandoor add-on. If your Tandoor add-on uses a different name, update `darkhold/nginx.conf` accordingly.

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

Darkhold ships a PWA manifest (`public/manifest.json`) and the appropriate Apple meta tags. To use it as a standalone iOS app:

1. Open the Darkhold URL in Safari on iOS.
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

The Tandoor API token is stored in the browser's `localStorage`. This is appropriate for a personal-use home network app. Do not expose the Darkhold instance to the public internet without additional authentication (e.g. the HA authentication layer).
