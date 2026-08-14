import { OrgResourceManager } from "../../../features/organization/components/OrgResourceManager";
import { resourceConfigs } from "../../../features/organization/configs/resourceConfigs";

export default function AllocationRulesPage() {
  const config = resourceConfigs.allocationRules;
  return <OrgResourceManager {...config} />;
}