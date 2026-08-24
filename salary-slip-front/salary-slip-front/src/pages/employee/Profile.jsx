import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ModernDatePicker from "../../components/ModernDatePicker";
import {
  formatDateInputValue,
  getEmployeePhotoUrl,
} from "../admin/AdminModals/employee-helpers";
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
  Award,
  AlertCircle,
  CheckCircle2,
  CreditCard,
  User,
  Home,
  Users,
  Plus,
  Trash2,
  GraduationCap,
  Heart,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext"; // Corrected import path
import { authApi, salaryApi } from "../../utils/api";
import { getAadhaarDisplayValue, hasStoredAadhaar, buildSafeAadhaarUpdate } from "../../utils/aadhaar";
import toast from "react-hot-toast";
import usePhotoCapture from "../../hooks/usePhotoCapture";

// Kept in sync with the backend's relation whitelist in
// UserController::parseFamilyMembers().
const RELATION_OPTIONS = [
  "Father", "Mother", "Spouse", "Son", "Daughter",
  "Brother", "Sister", "Guardian", "Other",
];

const BLANK_FAMILY_MEMBER = { name: "", relation: "", mobileNumber: "" };

// Family details are mandatory: an employee with none on file always gets at
// least one blank row to fill in, both on first load and after a cancel.
function familyFromProfile(source) {
  const rows = Array.isArray(source?.family_members) ? source.family_members : [];
  if (rows.length === 0) return [{ ...BLANK_FAMILY_MEMBER }];
  return rows.map((m) => ({
    name: m.name || "",
    relation: m.relation || "",
    mobileNumber: m.mobile_number || "",
  }));
}

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

export default function Profile() {
  const { user, updateCurrentUser } = useAuth();
  // Nothing to fetch without a session, so nothing should be spinning. Derived
  // from the token rather than corrected from the effect, which rendered a
  // spinner and then removed it on a second pass for signed-out visitors.
  const hasToken = Boolean(user?.accessToken);
  const [loading, setLoading] = useState(hasToken);
  const [spinnerFor, setSpinnerFor] = useState(hasToken);
  if (spinnerFor !== hasToken) {
    setSpinnerFor(hasToken);
    setLoading(hasToken);
  }
  const navigate = useNavigate();
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
    aadhar_card_no: getAadhaarDisplayValue(profile),
  };

  const [editing, setEditing] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
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
    education: "",
    marital_status: "",
  });

  const [familyDetails, setFamilyDetails] = useState([{ ...BLANK_FAMILY_MEMBER }]);

  const [departmentsList, setDepartmentsList] = useState([]);

  useEffect(() => {
    async function fetchDepartments() {
      try {
        const res = await salaryApi.getDepartments(user?.accessToken, user?.tokenType);
        setDepartmentsList(res?.data?.map(d => d.name) || []);
      } catch (e) {
        console.error("Failed to fetch departments", e);
      }
    }
    if (user?.accessToken) fetchDepartments();
  }, [user]);

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
          aadhar_card_no: getAadhaarDisplayValue(data),
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
          education: data.education || "",
          marital_status: data.marital_status || "",
        });
        setFamilyDetails(familyFromProfile(data));
      } catch (err) {
        toast.error(err.message || "Failed to load profile details");
      } finally {
        setLoading(false);
      }
    }

    if (user?.accessToken) fetchProfile();
  }, [user]);

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

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const updateFamilyMember = (index, key, value) => {
    setFamilyDetails((prev) => prev.map((m, i) => (i === index ? { ...m, [key]: value } : m)));
  };
  const addFamilyMember = () => {
    setFamilyDetails((prev) => [...prev, { ...BLANK_FAMILY_MEMBER }]);
  };
  const removeFamilyMember = (index) => {
    // At least one row must always remain — family details are required, not optional.
    setFamilyDetails((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const handleSave = async () => {
    if (form.pan_card_no && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(form.pan_card_no)) {
      toast.error("Invalid PAN Card format. (e.g., ABCDE1234F)");
      setActiveStep(3);
      return;
    }
    if (form.bank_ifsc_code && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(form.bank_ifsc_code)) {
      toast.error("Invalid Bank IFSC format. (e.g., SBIN0001234)");
      setActiveStep(3);
      return;
    }

    // A blank input on edit omits the field so the stored number survives; a
    // partial or masked entry is refused rather than written.
    const aadhaar = buildSafeAadhaarUpdate({
      enteredValue: form.aadhar_card_no,
      hasStored: hasStoredAadhaar(profile),
    });
    if (aadhaar.error) {
      toast.error(aadhaar.error);
      setActiveStep(3);
      return;
    }

    // Family details are required, not optional: at least one complete row
    // (name + relation) must be present before the profile can be saved.
    const cleanFamily = familyDetails
      .map((m) => ({
        name: (m.name || "").trim(),
        relation: (m.relation || "").trim(),
        mobile_number: (m.mobileNumber || "").trim(),
      }))
      .filter((m) => m.name || m.relation || m.mobile_number);

    if (cleanFamily.length === 0) {
      toast.error("Add at least one family member — this section is required.");
      setActiveStep(4);
      return;
    }
    for (let i = 0; i < cleanFamily.length; i++) {
      const member = cleanFamily[i];
      if (!member.name) {
        toast.error(`Family member ${i + 1}: enter a name.`);
        setActiveStep(4);
        return;
      }
      if (!member.relation) {
        toast.error(`Family member ${i + 1}: select a relation.`);
        setActiveStep(4);
        return;
      }
      if (member.mobile_number && !/^\d{10}$/.test(member.mobile_number)) {
        toast.error(`Family member ${i + 1}: enter a valid 10-digit mobile number.`);
        setActiveStep(4);
        return;
      }
    }

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
        ...(aadhaar.include && { aadhar_card_no: aadhaar.value }),
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
        education: form.education,
        marital_status: form.marital_status,
        family_members: cleanFamily,
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
        // aadhar_card_no is hidden on the user model, so the update response
        // never discloses it — sync from the value just sent instead.
        ...(aadhaar.include && { aadhar_card_no: aadhaar.value, has_aadhaar: true }),
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
        education: form.education,
        marital_status: form.marital_status,
        photo: updatedPhoto || prev?.photo,
        family_members: cleanFamily,
      }));
      setFamilyDetails(cleanFamily.map((m) => ({ name: m.name, relation: m.relation, mobileNumber: m.mobile_number })));

      if (updateCurrentUser) {
        updateCurrentUser({
          ...form,
          photo: updatedPhoto || profile?.photo,
          family_members: cleanFamily,
        });
      }

      if (photoFile) clearPendingPhoto();
      toast.success("Profile updated successfully");

      const completionFields = [
        "name", "email", "phone", "dob", "address", "city", "district", "state", "pin",
        "aadhar_card_no", "pan_card_no", "bank_name", "bank_ifsc_code", "bank_account_no",
        "gender"
      ];
      let filled = 0;
      const source = { ...form, phone: form.mobile_number || form.phone };
      completionFields.forEach(field => {
        if (source[field] && String(source[field]).trim() !== "") {
          filled++;
        }
      });
      // Family details are validated as non-empty before this point is reached,
      // so they always count as complete in this post-save check.
      const newCompletionPercentage = Math.round(((filled + 1) / (completionFields.length + 1)) * 100);

      if (newCompletionPercentage === 100) {
        navigate("/employee");
        return;
      }
    } catch (err) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
    setEditing(false);
    setActiveStep(1);
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
      aadhar_card_no: getAadhaarDisplayValue(profile),
      pan_card_no: profile?.pan_card_no || "",
      bank_name: profile?.bank_name || "",
      bank_ifsc_code: profile?.bank_ifsc_code || "",
      bank_account_no: profile?.bank_account_no || "",
      pf_no: profile?.pf_no || "",
      esi_no: profile?.esi_no || "",
      gender: profile?.gender || "",
      department: profile?.department || "",
      designation: profile?.designation || "",
      joining_date: profile?.joining_date || "",
      education: profile?.education || "",
      marital_status: profile?.marital_status || "",
    });
    setFamilyDetails(familyFromProfile(profile));
    setEditing(false);
    setActiveStep(1);
  };

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
    );  // Calculate Profile Completion Percentage
  // Required employee profile fields (PF and ESI are explicitly OPTIONAL)
  const completionFields = [
    "name", "email", "phone", "dob", "address", "city", "district", "state", "pin",
    "aadhar_card_no", "pan_card_no", "bank_name", "bank_ifsc_code", "bank_account_no",
    "gender"
  ];

  const calculateCompletion = () => {
    let filled = 0;
    const source = editing ? form : { ...emp, phone: emp.mobile_number || emp.mobile_no || emp.phone };
    completionFields.forEach(field => {
      if (source[field] && String(source[field]).trim() !== "") {
        filled++;
      }
    });
    // Family details count as one more required item: at least one row with
    // both a name and a relation.
    const familySource = editing ? familyDetails : (profile?.family_members || []);
    const hasFamily = (familySource || []).some(
      (m) => String(m.name || "").trim() && String(m.relation || "").trim()
    );
    return Math.round(((filled + (hasFamily ? 1 : 0)) / (completionFields.length + 1)) * 100);
  };
  const completionPercentage = calculateCompletion();

  return (
    <div className="space-y-4">
      {completionPercentage < 100 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 px-4 py-3 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="text-amber-500 shrink-0" size={20} />
            <p className="text-sm font-semibold">
              Notice: Portal pages are locked until your full profile details — including at least one Family Details entry — are completed and saved. (PF and ESI numbers are optional).
            </p>
          </div>
        </div>
      )}

      {/* Profile Completion & Top Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden">
        {/* Background progress indicator effect */}
        <div 
          className="absolute left-0 top-0 bottom-0 bg-brand-50/50 dark:bg-brand-900/10 transition-all duration-1000 ease-out" 
          style={{ width: `${completionPercentage}%` }} 
        />
        
        <div className="flex items-center gap-4 w-full sm:w-auto relative">
          <div className="relative w-14 h-14 flex items-center justify-center flex-shrink-0 bg-white dark:bg-gray-800 rounded-full shadow-sm">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-gray-100 dark:text-gray-700"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className={`${completionPercentage === 100 ? 'text-green-500' : 'text-brand-500'} transition-all duration-1000 ease-out`}
                strokeDasharray={`${completionPercentage}, 100`}
                strokeWidth="3.5"
                strokeDashoffset="0"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className={`absolute text-xs font-bold ${completionPercentage === 100 ? 'text-green-600 dark:text-green-400' : 'text-brand-600 dark:text-brand-400'}`}>
              {completionPercentage}%
            </span>
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Profile Completion</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {completionPercentage === 100 
                ? "Your profile is fully complete! Excellent job." 
                : "Complete your profile to unlock all features."}
            </p>
          </div>
        </div>

        <div className="flex-shrink-0 w-full sm:w-auto flex justify-end relative">
          {!editing ? (
            <button
              onClick={() => {
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
                  aadhar_card_no: getAadhaarDisplayValue(profile),
                  pan_card_no: profile?.pan_card_no || "",
                  bank_name: profile?.bank_name || "",
                  bank_ifsc_code: profile?.bank_ifsc_code || "",
                  bank_account_no: profile?.bank_account_no || "",
                  pf_no: profile?.pf_no || "",
                  esi_no: profile?.esi_no || "",
                  gender: profile?.gender || "",
                  department: profile?.department || "",
                  designation: profile?.designation || "",
                  joining_date: profile?.joining_date || "",
                  education: profile?.education || "",
                  marital_status: profile?.marital_status || "",
                });
                setFamilyDetails(familyFromProfile(profile));
                setEditing(true);
              }}
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
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
      {/* ══ LEFT COLUMN — Profile card ══ */}
      <div className="space-y-4 lg:sticky min-w-0">
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
                      onClick={requestCapture}
                      className="absolute -bottom-1 -right-1 w-8 h-8 bg-gray-800 dark:bg-gray-600 rounded-full flex items-center justify-center text-white hover:bg-brand-600 transition-colors shadow-lg border-2 border-white dark:border-gray-800"
                      title="Change photo"
                    >
                      <Camera size={14} />
                    </button>
                    {cameraModal}
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
              <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                {form.name}
              </h2>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {emp.role === 0 ? "Super Admin" : "Employee"}
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                <CheckCircle2 size={10} /> {emp.status}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400">
                <Building2 size={10} /> <span className="truncate max-w-[120px]">{emp.department || "—"}</span>
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
      <div className="space-y-4 min-w-0">
        
        {/* Stepper Tabs */}
        <div className="flex flex-wrap bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-2 gap-2">
          {[
            { id: 1, label: "1. Basic Details" },
            { id: 2, label: "2. Address Details" },
            { id: 3, label: "3. Identity & Bank" },
            { id: 4, label: "4. Family Details" },
          ].map(step => (
            <button
              key={step.id}
              onClick={() => setActiveStep(step.id)}
              className={`px-4 py-2.5 text-sm font-semibold rounded-xl flex-1 text-center whitespace-nowrap transition-colors ${
                activeStep === step.id
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
                  : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700"
              }`}
            >
              {step.label}
            </button>
          ))}
        </div>

        {activeStep === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
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
              icon={GraduationCap}
              iconBg="bg-amber-50 dark:bg-amber-900/20"
              iconColor="text-amber-600"
              label="Education"
              value={emp.education || "—"}
              editing={editing}
              editNode={
                <input
                  value={form.education}
                  onChange={(e) => set("education", e.target.value)}
                  placeholder="e.g. B.Com, MBA"
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                />
              }
            />
            <InfoRow
              icon={Heart}
              iconBg="bg-rose-50 dark:bg-rose-900/20"
              iconColor="text-rose-600"
              label="Marital Status"
              value={emp.marital_status || "—"}
              editing={editing}
              editNode={
                <select
                  value={form.marital_status}
                  onChange={(e) => set("marital_status", e.target.value)}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                >
                  <option value="">Select Marital Status</option>
                  <option value="MARRIED">Married</option>
                  <option value="UNMARRIED">Unmarried</option>
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
                <select
                  value={form.department}
                  onChange={(e) => set("department", e.target.value)}
                  className="mt-0.5 w-full text-sm bg-transparent border-b border-brand-400 text-gray-900 dark:text-white focus:outline-none py-0.5"
                >
                  <option value="">Select Department</option>
                  {departmentsList.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
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
          </div>
        </div>
        
        {editing && (
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setActiveStep(2)}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
            >
              Next Step
            </button>
          </div>
        )}
        </div>
        )}

        {activeStep === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
        {/* Address & Additional Details */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <MapPin size={16} className="text-brand-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Address & Additional Details
            </h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
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
        
        {editing && (
          <div className="flex justify-between pt-2">
            <button
              onClick={() => setActiveStep(1)}
              className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 text-sm font-semibold rounded-xl transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setActiveStep(3)}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
            >
              Next Step
            </button>
          </div>
        )}
        </div>
        )}

        {activeStep === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
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
              label="Aadhaar Card No"
              value={emp.aadhar_card_no || "—"}
              editing={editing}
              editNode={
                <input
                  maxLength={14}
                  value={form.aadhar_card_no}
                  onChange={(e) => set("aadhar_card_no", e.target.value)}
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
            <div className="px-5 pb-5 flex justify-between gap-3 border-t border-gray-100 dark:border-gray-700 pt-4">
              <button
                onClick={() => setActiveStep(2)}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 text-sm font-semibold rounded-xl transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setActiveStep(4)}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
              >
                Next Step
              </button>
            </div>
          )}
        </div>
        </div>
        )}

        {activeStep === 4 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
        {/* Family Details — required, at least one member */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-brand-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Family Details
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                Required
              </span>
            </div>
          </div>

          <div className="p-5 space-y-3">
            {!editing && (
              (profile?.family_members || []).length > 0 ? (
                (profile.family_members || []).map((m, i) => (
                  <div
                    key={m.id || i}
                    className="flex items-center gap-3 py-2 border-b border-gray-50 dark:border-gray-700/50 last:border-0"
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-brand-50 dark:bg-brand-900/20">
                      <Users size={16} className="text-brand-600" />
                    </div>
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-0.5">
                      <div>
                        <p className="text-xs text-gray-400 font-medium">Name</p>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{m.name || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium">Relation</p>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{m.relation || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium">Mobile Number</p>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{m.mobile_number || "—"}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                  <AlertCircle size={16} className="shrink-0" />
                  No family members added yet. Click "Edit Profile" to add at least one — this is required.
                </div>
              )
            )}

            {editing && familyDetails.map((member, index) => (
              <div
                key={index}
                className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end bg-gray-50 dark:bg-gray-900/30 rounded-xl p-3"
              >
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-1">Name</p>
                  <input
                    value={member.name}
                    onChange={(e) => updateFamilyMember(index, "name", e.target.value)}
                    placeholder="Full name"
                    className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-1">Relation</p>
                  <select
                    value={member.relation}
                    onChange={(e) => updateFamilyMember(index, "relation", e.target.value)}
                    className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="">Select relation</option>
                    {RELATION_OPTIONS.map((rel) => (
                      <option key={rel} value={rel}>{rel}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-1">Mobile Number</p>
                  <input
                    maxLength={10}
                    value={member.mobileNumber}
                    onChange={(e) => updateFamilyMember(index, "mobileNumber", e.target.value.replace(/\D/g, ""))}
                    placeholder="Optional"
                    className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeFamilyMember(index)}
                  disabled={familyDetails.length === 1}
                  title={familyDetails.length === 1 ? "At least one family member is required" : "Remove"}
                  className="flex items-center justify-center w-9 h-9 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}

            {editing && (
              <button
                type="button"
                onClick={addFamilyMember}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-brand-600 dark:text-brand-400 border border-dashed border-brand-300 dark:border-brand-700 rounded-xl hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors w-full sm:w-auto justify-center"
              >
                <Plus size={16} /> Add Family Member
              </button>
            )}
          </div>

          {editing && (
            <div className="px-5 pb-5 flex justify-between gap-3 border-t border-gray-100 dark:border-gray-700 pt-4">
              <button
                onClick={() => setActiveStep(3)}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 text-sm font-semibold rounded-xl transition-colors"
              >
                Previous
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 px-6 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-colors shadow-sm shadow-brand-600/30"
              >
                <Save size={16} /> Save Profile
              </button>
            </div>
          )}
        </div>
        </div>
        )}

      </div>
    </div>
    </div>
  );
}
