#!/usr/bin/env python3
"""One reproducible quality gate for the entire multi-language workspace."""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent.parent
GO = ROOT / "packages/go"


def main() -> None:
    (ROOT / ".build").mkdir(exist_ok=True)
    commands = [
        (["pnpm", "check:generated"], ROOT),
        (["pnpm", "format:check"], ROOT),
        (["pnpm", "test"], ROOT),
        ([sys.executable, "scripts/rendering_reference.py"], ROOT),
        ([sys.executable, "scripts/rendering_reference_test.py"], ROOT),
        (["go", "mod", "verify"], GO),
        (["go", "vet", "./..."], GO),
        (["go", "test", "-race", "-count=1", "./..."], GO),
        (["cargo", "fmt", "--all", "--", "--check"], ROOT),
        (["cargo", "clippy", "--all-targets", "--locked", "--", "-D", "warnings"], ROOT),
        (["cargo", "test", "--all-targets", "--locked"], ROOT),
        (["go", "build", "-o", str(ROOT / ".build/go-conformance"), "./cmd/conformance"], GO),
        (["cargo", "build", "--locked", "--bin", "conformance"], ROOT),
        ([sys.executable, "scripts/conformance.py"], ROOT),
    ]
    unformatted = subprocess.check_output(["gofmt", "-l", "."], cwd=GO, text=True).strip()
    if unformatted:
        raise RuntimeError("Go files require gofmt:\n" + unformatted)
    results = []
    for command, cwd in commands:
        print("\n>>> " + " ".join(command), flush=True)
        start = time.monotonic()
        subprocess.run(command, cwd=cwd, check=True)
        results.append({"command": command, "passed": True, "seconds": round(time.monotonic() - start, 3)})
    report = {"passed": len(results), "failed": 0, "checks": results}
    (ROOT / ".build/validation-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print("\nAll workspace checks passed.")


if __name__ == "__main__":
    main()
