"""JSON-lines bridge from the Node server to the official local GLiNER 2 library."""

import json
import os
import sys

from gliner2 import GLiNER2


MODEL_ID = os.environ.get("GLINER2_MODEL", "fastino/gliner2-base-v1")
extractor = GLiNER2.from_pretrained(MODEL_ID)


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
        response = {"id": request.get("id"), "ok": True, "result": infer(request)}
    except Exception as error:  # Keep the process alive for later requests.
        response = {
            "id": request.get("id") if isinstance(request, dict) else None,
            "ok": False,
            "error": f"{type(error).__name__}: {error}",
        }
    sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
    sys.stdout.flush()
