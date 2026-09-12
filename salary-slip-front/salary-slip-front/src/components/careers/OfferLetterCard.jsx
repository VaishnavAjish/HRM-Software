import { useState } from "react";
import {
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  Building2,
} from "lucide-react";
import toast from "react-hot-toast";
import { candidateApi } from "../../utils/api";
import { downloadOfferLetterPdf } from "../../utils/offerPdfGenerator";

const DEFAULT_COMPANY_POLICIES = {
  probation_period: "3 Months (90 Days) from the joining date, subject to performance review.",
  notice_period: "30 Days written notice or equivalent basic salary upon confirmation (15 days during probation).",
  work_hours: "Monday to Friday, 9:00 AM – 6:00 PM (45 Hours/Week) with 1-hour lunch break.",
  work_mode: "On-Site at Company Headquarters",
  leave_policy: "18 Days Earned Leave + 12 Days Casual/Medical Leave per annum, along with official public holidays.",
  benefits_perks: "Comprehensive Health Insurance (up to Rs. 5,00,000), Annual Performance Bonus, and L&D Allowance.",
  confidentiality: "Strict adherence to the Non-Disclosure Agreement (NDA), Data Security, and Intellectual Property policies.",
};

export default function OfferLetterCard({
  application,
  offer,
  candidate,
  token,
  onOfferResponded,
}) {
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [candidateNotes, setCandidateNotes] = useState("");
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!offer) return null;

  const isAccepted = offer.status === "accepted";
  const isRejected = offer.status === "rejected";
  const isPending = !isAccepted && !isRejected;

  const ctcAnnual = Number(offer.ctc_annual || 0);
  const monthlyGross = Math.round(ctcAnnual / 12);
  const candidateName = candidate?.name || application?.candidate_name || offer?.candidate?.name || "Candidate";
  const candidateEmail = candidate?.email || application?.candidate_email || offer?.candidate?.email || "";
  const candidatePhone = candidate?.phone || application?.candidate_phone || offer?.candidate?.phone || "";
  const designation = offer.designation || application?.job_title || "Team Member";
  const refNo = `HR/OFFER/${new Date().getFullYear()}/${String(offer.id || application?.id || "001").padStart(3, "0")}`;
  const dateStr = offer.released_at
    ? new Date(offer.released_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const handleAcceptOffer = async () => {
    if (!agreedTerms) {
      toast.error("Please confirm your acknowledgment checkbox to accept the offer.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await candidateApi.respondOffer(
        application.id,
        { status: "accepted", notes: candidateNotes },
        token
      );
      if (res.status) {
        toast.success(res.message || "Congratulations! Offer accepted successfully!");
        setShowAcceptModal(false);
        if (onOfferResponded) onOfferResponded(res.data);
      } else {
        toast.error(res.message || "Failed to respond to offer");
      }
    } catch (err) {
      toast.error(err.message || "An error occurred while accepting the offer");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeclineOffer = async () => {
    setIsSubmitting(true);
    try {
      const res = await candidateApi.respondOffer(
        application.id,
        { status: "rejected", notes: candidateNotes },
        token
      );
      if (res.status) {
        toast.success("Offer response recorded.");
        setShowDeclineModal(false);
        if (onOfferResponded) onOfferResponded(res.data);
      } else {
        toast.error(res.message || "Failed to respond to offer");
      }
    } catch (err) {
      toast.error(err.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPdf = () => {
    try {
      downloadOfferLetterPdf(application, offer, candidate);
      toast.success("Offer Letter PDF downloaded!");
    } catch (err) {
      toast.error("Could not generate PDF: " + err.message);
    }
  };

  // Salary breakup items
  let breakupEntries;
  if (Array.isArray(offer.salary_breakup) && offer.salary_breakup.length > 0) {
    breakupEntries = offer.salary_breakup.map((item) => ({
      label: item.component || item.name || item.label || "Component",
      annual: Number(item.annual || (Number(item.monthly || 0) * 12) || (Number(item.amount || 0) * 12)),
      monthly: Number(item.monthly || Math.round(Number(item.annual || 0) / 12)),
    }));
  } else if (offer.salary_breakup && typeof offer.salary_breakup === "object" && Object.keys(offer.salary_breakup).length > 0) {
    breakupEntries = Object.entries(offer.salary_breakup).map(([k, v]) => ({
      label: k,
      annual: Number(v) || 0,
      monthly: Math.round((Number(v) || 0) / 12),
    }));
  } else {
    // Standard default breakdown
    const basic = Math.round(ctcAnnual * 0.40);
    const hra = Math.round(ctcAnnual * 0.20);
    const pf = Math.min(Math.round(basic * 0.12), 21600);
    const special = Math.max(0, ctcAnnual - basic - hra - pf);
    breakupEntries = [
      { label: "Basic Salary (40%)", annual: basic, monthly: Math.round(basic / 12) },
      { label: "House Rent Allowance (HRA 20%)", annual: hra, monthly: Math.round(hra / 12) },
      { label: "Special & Supplementary Allowance", annual: special, monthly: Math.round(special / 12) },
      { label: "Employer Provident Fund (PF)", annual: pf, monthly: Math.round(pf / 12) },
    ];
  }

  return (
    <div className="space-y-6">
      {/* Top Action Prompt Banner for Pending Offer */}
      {isPending && (
        <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/90 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold shadow-xs">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">
                Action Required &bull; Formal Job Offer
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                Your Employment Offer is Ready for Review
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Please review the compensation breakdown and company terms below, then submit your acceptance decision.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setShowDeclineModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-xs font-bold text-rose-700 shadow-xs hover:bg-rose-50 transition"
            >
              <XCircle size={14} />
              Decline Offer
            </button>
            <button
              type="button"
              onClick={() => setShowAcceptModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition"
            >
              <CheckCircle2 size={15} />
              Accept Offer
            </button>
          </div>
        </div>
      )}
      {/* Official Offer Letter Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Top Executive Header */}
        <div className="border-b border-slate-100 bg-slate-900 px-6 py-4 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-brand-400">
                <Building2 size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold tracking-tight text-white">NIDHI IMPEX &bull; SILVER STAR</h3>
                <p className="text-xs text-slate-300">
                  Varachha Road, Surat, Gujarat 395006 &bull; hr@nidhiimpex.com
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right text-xs text-slate-300">
              <span className="inline-block font-bold text-white uppercase tracking-wider">Employment Offer Letter</span>
              <p className="text-[11px] text-slate-400">Ref: {refNo}</p>
              <p className="text-[11px] text-slate-400">Date: {dateStr}</p>
            </div>
          </div>
        </div>

        {/* Letter Body Container */}
        <div className="p-6 sm:p-8 space-y-6 text-slate-800 text-xs sm:text-sm">
          {/* Candidate Recipient Block */}
          <div className="space-y-1">
            <p className="font-bold text-slate-900">To,</p>
            <p className="font-bold text-base text-brand-700">{candidateName}</p>
            {candidateEmail && <p className="text-xs text-slate-500">{candidateEmail}</p>}
            {candidatePhone && <p className="text-xs text-slate-500">{candidatePhone}</p>}
          </div>

          {/* Subject Banner */}
          <div className="rounded-xl border border-brand-100 bg-brand-50/70 p-3.5 text-xs font-bold text-brand-900">
            Subject: Formal Offer of Employment for the position of &ldquo;{designation}&rdquo;
          </div>

          {/* Formal Letter Text */}
          <div className="space-y-2 leading-relaxed text-slate-600 text-xs sm:text-sm">
            <p>Dear <strong className="text-slate-900">{candidateName}</strong>,</p>
            <p>
              We are pleased to offer you the position of <strong className="text-slate-900">{designation}</strong> with our company.
              We were thoroughly impressed by your performance during the recruitment and evaluation stages, and we are excited
              to welcome you to our growing organization.
            </p>
            <p>
              The detailed breakdown of your compensation structure and key terms of employment are outlined below:
            </p>
          </div>

          {/* Annexure A: Compensation Table */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-brand-700">
              Annexure A: Compensation Structure
            </h4>
            <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
              <table className="w-full">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="text-left p-3">Salary Component</th>
                    <th className="text-right p-3">Monthly (₹)</th>
                    <th className="text-right p-3">Annual (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {breakupEntries.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-3 text-slate-800">{item.label}</td>
                      <td className="p-3 text-right font-medium text-slate-700">
                        ₹{item.monthly.toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 text-right font-semibold text-slate-900">
                        ₹{item.annual.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-brand-50/60 font-bold text-brand-900 border-t border-brand-200">
                    <td className="p-3">Total Cost to Company (CTC)</td>
                    <td className="p-3 text-right">₹{monthlyGross.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right">₹{ctcAnnual.toLocaleString("en-IN")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Annexure B: Summary of Employment Policies & Terms */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-brand-700">
              Annexure B: Summary of Employment Policies & Terms
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                <span className="font-bold text-slate-900 block mb-1">Expected Joining Date</span>
                <p className="text-slate-600">
                  {offer.joining_date ? new Date(offer.joining_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "Mutually agreed upon acceptance"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                <span className="font-bold text-slate-900 block mb-1">Probation Period</span>
                <p className="text-slate-600">{offer.probation_period || DEFAULT_COMPANY_POLICIES.probation_period}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                <span className="font-bold text-slate-900 block mb-1">Notice Period</span>
                <p className="text-slate-600">{offer.notice_period || DEFAULT_COMPANY_POLICIES.notice_period}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                <span className="font-bold text-slate-900 block mb-1">Working Hours & Shift</span>
                <p className="text-slate-600">{offer.work_hours || DEFAULT_COMPANY_POLICIES.work_hours}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                <span className="font-bold text-slate-900 block mb-1">Work Location & Mode</span>
                <p className="text-slate-600">{offer.work_mode || DEFAULT_COMPANY_POLICIES.work_mode}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                <span className="font-bold text-slate-900 block mb-1">Confidentiality & NDA</span>
                <p className="text-slate-600">{offer.confidentiality || DEFAULT_COMPANY_POLICIES.confidentiality}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 sm:col-span-2">
                <span className="font-bold text-slate-900 block mb-1">Leave Policy & Benefits</span>
                <p className="text-slate-600">{offer.leave_policy || DEFAULT_COMPANY_POLICIES.leave_policy}</p>
                <p className="text-slate-600 mt-1">{offer.benefits_perks || DEFAULT_COMPANY_POLICIES.benefits_perks}</p>
              </div>
            </div>
          </div>

          {/* Signatures Section */}
          <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-end justify-between gap-6 text-xs">
            <div className="space-y-3">
              <p className="font-bold text-slate-900">For NIDHI IMPEX (Authorized HR)</p>
              <div className="h-6 w-36 border-b border-slate-300"></div>
              <p className="text-[11px] text-slate-500">Authorized Signatory & Seal</p>
            </div>
            <div className="space-y-3 sm:text-right">
              <p className="font-bold text-slate-900">Candidate Acceptance Sign-off</p>
              <div className="h-6 w-36 border-b border-slate-300 sm:ml-auto"></div>
              {isAccepted ? (
                <div className="inline-flex items-center gap-1.5 text-emerald-600 font-bold">
                  <ShieldCheck size={14} />
                  <span>Digitally Accepted ({offer.responded_at ? new Date(offer.responded_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Verified"})</span>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">{candidateName} (Signature & Date)</p>
              )}
            </div>
          </div>

          {/* Bottom Actions Bar */}
          <div className="pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Download size={14} className="text-slate-500" />
              Download Official Offer Letter (PDF)
            </button>

            {isPending && (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowDeclineModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-100"
                >
                  <XCircle size={14} />
                  Decline Offer
                </button>
                <button
                  type="button"
                  onClick={() => setShowAcceptModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <CheckCircle2 size={15} />
                  Accept Offer
                </button>
              </div>
            )}

            {isAccepted && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 border border-emerald-200/80">
                <ShieldCheck size={16} className="text-emerald-600" />
                Offer Accepted
              </div>
            )}

            {isRejected && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-800 border border-rose-200/80">
                <XCircle size={16} className="text-rose-600" />
                Offer Declined
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Acceptance Modal */}
      {showAcceptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Accept Employment Offer</h3>
                <p className="text-xs text-slate-500">Position: {designation}</p>
              </div>
            </div>

            <div className="mt-5 space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-xs text-emerald-950">
              <p className="font-semibold">
                You are accepting the official offer for <span className="font-bold text-emerald-900">{designation}</span> at an annual CTC of{" "}
                <span className="font-bold text-emerald-900">₹{ctcAnnual.toLocaleString("en-IN")}</span>.
              </p>
              <p className="text-emerald-800">
                Expected Joining Date: <span className="font-bold">{offer.joining_date ? new Date(offer.joining_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "To be scheduled"}</span>
              </p>
            </div>

            {/* Optional Remarks */}
            <div className="mt-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                Confirmation Message / Remarks (Optional)
              </label>
              <textarea
                rows={2}
                value={candidateNotes}
                onChange={(e) => setCandidateNotes(e.target.value)}
                placeholder="E.g., Thrilled to accept! Looking forward to joining the team."
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {/* Acknowledgment Checkbox */}
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <input
                type="checkbox"
                id="agree-declaration"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="agree-declaration" className="text-xs text-slate-700 font-medium cursor-pointer">
                I, <span className="font-bold text-slate-900">{candidateName}</span>, hereby accept the terms, compensation breakdown, and employment policies outlined in this offer letter.
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowAcceptModal(false)}
                disabled={isSubmitting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAcceptOffer}
                disabled={isSubmitting || !agreedTerms}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {isSubmitting ? "Accepting..." : "Confirm & Accept Offer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Modal */}
      {showDeclineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <AlertCircle size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Decline Employment Offer</h3>
                <p className="text-xs text-slate-500">{designation}</p>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-600">
              Are you sure you wish to decline this offer? This will notify the recruitment team and conclude your application.
            </p>

            <div className="mt-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Reason (Optional)</label>
              <textarea
                rows={2}
                value={candidateNotes}
                onChange={(e) => setCandidateNotes(e.target.value)}
                placeholder="Reason for declining..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowDeclineModal(false)}
                disabled={isSubmitting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleDeclineOffer}
                disabled={isSubmitting}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
              >
                {isSubmitting ? "Submitting..." : "Confirm Decline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
