"""
العقل + محاكي السوق.

العقل = شبكة عصبية صغيرة:
    المدخلات (حواس السوق + مركزه الحالي) → طبقة مخفية tanh → 3 مخرجات
    المخرج الأعلى هو القرار:  بيع (-1) / بدون صفقة (0) / شراء (+1)

الجينوم = كل أوزان الشبكة بمتجه واحد. التطور يغير هذا المتجه.
المحاكي يشغل مئات العقول بنفس الوقت (vectorized) عشان السرعة.
"""
import numpy as np

from . import config as C
from .features import N_FEATURES

F = N_FEATURES
H = C.HIDDEN
N_OUT = 3
GENOME_SIZE = F * H + H + H + H * N_OUT + N_OUT  # W1, w_pos, b1, W2, b2


def random_genomes(n: int, rng: np.random.Generator) -> np.ndarray:
    g = np.empty((n, GENOME_SIZE), dtype=np.float32)
    g[:, : F * H] = rng.normal(0, 1 / np.sqrt(F), (n, F * H))
    rest = GENOME_SIZE - F * H
    g[:, F * H:] = rng.normal(0, 0.5, (n, rest))
    return g


def unpack(genomes: np.ndarray):
    P = genomes.shape[0]
    i = 0
    W1 = genomes[:, i: i + F * H].reshape(P, F, H); i += F * H
    w_pos = genomes[:, i: i + H]; i += H
    b1 = genomes[:, i: i + H]; i += H
    W2 = genomes[:, i: i + H * N_OUT].reshape(P, H, N_OUT); i += H * N_OUT
    b2 = genomes[:, i: i + N_OUT]
    return W1, w_pos, b1, W2, b2


def decide(genomes: np.ndarray, x: np.ndarray, pos: np.ndarray) -> np.ndarray:
    """قرار لحظي (للتداول الحي): x=(F,) ، pos=(P,) → المركز الجديد (P,)"""
    W1, w_pos, b1, W2, b2 = unpack(genomes)
    hdn = np.tanh(np.einsum("f,pfh->ph", x, W1) + pos[:, None] * w_pos + b1)
    out = np.einsum("ph,pho->po", hdn, W2) + b2
    return out.argmax(axis=1) - 1


def simulate(genomes: np.ndarray, X: np.ndarray, ret: np.ndarray, cost_bps: float,
             death_level: float = C.DEATH_LEVEL, record: bool = False):
    """
    يخلي كل العقول تتداول نفس البيانات.

    X   : (T, F) المدخلات
    ret : (T,)  العائد اللوغاريتمي للشمعة الجاية
    يرجع dict فيه لكل عقل: log_return, max_dd, trades, exposure, alive
    """
    P = genomes.shape[0]
    T = X.shape[0]
    W1, w_pos, b1, W2, b2 = unpack(genomes)
    cost = cost_bps / 1e4

    # الجزء الثقيل (المدخلات × الأوزان) نحسبه مرة وحدة لكل الشموع
    pre = np.tensordot(X, W1, axes=([1], [1])) + b1[None]  # (T, P, H)

    pos = np.zeros(P, dtype=np.float32)
    log_eq = np.zeros(P)
    peak = np.zeros(P)
    max_dd = np.zeros(P)
    trades = np.zeros(P, dtype=np.int64)
    in_market = np.zeros(P, dtype=np.int64)
    alive = np.ones(P, dtype=bool)
    log_death = np.log(death_level)
    positions = np.zeros((T, P), dtype=np.int8) if record else None

    for t in range(T):
        hdn = np.tanh(pre[t] + pos[:, None] * w_pos)
        out = np.matmul(hdn[:, None, :], W2)[:, 0, :] + b2
        new_pos = (out.argmax(axis=1) - 1).astype(np.float32)
        new_pos[~alive] = 0.0

        changed = new_pos != pos
        trades += changed
        log_eq -= np.abs(new_pos - pos) * cost
        pos = new_pos

        # العائد الحقيقي للمركز: لوغاريتم (1 + مركز × عائد بسيط)
        log_eq += np.log1p(pos * np.expm1(ret[t]))
        in_market += pos != 0

        np.maximum(peak, log_eq, out=peak)
        np.maximum(max_dd, peak - log_eq, out=max_dd)
        died = alive & (log_eq < log_death)
        if died.any():
            alive &= ~died
            pos[died] = 0.0
        if record:
            positions[t] = pos

    res = {
        "log_return": log_eq,
        "max_dd": 1 - np.exp(-max_dd),
        "trades": trades,
        "exposure": in_market / max(T, 1),
        "alive": alive,
    }
    if record:
        res["positions"] = positions
    return res


def save(path: str, genome: np.ndarray, meta: dict):
    import json
    np.savez_compressed(path, genome=genome.astype(np.float32),
                        meta=np.array([json.dumps(meta, ensure_ascii=False, default=float)]))


def load(path: str):
    d = np.load(path, allow_pickle=False)
    import json
    return d["genome"], json.loads(str(d["meta"][0]))
