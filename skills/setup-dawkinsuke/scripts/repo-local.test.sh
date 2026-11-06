#!/bin/sh
set -eu
cd "$(dirname "$0")"

expect() {
	got=$(sh repo-local.sh "$1" 2>/dev/null) || got="exit $?"
	[ "$got" = "$2" ] || { echo "FAIL: $1: got '$got', want '$2'" >&2; exit 1; }
}

expect git@github.com:ashigirl96/dawkinsuke-plugins.git github.com/ashigirl96/dawkinsuke-plugins
expect https://github.com/ashigirl96/dawkinsuke-plugins github.com/ashigirl96/dawkinsuke-plugins
expect https://github.com/ashigirl96/dawkinsuke-plugins.git/ github.com/ashigirl96/dawkinsuke-plugins
expect ssh://git@github.com:22/ashigirl96/dawkinsuke-plugins.git github.com/ashigirl96/dawkinsuke-plugins
expect https://user:token@gitlab.example.com:8443/group/sub/repo.git gitlab.example.com/group/sub/repo
expect https://github.com/only-owner "exit 1"
expect /srv/git/repo.git "exit 1"
echo ok
