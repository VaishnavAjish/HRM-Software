import { useState } from "react";
import { Megaphone, Paperclip, Send, Calendar, ShieldAlert, Users, X } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { useNotifications } from "../../context/NotificationContext";

const inputClass =
  "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-xs font-semibold text-gray-900 dark:text-white placeholder-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all";

const selectClass =
  "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none shadow-sm transition-all";

export default function AnnouncementsModal({ isOpen, onClose }) {
  const { createAnnouncement, groups } = useNotifications();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("Company Update");
  const [priority, setPriority] = useState("Normal");
  const [audience, setAudience] = useState("Entire Company");
  const [targetGroup, setTargetGroup] = useState("All");
  const [scheduleMode, setScheduleMode] = useState("now");
  const [scheduleDate, setScheduleDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [attachments, setAttachments] = useState([]);

  const handleFileAttach = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const newAtts = files.map((f) => ({
      name: f.name,
      size: `${(f.size / 1024 / 1024).toFixed(1)} MB`,
    }));
    setAttachments([...attachments, ...newAtts]);
    toast.success(`${files.length} file(s) attached`);
  };

  const handleRemoveAttachment = (idx) => {
    setAttachments(attachments.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("Announcement title and message body are required");
      return;
    }

    createAnnouncement({
      title: title.trim(),
      content: content.trim(),
      category,
      priority,
      audience,
      targetGroup,
      pinned: priority === "Important" || priority === "Critical",
      scheduleMode,
      scheduleDate: scheduleMode === "later" ? scheduleDate : null,
      expiryDate: expiryDate || null,
      attachments,
    });

    // Reset
    setTitle("");
    setContent("");
    setAttachments([]);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Enterprise HR Broadcast"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} icon={<Send size={14} />}>Publish Broadcast</Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 font-sans text-xs">
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Broadcast Title
          </label>
          <input
            type="text"
            placeholder="e.g. Q3 Town Hall & Revised Leave Guidelines 2026"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Category
            </label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
              <option value="Company Update">Company Update</option>
              <option value="Policy Update">Policy Update</option>
              <option value="HR Notice">HR Notice</option>
              <option value="Holiday & Events">Holiday & Events</option>
              <option value="IT System Maintenance">IT System Maintenance</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Priority
            </label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectClass}>
              <option value="Normal">Normal</option>
              <option value="Important">Important (Pinned to Top)</option>
              <option value="Critical">Critical (Immediate Alert)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Target Audience
            </label>
            <select value={audience} onChange={(e) => setAudience(e.target.value)} className={selectClass}>
              <option value="Entire Company">Entire Company</option>
              <option value="Selected Branch">Selected Branch</option>
              <option value="Department">Department</option>
              <option value="Designation Band">Designation Band</option>
              <option value="Employee Group">Employee Group</option>
            </select>
          </div>

          {audience === "Employee Group" && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Select Custom Group
              </label>
              <select value={targetGroup} onChange={(e) => setTargetGroup(e.target.value)} className={selectClass}>
                <option value="All">All Groups</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.name}>{g.name} ({g.membersCount} members)</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Announcement Message Body
          </label>
          <textarea
            rows={4}
            placeholder="Write official announcement details, policy notes, or event agenda..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={inputClass}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Publishing Schedule
            </label>
            <select value={scheduleMode} onChange={(e) => setScheduleMode(e.target.value)} className={selectClass}>
              <option value="now">Publish Instantly</option>
              <option value="later">Schedule Later</option>
            </select>
          </div>

          {scheduleMode === "later" && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Schedule Date & Time
              </label>
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
        </div>

        {/* Attachments Upload */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Attachments (Images, PDF, Documents)
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-xl cursor-pointer transition-all border border-gray-200 dark:border-gray-700">
              <Paperclip size={14} /> Attach Files
              <input type="file" multiple onChange={handleFileAttach} className="hidden" />
            </label>
            <span className="text-[11px] text-gray-400">PDF, PNG, JPG, DOCX supported</span>
          </div>

          {attachments.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {attachments.map((att, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 text-xs">
                  <span className="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-xs">{att.name} ({att.size})</span>
                  <button type="button" onClick={() => handleRemoveAttachment(idx)} className="text-gray-400 hover:text-rose-500 p-1">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
