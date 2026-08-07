import { useState } from "react";
import { Users, Plus, Trash2, ShieldCheck, UserCheck } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import { useNotifications } from "../../context/NotificationContext";

const inputClass =
  "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-xs font-semibold text-gray-900 dark:text-white placeholder-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all";

export default function EmployeeGroupsModal({ isOpen, onClose }) {
  const { groups, createEmployeeGroup, deleteEmployeeGroup } = useNotifications();

  const [groupName, setGroupName] = useState("");
  const [description, setDescription] = useState("");
  const [membersCount, setMembersCount] = useState(8);

  const handleCreateGroup = (e) => {
    e.preventDefault();
    if (!groupName.trim()) {
      toast.error("Group name is required");
      return;
    }

    createEmployeeGroup({
      name: groupName.trim(),
      desc: description.trim() || "Custom Employee Group",
      membersCount: Number(membersCount) || 5,
    });

    setGroupName("");
    setDescription("");
    setMembersCount(8);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Target Employee Groups Management"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="space-y-6 font-sans text-xs">
        {/* Create Group Form */}
        <form onSubmit={handleCreateGroup} className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200/80 dark:border-gray-700 space-y-3">
          <h4 className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
            <Plus size={14} className="text-brand-500" /> Create Custom Employee Group
          </h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Group Name</label>
              <input
                type="text"
                placeholder="e.g. Sales Tier-1 Lead"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Estimated Members</label>
              <input
                type="number"
                value={membersCount}
                onChange={(e) => setMembersCount(e.target.value)}
                className={inputClass}
                min={1}
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Description / Purpose</label>
            <input
              type="text"
              placeholder="e.g. Regional sales managers for Q3 targets"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          </div>

          <Button type="submit" size="sm" icon={<Plus size={14} />}>Add Group</Button>
        </form>

        {/* Existing Groups List */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-gray-900 dark:text-white">Active Employee Target Groups ({groups.length})</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {groups.map((g) => (
              <div key={g.id} className="flex items-center justify-between p-3.5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xs">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">{g.name}</p>
                    <Badge variant="purple">{g.membersCount} Members</Badge>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">{g.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteEmployeeGroup(g.id)}
                  className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg transition-all"
                  title="Remove Group"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
