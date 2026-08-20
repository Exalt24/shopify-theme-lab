"""Read the Lighthouse report and pull out only what is defensible to quote.

A performance score on its own is worth nothing in an application: it moves run to
run and a stranger cannot check it. The quotable facts are the individual metric
values and the top opportunities with their byte or millisecond savings, because
those are reproducible and specific.
"""
import io
import json

d = json.load(io.open(
    r"C:\Users\Dax\AppData\Local\Temp\claude\C--Projects-Professional"
    r"\0e853b52-1086-4101-b173-25d4e2492560\scratchpad\mse-lh.json",
    encoding="utf-8"))

print("url  :", d.get("finalDisplayedUrl") or d.get("finalUrl"))
print("form :", (d.get("configSettings") or {}).get("formFactor"))
cats = d.get("categories") or {}
perf = (cats.get("performance") or {}).get("score")
print("performance score:", None if perf is None else round(perf * 100))
print()

audits = d.get("audits") or {}
for key, label in [
    ("largest-contentful-paint", "LCP"),
    ("first-contentful-paint", "FCP"),
    ("cumulative-layout-shift", "CLS"),
    ("total-blocking-time", "TBT (an INP proxy in a lab run)"),
    ("speed-index", "Speed Index"),
    ("interactive", "Time to Interactive"),
]:
    a = audits.get(key) or {}
    print("%-34s %s" % (label, a.get("displayValue") or a.get("numericValue")))

print("\nTOP OPPORTUNITIES (savings as Lighthouse reports them):")
rows = []
for key, a in audits.items():
    det = a.get("details") or {}
    if det.get("type") not in ("opportunity", "table"):
        continue
    ms = (det.get("overallSavingsMs") or 0)
    by = (det.get("overallSavingsBytes") or 0)
    if ms or by:
        rows.append((ms, by, a.get("title", key)))
rows.sort(reverse=True)
for ms, by, title in rows[:10]:
    print("  %7.0f ms  %9.0f KB  %s" % (ms, by / 1024, title[:66]))

print("\nRESOURCE WEIGHT:")
summary = ((audits.get("resource-summary") or {}).get("details") or {}).get("items") or []
for item in summary:
    print("  %-14s %3s requests  %8.0f KB"
          % (item.get("label"), item.get("requestCount"), item.get("transferSize", 0) / 1024))

third = ((audits.get("third-party-summary") or {}).get("details") or {}).get("items") or []
if third:
    print("\nTHIRD PARTY, worst blocking offenders:")
    for item in sorted(third, key=lambda i: -(i.get("blockingTime") or 0))[:6]:
        ent = item.get("entity")
        name = ent.get("text") if isinstance(ent, dict) else ent
        print("  %-30s %6.0f ms blocking  %7.0f KB"
              % (str(name)[:30], item.get("blockingTime") or 0,
                 (item.get("transferSize") or 0) / 1024))
