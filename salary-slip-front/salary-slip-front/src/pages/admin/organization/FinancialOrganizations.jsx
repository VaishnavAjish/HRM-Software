import { OrgResourceManager } from "../../../features/organization/components/OrgResourceManager";
import { resourceConfigs } from "../../../features/organization/configs/resourceConfigs";

export default function FinancialOrganizationsPage() {
  const config = resourceConfigs.financialOrganizations;
  return <OrgResourceManager {...config} />;
}