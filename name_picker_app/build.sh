#!/usr/bin/env bash
# يبني ملف APK بدون Gradle باستخدام أدوات Android SDK مباشرة.
# الاستخدام: ANDROID_HOME=/path/to/sdk ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_HOME:?set ANDROID_HOME}"
BT="$ANDROID_HOME/build-tools/35.0.0"
JAR="$ANDROID_HOME/platforms/android-34/android.jar"
rm -rf build && mkdir -p build/classes build/dex

"$BT/aapt2" link -o build/unsigned.apk -I "$JAR" --manifest AndroidManifest.xml
javac --release 8 -classpath "$JAR" -d build/classes $(find src -name '*.java') 2>&1 | grep -v 'warning' || true
(cd build/classes && jar cf ../classes.jar .)
"$BT/d8" --min-api 21 --lib "$JAR" --output build/dex build/classes.jar
(cd build/dex && zip -q ../unsigned.apk classes.dex)
"$BT/zipalign" -f 4 build/unsigned.apk build/aligned.apk

KS=debug.keystore
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass android -keypass android \
  -alias namepicker -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=NamePicker"
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --ks-key-alias namepicker \
  --out NamePicker.apk build/aligned.apk
echo "Built: $(pwd)/NamePicker.apk"
