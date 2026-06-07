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

## Siri / HomePod Shopping List

You can say **"Hey Siri, add milk to the shopping list"** on a HomePod, iPhone, or any Apple device and have the item appear in Tandoor instantly.

### How it works

1. Siri passes the spoken item name to an Apple Shortcut installed on your iPhone.
2. The shortcut makes a `POST /add-to-shopping-list` request to the Darkhold add-on, including your Tandoor API token in the `Authorization` header.
3. Darkhold passes that token through to Tandoor's ingredient parser endpoint, then uses the parsed ingredient (food, amount, unit, note) to create the shopping list entry.

HomePod triggers shortcuts that are installed on an iPhone sharing the same Apple ID.

### Setting up the Apple Shortcut

First, generate a Tandoor token with write permissions at **Tandoor → User menu → API Token**.

1. Open the **Shortcuts** app on your iPhone (iOS 16+).
2. Tap **+** to create a new shortcut.
3. Name it **"Add to Shopping List"** (this becomes the Siri phrase).
4. Add the following actions in order:

   **Action 1 — Ask for Input**
   - Action type: *Ask for Input*
   - Input type: *Text*
   - Prompt: `What should I add to the shopping list?`
   - Store the result in a variable named **Item**

   **Action 2 — Get Contents of URL**
   - URL: `http://<YOUR_HA_IP>:8099/add-to-shopping-list`
     *(replace `<YOUR_HA_IP>` with your Home Assistant IP address, e.g. `192.168.1.10`)*
   - Method: `POST`
   - Headers:
     - `Authorization` → `Bearer <your-tandoor-api-token>`
     - `Content-Type` → `application/json`
   - Request Body: *JSON*  
     Key: `item` → Value: **Item** (the variable from Action 1)

   **Action 3 — Show Result** *(optional)*
   - Shows the JSON response from the server so you can confirm success.

5. Tap **Add to Siri** (or the ⓘ details screen → *Add to Siri*) and record the phrase **"add to shopping list"** so Siri recognises the shortcut by voice.

> **Tip**: You can also skip the "Ask for Input" action and instead use **Shortcut Input** as the item value. In that case, invoke the shortcut by saying *"Hey Siri, add apples to shopping list"* — iOS will pass *"apples"* as the shortcut input automatically.

### Using the shortcut with HomePod

Once the shortcut is installed on your iPhone and registered with Siri, say:

> **"Hey Siri, add milk to the shopping list"**

on any HomePod, iPhone, iPad, or Mac that shares your Apple ID.  HomePod will confirm the prompt, capture your item name, and the shortcut will silently add it to Tandoor.

### API reference

| Field | Value |
|---|---|
| **Endpoint** | `POST /add-to-shopping-list` |
| **Authentication** | `Authorization: Bearer <your-tandoor-api-token>` |
| **Request body** | `{ "item": "milk" }` |
| **Success response** | `200 { "success": true, "item": "milk" }` |
| **Error responses** | `400` bad request · `401` missing authorization · `502` Tandoor error (includes `details` with upstream or fallback error information) |

The endpoint passes the supplied token directly to Tandoor, so the shopping list entry is attributed to the owner of that token.  The endpoint submits the spoken text to Tandoor's ingredient parser (`/api/ingredient-parser/post/`) and then creates the shopping list entry from the returned parsed ingredient data.

## iCloud Calendar Feeds

You can display upcoming appointments alongside the meal plan by connecting one or more iCal calendar feeds. This is useful for seeing how scheduled events might affect meal choices.

```yaml
ical_feeds:
  - name: "Family"
    url: "https://p123-caldav.icloud.com/published/2/MTY..."
    type: "ics"
    category: "bank-holiday"
  - name: "Work"
    url: "https://..."
    type: "ics"
    category: "appointment"
  - name: "School reminders"
    url: "https://..."
    type: "ics"
    category: "context"
  - name: "iCloud private"
    url: "https://caldav.icloud.com/<dav-id>/calendars/<calendar-id>/"
    type: "caldav"
    category: "appointment"
    username: "your-apple-id@example.com"
    password: "your-app-specific-password"
```

Events from all configured feeds appear in the meal plan view:
- **Desktop (table view)**: a new "Events" column shows event names and time ranges for each day.
- **Mobile (card view)**: events appear below the meal entries for each day in small muted text.

Times are displayed in the browser's local timezone. Recurring events (weekly standups, anniversaries, etc.) are fully supported. Historical event data is cached indefinitely; present and future events are refreshed every 15 minutes or when you pull-to-refresh.

`type` is optional and defaults to `"ics"`. `username` and `password` are optional and only used for authenticated ICS or CalDAV feeds.

`category` is optional and defaults to appointment-like behavior when omitted. Supported values:
- `"appointment"`: affects busy-day logic in the meal planning assistant.
- `"bank-holiday"`: treated like weekend days by the meal planning assistant (good-weather and weekend lunch behavior).
- `"context"`: shown in the planner UI but ignored by busy-day and holiday logic.

> **Privacy note**: Feed credentials and feed URLs (which may contain authentication tokens) are stored only in Home Assistant add-on options and are never exposed to the browser.

## Recipe keywords and assistant signals

Darkhold uses Tandoor recipe keywords and one recipe-book shelf as meal planning signals. See [docs/recipe-keywords.md](docs/recipe-keywords.md) for the maintained human and agent reference, including the `dinner` parent keyword and its child dinner category keywords.

## Meal Assistant Special Dates

You can configure date-specific occasions in Home Assistant so the meal planning assistant prefers recipes tagged `special` on those dates and adds contextual messaging.

```yaml
meal_assistant_special_dates:
  - date: "2026-05-30"
    reason: "John's birthday"
  - date: "2026-12-25"
    reason: "Christmas Day"
```

On matching dates, the assistant uses a **Special day** flavour and context like:
`Picked a special meal for John's birthday.`

Special dates are matched by month/day and recur yearly. The year in `date` is ignored for matching.

## Meal Assistant Produce Repetition Penalty

The meal planning assistant can penalise recipes that feature a produce ingredient already used earlier in the same week — for example, to avoid scheduling aubergine dishes on multiple evenings in a row.

To enable this feature, set `meal_assistant_produce_category` to the exact name of the **Supermarket Category** in your Tandoor database that contains your fresh produce items (e.g. "Produce", "Fruit & Veg", or "Vegetables").

```yaml
meal_assistant_produce_category: "Produce"
```

When configured, the assistant fetches all food items from that category and uses their names to detect repetition within the week.  The first occurrence of any produce item is free; each additional occurrence carries an escalating score penalty so that diverse recipes are preferred.

> **Tip:** Check which supermarket category name you use in Tandoor by going to **Shopping** → **Supermarket** → **Categories**. The value you enter here must match exactly (case-insensitive).

If `meal_assistant_produce_category` is not set, no produce repetition penalty is applied.

### Finding your iCloud calendar URL

iCloud can be connected in two ways:
- **Public ICS feed**: enable Public Calendar and use the published URL (`type: "ics"`).
- **Private CalDAV with app-specific password**: use `type: "caldav"` with your Apple ID and an app-specific password.

#### Personal calendar (calendars you own)

1. Open the **Calendar** app on macOS.
2. In the sidebar, right-click (or Ctrl-click) the calendar you want to share.
3. Choose **Share Calendar…**
4. Enable **Public Calendar**. A link appears at the bottom of the dialog.
5. Click **Copy Link**.
6. Change the `webcal://` prefix to `https://`.

The URL will look like: `https://p123-caldav.icloud.com/published/2/MTY0OTU...`

On iOS: go to **Calendar** → tap **Calendars** at the bottom → tap the ⓘ button next to the calendar → **Share Calendar** → enable **Public Calendar** → **Share Link**.

> **Tip**: On macOS Ventura and later the dialog may be accessed via **File → Share Calendar** instead.

#### iCloud Family Sharing calendar

The shared "Family" calendar created by iCloud Family Sharing works exactly like a personal calendar above — it just appears in the iCloud section of Calendar.app labelled "Family". Any family member who co-owns that calendar can share it publicly using the same steps.

Note that anyone with the public URL will be able to read the events; only share it with people you trust, or ensure no sensitive information appears in the events.

#### Calendars shared with you

If someone has shared *their* iCloud calendar with you, the calendar appears in your Calendar.app (usually under **Other People's Calendars** in the sidebar).

- To get a feed URL you can configure here, the **owner** must have enabled "Public Calendar" on their calendar and sent you that link. You cannot generate a feed URL from the recipient's side — ask the owner for their `https://p…-caldav.icloud.com/published/…` link.
- If the calendar was shared via the iCloud private sharing mechanism (invitation by email) rather than the public URL, there is no iCal feed URL available without the owner enabling the public option.

#### iCloud private CalDAV setup (app-specific password)

1. Sign in at [appleid.apple.com](https://appleid.apple.com).
2. Under **Sign-In and Security** → **App-Specific Passwords**, create a new password for Darkhold.
3. In your add-on options, configure:
   - `type: "caldav"`
   - `url: "https://caldav.icloud.com/<dav-id>/calendars/<calendar-id>/"`
   - `username: "<your Apple ID email>"`
   - `password: "<your app-specific password>"`

Darkhold performs a CalDAV `REPORT` query over HTTPS and only fetches events for the requested date range.

#### Other calendar providers

Any provider is supported if either:
- it exposes an iCal/ICS URL (`type: "ics"`), or
- it provides CalDAV access with username/password (`type: "caldav"`).

| Provider | Where to find the URL |
|---|---|
| **Google Calendar** | Calendar settings → Integrate calendar → **Secret address in iCal format** |
| **Outlook.com** | Calendar → Share → **Publish a calendar** → ICS link |
| **Fastmail / ProtonMail** | Calendar settings → Subscriptions / Export → ICS |
| **Nextcloud** | Calendar app → Share icon → **Copy private link** |

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
