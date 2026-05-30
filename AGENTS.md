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
