import re

with open('src/pages/admin/TrialForm.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# find the start of the Desktop AG Grid block
start_idx = content.find('/* ── Desktop AG Grid ────────────────────────────────────────────── */')
if start_idx == -1:
    print('Failed to find start idx')
    exit(1)

replacement = '''/* ── Desktop AG Grid ────────────────────────────────────────────── */
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {loading ? (
            <div className="p-4">
              <SkeletonTable rows={6} cols={7} />
            </div>
          ) : (
            <div
              ref={gridContainerRef}
              className={salary-ag-grid  }
            >
              <AgGridReact
                ref={gridRef}
                rowData={forms}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                getRowId={(params) => String(params.data.id)}
                domLayout="autoHeight"
                rowHeight={58}
                headerHeight={48}
                popupParent={document.body}
                enableCellTextSelection
                animateRows
                overlayNoRowsTemplate="<span class='text-gray-400 text-sm'>No trial forms found</span>"
              />
              <GridHeaderContextMenu
                menu={headerMenu}
                frozen={headerFrozen}
                onClose={closeHeaderMenu}
                onToggleFrozen={toggleHeaderFrozen}
              />
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={
          <div className="flex items-center gap-3">
            <span>Trial Form Details</span>
            {selected && <StatusBadge status={selected.status} />}
            {selected &&
              (selected.isPrinted ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">
                  <Printer size={11} /> Printed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">
                  <Printer size={11} /> Not Printed
                </span>
              ))}
          </div>
        }
        size="xl"
        footer={
          selected && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Status actions — left side */}
              <div className="flex items-center gap-2">
                {user?.role !== 'agent' && (
                  <>
                    <button
                      onClick={() => handleStatusUpdate(selected.id, true)}
                      disabled={
                        Boolean(statusLoading[selected.id]) ||
                        selected.status === "Approved"
                      }
                      className={inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition shadow-sm }
                    >
                      {statusLoading[selected.id] === "Approved" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}
                      Approve
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(selected.id, false)}
                      disabled={
                        Boolean(statusLoading[selected.id]) ||
                        selected.status === "Rejected"
                      }
                      className={inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition shadow-sm }
                    >
                      {statusLoading[selected.id] === "Rejected" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <XCircle size={14} />
                      )}
                      Reject
                    </button>
                  </>
                )}
              </div>
              {/* Document actions — right side */}
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setSelected(null)}>
                  Close
                </Button>
                <button
                  onClick={() => {
                    setSelected(null);
                    setEditTarget(selected);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-brand-300 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-400 dark:hover:bg-brand-900/40"
                >
                  <Pencil size={14} />
                  Edit
                </button>
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  <Printer size={14} />
                  Print
                </button>
                <button
                  onClick={handleDownloadPDF}
                  disabled={pdfLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
                >
                  {pdfLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  {pdfLoading ? "Generating…" : "Download PDF"}
                </button>
              </div>
            </div>
          )
        }
      >
        {selected && <PrintableTrialForm data={selected} formRef={formRef} />}
      </Modal>

      {/* Delete confirm */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Trial Form"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Are you sure you want to delete the trial form for{" "}
          <span className="font-semibold">{deleteTarget?.name}</span>? This
          cannot be undone.
        </p>
      </Modal>

      <TrialFormModal
        isOpen={addFormOpen || Boolean(editTarget)}
        onClose={() => {
          setAddFormOpen(false);
          setEditTarget(null);
        }}
        initialData={editTarget}
        onSuccess={() => {
          setAddFormOpen(false);
          setEditTarget(null);
          loadForms();
        }}
      />
      <AppointmentModal
        isOpen={showAppointmentModal}
        onClose={() => {
          setShowAppointmentModal(false);
          setPrefillTrialData(null);
        }}
        initialData={prefillTrialData}
        isPrefillFromTrial={true}
      />
    </div>
  );
}'''

with open('src/pages/admin/TrialForm.jsx', 'w', encoding='utf-8') as f:
    f.write(content[:start_idx] + replacement)

print("done!")
