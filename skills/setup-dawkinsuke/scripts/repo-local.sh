#!/bin/sh
set -eu
url=${1:-$(git remote get-url origin)}
case $url in
*://*) path=$(printf '%s' "${url#*://}" | sed -e 's#^[^/]*@##' -e 's#^\([^/:]*\):[0-9]*/#\1/#') ;;
*@*:*) path=$(printf '%s' "${url#*@}" | sed 's#:#/#') ;;
*) exit 1 ;;
esac
path=$(printf '%s' "$path" | sed -e 's#/*$##' -e 's#\.git$##')
printf '%s' "$path" | grep -qE '^[^/]+/[^/]+(/[^/]+)+$' || exit 1
printf '%s\n' "$path"
