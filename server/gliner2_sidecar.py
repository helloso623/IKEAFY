"""JSON-lines bridge from the Node server to Pioneer/Fastino GLiNER 2.

Pioneer API (`PIONEER_API_KEY` → GLiNER2.from_api) is the preferred path.
Local from_pretrained is an optional offline fallback and may contact Hugging Face.
"""

import importlib.metadata
import json
import os
import sys

MODEL_ID = os.environ.get("GLINER2_MODEL", "fastino/gliner2-base-v1")


def diagnostic(message):
    """Keep model/import progress on stderr; stdout is JSONL protocol only."""
    text = " ".join(str(message or "").split())[:500]
    if text:
        sys.stderr.write(text + "\n")
        sys.stderr.flush()


def pioneer_api_key():
    return (
        str(os.environ.get("PIONEER_API_KEY") or "").strip()
        or str(os.environ.get("GLINER2_API_KEY") or "").strip()
    )


def resolve_mode():
    """Prefer Pioneer cloud API; use local only when requested or no API key."""
    requested = str(os.environ.get("GLINER2_MODE") or "auto").strip().lower()
    if requested in {"api", "pioneer", "cloud"}:
        return "api"
    if requested in {"local", "pretrained", "hf"}:
        return "local"
    return "api" if pioneer_api_key() else "local"


try:
    from gliner2 import GLiNER2
except Exception as error:
    diagnostic(
        f"GLiNER 2 package import failed: {type(error).__name__}: {error}. "
        "Run `npm run setup:gliner2` from the project root."
    )
    raise SystemExit(78)

try:
    PACKAGE_VERSION = importlib.metadata.version("gliner2")
except importlib.metadata.PackageNotFoundError:
    PACKAGE_VERSION = "unknown"

MODE = resolve_mode()

try:
    if MODE == "api":
        if not pioneer_api_key():
            diagnostic(
                "Pioneer GLiNER 2 API mode requires PIONEER_API_KEY. "
                "Get a key at https://gliner.pioneer.ai or set GLINER2_MODE=local for offline weights."
            )
            raise SystemExit(70)
        diagnostic("Connecting to Pioneer GLiNER 2 API (no local Hugging Face download).")
        extractor = GLiNER2.from_api()
        runtime_model = "pioneer-api"
    else:
        diagnostic(
            f"Loading local GLiNER 2 model {MODEL_ID}; "
            "Pioneer API is preferred (set PIONEER_API_KEY). Local mode may download from Hugging Face."
        )
        extractor = GLiNER2.from_pretrained(MODEL_ID)
        runtime_model = MODEL_ID
except SystemExit:
    raise
except Exception as error:
    diagnostic(f"GLiNER 2 model startup failed: {type(error).__name__}: {error}")
    raise SystemExit(70)


def write_message(message):
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


write_message(
    {
        "type": "ready",
        "protocol": 1,
        "python": sys.executable,
        "packageVersion": PACKAGE_VERSION,
        "model": runtime_model,
        "mode": MODE,
        "provider": "pioneer" if MODE == "api" else "local",
    }
)

if "--health" in sys.argv:
    raise SystemExit(0)


def infer(request):
    operation = request.get("operation")
    text = str(request.get("text") or "")
    if operation == "extract_json":
        schema = request.get("schema")
        if not isinstance(schema, dict):
            raise ValueError("extract_json requires an object schema")
        return extractor.extract_json(text, schema)
    raise ValueError(f"Unsupported operation: {operation}")


for line in sys.stdin:
    request = None
    try:
        request = json.loads(line)
        if not isinstance(request, dict):
            raise ValueError("JSONL request must be an object")
        response = {"id": request.get("id"), "ok": True, "result": infer(request)}
    except Exception as error:  # Keep the process alive for later requests.
        response = {
            "id": request.get("id") if isinstance(request, dict) else None,
            "ok": False,
            "error": " ".join(f"{type(error).__name__}: {error}".split())[:500],
        }
    write_message(response)
