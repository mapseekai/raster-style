#!/usr/bin/env python3
"""Compare TS, Go and Rust on identical requests, including generated round trips."""
from __future__ import annotations

import json
from pathlib import Path
import random
import subprocess

ROOT = Path(__file__).resolve().parent.parent


def load(name: str) -> list[dict] | dict[str, dict]:
    return json.loads((ROOT / "testdata" / f"{name}.json").read_text())


def run(command: list[str], requests: list[dict]) -> list[dict]:
    payload = "".join(json.dumps(request, ensure_ascii=False) + "\n" for request in requests)
    result = subprocess.run(command, cwd=ROOT, input=payload, text=True, capture_output=True, check=True, timeout=180)
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    if len(responses) != len(requests):
        raise AssertionError(f"{command}: wrong response count; {result.stderr}")
    return responses


def main() -> None:
    requests: list[dict] = []
    for fixture in load("roundtrip"):
        requests.append({"op": "encode", "json": json.dumps(fixture["raster_style"]), "name": fixture["name"]})
        requests.append({"op": "decode", "query": fixture["query"], "name": fixture["name"]})
    for fixture in load("invalid-styles"):
        requests.append({"op": "encode", **fixture})
    for fixture in load("invalid-queries"):
        requests.append({"op": "decode", **fixture})
    for fixture in load("rendering-vectors"):
        requests.append({"op": "encode", "json": json.dumps(fixture["style"]), "name": "rendering-" + fixture["name"]})
    for name, style in load("valid-styles").items():
        requests.append({"op": "encode", "json": json.dumps(style), "name": "valid-" + name})
    generator = random.Random(20260921)
    for index in range(200):
        channels = 3 if index % 2 else 1
        minimum = generator.uniform(-100000, 0)
        maximum = generator.uniform(1, 100000)
        style = {
            "version": "2.0",
            "renderer": {"bidx": [generator.randint(1, 65535) for _ in range(channels)], "type": "rgb" if channels == 3 else "gray"},
            "stretch": {"method": "linear", "rescale": [[minimum, maximum]]},
            "effects": {
                "color_formula": [{"op": "gamma", "channels": "rgb" if channels == 3 else "r", "value": generator.uniform(.1, 4)}],
                "post_color_formula": [{"op": "brightness", "value": generator.uniform(-1, 1)}],
            },
            "opacity": generator.random(),
            "image": {"format": "webp", "quality": generator.randint(1, 100), "lossless": False},
        }
        if index % 3 == 0:
            operations = [
                {"op": "gamma", "channels": generator.choice(["r", "g", "b", "rg", "rb", "gb", "rgb"]), "value": generator.uniform(.1, 4)},
                {"op": "sigmoidal", "contrast": generator.uniform(.1, 20), "midpoint": generator.uniform(.01, .99)},
                {"op": "saturation", "value": generator.uniform(0, 4)},
                {"op": "grayscale", "method": "luma"},
                {"op": "invert"},
            ]
            generator.shuffle(operations)
            style["effects"]["post_color_formula"] = operations
        requests.append({"op": "encode", "json": json.dumps(style), "name": f"generated-{index}"})
    commands = {
        "typescript": ["node", "packages/typescript/test/runner.mjs"],
        "go": [str(ROOT / ".build/go-conformance")],
        "rust": [str(ROOT / "target/debug/conformance")],
    }
    results = {name: run(command, requests) for name, command in commands.items()}
    baseline = results["typescript"]
    for name, values in results.items():
        for index, (expected, actual) in enumerate(zip(baseline, values)):
            if expected != actual:
                raise AssertionError(f"{name} differs on {requests[index]['name']}:\n{expected}\n{actual}")
            if "code" in requests[index] and actual != {"error": requests[index]["code"]}:
                raise AssertionError(f"Unexpected rejection for {requests[index]['name']}: {actual}")
            if "code" not in requests[index] and "error" in actual:
                raise AssertionError(f"Valid case rejected: {requests[index]['name']}: {actual}")
    successes = [value for value in baseline if "error" not in value]
    roundtrips = [{"op": "decode", "query": value["query"]} for value in successes]
    for name, command in commands.items():
        if run(command, roundtrips) != successes:
            raise AssertionError(f"{name}: cross-language round trip changed a document")
    report = {
        "implementations": list(commands),
        "initial_cases_per_implementation": len(requests),
        "roundtrips_per_implementation": len(roundtrips),
        "total_requests": 3 * (len(requests) + len(roundtrips)),
        "generated_styles": 200,
        "failed": 0,
    }
    (ROOT / ".build").mkdir(exist_ok=True)
    (ROOT / ".build/conformance-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
