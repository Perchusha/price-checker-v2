export interface Product {
  id: number;
  name: string;
  target_price: number;
  current_price: number | null;
  url: string | null;
  found_url: string | null; // Link to found product
  found_store: string | null; // Store name where price was found
  found_store_url: string | null; // Link to store
  last_checked: string | null;
  is_active: boolean;
  is_checking: boolean; // Flag for checking in progress
  created_at: string;
}

export interface PriceHistory {
  id: number;
  product_id: number;
  price: number;
  checked_at: string;
}

export interface AddProductData {
  name: string;
  targetPrice: number;
  url?: string; // Optional product link
}
