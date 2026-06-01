# Development environment

Darkhold keeps its development bootstrap in one repository script so local developers, Codex cloud, and GitHub Copilot coding agent use the same dependency installation path.

## Quick start

From the repository root, run:

```bash
./setup.sh
cd darkhold
deno task dev
```

The setup script:

1. Installs the pinned Deno version into `${DENO_INSTALL:-$HOME/.local}` when it is not already available.
2. Tries the Deno CDN and GitHub release archive, then falls back to Deno's official npm package if direct binary downloads are restricted.
3. Installs frontend dependencies with `npm ci --legacy-peer-deps`.
4. Caches the Deno server dependency graph so cloud-agent tasks do not need network access after setup.

The default installation directory is `$HOME/.local/bin`. Because Codex cloud runs setup in a separate shell from the task agent, the script also adds the selected `$DENO_INSTALL/bin` directory to `~/.bashrc` so Deno remains available to later task shells. When Codex exposes its proxy CA through `$CODEX_PROXY_CERT`, the script maps that file to Deno's `$DENO_CERT` setting and persists it too, allowing Deno to fetch npm metadata through the cloud proxy. GitHub Actions receives the Deno binary path through `$GITHUB_PATH`. If you override `DENO_INSTALL` for an existing local shell, start a new Bash shell or source `~/.bashrc` before invoking Deno from that shell.

## Codex cloud

Codex cloud environments are configured in the Codex UI rather than through a repository workflow. Open the Darkhold environment's advanced configuration and set its setup script to:

```bash
./setup.sh
```

The setup phase must be able to reach the npm registry and at least one Deno binary source (`dl.deno.land` or `github.com`). The script pre-caches the dependencies required by the project, so task-time internet access is not required for normal builds and tests.

## GitHub Copilot coding agent

GitHub Copilot coding agent automatically runs [`.github/workflows/copilot-setup-steps.yml`](.github/workflows/copilot-setup-steps.yml). That workflow selects Node.js and invokes the same `./setup.sh` entrypoint used by Codex cloud and local development.

GitHub's hosted Copilot customization surface is its setup-steps workflow and runner selection. A GHCR development image would add another environment definition without being directly reusable as the standard hosted Codex or Copilot environment. If Darkhold later needs OS-level packages that are expensive to install on every task, a pre-provisioned self-hosted Copilot runner and a separately managed Codex environment are the appropriate next step.

## Checks

Run the required checks from the application directory:

```bash
cd darkhold
npm run format
npm run format:check
npm test
npx tsc --noEmit
deno task test
```

## Local API cache lifecycle

The frontend uses TanStack React Query as a stale-while-revalidate local API cache. Server-backed views should prefer reusable hooks from `darkhold/src/hooks/` so pages share query keys, cached values, and refresh behavior. Stale cached content remains renderable while active queries refresh in the background.

Mutations have two responsibilities after the server accepts a write:

1. Proactively update the affected local React Query cache entries (and any screen-local preview state) so mounted views re-render immediately.
2. Call `invalidateCacheQueries(queryClient, ...queryKeys)` from `darkhold/src/hooks/useCacheInvalidation.ts` for every affected resource. The helper marks local caches stale, starts background reconciliation for active queries, and broadcasts websocket invalidations so other connected browsers also treat matching caches as stale.

`darkhold/src/hooks/useInvalidationSocket.ts` treats every websocket connection as the end of a potentially blind period. It therefore invalidates all React Query caches on connect or reconnect. Active queries refresh immediately in the background; inactive caches remain usable but refresh when next mounted. Websocket messages are stale signals only: clients fetch authoritative content from the API rather than using websocket messages as data payloads.

See the repository-root `AGENTS.md` section **Local API caching and websocket invalidation** for mandatory guidance when adding AI-authored views or mutations.
