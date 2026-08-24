import { Eye, CheckCircle2, Clock, AlertTriangle, ShieldCheck } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Badge from "../ui/Badge";

export default function AnnouncementReadReceiptsModal({ isOpen, onClose, announcement }) {
  if (!announcement) return null;

  const receipts = announcement.readReceipts || [];
  const totalCount = receipts.length || 1;
  const ackCount = receipts.filter((r) => r.status === "Acknowledged").length;
  const readCount = receipts.filter((r) => r.status === "Read" || r.status === "Acknowledged").length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Read Receipts & Acknowledgment Audit — ${announcement.title}`}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Close Audit</Button>
        </div>
      }
    >
      <div className="space-y-4 font-sans text-xs">
        {/* Compliance Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-100 dark:border-emerald-900/40">
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Acknowledged</p>
            <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">{ackCount}</p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-100 dark:border-blue-900/40">
            <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">Opened & Read</p>
            <p className="text-xl font-extrabold text-blue-700 dark:text-blue-300 mt-1">{readCount}</p>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-100 dark:border-amber-900/40">
            <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Delivered (Pending)</p>
            <p className="text-xl font-extrabold text-amber-700 dark:text-amber-300 mt-1">{totalCount - readCount}</p>
          </div>
        </div>

        {/* Audit Receipts Table */}
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-2xl">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-[10px] font-bold text-gray-400 uppercase">
                <th className="py-2.5 px-3">Employee</th>
                <th className="py-2.5 px-3">Department</th>
                <th className="py-2.5 px-3">Delivery Status</th>
                <th className="py-2.5 px-3">Opened Time</th>
                <th className="py-2.5 px-3">Acknowledged Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-300">
              {receipts.map((r, idx) => (
                <tr key={idx} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40">
                  <td className="py-2.5 px-3 font-bold text-gray-900 dark:text-white">{r.employee}</td>
                  <td className="py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-400">{r.dept}</td>
                  <td className="py-2.5 px-3">
                    <Badge variant={r.status === "Acknowledged" ? "green" : r.status === "Read" ? "blue" : "amber"}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-gray-500">{r.viewTime || "Not viewed yet"}</td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-emerald-600 font-bold">{r.ackTime || "Pending"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
