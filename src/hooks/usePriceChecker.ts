import { useCallback, useEffect, useRef, useState } from "react";
import { AddProductData, Product } from "../types";
import { AlertLoop, startAlertLoop } from "../lib/audio";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

const electron = (window as any).require?.("electron");
const ipcRenderer = electron?.ipcRenderer;
const shell = electron?.shell;

export function usePriceChecker() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [nextCheckTime, setNextCheckTime] = useState<Date | null>(null);
  const [timeUntilNextCheck, setTimeUntilNextCheck] = useState(0);
  const [isAlertActive, setIsAlertActive] = useState(false);
  const productsRef = useRef<Product[]>([]);
  const alertLoopRef = useRef<AlertLoop | null>(null);

  const syncProducts = useCallback((nextProducts: Product[]) => {
    productsRef.current = nextProducts;
    setProducts(nextProducts);
  }, []);

  const loadProducts = useCallback(async () => {
    if (!ipcRenderer) {
      setMessage("Electron IPC недоступен");
      return;
    }

    try {
      const productsData = await ipcRenderer.invoke("get-products");
      syncProducts(productsData);
    } catch (error) {
      console.error("Error loading products:", error);
      setMessage("Не удалось загрузить товары");
    }
  }, [syncProducts]);

  useEffect(() => {
    if (!ipcRenderer) return;

    loadProducts();

    const initTimer = async () => {
      try {
        const timerStatus = await ipcRenderer.invoke("get-timer-status");
        if (timerStatus.nextCheckTime) {
          setNextCheckTime(new Date(timerStatus.nextCheckTime));
          setTimeUntilNextCheck(timerStatus.timeUntilNextCheck);
        }
      } catch (error) {
        console.error("Error getting timer status:", error);
      }
    };

    const handleProductAdded = (_event: unknown, product: Product) => {
      syncProducts([...productsRef.current, product]);
    };

    const handleProductUpdated = (_event: unknown, updatedProduct: Product) => {
      syncProducts(
        productsRef.current.map((product) =>
          product.id === updatedProduct.id ? updatedProduct : product
        )
      );
    };

    const handleProductDeleted = (
      _event: unknown,
      { productId }: { productId: number }
    ) => {
      syncProducts(productsRef.current.filter((product) => product.id !== productId));
    };

    const handleCheckingStatusUpdated = (
      _event: unknown,
      { productId, isChecking }: { productId: number; isChecking: boolean }
    ) => {
      syncProducts(
        productsRef.current.map((product) =>
          product.id === productId
            ? { ...product, is_checking: isChecking }
            : product
        )
      );
    };

    const handleTimerUpdated = (
      _event: unknown,
      data: { nextCheckTime: string; timeUntilNextCheck: number }
    ) => {
      setNextCheckTime(new Date(data.nextCheckTime));
      setTimeUntilNextCheck(data.timeUntilNextCheck);
    };

    const handlePlayAlertSound = (_event: unknown, soundPath: string) => {
      if (alertLoopRef.current) return; // already looping
      alertLoopRef.current = startAlertLoop(soundPath);
      setIsAlertActive(true);
    };

    initTimer();
    ipcRenderer.on("product-added", handleProductAdded);
    ipcRenderer.on("product-updated", handleProductUpdated);
    ipcRenderer.on("product-deleted", handleProductDeleted);
    ipcRenderer.on("product-checking-status-updated", handleCheckingStatusUpdated);
    ipcRenderer.on("timer-updated", handleTimerUpdated);
    ipcRenderer.on("play-alert-sound", handlePlayAlertSound);

    return () => {
      ipcRenderer.removeListener("product-added", handleProductAdded);
      ipcRenderer.removeListener("product-updated", handleProductUpdated);
      ipcRenderer.removeListener("product-deleted", handleProductDeleted);
      ipcRenderer.removeListener(
        "product-checking-status-updated",
        handleCheckingStatusUpdated
      );
      ipcRenderer.removeListener("timer-updated", handleTimerUpdated);
      ipcRenderer.removeListener("play-alert-sound", handlePlayAlertSound);
    };
  }, [loadProducts, syncProducts]);

  const addProduct = useCallback(
    async (productData: AddProductData) => {
      if (!ipcRenderer) return false;

      setLoading(true);
      setMessage("");

      try {
        const result = await ipcRenderer.invoke("add-product", productData);
        if (!result.success) {
          setMessage(result.error || "Не удалось добавить товар");
          return false;
        }

        setMessage(`Товар «${productData.name}» добавлен. Запускаю проверку.`);

        if (productsRef.current.length === 0) {
          const nextCheck = new Date(Date.now() + CHECK_INTERVAL_MS);
          setNextCheckTime(nextCheck);
          setTimeUntilNextCheck(CHECK_INTERVAL_MS);
        }

        window.setTimeout(async () => {
          try {
            const checkResult = await ipcRenderer.invoke("check-prices-now");
            if (checkResult.success) {
              setMessage(`Товар «${productData.name}» добавлен и проверен`);
              const nextCheck = new Date(Date.now() + CHECK_INTERVAL_MS);
              setNextCheckTime(nextCheck);
              setTimeUntilNextCheck(CHECK_INTERVAL_MS);
            } else {
              setMessage(checkResult.error || "Товар добавлен, но проверка не удалась");
            }
          } catch (error) {
            console.error("Error checking prices for new product:", error);
            setMessage("Товар добавлен, но проверка не удалась");
          }
        }, 1000);

        return true;
      } catch (error) {
        console.error("Error adding product:", error);
        setMessage("Не удалось добавить товар");
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteProduct = useCallback(async (productId: number) => {
    if (!ipcRenderer) return;
    if (!window.confirm("Удалить этот товар из отслеживания?")) return;

    try {
      const result = await ipcRenderer.invoke("delete-product", productId);
      setMessage(result.success ? "Товар удалён" : result.error || "Не удалось удалить товар");
    } catch (error) {
      console.error("Error deleting product:", error);
      setMessage("Не удалось удалить товар");
    }
  }, []);

  const checkPricesNow = useCallback(async () => {
    if (!ipcRenderer) return;

    setLoading(true);
    setMessage("");

    try {
      const result = await ipcRenderer.invoke("check-prices-now");
      if (result.success) {
        setMessage("Проверка цен запущена");
        await ipcRenderer.invoke("restart-timer");
      } else {
        setMessage(result.error || "Не удалось проверить цены");
      }
    } catch (error) {
      console.error("Error checking prices:", error);
      setMessage("Не удалось проверить цены");
    } finally {
      setLoading(false);
    }
  }, []);

  const checkProductPrice = useCallback(async (productId: number) => {
    if (!ipcRenderer) return;
    try {
      await ipcRenderer.invoke("check-product-price", productId);
    } catch (error) {
      console.error("Error checking product price:", error);
    }
  }, []);

  const openExternalLink = useCallback((url: string) => {
    shell?.openExternal(url);
  }, []);

  const dismissMessage = useCallback(() => setMessage(""), []);

  const stopAlert = useCallback(() => {
    alertLoopRef.current?.stop();
    alertLoopRef.current = null;
    setIsAlertActive(false);
  }, []);

  return {
    products,
    loading,
    message,
    nextCheckTime,
    timeUntilNextCheck,
    isAlertActive,
    addProduct,
    deleteProduct,
    checkPricesNow,
    checkProductPrice,
    openExternalLink,
    dismissMessage,
    stopAlert,
  };
}
