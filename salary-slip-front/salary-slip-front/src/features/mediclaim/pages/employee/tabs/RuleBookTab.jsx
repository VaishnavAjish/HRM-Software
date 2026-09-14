import RuleBookViewer from "../../../components/RuleBookViewer";

/** Read-only wrapper — rule books come from the shared `useMediclaimLookups`. */
export default function RuleBookTab({ lookups }) {
  return (
    <RuleBookViewer
      ruleBooks={lookups?.ruleBooks || []}
      loading={lookups?.loading}
      error={lookups?.error}
    />
  );
}
