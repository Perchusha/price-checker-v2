import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save } from "lucide-react";
import { AddProductData, Product, UpdateProductData } from "../types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type ProductFormData = AddProductData | UpdateProductData;

interface AddProductFormProps {
  onSubmit: (product: ProductFormData) => Promise<boolean>;
  loading: boolean;
  initialProduct?: Product | null;
  submitLabel?: string;
}

const emptyFormData: AddProductData = {
  name: "",
  targetPrice: 0,
  url: "",
};

const AddProductForm: React.FC<AddProductFormProps> = ({
  onSubmit,
  loading,
  initialProduct,
  submitLabel,
}) => {
  const isEditing = Boolean(initialProduct);
  const initialFormData = useMemo<ProductFormData>(
    () =>
      initialProduct
        ? {
            name: initialProduct.name,
            targetPrice: initialProduct.target_price,
            url: initialProduct.url || "",
          }
        : emptyFormData,
    [initialProduct]
  );
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    setFormData(initialFormData);
    setValidationError("");
  }, [initialFormData]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setValidationError("");

    if (!formData.name.trim()) {
      setValidationError("Введите название товара");
      return;
    }

    if (formData.targetPrice <= 0) {
      setValidationError("Укажите целевую цену больше нуля");
      return;
    }

    const success = await onSubmit({
      ...formData,
      name: formData.name.trim(),
      url: formData.url?.trim(),
    });

    if (success && !isEditing) {
      setFormData(emptyFormData);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: name === "targetPrice" ? Number.parseFloat(value) || 0 : value,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="name">Название</Label>
        <Input
          id="name"
          name="name"
          value={formData.name}
          onChange={handleInputChange}
          placeholder="Например, RTX 4070"
          disabled={loading}
          autoFocus
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="targetPrice">Целевая цена, PLN</Label>
        <Input
          id="targetPrice"
          name="targetPrice"
          type="number"
          min="0"
          step="0.01"
          value={formData.targetPrice || ""}
          onChange={handleInputChange}
          placeholder="400"
          disabled={loading}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="url">Ссылка на товар</Label>
        <Input
          id="url"
          name="url"
          type="url"
          value={formData.url || ""}
          onChange={handleInputChange}
          placeholder="https://..."
          disabled={loading}
        />
      </div>

      {validationError && (
        <p className="text-xs text-zinc-300">{validationError}</p>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isEditing ? (
          <Save className="h-4 w-4" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        {submitLabel || (isEditing ? "Сохранить" : "Добавить")}
      </Button>
    </form>
  );
};

export default AddProductForm;
