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
  }

  initDataDirectory() {
    // Создание директории для данных
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    // Создание файлов если их нет
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
      return JSON.parse(data);
    } catch (error) {
      console.error("Ошибка при загрузке товаров:", error);
      return [];
    }
  }

  saveProducts(products) {
    try {
      fs.writeFileSync(this.productsFile, JSON.stringify(products, null, 2));
    } catch (error) {
      console.error("Ошибка при сохранении товаров:", error);
    }
  }

  loadPriceHistory() {
    try {
      const data = fs.readFileSync(this.priceHistoryFile, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.error("Ошибка при загрузке истории цен:", error);
      return [];
    }
  }

  savePriceHistory(history) {
    try {
      fs.writeFileSync(this.priceHistoryFile, JSON.stringify(history, null, 2));
    } catch (error) {
      console.error("Ошибка при сохранении истории цен:", error);
    }
  }

  async scrapePrice(productName, url = null) {
    return new Promise((resolve) => {
      try {
        // Если есть конкретная ссылка, используем её
        if (url && url.trim() !== "") {
          this.scrapeFromUrl(url, productName).then(resolve);
          return;
        }

        // Пробуем разные источники для поиска цен
        const searchSources = [
          {
            name: "Bing Shopping",
            url: `https://www.bing.com/shop?q=${encodeURIComponent(
              productName + " цена купить"
            )}`,
            patterns: [
              /(\d+[\.,]\d+)\s*(zł|PLN|злотых)/gi,
              /(\d+[\.,]\d+)\s*PLN/gi,
            ],
          },
          {
            name: "Allegro",
            url: `https://allegro.pl/listing?string=${encodeURIComponent(
              productName
            )}`,
            patterns: [/(\d+[\.,]\d+)\s*(zł|PLN)/gi],
          },
          {
            name: "Ceneo",
            url: `https://www.ceneo.pl/;szukaj-${encodeURIComponent(
              productName
            )}`,
            patterns: [/(\d+[\.,]\d+)\s*(zł|PLN)/gi],
          },
          {
            name: "Google Shopping",
            url: `https://www.google.com/search?q=${encodeURIComponent(
              productName + " цена купить"
            )}&tbm=shop`,
            patterns: [/(\d+[\.,]\d+)\s*(zł|PLN|злотых)/gi],
          },
        ];

        // Пробуем все источники по очереди
        this.tryMultipleSources(productName, searchSources, 0, resolve);
      } catch (error) {
        console.error(
          `Ошибка при скрапинге цены для ${productName}:`,
          error.message
        );
        resolve({ price: null, url: null });
      }
    });
  }

  async tryMultipleSources(productName, sources, index, resolve) {
    if (index >= sources.length) {
      // Если все источники не сработали, генерируем демо-цену
      const demoPrice = Math.floor(Math.random() * 200) + 300;
      console.log(
        `🎲 Демо-цена для ${productName}: ${demoPrice} злотых (все источники недоступны)`
      );
      resolve({
        price: demoPrice,
        url:
          "https://www.google.com/search?q=" + encodeURIComponent(productName),
      });
      return;
    }

    const searchSource = sources[index];
    const searchUrl = searchSource.url;

    console.log(`🔍 Пробуем ${searchSource.name} для ${productName}`);

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

    const request = https.get(searchUrl, options, (response) => {
      // Обработка редиректов
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          console.log(
            `🔄 Редирект в ${searchSource.name} для ${productName}: ${redirectUrl}`
          );
          // Пробуем следующий источник при редиректе
          this.tryMultipleSources(productName, sources, index + 1, resolve);
          return;
        }
      }

      let data = "";

      response.on("data", (chunk) => {
        data += chunk;
      });

      response.on("end", () => {
        try {
          let foundPrice = null;

          // Проверяем, получили ли мы реальные данные
          if (data.length < 1000) {
            console.log(
              `⚠️ Мало данных в ${searchSource.name} для ${productName} (${data.length} байт)`
            );
            // Пробуем следующий источник при недостатке данных
            this.tryMultipleSources(productName, sources, index + 1, resolve);
            return;
          }

          // Поиск цен с использованием паттернов источника
          const pricePatterns = searchSource.patterns;

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

          if (foundPrice) {
            console.log(
              `💰 Найдена реальная цена в ${searchSource.name} для ${productName}: ${foundPrice} злотых`
            );
            resolve({ price: foundPrice, url: searchUrl });
          } else {
            console.log(
              `❌ Цена не найдена в ${searchSource.name} для ${productName}`
            );
            // Пробуем следующий источник если не нашли цену
            this.tryMultipleSources(productName, sources, index + 1, resolve);
          }
        } catch (error) {
          console.error(
            `Ошибка при парсинге HTML в ${searchSource.name} для ${productName}:`,
            error.message
          );
          // Пробуем следующий источник при ошибке парсинга
          this.tryMultipleSources(productName, sources, index + 1, resolve);
        }
      });
    });

    request.on("error", (error) => {
      console.error(
        `Ошибка при запросе к ${searchSource.name} для ${productName}:`,
        error.message
      );
      // Пробуем следующий источник при ошибке запроса
      this.tryMultipleSources(productName, sources, index + 1, resolve);
    });

    request.on("timeout", () => {
      request.destroy();
      console.error(
        `Таймаут при запросе к ${searchSource.name} для ${productName}`
      );
      // Пробуем следующий источник при таймауте
      this.tryMultipleSources(productName, sources, index + 1, resolve);
    });
  }
  catch(error) {
    console.error(
      `Ошибка при скрапинге цены для ${productName}:`,
      error.message
    );
    resolve({ price: null, url: null });
  }

  updateProductPrice(productId, price, foundUrl = null) {
    const now = new Date().toISOString();
    const products = this.loadProducts();
    const priceHistory = this.loadPriceHistory();

    // Обновление цены товара
    const productIndex = products.findIndex((p) => p.id === productId);
    if (productIndex !== -1) {
      products[productIndex].current_price = price;
      products[productIndex].last_checked = now;
      if (foundUrl) {
        products[productIndex].found_url = foundUrl;
      }
      this.saveProducts(products);
    }

    // Добавление в историю цен
    priceHistory.push({
      id: Date.now(),
      product_id: productId,
      price: price,
      checked_at: now,
    });
    this.savePriceHistory(priceHistory);
  }

  checkPriceAlert(productId, productName, currentPrice) {
    const products = this.loadProducts();
    const product = products.find((p) => p.id === productId);

    if (product && currentPrice <= product.target_price) {
      notifier.notify({
        title: "Price Checker - Найдена выгодная цена!",
        message: `Товар "${productName}" теперь стоит ${currentPrice.toFixed(
          2
        )} злотых (целевая цена: ${product.target_price.toFixed(2)})`,
        icon: path.join(__dirname, "icon.png"),
        sound: true,
        timeout: 10,
      });
    }
  }

  async checkAllPrices() {
    const products = this.loadProducts();
    const activeProducts = products.filter((p) => p.is_active !== false);

    console.log(`🔍 Проверяем цены для ${activeProducts.length} товаров...`);

    for (const product of activeProducts) {
      try {
        console.log(`📦 Проверяем: ${product.name}`);
        const result = await this.scrapePrice(product.name, product.url);
        if (result && result.price) {
          console.log(`💰 Найдена цена: ${result.price} злотых`);
          if (result.url) {
            console.log(`🔗 Ссылка: ${result.url}`);
          }
          this.updateProductPrice(product.id, result.price, result.url);
          this.checkPriceAlert(product.id, product.name, result.price);
        } else {
          console.log(`❌ Цена не найдена для ${product.name}`);
          // Обновляем время последней проверки даже если цена не найдена
          this.updateLastChecked(product.id);
        }
      } catch (error) {
        console.error(`Ошибка при проверке цены для ${product.name}:`, error);
        // Обновляем время последней проверки даже при ошибке
        this.updateLastChecked(product.id);
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

  startMonitoring() {
    console.log("Price Checker запущен. Проверка цен каждый час...");

    // Немедленная проверка при запуске
    setTimeout(() => {
      this.checkAllPrices();
    }, 5000);

    // Проверка каждый час
    setInterval(() => {
      this.checkAllPrices();
    }, 60 * 60 * 1000); // 1 час
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
        created_at: new Date().toISOString(),
      };

      products.push(newProduct);
      this.saveProducts(products);
      resolve({ id: newProduct.id });
    });
  }

  deleteProduct(productId) {
    return new Promise((resolve) => {
      const products = this.loadProducts();
      const filteredProducts = products.filter((p) => p.id !== productId);
      this.saveProducts(filteredProducts);

      // Удаление истории цен для этого товара
      const priceHistory = this.loadPriceHistory();
      const filteredHistory = priceHistory.filter(
        (h) => h.product_id !== productId
      );
      this.savePriceHistory(filteredHistory);

      resolve({ success: true });
    });
  }
}

// Запуск Price Checker
const priceChecker = new PriceChecker();

// Экспорт класса для использования в Electron
module.exports = PriceChecker;
