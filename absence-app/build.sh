#!/usr/bin/env bash
# Builds app-release.apk without Gradle: aapt2 -> javac -> d8 -> zipalign -> apksigner.
set -euo pipefail
cd "$(dirname "$0")"
SDK=${ANDROID_HOME:-/opt/android-sdk}
BT=$SDK/build-tools/35.0.0
JAR=$SDK/platforms/android-34/android.jar
VERSION_CODE=${VERSION_CODE:-1}
VERSION_NAME=${VERSION_NAME:-1.0}
rm -rf build && mkdir -p build/gen build/classes build/dex
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/app.unaligned.apk -I "$JAR" --manifest AndroidManifest.xml -A assets \
  --java build/gen --min-sdk-version 21 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" build/res.zip
javac -encoding UTF-8 --release 8 -classpath "$JAR" -d build/classes \
  $(find src build/gen -name '*.java') 2>&1 | grep -v '^warning\|^Note:\|warnings$' || true
"$BT/d8" --min-api 21 --lib "$JAR" --output build/dex $(find build/classes -name '*.class')
(cd build/dex && zip -q ../app.unaligned.apk classes.dex)
"$BT/zipalign" -p -f 4 build/app.unaligned.apk build/app.aligned.apk
if [ ! -f release.keystore ]; then
  keytool -genkeypair -keystore release.keystore -alias absence -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass absence123 -keypass absence123 -dname "CN=Absence Register, O=School, C=IQ" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks release.keystore --ks-pass pass:absence123 --key-pass pass:absence123 \
  --out app-release.apk build/app.aligned.apk
"$BT/apksigner" verify app-release.apk && ls -la app-release.apk
