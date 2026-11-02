// تلخيص محلي بسيط (بدون إنترنت): يختار أهم الجمل والمصطلحات من نص الصفحات

const AR_STOP = new Set(`في من على إلى الى عن مع هذا هذه ذلك تلك التي الذي الذين هو هي هم هن أن إن ان كان كانت
يكون تكون ما لا لم لن قد ثم أو او و كل بعض عند بين حتى إذا اذا كما أي اي غير بل لكن نحن أنت انت أنا انا
وهو وهي وقد ولا وما فإن فان به بها له لها منه منها فيه فيها عليه عليها`.split(/\s+/));
const EN_STOP = new Set("the a an of to in and or is are was were be for on with as by that this it at from".split(" "));
const WORD = /[؀-ۿA-Za-z]{3,}/g;

function sentences(text) {
  const flat = text.replace(/\s+/g, " ");
  return flat.split(/(?<=[.!?؟:])\s+|\s(?=[•●▪◦]\s)/)
    .map((s) => s.replace(/^[\s•●▪◦-]+|[\s•●▪◦-]+$/g, ""))
    .filter((s) => s.length >= 25 && s.length <= 400);
}

export function localSummary(text, maxPoints = 6) {
  text = (text || "").replace(/ـ/g, "").trim();
  if (text.length < 40) {
    return {
      title: "", objectives: [], key_points: [], keywords: [], activities: [], questions: [], source: "local",
      explanation: "لم يتم العثور على نص قابل للقراءة في هذه الصفحات (قد يكون الكتاب صوراً ممسوحة ضوئياً). " +
        "أضف مفتاح Claude من الإعدادات ليتمكن التطبيق من قراءة الصفحات المصورة وشرحها.",
    };
  }
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const title = lines.find((l) => l.length >= 3 && l.length <= 80 && !/^\d+$/.test(l)) || "";
  const freq = new Map();
  for (const w of text.match(WORD) || []) {
    if (AR_STOP.has(w) || EN_STOP.has(w.toLowerCase())) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const scored = sentences(text).map((s, i) => {
    const toks = s.match(WORD) || [];
    const score = toks.reduce((a, t) => a + (freq.get(t) || 0), 0) / Math.pow(Math.max(toks.length, 1), 0.7);
    return { s, i, score };
  });
  const keyPoints = scored.sort((a, b) => b.score - a.score).slice(0, maxPoints).sort((a, b) => a.i - b.i).map((x) => x.s);
  const keywords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
  return {
    title,
    explanation: keyPoints.slice(0, 3).join(" ") || text.slice(0, 600),
    objectives: [], key_points: keyPoints, keywords, activities: [], questions: [], source: "local",
  };
}
