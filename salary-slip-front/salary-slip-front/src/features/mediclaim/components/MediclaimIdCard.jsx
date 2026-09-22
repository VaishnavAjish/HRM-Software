import React, { useState } from "react";
import IDCardFront from "../../idCards/components/IDCardFront";
import IDCardBack from "../../idCards/components/IDCardBack";
import Modal from "../../../components/ui/Modal";
import { Download, Eye, RotateCw } from "lucide-react";
import html2canvas from "html2canvas";
import toast from "react-hot-toast";

/**
 * Mediclaim ID Card — Renders the EXACT Corporate Lanyard ID Card from Reference Image 2!
 */
export default function MediclaimIdCard({
  card,
  name,
  relationship,
  photoUrl,
  employeeCode,
  companyCode,
  department,
  designation,
}) {
    const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const handleUpdate = () => setTick((t) => t + 1);
    window.addEventListener("card_settings_updated", handleUpdate);
    return () => window.removeEventListener("card_settings_updated", handleUpdate);
  }, []);
  const [side, setSide] = useState("front"); // 'front' | 'back'
  const [imagePreview, setImagePreview] = useState({ open: false, src: null, loading: false });
  const [downloading, setDownloading] = useState(false);
  const cardContainerRef = React.useRef(null);

  const employeeData = {
    name: name || "KALPESH KAMRAJBHAI ANTIYA",
    empCode: employeeCode || "924",
    designation: designation || "DATA ENTRY",
    department: department || "OFFICE",
    unit: "Ichhapore",
    companyId: companyCode || "nidhi-impex",
    photo: photoUrl,
    bloodGroup: "B+",
    joiningDate: "15 Sep 2026",
  };

  const handleDownload = async () => {
    if (!cardContainerRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(cardContainerRef.current, { scale: 3, useCORS: true });
      const link = document.createElement("a");
      link.download = `mediclaim-pass-${employeeData.empCode}.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Downloaded Pass Image!");
    } catch {
      toast.error("Failed to download pass image.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Capturable Card Container */}
      <div ref={cardContainerRef} className="inline-block p-1 bg-transparent">
        {side === "front" ? (
          <IDCardFront employee={employeeData} />
        ) : (
          <IDCardBack employee={employeeData} />
        )}
      </div>

      {/* Card Toolbar Action Buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSide(side === "front" ? "back" : "front")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        >
          <RotateCw size={13} className="text-indigo-600" /> Flip ({side === "front" ? "Show Back" : "Show Front"})
        </button>

        <button
          type="button"
          onClick={() => setImagePreview({ open: true, src: null, loading: false })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        >
          <Eye size={13} className="text-indigo-600" /> View Pass
        </button>

        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          <Download size={13} /> Download PNG
        </button>
      </div>

      {/* Preview Modal */}
      <Modal
        isOpen={imagePreview.open}
        onClose={() => setImagePreview({ open: false, src: null, loading: false })}
        title={`${employeeData.name}'s Pass`}
        size="md"
      >
        <div className="flex flex-col items-center gap-4 py-3">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 p-2">
            <IDCardFront employee={employeeData} />
            <IDCardBack employee={employeeData} />
          </div>
          <button
            type="button"
            onClick={handleDownload}
            className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-md hover:bg-indigo-700 flex items-center gap-2"
          >
            <Download size={14} /> Download Pass Image
          </button>
        </div>
      </Modal>
    </div>
  );
}
