#!/usr/bin/env bash
set -euo pipefail

readonly DENO_VERSION="${DENO_VERSION:-v2.2.14}"
readonly DENO_INSTALL="${DENO_INSTALL:-${HOME}/.local}"
readonly REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

export DENO_INSTALL
export PATH="${DENO_INSTALL}/bin:${PATH}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

append_bashrc_export() {
  local bashrc="${HOME}/.bashrc"
  local export_statement="$1"

  touch "${bashrc}"
  if ! grep -Fqx "${export_statement}" "${bashrc}"; then
    printf '\n# Added by Darkhold setup.sh for future task shells.\n%s\n' \
      "${export_statement}" >> "${bashrc}"
  fi
}

configure_deno_certificate() {
  if [[ -z "${DENO_CERT:-}" && -n "${CODEX_PROXY_CERT:-}" ]]; then
    export DENO_CERT="${CODEX_PROXY_CERT}"
  fi
}

persist_deno_environment() {
  append_bashrc_export "export PATH=\"${DENO_INSTALL}/bin:\${PATH}\""
  if [[ -n "${DENO_CERT:-}" ]]; then
    append_bashrc_export "export DENO_CERT=\"${DENO_CERT}\""
  fi
}

install_deno_archive() {
  local deno_archive
  local deno_target
  local url

  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) deno_target="x86_64-unknown-linux-gnu" ;;
    Linux-aarch64 | Linux-arm64) deno_target="aarch64-unknown-linux-gnu" ;;
    Darwin-x86_64) deno_target="x86_64-apple-darwin" ;;
    Darwin-arm64) deno_target="aarch64-apple-darwin" ;;
    *)
      printf 'Unsupported platform for Deno: %s-%s\n' "$(uname -s)" "$(uname -m)" >&2
      return 1
      ;;
  esac

  deno_archive="$(mktemp)"
  for url in \
    "https://dl.deno.land/release/${DENO_VERSION}/deno-${deno_target}.zip" \
    "https://github.com/denoland/deno/releases/download/${DENO_VERSION}/deno-${deno_target}.zip"; do
    if curl -fsSL "${url}" -o "${deno_archive}"; then
      mkdir -p "${DENO_INSTALL}/bin"
      unzip -p "${deno_archive}" deno > "${DENO_INSTALL}/bin/deno"
      chmod +x "${DENO_INSTALL}/bin/deno"
      rm -f "${deno_archive}"
      return 0
    fi
    printf 'Unable to download Deno from %s; trying the next source.\n' "${url}" >&2
  done

  rm -f "${deno_archive}"
  return 1
}

require_command node
require_command npm
configure_deno_certificate

if [[ "$(deno --version 2>/dev/null | head -n 1 || true)" != "deno ${DENO_VERSION#v}"* ]]; then
  require_command curl
  require_command unzip

  if ! install_deno_archive; then
    printf 'Archive downloads failed; trying the official npm package.\n' >&2
    npm install --global --prefix "${DENO_INSTALL}" "deno@${DENO_VERSION#v}"
  fi
fi

# GitHub Actions reads this file after the step finishes. Codex cloud runs task
# commands in shells created after setup, so persist the same path in .bashrc.
if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "${DENO_INSTALL}/bin" >> "${GITHUB_PATH}"
fi
persist_deno_environment

cd "${REPO_ROOT}/darkhold"
npm ci --legacy-peer-deps

# Codex tasks may run without network access after environment setup. Cache the
# Deno server's npm dependency metadata while setup still has network access.
deno cache --node-modules-dir=auto server/main.ts server.ts server.test.ts

printf 'Agent environment ready: %s; node %s; npm %s\n' \
  "$(deno --version | head -n 1)" \
  "$(node --version)" \
  "$(npm --version)"
