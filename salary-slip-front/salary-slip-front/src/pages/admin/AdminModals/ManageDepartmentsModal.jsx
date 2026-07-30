import { useState, useEffect } from "react";
import Modal from "../../../components/ui/Modal";
import Button from "../../../components/ui/Button";
import toast from "react-hot-toast";
import { salaryApi } from "../../../utils/api";
import { useAuth } from "../../../context/AuthContext";
import { Pencil, Trash2, Plus, X, Check } from "lucide-react";

export default function ManageDepartmentsModal({
  isOpen,
  onClose,
}) {
  const { user } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  const fetchDepartments = async () => {
    setLoading(true);
    try {
      const res = await salaryApi.getDepartments(
        user?.accessToken,
        user?.tokenType
      );
      if (res.status) {
        setDepartments(res.data || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDepartments();
      setNewDeptName("");
      setAdding(false);
      setEditingId(null);
    }
  }, [isOpen]);

  const handleAddDepartment = async () => {
    const name = newDeptName.trim();
    if (!name) {
      toast.error("Department name is required");
      return;
    }

    setAdding(true);
    try {
      const res = await salaryApi.storeDepartment(
        { name },
        user?.accessToken,
        user?.tokenType
      );
      if (res.status) {
        toast.success("Department added successfully");
        setNewDeptName("");
        fetchDepartments();
      } else {
        toast.error(res.message || "Failed to add department");
      }
    } catch (err) {
      toast.error(err.message || "Failed to add department");
    } finally {
      setAdding(false);
    }
  };

  const handleUpdateDepartment = async (id) => {
    const name = editName.trim();
    if (!name) {
      toast.error("Department name is required");
      return;
    }

    try {
      const res = await salaryApi.updateDepartment(
        id,
        { name },
        user?.accessToken,
        user?.tokenType
      );
      if (res.status) {
        toast.success("Department updated successfully");
        setEditingId(null);
        fetchDepartments();
      } else {
        toast.error(res.message || "Failed to update department");
      }
    } catch (err) {
      toast.error(err.message || "Failed to update department");
    }
  };

  const handleDeleteDepartment = async (id) => {
    if (!window.confirm("Are you sure you want to delete this department?")) {
      return;
    }

    try {
      const res = await salaryApi.deleteDepartment(
        id,
        user?.accessToken,
        user?.tokenType
      );
      if (res.status) {
        toast.success("Department deleted successfully");
        fetchDepartments();
      } else {
        toast.error(res.message || "Failed to delete department");
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete department");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage Departments" size="md">
      <div className="space-y-4">
        {/* Add New Department */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
            placeholder="New Department Name"
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          <Button disabled={adding} onClick={handleAddDepartment} className="flex items-center gap-1">
            <Plus size={16} />
            {adding ? "Adding..." : "Add"}
          </Button>
        </div>

        {/* List of Departments */}
        <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {loading ? (
              <p className="text-center py-4 text-sm text-gray-500">Loading...</p>
            ) : departments.length === 0 ? (
              <p className="text-center py-4 text-sm text-gray-500">No departments found.</p>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {departments.map((dept) => (
                  <li key={dept.id} className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    {editingId === dept.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          onClick={() => handleUpdateDepartment(dept.id)}
                          className="text-green-600 hover:text-green-700 p-1"
                        >
                          <Check size={18} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-red-500 hover:text-red-600 p-1"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {dept.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingId(dept.id);
                              setEditName(dept.name);
                            }}
                            className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteDepartment(dept.id)}
                            className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
