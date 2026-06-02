"""Test: click Cloudflare Turnstile via Playwright frame object (not frame_locator)"""
import asyncio
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

_CF_TITLES = ("Cierpliwości", "Just a moment", "Chwileczkę")


async def get_cf_frame(page, retries=10, interval=1_000):
    """Wait for the Cloudflare challenge frame to appear."""
    for _ in range(retries):
        for frame in page.frames:
            if "challenges.cloudflare.com" in frame.url:
                return frame
        await page.wait_for_timeout(interval)
    return None


async def test():
    from camoufox.async_api import AsyncCamoufox

    url = "https://mtcg.pl/pokemon/pitch-black/booster-box"
    print(f"Testing: {url}", flush=True)

    async with AsyncCamoufox(
        headless=True,
        geoip=True,
        humanize=True,
        locale=["pl-PL", "pl"],
        os="windows",
    ) as browser:
        page = await browser.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        await page.wait_for_timeout(2_000)

        title = await page.title()
        print(f"Title: {title}", flush=True)

        if not any(p in title for p in _CF_TITLES):
            print("No Cloudflare challenge — page loaded directly!", flush=True)
        else:
            print("Challenge detected — finding CF frame...", flush=True)
            cf_frame = await get_cf_frame(page)

            if cf_frame:
                print(f"CF frame URL: {cf_frame.url[:80]}", flush=True)

                # Dump frame content to understand structure
                try:
                    frame_body = await cf_frame.evaluate("() => document.body.innerHTML.slice(0, 1000)")
                    print(f"Frame HTML: {frame_body}", flush=True)
                except Exception as e:
                    print(f"Frame HTML error: {e}", flush=True)

                # Try clicking checkbox
                try:
                    cb = cf_frame.locator('input[type="checkbox"]')
                    await cb.click(timeout=5_000)
                    print("Clicked checkbox!", flush=True)
                except Exception as e:
                    print(f"Checkbox click failed: {e}", flush=True)
                    # Try clicking by position / any visible element
                    try:
                        body_el = cf_frame.locator("body")
                        await body_el.click(timeout=3_000)
                        print("Clicked body!", flush=True)
                    except Exception as e2:
                        print(f"Body click failed: {e2}", flush=True)

                # Wait for challenge to resolve
                for i in range(10):
                    await page.wait_for_timeout(2_000)
                    title = await page.title()
                    print(f"  [{i+1}] title: {title}", flush=True)
                    if not any(p in title for p in _CF_TITLES):
                        print("Challenge PASSED!", flush=True)
                        break
                else:
                    print("Challenge did NOT resolve.", flush=True)
            else:
                print("CF frame not found!", flush=True)

        await page.wait_for_timeout(2_000)
        final_title = await page.title()
        print(f"Final title: {final_title}", flush=True)

        # Try price extraction
        price = await page.evaluate("""() => {
            for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
                try {
                    const d = JSON.parse(s.textContent);
                    if (d.offers?.price) return String(d.offers.price);
                    if (d['@graph']) {
                        for (const n of d['@graph']) {
                            if (n.offers?.price) return String(n.offers.price);
                        }
                    }
                } catch {}
            }
            const el = document.querySelector('[itemprop="price"]');
            if (el) return el.getAttribute('content') || el.textContent;
            return null;
        }""")
        print(f"Price: {price}", flush=True)

        await page.screenshot(path="test_mtcg_screenshot.png")
        print("Screenshot saved.", flush=True)


asyncio.run(test())
