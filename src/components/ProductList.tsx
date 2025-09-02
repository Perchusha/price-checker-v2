import React, { useEffect, useRef, useState } from "react";
import { Product } from "../types";
import {
  FaSpinner,
  FaTrash,
  FaExternalLinkAlt,
  FaCheckCircle,
  FaExclamationTriangle,
  FaClock,
} from "react-icons/fa";

interface ProductListProps {
  products: Product[];
  onDeleteProduct: (productId: number) => Promise<void>;
  onCheckPricesNow: () => Promise<void>;
  onOpenLink: (url: string) => void;
  loading: boolean;
  nextCheckTime: Date | null;
  timeUntilNextCheck: number;
}

const ProductList: React.FC<ProductListProps> = ({
  products,
  onDeleteProduct,
  onCheckPricesNow,
  onOpenLink,
  loading,
  nextCheckTime,
  timeUntilNextCheck,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Function to check scrollability
  const checkScrollability = () => {
    const container = scrollContainerRef.current;
    if (container) {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      console.log(`🔄 Scroll changed:`, {
        scrollLeft,
        scrollWidth,
        clientWidth,
        canScrollLeft: scrollLeft > 0,
        canScrollRight: scrollLeft < scrollWidth - clientWidth - 1,
        timestamp: new Date().toLocaleTimeString(),
      });
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  // Disable autofocus - user manages scroll themselves
  // useEffect(() => {
  //   const checkingProduct = products.find((p) => p.is_checking);
  //   if (checkingProduct && scrollContainerRef.current) {
  //     if (checkingProduct.id !== lastCheckingProductId) {
  //       setLastCheckingProductId(checkingProduct.id);
  //       setTimeout(() => {
  //         const productElement = document.getElementById(
  //           `product-${checkingProduct.id}`
  //         );
  //         if (productElement) {
  //           productElement.scrollIntoView({
  //             behavior: "smooth",
  //             block: "nearest",
  //             inline: "center",
  //           });
  //         }
  //       }, 100);
  //     }
  //   } else if (!checkingProduct) {
  //     setLastCheckingProductId(null);
  //   }
  // }, [products]);

  // Check scrollability when products change and on scroll
  useEffect(() => {
    console.log(`📦 Products changed:`, {
      count: products.length,
      checkingProducts: products
        .filter((p) => p.is_checking)
        .map((p) => ({ id: p.id, name: p.name })),
      timestamp: new Date().toLocaleTimeString(),
    });

    const container = scrollContainerRef.current;
    if (container) {
      // Check immediately
      checkScrollability();

      // Add scroll handler
      const handleScroll = () => {
        checkScrollability();
      };

      container.addEventListener("scroll", handleScroll);

      // Check on window resize
      const handleResize = () => {
        checkScrollability();
      };

      window.addEventListener("resize", handleResize);

      return () => {
        container.removeEventListener("scroll", handleScroll);
        window.removeEventListener("resize", handleResize);
      };
    }
  }, [products]);

  const getProductStatus = (product: Product) => {
    // If product is being checked right now
    if (product.is_checking) {
      return {
        status: "Checking now",
        icon: FaSpinner,
        color: "text-blue-600",
        bgColor: "bg-blue-100",
      };
    }

    if (!product.last_checked) {
      return {
        status: "Not checked",
        icon: FaClock,
        color: "text-gray-500",
        bgColor: "bg-gray-100",
      };
    }

    const lastChecked = new Date(product.last_checked);
    const now = new Date();
    const timeDiff = now.getTime() - lastChecked.getTime();
    const minutesAgo = Math.floor(timeDiff / (1000 * 60));

    // If price not found, show appropriate status
    if (product.current_price === null) {
      return {
        status: "Price not found",
        icon: FaExclamationTriangle,
        color: "text-orange-600",
        bgColor: "bg-orange-100",
      };
    }

    // If price found, show status by time
    if (minutesAgo < 1) {
      return {
        status: "Just checked",
        icon: FaCheckCircle,
        color: "text-green-600",
        bgColor: "bg-green-100",
      };
    } else if (minutesAgo < 60) {
      return {
        status: `Checked ${minutesAgo} min ago`,
        icon: FaCheckCircle,
        color: "text-green-600",
        bgColor: "bg-green-100",
      };
    } else if (minutesAgo < 60 * 24) {
      const hoursAgo = Math.floor(minutesAgo / 60);
      return {
        status: `Checked ${hoursAgo} h ago`,
        icon: FaCheckCircle,
        color: "text-yellow-600",
        bgColor: "bg-yellow-100",
      };
    } else {
      return {
        status: "Needs checking",
        icon: FaExclamationTriangle,
        color: "text-red-600",
        bgColor: "bg-red-100",
      };
    }
  };

  const formatPrice = (price: number | null) => {
    if (price === null) return "Not checked";
    return `${price.toFixed(2)} zł`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString("ru-RU");
  };

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 text-lg mb-4">No products to track</div>
        <div className="text-gray-400 text-sm">
          Add a product to start price tracking
        </div>
      </div>
    );
  }

  const checkingProduct = products.find((p) => p.is_checking);

  return (
    <div className="w-full h-full relative px-4">
      {/* Left fade - only if can scroll left */}
      {canScrollLeft && (
        <div className="absolute left-4 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-50 to-transparent z-10 pointer-events-none"></div>
      )}

      {/* Right fade - only if can scroll right */}
      {canScrollRight && (
        <div className="absolute right-4 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-50 to-transparent z-10 pointer-events-none"></div>
      )}

      {/* Horizontal scroll container */}
      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto h-full pb-4 scrollbar-hide"
        style={
          {
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          } as React.CSSProperties
        }
      >
        {products.map((product) => {
          const statusInfo = getProductStatus(product);
          const StatusIcon = statusInfo.icon;

          return (
            <div
              key={product.id}
              id={`product-${product.id}`}
              className={`flex-shrink-0 w-72 bg-white rounded-xl shadow-sm border p-4 transition-all duration-300 ${
                product.is_checking
                  ? "border-blue-500 shadow-lg"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-base font-semibold text-gray-900 truncate pr-2">
                  {product.name}
                </h3>
                <button
                  onClick={() => onDeleteProduct(product.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  title="Delete product"
                >
                  <FaTrash className="w-3 h-3" />
                </button>
              </div>

              {/* Prices in one line */}
              <div className="flex justify-between items-center mb-2">
                <div>
                  <div className="text-xs text-gray-500">Target</div>
                  <div className="text-sm font-bold text-gray-900">
                    {product.target_price.toFixed(0)} zł
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Current</div>
                  <div
                    className={`text-sm font-bold ${
                      product.current_price &&
                      product.current_price <= product.target_price
                        ? "text-green-600"
                        : product.current_price
                        ? "text-red-600"
                        : "text-gray-500"
                    }`}
                  >
                    {product.current_price
                      ? `${product.current_price.toFixed(0)} zł`
                      : "—"}
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="mb-2">
                <span
                  className={`font-medium px-2 py-1 rounded-full text-xs flex items-center gap-1 w-fit ${statusInfo.bgColor}`}
                >
                  <StatusIcon
                    className={`${statusInfo.color} ${
                      statusInfo.icon === FaSpinner ? "animate-spin" : ""
                    }`}
                  />
                  {statusInfo.status}
                </span>
              </div>

              {/* Links */}
              <div className="space-y-1">
                {product.found_url && (
                  <button
                    onClick={() => onOpenLink(product.found_url!)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-1.5 px-2 rounded-md transition-colors flex items-center justify-center gap-1"
                  >
                    <FaExternalLinkAlt className="w-2.5 h-2.5" />
                    {product.found_store ? product.found_store : "Found"}
                  </button>
                )}

                {product.url && (
                  <button
                    onClick={() => onOpenLink(product.url!)}
                    className="w-full bg-gray-600 hover:bg-gray-700 text-white text-xs py-1.5 px-2 rounded-md transition-colors flex items-center justify-center gap-1"
                  >
                    <FaExternalLinkAlt className="w-2.5 h-2.5" />
                    Link
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProductList;
