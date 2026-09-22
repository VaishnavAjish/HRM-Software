import React from "react";
import { Construction, Clock, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function UnderDevelopmentPage({ title = "This Section" }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-xl shadow-amber-500/10 animate-pulse">
          <Construction size={40} />
        </div>
        <div className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-900 rounded-full p-1 shadow-md border border-gray-100 dark:border-slate-800">
          <Clock size={16} className="text-amber-500" />
        </div>
      </div>

      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        {title} Section Under Development
      </h2>

      <p className="max-w-md text-sm text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
        This feature is currently under active development and will be available soon. Please check back later or contact your administrator for more details.
      </p>

      <button
        onClick={() => navigate("/employee")}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold shadow-lg shadow-brand-600/25 hover:bg-brand-700 transition-all hover:scale-105 active:scale-95"
      >
        <ArrowLeft size={16} />
        Back to Dashboard
      </button>
    </div>
  );
}
