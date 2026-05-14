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

const PriceChecker = require("./price-checker.js");
const SettingsManager = require("./settings-manager.js");

const priceChecker = new PriceChecker(app.getPath("userData"));
const settingsManager = new SettingsManager(app.getPath("userData"));

let mainWindow;
let tray;

const appIconPath = path.join(__dirname, "logo.png");
const alertIconPath = path.join(__dirname, "logo-alert.png");

function normalTrayIcon() {
  return nativeImage.createFromPath(appIconPath).resize({ width: 16, height: 16 });
}
function alertTrayIcon() {
  return nativeImage.createFromPath(alertIconPath).resize({ width: 16, height: 16 });
}

function resetTrayAlert() {
  if (tray) {
    tray.setImage(normalTrayIcon());
    tray.setToolTip("Price Checker — Мониторинг цен");
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 640,
    height: 760,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
    icon: appIconPath,
    show: false,
    autoHideMenuBar: true,
    resizable: false,
  });

  const startUrl = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../build/index.html")}`;

  mainWindow.loadURL(startUrl);

  mainWindow.once("ready-to-show", () => {
    const settings = settingsManager.load();
    if (!settings.startMinimized) {
      mainWindow.show();
    }
    priceChecker.setMainWindow(mainWindow);
  });

  // Reset tray alert when user opens the window
  mainWindow.on("show", () => {
    resetTrayAlert();
  });

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
  tray = new Tray(normalTrayIcon());

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

  tray.setToolTip("Price Checker — Мониторинг цен");
  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

function setupAlertHandler() {
  priceChecker.onAlert = ({ productName, currentPrice, targetPrice }) => {
    // 1. Change tray icon
    if (tray) {
      tray.setImage(alertTrayIcon());
      tray.setToolTip(`Price Checker — Найдена цена!\n${productName}: ${currentPrice.toFixed(2)} PLN`);
    }

    // 2. Balloon tip in tray (works even when Windows notifications are off)
    if (tray) {
      tray.displayBalloon({
        title: "Price Checker — Найдена цена!",
        content: `«${productName}»\n${currentPrice.toFixed(2)} PLN (цель: ${targetPrice.toFixed(2)} PLN)`,
        iconType: "warning",
        noSound: false,
      });
    }

    // 3. Sound via renderer (appears in Windows volume mixer)
    const settings = settingsManager.load();
    if (settings.soundEnabled && mainWindow) {
      mainWindow.webContents.send(
        "play-alert-sound",
        settings.selectedSound || ""
      );
    }
  };
}

function startPriceChecker() {
  priceChecker.initDataDirectory();
  setupAlertHandler();
  priceChecker.startMonitoring();
  priceChecker.startTimer();
}

// IPC обработчики
ipcMain.handle("get-products", async () => {
  try {
    return await priceChecker.getProducts();
  } catch (error) {
    console.error("Ошибка при получении товаров:", error);
    return [];
  }
});

ipcMain.handle("add-product", async (event, product) => {
  try {
    const result = await priceChecker.addProduct(product.name, product.targetPrice, product.url);
    return { success: true, id: result.id };
  } catch (error) {
    console.error("Ошибка при добавлении товара:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("delete-product", async (event, productId) => {
  try {
    return await priceChecker.deleteProduct(productId);
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

ipcMain.handle("check-product-price", async (event, productId) => {
  try {
    await priceChecker.checkProductById(productId);
    return { success: true };
  } catch (error) {
    console.error("Ошибка при проверке товара:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("get-timer-status", async () => {
  try {
    return priceChecker.getTimerStatus();
  } catch (error) {
    console.error("Ошибка при получении статуса таймера:", error);
    return { nextCheckTime: null, timeUntilNextCheck: 0 };
  }
});

ipcMain.handle("restart-timer", async () => {
  try {
    priceChecker.startTimer();
    return { success: true };
  } catch (error) {
    console.error("Ошибка при перезапуске таймера:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("get-settings", async () => {
  try {
    const settings = settingsManager.load();
    const autostart = app.getLoginItemSettings().openAtLogin;
    return { ...settings, autostart };
  } catch (error) {
    console.error("Ошибка при получении настроек:", error);
    return { autostart: false, startMinimized: false, soundEnabled: true, selectedSound: "" };
  }
});

ipcMain.handle("save-settings", async (event, settings) => {
  try {
    const saved = settingsManager.save(settings);
    app.setLoginItemSettings({ openAtLogin: !!settings.autostart });
    return { success: saved };
  } catch (error) {
    console.error("Ошибка при сохранении настроек:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("get-available-sounds", async () => {
  try {
    return settingsManager.getAvailableSounds();
  } catch (error) {
    console.error("Ошибка при получении звуков:", error);
    return [];
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  startPriceChecker();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  app.isQuiting = true;
});

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
