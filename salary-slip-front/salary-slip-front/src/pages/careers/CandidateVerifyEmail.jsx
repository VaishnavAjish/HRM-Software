import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/CandidateAuthContext";

export default function CandidateVerifyEmail() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email");
  const token = searchParams.get("token");
  const { setCandidate } = useCandidateAuth();

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!email || !token) {
      setError("Invalid verification link.");
      setLoading(false);
      return;
    }

    candidateApi.verifyEmail({ email, token })
      .then((res) => {
        if (res.status) {
          setSuccess(true);
          if (res.candidate) setCandidate(res.candidate);
        } else {
          setError(res.message || "Email verification failed.");
        }
      })
      .catch((err) => setError(err.message || "Email verification failed."))
      .finally(() => setLoading(false));
  }, [email, token, setCandidate]);

  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl space-y-6">
        {loading ? (
          <div className="py-8 space-y-3">
            <Loader2 size={40} className="mx-auto text-brand-400 animate-spin" />
            <h2 className="text-xl font-bold text-white">Verifying Email...</h2>
          </div>
        ) : success ? (
          <div className="py-4 space-y-4">
            <CheckCircle2 size={48} className="mx-auto text-green-400" />
            <h2 className="text-2xl font-bold text-white">Email Verified!</h2>
            <p className="text-xs text-slate-400">Your email address has been successfully verified. You can now submit job applications.</p>
            <Link to="/careers" className="inline-block px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-sm">
              Explore Jobs
            </Link>
          </div>
        ) : (
          <div className="py-4 space-y-4">
            <AlertCircle size={48} className="mx-auto text-red-400" />
            <h2 className="text-2xl font-bold text-white">Verification Failed</h2>
            <p className="text-xs text-red-400/90">{error}</p>
            <Link to="/careers" className="inline-block px-6 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-sm font-semibold">
              Return to Careers Home
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
