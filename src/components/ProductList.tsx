import React from "react";
import {
  ExternalLink,
  Link2,
  Loader2,
  PackageSearch,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Product } from "../types";
import {
  formatDateTime,
  formatPrice,
  getProductStatus,
  isTargetReached,
} from "../lib/product-view";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

interface ProductListProps {
  products: Product[];
  onDeleteProduct: (productId: number) => Promise<void>;
  onOpenLink: (url: string) => void;
  onCheckProduct: (productId: number) => void;
  onEditProduct: (product: Product) => void;
}

const statusVariantByTone = {
  checking: "default",
  ok: "success",
  warning: "warning",
  danger: "destructive",
  muted: "muted",
} as const;

const ProductList: React.FC<ProductListProps> = ({
  products,
  onDeleteProduct,
  onOpenLink,
  onCheckProduct,
  onEditProduct,
}) => {
  if (products.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-card">
            <PackageSearch className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Список пуст</h2>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Добавьте товар, чтобы отслеживать текущую цену и быстро открывать найденный магазин.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto px-3 pb-3">
      <div className="space-y-2">
        {products.map((product) => {
          const status = getProductStatus(product);
          const StatusIcon = status.icon;
          const targetReached = isTargetReached(product);

          return (
            <Card
              key={product.id}
              className={cn(
                "p-3",
                product.is_checking && "border-primary/70 shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]"
              )}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {product.name}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Проверено: {formatDateTime(product.last_checked)}
                  </p>
                </div>

                <Badge variant={statusVariantByTone[status.tone]} className="shrink-0">
                  <StatusIcon
                    className={cn(
                      "h-3 w-3",
                      status.tone === "checking" && "animate-spin"
                    )}
                  />
                  {status.label}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                <div className="min-w-0 rounded-md border border-border bg-background px-2 py-1.5">
                  <div className="text-[10px] uppercase text-muted-foreground">
                    Цель
                  </div>
                  <div className="truncate text-sm font-semibold text-foreground">
                    {formatPrice(product.target_price)}
                  </div>
                </div>
                <div className="min-w-0 rounded-md border border-border bg-background px-2 py-1.5">
                  <div className="text-[10px] uppercase text-muted-foreground">
                    Сейчас
                  </div>
                  <div
                    className={cn(
                      "truncate text-sm font-semibold",
                      product.current_price == null && "text-muted-foreground",
                      product.current_price != null &&
                        (targetReached ? "text-emerald-400" : "text-foreground")
                    )}
                  >
                    {formatPrice(product.current_price)}
                  </div>
                  {product.found_store && (
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {product.found_store}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-end gap-1.5">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  disabled={product.is_checking}
                  onClick={() => onCheckProduct(product.id)}
                  title="Проверить цену сейчас"
                >
                  {product.is_checking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  <span className="sr-only">Проверить</span>
                </Button>

                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={() => onEditProduct(product)}
                  title="Редактировать товар"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="sr-only">Редактировать</span>
                </Button>

                {product.found_url && (
                  <Button
                    type="button"
                    size="icon"
                    onClick={() => onOpenLink(product.found_url!)}
                    title={product.found_store || "Открыть найденный товар"}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="sr-only">Открыть найденный товар</span>
                  </Button>
                )}

                {product.url && (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    onClick={() => onOpenLink(product.url!)}
                    title="Открыть исходную ссылку"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Открыть исходную ссылку</span>
                  </Button>
                )}

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:text-red-400"
                  onClick={() => onDeleteProduct(product.id)}
                  title="Удалить товар"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="sr-only">Удалить</span>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ProductList;
