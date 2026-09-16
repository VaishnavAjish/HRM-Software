import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../../../../context/AuthContext";
import Button from "../../../../../components/ui/Button";
import { mediclaimApi } from "../../../services/mediclaimApi";
import FamilyMemberManager from "../../../components/FamilyMemberManager";

/**
 * The shared lookups object (from `useMediclaimLookups`, loaded once by the
 * workspace) is where `members` actually comes from. Until onboarding is
 * complete, this tab also requires the Rule Book tab's acknowledgement
 * first (matching what the backend already enforces) and offers the
 * "Continue to Mediclaim" action that finishes onboarding and unlocks the
 * rest of the workspace's tabs.
 */
export default function FamilyMembersTab({ lookups, onboarding }) {
  const { user } = useAuth();
  const [completing, setCompleting] = useState(false);

  const gated = Boolean(onboarding && !onboarding.completed);

  const complete = async () => {
    setCompleting(true);
    try {
      await mediclaimApi.completeOnboarding(user?.accessToken, user?.tokenType);
      await lookups?.reload();
    } catch (err) {
      toast.error(err?.message || "Failed to continue — please try again.");
    } finally {
      setCompleting(false);
    }
  };

  if (gated && !onboarding.ruleBookAcknowledged) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">Please read the Rule Book tab first before adding your family members.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FamilyMemberManager
        members={lookups?.members || []}
        loading={lookups?.loading}
        error={lookups?.error}
        onChanged={lookups?.reload}
      />

      {gated && (
        <div className="flex justify-end">
          <Button icon={<CheckCircle2 size={16} />} onClick={complete} disabled={completing}>
            {completing ? "Saving…" : "Continue to Mediclaim"}
          </Button>
        </div>
      )}
    </div>
  );
}
