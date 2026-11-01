"""
إعدادات مشروع "تطوير العقول" (Neuroevolution) — كل شي قابل للتعديل هنا.
"""
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")          # بيانات الشموع (كاش، ما ترفع للريبو)
MODELS_DIR = os.path.join(ROOT, "models")      # العقول المحفوظة + نقطة الاستكمال
PAPER_STATE = os.path.join(ROOT, "paper_state.json")

# ------------------------------------------------------------------ البيانات
# الأسواق اللي نتدرب عليها. التدريب على أسواق كثيرة = العقل يتعلم "يفهم" بدل ما "يحفظ".
# scale = القسمة لتحويل السعر الخام من Dukascopy للسعر الحقيقي
# cost_bps = تكلفة (سبريد + عمولة) لكل تغيير مركز، بنقاط الأساس (1bp = 0.01%)
MARKETS = {
    "XAUUSD": {"scale": 1000,   "cost_bps": 1.5, "weight": 4.0},   # الذهب — السوق الأساسي
    "XAGUSD": {"scale": 1000,   "cost_bps": 3.0, "weight": 1.0},
    "EURUSD": {"scale": 100000, "cost_bps": 0.8, "weight": 1.0},
    "GBPUSD": {"scale": 100000, "cost_bps": 1.0, "weight": 1.0},
    "BTCUSD": {"scale": 10,     "cost_bps": 5.0, "weight": 1.0},
    "ETHUSD": {"scale": 10,     "cost_bps": 6.0, "weight": 1.0},
    "USA500IDXUSD": {"scale": 1000, "cost_bps": 1.0, "weight": 1.0},
}
TARGET_MARKET = "XAUUSD"
# مصدر البيانات: dukascopy (سنين من البيانات، بطيء شوي) أو yahoo (آخر 60 يوم فقط، سريع — للتجربة)
DATA_SOURCE = os.environ.get("BRAIN_DATA_SOURCE", "dukascopy")
YAHOO_SYMBOLS = {"XAUUSD": "GC=F", "XAGUSD": "SI=F", "EURUSD": "EURUSD=X", "GBPUSD": "GBPUSD=X",
                 "BTCUSD": "BTC-USD", "ETHUSD": "ETH-USD", "USA500IDXUSD": "ES=F"}
HISTORY_DAYS = 730          # كم يوم بيانات ننزل (سنتين)
BAR_MINUTES = 5             # فريم العقل: 5 دقائق

# تقسيم بيانات الذهب زمنياً (العقل ما يشوف التحقق والاختبار أبداً وقت التدريب)
#   [ ........ تدريب ........ | تحقق | اختبار نهائي ]
VALID_FRACTION = 0.15
TEST_FRACTION = 0.10

# ------------------------------------------------------------------ العقل
HIDDEN = 16                 # عدد الخلايا العصبية بالطبقة المخفية

# ------------------------------------------------------------------ التطور
POPULATION = 300            # عدد العقول بكل جيل
ELITE_FRACTION = 0.05       # أفضل 5% ينتقلون للجيل الجاي بدون تغيير
SURVIVE_FRACTION = 0.30     # أفضل 30% يعيشون ويتكاثرون، الباقي "يموت"
TOURNAMENT = 4
MUTATION_SIGMA = 0.08       # قوة الطفرة
MUTATION_RATE = 0.15        # نسبة الأوزان اللي تتغير بكل طفرة

WINDOWS_PER_GEN = 4         # كل جيل يتداول على 4 فترات عشوائية (أسواق مختلفة)
WINDOW_BARS = 2500          # طول كل فترة (~9 أيام تداول على 5 دقائق)
START_CAPITAL = 1000.0      # كل عقل يبدأ بألف دولار
DEATH_LEVEL = 0.6           # إذا نزل الرصيد تحت 60% من البداية → العقل يموت (يوقف تداول)

# إخفاء المعلومات (ضد الحفظ): نخفي نسبة من المدخلات عشوائياً ونضيف ضجيج
FEATURE_DROPOUT = 0.15
FEATURE_NOISE = 0.10

# ------------------------------------------------------------------ اختبار القرود
MONKEYS = 1000
MONKEY_PASS_PERCENTILE = 95.0   # لازم العقل يتفوق على 95% من القرود
VALIDATE_EVERY = 25             # كل كم جيل نختبر أفضل العقول على بيانات التحقق

# ------------------------------------------------------------------ التداول التجريبي
# True = العقل ما يبدأ تداول تجريبي إلا إذا نجح بالامتحان النهائي (python -m evolution.exam)
PAPER_REQUIRE_EXAM = True
