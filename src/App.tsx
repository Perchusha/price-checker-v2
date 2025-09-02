import React, { useState, useEffect, useCallback, useRef } from "react";
import "./index.css";
import ProductList from "./components/ProductList";
import AddProductForm from "./components/AddProductForm";
import { Product, AddProductData } from "./types";
import { FaPlay, FaPlus } from "react-icons/fa";

const { ipcRenderer, shell } = window.require("electron");

function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [nextCheckTime, setNextCheckTime] = useState<Date | null>(null);
  const [timeUntilNextCheck, setTimeUntilNextCheck] = useState<number>(0);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const productsRef = useRef<Product[]>([]);
  const [, forceUpdate] = useState({});

  // Function for forced update
  const triggerUpdate = useCallback(() => {
    forceUpdate({});
  }, []);

  // Listen to events from PriceChecker
  const handleProductAdded = useCallback(
    (event: any, product: Product) => {
      productsRef.current = [...productsRef.current, product];
      triggerUpdate();
    },
    [triggerUpdate]
  );

  const handleProductUpdated = useCallback(
    (event: any, updatedProduct: Product) => {
      console.log(`🔄 Product updated:`, {
        id: updatedProduct.id,
        name: updatedProduct.name,
        is_checking: updatedProduct.is_checking,
        current_price: updatedProduct.current_price,
        timestamp: new Date().toLocaleTimeString(),
      });
      productsRef.current = productsRef.current.map((p) =>
        p.id === updatedProduct.id ? updatedProduct : p
      );
      triggerUpdate();
    },
    [triggerUpdate]
  );

  const handleProductDeleted = useCallback(
    (event: any, { productId }: { productId: number }) => {
      productsRef.current = productsRef.current.filter(
        (p) => p.id !== productId
      );
      triggerUpdate();
    },
    [triggerUpdate]
  );

  const handleCheckingStatusUpdated = useCallback(
    (
      event: any,
      { productId, isChecking }: { productId: number; isChecking: boolean }
    ) => {
      console.log(`⚡ Checking status changed:`, {
        productId,
        isChecking,
        timestamp: new Date().toLocaleTimeString(),
      });
      productsRef.current = productsRef.current.map((p) =>
        p.id === productId ? { ...p, is_checking: isChecking } : p
      );
      triggerUpdate();
    },
    [triggerUpdate]
  );

  useEffect(() => {
    loadProducts();

    // Get initial timer status from Electron
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

    initTimer();

    // Register event listeners
    ipcRenderer.on("product-added", handleProductAdded);
    ipcRenderer.on("product-updated", handleProductUpdated);
    ipcRenderer.on("product-deleted", handleProductDeleted);
    ipcRenderer.on(
      "product-checking-status-updated",
      handleCheckingStatusUpdated
    );
    ipcRenderer.on(
      "timer-updated",
      (_: any, data: { nextCheckTime: string; timeUntilNextCheck: number }) => {
        setNextCheckTime(new Date(data.nextCheckTime));
        setTimeUntilNextCheck(data.timeUntilNextCheck);
      }
    );

    return () => {
      // Remove event listeners
      ipcRenderer.removeListener("product-added", handleProductAdded);
      ipcRenderer.removeListener("product-updated", handleProductUpdated);
      ipcRenderer.removeListener("product-deleted", handleProductDeleted);
      ipcRenderer.removeListener(
        "product-checking-status-updated",
        handleCheckingStatusUpdated
      );
      ipcRenderer.removeListener("timer-updated", () => {});
    };
  }, []);

  // No need to periodically update products - updates come through events

  const loadProducts = async () => {
    try {
      const productsData = await ipcRenderer.invoke("get-products");
      productsRef.current = productsData;
      setProducts(productsData);
    } catch (error) {
      console.error("Error loading products:", error);
      setMessage("Error loading products");
    }
  };

  const handleAddProduct = async (productData: AddProductData) => {
    console.log("handleAddProduct called, setting loading to true");
    setLoading(true);
    setMessage("");
    try {
      const result = await ipcRenderer.invoke("add-product", productData);
      if (result.success) {
        setMessage(`Product "${productData.name}" added! Checking prices...`);
        console.log("Product added successfully");

        // If this is the first product, set next check time
        if (products.length === 0) {
          const now = new Date();
          const nextCheck = new Date(now.getTime() + 60 * 60 * 1000); // +1 час
          setNextCheckTime(nextCheck);
          setTimeUntilNextCheck(60 * 60 * 1000);
        }

        // Hide form after successful addition
        setShowAddForm(false);

        // Immediately check prices for new product
        setTimeout(async () => {
          try {
            console.log(
              `🔍 Checking prices for new product: ${productData.name}`
            );
            const checkResult = await ipcRenderer.invoke("check-prices-now");
            console.log("✅ Price check completed:", checkResult);
            setMessage(`Product "${productData.name}" added and checked!`);

            // Update next check time
            const now = new Date();
            const nextCheck = new Date(now.getTime() + 60 * 60 * 1000); // +1 час
            setNextCheckTime(nextCheck);
            setTimeUntilNextCheck(60 * 60 * 1000);
            console.log("⏰ Next check time updated");

            // Products update automatically through events
          } catch (error) {
            console.error("Error checking prices for new product:", error);
            setMessage(`Product "${productData.name}" added, but check failed`);
          }
        }, 1000); // Small delay so product can be saved
      } else {
        setMessage(result.error || "Error adding product");
        console.log("Product addition failed:", result.error);
      }
    } catch (error) {
      console.error("Error adding product:", error);
      setMessage("Error adding product");
    } finally {
      console.log("handleAddProduct finished, setting loading to false");
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    if (window.confirm("Are you sure you want to delete this product?")) {
      try {
        const result = await ipcRenderer.invoke("delete-product", productId);
        if (result.success) {
          setMessage("Product deleted");
        } else {
          setMessage(result.error || "Error deleting product");
        }
      } catch (error) {
        console.error("Error deleting product:", error);
        setMessage("Error deleting product");
      }
    }
  };

  const handleCheckPricesNow = async () => {
    console.log(`🚀 Starting price check:`, {
      timestamp: new Date().toLocaleTimeString(),
      productsCount: productsRef.current.length,
    });
    setLoading(true);
    setMessage("");
    try {
      const result = await ipcRenderer.invoke("check-prices-now");
      if (result.success) {
        setMessage("Price check started in background");
        // Restart timer after manual check
        await ipcRenderer.invoke("restart-timer");
        // Products update automatically through events
      } else {
        setMessage(result.error || "Error checking prices");
      }
    } catch (error) {
      console.error("Error checking prices:", error);
      setMessage("Error checking prices");
    } finally {
      setLoading(false);
    }
  };

  const openExternalLink = (url: string) => {
    shell.openExternal(url);
  };

  const formatTimeUntilNextCheck = (milliseconds: number) => {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <div className="h-screen bg-gray-50 relative overflow-hidden">
      <div className="h-full flex flex-col">
        {/* Compact header with messages */}
        <div className="flex-shrink-0 px-4 py-2">
          {message && (
            <div className="mb-2 p-2 bg-blue-100 border border-blue-400 text-blue-700 rounded text-sm">
              {message}
            </div>
          )}

          {/* Compact progress bar */}
          {nextCheckTime && (
            <div className="mb-2 p-2 bg-white rounded shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-medium text-gray-700">
                  Next check
                </h3>
                <span className="text-xs text-gray-500">
                  {formatTimeUntilNextCheck(timeUntilNextCheck)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-1000"
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(
                        100,
                        ((60 * 60 * 1000 - timeUntilNextCheck) /
                          (60 * 60 * 1000)) *
                          100
                      )
                    )}%`,
                  }}
                ></div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 relative">
          {/* Add product form */}
          {showAddForm ? (
            <>
              <button
                onClick={() => setShowAddForm(false)}
                className="absolute top-0 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              <AddProductForm
                onAddProduct={handleAddProduct}
                loading={loading}
              />
            </>
          ) : (
            <ProductList
              products={productsRef.current}
              onDeleteProduct={handleDeleteProduct}
              onCheckPricesNow={handleCheckPricesNow}
              onOpenLink={openExternalLink}
              loading={loading}
              nextCheckTime={nextCheckTime}
              timeUntilNextCheck={timeUntilNextCheck}
            />
          )}
        </div>
      </div>

      {/* Buttons - absolute positioning at bottom */}
      {!showAddForm && (
        <div className="fixed bottom-4 right-[50%] translate-x-[50%] flex gap-2 z-50">
          <button
            onClick={handleCheckPricesNow}
            className="w-10 h-10 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
            title="Check prices now"
          >
            <FaPlay className="w-2.5 h-2.5" />
          </button>

          {/* Add product button */}
          <button
            onClick={() => setShowAddForm(true)}
            className="w-10 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
            title="Add product"
          >
            <FaPlus className="w-2.5 h-2.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
