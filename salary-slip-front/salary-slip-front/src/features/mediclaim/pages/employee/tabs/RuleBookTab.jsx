import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../../../../context/AuthContext";
import Button from "../../../../../components/ui/Button";
import { mediclaimApi } from "../../../services/mediclaimApi";
import RuleBookViewer from "../../../components/RuleBookViewer";

/**
 * Rule books come from the shared `useMediclaimLookups`. Until onboarding
 * is complete, this also offers the "I have read this rule book"
 * acknowledgement — required before the Family Members tab's own
 * "Continue" action will succeed (see FamilyMembersTab.jsx). Once
 * onboarding is complete this is a plain read-only viewer, same as always.
 */
export default function RuleBookTab({ lookups, onboarding }) {
  const { user } = useAuth();
  const [viewedRuleBook, setViewedRuleBook] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  const needsAcknowledgement = Boolean(onboarding && !onboarding.completed && !onboarding.ruleBookAcknowledged);

  const acknowledge = async () => {
    setAcknowledging(true);
    try {
      await mediclaimApi.acknowledgeRuleBook(user?.accessToken, user?.tokenType);
      await lookups?.reload();
    } catch (err) {
      toast.error(err?.message || "Failed to record that you've read the rule book.");
    } finally {
      setAcknowledging(false);
    }
  };

  return (
    <div className="space-y-4">
      <RuleBookViewer
        ruleBooks={lookups?.ruleBooks || []}
        loading={lookups?.loading}
        error={lookups?.error}
        onLanguageSelected={() => setViewedRuleBook(true)}
      />

      {needsAcknowledgement && viewedRuleBook && (
        <div className="flex justify-end">
          <Button icon={<CheckCircle2 size={16} />} onClick={acknowledge} disabled={acknowledging}>
            {acknowledging ? "Saving…" : "I have read this rule book — Continue"}
          </Button>
        </div>
      )}
    </div>
  );
}
