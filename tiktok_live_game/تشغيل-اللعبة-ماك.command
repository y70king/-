#!/bin/bash
# تشغيل لعبة ساحة البث على الماك (دبل كلك)
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js مو منصّب. نزّله من https://nodejs.org وبعدين شغّل هذا الملف مرة ثانية."
  open https://nodejs.org
  read -r -p "اضغط Enter للخروج"
  exit 1
fi
[ -d node_modules ] || npm install --no-audit --no-fund || { read -r -p "فشل التنصيب. اضغط Enter"; exit 1; }
node server.js --open
