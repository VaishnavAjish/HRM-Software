import { useRef, useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  Eye,
  EyeOff,
  ClipboardList,
  AlertCircle,
  ArrowLeft,
  KeyRound,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  Smartphone,
  UserCheck,
  User,
  Lock,
  IdCard,
  Phone,
  ShieldCheck,
  Building2,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { authApi } from "../../utils/api";
import { COMPANY_OPTIONS, getCompanyConfig, normalizeCompanyId } from "../../config/companyConfig";

/* ─── Step indicator ─── */
function StepBar({ step }) {
  const steps = ["Verify Employee", "Verify Mobile", "Set Password"];
  return (
    <div className="flex items-start justify-center mb-8 px-1">
      {steps.map((label, i) => {
        const idx = i + 1;
        const done = step > idx;
        const active = step === idx;
        return (
          <div key={label} className="flex items-start">
            <div className="flex flex-col items-center relative w-20 sm:w-28">
              <div
                className={`relative w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
                ${done ? "bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-md shadow-green-500/30" : ""}
                ${active ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/40 login-badge-pulse scale-110" : ""}
                ${!done && !active ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700" : ""}`}
              >
                {done ? <CheckCircle2 size={16} /> : idx}
              </div>
              <span
                className={`text-[10px] sm:text-xs mt-2 font-semibold text-center leading-tight transition-colors duration-300
                ${active ? "text-indigo-600 dark:text-indigo-400" : done ? "text-green-600 dark:text-green-400" : "text-slate-400 dark:text-slate-500"}`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="w-10 sm:w-16 h-[3px] mx-1 mt-[18px] rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-700 ease-out"
                  style={{ width: step > idx ? "100%" : "0%" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Per-box animation delay (ms) used below for the staggered wave/drop effect.
const OTP_BOX_STAGGER_MS = 90;

/* ── Correct-OTP dial sequence duration tokens ── */
const OTP_GATHER_MS = 600;
const OTP_SPIN_MS = 1200;
const OTP_ORBIT_MS = OTP_GATHER_MS + OTP_SPIN_MS;
const OTP_CHECK_MS = 950;

const OTP_BOX_SIZE = 56;
const OTP_ROW_PITCH = OTP_BOX_SIZE + 12;
const OTP_DIAL_RADIUS = 70;
const OTP_STAGE_HEIGHT = OTP_DIAL_RADIUS * 2 + OTP_BOX_SIZE + 16;

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
      : "border-slate-200 dark:border-slate-700";

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
                    <div className="w-14 h-14 flex items-center justify-center text-2xl font-bold rounded-2xl border-2 border-indigo-400 dark:border-indigo-500 bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900/60 text-indigo-700 dark:text-indigo-300 shadow-lg shadow-indigo-500/25">
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
                className={`w-11 h-12 sm:w-14 sm:h-14 text-center text-xl sm:text-2xl font-bold bg-slate-50/90 dark:bg-slate-800/60 border-2 rounded-2xl text-slate-900 dark:text-white shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/40 focus:scale-105 transition-all disabled:cursor-not-allowed ${boxStateClass} ${boxAnimClass}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  /* ── Normal login state ── */
  const [empCode, setEmpCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loginErr, setLoginErr] = useState("");

  /* ── Login Employee Dropdown state ── */
  const [matchingEmployees, setMatchingEmployees] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [fetchingEmployees, setFetchingEmployees] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  /* ── Forgot / Set Password flow state ── */
  const [mode, setMode] = useState("login"); // 'login' | 'forgot'
  const [step, setStep] = useState(1);

  // Step 1 — Verify Employee
  const [fCompanyId, setFCompanyId] = useState("");
  const [fUnit, setFUnit] = useState("");
  const [fEmpCode, setFEmpCode] = useState("");
  const [fMobileNum, setFMobileNum] = useState("");
  const [s1Loading, setS1Loading] = useState(false);
  const [s1Err, setS1Err] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [codeChecking, setCodeChecking] = useState(false);
  const [codeResolved, setCodeResolved] = useState(false);

  // Set Password Employee Dropdown state
  const [fMatchingEmployees, setFMatchingEmployees] = useState([]);
  const [fSelectedEmployee, setFSelectedEmployee] = useState(null);
  const [fFetchingEmployees, setFFetchingEmployees] = useState(false);
  const [fShowDropdown, setFShowDropdown] = useState(false);

  // Step 2 — Mobile OTP Verification
  const [otp, setOtp] = useState(OTP_BLANK);
  const [devOtp, setDevOtp] = useState("");
  const [otpErr, setOtpErr] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [otpVerifyLoading, setOtpVerifyLoading] = useState(false);
  const [otpAnim, setOtpAnim] = useState("idle");

  const otpTimers = useRef([]);
  const clearOtpTimers = () => {
    otpTimers.current.forEach(clearTimeout);
    otpTimers.current = [];
  };
  useEffect(() => clearOtpTimers, []);

  /* ── Scrub sensitive credentials from URL immediately so they are never copied/shared in links ── */
  useEffect(() => {
    try {
      if (window.location.search || window.location.hash) {
        const url = new URL(window.location.href);
        const sensitiveKeys = [
          "username",
          "password",
          "pass",
          "pwd",
          "user",
          "admin",
          "email",
          "emp_code",
          "code",
        ];
        let cleaned = false;
        sensitiveKeys.forEach((key) => {
          if (url.searchParams.has(key)) {
            url.searchParams.delete(key);
            cleaned = true;
          }
        });
        if (cleaned) {
          window.history.replaceState(null, "", url.pathname + (url.search ? url.search : ""));
        }
      }
    } catch {
      if (window.location.search && (window.location.search.includes("password") || window.location.search.includes("username"))) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
    // Ensure form inputs are cleanly unpopulated on fresh mount
    setEmpCode("");
    setPassword("");
    setSelectedUser(null);
  }, []);

  // Step 3 — Set Password
  const [newPass, setNewPass] = useState("");
  const [confPass, setConfPass] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [pwdErr, setPwdErr] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);

  /* ── Search matching employees when user types code ── */
  useEffect(() => {
    if (mode !== "login") return;

    const query = empCode.trim();
    let active = true;

    const timer = setTimeout(async () => {
      if (
        query.length < 2 ||
        (selectedUser && (selectedUser.emp_code === query || selectedUser.name === query || selectedUser.email === query))
      ) {
        if (active) {
          setMatchingEmployees([]);
          setShowDropdown(false);
        }
        return;
      }

      setFetchingEmployees(true);
      try {
        const res = await authApi.getEmployeesByCode(query);
        if (active) {
          if (res?.employees && res.employees.length > 0) {
            setMatchingEmployees(res.employees);
            setShowDropdown(true);
          } else {
            setMatchingEmployees([]);
            setShowDropdown(false);
          }
        }
      } catch {
        if (active) {
          setMatchingEmployees([]);
          setShowDropdown(false);
        }
      } finally {
        if (active) {
          setFetchingEmployees(false);
        }
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [empCode, mode, selectedUser]);

  /* ── Search matching employees for Set Password ── */
  useEffect(() => {
    if (mode !== "forgot" || step !== 1) return;

    const query = fEmpCode.trim();
    let active = true;

    const timer = setTimeout(async () => {
      if (
        query.length < 2 ||
        (fSelectedEmployee && (fSelectedEmployee.emp_code === query || fSelectedEmployee.name === query))
      ) {
        if (active) {
          setFMatchingEmployees([]);
          setFShowDropdown(false);
        }
        return;
      }

      setFFetchingEmployees(true);
      try {
        const res = await authApi.getEmployeesByCode(query);
        if (active) {
          if (res?.employees && res.employees.length > 0) {
            setFMatchingEmployees(res.employees);
            setFShowDropdown(true);
          } else {
            setFMatchingEmployees([]);
            setFShowDropdown(false);
          }
        }
      } catch {
        if (active) {
          setFMatchingEmployees([]);
          setFShowDropdown(false);
        }
      } finally {
        if (active) {
          setFFetchingEmployees(false);
        }
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [fEmpCode, mode, step, fSelectedEmployee]);

  /* ── Auto-fetch Company & Branch ONLY AFTER Mobile Number (10 digits) is entered ── */
  useEffect(() => {
    if (mode !== "forgot" || step !== 1) return;

    const code = fEmpCode.trim().toUpperCase();
    const mobile = fMobileNum.trim().replace(/\D/g, "");

    if (code.length < 2 || mobile.length < 10) {
      // Do not auto-fetch until mobile number is 10 digits
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      if (active) {
        setCodeChecking(true);
        setS1Err("");
      }
      try {
        const res = await authApi.verifyEmpCode(code, "", "", { mobile_num: mobile });
        if (active && res?.data) {
          const comp = normalizeCompanyId(res.data.company_code);
          const unit = res.data.unit || "";
          setFCompanyId(comp);
          setFUnit(unit);
          setCodeResolved(true);
          if (res.verification_token) {
            setVerificationToken(res.verification_token);
          }
        }
      } catch (err) {
        if (active) {
          setCodeResolved(false);
          setS1Err(err.message || "Details do not match our records");
        }
      } finally {
        if (active) {
          setCodeChecking(false);
        }
      }
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [fEmpCode, fMobileNum, mode, step]);

  const enterForgot = () => {
    clearOtpTimers();
    setMode("forgot");
    setShowDropdown(false);
    setMatchingEmployees([]);
    setSelectedUser(null);
    setFMatchingEmployees([]);
    setFSelectedEmployee(null);
    setFShowDropdown(false);
    setStep(1);
    setFCompanyId("");
    setFUnit("");
    setFEmpCode("");
    setFMobileNum("");
    setS1Err("");
    setVerificationToken("");
    setCodeChecking(false);
    setCodeResolved(false);
    setOtp(OTP_BLANK);
    setDevOtp("");
    setOtpErr("");
    setOtpAnim("idle");
    setNewPass("");
    setConfPass("");
    setPwdErr("");
  };

  const redirectAfterLogin = (role) => {
    toast.success("Welcome back!");
    const isAdminRole = ["admin", "super_admin", "superadmin", "owner", "security_admin", "tenant_admin"].includes(role);
    const homePath = isAdminRole ? "/admin" : role === "agent" ? "/agent" : role === "candidate" ? "/candidate" : "/employee";
    const requestedPath = location.state?.from?.pathname;

    navigate(requestedPath?.startsWith(homePath) ? requestedPath : homePath, { replace: true });
  };

  /* ── Normal login handler ── */
  const handleLogin = async (e) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
      e.stopPropagation();
    }
    setLoginErr("");
    setShowDropdown(false);

    const targetEmail = selectedUser ? (selectedUser.email || selectedUser.emp_code) : empCode;
    const targetCompany = selectedUser
      ? selectedUser.company_code
      : (COMPANY_OPTIONS.length > 1 ? "all" : COMPANY_OPTIONS[0]?.id);
    const targetUserId = selectedUser ? selectedUser.id : null;

    const result = await login(
      targetEmail,
      password,
      targetCompany,
      targetUserId,
    );
    if (result.success) {
      redirectAfterLogin(result.role);
    } else {
      setLoginErr(result.message);
    }
  };

  /* ── Step 1: verify employee details ── */
  const handleVerifyEmployee = async () => {
    if (!fEmpCode.trim()) {
      setS1Err("Enter your employee code");
      return;
    }
    const code = fEmpCode.trim().toUpperCase();
    if (!/^\d{10}$/.test(fMobileNum.trim())) {
      setS1Err("Enter a valid 10-digit mobile number");
      return;
    }

    setS1Err("");
    setS1Loading(true);
    try {
      const res = await authApi.verifyEmpCode(code, fCompanyId || "", fUnit || "", {
        mobile_num: fMobileNum.trim(),
      });
      const token = res?.verification_token || "";
      const detectedCompany = normalizeCompanyId(res?.data?.company_code) || fCompanyId;
      const detectedUnit = res?.data?.unit || fUnit;

      setVerificationToken(token);
      setFEmpCode(code);
      if (detectedCompany) setFCompanyId(detectedCompany);
      if (detectedUnit) setFUnit(detectedUnit);
      setCodeResolved(true);

      setSendLoading(true);
      try {
        const otpRes = await authApi.sendMobileOtp(fMobileNum.trim(), {
          emp_code: code,
          verification_token: token,
          company_code: detectedCompany,
          unit: detectedUnit,
        });
        if (otpRes?.dev_otp) {
          setDevOtp(otpRes.dev_otp);
          toast.success(`OTP generated! Code: ${otpRes.dev_otp}`, { duration: 8000 });
        } else {
          toast.success(`OTP sent to ${fMobileNum.trim()}`);
        }
      } catch (otpError) {
        toast.error(otpError.message || "Failed to send OTP. You can retry on the next step.");
      } finally {
        setSendLoading(false);
      }

      setStep(2);
    } catch (error) {
      setS1Err(error.message || "Could not verify your details. Please check and try again.");
    } finally {
      setS1Loading(false);
    }
  };

  /* ── Step 2: send/resend Mobile OTP ── */
  const handleSendOtp = async () => {
    if (!/^\d{10}$/.test(fMobileNum.trim())) {
      toast.error("Valid mobile number is required");
      return;
    }

    setSendLoading(true);
    try {
      const res = await authApi.sendMobileOtp(fMobileNum.trim(), {
        emp_code: fEmpCode,
        verification_token: verificationToken,
        company_code: fCompanyId,
        unit: fUnit,
      });
      setOtp(OTP_BLANK);
      setOtpVerifyLoading(false);
      setOtpAnim("idle");
      setOtpErr("");
      if (res?.dev_otp) {
        setDevOtp(res.dev_otp);
        toast.success(`OTP re-generated! Code: ${res.dev_otp}`, { duration: 8000 });
      } else {
        toast.success(`OTP sent to ${fMobileNum.trim()}`);
      }
    } catch (error) {
      toast.error(error.message || "Unable to send OTP. Please try again.");
    } finally {
      setSendLoading(false);
    }
  };

  /* ── Step 2: verify Mobile OTP ── */
  const handleVerifyOtp = async () => {
    const entered = otp.replace(/\s/g, "");
    if (entered.length < OTP_LENGTH) {
      setOtpErr(`Please enter the ${OTP_LENGTH}-digit OTP`);
      return;
    }

    setOtpVerifyLoading(true);
    setOtpErr("");
    setOtpAnim("verifying");
    try {
      await authApi.verifyMobileOtp(fMobileNum.trim(), entered, {
        emp_code: fEmpCode,
        verification_token: verificationToken,
        company_code: fCompanyId,
        unit: fUnit,
      });

      setOtpAnim("orbit");
      otpTimers.current.push(
        setTimeout(() => {
          setOtpAnim("success");
          otpTimers.current.push(
            setTimeout(() => {
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
      await authApi.setNewPassword(newPass, fMobileNum.trim(), otp.replace(/\s/g, ""), {
        emp_code: fEmpCode,
        verification_token: verificationToken,
        company_code: fCompanyId,
        unit: fUnit,
      });
      toast.success("Password updated! You can now log in.");

      setMode("login");
      setEmpCode(fEmpCode);
      setPassword("");

      setStep(1);
      setFCompanyId("");
      setFUnit("");
      setFEmpCode("");
      setFMobileNum("");
      setS1Err("");
      setVerificationToken("");
      setCodeChecking(false);
      setCodeResolved(false);
      setOtp(OTP_BLANK);
      setDevOtp("");
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
      return { w: "75%", color: "bg-indigo-400", label: "Good" };
    return { w: "100%", color: "bg-green-500", label: "Strong" };
  };
  const strength = pwdStrength();

  /* ─── Shared UI class tokens ─── */
  const inCls =
    "w-full pl-10 pr-3.5 py-2.5 sm:py-3 bg-[#f8fafc] dark:bg-slate-800/80 border border-[#e2e8f0] dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-[#94a3b8] dark:placeholder:text-slate-500 text-xs sm:text-sm font-medium focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-indigo-600 dark:focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 transition-all duration-200 shadow-sm";
  const iconCls =
    "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] dark:text-slate-500";
  const primaryBtnCls =
    "login-shine-btn h-10 sm:h-11 w-full bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 hover:from-indigo-700 hover:via-indigo-700 hover:to-purple-700 disabled:from-indigo-400 disabled:to-purple-400 text-white rounded-xl font-semibold text-xs sm:text-sm shadow-md shadow-indigo-500/25 hover:shadow-lg hover:shadow-indigo-500/35 hover:scale-[1.01] active:scale-[0.99] disabled:hover:scale-100 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer mt-4 sm:mt-5";

  return (
    <div className="relative min-h-screen bg-[#f8fafc] dark:bg-[#0b0f19] flex flex-col justify-between p-3 sm:p-6 lg:p-8 overflow-hidden select-none">
      {/* ── Ambient Mesh Background Glows + Moving Dot Grids & Orbit Rings ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {/* Soft background radial glows */}
        <div className="absolute -top-40 -left-40 w-[38rem] h-[38rem] rounded-full bg-gradient-to-br from-indigo-300/40 via-purple-200/25 to-transparent blur-3xl dark:from-indigo-900/30 dark:via-purple-900/20 login-aurora-glow" />
        <div className="absolute -bottom-40 -right-40 w-[42rem] h-[42rem] rounded-full bg-gradient-to-tr from-purple-300/30 via-indigo-200/25 to-transparent blur-3xl dark:from-purple-900/25 dark:via-indigo-900/20 login-aurora-glow" style={{ animationDelay: "-7s" }} />
        
        {/* Decorative Top-Right Moving Dot Grid */}
        <div
          className="absolute top-12 right-12 w-44 h-44 opacity-25 dark:opacity-15 hidden sm:block login-dots-tr"
          style={{
            backgroundImage: "radial-gradient(#6366f1 1.5px, transparent 1.5px)",
            backgroundSize: "16px 16px",
          }}
        />

        {/* Decorative Bottom-Left Moving Dot Grid */}
        <div
          className="absolute bottom-12 left-12 w-44 h-44 opacity-25 dark:opacity-15 hidden sm:block login-dots-bl"
          style={{
            backgroundImage: "radial-gradient(#6366f1 1.5px, transparent 1.5px)",
            backgroundSize: "16px 16px",
          }}
        />

        {/* Orbiting Ambient Rings */}
        <div className="hidden lg:block absolute top-1/4 -right-16 w-96 h-96 rounded-full border border-indigo-200/30 dark:border-indigo-800/20 login-orbit-ring" />
        <div className="hidden lg:block absolute -bottom-20 left-1/3 w-80 h-80 rounded-full border border-purple-200/20 dark:border-purple-800/15 login-orbit-ring" style={{ animationDelay: "-10s" }} />
      </div>

      {/* ── Center Hero Row: Brand Section + Login Card ── */}
      <div className="flex-1 flex items-center justify-center w-full max-w-6xl mx-auto my-auto z-10 py-3 sm:py-6">
        <div className="w-full flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-16">
          {/* ══ LEFT: Hero Brand Section (Centered Desktop) ══ */}
          <aside className="hidden lg:flex flex-col items-center text-center max-w-md login-left-rise my-auto mx-auto">
            {/* Logo Badge */}
            <div className="relative inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-tr from-indigo-600 via-indigo-600 to-purple-600 rounded-[20px] sm:rounded-[24px] shadow-2xl shadow-indigo-500/35 mb-5 sm:mb-7 login-badge-pulse hover:scale-105 transition-transform duration-300">
              <ClipboardList size={34} className="text-white" />
            </div>

            <h1 className="text-3xl sm:text-4xl xl:text-5xl font-black tracking-tight text-[#0f172a] dark:text-white leading-none">
              NISS HRMS
            </h1>
            <p className="text-[11px] sm:text-xs font-extrabold uppercase tracking-[0.25em] text-indigo-600 dark:text-indigo-400 mt-2.5 sm:mt-3">
              NIDHI IMPEX SILVER STAR
            </p>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Human Resource Management System
            </p>

            <div className="w-12 sm:w-14 h-1 sm:h-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full my-5 sm:my-7 opacity-80 mx-auto" />

            <div className="space-y-3.5 flex flex-col items-center">
              <p className="text-base sm:text-lg font-extrabold text-indigo-600 dark:text-indigo-400">
                Empowering people. Simplifying HR.
              </p>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm text-center">
                A secure and intelligent platform to manage your workforce efficiently and effectively.
              </p>

              {/* Feature Pills */}
              <div className="pt-1 flex flex-col items-center gap-2">
                <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <div className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center shrink-0">
                    <Sparkles size={11} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  Enterprise-grade workforce security & role control
                </div>
                <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <div className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={11} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  Automated salary slip & attendance tracking
                </div>
              </div>
            </div>
          </aside>

          {/* ══ RIGHT: Auth Form Card ══ */}
          <main className={`relative w-full ${mode === "forgot" ? "max-w-lg" : "max-w-[410px]"} shrink-0 mx-auto`}>
            {/* Mobile Top Header Logo */}
            {mode === "login" && (
              <div className="lg:hidden text-center mb-3 sm:mb-5 login-left-rise">
                <div className="relative inline-flex items-center justify-center w-12 h-12 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-xl shadow-md shadow-indigo-500/25 mb-2 login-badge-pulse">
                  <ClipboardList size={24} className="text-white" />
                </div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#0f172a] dark:text-white">
                  NISS HRMS
                </h1>
                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400 mt-0.5">
                  Nidhi Impex Silver Star
                </p>
                <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Human Resource Management System
                </p>
              </div>
            )}

            {/* ══ NORMAL LOGIN ══ */}
            {mode === "login" && (
              <div className="w-full bg-white dark:bg-slate-900 rounded-[24px] sm:rounded-[28px] shadow-[0_20px_50px_-15px_rgba(79,70,229,0.12)] dark:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)] border border-slate-200/80 dark:border-slate-800 p-5 sm:p-8 login-card-rise">
                <h2 className="text-xl sm:text-2xl font-extrabold text-[#0f172a] dark:text-white text-center tracking-tight mb-1">
                  Welcome Back
                </h2>
                <p className="text-xs text-[#64748b] dark:text-slate-400 text-center mb-5">
                  Sign in to continue to NISS HRMS
                </p>

                {loginErr && (
                  <div className="flex items-center gap-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/80 rounded-xl px-4 py-3 mb-6">
                    <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">
                      {loginErr}
                    </p>
                  </div>
                )}

                <form
                  method="post"
                  action="#"
                  autoComplete="off"
                  noValidate
                  onSubmit={handleLogin}
                  className="space-y-4"
                >
                  {/* Decoy hidden inputs to prevent browser password managers from auto-filling saved admin credentials */}
                  <div
                    style={{
                      position: "absolute",
                      top: "-9999px",
                      left: "-9999px",
                      opacity: 0,
                      height: 0,
                      width: 0,
                      overflow: "hidden",
                    }}
                    aria-hidden="true"
                    tabIndex={-1}
                  >
                    <input type="text" name="fake_usernameremembered" tabIndex={-1} autoComplete="off" />
                    <input type="password" name="fake_passwordremembered" tabIndex={-1} autoComplete="off" />
                  </div>

                  <div>
                    <label htmlFor="login-username" className="block text-xs font-semibold text-[#334155] dark:text-slate-300 mb-2">
                      Email Address or Employee Code
                    </label>
                    <div className="relative flex items-center">
                      <User size={18} className={iconCls} aria-hidden="true" />
                      <input
                        id="login-username"
                        name="auth_user_identity"
                        autoComplete="off"
                        data-lpignore="true"
                        data-form-type="other"
                        value={empCode}
                        onChange={(e) => {
                          setEmpCode(e.target.value);
                          if (selectedUser && e.target.value !== selectedUser.name && e.target.value !== selectedUser.emp_code && e.target.value !== selectedUser.email) {
                            setSelectedUser(null);
                          }
                        }}
                        onFocus={() => {
                          if (matchingEmployees.length > 0 && !selectedUser) setShowDropdown(true);
                        }}
                        placeholder="Enter your email or employee code"
                        required
                        className={inCls}
                      />
                      {fetchingEmployees && (
                        <span className="absolute right-3.5 w-4 h-4 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
                      )}
                    </div>

                    {showDropdown && matchingEmployees.length > 0 && !selectedUser && (
                      <div className="mt-1.5 w-full bg-white dark:bg-slate-900 border-2 border-indigo-200 dark:border-indigo-900 rounded-xl shadow-2xl overflow-hidden z-40 relative max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="px-3.5 py-2 bg-indigo-50/90 dark:bg-indigo-950/80 border-b border-indigo-100 dark:border-indigo-900 text-[11px] font-extrabold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider">
                          Select Your Account ({matchingEmployees.length} profiles found)
                        </div>
                        {matchingEmployees.map((emp) => {
                          const displayName = emp.name || emp.emp_name || emp.full_name || emp.user_name || "Employee Profile";
                          const initial = displayName.charAt(0).toUpperCase();
                          return (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => {
                                setSelectedUser(emp);
                                setEmpCode(emp.emp_code || emp.name);
                                setShowDropdown(false);
                              }}
                              className="w-full text-left px-3.5 py-3 hover:bg-indigo-50 dark:hover:bg-indigo-950/70 border-b border-slate-100 last:border-0 dark:border-slate-800 transition-colors flex items-center justify-between group cursor-pointer"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                                  {initial}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-extrabold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                    {displayName}
                                  </p>
                                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate mt-0.5">
                                    Code: <strong className="text-indigo-700 dark:text-indigo-300 font-bold">{emp.emp_code}</strong>
                                    {emp.company_code ? ` • ${emp.company_code.toUpperCase()}` : ""}
                                    {emp.unit ? ` (${emp.unit})` : ""}
                                  </p>
                                </div>
                              </div>
                              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0 ml-2">
                                Select →
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {selectedUser && (
                      <div className="flex items-center justify-between text-xs bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800/70 mt-2 animate-in fade-in duration-200">
                        <div className="flex items-center gap-2 truncate">
                          <UserCheck size={16} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span className="truncate">
                            Logging in as: <strong>{selectedUser.name}</strong> ({selectedUser.company_code ? selectedUser.company_code.toUpperCase() : ""}{selectedUser.unit ? ` - ${selectedUser.unit}` : ""})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUser(null);
                            setEmpCode("");
                          }}
                          className="text-[11px] font-semibold text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0 ml-2 cursor-pointer"
                        >
                          Change
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor="login-password" className="block text-xs font-semibold text-[#334155] dark:text-slate-300 mb-2">
                      Password
                    </label>
                    <div className="relative flex items-center">
                      <Lock size={18} className={iconCls} aria-hidden="true" />
                      <input
                        id="login-password"
                        name="auth_user_credential"
                        autoComplete="new-password"
                        data-lpignore="true"
                        data-form-type="other"
                        type={showPass ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        required
                        className={inCls + " pr-11"}
                      />
                      <button
                        type="button"
                        aria-label={showPass ? "Hide password" : "Show password"}
                        onClick={() => setShowPass((p) => !p)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-[#94a3b8] hover:text-slate-600 dark:hover:text-slate-300 rounded-lg focus:outline-none transition-colors"
                      >
                        {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={enterForgot}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline underline-offset-2 mt-2.5 block text-right w-full cursor-pointer transition-colors"
                    >
                      Set Password
                    </button>
                  </div>

                  <button type="submit" disabled={loading} className={primaryBtnCls}>
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        Sign In <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </form>

                <div className="flex items-center gap-4 my-6" aria-hidden="true">
                  <div className="h-px flex-1 bg-[#f1f5f9] dark:bg-slate-800" />
                  <span className="text-xs text-[#cbd5e1] dark:text-slate-600 font-medium">or</span>
                  <div className="h-px flex-1 bg-[#f1f5f9] dark:bg-slate-800" />
                </div>

                <div className="text-center pt-0.5">
                  <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#334155] dark:text-slate-200">
                    <ShieldCheck size={16} className="text-indigo-600 dark:text-indigo-400" />
                    Secure. Reliable. Trusted.
                  </p>
                  <p className="text-[11px] text-[#94a3b8] dark:text-slate-400 mt-1">
                    Your data is protected with enterprise-grade security.
                  </p>
                </div>
              </div>
            )}

            {/* ══ FORGOT / SET PASSWORD (3-step) ══ */}
            {mode === "forgot" && (
              <div className="w-full bg-white dark:bg-slate-900 rounded-[28px] shadow-[0_25px_60px_-15px_rgba(79,70,229,0.14)] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] border border-slate-200/80 dark:border-slate-800 p-8 sm:p-10 login-card-rise">
                <button
                  onClick={() => {
                    clearOtpTimers();
                    setOtpAnim("idle");
                    setOtpVerifyLoading(false);
                    setMode("login");
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-6 transition-colors cursor-pointer"
                >
                  <ArrowLeft size={15} /> Back to Login
                </button>

                <StepBar step={step} />

                {/* ── STEP 1: Verify Employee ── */}
                {step === 1 && (
                  <div className="animate-in fade-in duration-300">
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/25 mb-4">
                        <UserCheck size={26} className="text-white" />
                      </div>
                      <h2 className="text-2xl font-extrabold text-[#0f172a] dark:text-white tracking-tight">
                        Verify Employee
                      </h2>
                      <p className="text-xs sm:text-sm text-[#64748b] dark:text-slate-400 mt-1.5 max-w-xs mx-auto">
                        Enter your employee code and registered mobile number to set your password.
                      </p>
                    </div>

                    <div className="mt-7 space-y-4">
                      {/* 1. Employee Code Input + Dropdown */}
                      <div>
                        <label htmlFor="forgot-emp-code" className="block text-xs font-semibold text-[#334155] dark:text-slate-300 mb-1.5">
                          Employee Code
                        </label>
                        <div className="relative flex items-center">
                          <IdCard size={18} className={iconCls} aria-hidden="true" />
                          <input
                            id="forgot-emp-code"
                            name="emp_code"
                            autoComplete="username"
                            value={fEmpCode}
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase();
                              setFEmpCode(val);
                              setCodeResolved(false);
                              if (fSelectedEmployee && val !== fSelectedEmployee.emp_code && val !== fSelectedEmployee.name) {
                                setFSelectedEmployee(null);
                              }
                            }}
                            onFocus={() => {
                              if (fMatchingEmployees.length > 0 && !fSelectedEmployee) setFShowDropdown(true);
                            }}
                            placeholder="e.g. NI1234"
                            className={inCls + " pr-9"}
                          />
                          {fFetchingEmployees && (
                            <span className="absolute right-3.5 w-4 h-4 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
                          )}
                        </div>

                        {/* Set Password Employee Dropdown */}
                        {fShowDropdown && fMatchingEmployees.length > 0 && !fSelectedEmployee && (
                          <div className="mt-1.5 w-full bg-white dark:bg-slate-900 border-2 border-indigo-200 dark:border-indigo-900 rounded-xl shadow-2xl overflow-hidden z-40 relative max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="px-3.5 py-2 bg-indigo-50/90 dark:bg-indigo-950/80 border-b border-indigo-100 dark:border-indigo-900 text-[11px] font-extrabold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider">
                              Select Employee Account ({fMatchingEmployees.length} profiles found)
                            </div>
                            {fMatchingEmployees.map((emp) => {
                              const displayName = emp.name || emp.emp_name || emp.full_name || emp.user_name || "Employee Profile";
                              const initial = displayName.charAt(0).toUpperCase();
                              return (
                                <button
                                  key={emp.id}
                                  type="button"
                                  onClick={() => {
                                    setFSelectedEmployee(emp);
                                    setFEmpCode(emp.emp_code);
                                    if (emp.company_code) setFCompanyId(normalizeCompanyId(emp.company_code));
                                    if (emp.unit) setFUnit(emp.unit);
                                    setFShowDropdown(false);
                                  }}
                                  className="w-full text-left px-3.5 py-3 hover:bg-indigo-50 dark:hover:bg-indigo-950/70 border-b border-slate-100 last:border-0 dark:border-slate-800 transition-colors flex items-center justify-between group cursor-pointer"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                                      {initial}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-extrabold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                        {displayName}
                                      </p>
                                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate mt-0.5">
                                        Code: <strong className="text-indigo-700 dark:text-indigo-300 font-bold">{emp.emp_code}</strong>
                                        {emp.company_code ? ` • ${emp.company_code.toUpperCase()}` : ""}
                                        {emp.unit ? ` (${emp.unit})` : ""}
                                      </p>
                                    </div>
                                  </div>
                                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0 ml-2">
                                    Select →
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Selected Profile Badge */}
                        {fSelectedEmployee && (
                          <div className="flex items-center justify-between text-xs bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800/70 mt-2 animate-in fade-in duration-200">
                            <div className="flex items-center gap-2 truncate">
                              <UserCheck size={16} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                              <span className="truncate">
                                Account: <strong>{fSelectedEmployee.name}</strong> ({fSelectedEmployee.emp_code})
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setFSelectedEmployee(null);
                                setFEmpCode("");
                                setFCompanyId("");
                                setFUnit("");
                                setCodeResolved(false);
                              }}
                              className="text-[11px] font-semibold text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0 ml-2 cursor-pointer"
                            >
                              Change
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 2. Registered Mobile Number Input */}
                      <div>
                        <label htmlFor="forgot-mobile-num" className="block text-xs font-semibold text-[#334155] dark:text-slate-300 mb-1.5">
                          Registered Mobile Number
                        </label>
                        <div className="relative flex items-center">
                          <Phone size={18} className={iconCls} aria-hidden="true" />
                          <input
                            id="forgot-mobile-num"
                            name="mobile_num"
                            value={fMobileNum}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                              setFMobileNum(val);
                              if (val.length < 10) setCodeResolved(false);
                            }}
                            placeholder="10-digit mobile number"
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel"
                            maxLength={10}
                            className={inCls + " pr-9"}
                          />
                          {codeChecking && (
                            <span className="absolute right-3.5 w-4 h-4 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
                          )}
                          {!codeChecking && codeResolved && (
                            <CheckCircle2 size={18} className="absolute right-3.5 text-emerald-500" />
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-[#94a3b8]">
                          Enter your 10-digit registered mobile number to auto-detect your company & branch.
                        </p>
                      </div>

                      {/* 3. Auto-Fetched Company & Branch/Unit (Shown AFTER Mobile Number) */}
                      {codeResolved && fCompanyId && (
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in duration-300">
                          <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-bold text-emerald-900 dark:text-emerald-200 leading-tight">
                              Auto-Detected Account Details
                            </p>
                            <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 mt-0.5 truncate">
                              Company: <strong>{getCompanyConfig(fCompanyId)?.label || fCompanyId.toUpperCase()}</strong> • Branch/Unit: <strong>{fUnit || "Main"}</strong>
                            </p>
                          </div>
                        </div>
                      )}

                      {codeResolved && fCompanyId && (
                        <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-300">
                          <div>
                            <label htmlFor="forgot-company-select" className="block text-xs font-semibold text-[#334155] dark:text-slate-300 mb-1.5">
                              Auto-Detected Company
                            </label>
                            <div className="relative flex items-center">
                              <Building2 size={16} className={iconCls} aria-hidden="true" />
                              <select
                                id="forgot-company-select"
                                name="company_id"
                                value={fCompanyId}
                                disabled
                                className={inCls + " opacity-75 cursor-not-allowed text-xs font-bold bg-emerald-50/50 border-emerald-300 dark:border-emerald-800"}
                              >
                                {COMPANY_OPTIONS.map((c) => (
                                  <option key={c.id} value={c.id}>{c.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label htmlFor="forgot-unit-select" className="block text-xs font-semibold text-[#334155] dark:text-slate-300 mb-1.5">
                              Auto-Detected Branch / Unit
                            </label>
                            <select
                              id="forgot-unit-select"
                              name="unit"
                              value={fUnit}
                              disabled
                              className={inCls + " opacity-75 cursor-not-allowed pl-4 text-xs font-bold bg-emerald-50/50 border-emerald-300 dark:border-emerald-800"}
                            >
                              <option value={fUnit}>{fUnit || "Default Branch"}</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {s1Err && (
                        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/80 rounded-xl px-3.5 py-2.5">
                          <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
                          <p className="text-xs font-medium text-red-600 dark:text-red-400">{s1Err}</p>
                        </div>
                      )}

                      <button
                        onClick={handleVerifyEmployee}
                        disabled={s1Loading || sendLoading || codeChecking}
                        className={primaryBtnCls}
                      >
                        {s1Loading || sendLoading ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Verifying & Sending OTP...
                          </>
                        ) : (
                          <>
                            Verify & Send OTP <ChevronRight size={17} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── STEP 2: Verify Mobile OTP ── */}
                {step === 2 && (
                  <div className="animate-in fade-in duration-300">
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/25 mb-4">
                        <Smartphone size={26} className="text-white" />
                      </div>
                      <h2 className="text-2xl font-extrabold text-[#0f172a] dark:text-white tracking-tight">
                        Verify Mobile OTP
                      </h2>
                      <p className="text-xs sm:text-sm text-[#64748b] dark:text-slate-400 mt-1.5 max-w-xs mx-auto">
                        We sent a {OTP_LENGTH}-digit OTP to your registered mobile number: <span className="font-semibold text-slate-700 dark:text-slate-200">+91 {fMobileNum}</span>
                      </p>
                    </div>

                    {devOtp && (
                      <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl text-center">
                        <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                          Verification Code: <span className="font-bold tracking-widest text-sm text-amber-900 dark:text-amber-200">{devOtp}</span>
                        </p>
                      </div>
                    )}

                    <div className="mt-6 space-y-4">
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#334155] dark:text-slate-300 mb-3 text-center">
                            Enter {OTP_LENGTH}-digit OTP
                          </label>
                          <OtpInput value={otp} onChange={setOtp} status={otpAnim} />
                        </div>

                        {otpErr && (
                          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/80 rounded-xl px-3.5 py-2.5">
                            <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
                            <p className="text-xs font-medium text-red-600 dark:text-red-400">{otpErr}</p>
                          </div>
                        )}

                        <button
                          onClick={handleVerifyOtp}
                          disabled={
                            otp.replace(/\s/g, "").length < OTP_LENGTH || otpVerifyLoading
                          }
                          className={`login-shine-btn h-12 w-full text-white rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:scale-[1.01] active:scale-[0.99] disabled:hover:scale-100 disabled:cursor-not-allowed ${
                            otpAnim === "orbit" || otpAnim === "success"
                              ? "bg-gradient-to-r from-emerald-600 to-green-600 disabled:from-emerald-600 disabled:to-green-600 shadow-emerald-500/25"
                              : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-indigo-400 disabled:to-purple-400 shadow-indigo-500/25"
                          }`}
                        >
                          {otpAnim === "orbit" || otpAnim === "success" ? (
                            <>
                              <CheckCircle2 size={17} /> Verified
                            </>
                          ) : otpVerifyLoading ? (
                            <>
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Verifying...
                            </>
                          ) : (
                            <>
                              Verify OTP & Next <ChevronRight size={17} />
                            </>
                          )}
                        </button>

                        <button
                          onClick={handleSendOtp}
                          disabled={otpVerifyLoading || sendLoading}
                          className="w-full py-2 text-xs font-semibold text-[#94a3b8] hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {sendLoading ? "Sending..." : "Didn't receive it? Resend Mobile OTP"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── STEP 3: Set New Password ── */}
                {step === 3 && (
                  <div className="animate-in fade-in duration-300">
                    <div className="text-center mb-6">
                      <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-emerald-500 to-teal-600 rounded-2xl shadow-lg shadow-emerald-500/25 mb-4">
                        <KeyRound size={26} className="text-white" />
                      </div>
                      <h2 className="text-2xl font-extrabold text-[#0f172a] dark:text-white tracking-tight">
                        Set New Password
                      </h2>
                      <p className="text-xs text-[#64748b] dark:text-slate-400 mt-1">
                        Choose a strong password for your account
                      </p>
                    </div>

                    <div className="space-y-4">
                      {[
                        {
                          id: "new-password",
                          name: "new_password",
                          autoComplete: "new-password",
                          label: "New Password",
                          val: newPass,
                          set: setNewPass,
                          show: showNew,
                          toggle: () => setShowNew((p) => !p),
                        },
                        {
                          id: "confirm-password",
                          name: "confirm_password",
                          autoComplete: "new-password",
                          label: "Confirm Password",
                          val: confPass,
                          set: setConfPass,
                          show: showConf,
                          toggle: () => setShowConf((p) => !p),
                        },
                      ].map(({ id, name, autoComplete, label, val, set, show, toggle }) => (
                        <div key={label}>
                          <label htmlFor={id} className="block text-xs font-semibold text-[#334155] dark:text-slate-300 mb-1.5">
                            {label}
                          </label>
                          <div className="relative flex items-center">
                            <Lock size={18} className={iconCls} aria-hidden="true" />
                            <input
                              id={id}
                              name={name}
                              autoComplete={autoComplete}
                              type={show ? "text" : "password"}
                              value={val}
                              onChange={(e) => set(e.target.value)}
                              placeholder="Create password"
                              className={inCls + " pr-11"}
                            />
                            <button
                              type="button"
                              aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
                              onClick={toggle}
                              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-[#94a3b8] hover:text-slate-600 dark:hover:text-slate-[#300] rounded-lg focus:outline-none transition-colors"
                            >
                              {show ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Strength bar */}
                      {strength && (
                        <div className="space-y-1.5 pt-1">
                          <div className="h-1.5 bg-[#f1f5f9] dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${strength.color}`}
                              style={{ width: strength.w }}
                            />
                          </div>
                          <p className="text-xs text-[#94a3b8] dark:text-slate-400 flex items-center gap-1">
                            <ShieldCheck size={13} /> {strength.label}
                          </p>
                        </div>
                      )}

                      {pwdErr && (
                        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/80 rounded-xl px-3.5 py-2.5">
                          <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
                          <p className="text-xs font-medium text-red-600 dark:text-red-400">{pwdErr}</p>
                        </div>
                      )}

                      <button
                        onClick={handleSetPassword}
                        disabled={!newPass || !confPass || pwdLoading}
                        className={primaryBtnCls}
                      >
                        {pwdLoading ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Updating...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={17} /> Set Password
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Outer Footer Links */}
      <footer className="w-full text-center z-10 pb-2 pt-2">
        <div className="flex items-center justify-center gap-3 text-xs font-medium text-[#64748b] dark:text-slate-400">
          <Link to="/about-niss" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            About NISS HRMS
          </Link>
          <span>•</span>
          <a href="#help" onClick={(e) => { e.preventDefault(); toast("Help center coming soon!"); }} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            Help
          </a>
          <span>•</span>
          <a href="#privacy" onClick={(e) => { e.preventDefault(); toast("Enterprise Privacy Policy"); }} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            Privacy Policy
          </a>
        </div>
        <p className="text-[11px] text-[#94a3b8] dark:text-slate-500 mt-1">
          © 2026 Nidhi Impex Silver Star. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
