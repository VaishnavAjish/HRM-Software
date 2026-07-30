import Modal from "../../../components/ui/Modal";
import { Trash2 } from "lucide-react";
import Button from "../../../components/ui/Button";

export default function DeleteEmployeeModal({
  modal,
  setModal,
  selected,
  handleDelete,
  deleteLoading,
}) {
  return (
    <Modal
      isOpen={modal === "delete"}
      onClose={() => setModal(null)}
      title="Delete Employee"
      size="sm"
    >
      <div className="text-center py-2">
        <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
          <Trash2 size={22} className="text-red-600" />
        </div>

        <p className="text-gray-700 dark:text-gray-300 text-sm">
          Are you sure you want to delete{" "}
          <strong>{selected?.displayName}</strong>? This action cannot be
          undone.
        </p>
      </div>

      <div className="flex justify-end gap-3 mt-4">
        <Button
          variant="secondary"
          onClick={() => setModal(null)}
          disabled={deleteLoading}
        >
          Cancel
        </Button>

        <Button
          variant="danger"
          onClick={handleDelete}
          disabled={deleteLoading}
        >
          {deleteLoading ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </Modal>
  );
}
