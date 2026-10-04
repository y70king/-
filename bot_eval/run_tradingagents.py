"""Paper-test TradingAgents (multi-agent LLM desk) on gold for two weeks with a $30 / 0.01-lot account.

Needs ONE of these env vars set in the cloud environment settings (never paste keys in chat):
    DASHSCOPE_API_KEY  -> Qwen Cloud OpenAI-compatible endpoint, model deepseek-v4.1-flash
    DEEPSEEK_API_KEY   -> provider "deepseek"   (cheapest)
    ANTHROPIC_API_KEY  -> provider "anthropic"
    OPENAI_API_KEY     -> provider "openai"
Setup (new session):
    git clone --depth 1 https://github.com/TauricResearch/TradingAgents /home/user/eval/TradingAgents
    pip install -e /home/user/eval/TradingAgents pyarrow
    gold M15 data: the Aurum downloader (zero-was-here/tradingbot) `aurum data download --start 2026-08-01`
      writes data_store/xauusd_M15.parquet; pass its path with --m15.
Decision timing (no look-ahead): the desk decides with trade_date = previous trading day,
and the position is applied from the next M15 bar of the following day.
Buy/Overweight -> long, Sell/Underweight -> short, Hold -> keep the current position.
"""
import argparse, json, os, sys, pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
from harness import load, simulate, report

p = argparse.ArgumentParser()
p.add_argument("--start", default="2026-09-21"); p.add_argument("--end", default="2026-10-03")
p.add_argument("--ticker", default="GC=F")
p.add_argument("--m15", default="/home/user/eval/tradingbot/data_store/xauusd_M15.parquet")
p.add_argument("--out", default="ta_decisions.json")
a = p.parse_args()

if os.environ.get("DASHSCOPE_API_KEY"):
    os.environ.setdefault("OPENAI_COMPATIBLE_API_KEY", os.environ["DASHSCOPE_API_KEY"])
    os.environ.setdefault("TRADINGAGENTS_LLM_BACKEND_URL", "https://maas.qwencloudapi.com/compatible-mode/v1")
    os.environ.setdefault("TRADINGAGENTS_DEEP_THINK_LLM", "deepseek-v4.1-flash")
    os.environ.setdefault("TRADINGAGENTS_QUICK_THINK_LLM", "deepseek-v4.1-flash")
provider = next((pv for pv, env in [("openai_compatible", "DASHSCOPE_API_KEY"), ("deepseek", "DEEPSEEK_API_KEY"), ("anthropic", "ANTHROPIC_API_KEY"),
                                    ("openai", "OPENAI_API_KEY")] if os.environ.get(env)), None)
if provider is None:
    sys.exit("No DASHSCOPE_API_KEY / DEEPSEEK_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY in the environment.")
os.environ.setdefault("TRADINGAGENTS_LLM_PROVIDER", provider)

from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.graph.trading_graph import TradingAgentsGraph
ta = TradingAgentsGraph(debug=False, config=DEFAULT_CONFIG.copy())

m = load(a.m15)
days = sorted({d for d in m.loc[a.start:a.end].index.normalize() if d.weekday() < 5})
decisions = json.load(open(a.out)) if os.path.exists(a.out) else {}
for d in days:
    key = d.strftime("%Y-%m-%d")
    if key in decisions: continue
    prev = (d - pd.offsets.BDay(1)).strftime("%Y-%m-%d")
    _, rating = ta.propagate(a.ticker, prev)
    decisions[key] = str(rating); json.dump(decisions, open(a.out, "w"), indent=1)
    print(key, "<- decided on", prev, ":", rating, flush=True)

pos = {"buy": 1, "overweight": 1, "sell": -1, "underweight": -1}
state = {"p": 0}
def bot(i):
    r = decisions.get(m.index[i].strftime("%Y-%m-%d"), "").lower()
    if r in pos: state["p"] = pos[r]
    return ("target", state["p"])
o, daily = report(simulate(m, bot, a.start, a.end, "TradingAgents (" + provider + ")"))
print(pd.Series(o).to_string()); print(daily.to_string())
