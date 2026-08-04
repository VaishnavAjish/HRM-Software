/* global __APP_LABEL__ */
const APP_LABEL =
  typeof __APP_LABEL__ !== "undefined" ? __APP_LABEL__ : "NISS HRMS";

import { useRef, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  Eye,
  EyeOff,
  ClipboardList,
  AlertCircle,
  ArrowLeft,
  Mail,
  KeyRound,
  CheckCircle2,
  ChevronRight,
  Send,
  UserCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import { authApi } from "../../utils/api";
import { COMPANY_OPTIONS, getCompanyUnits, getCompanyConfig, normalizeCompanyId } from "../../config/companyConfig";

/* ─── Step indicator ─── */
function StepBar({ step }) {
  const steps = ["Verify Employee", "Verify Email", "Set Password"];
  return (
    <div className="flex items-center justify-center mb-7">
      {steps.map((label, i) => {
        const idx = i + 1;
        const done = step > idx;
        const active = step === idx;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center relative w-20 sm:w-28">
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
                className={`w-10 sm:w-16 h-0.5 mx-1 mb-6 sm:mb-4 rounded-full transition-all duration-500
                ${step > idx ? "bg-green-400" : "bg-gray-200 dark:bg-gray-700"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Per-box animation delay (ms) used below for the staggered wave/drop effect.
// The error timer in handleVerifyOtp adds this in so the last box's animation
// is never cut off before it finishes.
const OTP_BOX_STAGGER_MS = 90;

/* ── Correct-OTP dial sequence. These mirror the animation durations in
      index.css (.otp-slot-gather / .otp-orbit-spinning / .otp-check-burst),
      so the phase timers below never cut an animation short. ── */
const OTP_GATHER_MS = 600; // row → evenly spaced around the dial
const OTP_SPIN_MS = 1200; // full orbit around the dial
const OTP_ORBIT_MS = OTP_GATHER_MS + OTP_SPIN_MS;
const OTP_CHECK_MS = 950; // digits fade + checkmark burst, then redirect

const OTP_BOX_SIZE = 56; // w-14
const OTP_ROW_PITCH = OTP_BOX_SIZE + 12; // box + gap-3
const OTP_DIAL_RADIUS = 70;
const OTP_STAGE_HEIGHT = OTP_DIAL_RADIUS * 2 + OTP_BOX_SIZE + 16;

/* The server issues six digits (random_int(100000, 999999)) and validates
   `digits:6`. This constant drives every box, index and length check below so
   the two ends cannot drift apart again. */
export const OTP_LENGTH = 6;

const OTP_SLOTS = Array.from({ length: OTP_LENGTH }, (_, i) => i);

const OTP_BLANK = " ".repeat(OTP_LENGTH);

/* Evenly spaced around the dial starting at twelve o'clock. */
const OTP_CLOCK_POSITIONS = OTP_SLOTS.map((i) => {
  const angle = (Math.PI * 2 * i) / OTP_LENGTH - Math.PI / 2;
  return {
    x: Math.round(Math.cos(angle) * OTP_DIAL_RADIUS),
    y: Math.round(Math.sin(angle) * OTP_DIAL_RADIUS),
  };
});

function OtpInput({ value, onChange, status = "idle" }) {
  const refs = useRef([]);
  const disabled = status !== "idle";

  const handleChange = (e, i) => {
    const digit = e.target.value.replace(/\D/, "").slice(-1);
    const arr = value.padEnd(OTP_LENGTH, " ").split("");
    arr[i] = digit || " ";
    onChange(arr.join(""));
    if (digit && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const handleKey = (e, i) => {
    if (e.key === "Backspace") {
      const arr = value.padEnd(OTP_LENGTH, " ").split("");
      arr[i] = " ";
      onChange(arr.join(""));
      if (i > 0) refs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    onChange(pasted.padEnd(OTP_LENGTH, " "));
    refs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
    e.preventDefault();
  };

  const boxAnimClass =
    status === "verifying"
      ? "otp-box-verifying"
      : status === "error"
        ? "otp-box-drop"
        : "";

  const boxStateClass =
    status === "error"
      ? "border-red-400 dark:border-red-500"
      : "border-gray-200 dark:border-gray-600";

  // Once the OTP checks out the row breaks apart into a clock dial: the digits
  // swing out around the dial, orbit together, then dissolve into the checkmark.
  const onDial = status === "orbit" || status === "success";

  return (
    <div
      className="otp-stage"
      style={{ minHeight: onDial ? OTP_STAGE_HEIGHT : OTP_BOX_SIZE + 16 }}
    >
      {onDial ? (
        <>
          <div
            className={`otp-orbit ${status === "orbit" ? "otp-orbit-spinning" : ""}`}
          >
            {OTP_SLOTS.map((i) => {
              const pos = OTP_CLOCK_POSITIONS[i];
              const ch = (value || OTP_BLANK)[i];
              return (
                <div
                  key={i}
                  className={`otp-slot ${status === "orbit" ? "otp-slot-gather" : ""}`}
                  style={{
                    "--otp-row-x": `${(i - (OTP_LENGTH - 1) / 2) * OTP_ROW_PITCH}px`,
                    "--otp-clock-x": `${pos.x}px`,
                    "--otp-clock-y": `${pos.y}px`,
                    // The gather animation holds this position via `forwards`;
                    // once it's done the inline transform keeps them parked.
                    ...(status === "success"
                      ? { transform: `translate(${pos.x}px, ${pos.y}px)` }
                      : {}),
                  }}
                >
                  <div
                    className={
                      status === "orbit" ? "otp-digit-upright" : "otp-digit-fade"
                    }
                  >
                    <div className="w-14 h-14 flex items-center justify-center text-2xl font-bold rounded-xl border-2 border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 shadow-sm shadow-brand-500/30">
                      {ch === " " ? "" : ch}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {status === "success" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="otp-check-ring absolute w-20 h-20 rounded-full bg-green-400" />
              <div className="otp-check-burst">
                <CheckCircle2 size={64} className="text-green-500" />
              </div>
            </div>
          )}
        </>
      ) : (
        <div
          className="flex gap-2 sm:gap-3 justify-center my-2"
          style={{ perspective: "600px" }}
        >
          {OTP_SLOTS.map((i) => {
            const ch = (value || OTP_BLANK)[i];
            return (
              <input
                key={i}
                ref={(el) => (refs.current[i] = el)}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
                maxLength={1}
                value={ch === " " || !ch ? "" : ch}
                onChange={(e) => handleChange(e, i)}
                onKeyDown={(e) => handleKey(e, i)}
                onPaste={handlePaste}
                disabled={disabled}
                style={{ animationDelay: `${i * OTP_BOX_STAGGER_MS}ms` }}
                className={`w-11 h-12 sm:w-14 sm:h-14 text-center text-xl sm:text-2xl font-bold bg-gray-50 dark:bg-gray-700 border-2 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-900/40 transition-all disabled:cursor-not-allowed ${boxStateClass} ${boxAnimClass}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════
   Main Login Page
══════════════════════════════ */
export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();



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

  // Step 1 — Verify Employee (emp code + mobile). This is what makes "Set
  // Password" double as first-time registration: it's the same identity
  // check verifyEmployeeIdentity() runs, so a brand-new employee and someone
  // resetting a known password go through one unified flow.
  const [fCompanyId, setFCompanyId] = useState("");
  const [fUnit, setFUnit] = useState("");
  const [fEmpCode, setFEmpCode] = useState("");
  const [fAadharNum, setFAadharNum] = useState("");
  const [s1Loading, setS1Loading] = useState(false);
  const [s1Err, setS1Err] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  // Company/branch are looked up from the employee code itself (GET
  // /check-emp-code/{code}) rather than picked manually — codeResolved gates
  // both the "locked" display and the submit button, since verifyEmpCode
  // needs a real company_id/unit to scope its query correctly.
  const [codeChecking, setCodeChecking] = useState(false);
  const [codeResolved, setCodeResolved] = useState(false);

  // Step 2 — email + OTP (formerly Step 1)
  const [emailInput, setEmailInput] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(OTP_BLANK);
  const [otpErr, setOtpErr] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [otpVerifyLoading, setOtpVerifyLoading] = useState(false);
  // 'idle' | 'verifying' | 'orbit' | 'success' | 'error'
  const [otpAnim, setOtpAnim] = useState("idle");

  // Pending phase timers for the OTP animation, so leaving the flow mid-way
  // can't land the user on step 2 after they've already backed out.
  const otpTimers = useRef([]);
  const clearOtpTimers = () => {
    otpTimers.current.forEach(clearTimeout);
    otpTimers.current = [];
  };
  useEffect(() => clearOtpTimers, []);

  // Step 3 (formerly Step 2)
  const [newPass, setNewPass] = useState("");
  const [confPass, setConfPass] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [pwdErr, setPwdErr] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);

  const enterForgot = () => {
    clearOtpTimers();
    setMode("forgot");
    setStep(1);
    setFCompanyId("");
    setFUnit("");
    setFEmpCode("");
    setFAadharNum("");
    setS1Err("");
    setVerificationToken("");
    setCodeChecking(false);
    setCodeResolved(false);
    setEmailInput("");
    setOtpSent(false);
    setOtp(OTP_BLANK);
    setOtpErr("");
    setOtpAnim("idle");
    setNewPass("");
    setConfPass("");
    setPwdErr("");
  };

  /* ── Normal login handler ── */
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginErr("");
    const result = await login(
      empCode,
      password,
      COMPANY_OPTIONS.length > 1 ? "all" : COMPANY_OPTIONS[0]?.id,
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

  /* ── Step 1a: look up company/branch from the employee code itself ── */
  const handleEmpCodeBlur = async () => {
    const code = fEmpCode.trim().toUpperCase();
    setFEmpCode(code);
    if (!code) {
      setFCompanyId("");
      setFUnit("");
      setCodeResolved(false);
      return;
    }

    setCodeChecking(true);
    setS1Err("");
    try {
      const res = await authApi.checkEmpCode(code);
      const normalizedId = normalizeCompanyId(res?.company_code);
      // The DB value's casing doesn't always match the exact unit string this
      // company's config uses (e.g. "shreeji" vs "Shreeji") — match loosely
      // rather than showing a locked field with a value that isn't one of
      // the options anyone would ever have picked from the select.
      const units = getCompanyUnits(normalizedId);
      const matchedUnit =
        units.find((u) => u.toLowerCase() === String(res?.unit || "").toLowerCase()) || res?.unit || "";

      setFCompanyId(normalizedId);
      setFUnit(matchedUnit);
      setCodeResolved(true);
    } catch (error) {
      setFCompanyId("");
      setFUnit("");
      setCodeResolved(false);
      setS1Err(error.message || "Employee code not found");
    } finally {
      setCodeChecking(false);
    }
  };

  /* ── Step 1: verify employee code + mobile ── */
  const handleVerifyEmployee = async () => {
    if (!fEmpCode.trim()) {
      setS1Err("Enter your employee code");
      return;
    }
    if (!codeResolved || !fCompanyId || !fUnit) {
      setS1Err("Enter a valid employee code so your company and branch can be detected");
      return;
    }
    const code = fEmpCode.trim().toUpperCase();
    if (!/^\d{12}$/.test(fAadharNum.trim())) {
      setS1Err("Enter a valid 12-digit Aadhar card number");
      return;
    }

    setS1Err("");
    setS1Loading(true);
    try {
      const res = await authApi.verifyEmpCode(code, fCompanyId, fUnit, {
        aadhar_num: fAadharNum.trim(),
        mob_num: fAadharNum.trim(),
      });
      setVerificationToken(res?.verification_token || "");
      // Prefills whatever email is already on file — blank for a genuinely
      // first-time registrant, who then simply types a new one in step 2.
      setEmailInput(res?.data?.email || "");
      setFEmpCode(code);
      setStep(2);
    } catch (error) {
      setS1Err(error.message || "Could not verify your details. Please check and try again.");
    } finally {
      setS1Loading(false);
    }
  };

  /* ── Step 2: send OTP to email ── */
  const handleSendOtp = async () => {
    if (!emailInput.trim() || !emailInput.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }

    setSendLoading(true);
    try {
      await authApi.verifyEmail(emailInput.trim(), {
        emp_code: fEmpCode,
        verification_token: verificationToken,
        company_code: fCompanyId,
        unit: fUnit,
      });
      setOtp(OTP_BLANK);
      setOtpVerifyLoading(false);
      setOtpAnim("idle");
      setOtpSent(true);
      setOtpErr("");
      toast.success(`OTP sent to ${emailInput}`);
    } catch (error) {
      toast.error(error.message || "Unable to send OTP. Please try again.");
    } finally {
      setSendLoading(false);
    }
  };

  /* ── Step 2 (OTP verification) → go to step 3 ── */
  const handleVerifyOtp = async () => {
    const entered = otp.replace(/\s/g, "");
    if (entered.length < OTP_LENGTH) {
      setOtpErr("Please enter the 4-digit OTP");
      return;
    }

    setOtpVerifyLoading(true);
    setOtpErr("");
    setOtpAnim("verifying");
    try {
      await authApi.verifyEmailOtp(emailInput.trim(), entered);

      // Phase 1 — digits swing out to 12/3/6/9 and orbit the dial.
      setOtpAnim("orbit");
      otpTimers.current.push(
        setTimeout(() => {
          // Phase 2 — digits dissolve, checkmark bursts in.
          setOtpAnim("success");
          otpTimers.current.push(
            setTimeout(() => {
              // Phase 3 — only now move on to the password step.
              setNewPass("");
              setConfPass("");
              setPwdErr("");
              setOtpAnim("idle");
              setOtpVerifyLoading(false);
              setStep(3);
            }, OTP_CHECK_MS),
          );
        }, OTP_ORBIT_MS),
      );
    } catch (error) {
      setOtpErr(error.message || "Incorrect OTP. Please try again.");
      setOtpAnim("error");
      // Wait for the last (most-delayed) box's otp-drop (0.5s) to fully
      // finish falling, plus a small buffer, before clearing the boxes.
      otpTimers.current.push(
        setTimeout(() => {
          setOtp(OTP_BLANK);
          setOtpAnim("idle");
          setOtpVerifyLoading(false);
        }, 3 * OTP_BOX_STAGGER_MS + 500 + 100),
      );
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

    setPwdErr("");
    setPwdLoading(true);

    try {
      // Same normalisation handleVerifyOtp() used, so the value the server
      // compares against is exactly the one that was verified.
      await authApi.setNewPassword(newPass, emailInput.trim(), otp.replace(/\s/g, ""));
      toast.success("Password updated! You can now log in.");

      setMode("login");
      setEmpCode(emailInput.trim());
      setPassword("");

      // reset forgot state
      setStep(1);
      setFCompanyId("");
      setFUnit("");
      setFEmpCode("");
      setFAadharNum("");
      setS1Err("");
      setVerificationToken("");
      setCodeChecking(false);
      setCodeResolved(false);
      setEmailInput("");
      setOtpSent(false);
      setOtp(OTP_BLANK);
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

  /* ─── shared input style ─── */
  const inCls =
    "w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm transition";



  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-100 via-white to-brand-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">


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
                    Email Address or Employee Code
                  </label>
                  <input
                    value={empCode}
                    onChange={(e) => setEmpCode(e.target.value)}
                    placeholder="Enter your email or employee code"
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
                    Set Password
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


            </div>
          </>
        )}

        {/* ══ FORGOT PASSWORD (3-step) ══ */}
        {mode === "forgot" && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 border-t-4 border-t-brand-600 p-8">
            <button
              onClick={() => {
                clearOtpTimers();
                setOtpAnim("idle");
                setOtpVerifyLoading(false);
                setMode("login");
              }}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-5 transition-colors"
            >
              <ArrowLeft size={15} /> Back to Login
            </button>

            <StepBar step={step} />

            {/* ── STEP 1: Verify Employee ── */}
            {step === 1 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full mb-4">
                    <UserCheck size={24} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-950 dark:text-white">
                    Verify Employee
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-sm mx-auto">
                    First time here? Confirm your employee code and Aadhar card number to get started.
                  </p>
                </div>

                <div className="mt-7 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Employee Code
                    </label>
                    <div className="relative">
                      <input
                        value={fEmpCode}
                        onChange={(e) => {
                          setFEmpCode(e.target.value.toUpperCase());
                          if (codeResolved) setCodeResolved(false);
                        }}
                        onBlur={handleEmpCodeBlur}
                        placeholder="e.g. NI1234"
                        className={inCls + " pr-9"}
                      />
                      {codeChecking && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin" />
                      )}
                      {!codeChecking && codeResolved && (
                        <CheckCircle2
                          size={16}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500"
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Company
                      </label>
                      <select
                        value={fCompanyId}
                        disabled
                        className={inCls + " opacity-60 cursor-not-allowed"}
                      >
                        <option value="">
                          {codeChecking ? "Detecting..." : "Auto-detected"}
                        </option>
                        {COMPANY_OPTIONS.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Branch / Unit
                      </label>
                      <select
                        value={fUnit}
                        disabled
                        className={inCls + " opacity-60 cursor-not-allowed"}
                      >
                        <option value="">
                          {codeChecking ? "Detecting..." : "Auto-detected"}
                        </option>
                        {getCompanyUnits(fCompanyId).map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {codeResolved && (
                    <p className="text-xs text-green-600 dark:text-green-400 -mt-2 flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      Detected {getCompanyConfig(fCompanyId)?.label} — {fUnit}
                    </p>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Aadhar Card Number
                    </label>
                    <input
                      value={fAadharNum}
                      onChange={(e) => setFAadharNum(e.target.value.replace(/\D/g, "").slice(0, 12))}
                      placeholder="12-digit Aadhar card number"
                      type="text"
                      inputMode="numeric"
                      maxLength={12}
                      className={inCls}
                    />
                  </div>

                  {s1Err && (
                    <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                      <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                      <p className="text-xs text-red-600 dark:text-red-400">{s1Err}</p>
                    </div>
                  )}

                  <button
                    onClick={handleVerifyEmployee}
                    disabled={s1Loading || codeChecking}
                    className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm shadow-brand-600/20"
                  >
                    {s1Loading ? (
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
                </div>
              </div>
            )}

            {/* ── STEP 2: Verify Email ── */}
            {step === 2 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
                    <Mail size={24} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-950 dark:text-white">
                    Verify Email
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-sm mx-auto">
                    Enter your registered email address to receive a one-time password
                  </p>
                </div>

                <div className="mt-7 space-y-4">
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
                          setOtp(OTP_BLANK);
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
                            clearOtpTimers();
                            setOtpSent(false);
                            setOtp(OTP_BLANK);
                            setOtpVerifyLoading(false);
                            setOtpAnim("idle");
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
                        <OtpInput value={otp} onChange={setOtp} status={otpAnim} />
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
                          otp.replace(/\s/g, "").length < OTP_LENGTH || otpVerifyLoading
                        }
                        className={`w-full py-2.5 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm ${
                          otpAnim === "orbit" || otpAnim === "success"
                            ? "bg-green-600 disabled:bg-green-600 shadow-green-600/20"
                            : "bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 shadow-brand-600/20"
                        }`}
                      >
                        {otpAnim === "orbit" || otpAnim === "success" ? (
                          <>
                            <CheckCircle2 size={16} /> Verified
                          </>
                        ) : otpVerifyLoading ? (
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
                        disabled={otpVerifyLoading}
                        className="w-full py-1.5 text-sm text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Didn't receive it? Resend OTP
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 3: Set New Password ── */}
            {step === 3 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
                    <KeyRound size={24} className="text-green-600 dark:text-green-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-950 dark:text-white">
                    Set New Password
                  </h2>
                  <p className="text-xs text-gray-400 mt-2">
                    Choose a strong password for your account
                  </p>
                </div>

                <div className="mt-5 space-y-4">
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
                          {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
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
