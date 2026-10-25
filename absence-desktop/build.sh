#!/usr/bin/env bash
# Builds dist/سجل-الغيابات.exe (Windows x64, single file) from the Android app's web assets.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf web dist && mkdir -p dist
cp -r ../absence-app/assets web
python3 - <<'PY'
from PIL import Image
im = Image.open('../absence-app/res/mipmap-xxxhdpi/ic_launcher.png').convert('RGBA')
im.save('app.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (192, 192)])
PY
"${RSRC:-$HOME/go/bin/rsrc}" -ico app.ico -arch amd64 -o rsrc_windows_amd64.syso
rm app.ico
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui" -o "dist/سجل-الغيابات.exe" .
go vet ./... && GOOS=windows go vet ./...
ls -la dist
