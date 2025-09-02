import React from "react";
import { FaDollarSign } from "react-icons/fa";

const Header: React.FC = () => {
  return (
    <header className="bg-gradient-to-r from-primary-500 to-primary-600 text-white py-12 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 flex items-center justify-center gap-4">
          <FaDollarSign className="text-5xl md:text-6xl animate-bounce-slow" />
          Price Checker
        </h1>
        <p className="text-xl md:text-2xl opacity-90 font-light">
          Product Price Monitoring
        </p>
      </div>
    </header>
  );
};

export default Header;
