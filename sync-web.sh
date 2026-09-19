#!/bin/sh
# 把网页 App 同步进 APK 的 assets/www
# 用法: sh sync-web.sh [网页App目录]
SRC="${1:-$HOME/xkjd-learn}"
DST="$(cd "$(dirname "$0")" && pwd)/app/src/main/assets/www"
[ -d "$SRC" ] || { echo "找不到 $SRC"; exit 1; }
rm -rf "$DST"
mkdir -p "$DST"
cp -r "$SRC/index.html" "$SRC/css" "$SRC/js" "$SRC/data" "$DST/"
[ -f "$SRC/icon.svg" ] && cp "$SRC/icon.svg" "$DST/"
[ -f "$SRC/manifest.webmanifest" ] && cp "$SRC/manifest.webmanifest" "$DST/"
echo "已同步 -> $DST"
du -sh "$DST"
