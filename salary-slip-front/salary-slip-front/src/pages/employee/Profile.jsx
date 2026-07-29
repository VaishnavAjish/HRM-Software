import { useState, useEffect, useRef } from "react";
import ModernDatePicker from "../../components/ModernDatePicker";
import {
  PasswordStrength,
  isPasswordValid,
  formatDateInputValue,
  getEmployeePhotoUrl,
} from "../admin/AdminModals/EmployeeHelpers";
import {
  Edit2,
  Save,
  X,
  Camera,
  Mail,
  Phone,
  Building2,
  MapPin,
  Calendar,
  Hash,
  Shield,
  Award,
  Clock,
  CheckCircle,
  Eye,
  EyeOff,
  CreditCard,
  User,
  Home,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext"; // Corrected import path
import { authApi } from "../../utils/api";
import toast from "react-hot-toast";

const inputCls =
  "w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition";

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
    <div className="flex items-center gap-3 py-2">
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

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-tight mt-0.5">
        {label}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const { user, updateCurrentUser } = useAuth();
  const [profile, setProfile] = useState(null);

  // Map the new API structure to a consistent object
  const emp = {
    ...profile,
    avatar: (profile?.name || user?.name || "E")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2),
    status: profile?.status === "0" ? "Active" : "Inactive",
    mobile_no: profile?.mobile_number || "", // API uses mobile_number
    dob: profile?.dob || "",
    address: profile?.address || "",
    photo: profile?.photo || "",
    gender: profile?.gender || "",
    department: profile?.department || "",
    designation: profile?.designation || "",
    joining_date: profile?.joining_date || "",
  };

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    dob: "",
    address: "",
    city: "",
    district: "",
    state: "",
    pin: "",
    aadhar_card_no: "",
    pan_card_no: "",
    bank_name: "",
    bank_ifsc_code: "",
    bank_account_no: "",
    pf_no: "",
    esi_no: "",
    gender: "",
    department: "",
    designation: "",
    joining_date: "",
  });

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await authApi.getProfile(
          user?.accessToken,
          user?.tokenType,
        );
        const data = res?.data || res?.user || res;
        setProfile(data);
        setForm({
          name: data.name || "",
          email: data.email || "",
          phone: data.mobile_number || "", // Use mobile_number from API
          dob: data.dob || "",
          address: data.address || "",
          city: data.city || "",
          district: data.district || "",
          state: data.state || "",
          pin: data.pin || "",
          aadhar_card_no: data.aadhar_card_no || "",
          pan_card_no: data.pan_card_no || "",
          bank_name: data.bank_name || "",
          bank_ifsc_code: data.bank_ifsc_code || "",
          bank_account_no: data.bank_account_no || "",
          pf_no: data.pf_no || "",
          esi_no: data.esi_no || "",
          gender: data.gender || "",
          department: data.department || "",
          designation: data.designation || "",
          joining_date: data.joining_date || "",
        });
      } catch (err) {
        toast.error(err.message || "Failed to load profile details");
      } finally {
        setLoading(false);
      }
    }

    if (user?.accessToken) fetchProfile();
    else setLoading(false);
  }, [user]);

  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const photoInputRef = useRef(null);

  const handlePhotoChange = (file) => {
    if (!file) return;

    if (photoPreview) URL.revokeObjectURL(photoPreview);

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const clearPendingPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);

    setPhotoFile(null);
    setPhotoPreview("");
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const [passwords, setPasswords] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [showPwd, setShowPwd] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  const [pwdLoading, setPwdLoading] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const setPwd = (k, v) => setPasswords((p) => ({ ...p, [k]: v }));
  const toggleShow = (k) => setShowPwd((p) => ({ ...p, [k]: !p[k] }));

  const handleSave = async () => {
    setLoading(true); // Use a loading state for the save operation
    try {
      const payload = {
        id: profile?.id || user?.id,
        emp_code: profile?.emp_code,
        name: form.name,
        email: form.email,
        mobile_number: form.phone,
        dob: form.dob,
        address: form.address,
        city: form.city,
        district: form.district,
        state: form.state,
        pin: form.pin,
        aadhar_card_no: form.aadhar_card_no,
        pan_card_no: form.pan_card_no,
        bank_name: form.bank_name,
        bank_ifsc_code: form.bank_ifsc_code,
        bank_account_no: form.bank_account_no,
        pf_no: form.pf_no,
        esi_no: form.esi_no,
        gender: form.gender,
        department: form.department,
        designation: form.designation,
        joining_date: form.joining_date,
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
        mobile_number: form.phone,
        dob: form.dob,
        address: form.address,
        city: form.city,
        district: form.district,
        state: form.state,
        pin: form.pin,
        aadhar_card_no: form.aadhar_card_no,
        pan_card_no: form.pan_card_no,
        bank_name: form.bank_name,
        bank_ifsc_code: form.bank_ifsc_code,
        bank_account_no: form.bank_account_no,
        pf_no: form.pf_no,
        esi_no: form.esi_no,
        gender: form.gender,
        department: form.department,
        designation: form.designation,
        joining_date: form.joining_date,
        photo: updatedPhoto || prev?.photo,
      }));

      if (updateCurrentUser) {
        updateCurrentUser({
          ...form,
          photo: updatedPhoto || profile?.photo
        });
      }

      if (photoFile) clearPendingPhoto();
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
      name: profile?.name || "",
      email: profile?.email || "",
      phone: profile?.mobile_number || "",
      dob: profile?.dob || "",
      address: profile?.address || "",
      city: profile?.city || "",
      district: profile?.district || "",
      state: profile?.state || "",
      pin: profile?.pin || "",
      aadhar_card_no: profile?.aadhar_card_no || "",
      pan_card_no: profile?.pan_card_no || "",
      bank_name: profile?.bank_name || "",
      bank_ifsc_code: profile?.bank_ifsc_code || "",
      bank_account_no: profile?.bank_account_no || "",
      pf_no: profile?.pf_no || "",
      esi_no: profile?.esi_no || "",
    });
    setEditing(false);
  };

  const handlePasswordUpdate = async () => {
    if (!passwords.current || !passwords.next || !passwords.confirm) {
      toast.error("All password fields are required");
      return;
    }
    if (!isPasswordValid(passwords.next)) {
      toast.error("Password must be 6+ chars with uppercase, lowercase, number & special character");
      return;
    }
    setPwdLoading(true);
    try {
      const res = await authApi.changePassword(
        user?.accessToken,
        user?.tokenType,
        passwords.current,
        passwords.next,
        passwords.confirm,
      );
      toast.success(res?.message || "Password updated successfully");
      setPasswords({ current: "", next: "", confirm: "" });
    } catch (err) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setPwdLoading(false);
    }
  };

  const netSalary =
    (emp.basicSalary || 0) +
    (emp.allowances || 0) +
    (emp.bonus || 0) -
    (emp.deductions || 0);
  const joinYear = emp.joinDate ? new Date(emp.joinDate).getFullYear() : "—";
  const tenure = new Date().getFullYear() - joinYear;

  if (loading)
    return (
      <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="skeleton h-24 w-full" />
            <div className="px-5 pb-5 -mt-16">
              <div className="flex items-end justify-between mb-4">
                <div className="skeleton w-24 h-24 sm:w-32 sm:h-32 rounded-3xl border-[4px] sm:border-[6px] border-white dark:border-gray-800" />
              </div>
              <div className="space-y-2">
                <div className="skeleton h-5 w-36 rounded" />
                <div className="skeleton h-3.5 w-24 rounded" />
                <div className="flex gap-2 pt-2">
                  <div className="skeleton h-6 w-20 rounded-full" />
                  <div className="skeleton h-6 w-24 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
            <div className="skeleton w-10 h-10 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3 w-28 rounded" />
              <div className="skeleton h-5 w-24 rounded" />
            </div>
            <div className="skeleton w-5 h-5 rounded" />
          </div>
        </div>

        <div className="space-y-4">
          {[
            { title: "w-40", rows: 2 }, // Contact Information
            { title: "w-44", rows: 4 }, // Employment Details
          ].map((card, i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700"
            >
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <div className={`skeleton h-4 ${card.title} rounded`} />
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {[...Array(card.rows)].map((_, index) => (
                  <div
                    key={index}
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
    <div className="space-y-4">
      {user?.role === 'employee' && !emp.aadhar_card_no && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 px-4 py-3 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="text-amber-500" size={18} />
            <p className="text-sm font-medium">
              Please complete your profile details and hit Save to unlock all features.
            </p>
          </div>
        </div>
      )}

      {/* Top Actions */}
      <div className="flex justify-end">
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-brand-600 dark:text-brand-400 bg-white dark:bg-gray-800 border border-brand-200 dark:border-brand-700 rounded-xl hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors shadow-sm"
          >
            <Edit2 size={16} /> Edit Profile
          </button>
        ) : (
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-gray-500 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            <X size={16} /> Cancel
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
      {/* ══ LEFT COLUMN — Profile card ══ */}
      <div className="space-y-4 lg:sticky">
        {/* Avatar card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Banner */}
          <div className="h-24 bg-gradient-to-br from-brand-500 via-brand-600 to-indigo-700 relative">
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)",
                backgroundSize: "30px 30px",
              }}
            />
          </div>

          <div className="px-5 pb-5 -mt-16">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
              <div className="relative">
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-3xl bg-gradient-to-br from-brand-500 to-indigo-600 border-[4px] sm:border-[6px] border-white dark:border-gray-800 flex items-center justify-center text-white text-3xl sm:text-4xl font-bold shadow-2xl shadow-brand-500/20 overflow-hidden">
                  {photoPreview || emp.photo ? (
                    <img
                      src={photoPreview || getEmployeePhotoUrl(emp.photo)}
                      alt="Employee Photo"
                      className="w-full h-full object-cover rounded-2xl"
                    />
                  ) : (
                    emp.avatar
                  )}
                </div>
                {editing && (
                  <>
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="absolute -bottom-1 -right-1 w-8 h-8 bg-gray-800 dark:bg-gray-600 rounded-full flex items-center justify-center text-white hover:bg-brand-600 transition-colors shadow-lg border-2 border-white dark:border-gray-800"
                      title="Change photo"
                    >
                      <Camera size={14} />
                    </button>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="sr-only"
                      onChange={(e) =>
                        handlePhotoChange(e.target.files?.[0] || null)
                      }
                    />
                  </>
                )}
              </div>
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
              {emp.role === 0 ? "Super Admin" : "Employee"}
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                <CheckCircle size={10} /> {emp.status}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400">
                <Building2 size={10} /> {emp.department || "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Emp code badge */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
            <Hash size={18} className="text-purple-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400 font-medium">Employee Code</p>
            <p className="text-base font-bold text-gray-900 dark:text-white font-mono truncate">
              {emp.emp_code}
            </p>
          </div>
          <div className="ml-auto flex-shrink-0">
            <Award size={20} className="text-yellow-400" />
          </div>
        </div>
      </div>

      {/* ══ RIGHT COLUMN — Details ══ */}
      <div className="space-y-4">
        {/* Contact information */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-brand-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Contact Information
              </h3>
            </div>
            {editing && (
              <span className="text-xs text-brand-500 font-medium">
                Editing…
              </span>
            )}
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <InfoRow
              icon={Mail}
              iconBg="bg-brand-50 dark:bg-brand-900/20"
              iconColor="text-brand-600"
              label="Email Address"
              value={emp.email}
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
              value={emp.mobile_no || "—"}
              editing={editing}
              editNode={
                <input
                  maxLength={10}
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
          </div>
        </div>

        {/* Employment details */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <Building2 size={16} className="text-brand-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Employment Details
            </h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <InfoRow
              icon={Hash}
              iconBg="bg-brand-50 dark:bg-brand-900/20"
              iconColor="text-brand-600"
              label="Company Code"
              value={emp.company_code || "—"}
            />
            <InfoRow
              icon={MapPin}
              iconBg="bg-indigo-50 dark:bg-indigo-900/20"
              iconColor="text-indigo-600"
              label="Unit / Branch"
              value={emp.unit || "—"}
            />
            <InfoRow
              icon={Calendar}
              iconBg="bg-orange-50 dark:bg-orange-900/20"
              iconColor="text-orange-600"
              label="Date of Birth"
              value={emp.dob ? new Date(emp.dob).toLocaleDateString() : "—"}
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
              icon={User}
              iconBg="bg-pink-50 dark:bg-pink-900/20"
              iconColor="text-pink-600"
              label="Gender"
              value={emp.gender || "—"}
              editing={editing}
              editNode={
                <select
                  value={form.gender}
                  onChange={(e) => set("gender", e.target.value)}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              }
            />
            <InfoRow
              icon={Building2}
              iconBg="bg-blue-50 dark:bg-blue-900/20"
              iconColor="text-blue-600"
              label="Department"
              value={emp.department || "—"}
              editing={editing}
              editNode={
                <input
                  value={form.department}
                  onChange={(e) => set("department", e.target.value)}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={Award}
              iconBg="bg-emerald-50 dark:bg-emerald-900/20"
              iconColor="text-emerald-600"
              label="Designation"
              value={emp.designation || "—"}
              editing={editing}
              editNode={
                <input
                  value={form.designation}
                  onChange={(e) => set("designation", e.target.value)}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={Calendar}
              iconBg="bg-teal-50 dark:bg-teal-900/20"
              iconColor="text-teal-600"
              label="Joining Date"
              value={emp.joining_date ? new Date(emp.joining_date).toLocaleDateString() : "—"}
              editing={editing}
              editNode={
                <ModernDatePicker
                  value={formatDateInputValue(form.joining_date)}
                  onChange={(e) => set("joining_date", e.target.value)}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={Home}
              iconBg="bg-purple-50 dark:bg-purple-900/20"
              iconColor="text-purple-600"
              label="Full Address"
              value={emp.address || "—"}
              editing={editing}
              editNode={
                <input
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={Home}
              iconBg="bg-purple-50 dark:bg-purple-900/20"
              iconColor="text-purple-600"
              label="City"
              value={emp.city || "—"}
              editing={editing}
              editNode={
                <input
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={MapPin}
              iconBg="bg-purple-50 dark:bg-purple-900/20"
              iconColor="text-purple-600"
              label="District"
              value={emp.district || "—"}
              editing={editing}
              editNode={
                <input
                  value={form.district}
                  onChange={(e) => set("district", e.target.value)}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={MapPin}
              iconBg="bg-purple-50 dark:bg-purple-900/20"
              iconColor="text-purple-600"
              label="State"
              value={emp.state || "—"}
              editing={editing}
              editNode={
                <input
                  value={form.state}
                  onChange={(e) => set("state", e.target.value)}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={Hash}
              iconBg="bg-purple-50 dark:bg-purple-900/20"
              iconColor="text-purple-600"
              label="PIN Code"
              value={emp.pin || "—"}
              editing={editing}
              editNode={
                <input
                  maxLength={6}
                  value={form.pin}
                  onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
          </div>
        </div>

        {/* Identity & Bank Details */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <CreditCard size={16} className="text-brand-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Identity & Bank Details
            </h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <InfoRow
              icon={User}
              iconBg="bg-blue-50 dark:bg-blue-900/20"
              iconColor="text-blue-600"
              label="Aadhar Card No"
              value={emp.aadhar_card_no || "—"}
              editing={editing}
              editNode={
                <input
                  maxLength={12}
                  value={form.aadhar_card_no}
                  onChange={(e) => set("aadhar_card_no", e.target.value.replace(/\D/g, ""))}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={CreditCard}
              iconBg="bg-blue-50 dark:bg-blue-900/20"
              iconColor="text-blue-600"
              label="PAN Card No"
              value={emp.pan_card_no || "—"}
              editing={editing}
              editNode={
                <input
                  maxLength={10}
                  value={form.pan_card_no}
                  onChange={(e) => set("pan_card_no", e.target.value.toUpperCase())}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={Building2}
              iconBg="bg-indigo-50 dark:bg-indigo-900/20"
              iconColor="text-indigo-600"
              label="Bank Name"
              value={emp.bank_name || "—"}
              editing={editing}
              editNode={
                <input
                  value={form.bank_name}
                  onChange={(e) => set("bank_name", e.target.value)}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={Hash}
              iconBg="bg-indigo-50 dark:bg-indigo-900/20"
              iconColor="text-indigo-600"
              label="Bank IFSC Code"
              value={emp.bank_ifsc_code || "—"}
              editing={editing}
              editNode={
                <input
                  maxLength={11}
                  value={form.bank_ifsc_code}
                  onChange={(e) => set("bank_ifsc_code", e.target.value.toUpperCase())}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={Hash}
              iconBg="bg-indigo-50 dark:bg-indigo-900/20"
              iconColor="text-indigo-600"
              label="Bank Account No"
              value={emp.bank_account_no || "—"}
              editing={editing}
              editNode={
                <input
                  maxLength={20}
                  value={form.bank_account_no}
                  onChange={(e) => set("bank_account_no", e.target.value.replace(/\D/g, ""))}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={Hash}
              iconBg="bg-cyan-50 dark:bg-cyan-900/20"
              iconColor="text-cyan-600"
              label="PF Account No"
              value={emp.pf_no || "—"}
              editing={editing}
              editNode={
                <input
                  maxLength={22}
                  value={form.pf_no}
                  onChange={(e) => set("pf_no", e.target.value.replace(/\D/g, ""))}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={Hash}
              iconBg="bg-cyan-50 dark:bg-cyan-900/20"
              iconColor="text-cyan-600"
              label="ESI ID No"
              value={emp.esi_no || "—"}
              editing={editing}
              editNode={
                <input
                  maxLength={17}
                  value={form.esi_no}
                  onChange={(e) => set("esi_no", e.target.value.replace(/\D/g, ""))}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
          </div>
          {editing && (
            <div className="px-5 pb-5 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700 pt-4">
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-colors shadow-sm shadow-brand-600/30"
              >
                <Save size={16} /> Save
              </button>
            </div>
          )}
        </div>

        {/* Security — change password */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <Shield size={16} className="text-brand-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Change Password
            </h3>
          </div>
          <div className="p-5">
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { key: "current", label: "Current Password" },
                { key: "next", label: "New Password" },
                { key: "confirm", label: "Confirm Password" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                    {label}
                  </label>
                  <div className="relative">
                    <input
                      type={showPwd[key] ? "text" : "password"}
                      value={passwords[key]}
                      onChange={(e) => setPwd(key, e.target.value)}
                      placeholder="••••••••"
                      className={inputCls + " pr-9"}
                    />
                    <button
                      type="button"
                      onClick={() => toggleShow(key)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                      {showPwd[key] ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {key === "next" && (
                    <PasswordStrength password={passwords.next} isEdit />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={handlePasswordUpdate}
                disabled={pwdLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-brand-600/30"
              >
                <Shield size={14} />{" "}
                {pwdLoading ? "Updating…" : "Update Password"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
