const fs = require("fs");
const https = require("https");
const { spawn } = require("child_process");
const notifier = require("node-notifier");
const path = require("path");
const isDev = require("electron-is-dev");

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const PRODUCT_DELAY_MS = 5000;
const SOURCE_DELAY_MS = 3000;
const REQUEST_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 4000;
const MAX_RETRIES = 1;
const BLOCKED_STATUS_CODES = new Set([401, 403, 429]);
const RETRYABLE_STATUS_CODES = new Set([408, 500, 502, 503, 504]);

// In production the scraper lives in app.asar.unpacked (not the read-only .asar archive).
const SCRAPER_PATH = isDev
  ? path.join(__dirname, "scraper", "scraper.py")
  : path.join(process.resourcesPath, "app.asar.unpacked", "public", "scraper", "scraper.py");

class PriceChecker {
  constructor(userDataPath = null) {
    // In production use the writable userData folder; in dev use local data/
    this.dataPath = userDataPath
      ? path.join(userDataPath, "data")
      : path.join(__dirname, "data");
    this.productsFile = path.join(this.dataPath, "products.json");
    this.priceHistoryFile = path.join(this.dataPath, "price_history.json");
    this.logFile = this.dataPath ? path.join(this.dataPath, "scraper.log") : null;
    this.mainWindow = null;
    this.onAlert = null; // callback set by electron.js for tray/sound alerts
    this.timerInterval = null;
    this.nextCheckTime = null;
    this.timeUntilNextCheck = 0;
    this.monitoringStarted = false;
    this.isCheckingAll = false;
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  emit(event, data) {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send(event, data);
    }
  }

  // ─── Timer ───────────────────────────────────────────────────────────────

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    const now = new Date();
    this.nextCheckTime = new Date(now.getTime() + CHECK_INTERVAL_MS);
    this.timeUntilNextCheck = CHECK_INTERVAL_MS;

    this.emit("timer-updated", {
      nextCheckTime: this.nextCheckTime.toISOString(),
      timeUntilNextCheck: this.timeUntilNextCheck,
    });

    this.timerInterval = setInterval(() => {
      this.timeUntilNextCheck -= 1000;

      if (this.timeUntilNextCheck <= 0) {
        this.runScheduledCheck();
        return;
      }

      this.emit("timer-updated", {
        nextCheckTime: this.nextCheckTime.toISOString(),
        timeUntilNextCheck: this.timeUntilNextCheck,
      });
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  getTimerStatus() {
    return {
      nextCheckTime: this.nextCheckTime ? this.nextCheckTime.toISOString() : null,
      timeUntilNextCheck: this.timeUntilNextCheck,
    };
  }

  async runScheduledCheck() {
    this.stopTimer();
    await this.checkAllPrices();
    this.startTimer();
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── Data persistence ────────────────────────────────────────────────────

  initDataDirectory() {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
    if (!fs.existsSync(this.productsFile)) {
      fs.writeFileSync(this.productsFile, JSON.stringify([]));
    }
    if (!fs.existsSync(this.priceHistoryFile)) {
      fs.writeFileSync(this.priceHistoryFile, JSON.stringify([]));
    }
  }

  loadProducts() {
    try {
      const data = fs.readFileSync(this.productsFile, "utf8");
      const products = JSON.parse(data);

      let needsUpdate = false;
      products.forEach((product) => {
        if (product.is_checking === undefined) {
          product.is_checking = false;
          needsUpdate = true;
        }
      });
      if (needsUpdate) this.saveProducts(products);

      return products;
    } catch (error) {
      console.error("Error loading products:", error);
      return [];
    }
  }

  saveProducts(products) {
    try {
      fs.writeFileSync(this.productsFile, JSON.stringify(products, null, 2));
    } catch (error) {
      console.error("Error saving products:", error);
    }
  }

  loadPriceHistory() {
    try {
      const data = fs.readFileSync(this.priceHistoryFile, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.error("Error loading price history:", error);
      return [];
    }
  }

  savePriceHistory(priceHistory) {
    try {
      fs.writeFileSync(this.priceHistoryFile, JSON.stringify(priceHistory, null, 2));
    } catch (error) {
      console.error("Error saving price history:", error);
    }
  }

  // ─── Camoufox scraping ───────────────────────────────────────────────────

  /**
   * Build a list of search-page URLs for Polish stores.
   */
  buildSearchUrls(productName) {
    const q = encodeURIComponent(productName);
    return [
      { store: "Ceneo",        url: `https://www.ceneo.pl/;szukaj-${q}`,                          is_search: true },
      { store: "Allegro",      url: `https://allegro.pl/listing?string=${q}`,                      is_search: true },
      { store: "x-kom",        url: `https://www.x-kom.pl/szukaj?q=${q}`,                          is_search: true },
      { store: "Media Expert", url: `https://www.mediaexpert.pl/search?query=${q}`,                is_search: true },
      { store: "RTV Euro AGD", url: `https://www.euro.com.pl/search?query=${q}`,                   is_search: true },
      { store: "Amazon.pl",    url: `https://www.amazon.pl/s?k=${q}`,                              is_search: true },
      { store: "Morele",       url: `https://www.morele.net/wyszukiwarka/?q=${q}`,                 is_search: true },
    ];
  }

  appendLog(msg) {
    if (!this.logFile) return;
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try { fs.appendFileSync(this.logFile, line); } catch {}
    console.log(msg);
  }

  findPython() {
    const { execFileSync } = require("child_process");
    // On Windows try where.exe to resolve the real path (handles pyenv shims)
    if (process.platform === "win32") {
      try {
        const out = execFileSync("where.exe", ["python"], { encoding: "utf8", timeout: 3000 });
        const found = out.trim().split("\n")[0].trim();
        if (found) return found;
      } catch {}
    }
    return process.platform === "win32" ? "python" : "python3";
  }

  /**
   * Call the Python/Camoufox scraper subprocess and return its parsed output.
   * Returns { results: [...] } on success or { results: [], error: "..." } on failure.
   */
  scrapeWithCamoufox(urlInfos) {
    return new Promise((resolve) => {
      if (!fs.existsSync(SCRAPER_PATH)) {
        this.appendLog(`[camoufox] scraper not found at ${SCRAPER_PATH}`);
        resolve({ results: [] });
        return;
      }

      const pythonCmd = this.findPython();
      this.appendLog(`[camoufox] python: ${pythonCmd}`);
      this.appendLog(`[camoufox] scraper: ${SCRAPER_PATH}`);

      const input = JSON.stringify({ urls: urlInfos });

      let proc;
      try {
        proc = spawn(pythonCmd, [SCRAPER_PATH], {
          env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
          shell: process.platform === "win32", // pyenv shims are .cmd — need cmd.exe to resolve them
        });
      } catch (err) {
        this.appendLog(`[camoufox] failed to spawn Python: ${err.message}`);
        resolve({ results: [] });
        return;
      }

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      // Hard timeout: 3 min per full check run
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
        this.appendLog("[camoufox] subprocess timed out");
        resolve({ results: [] });
      }, 180_000);

      proc.stdout.on("data", (chunk) => { stdout += chunk; });
      proc.stderr.on("data", (chunk) => {
        stderr += chunk;
        process.stdout.write(chunk);
      });

      proc.on("close", (code) => {
        if (timedOut) return;
        clearTimeout(timer);
        this.appendLog(`[camoufox] exit code: ${code}`);
        if (stderr) this.appendLog(`[camoufox] stderr: ${stderr.slice(0, 500)}`);

        try {
          const result = JSON.parse(stdout.trim());
          if (result.error) {
            this.appendLog(`[camoufox] error: ${result.error}`);
          }
          this.appendLog(`[camoufox] results: ${result.results?.length ?? 0} prices found`);
          resolve({ results: result.results || [] });
        } catch (e) {
          this.appendLog(`[camoufox] parse error: ${e.message} | stdout: ${stdout.slice(0, 300)}`);
          resolve({ results: [] });
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        if (!timedOut) {
          this.appendLog(`[camoufox] spawn error: ${err.message}`);
          resolve({ results: [] });
        }
      });

      proc.stdin.write(input);
      proc.stdin.end();
    });
  }

  /**
   * Primary entry point: scrape a product price.
   *   1. Tries Camoufox (real browser, anti-detection).
   *   2. Falls back to plain HTTPS requests + regex when Python is unavailable.
   */
  async scrapePriceWithTarget(productName, url = null, targetPrice = null) {
    // ── Camoufox path ──────────────────────────────────────────────────────
    const urlInfos = (url && url.trim())
      ? [{ store: "Direct", url: url.trim(), is_search: false }]
      : this.buildSearchUrls(productName);

    console.log(`🦊 Camoufox: checking ${productName} via ${urlInfos.length} source(s)...`);
    const camoufoxResult = await this.scrapeWithCamoufox(urlInfos);

    if (camoufoxResult.results && camoufoxResult.results.length > 0) {
      let results = camoufoxResult.results;

      if (targetPrice) {
        const below = results.filter((r) => r.price <= targetPrice);
        if (below.length > 0) {
          results = below;
        } else {
          // All prices found but none below target — return cheapest anyway so
          // the user can see the current market price.
          console.log(`⚠️  No results below target (${targetPrice} PLN). Returning cheapest.`);
        }
      }

      results.sort((a, b) => a.price - b.price);
      const best = results[0];
      console.log(`🏆 Best: ${best.price} PLN at ${best.store}`);
      return best;
    }

    // ── HTTP fallback ──────────────────────────────────────────────────────
    console.log("⚠️  Camoufox returned no results — falling back to HTTP scraping.");

    if (url && url.trim()) {
      return this.scrapeFromUrl(url.trim(), productName);
    }

    return new Promise((resolve) => {
      this.collectAllPricesHTTP(productName, targetPrice, resolve);
    });
  }

  // ─── HTTP fallback scraping ──────────────────────────────────────────────

  createRequestOptions(timeout = REQUEST_TIMEOUT_MS) {
    return {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
      },
      timeout,
    };
  }

  requestHtml(url, timeout = REQUEST_TIMEOUT_MS, attempt = 0) {
    return new Promise((resolve) => {
      const request = https.get(url, this.createRequestOptions(timeout), (response) => {
        const { statusCode } = response;
        let data = "";

        if (statusCode >= 300 && statusCode < 400) {
          response.resume();
          resolve({ data: null, statusCode, blocked: false });
          return;
        }

        if (BLOCKED_STATUS_CODES.has(statusCode)) {
          response.resume();
          resolve({ data: null, statusCode, blocked: true });
          return;
        }

        response.on("data", (chunk) => { data += chunk; });

        response.on("end", async () => {
          if (RETRYABLE_STATUS_CODES.has(statusCode) && attempt < MAX_RETRIES) {
            await this.delay(RETRY_DELAY_MS * (attempt + 1));
            resolve(await this.requestHtml(url, timeout, attempt + 1));
            return;
          }
          resolve({ data, statusCode, blocked: false });
        });
      });

      request.on("error", async () => {
        if (attempt < MAX_RETRIES) {
          await this.delay(RETRY_DELAY_MS * (attempt + 1));
          resolve(await this.requestHtml(url, timeout, attempt + 1));
          return;
        }
        resolve({ data: null, statusCode: null, blocked: false });
      });

      request.on("timeout", () => {
        request.destroy();
        resolve({ data: null, statusCode: null, blocked: false });
      });
    });
  }

  async collectAllPricesHTTP(productName, targetPrice, resolve) {
    console.log(`🔍 HTTP fallback: collecting prices for ${productName}...`);

    const sources = [
      {
        name: "Ceneo",
        url: `https://www.ceneo.pl/;szukaj-${encodeURIComponent(productName)}`,
        storeUrl: "https://www.ceneo.pl",
      },
      {
        name: "Allegro",
        url: `https://allegro.pl/listing?string=${encodeURIComponent(productName)}`,
        storeUrl: "https://allegro.pl",
      },
      {
        name: "x-kom",
        url: `https://www.x-kom.pl/szukaj?q=${encodeURIComponent(productName)}`,
        storeUrl: "https://www.x-kom.pl",
      },
      {
        name: "Media Expert",
        url: `https://www.mediaexpert.pl/search?query=${encodeURIComponent(productName)}`,
        storeUrl: "https://www.mediaexpert.pl",
      },
      {
        name: "RTV Euro AGD",
        url: `https://www.euro.com.pl/search?query=${encodeURIComponent(productName)}`,
        storeUrl: "https://www.euro.com.pl",
      },
    ];

    // Shared price regex for Polish stores
    const pricePatterns = [
      /(\d{1,5}(?:[  ]\d{3})*[\.,]\d{2})\s*(?:z[łŁ]|PLN)/gi,
      /(\d+[\.,]\d{2})\s*z[łl]/gi,
    ];

    const allPrices = [];

    for (const source of sources) {
      try {
        await this.delay(SOURCE_DELAY_MS);
        const { data, blocked } = await this.requestHtml(source.url, 8000);

        if (blocked || !data || data.length < 500) {
          console.log(`⛔ ${source.name}: blocked or empty response`);
          continue;
        }

        let foundPrice = null;
        for (const pattern of pricePatterns) {
          const matches = data.match(pattern);
          if (matches) {
            for (const match of matches) {
              const m = match.match(/(\d+[\.,]\d{2})/);
              if (m) {
                const price = parseFloat(m[1].replace(",", "."));
                if (price >= 10 && price <= 50_000) {
                  foundPrice = price;
                  break;
                }
              }
            }
            if (foundPrice) break;
          }
        }

        if (foundPrice) {
          console.log(`✅ ${source.name}: ${foundPrice} PLN`);
          allPrices.push({ price: foundPrice, url: source.url, store: source.name, storeUrl: source.storeUrl });
        } else {
          console.log(`❌ ${source.name}: price not found`);
        }
      } catch (err) {
        console.error(`Error requesting ${source.name}:`, err.message);
      }
    }

    if (allPrices.length === 0) {
      resolve({ price: null, url: null, store: null, storeUrl: null });
      return;
    }

    let validPrices = allPrices;
    if (targetPrice) {
      const below = allPrices.filter((p) => p.price <= targetPrice);
      if (below.length > 0) validPrices = below;
    }

    validPrices.sort((a, b) => a.price - b.price);
    const best = validPrices[0];
    console.log(`🏆 HTTP best: ${best.price} PLN at ${best.store}`);
    resolve(best);
  }

  async scrapeFromUrl(url, productName) {
    return new Promise((resolve) => {
      const request = https.get(url, this.createRequestOptions(REQUEST_TIMEOUT_MS), (response) => {
        if (BLOCKED_STATUS_CODES.has(response.statusCode)) {
          response.resume();
          console.log(`${productName}: source unavailable (${response.statusCode})`);
          resolve({ price: null, url });
          return;
        }

        let data = "";
        response.on("data", (chunk) => { data += chunk; });
        response.on("end", () => {
          try {
            const patterns = [
              /(\d{1,5}(?:[  ]\d{3})*[\.,]\d{2})\s*(?:z[łŁ]|PLN)/gi,
              /(\d+[\.,]\d{2})\s*z[łl]/gi,
            ];
            let foundPrice = null;
            for (const p of patterns) {
              const matches = data.match(p);
              if (matches) {
                for (const match of matches) {
                  const m = match.match(/(\d+[\.,]\d{2})/);
                  if (m) {
                    const price = parseFloat(m[1].replace(",", "."));
                    if (price >= 10 && price <= 50_000) { foundPrice = price; break; }
                  }
                }
                if (foundPrice) break;
              }
            }
            resolve({ price: foundPrice, url });
          } catch {
            resolve({ price: null, url });
          }
        });
      });

      request.on("error", () => resolve({ price: null, url }));
      request.on("timeout", () => { request.destroy(); resolve({ price: null, url }); });
    });
  }

  // ─── Product management ──────────────────────────────────────────────────

  updateProductPrice(productId, price, foundUrl = null, store = null, storeUrl = null) {
    const now = new Date().toISOString();
    const products = this.loadProducts();
    const priceHistory = this.loadPriceHistory();

    const idx = products.findIndex((p) => p.id === productId);
    if (idx !== -1) {
      products[idx].current_price = price;
      products[idx].last_checked = now;
      if (foundUrl) products[idx].found_url = foundUrl;
      if (store) products[idx].found_store = store;
      if (storeUrl) products[idx].found_store_url = storeUrl;
      this.saveProducts(products);
    }

    priceHistory.push({ id: Date.now(), product_id: productId, price, store, checked_at: now });
    this.savePriceHistory(priceHistory);

    if (idx !== -1) this.emit("product-updated", products[idx]);
  }

  checkPriceAlert(productId, productName, currentPrice) {
    const products = this.loadProducts();
    const product = products.find((p) => p.id === productId);

    if (product && currentPrice <= product.target_price) {
      // Notify electron.js for tray icon + balloon + sound
      if (this.onAlert) {
        this.onAlert({
          productName,
          currentPrice,
          targetPrice: product.target_price,
        });
      }
    }
  }

  async checkProductById(productId) {
    const products = this.loadProducts();
    const product = products.find((p) => p.id === productId);
    if (!product || product.is_checking) return;

    try {
      this.setCheckingStatus(productId, true);
      const result = await this.scrapePriceWithTarget(product.name, product.url, product.target_price);
      if (result && result.price) {
        this.updateProductPrice(productId, result.price, result.url, result.store, result.storeUrl);
        this.checkPriceAlert(productId, product.name, result.price);
      } else {
        this.updateLastChecked(productId);
      }
    } catch (error) {
      console.error(`Error checking ${product.name}:`, error);
      this.updateLastChecked(productId);
    } finally {
      this.setCheckingStatus(productId, false);
    }
  }

  async checkAllPrices() {
    if (this.isCheckingAll) {
      console.log("Price check already running, skipping.");
      return;
    }

    this.isCheckingAll = true;
    const products = this.loadProducts();
    const active = products.filter((p) => p.is_active !== false);

    console.log(`🔍 Checking prices for ${active.length} product(s)...`);

    for (const product of active) {
      try {
        console.log(`📦 Checking: ${product.name}`);
        this.setCheckingStatus(product.id, true);

        const result = await this.scrapePriceWithTarget(product.name, product.url, product.target_price);

        if (result && result.price) {
          console.log(`💰 ${result.price} PLN at ${result.store || "unknown"}`);
          this.updateProductPrice(product.id, result.price, result.url, result.store, result.storeUrl);
          this.checkPriceAlert(product.id, product.name, result.price);
        } else {
          console.log(`❌ Price not found for ${product.name}`);
          this.updateLastChecked(product.id);
        }
      } catch (error) {
        console.error(`Error checking ${product.name}:`, error);
        this.updateLastChecked(product.id);
      } finally {
        this.setCheckingStatus(product.id, false);
      }

      if (active.indexOf(product) < active.length - 1) {
        await this.delay(PRODUCT_DELAY_MS);
      }
    }

    this.isCheckingAll = false;
  }

  updateLastChecked(productId) {
    const now = new Date().toISOString();
    const products = this.loadProducts();
    const idx = products.findIndex((p) => p.id === productId);
    if (idx !== -1) {
      products[idx].last_checked = now;
      this.saveProducts(products);
    }
  }

  setCheckingStatus(productId, isChecking) {
    const products = this.loadProducts();
    const idx = products.findIndex((p) => p.id === productId);
    if (idx !== -1) {
      products[idx].is_checking = isChecking;
      this.saveProducts(products);
      this.emit("product-checking-status-updated", { productId, isChecking, product: products[idx] });
    }
  }

  startMonitoring() {
    if (this.monitoringStarted) return;
    this.monitoringStarted = true;
    console.log("Price Checker started. Checking every hour...");
    setTimeout(() => { this.checkAllPrices(); }, 2000);
  }

  getProducts() {
    return Promise.resolve(this.loadProducts());
  }

  addProduct(name, targetPrice, url = null) {
    return new Promise((resolve) => {
      const products = this.loadProducts();
      const newProduct = {
        id: Date.now(),
        name,
        target_price: targetPrice,
        current_price: null,
        url: url || null,
        found_url: null,
        found_store: null,
        found_store_url: null,
        last_checked: null,
        is_active: true,
        is_checking: false,
        created_at: new Date().toISOString(),
      };
      products.push(newProduct);
      this.saveProducts(products);
      this.emit("product-added", newProduct);
      resolve({ id: newProduct.id });
    });
  }

  deleteProduct(productId) {
    return new Promise((resolve) => {
      const products = this.loadProducts();
      const productToDelete = products.find((p) => p.id === productId);
      const filtered = products.filter((p) => p.id !== productId);
      this.saveProducts(filtered);
      if (productToDelete) this.emit("product-deleted", { productId, product: productToDelete });
      resolve({ success: true });
    });
  }
}

module.exports = PriceChecker;
