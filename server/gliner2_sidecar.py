"""JSON-lines bridge from the Node server to the official local GLiNER 2 library."""

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

try:
    diagnostic(f"Loading GLiNER 2 model {MODEL_ID}; the first run may download model files.")
    extractor = GLiNER2.from_pretrained(MODEL_ID)
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
        "model": MODEL_ID,
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
