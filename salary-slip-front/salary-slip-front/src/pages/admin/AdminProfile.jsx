import { useState, useEffect } from "react";
import ModernDatePicker from "../../components/ModernDatePicker";
import {
  formatDateInputValue,
  getEmployeePhotoUrl,
} from "./AdminModals/EmployeeHelpers";
import {
  Edit2,
  Save,
  X,
  Camera,
  Mail,
  Phone,
  CheckCircle2,
  Crown,
  Hash,
  User,
  Home,
  Calendar,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../utils/api";
import toast from "react-hot-toast";
import usePhotoCapture from "../../hooks/usePhotoCapture";

function InfoRow({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  editing,
  editNode,
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}
      >
        <Icon size={16} className={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        {editing && editNode ? (
          editNode
        ) : (
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate mt-0.5">
            {value}
          </p>
        )}
      </div>
    </div>
  );
}

export default function AdminProfile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const [form, setForm] = useState({
    name: user?.name || "Admin",
    email: user?.email || "",
    mobile_no: "",
    emp_code: "",
    dob: "",
    address: "",
    photo: "",
  });
  const [profile, setProfile] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");

  const handlePhotoChange = (file) => {
    if (!file) return;

    if (photoPreview) URL.revokeObjectURL(photoPreview);

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  // Camera-only capture — no gallery/file-picker path.
  const { requestCapture, cameraModal } = usePhotoCapture({
    onCapture: handlePhotoChange,
  });

  const clearPendingPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);

    setPhotoFile(null);
    setPhotoPreview("");
  };

  const initials =
    form?.name
      ?.split(" ")
      .map((n) => n?.[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "AD";

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await authApi.getProfile(
          user?.accessToken,
          user?.tokenType,
        );
        const data = res?.data || res?.user || res;
        setForm({
          name: data.name || "—",
          email: data.email || "—",
          mobile_no: data.mobile_number || "—",
          emp_code: data.emp_code || "—",
          dob: data.dob || "",
          address: data.address || "",
          photo: data.photo || "",
        });
        setProfile(data);
      } catch (err) {
        toast.error(err.message || "Failed to load profile details");
      } finally {
        setLoading(false);
      }
    }

    if (user?.accessToken) fetchProfile();
    else setLoading(false);
  }, [user]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setLoading(true); // Use a loading state for the save operation
    try {
      const payload = {
        id: profile?.id || user?.id,
        emp_code: profile?.emp_code,
        name: form.name,
        email: form.email,
        mobile_number: form.mobile_no,
        dob: form.dob,
        address: form.address,
      };
      if (photoFile) payload.photo = photoFile;

      const res = await authApi.updateProfile(
        payload,
        user?.accessToken,
        user?.tokenType,
      );
      const updatedPhoto = res?.data?.photo || res?.user?.photo || res?.photo;

      setProfile((prev) => ({
        ...prev,
        name: form.name,
        email: form.email,
        mobile_number: form.mobile_no,
        dob: form.dob,
        address: form.address,
        photo: updatedPhoto || prev?.photo,
      }));
      if (photoFile) {
        set("photo", updatedPhoto || form.photo);
        clearPendingPhoto();
      }
      toast.success("Profile updated successfully");
    } catch (err) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
    setEditing(false);
  };
  const handleCancel = () => {
    clearPendingPhoto();
    setForm({
      name: profile?.name || user?.name || "Admin",
      email: profile?.email || user?.email || "",
      mobile_no: profile?.mobile_number || "—",
      emp_code: profile?.emp_code || "—",
      dob: profile?.dob || "",
      address: profile?.address || "",
      photo: profile?.photo || "",
    });
    setEditing(false);
  };

  if (loading)
    return (
      <div className="grid lg:grid-cols-[300px_1fr] gap-5 items-start">
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="skeleton h-24 w-full" />
            <div className="px-5 pb-5 -mt-16">
              <div className="flex items-end justify-between mb-4">
                <div className="skeleton w-24 h-24 sm:w-32 sm:h-32 rounded-3xl border-[4px] sm:border-[6px] border-white dark:border-gray-800" />
              </div>
              <div className="space-y-2">
                <div className="skeleton h-5 w-32 rounded" />
                <div className="skeleton h-3.5 w-36 rounded" />
                <div className="flex gap-2 pt-2">
                  <div className="skeleton h-6 w-16 rounded-full" />
                  <div className="skeleton h-6 w-16 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
            <div className="skeleton w-10 h-10 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3 w-16 rounded" />
              <div className="skeleton h-5 w-28 rounded" />
            </div>
            <div className="skeleton w-8 h-8 rounded-lg" />
          </div>
        </div>

        <div className="space-y-4">
          {[
            { title: "w-40", rows: 2 }, // Contact Information
            { title: "w-36", rows: 2 }, // Personal Details
            { title: "w-44", rows: 2 }, // Employment Details
          ].map((card, i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700"
            >
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <div className={`skeleton h-4 ${card.title} rounded`} />
              </div>
              <div className="px-5">
                {[...Array(card.rows)].map((_, j) => (
                  <div
                    key={j}
                    className="flex items-center gap-3 py-3 border-b border-gray-50 dark:border-gray-700/50 last:border-0"
                  >
                    <div className="skeleton w-9 h-9 rounded-xl flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton h-3 w-24 rounded" />
                      <div className="skeleton h-4 w-44 max-w-full rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="skeleton h-4 w-36 rounded" />
            </div>
            <div className="p-5">
              <div className="grid sm:grid-cols-3 gap-4">
                {[...Array(3)].map((_, index) => (
                  <div key={index} className="space-y-2">
                    <div className="skeleton h-3 w-28 rounded" />
                    <div className="skeleton h-10 w-full rounded-lg" />
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-4">
                <div className="skeleton h-10 w-36 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-5 items-start">
      {/* ══ LEFT COLUMN ══ */}
      <div className="space-y-4 lg:sticky">
        {/* Avatar card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Banner — violet gradient to distinguish from employee */}
          <div className="h-24 bg-gradient-to-br from-brand-400 via-brand-600 to-brand-700 relative">
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)",
                backgroundSize: "12px 12px",
              }}
            />
            {/* Admin crown badge */}
            <div className="absolute top-3 right-3 w-7 h-7 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
              <Crown size={14} className="text-yellow-300" />
            </div>
          </div>

          <div className="px-5 pb-5 -mt-16">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
              <div className="relative">
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-600 border-[4px] sm:border-[6px] border-white dark:border-gray-800 flex items-center justify-center text-white text-3xl sm:text-4xl font-bold shadow-2xl shadow-brand-500/20 overflow-hidden">
                  {photoPreview || form.photo ? (
                    <img
                      src={photoPreview || getEmployeePhotoUrl(form.photo)}
                      alt="Admin Photo"
                      className="w-full h-full object-cover rounded-2xl"
                    />
                  ) : (
                    initials
                  )}
                </div>
                {editing && (
                  <>
                    <button
                      type="button"
                      onClick={requestCapture}
                      className="absolute -bottom-1 -right-1 w-8 h-8 bg-brand-600 hover:bg-brand-700 rounded-full flex items-center justify-center text-white transition-colors shadow-lg border-2 border-white dark:border-gray-800"
                      title="Change photo"
                    >
                      <Camera size={14} />
                    </button>
                    {cameraModal}
                  </>
                )}
              </div>

              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                >
                  <Edit2 size={12} /> Edit
                </button>
              ) : (
                <div className="flex gap-1.5">
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-500 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <X size={12} /> Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors shadow-sm"
                  >
                    <Save size={12} /> Save
                  </button>
                </div>
              )}
            </div>

            {editing ? (
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="text-lg font-bold w-full bg-transparent border-b-2 border-brand-500 text-gray-900 dark:text-white focus:outline-none mb-1"
              />
            ) : (
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {form.name}
              </h2>
            )}

            <p className="text-sm text-gray-500 dark:text-gray-400">
              System Administrator
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400">
                <Crown size={10} /> Admin
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                <CheckCircle2 size={10} /> Active
              </span>
            </div>
          </div>
        </div>

        {/* Admin ID badge — showing prominent as before */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
            <Hash size={18} className="text-brand-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400 font-medium">Admin ID</p>
            <p className="text-base font-bold text-gray-900 dark:text-white font-mono truncate">
              {form.emp_code}
            </p>
          </div>
          <div className="ml-auto w-8 h-8 rounded-lg bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center flex-shrink-0">
            <Crown size={16} className="text-yellow-500" />
          </div>
        </div>
      </div>

      {/* ══ RIGHT COLUMN ══ */}
      <div className="space-y-4">
        {/* Contact information */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-brand-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Contact Information
              </h3>
            </div>
          </div>
          <div className="px-5">
            <InfoRow
              icon={Mail}
              iconBg="bg-brand-50 dark:bg-brand-900/20"
              iconColor="text-brand-600"
              label="Email Address"
              value={form.email || "—"}
              editing={editing}
              editNode={
                <input
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={Phone}
              iconBg="bg-green-50 dark:bg-green-900/20"
              iconColor="text-green-600"
              label="Mobile Number"
              value={form.mobile_no || "—"}
              editing={editing}
              editNode={
                <input
                  value={form.mobile_no}
                  onChange={(e) => set("mobile_no", e.target.value)}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
          </div>
        </div>

        {/* Admin Details */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <User size={16} className="text-brand-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Personal Details
            </h3>
          </div>
          <div className="px-5">
            <InfoRow
              icon={Calendar}
              iconBg="bg-orange-50 dark:bg-orange-900/20"
              iconColor="text-orange-600"
              label="Date of Birth"
              value={form.dob ? new Date(form.dob).toLocaleDateString() : "—"}
              editing={editing}
              editNode={
                <ModernDatePicker
                  value={formatDateInputValue(form.dob)}
                  onChange={(e) => set("dob", e.target.value)}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={Home}
              iconBg="bg-purple-50 dark:bg-purple-900/20"
              iconColor="text-purple-600"
              label="Residential Address"
              value={form.address || "—"}
              editing={editing}
              editNode={
                <input
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
