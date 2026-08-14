import { OrgResourceManager } from "../../../features/organization/components/OrgResourceManager";
import { resourceConfigs } from "../../../features/organization/configs/resourceConfigs";

export default function HierarchiesPage() {
  const config = resourceConfigs.hierarchies;
  return <OrgResourceManager {...config} />;
}