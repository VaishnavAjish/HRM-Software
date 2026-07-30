import { useState } from "react";
import Modal from "../../../components/ui/Modal";
import Button from "../../../components/ui/Button";
import toast from "react-hot-toast";
import { salaryApi } from "../../../utils/api";
import { useAuth } from "../../../context/AuthContext";

export default function AddNewDepartment({
  isDeptModalOpen,
  setIsDeptModalOpen,
  newDeptName,
  setNewDeptName,
  setDepartmentsList,
  setForm,
  inputCls,
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleAddDepartment = async () => {
    const name = newDeptName.trim();

    if (!name) {
      toast.error("Department name is required");
      return;
    }

    setLoading(true);

    try {
      await salaryApi.storeDepartment(
        { name },
        user?.accessToken,
        user?.tokenType,
      );

      setDepartmentsList((prev) => [...prev, name]);

      setForm((prev) => ({
        ...prev,
        department: name,
      }));

      setNewDeptName("");
      setIsDeptModalOpen(false);

      toast.success("Department added successfully");
    } catch (err) {
      toast.error(err.message || "Failed to add department");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isDeptModalOpen}
      onClose={() => setIsDeptModalOpen(false)}
      title="Add New Department"
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Department Name
          </label>
          <input
            type="text"
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
            placeholder="e.g. Add Department"
            className={inputCls}
          />
        </div>
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => setIsDeptModalOpen(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button disabled={loading} onClick={handleAddDepartment}>
            {loading ? "Adding..." : "Add"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
