import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { User, Briefcase, GraduationCap, X, Plus, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/CandidateAuthContext";
import CandidateExperienceManager from "../../components/careers/CandidateExperienceManager";
import CandidateEducationManager from "../../components/careers/CandidateEducationManager";

const PROFILE_FIELDS = ["name", "phone", "current_company", "current_designation", "experience_years", "skills"];

function profileCompletion(candidate) {
  if (!candidate) return 0;
  const filled = PROFILE_FIELDS.filter((field) => {
    const value = candidate[field];
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && String(value).trim() !== "";
  }).length;
  return Math.round((filled / PROFILE_FIELDS.length) * 100);
}

export default function CandidateProfile() {
  const { candidate, token, setCandidate } = useCandidateAuth();

  if (!candidate) {
    return <SignInPrompt />;
  }

  return <CandidateProfileForm candidate={candidate} token={token} setCandidate={setCandidate} />;
}

function SignInPrompt() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-nx-paper px-4 py-16 text-center sm:px-6">
      <div className="w-full max-w-md rounded-lg border border-nx-line bg-nx-surface p-8 shadow-[0_12px_28px_-18px_rgba(33,29,23,0.3)] sm:p-10">
        <h1 className="text-xl font-bold text-nx-ink">Sign in to view your profile</h1>
        <p className="mt-2 text-sm text-nx-muted">Create a candidate account or sign in to manage your career profile.</p>
        <Link
          to="/careers/login?redirect=/careers/account/profile"
          className="mt-6 inline-flex rounded-md bg-brand-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}

function CandidateProfileForm({ candidate, token, setCandidate }) {
  const [form, setForm] = useState({
    name: candidate?.name || "",
    phone: candidate?.phone || "",
    current_company: candidate?.current_company || "",
    current_designation: candidate?.current_designation || "",
    experience_years: candidate?.experience_years ?? "",
    skills: candidate?.skills || [],
  });
  const [skillInput, setSkillInput] = useState("");
  const [saving, setSaving] = useState(false);

  const completion = useMemo(() => profileCompletion(candidate), [candidate]);

  const addSkill = () => {
    const value = skillInput.trim();
    if (!value || form.skills.includes(value)) {
      setSkillInput("");
      return;
    }
    setForm({ ...form, skills: [...form.skills, value] });
    setSkillInput("");
  };

  const removeSkill = (skill) => {
    setForm({ ...form, skills: form.skills.filter((s) => s !== skill) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await candidateApi.updateProfile(form, token);
      if (res.status) {
        setCandidate(res.candidate);
        toast.success("Profile updated successfully.");
      } else {
        toast.error(res.message || "Failed to update profile.");
      }
    } catch (err) {
      toast.error(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-nx-paper">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-black tracking-[-0.01em] text-nx-ink">My Profile</h1>
        <p className="mt-1 text-sm text-nx-muted">Keep your profile up to date so it's ready when you apply.</p>

        <div className="mt-6 rounded-lg border border-nx-line bg-nx-surface p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-nx-ink">Profile completion</span>
            <span className="font-bold text-brand-700">{completion}%</span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-nx-line">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${completion}%` }} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <section className="rounded-lg border border-nx-line bg-nx-surface p-6 sm:p-7">
            <div className="flex items-center gap-2.5">
              <User size={17} className="text-brand-600" />
              <h2 className="text-sm font-bold text-nx-ink">Personal Information</h2>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="profile-name" className="mb-1.5 block text-xs font-bold text-nx-body">Full Name *</label>
                <input
                  id="profile-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-md border border-nx-line bg-nx-paper px-3.5 py-2.5 text-nx-ink outline-none transition-colors focus:border-brand-500 focus:bg-white"
                />
              </div>
              <div>
                <label htmlFor="profile-phone" className="mb-1.5 block text-xs font-bold text-nx-body">Phone</label>
                <input
                  id="profile-phone"
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full rounded-md border border-nx-line bg-nx-paper px-3.5 py-2.5 text-nx-ink placeholder-nx-faint outline-none transition-colors focus:border-brand-500 focus:bg-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="profile-email" className="mb-1.5 block text-xs font-bold text-nx-body">Email</label>
                <div id="profile-email" className="flex items-center gap-2 rounded-md border border-nx-line bg-nx-paper px-3.5 py-2.5">
                  <span className="text-nx-muted">{candidate?.email}</span>
                  {candidate?.email_verified_at && (
                    <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 size={13} /> Verified
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-nx-line bg-nx-surface p-6 sm:p-7">
            <div className="flex items-center gap-2.5">
              <Briefcase size={17} className="text-brand-600" />
              <h2 className="text-sm font-bold text-nx-ink">Experience</h2>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="profile-company" className="mb-1.5 block text-xs font-bold text-nx-body">Current Company</label>
                <input
                  id="profile-company"
                  type="text"
                  value={form.current_company}
                  onChange={(e) => setForm({ ...form, current_company: e.target.value })}
                  className="w-full rounded-md border border-nx-line bg-nx-paper px-3.5 py-2.5 text-nx-ink outline-none transition-colors focus:border-brand-500 focus:bg-white"
                />
              </div>
              <div>
                <label htmlFor="profile-designation" className="mb-1.5 block text-xs font-bold text-nx-body">Current Designation</label>
                <input
                  id="profile-designation"
                  type="text"
                  value={form.current_designation}
                  onChange={(e) => setForm({ ...form, current_designation: e.target.value })}
                  className="w-full rounded-md border border-nx-line bg-nx-paper px-3.5 py-2.5 text-nx-ink outline-none transition-colors focus:border-brand-500 focus:bg-white"
                />
              </div>
              <div>
                <label htmlFor="profile-experience" className="mb-1.5 block text-xs font-bold text-nx-body">Total Experience (years)</label>
                <input
                  id="profile-experience"
                  type="number"
                  step="0.5"
                  min="0"
                  value={form.experience_years}
                  onChange={(e) => setForm({ ...form, experience_years: e.target.value })}
                  placeholder="e.g. 3.5"
                  className="w-full rounded-md border border-nx-line bg-nx-paper px-3.5 py-2.5 text-nx-ink placeholder-nx-faint outline-none transition-colors focus:border-brand-500 focus:bg-white"
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-nx-line bg-nx-surface p-6 sm:p-7">
            <div className="flex items-center gap-2.5">
              <GraduationCap size={17} className="text-brand-600" />
              <h2 className="text-sm font-bold text-nx-ink">Skills</h2>
            </div>

            <div className="mt-5 flex gap-2">
              <input
                type="text"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
                placeholder="Add a skill and press Enter"
                className="w-full rounded-md border border-nx-line bg-nx-paper px-3.5 py-2.5 text-nx-ink placeholder-nx-faint outline-none transition-colors focus:border-brand-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={addSkill}
                className="flex-shrink-0 rounded-md border border-nx-line px-3.5 text-nx-body transition-colors hover:border-nx-line2"
                aria-label="Add skill"
              >
                <Plus size={17} />
              </button>
            </div>

            {form.skills.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {form.skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1.5 rounded-full border border-nx-line bg-nx-paper px-3 py-1 text-xs font-semibold text-nx-body"
                  >
                    {skill}
                    <button type="button" onClick={() => removeSkill(skill)} aria-label={`Remove ${skill}`} className="text-nx-faint hover:text-red-600">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          <div className="flex items-center justify-between">
            <Link to="/careers/account/applications" className="text-sm font-bold text-nx-muted hover:text-nx-ink">
              Back to Applications
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-brand-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>

        {/* These manage their own resources (candidate_experiences /
            candidate_educations) independently of the profile form above,
            each with their own inline add/edit `<form>` — kept as siblings
            rather than nested inside the profile form's `<form>`. */}
        <div className="mt-6 space-y-6">
          <CandidateExperienceManager />
          <CandidateEducationManager />
        </div>
      </div>
    </div>
  );
}
