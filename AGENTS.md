# AGENTS.md

You are an expert in JavaScript, Deno, Rsbuild, and web application development. You write maintainable, performant, and accessible code.

## Commit Messages

All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification, as enforced by `@commitlint/config-conventional`.

Format: `<type>(<scope>): <description>`

- **type** (required): one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, or `revert`
- **scope** (optional): a short noun describing the area of the codebase (e.g. `auth`, `ui`, `api`)
- **description** (required): imperative, present-tense summary in lowercase, no trailing period

Examples:
- `feat(ui): add dark mode toggle`
- `fix(api): handle null response from server`
- `chore: update dependencies`
- `docs: add setup instructions to README`

Breaking changes must include `BREAKING CHANGE:` in the commit footer, or append `!` after the type/scope (e.g. `feat!: remove legacy endpoint`).

**Exception:** Commit messages that start with `Initial plan` are exempt from conventional-commits validation. These are generated automatically by the Copilot coding agent at the start of a task.

## Agent Environment Setup

Run `./setup.sh` from the repository root before running tests when dependencies are not already installed. This is the shared setup entrypoint for Codex and GitHub Copilot. Keep environment setup changes in this script so both coding-agent environments stay in sync.

## Testing

Tests are co-located next to source files as `*.test.ts` or `*.test.tsx` files.

- **Run all frontend tests**: `npm test` (inside the `darkhold/` directory) — runs vitest against `src/**/*.test.{ts,tsx}`
- **Run server tests**: `deno task test` (inside the `darkhold/` directory)
- **Test framework**: [vitest](https://vitest.dev/) with jsdom environment; use `describe`, `it`, `expect`, and `vi` from `vitest`

**When to write tests:**
- Any new utility function or module in `src/utils/` **must** include a co-located test file covering all exported functions.
- Any new standalone logic in `src/api/` (e.g. helper functions) **must** be tested.
- New React hooks that contain pure logic (e.g. derived state, localStorage reads) **should** be tested where practical.
- Components and pages do not require tests unless they contain non-trivial logic not captured elsewhere.

**Test style guidelines:**
- Mock `fetch` using `vi.stubGlobal('fetch', vi.fn())` and restore with `vi.unstubAllGlobals()` in `afterEach`.
- Use `localStorage` directly in tests — jsdom provides a working implementation.
- Keep tests fast and side-effect-free; avoid starting real servers or making real HTTP requests.

## Pre-Commit Checks

Before every `git commit`, always run **all** of the following from the `darkhold/` directory and fix any failures:

1. `npm run format` — apply Prettier formatting
2. `npm run format:check` — verify formatting is clean
3. `npm test` — frontend unit tests (vitest)
4. `npx tsc --noEmit` — TypeScript type checking
5. `deno task test` — server unit tests
6. `echo "<your commit message>" | npx commitlint` — validate the commit message against Conventional Commits rules (run from the `darkhold/` directory)

Do not commit if any of these fail. **Skipping the commitlint check will cause semantic-release to produce broken or missing releases.**

### Commit message checklist (verify before every commit)

- [ ] Starts with an allowed type: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, or `revert`
- [ ] Follows the format `<type>(<optional scope>): <description>`
- [ ] Description is lowercase, imperative, and has no trailing period
- [ ] Breaking changes include `BREAKING CHANGE:` in the footer or `!` after the type/scope
- [ ] `echo "<message>" | npx commitlint` exits with code 0

## Commands

- `deno task dev` - Start the dev server
- `deno task build` - Build the app for production
- `deno task preview` - Preview the production build locally

## Docs

- Rsbuild: https://rsbuild.rs/llms.txt
- Rspack: https://rspack.rs/llms.txt

## Responsive Design

- Prefer CSS media queries as the default approach for responsive behavior.
- Avoid JavaScript viewport logic for layout switching unless media queries cannot solve the requirement.

## Mobile Form Controls

- Keep the viewport scalable for accessibility. Do not disable user zoom with `user-scalable=no` or a restrictive `maximum-scale` viewport value.
- iOS Safari automatically zooms a focused editable control when its computed text size is below `16px`. Preserve the app-wide coarse-pointer rule in `darkhold/src/App.css` that keeps `input`, `textarea`, and `select` controls at or above that threshold on touch devices.
- Apply focus-zoom prevention globally rather than patching an individual page or component. This includes controls rendered by third-party components such as typeaheads.

## Local API caching and websocket invalidation

Darkhold uses TanStack React Query as its local API cache and a websocket as a cross-client stale-cache signal. New AI-authored views and mutations **must** preserve these behaviors without needing additional prompting:

- Prefer reusable hooks in `darkhold/src/hooks/` for view fetching. When a resource already has a hook or query-options factory, reuse it instead of declaring an ad hoc `useQuery` in a page. Add a reusable hook for new server-backed views where practical.
- Render cached data while React Query refreshes it in the background. Do not clear usable cached content merely because a query is stale or fetching. Use loading UI only when no cached data exists.
- Proactively update the local React Query cache after every successful mutation so mounted views re-render immediately. For optimistic updates, snapshot and restore previous cache data if the request fails. If a screen has additional local preview state, update that too.
- After applying the local cache update, call `invalidateCacheQueries(queryClient, ...queryKeys)` from `darkhold/src/hooks/useCacheInvalidation.ts`. This marks matching local caches stale, triggers background reconciliation for active queries, and broadcasts each invalidation over the websocket so other clients mark their caches stale too.
- Include every affected resource key, not only the resource directly written. For example, meal-plan mutations also affect shopping-list data and the meal-plan redirect-week calculation.
- Keep `useInvalidationSocket()` mounted in the app layout. A websocket connection or reconnection follows a potentially blind period, so it deliberately invalidates all queries: active queries refresh in the background and inactive cached queries refresh when next mounted.
- Treat websocket invalidation messages as stale signals, not as payload transport. The initiating client owns its proactive cache write; peers reconcile from the API after receiving the broadcast.
- Rare idempotent get-or-create queries may need to broadcast with `broadcastInvalidation()` directly after their accepted response instead of invalidating their own currently active query, to avoid a refetch loop. Document the reason inline when using this exception.

Useful implementation points:

- `darkhold/src/hooks/useCacheInvalidation.ts` — standard local invalidation plus websocket broadcast helper for successful mutations.
- `darkhold/src/hooks/useInvalidationSocket.ts` — shared websocket lifecycle, cross-client invalidation handling, and reconnect-wide stale marking.
- `darkhold/src/hooks/useShoppingListEntries.ts`, `darkhold/src/hooks/useMealPlan.ts`, and `darkhold/src/hooks/useUpSoon.ts` — examples of reusable cached fetch hooks and mutation cache updates.
- `darkhold/src/utils/mealPlanCache.ts` — example of updating all cached variants of a ranged resource after mutation.

## UI design system

- Prefer React Bootstrap components and `react-bootstrap-icons` over hand-written SVG paths, Unicode symbols, or emoji for interface controls and navigation. Emoji are acceptable only as decorative content where their platform-dependent appearance is intentional.
- Use Bootstrap theme variables (`--bs-*`) for interface colors so surfaces, borders, text, and placeholders stay coherent. Avoid hard-coded hex values unless representing data or a documented brand color.
- Keep mobile primary navigation labels visible. Icons supplement text; they do not replace it for app-level destinations.
- Make touch targets at least `44px` high and wide where practical. Shared app chrome belongs in `darkhold/src/App.css`; do not accumulate one-off inline sizes for repeated controls.
- Preserve a visible keyboard focus state for custom interactive elements. Use semantic Bootstrap controls where possible and provide accessible names for icon-only controls.
- Prefer CSS media queries for responsive layout. Account for safe-area insets in fixed mobile chrome and ensure page padding clears fixed navigation.
- Reuse shared CSS classes for repeated UI patterns such as image placeholders, navigation tabs, and icon buttons. Prefer Bootstrap spacing utilities for one-off spacing.
