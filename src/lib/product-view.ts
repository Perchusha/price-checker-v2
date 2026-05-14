import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { Product } from "../types";

export type ProductStatusTone = "checking" | "ok" | "warning" | "danger" | "muted";

export interface ProductStatusView {
  label: string;
  tone: ProductStatusTone;
  icon: LucideIcon;
}

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function getTimerProgress(timeUntilNextCheck: number) {
  if (timeUntilNextCheck <= 0) return 100;
  return Math.max(
    0,
    Math.min(100, ((CHECK_INTERVAL_MS - timeUntilNextCheck) / CHECK_INTERVAL_MS) * 100)
  );
}

export function formatPrice(price: number | null | undefined, fractionDigits = 0) {
  if (price == null) return "—";

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(price);
}

export function formatDateTime(dateString: string | null) {
  if (!dateString) return "Никогда";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

export function formatTimeUntilNextCheck(milliseconds: number) {
  const safeMs = Math.max(0, milliseconds);
  const hours = Math.floor(safeMs / (1000 * 60 * 60));
  const minutes = Math.floor((safeMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((safeMs % (1000 * 60)) / 1000);

  if (hours > 0) return `${hours} ч ${minutes} мин`;
  if (minutes > 0) return `${minutes} мин ${seconds} с`;
  return `${seconds} с`;
}

export function getProductStatus(product: Product): ProductStatusView {
  if (product.is_checking) {
    return {
      label: "Проверяется",
      tone: "checking",
      icon: Loader2,
    };
  }

  if (!product.last_checked) {
    return {
      label: "Не проверялся",
      tone: "muted",
      icon: Clock3,
    };
  }

  if (product.current_price === null) {
    return {
      label: "Цена не найдена",
      tone: "warning",
      icon: AlertTriangle,
    };
  }

  const minutesAgo = Math.floor(
    (Date.now() - new Date(product.last_checked).getTime()) / (1000 * 60)
  );

  if (minutesAgo < 1) {
    return {
      label: "Только что",
      tone: "ok",
      icon: CheckCircle2,
    };
  }

  if (minutesAgo < 60) {
    return {
      label: `${minutesAgo} мин назад`,
      tone: "ok",
      icon: CheckCircle2,
    };
  }

  if (minutesAgo < 60 * 24) {
    return {
      label: `${Math.floor(minutesAgo / 60)} ч назад`,
      tone: "warning",
      icon: CheckCircle2,
    };
  }

  return {
    label: "Нужна проверка",
    tone: "danger",
    icon: AlertTriangle,
  };
}

export function isTargetReached(product: Product) {
  return product.current_price != null && product.current_price <= product.target_price;
}
