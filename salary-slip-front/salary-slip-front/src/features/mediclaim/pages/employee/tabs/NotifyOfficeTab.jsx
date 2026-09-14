import NotifyOfficeForm from "../../../components/NotifyOfficeForm";

/**
 * Thin wrapper — members/hospitals come from the shared `useMediclaimLookups`
 * instance the workspace already loaded once, so this tab fetches nothing
 * of its own.
 */
export default function NotifyOfficeTab({ lookups }) {
  return (
    <NotifyOfficeForm
      members={lookups?.members || []}
      hospitals={lookups?.hospitals || []}
      lookupsLoading={lookups?.loading}
      lookupsError={lookups?.error}
    />
  );
}
