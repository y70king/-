// شرح صفحات الدرس عبر جيميناي من گوگل (مفتاح مجاني من موقع Google AI Studio)
import { LESSON_SCHEMA, SYSTEM_PROMPT } from "./ai.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/** يختار أحدث نموذج "فلاش" متاح لهذا المفتاح (سريع ومناسب للحد المجاني) */
export async function pickGeminiModel(apiKey) {
  const r = await fetch(`${BASE}/models?pageSize=200&key=${encodeURIComponent(apiKey)}`);
  if (!r.ok) throw new Error(geminiError(r.status));
  const { models = [] } = await r.json();
  const ok = models
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /^gemini-[\d.]+-flash$/.test(n) || /^gemini-[\d.]+-flash-latest$/.test(n) || n === "gemini-flash-latest");
  const ver = (n) => parseFloat((n.match(/gemini-([\d.]+)/) || [0, 0])[1]);
  ok.sort((a, b) => ver(b) - ver(a) || a.length - b.length);
  if (!ok.length) throw new Error("لم أجد نموذجاً مناسباً لهذا المفتاح");
  return ok[0];
}

function geminiError(status) {
  if (status === 400 || status === 401 || status === 403) return "مفتاح جيميناي غير صحيح أو غير مفعّل";
  if (status === 429) return "تجاوزت الحد المجاني اليومي لجيميناي، حاول لاحقاً";
  if (status >= 500) return "خادم جيميناي مشغول، حاول لاحقاً";
  return `خطأ من جيميناي (${status})`;
}

// جيميناي لا يقبل additionalProperties في المخطط
function toGeminiSchema(s) {
  const { additionalProperties, ...rest } = s;
  if (rest.properties) rest.properties = Object.fromEntries(Object.entries(rest.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
  if (rest.items) rest.items = toGeminiSchema(rest.items);
  return rest;
}

export async function explainWithGemini({ apiKey, model, pdfBase64, startPage, endPage, subject, grade }) {
  if (!model) model = await pickGeminiModel(apiKey);
  const context = `المادة: ${subject || "غير محددة"} — الصف: ${grade || "غير محدد"} — الصفحات من ${startPage} إلى ${endPage}.`;
  let r;
  try {
    r = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [
          { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
          { text: `${context}\nاكتب شرح وتلخيص هذه الصفحات.` },
        ] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: toGeminiSchema(LESSON_SCHEMA), maxOutputTokens: 16000 },
      }),
    });
  } catch {
    throw new Error("لا يوجد اتصال بالإنترنت");
  }
  if (!r.ok) throw new Error(geminiError(r.status));
  const data = await r.json();
  const cand = data.candidates?.[0];
  if (!cand) throw new Error("رفض جيميناي معالجة هذه الصفحات");
  if (cand.finishReason === "MAX_TOKENS") throw new Error("الرد أطول من المسموح؛ قلّل عدد صفحات الدرس");
  const text = (cand.content?.parts || []).map((p) => p.text || "").join("");
  return { ...JSON.parse(text), source: "gemini", model };
}
