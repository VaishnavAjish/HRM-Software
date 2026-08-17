import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/CandidateAuthContext";
import ResendVerificationButton from "../../components/careers/ResendVerificationButton";

export default function CandidateVerifyEmail() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email");
  const token = searchParams.get("token");
  const { setCandidate } = useCandidateAuth();

  const [loading, setLoading] = useState(Boolean(email && token));
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!email || !token) return;

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

  if (!email || !token) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-nx-paper px-4 py-16 sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-nx-line bg-nx-surface p-8 text-center shadow-[0_12px_28px_-18px_rgba(33,29,23,0.3)] sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <AlertCircle size={26} className="text-red-500" />
          </div>
          <h2 className="mt-5 text-xl font-bold text-nx-ink">Invalid Verification Link</h2>
          <p className="mt-2 text-sm text-nx-muted">This verification link is invalid or incomplete.</p>
          <Link
            to="/careers"
            className="mt-6 inline-flex rounded-md border border-nx-line px-6 py-2.5 text-sm font-bold text-nx-body hover:border-nx-line2"
          >
            Return to Careers Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-nx-paper px-4 py-16 sm:px-6">
      <div className="w-full max-w-md rounded-lg border border-nx-line bg-nx-surface p-8 text-center shadow-[0_12px_28px_-18px_rgba(33,29,23,0.3)] sm:p-10">
        {loading ? (
          <div className="space-y-4 py-8">
            <Loader2 size={36} className="mx-auto animate-spin text-brand-600" />
            <h2 className="text-lg font-bold text-nx-ink">Verifying your email…</h2>
          </div>
        ) : success ? (
          <div className="space-y-4 py-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 size={26} className="text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-nx-ink">Email Verified!</h2>
            <p className="text-sm text-nx-muted">Your email address has been successfully verified. You can now submit job applications.</p>
            <Link
              to="/careers"
              className="inline-flex rounded-md bg-brand-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
            >
              Explore Jobs
            </Link>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
              <AlertCircle size={26} className="text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-nx-ink">Verification Failed</h2>
            <p className="text-sm text-nx-muted">{error}</p>
            {email && <ResendVerificationButton email={email} className="flex justify-center" />}
            <Link
              to="/careers"
              className="inline-flex rounded-md border border-nx-line px-6 py-2.5 text-sm font-bold text-nx-body hover:border-nx-line2"
            >
              Return to Careers Home
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
