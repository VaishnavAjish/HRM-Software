import {
  UserPlus, Search, Star, Users, Code2, Trophy, Award, Send, PartyPopper, XCircle, PauseCircle,
} from "lucide-react";

/**
 * Single source of truth for candidate-stage metadata, shared by every
 * Hiring tab (Candidates, Interviews, Offers, Onboarding) so colors/labels/
 * icons stay consistent no matter which tab is currently displaying a
 * candidate. Each tab only owns a slice of this — see TAB_STAGE_KEYS below.
 */

/** Ordered main-flow stages (excludes terminal ones) */
export const MAIN_STAGES = [
  { key: "applied",              label: "Applied",              color: "#6366f1", icon: UserPlus },
  { key: "screening",            label: "Screening",            color: "#8b5cf6", icon: Search },
  { key: "shortlisted",          label: "Shortlisted",          color: "#0ea5e9", icon: Star },
  { key: "hr_interview",         label: "HR Interview",         color: "#06b6d4", icon: Users },
  { key: "technical_interview",  label: "Tech Interview",       color: "#10b981", icon: Code2 },
  { key: "final_interview",      label: "Final Interview",      color: "#f59e0b", icon: Trophy },
  { key: "selected",             label: "Selected",             color: "#22c55e", icon: Award },
  { key: "offer_sent",           label: "Offer Sent",           color: "#84cc16", icon: Send },
  { key: "offer_accepted",       label: "Offer Accepted",       color: "#16a34a", icon: PartyPopper },
];

export const TERMINAL_STAGES = [
  { key: "rejected", label: "Rejected", color: "#ef4444", icon: XCircle },
  { key: "on_hold",  label: "On Hold",  color: "#f59e0b", icon: PauseCircle },
];

export const ALL_COLUMNS = [...MAIN_STAGES, ...TERMINAL_STAGES];

export const STAGE_INDEX = Object.fromEntries(MAIN_STAGES.map((s, i) => [s.key, i]));

/** Visual clusters for the Candidates tab's Board view. */
export const STAGE_GROUPS = [
  { label: "Sourcing",        keys: ["applied", "screening", "shortlisted"] },
  { label: "Interviews",      keys: ["hr_interview", "technical_interview", "final_interview"] },
  { label: "Offer & Closing", keys: ["selected", "offer_sent", "offer_accepted"] },
  { label: "Terminal",        keys: ["rejected", "on_hold"] },
];

/**
 * Which stages each tab is actually responsible for. A candidate only shows
 * up — and can only be acted on — in the one tab that currently owns their
 * stage; moving them out of that range is how they "transfer" to the next
 * tab. Terminal stages (rejected/on_hold) can be reached from any owning tab,
 * so every tab includes them for its own reject/hold action.
 */
export const TAB_STAGE_KEYS = {
  candidates: ["applied", "screening", "shortlisted", "rejected", "on_hold"],
  interviews: ["hr_interview", "technical_interview", "final_interview", "rejected", "on_hold"],
  offers:     ["selected", "offer_sent", "offer_accepted", "rejected", "on_hold"],
  onboarding: ["offer_accepted"],
};

export function stageLabel(key) {
  return ALL_COLUMNS.find((s) => s.key === key)?.label ?? key;
}

export function stageColor(key) {
  return ALL_COLUMNS.find((s) => s.key === key)?.color ?? "#6b7280";
}

/** Next stage in the main flow, ignoring terminal stages — used to power "Move to next stage" actions. */
export function nextMainStage(currentKey) {
  const idx = STAGE_INDEX[currentKey];
  if (idx === undefined || idx >= MAIN_STAGES.length - 1) return null;
  return MAIN_STAGES[idx + 1];
}
