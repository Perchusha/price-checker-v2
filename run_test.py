import subprocess, json, sys

inp = json.dumps({"urls": [{"url": "https://mtcg.pl/pokemon/pitch-black/booster-box", "store": "mtcg.pl", "is_search": False}]})
result = subprocess.run(
    [sys.executable, "public/scraper/scraper.py"],
    input=inp.encode("utf-8"),
    capture_output=True,
    cwd="d:/Projects/price-checker-v2",
)
print("STDOUT:", result.stdout.decode("utf-8", errors="replace"))
print("STDERR:", result.stderr.decode("utf-8", errors="replace"))
