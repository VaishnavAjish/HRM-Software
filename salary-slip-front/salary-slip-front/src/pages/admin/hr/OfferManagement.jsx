import { useEffect, useState, useMemo } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2, Send, ThumbsUp, ThumbsDown, History, FileDown, Trash2,
  PauseCircle, XCircle, FilePlus2, Briefcase, ArrowLeft, ChevronRight,
  Search, Award, Edit2, CheckSquare, UserX, Eye, Printer, ShieldCheck,
  DollarSign,
  UserCheck
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import DatePicker from "../../../components/ui/DatePicker";
import { useAuth } from "../../../context/AuthContext";
import { hrApi } from "../../../utils/api";
import { stageLabel, stageColor, promptRejectionReason, MAIN_STAGES, TERMINAL_STAGES, STAGE_INDEX } from "./hiring/stageMeta";
import CandidateDrawer from "./hiring/CandidateDrawer";

const inputClass = "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none";

const STATUS_VARIANT = {
  draft: "gray",
  pending_approval: "yellow",
  approved: "blue",
  released: "purple",
  accepted: "green",
  rejected: "red",
  expired: "gray",
  withdrawn: "red",
};

const PRIORITY_DOT = { high: "bg-red-500", medium: "bg-yellow-400", low: "bg-gray-400" };

const OFFER_STAGES = ["selected", "offer_sent", "offer_accepted", "onboarding", "hired"];

const DEFAULT_COMPANY_POLICIES = {
  probation_period: "3 Months (90 Days) from the joining date, subject to performance review.",
  notice_period: "30 Days written notice or equivalent basic salary upon confirmation (15 days during probation).",
  work_hours: "Monday to Friday, 9:00 AM – 6:00 PM (45 Hours/Week) with 1-hour lunch break.",
  work_mode: "On-Site at Company Headquarters",
  leave_policy: "18 Days Earned Leave + 12 Days Casual/Medical Leave per annum, along with official public holidays.",
  benefits_perks: "Comprehensive Health Insurance (up to Rs. 5,00,000), Annual Performance Bonus, and L&D Allowance.",
  confidentiality: "Strict adherence to the Non-Disclosure Agreement (NDA), Data Security, and Intellectual Property policies.",
};

const EMPTY_FORM = {
  designation: "",
  department: "",
  location: "Headquarters",
  ctc_annual: "",
  joining_date: "",
  expiry_date: "",
  notes: "",
  ...DEFAULT_COMPANY_POLICIES,
};

const EMPTY_BREAKUP = [
  { label: "Basic Salary (50%)", amount: "" },
  { label: "House Rent Allowance (HRA 25%)", amount: "" },
  { label: "Special Allowance (15%)", amount: "" },
  { label: "Statutory Bonus / PF (10%)", amount: "" },
];

/** Helper to categorize candidate into one of 3 sub-tabs */
function getCandidateSubTab(candidate, offer) {
  if (offer?.status === "accepted" || candidate.stage === "offer_accepted" || candidate.stage === "onboarding" || candidate.stage === "hired") {
    return "accepted";
  }
  if (offer?.status === "released" || candidate.stage === "offer_sent") {
    return "sent";
  }
  return "draft"; // pending draft, draft, pending_approval, approved
}

export default function OfferManagement() {
  const { user } = useAuth();
  const [offers, setOffers] = useState([]);
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  // Sub-tabs: 'draft' | 'sent' | 'accepted'
  const [subTab, setSubTab] = useState("draft");

  const [selectedFolder, setSelectedFolder] = useState(null);
  const [reqSearch, setReqSearch] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [filterOfferStatus, setFilterOfferStatus] = useState("all");

  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkActing, setBulkActing] = useState(false);

  // Candidate Drawer state with deep inspection
  const [drawerCandidate, setDrawerCandidate] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Draft / Edit Modal
  const [draftTarget, setDraftTarget] = useState(null);
  const [draftTab, setDraftTab] = useState("compensation"); // 'compensation' | 'policies' | 'preview'
  const [form, setForm] = useState(EMPTY_FORM);
  const [breakup, setBreakup] = useState(EMPTY_BREAKUP);
  const [saving, setSaving] = useState(false);

  // Letter Preview Modal
  const [previewOffer, setPreviewOffer] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);

  const loadOffers = () => {
    if (!user?.accessToken) return;
    hrApi.getOffers(user.accessToken, user.tokenType, { per_page: 100 })
      .then((res) => { if (res.status) setOffers(res.data?.data || res.data || []); })
      .catch((err) => toast.error(err.message || "Failed to load offers"));
  };

  const loadRoster = () => {
    if (!user?.accessToken) return;
    setRosterLoading(true);
    hrApi.getCandidates(user.accessToken, user.tokenType, { per_page: 100, stage: OFFER_STAGES.join(",") })
      .then((res) => { if (res.status) setRoster(res.data?.data || res.data || []); })
      .catch(() => {})
      .finally(() => setRosterLoading(false));
  };

  useEffect(() => {
    if (!user?.accessToken) return;
    let ignore = false;
    hrApi.getOffers(user.accessToken, user.tokenType, { per_page: 100 })
      .then((res) => { if (!ignore && res.status) setOffers(res.data?.data || res.data || []); })
      .catch(() => {});

    hrApi.getCandidates(user.accessToken, user.tokenType, { per_page: 100, stage: OFFER_STAGES.join(",") })
      .then((res) => { if (!ignore && res.status) setRoster(res.data?.data || res.data || []); })
      .catch(() => {})
      .finally(() => { if (!ignore) setRosterLoading(false); });

    return () => {
      ignore = true;
    };
  }, [user]);

  // Open Candidate Drawer and fetch deep data (interviews, evaluation feedback, stage history)
  const openCandidateDetails = async (candidate) => {
    setDrawerCandidate(candidate);
    setDrawerLoading(true);
    try {
      const res = await hrApi.getCandidate(candidate.id, user?.accessToken, user?.tokenType);
      if (res.status && res.data) {
        setDrawerCandidate((prev) => (prev && String(prev.id) === String(candidate.id) ? { ...prev, ...res.data } : prev));
      }
    } catch {
      // Retain basic candidate data
    } finally {
      setDrawerLoading(false);
    }
  };

  // Group candidates in Offer stage by Requisitions
  const groupedCandidates = useMemo(() => {
    const groups = {};
    roster.forEach((c) => {
      const rawId = c.requisition?.id || c.requisition_id;
      const isDeleted = Boolean(c.requisition?.deleted_at);
      const reqId = rawId ? String(rawId) : "unassigned";

      if (!groups[reqId]) {
        groups[reqId] = {
          id: reqId,
          title: c.requisition?.title || (c.requisition_id ? `Requisition #${c.requisition_id}` : "General / Unassigned"),
          isDeleted,
          department: c.requisition?.department?.name || c.requisition?.department || "—",
          code: c.requisition?.code || "",
          candidates: [],
        };
      } else {
        if (isDeleted) groups[reqId].isDeleted = true;
        if ((!groups[reqId].title || groups[reqId].title.startsWith("Requisition #")) && c.requisition?.title) {
          groups[reqId].title = c.requisition.title;
        }
        if ((!groups[reqId].department || groups[reqId].department === "—") && (c.requisition?.department?.name || c.requisition?.department)) {
          groups[reqId].department = c.requisition?.department?.name || c.requisition?.department;
        }
      }
      groups[reqId].candidates.push(c);
    });

    return Object.values(groups).map((group) => {
      let draftCount = 0;
      let sentCount = 0;
      let acceptedCount = 0;

      group.candidates.forEach((c) => {
        const off = offers.find((o) => String(o.candidate_id) === String(c.id));
        const category = getCandidateSubTab(c, off);
        if (category === "accepted") acceptedCount++;
        else if (category === "sent") sentCount++;
        else draftCount++;
      });

      return {
        ...group,
        draftCount,
        sentCount,
        acceptedCount,
      };
    }).sort((a, b) => a.title.localeCompare(b.title));
  }, [roster, offers]);

  // Overall sub-tab counts
  const subTabCounts = useMemo(() => {
    let draft = 0;
    let sent = 0;
    let accepted = 0;

    roster.forEach((c) => {
      const off = offers.find((o) => String(o.candidate_id) === String(c.id));
      const category = getCandidateSubTab(c, off);
      if (category === "accepted") accepted++;
      else if (category === "sent") sent++;
      else draft++;
    });

    return { draft, sent, accepted, total: roster.length };
  }, [roster, offers]);

  // Filter groups based on search & active subTab
  const filteredGroups = useMemo(() => {
    let list = groupedCandidates;

    if (reqSearch.trim()) {
      const q = reqSearch.toLowerCase();
      list = list.filter(
        (g) => g.title.toLowerCase().includes(q) || String(g.department).toLowerCase().includes(q)
      );
    }

    // Filter requisitions that have candidates matching the active sub-tab
    return list.filter((g) => {
      if (subTab === "draft") return g.draftCount > 0;
      if (subTab === "sent") return g.sentCount > 0;
      if (subTab === "accepted") return g.acceptedCount > 0;
      return true;
    });
  }, [groupedCandidates, reqSearch, subTab]);

  const activeGroup = useMemo(() => {
    return groupedCandidates.find((g) => String(g.id) === String(selectedFolder)) || null;
  }, [groupedCandidates, selectedFolder]);

  // Candidates under currently opened Requisition matching the subTab & search
  const candidatesInActiveGroup = useMemo(() => {
    if (!activeGroup) return [];
    let list = activeGroup.candidates;

    // Filter by active subTab
    list = list.filter((c) => {
      const off = offers.find((o) => String(o.candidate_id) === String(c.id));
      return getCandidateSubTab(c, off) === subTab;
    });

    if (candidateSearch.trim()) {
      const q = candidateSearch.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q)
      );
    }

    if (filterOfferStatus !== "all") {
      list = list.filter((c) => {
        const off = offers.find((o) => String(o.candidate_id) === String(c.id));
        if (filterOfferStatus === "pending_draft") return !off;
        if (!off) return false;
        return off.status === filterOfferStatus;
      });
    }

    return list;
  }, [activeGroup, candidateSearch, filterOfferStatus, offers, subTab]);

  // Selection handlers
  const activeCandidateIds = useMemo(() => {
    return candidatesInActiveGroup.map((c) => c.id);
  }, [candidatesInActiveGroup]);

  const selectedInGroup = useMemo(() => {
    return selectedIds.filter((id) => activeCandidateIds.includes(id));
  }, [selectedIds, activeCandidateIds]);

  const allGroupSelected = activeCandidateIds.length > 0 && activeCandidateIds.every((id) => selectedIds.includes(id));

  const handleToggleSelectAllGroup = () => {
    if (allGroupSelected) {
      setSelectedIds((prev) => prev.filter((id) => !activeCandidateIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...activeCandidateIds])));
    }
  };

  const toggleSelectCandidate = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const rejectOrHold = async (candidate, toStage) => {
    const rejectionReason = toStage === "rejected" ? promptRejectionReason() : undefined;
    if (toStage === "rejected" && !rejectionReason) return;

    setActingId(candidate.id);
    try {
      const res = await hrApi.moveCandidateStage(
        candidate.id,
        { to_stage: toStage, ...(rejectionReason ? { rejection_reason: rejectionReason } : {}) },
        user?.accessToken, user?.tokenType,
      );
      if (!res.status) throw new Error(res.message);
      toast.success(toStage === "rejected" ? "Marked Rejected" : "Marked On Hold");
      loadRoster();
    } catch (err) {
      toast.error(err.message || "Failed to update stage");
    } finally {
      setActingId(null);
    }
  };

  const openDraft = (candidate) => {
    setDraftTarget(candidate);
    setDraftTab("compensation");
    const existing = offers.find((o) => String(o.candidate_id) === String(candidate.id));
    if (existing) {
      setForm({
        designation: existing.designation || candidate.current_designation || candidate.requisition?.title || "",
        department: candidate.requisition?.department?.name || candidate.requisition?.department || "",
        location: existing.location || "Headquarters",
        ctc_annual: existing.ctc_annual || "",
        joining_date: existing.joining_date || "",
        expiry_date: existing.expiry_date || "",
        notes: existing.notes || "",
        probation_period: existing.probation_period || DEFAULT_COMPANY_POLICIES.probation_period,
        notice_period: existing.notice_period || DEFAULT_COMPANY_POLICIES.notice_period,
        work_hours: existing.work_hours || DEFAULT_COMPANY_POLICIES.work_hours,
        work_mode: existing.work_mode || DEFAULT_COMPANY_POLICIES.work_mode,
        leave_policy: existing.leave_policy || DEFAULT_COMPANY_POLICIES.leave_policy,
        benefits_perks: existing.benefits_perks || DEFAULT_COMPANY_POLICIES.benefits_perks,
        confidentiality: existing.confidentiality || DEFAULT_COMPANY_POLICIES.confidentiality,
      });
      const sb = existing.salary_breakup || {};
      const rows = Object.entries(sb).map(([label, amount]) => ({ label, amount: String(amount) }));
      setBreakup(rows.length > 0 ? rows : calculateDefaultBreakup(Number(existing.ctc_annual) || 0));
    } else {
      const ctc = 600000;
      setForm({
        ...EMPTY_FORM,
        designation: candidate.current_designation || candidate.requisition?.title || "",
        department: candidate.requisition?.department?.name || candidate.requisition?.department || "",
        ctc_annual: String(ctc),
      });
      setBreakup(calculateDefaultBreakup(ctc));
    }
  };

  const calculateDefaultBreakup = (annual) => {
    const total = Number(annual) || 0;
    const basic = Math.round(total * 0.50);
    const hra = Math.round(total * 0.25);
    const special = Math.round(total * 0.15);
    const pfBonus = total - (basic + hra + special);
    return [
      { label: "Basic Salary (50%)", amount: String(basic) },
      { label: "House Rent Allowance (HRA 25%)", amount: String(hra) },
      { label: "Special Allowance (15%)", amount: String(special) },
      { label: "Statutory PF & Bonus (10%)", amount: String(pfBonus > 0 ? pfBonus : 0) },
    ];
  };

  const handleCtcChange = (value) => {
    setForm({ ...form, ctc_annual: value });
    const num = Number(value);
    if (!isNaN(num) && num > 0) {
      setBreakup(calculateDefaultBreakup(num));
    }
  };

  const addBreakupRow = () => setBreakup([...breakup, { label: "", amount: "" }]);
  const removeBreakupRow = (i) => setBreakup(breakup.filter((_, idx) => idx !== i));
  const breakupTotal = breakup.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const saveDraft = async () => {
    if (!form.designation || !form.ctc_annual) {
      toast.error("Designation and Annual CTC are required");
      return;
    }
    setSaving(true);
    try {
      const salary_breakup = Object.fromEntries(
        breakup.filter((r) => r.label.trim()).map((r) => [r.label.trim(), Number(r.amount) || 0])
      );
      const res = await hrApi.storeOffer(
        { candidate_id: draftTarget.id, ...form, salary_breakup },
        user?.accessToken,
        user?.tokenType
      );
      if (res.status) {
        toast.success("Offer saved successfully!");
        setDraftTarget(null);
        loadOffers();
        loadRoster();
      } else {
        throw new Error(res.message);
      }
    } catch (err) {
      toast.error(err.message || "Failed to create offer");
    } finally {
      setSaving(false);
    }
  };

  const approve = async (id) => {
    try {
      const res = await hrApi.approveOffer(id, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Offer approved"); loadOffers(); }
    } catch (err) {
      toast.error(err.message || "Failed to approve offer");
    }
  };

  const release = async (id) => {
    try {
      const res = await hrApi.releaseOffer(id, user?.accessToken, user?.tokenType);
      if (res.status) {
        toast.success("Offer released — emailed to candidate");
        loadOffers();
        loadRoster();
      }
    } catch (err) {
      toast.error(err.message || "Failed to release offer");
    }
  };

  const sendToOnboarding = async (candidate) => {
    if (!window.confirm(`Transfer ${candidate.name} to Onboarding? This will initiate their pre-boarding and document verification journey.`)) {
      return;
    }
    setActingId(candidate.id);
    try {
      const res = await hrApi.moveCandidateStage(
        candidate.id,
        { to_stage: "onboarding", notes: "Transferred to Onboarding by HR" },
        user?.accessToken,
        user?.tokenType
      );
      if (res?.status || res?.data) {
        toast.success(`${candidate.name} transferred to Onboarding successfully!`);
        loadRoster();
        loadOffers();
      } else {
        toast.error(res?.message || "Failed to transfer candidate to Onboarding");
      }
    } catch (err) {
      toast.error(err.message || "Error transferring to Onboarding");
    } finally {
      setActingId(null);
    }
  };

  const bulkSendToOnboarding = async () => {
    if (!selectedInGroup.length) return;
    if (!window.confirm(`Send ${selectedInGroup.length} candidate(s) to Onboarding?`)) return;
    setBulkActing(true);
    let successCount = 0;
    try {
      for (const id of selectedInGroup) {
        const res = await hrApi.moveCandidateStage(
          id,
          { to_stage: "onboarding", notes: "Bulk transfer to Onboarding by HR" },
          user?.accessToken,
          user?.tokenType
        );
        if (res?.status || res?.data) successCount++;
      }
      toast.success(`${successCount} candidate(s) transferred to Onboarding!`);
      setSelectedIds([]);
      loadRoster();
      loadOffers();
    } catch (err) {
      toast.error("Bulk transfer error: " + err.message);
    } finally {
      setBulkActing(false);
    }
  };

  const respond = async (id, status) => {
    try {
      const res = await hrApi.respondOffer(id, { status }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success(`Offer marked as ${status}`); loadOffers(); loadRoster(); }
    } catch (err) {
      toast.error(err.message || "Failed to record response");
    }
  };

  const withdraw = async (id) => {
    if (!window.confirm("Withdraw this offer?")) return;
    try {
      const res = await hrApi.deleteOffer(id, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Offer withdrawn"); loadOffers(); loadRoster(); }
    } catch (err) {
      toast.error(err.message || "Failed to withdraw offer");
    }
  };

  const viewHistory = async (offer) => {
    try {
      const res = await hrApi.getOffer(offer.id, user?.accessToken, user?.tokenType);
      if (res.status) setHistoryTarget(res.data);
    } catch (err) {
      toast.error(err.message || "Failed to load offer history");
    }
  };

  // Generate Professional PDF Offer Letter
  const generateOfferPDF = async (offer, candidateObj) => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const candidateName = candidateObj?.name || offer.candidate?.name || "Candidate";
      const designation = offer.designation || "Executive";
      const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      const refNo = `HR/OFFER/${new Date().getFullYear()}/${String(offer.id || "001").padStart(4, "0")}`;

      const sanitizePdfText = (txt) => String(txt || "").replace(/₹/g, "Rs. ").replace(/\s+/g, " ").trim();

      // Top Corporate Header (Navy / Slate executive aesthetic)
      doc.setFillColor(30, 41, 59); // slate-800
      doc.rect(0, 0, 210, 24, "F");

      // Top accent stripe
      doc.setFillColor(37, 99, 235); // brand blue
      doc.rect(0, 24, 210, 2, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("NIDHI IMPEX HRMS", 14, 11);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(203, 213, 225); // slate-300
      doc.text("Varachha Road, Surat, Gujarat 395006 | hr@nidhiimpex.com", 14, 18);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text("EMPLOYMENT OFFER LETTER", 196, 11, { align: "right" });
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(203, 213, 225);
      doc.text(`Ref: ${refNo}  |  Date: ${dateStr}`, 196, 18, { align: "right" });

      // Candidate Addressing Block
      let currentY = 34;
      doc.setTextColor(30, 41, 59);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("To,", 14, currentY);
      currentY += 5;
      doc.setFontSize(11);
      doc.text(candidateName, 14, currentY);
      currentY += 4.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      if (candidateObj?.email || offer.candidate?.email) {
        doc.text(`Email: ${candidateObj?.email || offer.candidate?.email}`, 14, currentY);
        currentY += 4;
      }
      if (candidateObj?.phone || offer.candidate?.phone) {
        doc.text(`Contact: ${candidateObj?.phone || offer.candidate?.phone}`, 14, currentY);
        currentY += 4;
      }

      currentY += 2;
      // Subject Banner
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(14, currentY, 182, 8, 1.5, 1.5, "F");
      doc.setTextColor(30, 41, 59);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(`Subject: Formal Offer of Employment — Position: "${designation}"`, 18, currentY + 5.5);
      currentY += 12;

      // Letter Body
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      doc.text(`Dear ${candidateName},`, 14, currentY);
      currentY += 5;

      const bodyText = `We are delighted to extend this formal offer of employment with our organization. Following our evaluation and interview rounds, we were thoroughly impressed by your background, domain expertise, and potential. We believe you will make a tremendous impact in this role.\n\nThe detailed breakup of your compensation package and key employment policies are summarized below:`;
      doc.text(bodyText, 14, currentY, { maxWidth: 182, lineHeightFactor: 1.35 });
      currentY += 17;

      // Section 1: Compensation Table
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(37, 99, 235);
      doc.text("ANNEXURE A: ANNUAL & MONTHLY COMPENSATION STRUCTURE", 14, currentY);
      currentY += 3;

      const breakupEntries = Object.entries(offer.salary_breakup || {});
      const tableRows = breakupEntries.map(([k, v]) => {
        const annualVal = Number(v) || 0;
        const monthlyVal = Math.round(annualVal / 12);
        return [
          sanitizePdfText(k),
          `Rs. ${monthlyVal.toLocaleString("en-IN")}`,
          `Rs. ${annualVal.toLocaleString("en-IN")}`,
        ];
      });

      const totalAnnual = Number(offer.ctc_annual) || 0;
      const totalMonthly = Math.round(totalAnnual / 12);
      tableRows.push([
        "Total Cost to Company (CTC)",
        `Rs. ${totalMonthly.toLocaleString("en-IN")}`,
        `Rs. ${totalAnnual.toLocaleString("en-IN")}`,
      ]);

      autoTable(doc, {
        startY: currentY,
        margin: { left: 14, right: 14 },
        head: [["Compensation Component", "Monthly Amount (INR)", "Annual Amount (INR)"]],
        body: tableRows,
        theme: "grid",
        styles: {
          fontSize: 8,
          cellPadding: 2.5,
          lineColor: [226, 232, 240],
          lineWidth: 0.15,
          textColor: [30, 41, 59],
        },
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8,
        },
        columnStyles: {
          0: { cellWidth: 102 },
          1: { cellWidth: 40, halign: "right" },
          2: { cellWidth: 40, halign: "right" },
        },
        didParseCell(data) {
          if (data.row.index === tableRows.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [239, 246, 255];
            data.cell.styles.textColor = [30, 64, 175];
          }
        },
      });

      currentY = doc.lastAutoTable.finalY + 6;

      // Section 2: Policies & Terms Table
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(37, 99, 235);
      doc.text("ANNEXURE B: SUMMARY OF EMPLOYMENT POLICIES & TERMS", 14, currentY);
      currentY += 3;

      const joiningStr = offer.joining_date
        ? new Date(offer.joining_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
        : "Mutually agreed date upon release";

      const policies = [
        ["1. Expected Joining Date", sanitizePdfText(joiningStr)],
        ["2. Probation Period", sanitizePdfText(offer.probation_period || DEFAULT_COMPANY_POLICIES.probation_period)],
        ["3. Notice Period", sanitizePdfText(offer.notice_period || DEFAULT_COMPANY_POLICIES.notice_period)],
        ["4. Working Hours & Shift", sanitizePdfText(offer.work_hours || DEFAULT_COMPANY_POLICIES.work_hours)],
        ["5. Work Mode & Location", sanitizePdfText(offer.work_mode || DEFAULT_COMPANY_POLICIES.work_mode)],
        ["6. Leave Policy", sanitizePdfText(offer.leave_policy || DEFAULT_COMPANY_POLICIES.leave_policy)],
        ["7. Benefits & Insurance", sanitizePdfText(offer.benefits_perks || DEFAULT_COMPANY_POLICIES.benefits_perks)],
        ["8. Confidentiality & NDA", sanitizePdfText(offer.confidentiality || DEFAULT_COMPANY_POLICIES.confidentiality)],
      ];

      autoTable(doc, {
        startY: currentY,
        margin: { left: 14, right: 14 },
        body: policies,
        theme: "striped",
        styles: {
          fontSize: 7.5,
          cellPadding: 2.2,
          textColor: [51, 65, 85],
          lineColor: [241, 245, 249],
          lineWidth: 0.1,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 46, textColor: [30, 41, 59] },
          1: { cellWidth: 136 },
        },
      });

      currentY = doc.lastAutoTable.finalY + 7;

      // Check page break for signature block
      if (currentY > 245) {
        doc.addPage();
        currentY = 20;
      }

      // Acceptance Statement
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(
        "Please confirm your acceptance of this offer by signing and returning a copy within the validity period.",
        14,
        currentY,
        { maxWidth: 182 }
      );
      currentY += 9;

      // Signature Block
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text("For NIDHI IMPEX (Authorized HR):", 14, currentY);
      doc.text("Candidate Acceptance Sign-off:", 114, currentY);
      currentY += 13;

      doc.setDrawColor(148, 163, 184); // slate-400
      doc.line(14, currentY, 80, currentY);
      doc.line(114, currentY, 185, currentY);
      currentY += 4;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Authorized Signatory & Seal", 14, currentY);
      doc.text(`${candidateName} (Signature & Date)`, 114, currentY);

      // Footer
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text("Strictly Confidential & Proprietary — Nidhi Impex HRMS", 105, 290, { align: "center" });

      doc.save(`Offer_Letter_${candidateName.replace(/\s+/g, "_")}.pdf`);
      toast.success("Offer letter PDF generated successfully!");
    } catch (err) {
      toast.error("Failed to generate PDF: " + err.message);
    }
  };

  const openPreview = (candidate) => {
    const existing = offers.find((o) => String(o.candidate_id) === String(candidate.id));
    if (existing) {
      setPreviewOffer({ ...existing, candidate });
    } else {
      // Build a preview object from current form or standard values
      setPreviewOffer({
        candidate,
        designation: candidate.current_designation || candidate.requisition?.title || "Role",
        ctc_annual: form.ctc_annual || "600000",
        joining_date: form.joining_date || "",
        expiry_date: form.expiry_date || "",
        salary_breakup: Object.fromEntries(
          breakup.filter((r) => r.label.trim()).map((r) => [r.label.trim(), Number(r.amount) || 0])
        ),
        ...DEFAULT_COMPANY_POLICIES,
        status: "draft",
      });
    }
  };

  // Bulk operations
  const handleBulkApprove = async () => {
    const eligibleOffers = offers.filter(
      (o) => selectedInGroup.includes(o.candidate_id) && o.status === "draft"
    );
    if (eligibleOffers.length === 0) {
      toast.error("No draft offers selected to approve");
      return;
    }
    setBulkActing(true);
    let ok = 0;
    for (const o of eligibleOffers) {
      try {
        const res = await hrApi.approveOffer(o.id, user?.accessToken, user?.tokenType);
        if (res.status) ok++;
      } catch {
        // continue
      }
    }
    setBulkActing(false);
    toast.success(`Approved ${ok} offer${ok !== 1 ? "s" : ""}`);
    loadOffers();
  };

  const handleBulkRelease = async () => {
    const eligibleOffers = offers.filter(
      (o) => selectedInGroup.includes(o.candidate_id) && o.status === "approved"
    );
    if (eligibleOffers.length === 0) {
      toast.error("No approved offers selected to release");
      return;
    }
    setBulkActing(true);
    let ok = 0;
    for (const o of eligibleOffers) {
      try {
        const res = await hrApi.releaseOffer(o.id, user?.accessToken, user?.tokenType);
        if (res.status) ok++;
      } catch {
        // continue
      }
    }
    setBulkActing(false);
    toast.success(`Released ${ok} offer${ok !== 1 ? "s" : ""}`);
    loadOffers();
  };

  const handleBulkRejectCandidates = async () => {
    if (selectedInGroup.length === 0) return;
    const reason = promptRejectionReason();
    if (!reason) return;

    setBulkActing(true);
    let ok = 0;
    for (const id of selectedInGroup) {
      try {
        const res = await hrApi.moveCandidateStage(id, { to_stage: "rejected", rejection_reason: reason }, user?.accessToken, user?.tokenType);
        if (res.status) ok++;
      } catch {
        // continue
      }
    }
    setBulkActing(false);
    toast.success(`Rejected ${ok} candidate${ok !== 1 ? "s" : ""}`);
    setSelectedIds([]);
    loadRoster();
  };

  return (
    <div className="space-y-4">
      {/* ────────────────── SUB-TABS NAVIGATION (Draft / Sent / Accepted) ────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-gray-100/80 dark:bg-gray-700/60 rounded-xl">
            <button
              onClick={() => { setSubTab("draft"); setSelectedIds([]); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                subTab === "draft"
                  ? "bg-white dark:bg-gray-800 text-brand-600 dark:text-brand-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <FilePlus2 size={15} />
              <span>Draft</span>
              <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold ${
                subTab === "draft"
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                  : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
              }`}>
                {subTabCounts.draft}
              </span>
            </button>

            <button
              onClick={() => { setSubTab("sent"); setSelectedIds([]); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                subTab === "sent"
                  ? "bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <Send size={15} />
              <span>Sent</span>
              <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold ${
                subTab === "sent"
                  ? "bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                  : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
              }`}>
                {subTabCounts.sent}
              </span>
            </button>

            <button
              onClick={() => { setSubTab("accepted"); setSelectedIds([]); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                subTab === "accepted"
                  ? "bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <CheckCircle2 size={15} />
              <span>Accepted</span>
              <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold ${
                subTab === "accepted"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
              }`}>
                {subTabCounts.accepted}
              </span>
            </button>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 px-2">
            {subTab === "draft" && "Candidates selected from interviews ready for compensation structuring & review"}
            {subTab === "sent" && "Official offers released to candidates awaiting formal acceptance sign-off"}
            {subTab === "accepted" && "Accepted offers ready to be handed over for HR Onboarding & Document Verification"}
          </p>
        </div>
      </div>

      {rosterLoading ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden p-6">
          <SkeletonTable rows={8} />
        </div>
      ) : roster.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden p-8 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 mx-auto flex items-center justify-center">
            <Award size={24} />
          </div>
          <h3 className="font-bold text-gray-900 dark:text-white text-base">No Candidates in Offer Stage</h3>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            Candidates appear here automatically once marked <strong>Selected</strong> in the Interview tab.
          </p>
        </div>
      ) : !selectedFolder ? (
        /* ────────────────── 1. Requisitions Folder View ────────────────── */
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50 dark:bg-gray-800/50">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
                <Briefcase size={18} className="text-brand-500" />
                Job Requisitions — {subTab === "draft" ? "Draft Offers" : subTab === "sent" ? "Sent Offers" : "Accepted Offers"}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Select any requisition below to inspect candidates, draft compensation & company policies, and release offers.
              </p>
            </div>
            <div className="w-full sm:w-64">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter requisitions..."
                  value={reqSearch}
                  onChange={(e) => setReqSearch(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 pl-9 pr-3 py-2 text-xs text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Requisitions Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/70 dark:bg-gray-800/70 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="text-left px-5 py-3.5">Requisition Title</th>
                  <th className="text-left px-5 py-3.5">Department</th>
                  <th className="text-center px-5 py-3.5">{subTab === "draft" ? "Draft Candidates" : subTab === "sent" ? "Sent Offers" : "Accepted Candidates"}</th>
                  <th className="text-center px-5 py-3.5">Total Pipeline</th>
                  <th className="text-right px-5 py-3.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {filteredGroups.map((group) => {
                  const currentSubTabCount = subTab === "draft" ? group.draftCount : subTab === "sent" ? group.sentCount : group.acceptedCount;

                  return (
                    <tr
                      key={group.id}
                      onClick={() => { setSelectedFolder(group.id); setSelectedIds([]); }}
                      className="hover:bg-brand-50/40 dark:hover:bg-brand-900/15 cursor-pointer transition-colors group"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold text-sm shadow-sm group-hover:scale-105 transition-transform">
                            <Briefcase size={18} />
                          </div>
                          <div>
                            {group.isDeleted ? (
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-500 dark:text-gray-400 text-sm line-through">
                                  {group.title}
                                </span>
                                <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800">
                                  Deleted
                                </span>
                              </div>
                            ) : (
                              <p className="font-bold text-gray-900 dark:text-white text-sm group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                                {group.title}
                              </p>
                            )}
                            {group.code && (
                              <span className="text-[11px] font-medium text-gray-400">
                                Code: {group.code}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs font-medium text-gray-600 dark:text-gray-300">
                        {group.department}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border shadow-xs ${
                          subTab === "draft"
                            ? "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-950/40 dark:text-brand-300"
                            : subTab === "sent"
                            ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                        }`}>
                          {currentSubTabCount} Candidate{currentSubTabCount !== 1 ? "s" : ""}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
                          {group.candidates.length} total
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => { setSelectedFolder(group.id); setSelectedIds([]); }}
                          className="inline-flex items-center gap-1.5 hover:border-brand-300 dark:hover:border-brand-600"
                        >
                          <span>View Pipeline</span>
                          <ChevronRight size={14} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ────────────────── 2. Candidates in Selected Requisition ────────────────── */
        <div className="space-y-4">
          {/* Top Bar Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSelectedFolder(null);
                  setSelectedIds([]);
                  setCandidateSearch("");
                  setFilterOfferStatus("all");
                }}
                className="flex items-center gap-1.5 text-xs font-semibold"
              >
                <ArrowLeft size={15} /> All Requisitions
              </Button>
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  {activeGroup?.isDeleted ? (
                    <>
                      <span className="line-through text-gray-400 dark:text-gray-500">{activeGroup?.title}</span>
                      <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800">
                        Deleted
                      </span>
                    </>
                  ) : (
                    activeGroup?.title
                  )}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {activeGroup?.department} &bull; Showing {subTab.toUpperCase()} ({candidatesInActiveGroup.length}) &bull; {activeGroup?.candidates.length} total in pipeline
                </p>
              </div>
            </div>

            {/* Filter controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative min-w-[200px]">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search candidates..."
                  value={candidateSearch}
                  onChange={(e) => setCandidateSearch(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 pl-9 pr-3 py-1.5 text-xs text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>

              <select
                value={filterOfferStatus}
                onChange={(e) => setFilterOfferStatus(e.target.value)}
                className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 outline-none focus:border-brand-500"
              >
                <option value="all">All Statuses</option>
                <option value="pending_draft">Pending Draft</option>
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
                <option value="released">Released</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {/* Bulk Action Bar if items selected */}
          {selectedInGroup.length > 0 && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-brand-50/80 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 text-xs shadow-xs">
              <span className="font-bold text-brand-900 dark:text-brand-200 flex items-center gap-2">
                <CheckSquare size={16} className="text-brand-600" />
                {selectedInGroup.length} candidate{selectedInGroup.length !== 1 ? "s" : ""} selected
              </span>

              <div className="flex items-center gap-2">
                {subTab === "draft" && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={bulkActing}
                      onClick={handleBulkApprove}
                      icon={<CheckCircle2 size={13} className="text-emerald-600" />}
                    >
                      Approve Drafts
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={bulkActing}
                      onClick={handleBulkRelease}
                      icon={<Send size={13} className="text-brand-600" />}
                    >
                      Release Approved
                    </Button>
                  </>
                )}
                {subTab === "accepted" && (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={bulkActing}
                    onClick={bulkSendToOnboarding}
                    icon={<UserCheck size={13} />}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  >
                    Send to Onboarding
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={bulkActing}
                  onClick={handleBulkRejectCandidates}
                  className="!text-rose-600 hover:!bg-rose-50 dark:hover:!bg-rose-950/30"
                  icon={<UserX size={13} />}
                >
                  Reject Selected
                </Button>
                <button
                  onClick={() => setSelectedIds([])}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 px-2 py-1"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Candidates List Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            {candidatesInActiveGroup.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">
                No candidates under this requisition in the <strong>{subTab.toUpperCase()}</strong> stage match the filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/70 dark:bg-gray-800/70 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                    <tr>
                      <th className="w-10 px-4 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={allGroupSelected}
                          onChange={handleToggleSelectAllGroup}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                      </th>
                      <th className="text-left px-4 py-3.5">Candidate (Click for Notes)</th>
                      <th className="text-left px-4 py-3.5">Interview Stage</th>
                      <th className="text-left px-4 py-3.5">Compensation & Package</th>
                      <th className="text-center px-4 py-3.5">Offer Status</th>
                      <th className="text-right px-4 py-3.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                    {candidatesInActiveGroup.map((c) => {
                      const offer = offers.find((o) => String(o.candidate_id) === String(c.id));
                      const busy = actingId === c.id;
                      const isSelected = selectedIds.includes(c.id);

                      return (
                        <tr
                          key={c.id}
                          className={`transition-colors ${
                            isSelected
                              ? "bg-brand-50/30 dark:bg-brand-900/10"
                              : "hover:bg-gray-50/80 dark:hover:bg-gray-700/30"
                          }`}
                        >
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectCandidate(c.id)}
                              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[c.priority] || "bg-gray-400"}`} />
                              <div>
                                <button
                                  type="button"
                                  onClick={() => openCandidateDetails(c)}
                                  className="font-bold text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 text-left transition-colors flex items-center gap-1.5 group/link"
                                >
                                  <span>{c.name}</span>
                                  <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300 opacity-0 group-hover/link:opacity-100 transition-opacity">
                                    View Notes & Profile
                                  </span>
                                </button>
                                <p className="text-[11px] text-gray-400">{c.email || c.phone || "—"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="text-[10.5px] font-bold px-2 py-0.5 rounded-full inline-block"
                              style={{ backgroundColor: `${stageColor(c.stage)}1a`, color: stageColor(c.stage) }}
                            >
                              {stageLabel(c.stage)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {offer ? (
                              <div className="space-y-0.5 text-xs text-gray-700 dark:text-gray-300">
                                <p className="font-bold text-gray-900 dark:text-white">{offer.designation}</p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                  ₹{Number(offer.ctc_annual).toLocaleString("en-IN")} &bull; {offer.joining_date ? new Date(offer.joining_date).toLocaleDateString() : "No joining date"}
                                </p>
                              </div>
                            ) : (
                              <button
                                onClick={() => openDraft(c)}
                                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 border border-brand-200 dark:border-brand-900/50 shadow-xs"
                              >
                                <FilePlus2 size={14} /> Structure Offer Package
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {offer ? (
                              <Badge variant={STATUS_VARIANT[offer.status] || "gray"}>
                                {offer.status?.replace("_", " ")}
                              </Badge>
                            ) : (
                              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-900">
                                Pending Draft
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {offer ? (
                                <>
                                  <button
                                    title="Live Offer Letter Preview"
                                    onClick={() => openPreview(c)}
                                    className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30"
                                  >
                                    <Eye size={16} />
                                  </button>

                                  {offer.status === "draft" && (
                                    <>
                                      <button
                                        title="Approve Offer"
                                        onClick={() => approve(offer.id)}
                                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                      >
                                        <CheckCircle2 size={16} />
                                      </button>
                                      <button
                                        title="Edit Draft & Policies"
                                        onClick={() => openDraft(c)}
                                        className="p-1.5 rounded-lg text-gray-500 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                                      >
                                        <Edit2 size={15} />
                                      </button>
                                    </>
                                  )}

                                  {offer.status === "approved" && (
                                    <button
                                      title="Release to candidate (Send Email)"
                                      onClick={() => release(offer.id)}
                                      className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                                    >
                                      <Send size={15} />
                                    </button>
                                  )}

                                  {offer.status === "released" && (
                                    <>
                                      <button
                                        title="Mark as Candidate Accepted"
                                        onClick={() => respond(offer.id, "accepted")}
                                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                      >
                                        <ThumbsUp size={15} />
                                      </button>
                                      <button
                                        title="Mark as Candidate Rejected"
                                        onClick={() => respond(offer.id, "rejected")}
                                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                      >
                                        <ThumbsDown size={15} />
                                      </button>
                                    </>
                                  )}

                                  {offer.status === "accepted" && (
                                    c.stage === "onboarding" || c.stage === "hired" ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                                        <UserCheck size={13} /> In Onboarding
                                      </span>
                                    ) : (
                                      <button
                                        title="Transfer Candidate to Onboarding"
                                        onClick={() => sendToOnboarding(c)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition"
                                      >
                                        <UserCheck size={14} /> Send to Onboarding
                                      </button>
                                    )
                                  )}

                                  <button
                                    title="Download Official Offer Letter PDF"
                                    onClick={() => generateOfferPDF(offer, c)}
                                    className="p-1.5 rounded-lg text-gray-600 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <FileDown size={15} />
                                  </button>

                                  <button
                                    title="Version history"
                                    onClick={() => viewHistory(offer)}
                                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <History size={15} />
                                  </button>

                                  {!["accepted", "withdrawn"].includes(offer.status) && (
                                    <button
                                      title="Withdraw Offer"
                                      onClick={() => withdraw(offer.id)}
                                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  )}
                                </>
                              ) : c.stage === "selected" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => openDraft(c)}
                                    className="text-xs"
                                    icon={<FilePlus2 size={13} />}
                                  >
                                    Draft
                                  </Button>
                                  <button
                                    title="Hold candidate"
                                    disabled={busy}
                                    onClick={() => rejectOrHold(c, "on_hold")}
                                    className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-40"
                                  >
                                    <PauseCircle size={15} />
                                  </button>
                                  <button
                                    title="Reject candidate"
                                    disabled={busy}
                                    onClick={() => rejectOrHold(c, "rejected")}
                                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-40"
                                  >
                                    <XCircle size={15} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────── DRAFT / EDIT OFFER & COMPANY POLICIES MODAL ────────────────── */}
      <Modal
        isOpen={!!draftTarget}
        onClose={() => setDraftTarget(null)}
        title={`Employment Offer & Policy Setup — ${draftTarget?.name || ""}`}
        size="2xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              variant="secondary"
              onClick={() => openPreview(draftTarget)}
              icon={<Eye size={14} />}
            >
              Preview Offer Letter
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setDraftTarget(null)}>Cancel</Button>
              <Button onClick={saveDraft} disabled={saving}>
                {saving ? "Saving Offer..." : "Save & Finalize Offer"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 font-sans">
          {/* Internal modal tabs */}
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
            <button
              onClick={() => setDraftTab("compensation")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                draftTab === "compensation"
                  ? "bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400"
                  : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <DollarSign size={14} /> 1. Role & Compensation
            </button>
            <button
              onClick={() => setDraftTab("policies")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                draftTab === "policies"
                  ? "bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400"
                  : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <ShieldCheck size={14} /> 2. Company Policies & Employment Terms
            </button>
          </div>

          {draftTab === "compensation" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Field label="Designation / Official Job Title" required>
                  <input
                    className={inputClass}
                    placeholder="e.g. Senior Software Engineer"
                    value={form.designation}
                    onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  />
                </Field>
                <Field label="Annual CTC (₹)" required>
                  <input
                    type="number"
                    placeholder="e.g. 1200000"
                    className={inputClass}
                    value={form.ctc_annual}
                    onChange={(e) => handleCtcChange(e.target.value)}
                  />
                </Field>
                <Field label="Expected Joining Date">
                  <DatePicker value={form.joining_date} onChange={(v) => setForm({ ...form, joining_date: v })} />
                </Field>
                <Field label="Offer Acceptance Expiry Date">
                  <DatePicker value={form.expiry_date} onChange={(v) => setForm({ ...form, expiry_date: v })} />
                </Field>
              </div>

              {/* Structured Salary Breakdown */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-gray-800 dark:text-gray-200">
                      Salary Breakdown Components
                    </label>
                    <p className="text-[11px] text-gray-400">
                      Monthly gross: ₹{Math.round((Number(form.ctc_annual) || 0) / 12).toLocaleString("en-IN")} / month
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addBreakupRow}
                    className="text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    + Add Component
                  </button>
                </div>

                <div className="space-y-2">
                  {breakup.map((row, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        className={inputClass}
                        placeholder="Component Name (e.g. Basic, HRA)"
                        value={row.label}
                        onChange={(e) => setBreakup(breakup.map((r, idx) => idx === i ? { ...r, label: e.target.value } : r))}
                      />
                      <input
                        type="number"
                        className={inputClass}
                        placeholder="Annual Amount"
                        value={row.amount}
                        onChange={(e) => setBreakup(breakup.map((r, idx) => idx === i ? { ...r, amount: e.target.value } : r))}
                      />
                      <button
                        type="button"
                        onClick={() => removeBreakupRow(i)}
                        className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs font-bold pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500">Calculated Breakdown Total:</span>
                  <span className={`text-sm ${
                    breakupTotal === Number(form.ctc_annual)
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-brand-600 dark:text-brand-400"
                  }`}>
                    ₹{breakupTotal.toLocaleString("en-IN")} / year
                  </span>
                </div>
              </div>

              <Field label="Special Remarks / Performance Incentive Notes">
                <textarea
                  rows={2}
                  className={inputClass}
                  placeholder="e.g. Annual performance-linked bonus eligible after completing 6 months..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
            </div>
          ) : (
            /* ── COMPANY POLICIES & TERMS TAB ── */
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Field label="Probation Period Clause">
                  <input
                    className={inputClass}
                    placeholder="e.g. 3 Months (90 Days)"
                    value={form.probation_period}
                    onChange={(e) => setForm({ ...form, probation_period: e.target.value })}
                  />
                </Field>
                <Field label="Notice Period Clause">
                  <input
                    className={inputClass}
                    placeholder="e.g. 30 Days written notice"
                    value={form.notice_period}
                    onChange={(e) => setForm({ ...form, notice_period: e.target.value })}
                  />
                </Field>
                <Field label="Working Hours & Schedule">
                  <input
                    className={inputClass}
                    placeholder="e.g. Monday to Friday, 9:00 AM – 6:00 PM"
                    value={form.work_hours}
                    onChange={(e) => setForm({ ...form, work_hours: e.target.value })}
                  />
                </Field>
                <Field label="Work Mode & Location">
                  <input
                    className={inputClass}
                    placeholder="e.g. On-Site at Company Headquarters"
                    value={form.work_mode}
                    onChange={(e) => setForm({ ...form, work_mode: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Leave & Paid Time Off (PTO) Policy">
                <textarea
                  rows={2}
                  className={inputClass}
                  placeholder="e.g. 18 Days Earned Leave + 12 Days Casual/Sick Leave per calendar year"
                  value={form.leave_policy}
                  onChange={(e) => setForm({ ...form, leave_policy: e.target.value })}
                />
              </Field>

              <Field label="Company Benefits, Insurance & Perks">
                <textarea
                  rows={2}
                  className={inputClass}
                  placeholder="e.g. Group Health Medical Insurance (₹5L coverage), Learning allowances..."
                  value={form.benefits_perks}
                  onChange={(e) => setForm({ ...form, benefits_perks: e.target.value })}
                />
              </Field>

              <Field label="Confidentiality, NDA & Code of Conduct Terms">
                <textarea
                  rows={2}
                  className={inputClass}
                  placeholder="e.g. Strict non-disclosure of company proprietary assets and adherence to code of ethics..."
                  value={form.confidentiality}
                  onChange={(e) => setForm({ ...form, confidentiality: e.target.value })}
                />
              </Field>
            </div>
          )}
        </div>
      </Modal>

      {/* ────────────────── PROFESSIONAL OFFER LETTER LIVE PREVIEW MODAL ────────────────── */}
      <Modal
        isOpen={!!previewOffer}
        onClose={() => setPreviewOffer(null)}
        title={`Official Offer Letter — ${previewOffer?.candidate?.name || ""}`}
        size="2xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              variant="secondary"
              onClick={() => window.print()}
              icon={<Printer size={14} />}
            >
              Print
            </Button>
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => generateOfferPDF(previewOffer, previewOffer?.candidate)}
                icon={<FileDown size={14} />}
              >
                Download Official PDF
              </Button>
              <Button variant="secondary" onClick={() => setPreviewOffer(null)}>Close</Button>
            </div>
          </div>
        }
      >
        {previewOffer && (
          <div className="p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl space-y-6 text-gray-800 dark:text-gray-200 font-sans shadow-inner">
            {/* Header / Brand */}
            <div className="border-b-2 border-brand-500 pb-4 flex items-start justify-between">
              <div>
                <h1 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">
                  NIDHI IMPEX HRMS
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Varachha Road, Surat, Gujarat 395006 &bull; hr@nidhiimpex.com
                </p>
              </div>
              <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                <p className="font-bold text-gray-900 dark:text-white">EMPLOYMENT OFFER</p>
                <p>Ref: HR/OFFER/{new Date().getFullYear()}/{previewOffer.id || "001"}</p>
                <p>Date: {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
              </div>
            </div>

            {/* Recipient */}
            <div className="text-xs space-y-1">
              <p className="font-bold text-gray-900 dark:text-white">To,</p>
              <p className="font-semibold text-sm text-brand-700 dark:text-brand-300">{previewOffer.candidate?.name}</p>
              <p className="text-gray-500">{previewOffer.candidate?.email || "candidate@email.com"}</p>
              <p className="text-gray-500">{previewOffer.candidate?.phone || "+91 —"}</p>
            </div>

            {/* Subject */}
            <div className="bg-brand-50 dark:bg-brand-950/40 p-3 rounded-xl border border-brand-100 dark:border-brand-800 text-xs font-bold text-brand-900 dark:text-brand-200">
              Subject: Formal Offer of Employment for the position of "{previewOffer.designation}"
            </div>

            {/* Letter Text */}
            <div className="text-xs leading-relaxed space-y-2 text-gray-700 dark:text-gray-300">
              <p>Dear <strong>{previewOffer.candidate?.name}</strong>,</p>
              <p>
                We are pleased to offer you the position of <strong>{previewOffer.designation}</strong> with our company.
                We were thoroughly impressed by your performance during the recruitment and evaluation stages, and we are excited
                to welcome you to our growing organization.
              </p>
            </div>

            {/* Annexure A: Compensation Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                Annexure A: Compensation Structure
              </h4>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="text-left p-2.5">Salary Component</th>
                      <th className="text-right p-2.5">Monthly (₹)</th>
                      <th className="text-right p-2.5">Annual (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {(() => {
                      let rows;
                      if (Array.isArray(previewOffer.salary_breakup) && previewOffer.salary_breakup.length > 0) {
                        rows = previewOffer.salary_breakup.map((item) => ({
                          label: item.component || item.name || item.label || "Component",
                          monthly: Number(item.monthly || Math.round(Number(item.annual || item.amount || 0) / 12)),
                          annual: Number(item.annual || (Number(item.monthly || 0) * 12) || (Number(item.amount || 0) * 12)),
                        }));
                      } else if (previewOffer.salary_breakup && typeof previewOffer.salary_breakup === "object" && Object.keys(previewOffer.salary_breakup).length > 0) {
                        rows = Object.entries(previewOffer.salary_breakup).map(([k, v]) => ({
                          label: k,
                          monthly: Math.round(Number(v) / 12),
                          annual: Number(v),
                        }));
                      } else {
                        const basic = Math.round(Number(previewOffer.ctc_annual || 0) * 0.40);
                        const hra = Math.round(Number(previewOffer.ctc_annual || 0) * 0.20);
                        const pf = Math.min(Math.round(basic * 0.12), 21600);
                        const special = Math.max(0, Number(previewOffer.ctc_annual || 0) - basic - hra - pf);
                        rows = [
                          { label: "Basic Salary (40%)", monthly: Math.round(basic / 12), annual: basic },
                          { label: "House Rent Allowance (HRA 20%)", monthly: Math.round(hra / 12), annual: hra },
                          { label: "Special & Supplementary Allowance", monthly: Math.round(special / 12), annual: special },
                          { label: "Employer Provident Fund (PF)", monthly: Math.round(pf / 12), annual: pf },
                        ];
                      }
                      return rows.map((r, idx) => (
                        <tr key={idx}>
                          <td className="p-2.5">{r.label}</td>
                          <td className="p-2.5 text-right font-medium">₹{r.monthly.toLocaleString("en-IN")}</td>
                          <td className="p-2.5 text-right font-semibold">₹{r.annual.toLocaleString("en-IN")}</td>
                        </tr>
                      ));
                    })()}
                    <tr className="bg-brand-50/50 dark:bg-brand-950/20 font-bold text-brand-900 dark:text-brand-200">
                      <td className="p-2.5">Total Cost to Company (CTC)</td>
                      <td className="p-2.5 text-right">₹{Math.round(Number(previewOffer.ctc_annual) / 12).toLocaleString("en-IN")}</td>
                      <td className="p-2.5 text-right">₹{Number(previewOffer.ctc_annual).toLocaleString("en-IN")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Annexure B: Company Policies & Terms */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                Annexure B: Summary of Employment Policies & Terms
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700">
                  <span className="font-bold text-gray-900 dark:text-white block">Probation Period</span>
                  <p className="text-gray-600 dark:text-gray-400 mt-0.5">{previewOffer.probation_period || DEFAULT_COMPANY_POLICIES.probation_period}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700">
                  <span className="font-bold text-gray-900 dark:text-white block">Notice Period</span>
                  <p className="text-gray-600 dark:text-gray-400 mt-0.5">{previewOffer.notice_period || DEFAULT_COMPANY_POLICIES.notice_period}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700">
                  <span className="font-bold text-gray-900 dark:text-white block">Working Hours</span>
                  <p className="text-gray-600 dark:text-gray-400 mt-0.5">{previewOffer.work_hours || DEFAULT_COMPANY_POLICIES.work_hours}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700">
                  <span className="font-bold text-gray-900 dark:text-white block">Work Location & Mode</span>
                  <p className="text-gray-600 dark:text-gray-400 mt-0.5">{previewOffer.work_mode || DEFAULT_COMPANY_POLICIES.work_mode}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 sm:col-span-2">
                  <span className="font-bold text-gray-900 dark:text-white block">Leave Entitlement & Benefits</span>
                  <p className="text-gray-600 dark:text-gray-400 mt-0.5">{previewOffer.leave_policy || DEFAULT_COMPANY_POLICIES.leave_policy}</p>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">{previewOffer.benefits_perks || DEFAULT_COMPANY_POLICIES.benefits_perks}</p>
                </div>
              </div>
            </div>

            {/* Signatures */}
            <div className="pt-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs">
              <div className="space-y-3">
                <p className="font-bold text-gray-900 dark:text-white">Authorized HR Signatory</p>
                <div className="h-6 w-32 border-b border-gray-400"></div>
                <p className="text-[11px] text-gray-500">Nidhi Impex Human Resources</p>
              </div>
              <div className="space-y-3 text-right">
                <p className="font-bold text-gray-900 dark:text-white">Candidate Acceptance</p>
                <div className="h-6 w-32 border-b border-gray-400 ml-auto"></div>
                <p className="text-[11px] text-gray-500">{previewOffer.candidate?.name} (Signature & Date)</p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ────────────────── VERSION HISTORY MODAL ────────────────── */}
      <Modal
        isOpen={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        title={`Offer Revision History — ${historyTarget?.candidate?.name || ""}`}
      >
        <div className="space-y-3 font-sans">
          {(historyTarget?.revisions || []).map((rev) => (
            <div key={rev.id} className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40 p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900 dark:text-white">Version {rev.version}</span>
                <span className="text-xs text-gray-400">{rev.created_at ? new Date(rev.created_at).toLocaleString() : ""}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{rev.reason || "Revision updated"}</p>
              <p className="text-xs font-bold text-brand-600 dark:text-brand-400">
                Annual CTC: ₹{Number(rev.snapshot?.ctc_annual || 0).toLocaleString("en-IN")}
              </p>
            </div>
          ))}
          {(!historyTarget?.revisions || historyTarget.revisions.length === 0) && (
            <p className="text-sm text-gray-400 text-center py-6">No previous revision records found.</p>
          )}
        </div>
      </Modal>

      {/* ────────────────── CANDIDATE DETAIL DRAWER WITH INTERVIEW NOTES ────────────────── */}
      {drawerCandidate && (
        <CandidateDrawer
          candidate={drawerCandidate}
          loadingDetail={drawerLoading}
          onClose={() => setDrawerCandidate(null)}
          onAdvance={() => { setDrawerCandidate(null); loadRoster(); loadOffers(); }}
          onReload={() => { loadRoster(); loadOffers(); }}
          mainStages={MAIN_STAGES}
          terminalStages={TERMINAL_STAGES}
          stageIndex={STAGE_INDEX}
          ownedStages={OFFER_STAGES}
        />
      )}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
        {label}{required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
