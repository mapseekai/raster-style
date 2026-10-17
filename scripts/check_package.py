#!/usr/bin/env python3
"""Verify the Rust release archive and run its tests outside the workspace."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent.parent
REPORT = ROOT / ".build/package-validation-report.json"


def main() -> None:
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.unlink(missing_ok=True)
    manifest = ROOT / "crates/raster-style/Cargo.toml"
    metadata = json.loads(subprocess.check_output(
        ["cargo", "metadata", "--format-version=1", "--no-deps", "--locked"], cwd=ROOT, text=True,
    ))
    package = next(item for item in metadata["packages"] if item["name"] == "raster-style")
    name = f"{package['name']}-{package['version']}"
    target = Path(metadata["target_directory"])
    subprocess.run([
        "cargo", "package", "--manifest-path", str(manifest), "--allow-dirty", "--locked", "--offline",
    ], cwd=ROOT, check=True)
    archive = target / "package" / f"{name}.crate"

    # The extracted package cannot reach the workspace's testdata directory.
    with tempfile.TemporaryDirectory(prefix="raster-style-package-") as directory:
        destination = Path(directory)
        with tarfile.open(archive, "r:gz") as bundle:
            members = bundle.getmembers()
            for member in members:
                path = (destination / member.name).resolve()
                if not path.is_relative_to(destination.resolve()):
                    raise ValueError(f"Archive path escapes destination: {member.name}")
                if not (member.isfile() or member.isdir()):
                    raise ValueError(f"Unsupported archive member: {member.name}")
            bundle.extractall(destination, members=members)
        extracted = destination / name
        fixtures = sorted((extracted / "tests/data").glob("*.json"))
        if not fixtures:
            raise AssertionError("Release archive does not contain shared test fixtures")
        for fixture in fixtures:
            if fixture.read_bytes() != (ROOT / "testdata" / fixture.name).read_bytes():
                raise AssertionError(f"Packaged fixture differs from its source: {fixture.name}")
        # Crate entries have normalized mtimes; an old target can reuse stale test binaries.
        environment = {**os.environ, "CARGO_TARGET_DIR": str(destination / "target")}
        for scope in ["--all-targets", "--doc"]:
            subprocess.run([
                "cargo", "test", scope, "--locked", "--offline",
                "--manifest-path", str(extracted / "Cargo.toml"),
            ], cwd=extracted, env=environment, check=True)

    result = {
        "package": name,
        "package_build_passed": True,
        "isolated_package_tests_passed": True,
        "fresh_target_directory": True,
        "packaged_fixtures": len(fixtures),
        "fixtures_match_shared_source": True,
    }
    REPORT.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
