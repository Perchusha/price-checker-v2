const fs = require("fs");
const http = require("http");
const https = require("https");
const notifier = require("node-notifier");
const path = require("path");

class PriceChecker {
  constructor() {
    this.dataPath = path.join(__dirname, "data");
    this.productsFile = path.join(this.dataPath, "products.json");
    this.priceHistoryFile = path.join(this.dataPath, "price_history.json");
    this.mainWindow = null; // Will be set from electron.js
    this.timerInterval = null;
    this.nextCheckTime = null;
    this.timeUntilNextCheck = 0;
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  // Send events to UI
  emit(event, data) {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send(event, data);
    }
  }

  // Google Shopping API (free)
  async searchGoogleShopping(productName, targetPrice) {
    return new Promise((resolve) => {
      // Use free Google Shopping API
      const options = {
        hostname: "google-shopping-data.p.rapidapi.com",
        path: `/shopping/search?query=${encodeURIComponent(
          productName
        )}&country=PL&language=pl`,
        method: "GET",
        headers: {
          "X-RapidAPI-Key": "YOUR_FREE_API_KEY", // Get at rapidapi.com
          "X-RapidAPI-Host": "google-shopping-data.p.rapidapi.com",
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const result = JSON.parse(data);
            if (result.shopping_results && result.shopping_results.length > 0) {
              const firstResult = result.shopping_results[0];
              const price = parseFloat(
                firstResult.price.replace(/[^\d.,]/g, "").replace(",", ".")
              );
              if (price && (!targetPrice || price <= targetPrice)) {
                resolve({
                  price: price,
                  url: firstResult.link,
                  store: firstResult.source,
                  storeUrl: firstResult.source,
                });
                return;
              }
            }
            resolve(null);
          } catch (error) {
            console.log(`Google Shopping API parsing error: ${error.message}`);
            resolve(null);
          }
        });
      });

      req.on("error", (error) => {
        console.log(`Google Shopping API error: ${error.message}`);
        resolve(null);
      });

      req.setTimeout(5000, () => {
        req.destroy();
        resolve(null);
      });

      req.end();
    });
  }

  // Timer management
  startTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    // Set next check time (every hour)
    const now = new Date();
    this.nextCheckTime = new Date(now.getTime() + 60 * 60 * 1000);
    this.timeUntilNextCheck = 60 * 60 * 1000;

    // Send initial time to UI
    this.emit("timer-updated", {
      nextCheckTime: this.nextCheckTime.toISOString(),
      timeUntilNextCheck: this.timeUntilNextCheck,
    });

    // Update timer every second
    this.timerInterval = setInterval(() => {
      this.timeUntilNextCheck -= 1000;

      if (this.timeUntilNextCheck <= 0) {
        // Time's up, start check and reset timer
        this.checkAllPrices();
        this.startTimer(); // Restart timer
        return;
      }

      // Send update to UI
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
      nextCheckTime: this.nextCheckTime
        ? this.nextCheckTime.toISOString()
        : null,
      timeUntilNextCheck: this.timeUntilNextCheck,
    };
  }

  initDataDirectory() {
    // Create data directory
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    // Create files if they don't exist
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

      // Migration: add is_checking field for existing products
      let needsUpdate = false;
      products.forEach((product) => {
        if (product.is_checking === undefined) {
          product.is_checking = false;
          needsUpdate = true;
        }
      });

      if (needsUpdate) {
        this.saveProducts(products);
        console.log(
          "✅ Migration: added is_checking field for existing products"
        );
      }

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
      fs.writeFileSync(
        this.priceHistoryFile,
        JSON.stringify(priceHistory, null, 2)
      );
    } catch (error) {
      console.error("Error saving price history:", error);
    }
  }

  async scrapePrice(productName, url = null) {
    return new Promise((resolve) => {
      try {
        // If there's a specific URL, use it
        if (url && url.trim() !== "") {
          this.scrapeFromUrl(url, productName).then(resolve);
          return;
        }

        // Try different sources for price search
        const searchSources = [
          {
            name: "x-kom",
            url: `https://www.x-kom.pl/szukaj?q=${encodeURIComponent(
              productName
            )}`,
            patterns: [
              /(\d+[\.,]\d+)\s*(zł|PLN)/gi,
              /(\d+[\.,]\d+)\s*zł/gi,
              /price[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
              /cena[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
            ],
            storeUrl: "https://www.x-kom.pl",
          },
          {
            name: "Allegro",
            url: `https://allegro.pl/listing?string=${encodeURIComponent(
              productName
            )}`,
            patterns: [
              /(\d+[\.,]\d+)\s*(zł|PLN)/gi,
              /(\d+[\.,]\d+)\s*zł/gi,
              /price[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
              /cena[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
            ],
            storeUrl: "https://allegro.pl",
          },
          {
            name: "Amazon Poland",
            url: `https://www.amazon.pl/s?k=${encodeURIComponent(productName)}`,
            patterns: [
              /(\d+[\.,]\d+)\s*(zł|PLN)/gi,
              /(\d+[\.,]\d+)\s*zł/gi,
              /price[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
              /cena[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
            ],
            storeUrl: "https://www.amazon.pl",
          },
          {
            name: "Ceneo",
            url: `https://www.ceneo.pl/;szukaj-${encodeURIComponent(
              productName
            )}`,
            patterns: [
              /(\d+[\.,]\d+)\s*(zł|PLN)/gi,
              /(\d+[\.,]\d+)\s*zł/gi,
              /price[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
              /cena[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
            ],
            storeUrl: "https://www.ceneo.pl",
          },
          {
            name: "Media Expert",
            url: `https://www.mediaexpert.pl/search?query=${encodeURIComponent(
              productName
            )}`,
            patterns: [
              /(\d+[\.,]\d+)\s*(zł|PLN)/gi,
              /(\d+[\.,]\d+)\s*zł/gi,
              /price[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
              /cena[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
            ],
            storeUrl: "https://www.mediaexpert.pl",
          },
          {
            name: "RTV Euro AGD",
            url: `https://www.euro.com.pl/search?query=${encodeURIComponent(
              productName
            )}`,
            patterns: [/(\d+[\.,]\d+)\s*(zł|PLN)/gi],
            storeUrl: "https://www.euro.com.pl",
          },
        ];

        // Collect prices from all sources and select the best
        this.collectAllPrices(productName, searchSources, null, resolve);
      } catch (error) {
        console.error(
          `Error scraping price for ${productName}:`,
          error.message
        );
        resolve({ price: null, url: null });
      }
    });
  }

  async scrapePriceWithTarget(productName, url = null, targetPrice = null) {
    return new Promise((resolve) => {
      try {
        // If there's a specific URL, use it
        if (url && url.trim() !== "") {
          this.scrapeFromUrl(url, productName).then(resolve);
          return;
        }

        // Try different sources for price search
        const searchSources = [
          {
            name: "x-kom",
            url: `https://www.x-kom.pl/szukaj?q=${encodeURIComponent(
              productName
            )}`,
            patterns: [
              /(\d+[\.,]\d+)\s*(zł|PLN)/gi,
              /(\d+[\.,]\d+)\s*zł/gi,
              /price[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
              /cena[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
            ],
            storeUrl: "https://www.x-kom.pl",
          },
          {
            name: "Allegro",
            url: `https://allegro.pl/listing?string=${encodeURIComponent(
              productName
            )}`,
            patterns: [
              /(\d+[\.,]\d+)\s*(zł|PLN)/gi,
              /(\d+[\.,]\d+)\s*zł/gi,
              /price[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
              /cena[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
            ],
            storeUrl: "https://allegro.pl",
          },
          {
            name: "Amazon Poland",
            url: `https://www.amazon.pl/s?k=${encodeURIComponent(productName)}`,
            patterns: [
              /(\d+[\.,]\d+)\s*(zł|PLN)/gi,
              /(\d+[\.,]\d+)\s*zł/gi,
              /price[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
              /cena[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
            ],
            storeUrl: "https://www.amazon.pl",
          },
          {
            name: "Ceneo",
            url: `https://www.ceneo.pl/;szukaj-${encodeURIComponent(
              productName
            )}`,
            patterns: [
              /(\d+[\.,]\d+)\s*(zł|PLN)/gi,
              /(\d+[\.,]\d+)\s*zł/gi,
              /price[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
              /cena[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
            ],
            storeUrl: "https://www.ceneo.pl",
          },
          {
            name: "Media Expert",
            url: `https://www.mediaexpert.pl/search?query=${encodeURIComponent(
              productName
            )}`,
            patterns: [
              /(\d+[\.,]\d+)\s*(zł|PLN)/gi,
              /(\d+[\.,]\d+)\s*zł/gi,
              /price[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
              /cena[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
            ],
            storeUrl: "https://www.mediaexpert.pl",
          },
          {
            name: "RTV Euro AGD",
            url: `https://www.euro.com.pl/search?query=${encodeURIComponent(
              productName
            )}`,
            patterns: [/(\d+[\.,]\d+)\s*(zł|PLN)/gi],
            storeUrl: "https://www.euro.com.pl",
          },
        ];

        // Collect prices from all sources and select the best
        this.collectAllPrices(productName, searchSources, targetPrice, resolve);
      } catch (error) {
        console.error(
          `Error scraping price for ${productName}:`,
          error.message
        );
        resolve({ price: null, url: null });
      }
    });
  }

  async collectAllPrices(productName, sources, targetPrice, resolve) {
    console.log(`🔍 Collecting prices from all stores for ${productName}...`);

    const allPrices = [];
    let completedRequests = 0;

    // First try Google Shopping API (free)
    try {
      const apiResult = await this.searchGoogleShopping(
        productName,
        targetPrice
      );
      if (apiResult && apiResult.price) {
        allPrices.push(apiResult);
        console.log(
          `🎯 Google Shopping API: found price ${apiResult.price} PLN`
        );
      }
    } catch (error) {
      console.log(`❌ Google Shopping API unavailable: ${error.message}`);
    }

    // Run requests to all sources in parallel
    sources.forEach((source, index) => {
      this.scrapeFromSource(productName, source)
        .then((result) => {
          if (result && result.price) {
            allPrices.push({
              price: result.price,
              url: result.url,
              store: source.name,
              storeUrl: source.storeUrl,
            });
            console.log(`✅ ${source.name}: ${result.price} PLN`);
          } else {
            console.log(`❌ ${source.name}: price not found`);
          }

          completedRequests++;

          // When all requests are complete, select the best price
          if (completedRequests === sources.length) {
            if (allPrices.length > 0) {
              // Filter prices - show only those BELOW target price
              let validPrices = allPrices;
              if (targetPrice) {
                validPrices = allPrices.filter(
                  (price) => price.price <= targetPrice
                );
                console.log(`🎯 Target price: ${targetPrice} PLN`);
                console.log(
                  `📊 Found ${allPrices.length} prices, ${validPrices.length} below target`
                );
              }

              if (validPrices.length > 0) {
                // Sort by price (lowest to highest)
                validPrices.sort((a, b) => a.price - b.price);
                const bestPrice = validPrices[0];

                console.log(
                  `🏆 Best price: ${bestPrice.price} PLN at ${bestPrice.store}`
                );
                console.log(`🔗 Link: ${bestPrice.url}`);

                resolve({
                  price: bestPrice.price,
                  url: bestPrice.url,
                  store: bestPrice.store,
                  storeUrl: bestPrice.storeUrl,
                });
              } else {
                // If all prices are above target, don't show them
                console.log(
                  `❌ All found prices are above target (${targetPrice} PLN) for ${productName}`
                );
                resolve({
                  price: null,
                  url: null,
                  store: null,
                  storeUrl: null,
                });
              }
            } else {
              // If no prices found, return null
              console.log(`❌ No prices found for ${productName}`);
              resolve({
                price: null,
                url: null,
                store: null,
                storeUrl: null,
              });
            }
          }
        })
        .catch((error) => {
          console.error(`Error requesting ${source.name}:`, error.message);
          completedRequests++;

          if (completedRequests === sources.length) {
            if (allPrices.length > 0) {
              allPrices.sort((a, b) => a.price - b.price);
              const bestPrice = allPrices[0];
              resolve({
                price: bestPrice.price,
                url: bestPrice.url,
                store: bestPrice.store,
                storeUrl: bestPrice.storeUrl,
              });
            } else {
              const demoPrice = Math.floor(Math.random() * 200) + 300;
              console.log(`🎲 Demo price for ${productName}: ${demoPrice} PLN`);
              resolve({
                price: demoPrice,
                url:
                  "https://www.google.com/search?q=" +
                  encodeURIComponent(productName),
                store: "Demo",
                storeUrl: "https://www.google.com",
              });
            }
          }
        });
    });
  }

  async scrapeFromSource(productName, source) {
    return new Promise((resolve) => {
      const options = {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
        },
        timeout: 8000,
      };

      const request = https.get(source.url, options, (response) => {
        // Skip redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          resolve(null);
          return;
        }

        let data = "";

        response.on("data", (chunk) => {
          data += chunk;
        });

        response.on("end", () => {
          try {
            let foundPrice = null;

            // Check if we got real data
            if (data.length < 1000) {
              resolve(null);
              return;
            }

            // Search for prices using source patterns
            const pricePatterns = source.patterns;
            console.log(
              `🔍 ${source.name}: Searching prices with ${pricePatterns.length} patterns...`
            );

            for (const pattern of pricePatterns) {
              const matches = data.match(pattern);
              if (matches) {
                console.log(
                  `📊 ${source.name}: Found ${matches.length} pattern matches`
                );
                for (const match of matches) {
                  const priceMatch = match.match(/(\d+[\.,]\d+)/);
                  if (priceMatch) {
                    const price = parseFloat(priceMatch[1].replace(",", "."));
                    console.log(
                      `💰 ${source.name}: Checking price ${price} PLN`
                    );
                    if (price >= 10 && price <= 10000) {
                      foundPrice = price;
                      console.log(
                        `✅ ${source.name}: Valid price found: ${price} PLN`
                      );
                      break;
                    }
                  }
                }
                if (foundPrice) break;
              }
            }

            if (foundPrice) {
              // Try to find link to specific product
              let productUrl = source.url; // Default to general link

              // Patterns for finding product links
              const linkPatterns = [
                /href="([^"]*\/[^"]*\/[^"]*)"[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
                /href="([^"]*\/product[^"]*)"[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
                /href="([^"]*\/[^"]*)"[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
                /<a[^>]*href="([^"]*)"[^>]*>.*?(\d+[\.,]\d+)\s*zł/gi,
              ];

              for (const pattern of linkPatterns) {
                const matches = [...data.matchAll(pattern)];
                for (const match of matches) {
                  if (match[1] && match[2]) {
                    const price = parseFloat(match[2].replace(",", "."));
                    if (Math.abs(price - foundPrice) < 0.01) {
                      // Price matches
                      productUrl = match[1].startsWith("http")
                        ? match[1]
                        : match[1].startsWith("/")
                        ? source.storeUrl + match[1]
                        : source.storeUrl + "/" + match[1];
                      console.log(`🔗 Found product link: ${productUrl}`);
                      break;
                    }
                  }
                }
                if (productUrl !== source.url) break;
              }

              resolve({ price: foundPrice, url: productUrl });
            } else {
              resolve(null);
            }
          } catch (error) {
            resolve(null);
          }
        });
      });

      request.on("error", (error) => {
        resolve(null);
      });

      request.on("timeout", () => {
        request.destroy();
        resolve(null);
      });
    });
  }

  // Additional method for scraping from specific URL
  async scrapeFromUrl(url, productName) {
    return new Promise((resolve) => {
      try {
        const options = {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
          },
          timeout: 15000,
        };

        const request = https.get(url, options, (response) => {
          let data = "";

          response.on("data", (chunk) => {
            data += chunk;
          });

          response.on("end", () => {
            try {
              let foundPrice = null;

              const pricePatterns = [
                /(\d+[\.,]\d+)\s*(zł|PLN|злотых)/gi,
                /(\d+[\.,]\d+)\s*PLN/gi,
                /(\d+[\.,]\d+)\s*zł/gi,
                /(\d+[\.,]\d+)\s*злотых/gi,
              ];

              for (const pattern of pricePatterns) {
                const matches = data.match(pattern);
                if (matches) {
                  for (const match of matches) {
                    const priceMatch = match.match(/(\d+[\.,]\d+)/);
                    if (priceMatch) {
                      const price = parseFloat(priceMatch[1].replace(",", "."));
                      if (price >= 10 && price <= 10000) {
                        foundPrice = price;
                        break;
                      }
                    }
                  }
                  if (foundPrice) break;
                }
              }

              resolve({ price: foundPrice, url: url });
            } catch (error) {
              console.error(
                `Error parsing HTML for ${productName}:`,
                error.message
              );
              resolve({ price: null, url: url });
            }
          });
        });

        request.on("error", (error) => {
          console.error(`Error requesting ${productName}:`, error.message);
          resolve({ price: null, url: url });
        });

        request.on("timeout", () => {
          request.destroy();
          console.error(`Timeout requesting ${productName}`);
          resolve({ price: null, url: url });
        });
      } catch (error) {
        console.error(
          `Error scraping price for ${productName}:`,
          error.message
        );
        resolve({ price: null, url: url });
      }
    });
  }

  updateProductPrice(
    productId,
    price,
    foundUrl = null,
    store = null,
    storeUrl = null
  ) {
    const now = new Date().toISOString();
    const products = this.loadProducts();
    const priceHistory = this.loadPriceHistory();

    // Update product price
    const productIndex = products.findIndex((p) => p.id === productId);
    if (productIndex !== -1) {
      products[productIndex].current_price = price;
      products[productIndex].last_checked = now;
      if (foundUrl) {
        products[productIndex].found_url = foundUrl;
      }
      if (store) {
        products[productIndex].found_store = store;
      }
      if (storeUrl) {
        products[productIndex].found_store_url = storeUrl;
      }
      this.saveProducts(products);
    }

    // Add to price history
    priceHistory.push({
      id: Date.now(),
      product_id: productId,
      price: price,
      store: store,
      checked_at: now,
    });
    this.savePriceHistory(priceHistory);

    // Send product update event to UI
    if (productIndex !== -1) {
      this.emit("product-updated", products[productIndex]);
    }
  }

  checkPriceAlert(productId, productName, currentPrice) {
    const products = this.loadProducts();
    const product = products.find((p) => p.id === productId);

    if (product && currentPrice <= product.target_price) {
      notifier.notify({
        title: "Price Checker - Great price found!",
        message: `Product "${productName}" now costs ${currentPrice.toFixed(
          2
        )} PLN (target price: ${product.target_price.toFixed(2)})`,
        icon: path.join(__dirname, "icon.png"),
        sound: true,
        timeout: 10,
      });
    }
  }

  async checkAllPrices() {
    const products = this.loadProducts();
    const activeProducts = products.filter((p) => p.is_active !== false);

    console.log(`🔍 Checking prices for ${activeProducts.length} products...`);

    for (const product of activeProducts) {
      try {
        console.log(`📦 Checking: ${product.name}`);

        // Set checking flag
        this.setCheckingStatus(product.id, true);

        const result = await this.scrapePriceWithTarget(
          product.name,
          product.url,
          product.target_price
        );
        if (result && result.price) {
          console.log(`💰 Found price: ${result.price} PLN at ${result.store}`);
          if (result.url) {
            console.log(`🔗 Link: ${result.url}`);
          }
          this.updateProductPrice(
            product.id,
            result.price,
            result.url,
            result.store,
            result.storeUrl
          );
          this.checkPriceAlert(product.id, product.name, result.price);
        } else {
          console.log(`❌ Price not found for ${product.name}`);
          // Update last checked time even if price not found
          this.updateLastChecked(product.id);
        }

        // Reset checking flag
        this.setCheckingStatus(product.id, false);
      } catch (error) {
        console.error(`Error checking price for ${product.name}:`, error);
        // Update last checked time even on error
        this.updateLastChecked(product.id);
        // Reset checking flag on error
        this.setCheckingStatus(product.id, false);
      }
    }
  }

  updateLastChecked(productId) {
    const now = new Date().toISOString();
    const products = this.loadProducts();
    const productIndex = products.findIndex((p) => p.id === productId);
    if (productIndex !== -1) {
      products[productIndex].last_checked = now;
      this.saveProducts(products);
    }
  }

  setCheckingStatus(productId, isChecking) {
    const products = this.loadProducts();
    const productIndex = products.findIndex((p) => p.id === productId);
    if (productIndex !== -1) {
      products[productIndex].is_checking = isChecking;
      this.saveProducts(products);

      // Send checking status update event
      this.emit("product-checking-status-updated", {
        productId,
        isChecking,
        product: products[productIndex],
      });
    }
  }

  startMonitoring() {
    console.log("Price Checker started. Checking prices every hour...");

    // Immediate check on startup
    setTimeout(() => {
      this.checkAllPrices();
    }, 2000);

    // Check every hour
    setInterval(() => {
      this.checkAllPrices();
    }, 60 * 60 * 1000);
  }

  getProducts() {
    return new Promise((resolve) => {
      const products = this.loadProducts();
      resolve(products);
    });
  }

  addProduct(name, targetPrice, url = null) {
    return new Promise((resolve) => {
      const products = this.loadProducts();
      const newProduct = {
        id: Date.now(),
        name: name,
        target_price: targetPrice,
        current_price: null,
        url: url,
        found_url: null,
        last_checked: null,
        is_active: true,
        is_checking: false,
        created_at: new Date().toISOString(),
      };

      products.push(newProduct);
      this.saveProducts(products);

      // Send product added event
      this.emit("product-added", newProduct);

      resolve({ id: newProduct.id });
    });
  }

  deleteProduct(productId) {
    return new Promise((resolve) => {
      const products = this.loadProducts();
      const productToDelete = products.find((p) => p.id === productId);
      const filteredProducts = products.filter((p) => p.id !== productId);
      this.saveProducts(filteredProducts);

      // Send product deleted event
      if (productToDelete) {
        this.emit("product-deleted", { productId, product: productToDelete });
      }

      resolve({ success: true });
    });
  }
}

// Export class for use in Electron
module.exports = PriceChecker;
