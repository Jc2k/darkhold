# Darkhold

Darkhold is a React frontend and Deno backend for Tandoor, packaged as a Home Assistant app. It's primary focus is around recipe (re)discovery, weekly meal planning and managing shopping.

## Development

Bootstrap the shared local and cloud-agent development environment from the repository root:

```bash
./setup.sh
cd darkhold
deno task dev
```

The app will be available at [http://localhost:3000](http://localhost:3000). See [DEVELOPMENT.md](DEVELOPMENT.md) for Codex cloud, GitHub Copilot coding agent, and troubleshooting guidance.

## Configuration

See [CONFIGURATION.md](CONFIGURATION.md) for Home Assistant add-on setup and application configuration. Recipe keyword conventions and meal assistant signals are documented in [docs/recipe-keywords.md](docs/recipe-keywords.md).
