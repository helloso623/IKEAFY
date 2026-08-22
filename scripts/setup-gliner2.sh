#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="${GLINER2_VENV:-"$ROOT/.venv-gliner2"}"

python_works() {
  "$1" -c 'import sys; raise SystemExit(0 if (3, 11) <= sys.version_info[:2] < (3, 14) else 1)' >/dev/null 2>&1
}

pick_python() {
  if [[ -n "${GLINER2_BOOTSTRAP_PYTHON:-}" ]]; then
    if python_works "$GLINER2_BOOTSTRAP_PYTHON"; then
      printf '%s\n' "$GLINER2_BOOTSTRAP_PYTHON"
      return
    fi
    echo "GLINER2_BOOTSTRAP_PYTHON must point to Python 3.11, 3.12, or 3.13." >&2
    exit 2
  fi

  local candidate
  for candidate in python3.13 python3.12 python3.11 python3; do
    if command -v "$candidate" >/dev/null 2>&1 && python_works "$candidate"; then
      command -v "$candidate"
      return
    fi
  done
  echo "GLiNER 2 needs Python 3.11-3.13. Install one, or set GLINER2_BOOTSTRAP_PYTHON." >&2
  exit 2
}

PYTHON="$(pick_python)"
echo "[ikealive:gliner2] creating $VENV with $("$PYTHON" --version 2>&1)"
"$PYTHON" -m venv "$VENV"
"$VENV/bin/python" -m pip install --upgrade pip
"$VENV/bin/python" -m pip install -r "$ROOT/requirements-gliner2.txt"
# Refresh Mozilla CA bundle used by requests/urllib3 for Pioneer api.fastino.ai.
"$VENV/bin/python" -m pip install --upgrade certifi
CERTIFI_PATH="$("$VENV/bin/python" -m certifi)"
echo "[ikealive:gliner2] certifi CA bundle: $CERTIFI_PATH"
echo "[ikealive:gliner2] If Pioneer TLS fails with CERTIFICATE_VERIFY_FAILED, set SSL_CERT_FILE=$CERTIFI_PATH"
echo "[ikealive:gliner2] (and optionally REQUESTS_CA_BUNDLE to the same path), then restart IKEAlive."
echo "[ikealive:gliner2] Do not disable SSL verification."

echo "[ikealive:gliner2] checking GLiNER 2 sidecar"
if [[ -n "${PIONEER_API_KEY:-}${GLINER2_API_KEY:-}" ]]; then
  echo "[ikealive:gliner2] Pioneer API key detected — health check uses cloud API (no HF download)"
  GLINER2_MODE="${GLINER2_MODE:-auto}" \
    "$VENV/bin/python" "$ROOT/server/gliner2_sidecar.py" --health
else
  echo "[ikealive:gliner2] no PIONEER_API_KEY — optional local checkpoint fastino/gliner2-base-v1"
  echo "[ikealive:gliner2] Prefer setting PIONEER_API_KEY from https://gliner.pioneer.ai"
  GLINER2_MODEL="${GLINER2_MODEL:-fastino/gliner2-base-v1}" \
  GLINER2_MODE=local \
    "$VENV/bin/python" "$ROOT/server/gliner2_sidecar.py" --health
fi

echo "[ikealive:gliner2] ready"
echo "IKEAlive will use $VENV/bin/python automatically."
echo "Set PIONEER_API_KEY in .env for Pioneer-hosted GLiNER 2 (recommended)."
