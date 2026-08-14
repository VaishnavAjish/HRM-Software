import { OrgResourceManager } from "../../../features/organization/components/OrgResourceManager";
import { resourceConfigs } from "../../../features/organization/configs/resourceConfigs";

export default function EnterprisesPage() {
  const config = resourceConfigs.enterprises;
  return <OrgResourceManager {...config} />;
}