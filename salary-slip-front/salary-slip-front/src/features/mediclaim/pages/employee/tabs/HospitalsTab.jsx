import HospitalDirectory from "../../../components/HospitalDirectory";

/** Read-only wrapper — hospitals come from the shared `useMediclaimLookups`. */
export default function HospitalsTab({ lookups }) {
  return (
    <HospitalDirectory
      hospitals={lookups?.hospitals || []}
      loading={lookups?.loading}
      error={lookups?.error}
    />
  );
}
