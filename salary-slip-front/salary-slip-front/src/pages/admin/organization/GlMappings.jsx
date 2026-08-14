import { OrgResourceManager } from "../../../features/organization/components/OrgResourceManager";
import { resourceConfigs } from "../../../features/organization/configs/resourceConfigs";

export default function GlMappingsPage() {
  const config = resourceConfigs.glMappings;
  return <OrgResourceManager {...config} />;
}
