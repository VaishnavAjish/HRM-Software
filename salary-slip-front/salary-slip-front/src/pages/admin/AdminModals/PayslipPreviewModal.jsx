import React from "react";

import { Download, Loader2 } from "lucide-react";
import PayslipDocument from "../../../components/payslip/PayslipDocument";
import Modal from "../../../components/ui/Modal";
import Badge from "../../../components/ui/Badge";

function PayslipPreviewModal({
  viewModal,
  closeViewModal,
  handleDownloadPDF,
  detailLoading,
  detail,
  pdfLoading,
  formatCurrency,
  payslipRef,
  companyId,
}) {
  return (
    <Modal
      isOpen={!!viewModal}
      onClose={closeViewModal}
      title="Payslip Preview"
      size="xl"
      noPadding
      footer={
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {viewModal?.name}
            </p>

            <p className="mt-0.5 text-xs text-gray-400">
              #{viewModal?.empCode} | {viewModal?.designation} |{" "}
              {viewModal?.month} |{" "}
              <span className="font-medium text-gray-600 dark:text-gray-300">
                Net: {formatCurrency(viewModal?.netSalary)}
              </span>
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-3">
            <Badge variant={viewModal?.status === "Paid" ? "green" : "yellow"}>
              {viewModal?.status}
            </Badge>

            <button
              onClick={handleDownloadPDF}
              disabled={detailLoading || !detail || pdfLoading}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {pdfLoading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Download size={15} />
              )}

              {pdfLoading ? "Generating…" : "Download PDF"}
            </button>
          </div>
        </div>
      }
    >
      <div className="overflow-x-auto bg-neutral-300 px-3 py-4 sm:px-6 sm:py-6">
        {detailLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-500">
            <Loader2 size={18} className="animate-spin" />
            Loading payslip…
          </div>
        ) : detail ? (
          <div
            ref={payslipRef}
            style={{
              display: "inline-block",
              width: "100%",
            }}
          >
            <PayslipDocument
              emp={{}}
              payslip={detail}
              companyId={detail?.company_code || companyId}
              className="!shadow-none"
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export default PayslipPreviewModal;
