#!/usr/bin/env python3
"""Price scraper using Camoufox for anti-detection browser automation.

Reads JSON from stdin: {"urls": [{"url": "...", "store": "...", "is_search": bool}]}
Writes JSON to stdout: {"results": [{"price": float, "url": "...", "store": "..."}]}
"""

import sys
import io
import json
import asyncio
import re
from typing import Optional

# Force UTF-8 I/O on Windows
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)

# Non-breaking space variants common in Polish price strings
_NBSP = "   "


def log(msg: str) -> None:
    print(f"[scraper] {msg}", file=sys.stderr, flush=True)


def extract_price_from_text(text: str) -> Optional[float]:
    """Extract a PLN price value from a text string."""
    # Normalise all whitespace variants to regular space
    text = re.sub(r"[   \s]+", " ", text).strip()
    # Polish format: 1 299,99 or 1299,99 or 1299.99
    match = re.search(r"(\d[\d ]*[\.,]\d{2})", text)
    if match:
        raw = match.group(1).replace(" ", "").replace(",", ".")
        try:
            price = float(raw)
            if 1.0 <= price <= 100_000.0:
                return price
        except ValueError:
            pass
    # Integer-only price (e.g. "299 zł")
    match = re.search(r"\b(\d{2,6})\b", text)
    if match:
        try:
            price = float(match.group(1))
            if 5.0 <= price <= 100_000.0:
                return price
        except ValueError:
            pass
    return None


def _collect_json_ld_prices(node, out: list) -> None:
    """Recursively collect offer prices from a JSON-LD node."""
    if isinstance(node, dict):
        if node.get("@type") in ("Offer", "AggregateOffer"):
            for key in ("price", "lowPrice"):
                raw = node.get(key)
                if raw is not None:
                    try:
                        price = float(str(raw).replace(",", "."))
                        if 1.0 <= price <= 100_000.0:
                            out.append(price)
                    except ValueError:
                        pass
        for v in node.values():
            _collect_json_ld_prices(v, out)
    elif isinstance(node, list):
        for item in node:
            _collect_json_ld_prices(item, out)


async def extract_prices_from_page(page, url: str) -> list:
    """Run extraction strategies in order of reliability; return early when confident.

    Priority:
      1. JSON-LD structured data  — authoritative; stop here if found
      2. Meta / itemprop tags     — stop here if found
      3. DOM text-walker regex    — last resort; noisy (delivery fees, accessories)
    """

    def valid(p: float) -> bool:
        return 2.0 <= p <= 100_000.0

    try:
        # Strategy 1: JSON-LD
        json_ld_nodes = await page.evaluate("""() => {
            const nodes = [];
            for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
                try { nodes.push(JSON.parse(s.textContent)); } catch {}
            }
            return nodes;
        }""")
        jld_prices = []
        for node in json_ld_nodes:
            _collect_json_ld_prices(node, jld_prices)
        jld_prices = [p for p in jld_prices if valid(p)]
        if jld_prices:
            log(f"  JSON-LD prices: {jld_prices}")
            return jld_prices  # most authoritative — skip noisier strategies

        # Strategy 2: meta / itemprop price tags
        meta_val = await page.evaluate("""() => {
            const sel = [
                'meta[property="product:price:amount"]',
                'meta[name="price"]',
                '[itemprop="price"]',
            ];
            for (const s of sel) {
                const el = document.querySelector(s);
                if (!el) continue;
                const v = el.getAttribute('content') || el.getAttribute('data-price') || el.textContent;
                if (v) return v.trim();
            }
            return null;
        }""")
        if meta_val:
            p = extract_price_from_text(meta_val)
            if p and valid(p):
                log(f"  meta price: {p}")
                return [p]

        # Strategy 3: DOM text-walker (last resort)
        # Returns raw matches; caller takes the mode/median to avoid delivery-fee noise.
        text_prices = await page.evaluate(
            # Use a string built from Python to keep the Unicode chars unambiguous
            "(() => {"
            "  const found = [];"
            "  const re = /(\\d[\\d\\u00a0\\u202f ]*[\\.,]\\d{2})\\s*(?:z\\u0142|zl|PLN)/gi;"
            "  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);"
            "  while (walker.nextNode()) {"
            "    const t = walker.currentNode.textContent;"
            "    let m; re.lastIndex = 0;"
            "    while ((m = re.exec(t)) !== null) { found.push(m[1]); }"
            "  }"
            "  return found;"
            "})()"
        )
        fallback = []
        for raw in text_prices:
            p = extract_price_from_text(raw)
            if p and valid(p):
                fallback.append(p)
        return fallback

    except Exception as exc:
        log(f"extraction error on {url}: {exc}")
        return []


_CF_CHALLENGE_TITLES = (
    "Cierpliwości",  # Polish
    "Just a moment",  # English
    "Chwileczkę",
    "Einen Moment",  # German (just in case)
    "Un moment",  # French
)


async def _wait_for_cloudflare(page, timeout_ms: int = 20_000) -> bool:
    """Wait for a Cloudflare Turnstile challenge to resolve.

    The Turnstile widget renders inside a dynamically-injected cross-origin iframe.
    Its checkbox sits in a shadow DOM so direct selectors don't reach it.
    Clicking the frame body is enough to trigger the Turnstile evaluation.
    """
    interval = 2_000
    elapsed = 0
    clicked = False

    while elapsed < timeout_ms:
        title = await page.title()
        if not any(p in title for p in _CF_CHALLENGE_TITLES):
            return True

        if not clicked:
            # Find the Cloudflare frame via Playwright's frame list (not DOM iframes)
            cf_frame = next(
                (f for f in page.frames if "challenges.cloudflare.com" in f.url),
                None,
            )
            if cf_frame:
                try:
                    await cf_frame.locator("body").click(timeout=3_000)
                    log("  Cloudflare Turnstile: clicked frame body")
                    clicked = True
                except Exception:
                    pass

        await page.wait_for_timeout(interval)
        elapsed += interval

    return False


async def scrape_url(browser, url_info: dict) -> Optional[dict]:
    """Visit one URL with Camoufox and return the best price found."""
    url = url_info.get("url", "")
    store = url_info.get("store", "")
    is_search = url_info.get("is_search", False)

    if not url:
        return None

    page = await browser.new_page()
    try:
        log(f"-> {store}: {url[:90]}")
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)

        # Handle Cloudflare challenge pages before extraction
        title = await page.title()
        if any(p in title for p in _CF_CHALLENGE_TITLES):
            log(f"  {store}: Cloudflare challenge detected, waiting...")
            passed = await _wait_for_cloudflare(page, timeout_ms=15_000)
            if not passed:
                log(f"  {store}: Cloudflare challenge did not resolve")
                return None
            log(f"  {store}: Cloudflare challenge passed")

        await page.wait_for_timeout(3_000)

        prices = await extract_prices_from_page(page, url)
        if not prices:
            log(f"  {store}: no prices found")
            return None

        prices.sort()
        best = prices[0]
        log(f"  {store}: {best} PLN  (found {len(prices)} candidates)")

        # For search pages try to capture the actual product URL
        found_url = url
        if is_search:
            try:
                href = await page.evaluate("""() => {
                    const priceEl = document.querySelector(
                        '[class*="price"], [itemprop="price"], [class*="offer"]'
                    );
                    if (!priceEl) return null;
                    const a = priceEl.closest('a') ||
                              priceEl.closest('article')?.querySelector('a') ||
                              priceEl.closest('li')?.querySelector('a');
                    return a?.href ?? null;
                }""")
                if href and href.startswith("http"):
                    found_url = href
            except Exception:
                pass

        return {"price": best, "url": found_url, "store": store}

    except Exception as exc:
        log(f"  {store}: error — {exc}")
        return None
    finally:
        await page.close()


async def run(url_infos: list) -> list:
    from camoufox.async_api import AsyncCamoufox

    results = []
    async with AsyncCamoufox(
        headless=True,
        geoip=True,
        humanize=True,
        locale=["pl-PL", "pl"],
        os="windows",
    ) as browser:
        for ui in url_infos:
            result = await scrape_url(browser, ui)
            if result:
                results.append(result)
            await asyncio.sleep(1.0)

    return results


def main() -> None:
    try:
        raw = sys.stdin.read()
        data = json.loads(raw)
    except Exception as exc:
        print(json.dumps({"error": f"invalid input: {exc}", "results": []}))
        sys.exit(1)

    url_infos = data.get("urls", [])
    if not url_infos:
        print(json.dumps({"results": []}))
        return

    try:
        results = asyncio.run(run(url_infos))
    except ImportError:
        msg = (
            "camoufox is not installed. "
            'Run: pip install "camoufox[geoip]" && python -m camoufox fetch'
        )
        log(msg)
        print(json.dumps({"error": msg, "results": []}))
        sys.exit(1)
    except Exception as exc:
        log(f"fatal: {exc}")
        print(json.dumps({"error": str(exc), "results": []}))
        sys.exit(1)

    results.sort(key=lambda r: r["price"])
    print(json.dumps({"results": results}))


if __name__ == "__main__":
    main()
