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

echo "[ikealive:gliner2] downloading and checking fastino/gliner2-base-v1"
GLINER2_MODEL="${GLINER2_MODEL:-fastino/gliner2-base-v1}" \
  "$VENV/bin/python" "$ROOT/server/gliner2_sidecar.py" --health

echo "[ikealive:gliner2] ready"
echo "IKEAlive will use $VENV/bin/python automatically."
