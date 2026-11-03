// شرح صفحات الدرس باستخدام Claude: يرسل الصفحات نفسها (PDF) فيقرأ حتى الكتب المصورة
import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-opus-5-5";

export const LESSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    explanation: { type: "string" },
    objectives: { type: "array", items: { type: "string" } },
    key_points: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
    activities: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
  },
  required: ["title", "explanation", "objectives", "key_points", "keywords", "activities", "questions"],
  additionalProperties: false,
};

export const SYSTEM_PROMPT = `أنت مساعد تربوي خبير يساعد المعلمين في إعداد خطط الدروس.
ستُعطى صفحات من كتاب مدرسي بصيغة PDF تمثل درس يوم واحد. اقرأ الصفحات بعناية واكتب باللغة العربية الفصحى المبسطة المناسبة لمستوى الصف المذكور:
- title: عنوان الدرس أو الموضوع كما يظهر في الصفحات.
- explanation: شرح واضح ومتسلسل لمحتوى الصفحات كأن المعلم يشرحه للطلاب (فقرتان إلى أربع فقرات)، مع أمثلة من الكتاب عند وجودها.
- objectives: أهداف تعليمية سلوكية قابلة للقياس (3-5)، تبدأ بـ "أن ...".
- key_points: أهم الأفكار والمفاهيم والقوانين في الصفحات.
- keywords: المصطلحات الجديدة.
- activities: أنشطة صفية أو استراتيجيات تدريس مقترحة (2-3).
- questions: أسئلة تقويم ختامية متنوعة (3-5).
اعتمد على محتوى الصفحات فقط ولا تخترع معلومات غير موجودة. إذا كانت الصفحات فهرساً أو غلافاً أو لا تحتوي درساً، فاذكر ذلك في الشرح باختصار.`;

export async function explainWithClaude({ apiKey, model, pdfBase64, startPage, endPage, subject, grade }) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 3 });
  const context = `المادة: ${subject || "غير محددة"} — الصف: ${grade || "غير محدد"} — الصفحات من ${startPage} إلى ${endPage}.`;

  const response = await client.beta.messages.create({
    model: model || DEFAULT_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: LESSON_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
        { type: "text", text: `${context}\nاكتب شرح وتلخيص هذه الصفحات.` },
      ],
    }],
  });

  if (response.stop_reason === "refusal") throw new Error("رفض النموذج معالجة هذه الصفحات.");
  if (response.stop_reason === "max_tokens") throw new Error("الرد أطول من المسموح؛ قلّل عدد صفحات الدرس.");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { ...JSON.parse(text), source: "ai" };
}

export function friendlyError(e) {
  if (e instanceof Anthropic.AuthenticationError) return "مفتاح Claude غير صحيح";
  if (e instanceof Anthropic.PermissionDeniedError) return "المفتاح لا يملك صلاحية";
  if (e instanceof Anthropic.RateLimitError) return "تجاوزت الحد المسموح، انتظر قليلاً ثم أعد المحاولة";
  if (e instanceof Anthropic.APIConnectionError) return "لا يوجد اتصال بالإنترنت";
  if (e instanceof Anthropic.APIError) return `خطأ من الخادم (${e.status ?? ""})`;
  return e?.message || String(e);
}
