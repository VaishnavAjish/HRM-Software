import { OrgResourceManager } from "../../../features/organization/components/OrgResourceManager";
import { resourceConfigs } from "../../../features/organization/configs/resourceConfigs";

export default function OrgLocationsPage() {
  const config = resourceConfigs.orgLocations;
  return <OrgResourceManager {...config} />;
}