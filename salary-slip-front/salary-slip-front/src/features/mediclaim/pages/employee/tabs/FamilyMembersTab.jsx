import FamilyMemberManager from "../../../components/FamilyMemberManager";

/**
 * Thin tab wrapper — the shared lookups object (from `useMediclaimLookups`,
 * loaded once by the workspace) is where `members` actually comes from, so
 * this tab has no fetching logic of its own.
 */
export default function FamilyMembersTab({ lookups }) {
  return (
    <FamilyMemberManager
      members={lookups?.members || []}
      loading={lookups?.loading}
      error={lookups?.error}
      onChanged={lookups?.reload}
    />
  );
}
