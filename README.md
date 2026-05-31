# Darkhold

Darkhold is a React frontend and Deno backend for a Home Assistant add-on that integrates with Tandoor.

## Development

Bootstrap the shared local and cloud-agent development environment from the repository root:

```bash
./setup.sh
cd darkhold
deno task dev
```

The app will be available at [http://localhost:3000](http://localhost:3000). See [DEVELOPMENT.md](DEVELOPMENT.md) for Codex cloud, GitHub Copilot coding agent, and troubleshooting guidance.

## Configuration

See [CONFIGURATION.md](CONFIGURATION.md) for Home Assistant add-on setup and application configuration.
