/* global __APP_LABEL__ */
const APP_LABEL =
  typeof __APP_LABEL__ !== "undefined" ? __APP_LABEL__ : "Build better workplaces";

import { useRef, useState, useEffect } from "react";
import ModernDatePicker from "../../components/ModernDatePicker";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  Eye,
  EyeOff,
  ClipboardList,
  AlertCircle,
  ArrowLeft,
  UserCheck,
  Mail,
  KeyRound,
  CheckCircle2,
  ChevronRight,
  Send,
  Plus,
  Building2,
  MapPin,
  User,
  Phone,
  Calendar,
  Home,
  Camera,
  HelpCircle,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { authApi } from "../../utils/api";
import { COMPANY_OPTIONS, getCompanyUnits } from "../../config/companyConfig";
import WelcomePopup from "./WelcomePopup";
import usePhotoCapture from "../../hooks/usePhotoCapture";

/* ─── Step indicator ─── */
function StepBar({ step }) {
  const steps = ["Emp Code", "Verify Email", "Set Password"];
  return (
    <div className="flex items-center justify-center mb-7">
      {steps.map((label, i) => {
        const idx = i + 1;
        const done = step > idx;
        const active = step === idx;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center relative w-16 sm:w-24">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
                ${done ? "bg-green-500 text-white shadow-sm shadow-green-500/40" : ""}
                ${active ? "bg-brand-600 text-white ring-4 ring-brand-100 dark:ring-brand-900/40 shadow-sm shadow-brand-600/40" : ""}
                ${!done && !active ? "bg-gray-100 dark:bg-gray-700 text-gray-400" : ""}`}
              >
                {done ? <CheckCircle2 size={15} /> : idx}
              </div>
              <span
                className={`text-[10px] sm:text-xs mt-1.5 font-medium text-center leading-tight
                ${active ? "text-brand-600 dark:text-brand-400" : done ? "text-green-500" : "text-gray-400"}`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`w-6 sm:w-12 h-0.5 mx-0 sm:mx-1 mb-6 sm:mb-4 rounded-full transition-all duration-500
                ${step > idx ? "bg-green-400" : "bg-gray-200 dark:bg-gray-700"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── 4-box OTP Input ─── */
function OtpInput({ value, onChange }) {
  const refs = useRef([]);

  const handleChange = (e, i) => {
    const digit = e.target.value.replace(/\D/, "").slice(-1);
    const arr = value.padEnd(4, " ").split("");
    arr[i] = digit || " ";
    onChange(arr.join(""));
    if (digit && i < 3) refs.current[i + 1]?.focus();
  };

  const handleKey = (e, i) => {
    if (e.key === "Backspace") {
      const arr = value.padEnd(4, " ").split("");
      arr[i] = " ";
      onChange(arr.join(""));
      if (i > 0) refs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 4);
    onChange(pasted.padEnd(4, " "));
    refs.current[Math.min(pasted.length, 3)]?.focus();
    e.preventDefault();
  };

  return (
    <div className="flex gap-3 justify-center my-2">
      {[0, 1, 2, 3].map((i) => {
        const ch = (value || "    ")[i];
        return (
          <input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={ch === " " || !ch ? "" : ch}
            onChange={(e) => handleChange(e, i)}
            onKeyDown={(e) => handleKey(e, i)}
            onPaste={handlePaste}
            className="w-14 h-14 text-center text-2xl font-bold bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-900/40 transition-all"
          />
        );
      })}
    </div>
  );
}

/* ══════════════════════════════
   Main Login Page
══════════════════════════════ */
export default function Login() {
  const { login, loading, lookupUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  /* ── Guide popup ── */
  const [showGuide, setShowGuide] = useState(
    () => !localStorage.getItem("loginGuideShown"),
  );

  /* ── Normal login ── */
  const [empCode, setEmpCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loginErr, setLoginErr] = useState("");

  /* ── Forgot flow ── */
  const [mode, setMode] = useState("login"); // 'login' | 'forgot'
  const [step, setStep] = useState(1);

  /* ── Appointment ── */
  // (Removed showAppointment state)

  // Step 1
  const [fCompanyId, setFCompanyId] = useState("");
  const [fUnit, setFUnit] = useState("");
  const [isAutoDetected, setIsAutoDetected] = useState(false);
  const [verifyOtp, setVerifyOtp] = useState("");
  const [fCode, setFCode] = useState("");
  const [fPhoto, setFPhoto] = useState(null);
  const [fPhotoPreview, setFPhotoPreview] = useState("");
  const fPhotoPreviewRef = useRef("");
  const [fMobNum, setFMobNum] = useState("");
  const [fDob, setFDob] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [foundUser, setFoundUser] = useState(null);
  const [s1Loading, setS1Loading] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");

  // Step 2 — email + OTP
  const [emailInput, setEmailInput] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("    ");
  const [otpErr, setOtpErr] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [otpVerifyLoading, setOtpVerifyLoading] = useState(false);

  // Step 3
  const [newPass, setNewPass] = useState("");
  const [confPass, setConfPass] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [pwdErr, setPwdErr] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);

  useEffect(() => {
    if (mode !== "forgot") return;
    const val = fCode.trim();
    if (!val || COMPANY_OPTIONS.some(c => val.startsWith(c.initials))) return;

    setIsAutoDetected(false); // Reset while typing/fetching

    const timer = setTimeout(async () => {
      try {
        const res = await authApi.checkEmpCode(val);
        if (res && res.company_code) {
          setFCompanyId(res.company_code);
          if (res.unit) setFUnit(res.unit);
          setIsAutoDetected(true);
        } else {
          setIsAutoDetected(false);
        }
      } catch (err) {
        setIsAutoDetected(false);
      }
    }, 500); // Wait 500ms after the user stops typing

    return () => clearTimeout(timer);
  }, [fCode, mode]);

  const updateIdentityPhoto = (file) => {
    if (fPhotoPreviewRef.current) {
      URL.revokeObjectURL(fPhotoPreviewRef.current);
    }

    const previewUrl = file ? URL.createObjectURL(file) : "";
    fPhotoPreviewRef.current = previewUrl;
    setFPhoto(file);
    setFPhotoPreview(previewUrl);
  };

  // Camera-only capture — no gallery/file-picker path.
  const { requestCapture, cameraModal } = usePhotoCapture({
    onCapture: updateIdentityPhoto,
  });

  /* ── Normal login handler ── */
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginErr("");
    const result = await login(
      empCode,
      password,
      COMPANY_OPTIONS.map((c) => c.id).join(","),
    );
    if (result.success) {
      toast.success("Welcome back!");
      const fallbackPath = result.role === "admin" ? "/admin" : (result.role === "agent" ? "/agent" : (result.role === "candidate" ? "/candidate" : "/employee"));
      const requestedPath = location.state?.from?.pathname;
      const roleHomePrefix = result.role === "admin" ? "/admin" : (result.role === "agent" ? "/agent" : (result.role === "candidate" ? "/candidate" : "/employee"));
      const nextPath = requestedPath?.startsWith(roleHomePrefix)
        ? requestedPath
        : fallbackPath;

      navigate(nextPath, { replace: true });
    } else {
      setLoginErr(result.message);
    }
  };

  /* ── Step 1: validate emp code ── */
  const handleStep1 = async () => {
    if (!fCompanyId) {
      toast.error("Select company");
      return;
    }

    if (!fUnit) {
      toast.error("Select branch");
      return;
    }

    const empCodeValue = fCode.trim().toUpperCase();
    if (!empCodeValue) {
      toast.error("Enter employee code");
      return;
    }

    if (!fMobNum.trim()) {
      toast.error("Enter mobile number");
      return;
    }

    if (!/^\d{10}$/.test(fMobNum.trim())) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }

    if (!fAddress.trim()) {
      toast.error("Enter residential address");
      return;
    }

    setS1Loading(true);
    try {
      const data = await authApi.verifyEmpCode(
        empCodeValue,
        fCompanyId,
        fUnit,
        {
          photo: fPhoto,
          mob_num: fMobNum.trim(),
          address: fAddress.trim(),
        },
      );
      const apiUser = data?.data || data?.user || data?.employee || data;
      const found = {
        ...lookupUser(empCodeValue),
        ...(apiUser && typeof apiUser === "object" ? apiUser : {}),
        empCode: apiUser?.empCode || apiUser?.emp_code || empCodeValue,
        company_code: apiUser?.company_code || fCompanyId,
        unit: apiUser?.unit || fUnit,
        photo: apiUser?.photo || fPhoto,
        mob_num: apiUser?.mob_num || fMobNum.trim(),
        address: apiUser?.address || fAddress.trim(),
      };

      setFoundUser(found);
      setVerificationToken(data?.verification_token || "");
      setEmailInput(apiUser?.email || "");
      setOtpSent(false);
      setOtp("    ");
      setOtpErr("");
      setStep(2);
    } catch (error) {
      toast.error(
        error.message || "Unable to verify employee code. Please try again.",
      );
    } finally {
      setS1Loading(false);
    }
  };

  /* ── Step 2a: send OTP to email ── */
  const handleSendOtp = async () => {
    if (!emailInput.trim() || !emailInput.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }

    const empCodeValue =
      foundUser?.empCode || foundUser?.emp_code || fCode.trim().toUpperCase();
    const companyCode =
      foundUser?.companyId || foundUser?.company_code || fCompanyId;
    const unit = foundUser?.unit || fUnit;

    setSendLoading(true);
    try {
      await authApi.verifyEmail(
        empCodeValue,
        emailInput.trim(),
        companyCode,
        unit,
        verificationToken,
      );
      setOtp("    ");
      setOtpVerifyLoading(false);
      setOtpSent(true);
      setOtpErr("");
      toast.success(`OTP sent to ${emailInput}`);
    } catch (error) {
      toast.error(error.message || "Unable to send OTP. Please try again.");
    } finally {
      setSendLoading(false);
    }
  };

  /* ── Step 2b: verify OTP → go to step 3 ── */
  const handleVerifyOtp = async () => {
    const entered = otp.replace(/\s/g, "");
    if (entered.length < 4) {
      setOtpErr("Please enter the 4-digit OTP");
      return;
    }

    const empCodeValue =
      foundUser?.empCode || foundUser?.emp_code || fCode.trim().toUpperCase();
    const companyCode =
      foundUser?.companyId || foundUser?.company_code || fCompanyId;
    const unit = foundUser?.unit || fUnit;

    setOtpVerifyLoading(true);
    try {
      await authApi.verifyEmailOtp(
        empCodeValue,
        emailInput.trim(),
        entered,
        companyCode,
        unit,
        verificationToken,
      );
      setOtpErr("");
      setNewPass("");
      setConfPass("");
      setPwdErr("");
      setStep(3);
    } catch (error) {
      setOtpErr(error.message || "Incorrect OTP. Please try again.");
      setOtp("    ");
    } finally {
      setOtpVerifyLoading(false);
    }
  };

  /* ── Step 3: set new password ── */
  const handleSetPassword = async () => {
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

    if (!newPass) {
      setPwdErr("Password is required");
      return;
    }

    if (!passwordRegex.test(newPass)) {
      setPwdErr(
        "Password must be at least 6 characters and include 1 uppercase, 1 lowercase, 1 number, and 1 special character",
      );
      return;
    }

    if (newPass !== confPass) {
      setPwdErr("Passwords do not match");
      return;
    }

    const empCodeValue =
      foundUser?.empCode || foundUser?.emp_code || fCode.trim().toUpperCase();
    const companyCode =
      foundUser?.companyId || foundUser?.company_code || fCompanyId;
    const unit = foundUser?.unit || fUnit;

    setPwdErr("");
    setPwdLoading(true);

    try {
      await authApi.setNewPassword(
        empCodeValue,
        newPass,
        emailInput.trim(),
        companyCode,
        unit,
        verificationToken,
      );
      toast.success("Password updated! You can now log in.");

      setMode("login");
      setEmpCode(empCodeValue);
      setPassword("");

      // reset forgot state
      setStep(1);
      setFCompanyId("");
      setFUnit("");
      setFCode("");
      updateIdentityPhoto(null);
      setFMobNum("");
      setFDob("");
      setFAddress("");
      setFoundUser(null);
      setVerificationToken("");
      setEmailInput("");
      setOtpSent(false);
      setOtp("    ");
      setOtpErr("");
      setOtpVerifyLoading(false);
      setNewPass("");
      setConfPass("");
      setPwdErr("");
    } catch (error) {
      setPwdErr(
        error.message || "Unable to update password. Please try again.",
      );
    } finally {
      setPwdLoading(false);
    }
  };

  const enterForgot = () => {
    setStep(1);
    setFCompanyId("");
    setFUnit("");
    setFCode("");
    updateIdentityPhoto(null);
    setFMobNum("");
    setFDob("");
    setFAddress("");
    setFoundUser(null);
    setVerificationToken("");
    setEmailInput("");
    setOtpSent(false);
    setOtp("    ");
    setOtpVerifyLoading(false);
    setPwdLoading(false);
    setMode("forgot");
  };

  const handleGuideSetup = () => {
    localStorage.setItem("loginGuideShown", "1");
    setShowGuide(false);
    enterForgot();
  };

  const handleGuideClose = () => {
    localStorage.setItem("loginGuideShown", "1");
    setShowGuide(false);
  };

  const pwdStrength = () => {
    if (newPass.length === 0) return null;
    if (newPass.length < 6)
      return { w: "25%", color: "bg-red-400", label: "Too short" };
    if (newPass.length < 9)
      return { w: "50%", color: "bg-yellow-400", label: "Fair" };
    if (newPass.length < 12)
      return { w: "75%", color: "bg-brand-400", label: "Good" };
    return { w: "100%", color: "bg-green-500", label: "Strong" };
  };
  const strength = pwdStrength();
  const forgotUnitOptions = fCompanyId ? getCompanyUnits(fCompanyId) : [];
  const forgotCompanyLabel =
    COMPANY_OPTIONS.find((company) => company.id === fCompanyId)?.label || "";

  /* ─── shared input style ─── */
  const inCls =
    "w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition";
  const identityInputCls =
    "w-full h-12 pl-10 pr-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition";
  const identityLabelCls =
    "block text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5";
  const identityIconCls =
    "absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none";
  const canVerifyIdentity =
    fCompanyId &&
    fUnit &&
    fCode.trim() &&
    fMobNum.trim() &&
    fAddress.trim() &&
    !s1Loading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-100 via-white to-brand-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      {/* Welcome popup — first visit only */}
      {showGuide && <WelcomePopup onDismiss={handleGuideClose} onSetup={handleGuideSetup} />}

      <div className={`w-full ${mode === "forgot" ? "max-w-lg" : "max-w-md"}`}>
        {/* Logo */}
        {mode === "login" && (
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl shadow-lg shadow-brand-600/30 mb-4">
              <ClipboardList size={28} className="text-white" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400 mb-1">
              {APP_LABEL}
            </p>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              HRMS portal
            </p>
          </div>
        )}

        {/* ══ NORMAL LOGIN ══ */}
        {mode === "login" && (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 border-t-4 border-t-brand-600 p-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                Sign in
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Enter your credentials to continue
              </p>

              {loginErr && (
                <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 mb-4">
                  <AlertCircle
                    size={15}
                    className="text-red-500 flex-shrink-0"
                  />
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {loginErr}
                  </p>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Email Address
                  </label>
                  <input
                    value={empCode}
                    onChange={(e) => setEmpCode(e.target.value)}
                    placeholder="Enter your registered email"
                    required
                    className={inCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      className={inCls + " pr-11"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={enterForgot}
                    className="text-xs text-brand-600 dark:text-brand-400 hover:underline mt-1.5 block text-right w-full"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm shadow-brand-600/20 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </form>

              {/* Bottom links */}
              <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-700 space-y-3 text-center">
                <div>
                  <p className="text-xs text-gray-400 mb-2">
                    New employee? No password yet?
                  </p>
                  <button
                    onClick={enterForgot}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    <UserCheck size={15} /> Set Password with Employee Code{" "}
                    <ChevronRight size={14} />
                  </button>
                </div>

              </div>
            </div>
          </>
        )}

        {/* ══ FORGOT PASSWORD (3-step) ══ */}
        {mode === "forgot" && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 border-t-4 border-t-brand-600 p-8">
            <button
              onClick={() => setMode("login")}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-5 transition-colors"
            >
              <ArrowLeft size={15} /> Back to Login
            </button>

            <StepBar step={step} />

            {/* ── STEP 1: Emp Code ── */}
            {step === 1 && (
              <div>
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-950 dark:text-white">
                    Verify Your Identity
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    Please provide your official details to proceed
                  </p>
                </div>

                <div className="mt-7 flex justify-center">
                  <div className="relative">
                    <div
                      className="relative block cursor-pointer group"
                      onClick={requestCapture}
                    >
                      <span className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-slate-100 dark:bg-gray-700 border-4 border-white dark:border-gray-800 shadow-xl flex items-center justify-center overflow-hidden">
                        {fPhotoPreview ? (
                          <img
                            src={fPhotoPreview}
                            alt="Employee preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="flex flex-col items-center gap-1 text-gray-400">
                            <Camera size={40} />
                            <span className="text-[11px] font-bold uppercase">
                              Photo
                            </span>
                          </span>
                        )}
                      </span>
                      <span className="absolute right-0 bottom-1 sm:bottom-2 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-brand-600 text-white border-2 border-white dark:border-gray-800 shadow-lg flex items-center justify-center transition-colors group-hover:bg-brand-700">
                        <Plus size={18} className="sm:w-5 sm:h-5" />
                      </span>
                    </div>

                    {cameraModal}
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={identityLabelCls}>Employee Code</label>
                    <div className="relative">
                      <User size={16} className={identityIconCls} />
                      <input
                        value={fCode}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setFCode(val);
                          const matchedCompany = COMPANY_OPTIONS.find(c => val.startsWith(c.initials));
                          if (matchedCompany) {
                            if (fCompanyId !== matchedCompany.id) {
                              setFCompanyId(matchedCompany.id);
                              setFUnit("");
                            }
                            const afterInit = val.slice(matchedCompany.initials.length).replace(/[^A-Z]/g, '');
                            if (afterInit) {
                              const matchedBranch = matchedCompany.units.find(u => u.toUpperCase().startsWith(afterInit));
                              if (matchedBranch) setFUnit(matchedBranch);
                            }
                            setIsAutoDetected(true);
                          } else {
                            setIsAutoDetected(false);
                          }
                        }}
                        onKeyDown={(e) => e.key === "Enter" && handleStep1()}
                        placeholder="e.g. NI8526 or 7195"
                        autoFocus
                        className={identityInputCls}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={identityLabelCls}>Mobile No.</label>
                    <div className="relative">
                      <Phone size={16} className={identityIconCls} />
                      <input
                        value={fMobNum}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          if (val.length <= 10) setFMobNum(val);
                        }}
                        inputMode="tel"
                        placeholder="9876543210"
                        className={identityInputCls}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={identityLabelCls}>Company</label>
                    <div className="relative">
                      <Building2 size={16} className={identityIconCls} />
                      <select
                        value={fCompanyId}
                        onChange={(e) => {
                          setFCompanyId(e.target.value);
                          setFUnit("");
                          setFoundUser(null);
                          setEmailInput("");
                          setOtpSent(false);
                          setOtp("    ");
                          setOtpErr("");
                        }}
                        disabled={isAutoDetected}
                        className={`${identityInputCls} appearance-none ${
                          isAutoDetected ? "opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800" : ""
                        }`}
                      >
                        <option value="">Select Company</option>
                        {COMPANY_OPTIONS.map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={identityLabelCls}>Branch</label>
                    <div className="relative">
                      <MapPin size={16} className={identityIconCls} />
                      <select
                        value={fUnit}
                        onChange={(e) => {
                          setFUnit(e.target.value);
                          setFoundUser(null);
                          setEmailInput("");
                          setOtpSent(false);
                          setOtp("    ");
                          setOtpErr("");
                        }}
                        disabled={!fCompanyId || isAutoDetected}
                        className={`${identityInputCls} appearance-none ${
                          !fCompanyId || isAutoDetected ? "opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800" : ""
                        }`}
                      >
                        <option value="">Select Branch</option>
                        {forgotUnitOptions.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>


                  <div className="sm:col-span-2">
                    <label className={identityLabelCls}>
                      Residential Address
                    </label>
                    <div className="relative">
                      <Home
                        size={16}
                        className="absolute left-3.5 top-4 text-gray-400 pointer-events-none"
                      />
                      <textarea
                        value={fAddress}
                        onChange={(e) => setFAddress(e.target.value)}
                        placeholder="House no, Street name, City, Pincode"
                        rows={3}
                        className="w-full min-h-20 pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm resize-none transition"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleStep1}
                    disabled={!canVerifyIdentity}
                    className="sm:col-span-2 w-full mt-3 py-3.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-brand-600/25"
                  >
                    {s1Loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        Verify & Continue <ChevronRight size={16} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Email + OTP ── */}
            {step === 2 && (
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-9 h-9 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
                    <Mail size={18} className="text-brand-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                      Verify Email
                    </h2>
                    <p className="text-xs text-gray-400">
                      Enter your registered email to receive OTP
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-brand-100 bg-brand-50/80 px-4 py-3 text-xs text-brand-700 dark:border-brand-900/40 dark:bg-brand-900/10 dark:text-brand-200">
                    {forgotCompanyLabel} / {foundUser?.unit || fUnit} /{" "}
                    {foundUser?.empCode || foundUser?.emp_code || fCode}
                  </div>
                  {/* Email input + Send OTP */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Email Address
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={emailInput}
                        onChange={(e) => {
                          setEmailInput(e.target.value);
                          setOtpSent(false);
                          setOtp("    ");
                        }}
                        placeholder="Enter your email"
                        type="email"
                        disabled={otpSent}
                        className={
                          inCls +
                          (otpSent ? " opacity-60 cursor-not-allowed" : "")
                        }
                      />
                      <button
                        onClick={handleSendOtp}
                        disabled={!emailInput.trim() || sendLoading || otpSent}
                        className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap"
                      >
                        {sendLoading ? (
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <Send size={14} /> Send OTP
                          </>
                        )}
                      </button>
                    </div>
                    {otpSent && (
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                          OTP sent to {emailInput}
                        </p>
                        <button
                          onClick={() => {
                            setOtpSent(false);
                            setOtp("    ");
                            setOtpVerifyLoading(false);
                            setEmailInput("");
                          }}
                          className="text-xs text-brand-500 hover:underline"
                        >
                          Change email
                        </button>
                      </div>
                    )}
                  </div>

                  {/* OTP section — only visible after Send OTP */}
                  {otpSent && (
                    <div className="space-y-3 pt-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 text-center">
                          Enter 4-digit OTP
                        </label>
                        <OtpInput value={otp} onChange={setOtp} />
                      </div>

                      {otpErr && (
                        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                          <AlertCircle
                            size={14}
                            className="text-red-500 flex-shrink-0"
                          />
                          <p className="text-xs text-red-600 dark:text-red-400">
                            {otpErr}
                          </p>
                        </div>
                      )}

                      <button
                        onClick={handleVerifyOtp}
                        disabled={
                          otp.replace(/\s/g, "").length < 4 || otpVerifyLoading
                        }
                        className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm shadow-brand-600/20"
                      >
                        {otpVerifyLoading ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          <>
                            Verify & Next <ChevronRight size={16} />
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleSendOtp}
                        className="w-full py-1.5 text-sm text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                      >
                        Didn't receive it? Resend OTP
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 3: Set Password ── */}
            {step === 3 && (
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-9 h-9 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
                    <KeyRound size={18} className="text-brand-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                      Set New Password
                    </h2>
                    <p className="text-xs text-gray-400">
                      Choose a strong password for your account
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-brand-100 bg-brand-50/80 px-4 py-3 text-xs text-brand-700 dark:border-brand-900/40 dark:bg-brand-900/10 dark:text-brand-200">
                    {forgotCompanyLabel} / {foundUser?.unit || fUnit} /{" "}
                    {foundUser?.empCode || foundUser?.emp_code || fCode}
                  </div>
                  {[
                    {
                      label: "New Password",
                      val: newPass,
                      set: setNewPass,
                      show: showNew,
                      toggle: () => setShowNew((p) => !p),
                    },
                    {
                      label: "Confirm Password",
                      val: confPass,
                      set: setConfPass,
                      show: showConf,
                      toggle: () => setShowConf((p) => !p),
                    },
                  ].map(({ label, val, set, show, toggle }) => (
                    <div key={label}>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        {label}
                      </label>
                      <div className="relative">
                        <input
                          type={show ? "text" : "password"}
                          value={val}
                          onChange={(e) => set(e.target.value)}
                          placeholder="Create password"
                          className={inCls + " pr-11"}
                        />
                        <button
                          type="button"
                          onClick={toggle}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          {show ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Strength bar */}
                  {strength && (
                    <div className="space-y-1">
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${strength.color}`}
                          style={{ width: strength.w }}
                        />
                      </div>
                      <p className="text-xs text-gray-400">{strength.label}</p>
                    </div>
                  )}

                  {pwdErr && (
                    <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                      <AlertCircle
                        size={14}
                        className="text-red-500 flex-shrink-0"
                      />
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {pwdErr}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleSetPassword}
                    disabled={!newPass || !confPass || pwdLoading}
                    className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm shadow-brand-600/20"
                  >
                    {pwdLoading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} /> Set Password
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
