import React, { useState, useEffect } from "react";
import { AddProductData } from "../types";
import { FaSpinner, FaPlus } from "react-icons/fa";

interface AddProductFormProps {
  onAddProduct: (product: AddProductData) => Promise<void>;
  loading: boolean;
}

const AddProductForm: React.FC<AddProductFormProps> = ({
  onAddProduct,
  loading,
}) => {
  const [formData, setFormData] = useState<AddProductData>({
    name: "",
    targetPrice: 0,
    url: "",
  });

  // Track loading changes for debugging
  useEffect(() => {
    console.log("AddProductForm loading state:", loading);
  }, [loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || formData.targetPrice <= 0) {
      alert("Please fill in all required fields");
      return;
    }

    try {
      await onAddProduct(formData);
      // Reset form only on successful addition
      setFormData({ name: "", targetPrice: 0, url: "" });
      console.log("Form reset after successful addition");
    } catch (error) {
      console.error("Error adding product:", error);
      // On error, form remains filled but inputs are unlocked
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    console.log(`Input change: ${name} = ${value}, loading: ${loading}`);
    setFormData((prev) => ({
      ...prev,
      [name]: name === "targetPrice" ? parseFloat(value) || 0 : value,
    }));
  };

  return (
    <div className="px-4 pb-2">
      <form
        key={loading ? "loading" : "ready"}
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="name"
            className="block text-xs font-medium text-gray-600"
          >
            Product name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
            placeholder="Product name"
            disabled={loading}
            readOnly={false}
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="targetPrice"
            className="block text-xs font-medium text-gray-600"
          >
            Target price (PLN) *
          </label>
          <input
            type="number"
            id="targetPrice"
            name="targetPrice"
            value={formData.targetPrice || ""}
            onChange={handleInputChange}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
            placeholder="400"
            min="0"
            step="0.01"
            disabled={loading}
            readOnly={false}
            required
          />
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm flex items-center justify-center gap-2"
          disabled={loading}
        >
          {loading ? (
            <>
              <FaSpinner className="animate-spin h-4 w-4" />
              Adding...
            </>
          ) : (
            <>
              <FaPlus className="h-4 w-4" />
              Add product
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default AddProductForm;
