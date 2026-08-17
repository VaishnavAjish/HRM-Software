import { useState } from "react";
import { Loader2 } from "lucide-react";
import { candidateApi } from "../../utils/api";

const COOLDOWN_SECONDS = 60;

export default function ResendVerificationButton({ email, className = "" }) {
  const [state, setState] = useState("idle"); // idle | loading | sent | error
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");

  const startCooldown = () => {
    setCooldown(COOLDOWN_SECONDS);
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleClick = async () => {
    if (!email || state === "loading" || cooldown > 0) return;
    setState("loading");
    setError("");
    try {
      const res = await candidateApi.resendVerification({ email });
      if (res.status) {
        setState("sent");
        startCooldown();
      } else {
        setState("error");
        setError(res.message || "Couldn't resend the verification email.");
      }
    } catch (err) {
      setState("error");
      setError(err.message || "Couldn't resend the verification email.");
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "loading" || cooldown > 0}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 transition-colors hover:text-brand-800 disabled:cursor-not-allowed disabled:text-nx-faint"
      >
        {state === "loading" && <Loader2 size={13} className="animate-spin" />}
        {state === "loading"
          ? "Sending…"
          : cooldown > 0
            ? `Resend available in ${cooldown}s`
            : "Didn't receive the email? Resend verification email"}
      </button>
      {state === "sent" && <p className="mt-1 text-xs font-medium text-emerald-700">Verification email sent — check your inbox.</p>}
      {state === "error" && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
