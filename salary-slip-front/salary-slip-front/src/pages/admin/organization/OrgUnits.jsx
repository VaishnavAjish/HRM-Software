import { OrgResourceManager } from "../../../features/organization/components/OrgResourceManager";
import { resourceConfigs } from "../../../features/organization/configs/resourceConfigs";

export default function OrgUnitsPage() {
  const config = resourceConfigs.orgUnits;
  return <OrgResourceManager {...config} />;
}