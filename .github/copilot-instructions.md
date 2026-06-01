# GitHub Copilot instructions

Use the repository-root `AGENTS.md` as the primary project guide.

Commit messages must follow Conventional Commits, except for the automatic `Initial plan` progress commit:

- Format: `<type>(<scope>): <description>`
- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`
- Keep the description lowercase, imperative, and without a trailing period
- For breaking changes, add `!` after the type or scope, or include a `BREAKING CHANGE:` footer
- Before committing, validate the message from the `darkhold/` directory with `echo "<message>" | npx commitlint`
