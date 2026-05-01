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

## Commands

- `deno task dev` - Start the dev server
- `deno task build` - Build the app for production
- `deno task preview` - Preview the production build locally

## Docs

- Rsbuild: https://rsbuild.rs/llms.txt
- Rspack: https://rspack.rs/llms.txt
