import { OrgResourceManager } from "../../../features/organization/components/OrgResourceManager";
import { resourceConfigs } from "../../../features/organization/configs/resourceConfigs";

export default function WorkLocationMappingsPage() {
  const config = resourceConfigs.workLocationMappings;
  return <OrgResourceManager {...config} />;
}