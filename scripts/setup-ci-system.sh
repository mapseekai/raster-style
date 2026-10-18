#!/usr/bin/env bash
set -euo pipefail

test -f /.dockerenv
test "$(dpkg --print-architecture)" = amd64
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DEBIAN_FRONTEND=noninteractive

cat > /etc/apt/sources.list.d/ubuntu.sources <<'EOF'
Types: deb
URIs: https://snapshot.ubuntu.com/ubuntu/20261017T000000Z
Suites: noble noble-updates noble-security
Components: main universe
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
EOF
apt-get update --error-on=any
apt-get install --yes --no-install-recommends \
  build-essential ca-certificates curl git python3 rustup zstd

packages="$(mktemp)"
trap 'rm -f "$packages"' EXIT
dpkg-query -W -f='${binary:Package}=${Version}\n' | LC_ALL=C sort > "$packages"
diff -u "$root/.github/system-packages.lock" "$packages"
cat "$packages"
