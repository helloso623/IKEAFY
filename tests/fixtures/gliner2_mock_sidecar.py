"""Offline mock GLiNER 2 sidecar for unit tests. Does not download models."""

from __future__ import annotations

import json
import os
import sys
import time


def write(message: dict) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


mode = os.environ.get("GLINER2_MOCK_MODE", "ready")

if mode == "hang":
    time.sleep(3600)
    raise SystemExit(1)

if mode == "import_fail":
    sys.stderr.write("GLiNER 2 package import failed: ModuleNotFoundError: No module named 'gliner2'\n")
    sys.stderr.flush()
    raise SystemExit(78)

if mode == "model_fail":
    sys.stderr.write("GLiNER 2 model startup failed: OSError: checkpoint missing\n")
    sys.stderr.flush()
    raise SystemExit(70)

write(
    {
        "type": "ready",
        "protocol": 1,
        "python": sys.executable,
        "packageVersion": "test-mock",
        "model": os.environ.get("GLINER2_MODEL", "fastino/gliner2-base-v1"),
    }
)

if "--health" in sys.argv:
    raise SystemExit(0)

for line in sys.stdin:
    request = None
    try:
        request = json.loads(line)
        if not isinstance(request, dict):
            raise ValueError("JSONL request must be an object")
        text = str(request.get("text") or "")
        if os.environ.get("GLINER2_MOCK_INFER") == "fail":
            raise RuntimeError("mock inference failed")
        if "Hang the rail" in text or "wall plugs" in text:
            result = {
                "assembly_guide": [{"title": "Wall shelf"}],
                "assembly_step": [
                    {
                        "sequence_number": "1",
                        "instruction": "Hang the rail with two wall plugs.",
                        "action": "place",
                        "parts": ["rail", "wall plugs"],
                        "tool": "screwdriver",
                        "warnings": ["Check the wall type"],
                    }
                ],
            }
        elif "tool" in text.lower() and "step" in text.lower():
            result = {
                "guide_question": [
                    {
                        "step_number": "1",
                        "requested_detail": "tool",
                        "mentioned_parts": [],
                        "problem": "",
                    }
                ]
            }
        else:
            result = {"assembly_guide": [], "assembly_step": []}
        write({"id": request.get("id"), "ok": True, "result": result})
    except Exception as error:  # Keep the process alive for later requests.
        write(
            {
                "id": request.get("id") if isinstance(request, dict) else None,
                "ok": False,
                "error": f"{type(error).__name__}: {error}",
            }
        )
