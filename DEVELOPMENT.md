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

The default installation directory is `$HOME/.local/bin`, which is already on the standard Codex cloud path. If you override `DENO_INSTALL`, add `$DENO_INSTALL/bin` to your shell `PATH` before running the script and in future shells.

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
