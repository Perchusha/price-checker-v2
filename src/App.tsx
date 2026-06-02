import React, { useState } from "react";
import {
  Bell,
  Clock3,
  Loader2,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import "./index.css";
import AddProductForm from "./components/AddProductForm";
import ProductList from "./components/ProductList";
import { SettingsDialog } from "./components/SettingsDialog";
import { Alert } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
import { Progress } from "./components/ui/progress";
import {
  formatTimeUntilNextCheck,
  getTimerProgress,
} from "./lib/product-view";
import { usePriceChecker } from "./hooks/usePriceChecker";
import { Product, UpdateProductData } from "./types";

function App() {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const {
    products,
    loading,
    message,
    nextCheckTime,
    timeUntilNextCheck,
    isAlertActive,
    addProduct,
    updateProduct,
    deleteProduct,
    checkPricesNow,
    checkProductPrice,
    openExternalLink,
    dismissMessage,
    stopAlert,
  } = usePriceChecker();

  const handleAddProduct = async (...args: Parameters<typeof addProduct>) => {
    const success = await addProduct(...args);
    if (success) setAddDialogOpen(false);
    return success;
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setEditDialogOpen(true);
  };

  const handleUpdateProduct = async (productData: UpdateProductData) => {
    if (!editingProduct) return false;

    const success = await updateProduct(editingProduct.id, productData);
    if (success) {
      setEditDialogOpen(false);
      setEditingProduct(null);
    }
    return success;
  };

  const handleEditDialogChange = (open: boolean) => {
    setEditDialogOpen(open);
    if (!open) setEditingProduct(null);
  };

  const activeChecks = products.filter((product) => product.is_checking).length;
  const foundPrices = products.filter((product) => product.current_price != null).length;

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b border-border bg-card/70 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Bell className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-base font-semibold">Price Checker</h1>
                  <p className="text-xs text-muted-foreground">
                    {products.length} товаров · {foundPrices} с найденной ценой
                  </p>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <SettingsDialog />

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={checkPricesNow}
                disabled={loading || products.length === 0}
                title="Проверить цены сейчас"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Проверить
              </Button>

              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" size="sm" title="Добавить товар">
                    <Plus className="h-4 w-4" />
                    Добавить
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Новый товар</DialogTitle>
                    <DialogDescription>
                      Укажите название, целевую цену и ссылку, если она есть.
                    </DialogDescription>
                  </DialogHeader>
                  <AddProductForm
                    onSubmit={handleAddProduct}
                    loading={loading}
                    submitLabel="Добавить"
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0 rounded-md border border-border bg-background px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" />
                  <span className="truncate">Следующая проверка</span>
                </div>
                <span className="shrink-0 text-xs font-medium text-foreground">
                  {nextCheckTime
                    ? formatTimeUntilNextCheck(timeUntilNextCheck)
                    : "не запланирована"}
                </span>
              </div>
              <Progress value={getTimerProgress(timeUntilNextCheck)} />
            </div>

            <div className="w-24 rounded-md border border-border bg-background px-3 py-2 text-right">
              <div className="text-[10px] uppercase text-muted-foreground">
                Активно
              </div>
              <div className="text-sm font-semibold text-foreground">
                {activeChecks}
              </div>
            </div>
          </div>

          {message && (
            <Alert className="mt-2 flex items-center justify-between gap-2 border-primary/30 bg-primary/10 text-primary">
              <span className="min-w-0 truncate">{message}</span>
              <button
                type="button"
                className="rounded p-0.5 text-primary/70 hover:bg-primary/10 hover:text-primary"
                onClick={dismissMessage}
                title="Скрыть сообщение"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Alert>
          )}
        </header>

        {isAlertActive && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-red-500/30 bg-red-500/10 px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-medium text-red-500">
              <span className="animate-pulse text-base leading-none">●</span>
              Найдена цена ниже целевой!
            </div>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-7 px-3 text-xs"
              onClick={stopAlert}
            >
              Остановить
            </Button>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-hidden py-3">
          <ProductList
            products={products}
            onDeleteProduct={deleteProduct}
            onOpenLink={openExternalLink}
            onCheckProduct={checkProductPrice}
            onEditProduct={handleEditProduct}
          />
        </main>

        <Dialog open={editDialogOpen} onOpenChange={handleEditDialogChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Редактировать товар</DialogTitle>
              <DialogDescription>
                Изменения сохранятся без автоматической проверки цены.
              </DialogDescription>
            </DialogHeader>
            {editingProduct && (
              <AddProductForm
                onSubmit={handleUpdateProduct}
                loading={loading}
                initialProduct={editingProduct}
                submitLabel="Сохранить"
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default App;
