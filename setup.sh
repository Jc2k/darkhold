#!/usr/bin/env bash
set -euo pipefail

readonly DENO_VERSION="${DENO_VERSION:-v2.0.0}"
readonly DENO_INSTALL="${DENO_INSTALL:-${HOME}/.local}"
readonly REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

export DENO_INSTALL
export PATH="${DENO_INSTALL}/bin:${PATH}"

if [[ "$(deno --version 2>/dev/null | head -n 1 || true)" != "deno ${DENO_VERSION#v}" ]]; then
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) deno_target="x86_64-unknown-linux-gnu" ;;
    Linux-aarch64 | Linux-arm64) deno_target="aarch64-unknown-linux-gnu" ;;
    Darwin-x86_64) deno_target="x86_64-apple-darwin" ;;
    Darwin-arm64) deno_target="aarch64-apple-darwin" ;;
    *)
      printf 'Unsupported platform for Deno: %s-%s\n' "$(uname -s)" "$(uname -m)" >&2
      exit 1
      ;;
  esac

  deno_archive="$(mktemp)"
  trap 'rm -f "${deno_archive}"' EXIT
  curl -fsSL "https://github.com/denoland/deno/releases/download/${DENO_VERSION}/deno-${deno_target}.zip" \
    -o "${deno_archive}"
  mkdir -p "${DENO_INSTALL}/bin"
  unzip -p "${deno_archive}" deno > "${DENO_INSTALL}/bin/deno"
  chmod +x "${DENO_INSTALL}/bin/deno"
  rm -f "${deno_archive}"
  trap - EXIT
fi

# GitHub Actions reads this file after the step finishes. Codex and local shells
# get the same path immediately from the export above.
if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "${DENO_INSTALL}/bin" >> "${GITHUB_PATH}"
fi

cd "${REPO_ROOT}/darkhold"
npm ci --legacy-peer-deps
