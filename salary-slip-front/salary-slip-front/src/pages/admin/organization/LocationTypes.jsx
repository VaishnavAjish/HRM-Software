import { OrgResourceManager } from "../../../features/organization/components/OrgResourceManager";
import { resourceConfigs } from "../../../features/organization/configs/resourceConfigs";

export default function LocationTypesPage() {
  const config = resourceConfigs.locationTypes;
  return <OrgResourceManager {...config} />;
}