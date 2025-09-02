const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  ipcMain,
} = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");
const { spawn } = require("child_process");

// Импорт модуля для работы с ценами
const PriceChecker = require("./price-checker.js");
const priceChecker = new PriceChecker();

let mainWindow;
let tray;

function createWindow() {
  // Создание окна браузера
  mainWindow = new BrowserWindow({
    width: 640,
    height: 320,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
    icon: path.join(__dirname, "icon.png"),
    show: false,
    autoHideMenuBar: true,
    resizable: false,
  });

  // Загрузка приложения
  const startUrl = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../build/index.html")}`;

  mainWindow.loadURL(startUrl);

  // Показать окно когда готово
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    // Передаем ссылку на окно в PriceChecker для отправки событий
    priceChecker.setMainWindow(mainWindow);
  });

  // Скрыть в трей при закрытии
  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  // Создание иконки для трея
  const iconPath = path.join(__dirname, "icon.png");
  const trayIcon = nativeImage.createFromPath(iconPath);

  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Показать Price Checker",
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: "Скрыть",
      click: () => {
        mainWindow.hide();
      },
    },
    { type: "separator" },
    {
      label: "Выход",
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Price Checker - Мониторинг цен");
  tray.setContextMenu(contextMenu);

  // Двойной клик для показа окна
  tray.on("double-click", () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

function startPriceChecker() {
  // Инициализация и запуск мониторинга цен
  priceChecker.initDataDirectory();
  priceChecker.startMonitoring();
  priceChecker.startTimer(); // Запускаем таймер
}

// IPC обработчики
ipcMain.handle("get-products", async () => {
  try {
    const products = await priceChecker.getProducts();
    return products;
  } catch (error) {
    console.error("Ошибка при получении товаров:", error);
    return [];
  }
});

ipcMain.handle("add-product", async (event, product) => {
  try {
    const result = await priceChecker.addProduct(
      product.name,
      product.targetPrice,
      product.url
    );
    return { success: true, id: result.id };
  } catch (error) {
    console.error("Ошибка при добавлении товара:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("delete-product", async (event, productId) => {
  try {
    const result = await priceChecker.deleteProduct(productId);
    return result;
  } catch (error) {
    console.error("Ошибка при удалении товара:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("check-prices-now", async () => {
  try {
    await priceChecker.checkAllPrices();
    return { success: true };
  } catch (error) {
    console.error("Ошибка при проверке цен:", error);
    return { success: false, error: error.message };
  }
});

// Получение статуса таймера
ipcMain.handle("get-timer-status", async () => {
  try {
    return priceChecker.getTimerStatus();
  } catch (error) {
    console.error("Ошибка при получении статуса таймера:", error);
    return { nextCheckTime: null, timeUntilNextCheck: 0 };
  }
});

// Перезапуск таймера
ipcMain.handle("restart-timer", async () => {
  try {
    priceChecker.startTimer();
    return { success: true };
  } catch (error) {
    console.error("Ошибка при перезапуске таймера:", error);
    return { success: false, error: error.message };
  }
});

// События приложения
app.whenReady().then(() => {
  createWindow();
  createTray();
  startPriceChecker();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  app.isQuiting = true;
});

// Предотвращение множественных экземпляров
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
