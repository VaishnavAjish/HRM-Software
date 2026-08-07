import { useState } from "react";
import { Sliders, Bell, Mail, Smartphone, Check, Volume2 } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { useNotifications } from "../../context/NotificationContext";

export default function NotificationPreferencesModal({ isOpen, onClose }) {
  const { preferences, savePreferences } = useNotifications();

  const [soundEnabled, setSoundEnabled] = useState(preferences?.soundEnabled ?? true);
  const [desktopEnabled, setDesktopEnabled] = useState(preferences?.desktopEnabled ?? true);
  const [emailEnabled, setEmailEnabled] = useState(preferences?.emailEnabled ?? true);
  const [browserEnabled, setBrowserEnabled] = useState(preferences?.browserEnabled ?? true);
  const [categories, setCategories] = useState(
    preferences?.categories || {
      tickets: true,
      leave: true,
      payroll: true,
      recruitment: true,
      assets: true,
      performance: true,
      attendance: true,
      announcements: true,
      system: true,
    }
  );

  const handleToggleCategory = (cat) => {
    setCategories({ ...categories, [cat]: !categories[cat] });
  };

  const handleSave = () => {
    savePreferences({
      soundEnabled,
      desktopEnabled,
      emailEnabled,
      browserEnabled,
      channels: {
        portal: browserEnabled,
        email: emailEnabled,
        push: desktopEnabled,
        sound: soundEnabled,
      },
      categories,
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Notification Preferences & Channels"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} icon={<Check size={14} />}>Save Preferences</Button>
        </div>
      }
    >
      <div className="space-y-6 font-sans text-xs">
        {/* Delivery Channels */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider text-gray-400">Delivery Channels</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "In-App Browser Feed", desc: "Notification Center workspace feed", active: browserEnabled, toggle: () => setBrowserEnabled(!browserEnabled), icon: Bell },
              { label: "Email Alerts", desc: "Instant SMTP email notification", active: emailEnabled, toggle: () => setEmailEnabled(!emailEnabled), icon: Mail },
              { label: "Desktop Push Notifications", desc: "PWA device push notification", active: desktopEnabled, toggle: () => setDesktopEnabled(!desktopEnabled), icon: Smartphone },
              { label: "Audio Sound Chime", desc: "Play web audio chime on new event", active: soundEnabled, toggle: () => setSoundEnabled(!soundEnabled), icon: Volume2 },
            ].map((ch, idx) => {
              const IconComp = ch.icon;
              return (
                <div
                  key={idx}
                  onClick={ch.toggle}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                    ch.active
                      ? "bg-brand-50/60 border-brand-300 dark:bg-brand-950/40 dark:border-brand-800"
                      : "bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <IconComp size={16} className={ch.active ? "text-brand-600 dark:text-brand-400" : "text-gray-400"} />
                    <div>
                      <p className="text-xs font-bold text-gray-900 dark:text-white">{ch.label}</p>
                      <p className="text-[10px] text-gray-400">{ch.desc}</p>
                    </div>
                  </div>
                  <input type="checkbox" checked={ch.active} onChange={() => {}} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Controls */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider text-gray-400">Module Event Category Triggers</h4>
          <div className="space-y-2">
            {[
              { id: "tickets", label: "Support Tickets & Service Desk", desc: "Assignments, status changes, and escalations" },
              { id: "leave", label: "Leave & Attendance Regularization", desc: "Approval requests, approvals, and rejections" },
              { id: "payroll", label: "Payroll & Salary Slips", desc: "Batch releases, payslip generation, and tax forms" },
              { id: "recruitment", label: "Recruitment & Candidates", desc: "Requisitions, applicant updates, and quiz scores" },
              { id: "assets", label: "IT Asset Management", desc: "Hardware allocation, returns, and maintenance" },
              { id: "performance", label: "Performance Management", desc: "Appraisal cycles, goal reviews, and matrix feedback" },
              { id: "announcements", label: "HR Broadcasts & Policy Updates", desc: "All-hands updates, pinned announcements, and news" },
            ].map((cat) => (
              <div key={cat.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">{cat.label}</p>
                  <p className="text-[11px] text-gray-400">{cat.desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={categories[cat.id] ?? true}
                  onChange={() => handleToggleCategory(cat.id)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
