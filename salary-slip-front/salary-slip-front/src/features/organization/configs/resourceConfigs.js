import {
  Building2,
  Building,
  GitBranch,
  Coins,
  FileText,
  Users,
  BarChart2,
  Calendar,
  ArrowRightLeft,
} from "lucide-react";
import { organizationApi } from "../services/organizationApi";

function companyIdTransform(value) {
  return value ? Number(value) : null;
}

function parentIdTransform(value) {
  return value === "" ? null : Number(value);
}

function optionalNumber(value) {
  return value === "" ? null : Number(value);
}

function toUpperCase(value) {
  return value?.toUpperCase();
}

function booleanTransform(value) {
  return value === "true" || value === true;
}

function formatType(type) {
  if (!type) return "";
  return String(type)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderType(i) {
  return formatType(i.type);
}

function renderKind(i) {
  return i.kind ? i.kind.charAt(0).toUpperCase() + i.kind.slice(1) : "";
}

function renderStatus(i) {
  return i.status || "";
}

function renderIsActive(i) {
  return i.isActive ? "Active" : "Inactive";
}

function renderMappingType(i) {
  return i.mappingType ? i.mappingType.charAt(0).toUpperCase() + i.mappingType.slice(1) : "";
}

function renderNodeType(i) {
  return formatType(i.nodeType);
}

function renderEdgeType(i) {
  return formatType(i.edgeType);
}

function renderRelType(i) {
  return i.relationshipType ? i.relationshipType.charAt(0).toUpperCase() + i.relationshipType.slice(1) : "";
}

function renderLeadershipType(i) {
  return i.leadershipType ? i.leadershipType.charAt(0).toUpperCase() + i.leadershipType.slice(1) : "";
}

function renderChangeType(i) {
  return i.changeType ? i.changeType.charAt(0).toUpperCase() + i.changeType.slice(1) : "";
}

function renderChangeStatus(i) {
  const status = i.status || "";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function renderCalendarKind(i) {
  return i.calendarKind ? i.calendarKind.replace(/_/g, " ") : "";
}

function renderScopeType(i) {
  return i.scopeType ? i.scopeType.charAt(0).toUpperCase() + i.scopeType.slice(1) : "";
}

function renderPercentage(i) {
  return `${i.percentage || 0}%`;
}

function renderActiveYesNo(i) {
  return i.isActive ? "Yes" : "No";
}

function renderItemType(i) {
  return i.itemType ? i.itemType.replace(/_/g, " ") : "";
}

const ENT_TYPES = [
  { value: "standalone", label: "Standalone" },
  { value: "group", label: "Group" },
  { value: "holding", label: "Holding" },
  { value: "parent", label: "Parent" },
  { value: "subsidiary", label: "Subsidiary" },
];

const ENT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "closed", label: "Closed" },
];

const UNIT_TYPES = [
  { value: "business_unit", label: "Business Unit" },
  { value: "division", label: "Division" },
  { value: "function", label: "Function" },
  { value: "department", label: "Department" },
  { value: "sub_department", label: "Sub Department" },
  { value: "section", label: "Section" },
  { value: "team", label: "Team" },
  { value: "project_org", label: "Project Org" },
  { value: "virtual_org", label: "Virtual Org" },
  { value: "shared_service_org", label: "Shared Service Org" },
];

const UNIT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "closed", label: "Closed" },
];

const LOC_KINDS = [
  { value: "branch", label: "Branch" },
  { value: "office", label: "Office" },
  { value: "plant", label: "Plant" },
  { value: "factory", label: "Factory" },
  { value: "warehouse", label: "Warehouse" },
  { value: "store", label: "Store" },
  { value: "worksite", label: "Worksite" },
  { value: "remote", label: "Remote" },
];

const LOC_STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "closed", label: "Closed" },
];

const FIN_TYPES = [
  { value: "cost_center", label: "Cost Center" },
  { value: "profit_center", label: "Profit Center" },
  { value: "budget_center", label: "Budget Center" },
  { value: "payroll_area", label: "Payroll Area" },
  { value: "expense_unit", label: "Expense Unit" },
  { value: "finance_business_unit", label: "Finance Business Unit" },
  { value: "project_cost_code", label: "Project Cost Code" },
  { value: "internal_order", label: "Internal Order" },
];

const FIN_STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "closed", label: "Closed" },
];

const MAPPING_TYPES = [
  { value: "default", label: "Default" },
  { value: "override", label: "Override" },
];

const GL_MAPPING_TYPES = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "tertiary", label: "Tertiary" },
];

const ALLOC_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

const HIERARCHY_TYPES = [
  { value: "organizational", label: "Organizational" },
  { value: "reporting", label: "Reporting" },
  { value: "financial", label: "Financial" },
  { value: "project", label: "Project" },
];

const HIERARCHY_STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

const NODE_TYPES = [
  { value: "enterprise", label: "Enterprise" },
  { value: "company", label: "Company" },
  { value: "business_unit", label: "Business Unit" },
  { value: "division", label: "Division" },
  { value: "function", label: "Function" },
  { value: "department", label: "Department" },
  { value: "sub_department", label: "Sub Department" },
  { value: "section", label: "Section" },
  { value: "team", label: "Team" },
  { value: "position", label: "Position" },
  { value: "employee", label: "Employee" },
  { value: "location", label: "Location" },
  { value: "financial_organization", label: "Financial Org" },
];

const EDGE_TYPES = [
  { value: "parent_child", label: "Parent-Child" },
  { value: "dotted_line", label: "Dotted Line" },
  { value: "matrix", label: "Matrix" },
  { value: "cross_functional", label: "Cross Functional" },
];

const REL_TYPES = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "functional", label: "Functional" },
  { value: "project", label: "Project" },
  { value: "matrix", label: "Matrix" },
];

const LEADERSHIP_TYPES = [
  { value: "head", label: "Head" },
  { value: "manager", label: "Manager" },
  { value: "lead", label: "Lead" },
  { value: "coordinator", label: "Coordinator" },
];

const CHANGE_TYPES = [
  { value: "restructure", label: "Restructure" },
  { value: "merger", label: "Merger" },
  { value: "acquisition", label: "Acquisition" },
  { value: "divestiture", label: "Divestiture" },
  { value: "reorganization", label: "Reorganization" },
  { value: "relocation", label: "Relocation" },
  { value: "other", label: "Other" },
];

const CHANGE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "scheduled", label: "Scheduled" },
  { value: "applied", label: "Applied" },
  { value: "cancelled", label: "Cancelled" },
];

const CALENDAR_KINDS = [
  { value: "working_day", label: "Working Day" },
  { value: "financial", label: "Financial" },
  { value: "payroll", label: "Payroll" },
];

const CALENDAR_SCOPES = [
  { value: "enterprise", label: "Enterprise" },
  { value: "company", label: "Company" },
  { value: "country", label: "Country" },
  { value: "location", label: "Location" },
  { value: "department", label: "Department" },
];

const CHANGE_ITEM_TYPES = [
  { value: "create_unit", label: "Create Unit" },
  { value: "update_unit", label: "Update Unit" },
  { value: "delete_unit", label: "Delete Unit" },
  { value: "move_unit", label: "Move Unit" },
  { value: "create_position", label: "Create Position" },
  { value: "update_position", label: "Update Position" },
  { value: "delete_position", label: "Delete Position" },
  { value: "assign_employee", label: "Assign Employee" },
  { value: "update_assignment", label: "Update Assignment" },
  { value: "remove_assignment", label: "Remove Assignment" },
];

export const resourceConfigs = {
  enterprises: {
    title: "Enterprises",
    description: "Enterprise groups, holdings, and parent-subsidiary structures.",
    icon: Building2,
    api: {
      list: organizationApi.enterprises,
      create: organizationApi.createEnterprise,
      update: organizationApi.updateEnterpriseRecord,
      remove: organizationApi.deleteEnterprise,
      setStatus: organizationApi.setEnterpriseStatus,
      // enterpriseCompanies takes (accessToken, tokenType) — no filters
      // param — but OrgResourceManager always calls fetchCompanies as
      // (filters, accessToken, tokenType). Without this adapter the real
      // token lands in the tokenType slot and gets mangled into the
      // Authorization header, which the backend correctly rejects as
      // unauthenticated (and the app then reads as a session expiry).
      fetchCompanies: (_filters, accessToken, tokenType) => organizationApi.enterpriseCompanies(accessToken, tokenType),
    },
    columns: [
      { key: "code", header: "Code", className: "font-mono text-xs" },
      { key: "name", header: "Name" },
      { key: "displayName", header: "Display Name" },
      { key: "enterpriseType", header: "Type", render: (i) => formatType(i.enterpriseType) },
      { key: "parentName", header: "Parent" },
      { key: "countryCode", header: "Country" },
      { key: "currency", header: "Currency" },
      { key: "isActive", header: "Status", render: (i) => i.isActive ? "Active" : "Inactive" },
    ],
    formFields: [
      { name: "code", label: "Code *", required: true, maxLength: 60 },
      { name: "enterpriseType", label: "Enterprise Type", type: "select", options: ENT_TYPES },
      { name: "parentId", label: "Parent Enterprise", type: "select", options: "companies", transform: companyIdTransform },
      { name: "name", label: "Name *", required: true, maxLength: 190 },
      { name: "displayName", label: "Display Name", maxLength: 190 },
      { name: "registrationNumber", label: "Registration Number", maxLength: 100 },
      { name: "taxIdentification", label: "Tax Identification", maxLength: 100 },
      { name: "incorporationDate", label: "Incorporation Date", type: "date" },
      { name: "countryCode", label: "Country Code", maxLength: 2, transform: toUpperCase },
      { name: "timezone", label: "Timezone", maxLength: 64 },
      { name: "primaryAddress", label: "Primary Address", type: "textarea", rows: 2, maxLength: 2000 },
      { name: "contactEmail", label: "Contact Email", type: "email", maxLength: 190 },
      { name: "contactPhone", label: "Contact Phone", maxLength: 32 },
      { name: "fiscalYearStart", label: "Fiscal Year Start (MM-DD)", placeholder: "MM-DD" },
      { name: "currency", label: "Currency", maxLength: 3, transform: toUpperCase },
      { name: "logoDocumentId", label: "Logo Document ID", type: "number" },
      { name: "brandPrimaryColor", label: "Brand Primary Color", maxLength: 20 },
      { name: "brandSecondaryColor", label: "Brand Secondary Color", maxLength: 20 },
      { name: "isActive", label: "Active", type: "checkbox" },
      { name: "effectiveFrom", label: "Effective From", type: "date" },
      { name: "effectiveTo", label: "Effective To", type: "date" },
      { name: "companyIds", label: "Companies", type: "select", options: "companies" },
    ],
    filters: { searchPlaceholder: "name, code, or type" },
    permissions: { create: "org.enterprise.create", update: "org.enterprise.update", status: "org.enterprise.status", delete: "org.enterprise.delete" },
    statusFilters: [
      { value: "ALL", label: "All" },
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "closed", label: "Closed" },
    ],
    initialFormState: { isActive: true, enterpriseType: "standalone", currency: "INR", fiscalYearStart: "04-01", countryCode: "IN" },
    formStateToPayload: (state) => ({
      code: state.code,
      enterpriseType: state.enterpriseType,
      parentId: state.parentId,
      name: state.name,
      displayName: state.displayName,
      registrationNumber: state.registrationNumber,
      taxIdentification: state.taxIdentification,
      incorporationDate: state.incorporationDate,
      countryCode: state.countryCode?.toUpperCase(),
      timezone: state.timezone,
      primaryAddress: state.primaryAddress,
      contactEmail: state.contactEmail,
      contactPhone: state.contactPhone,
      fiscalYearStart: state.fiscalYearStart,
      currency: state.currency?.toUpperCase(),
      logoDocumentId: state.logoDocumentId,
      brandPrimaryColor: state.brandPrimaryColor,
      brandSecondaryColor: state.brandSecondaryColor,
      isActive: state.isActive,
      effectiveFrom: state.effectiveFrom,
      effectiveTo: state.effectiveTo,
      companyIds: state.companyIds ? [Number(state.companyIds)] : undefined,
    }),
  },

  orgUnits: {
    title: "Organization Units",
    description: "Business units, divisions, functions, departments, teams, and projects.",
    icon: GitBranch,
    api: {
      list: organizationApi.orgUnits,
      create: organizationApi.createOrgUnit,
      update: organizationApi.updateOrgUnit,
      remove: organizationApi.deleteOrgUnit,
      setStatus: organizationApi.setOrgUnitStatus,
      // Same adapter as above — legalEntityProfileCompanies also takes
      // (accessToken, tokenType) with no leading filters param.
      fetchCompanies: (_filters, accessToken, tokenType) => organizationApi.legalEntityProfileCompanies(accessToken, tokenType),
      fetchOptions: organizationApi.orgUnitOptions,
    },
    columns: [
      { key: "code", header: "Code", className: "font-mono text-xs" },
      { key: "name", header: "Name" },
      { key: "type", header: "Type", render: renderType },
      { key: "parentName", header: "Parent" },
      { key: "companyName", header: "Company" },
      { key: "managerName", header: "Manager" },
      { key: "status", header: "Status", render: renderStatus },
    ],
    formFields: [
      { name: "enterpriseId", label: "Enterprise", type: "select", options: "companies", transform: companyIdTransform },
      { name: "companyId", label: "Company *", required: true, type: "select", options: "companies", transform: companyIdTransform },
      { name: "parentId", label: "Parent Unit", type: "select", options: "tree", transform: parentIdTransform },
      { name: "code", label: "Code", maxLength: 60 },
      { name: "name", label: "Name *", required: true, maxLength: 190 },
      { name: "type", label: "Type", type: "select", options: UNIT_TYPES },
      { name: "status", label: "Status", type: "select", options: UNIT_STATUSES },
      { name: "description", label: "Description", type: "textarea", rows: 2, maxLength: 2000 },
      { name: "managerUserId", label: "Manager", type: "select", options: "companies", transform: companyIdTransform },
      { name: "ownerUserId", label: "Owner", type: "select", options: "companies", transform: companyIdTransform },
      { name: "legacyDepartmentId", label: "Legacy Department ID", type: "number" },
      { name: "legacyUnitId", label: "Legacy Unit ID", type: "number" },
      { name: "legacyBranchId", label: "Legacy Branch ID", type: "number" },
      { name: "legacyDesignationId", label: "Legacy Designation ID", type: "number" },
      { name: "effectiveFrom", label: "Effective From", type: "date" },
      { name: "effectiveTo", label: "Effective To", type: "date" },
    ],
    filters: { searchPlaceholder: "name, code, or type" },
    permissions: { create: "org.unit.create", update: "org.unit.update", status: "org.unit.status", delete: "org.unit.delete" },
    statusFilters: UNIT_STATUSES,
    initialFormState: { status: "active", type: "department" },
    formStateToPayload: (state) => ({
      enterpriseId: state.enterpriseId,
      companyId: Number(state.companyId),
      parentId: state.parentId,
      code: state.code,
      name: state.name,
      type: state.type,
      status: state.status,
      description: state.description,
      managerUserId: state.managerUserId,
      ownerUserId: state.ownerUserId,
      legacyDepartmentId: state.legacyDepartmentId,
      legacyUnitId: state.legacyUnitId,
      legacyBranchId: state.legacyBranchId,
      legacyDesignationId: state.legacyDesignationId,
      effectiveFrom: state.effectiveFrom,
      effectiveTo: state.effectiveTo,
    }),
  },

  orgLocations: {
    title: "Organization Locations",
    description: "Scope-based locations: branches, offices, plants, warehouses, worksites, and remote sites.",
    icon: Building,
    api: {
      list: organizationApi.orgLocations,
      create: organizationApi.createOrgLocation,
      update: organizationApi.updateOrgLocation,
      remove: organizationApi.deleteOrgLocation,
      setStatus: organizationApi.setOrgLocationStatus,
      // Same adapter as above — legalEntityProfileCompanies also takes
      // (accessToken, tokenType) with no leading filters param.
      fetchCompanies: (_filters, accessToken, tokenType) => organizationApi.legalEntityProfileCompanies(accessToken, tokenType),
      fetchOptions: organizationApi.orgLocationOptions,
    },
    columns: [
      { key: "code", header: "Code", className: "font-mono text-xs" },
      { key: "name", header: "Name" },
      { key: "kind", header: "Kind", render: renderKind },
      { key: "locationTypeName", header: "Type" },
      { key: "parentName", header: "Parent" },
      { key: "companyName", header: "Company" },
      { key: "city", header: "City" },
      { key: "state", header: "State" },
      { key: "countryCode", header: "Country" },
      { key: "status", header: "Status", render: renderStatus },
    ],
    formFields: [
      { name: "enterpriseId", label: "Enterprise", type: "select", options: "companies", transform: companyIdTransform },
      { name: "companyId", label: "Company *", required: true, type: "select", options: "companies", transform: companyIdTransform },
      { name: "locationTypeId", label: "Location Type", type: "select", options: "companies", transform: companyIdTransform },
      { name: "parentId", label: "Parent Location", type: "select", options: "tree", transform: parentIdTransform },
      { name: "zoneId", label: "Zone", type: "select", options: "companies", transform: companyIdTransform },
      { name: "regionId", label: "Region", type: "select", options: "companies", transform: companyIdTransform },
      { name: "territoryId", label: "Territory", type: "select", options: "companies", transform: companyIdTransform },
      { name: "code", label: "Code", maxLength: 60 },
      { name: "name", label: "Name *", required: true, maxLength: 190 },
      { name: "kind", label: "Kind *", required: true, type: "select", options: LOC_KINDS },
      { name: "status", label: "Status", type: "select", options: LOC_STATUSES },
      { name: "address", label: "Address", type: "textarea", rows: 2, maxLength: 2000 },
      { name: "city", label: "City", maxLength: 120 },
      { name: "state", label: "State", maxLength: 120 },
      { name: "countryCode", label: "Country Code", maxLength: 2, transform: toUpperCase },
      { name: "postalCode", label: "Postal Code", maxLength: 20 },
      { name: "timezone", label: "Timezone", maxLength: 64 },
      { name: "latitude", label: "Latitude", type: "number", transform: optionalNumber },
      { name: "longitude", label: "Longitude", type: "number", transform: optionalNumber },
      { name: "contactEmail", label: "Contact Email", type: "email", maxLength: 190 },
      { name: "contactPhone", label: "Contact Phone", maxLength: 32 },
      { name: "effectiveFrom", label: "Effective From", type: "date" },
      { name: "effectiveTo", label: "Effective To", type: "date" },
    ],
    filters: { searchPlaceholder: "name, code, city, or kind" },
    permissions: { create: "org.org_location.create", update: "org.org_location.update", status: "org.org_location.status", delete: "org.org_location.delete" },
    statusFilters: LOC_STATUSES,
    kindFilters: [
      { value: "ALL", label: "All kinds" },
      ...LOC_KINDS,
    ],
    initialFormState: { status: "active", kind: "branch", countryCode: "IN" },
    formStateToPayload: (state) => ({
      enterpriseId: state.enterpriseId,
      companyId: Number(state.companyId),
      locationTypeId: state.locationTypeId,
      parentId: state.parentId,
      zoneId: state.zoneId,
      regionId: state.regionId,
      territoryId: state.territoryId,
      code: state.code,
      name: state.name,
      kind: state.kind,
      status: state.status,
      address: state.address,
      city: state.city,
      state: state.state,
      countryCode: state.countryCode?.toUpperCase(),
      postalCode: state.postalCode,
      timezone: state.timezone,
      latitude: state.latitude,
      longitude: state.longitude,
      contactEmail: state.contactEmail,
      contactPhone: state.contactPhone,
      effectiveFrom: state.effectiveFrom,
      effectiveTo: state.effectiveTo,
    }),
  },

  locationTypes: {
    title: "Location Types",
    description: "Configurable location type definitions.",
    icon: GitBranch,
    api: {
      list: organizationApi.orgLocationTypes,
      create: organizationApi.createOrgLocationType,
      update: null,
      remove: null,
      setStatus: null,
      fetchCompanies: null,
    },
    columns: [
      { key: "code", header: "Code", className: "font-mono text-xs" },
      { key: "name", header: "Name" },
      { key: "description", header: "Description" },
      { key: "isActive", header: "Status", render: (i) => i.isActive ? "Active" : "Inactive" },
      { key: "sortOrder", header: "Sort Order" },
    ],
    formFields: [
      { name: "code", label: "Code *", required: true, maxLength: 60 },
      { name: "name", label: "Name *", required: true, maxLength: 190 },
      { name: "description", label: "Description", type: "textarea", rows: 2, maxLength: 2000 },
      { name: "isActive", label: "Active", type: "checkbox" },
      { name: "sortOrder", label: "Sort Order", type: "number" },
    ],
    filters: { searchPlaceholder: "name or code" },
    permissions: { create: "org.location_type.create", update: "org.location_type.update", status: "org.location_type.status", delete: "org.location_type.delete" },
    statusFilters: [
      { value: "ALL", label: "All" },
      { value: "true", label: "Active" },
      { value: "false", label: "Inactive" },
    ],
    initialFormState: { isActive: true, sortOrder: 0 },
    formStateToPayload: (state) => ({
      code: state.code,
      name: state.name,
      description: state.description,
      isActive: state.isActive,
      sortOrder: state.sortOrder,
    }),
    customModal: null,
    canManageChecker: (can) => can("org.location_type.create") || can("org.location_type.update"),
  },

  workLocationMappings: {
    title: "Work-Location Mappings",
    description: "Effective-dated mappings of employees, units, or positions to locations.",
    icon: ArrowRightLeft,
    api: {
      list: organizationApi.orgLocationMappings,
      create: organizationApi.createOrgLocationMapping,
      update: null,
      remove: organizationApi.deleteOrgLocationMapping,
      setStatus: null,
      // Same adapter as above — legalEntityProfileCompanies also takes
      // (accessToken, tokenType) with no leading filters param.
      fetchCompanies: (_filters, accessToken, tokenType) => organizationApi.legalEntityProfileCompanies(accessToken, tokenType),
    },
    columns: [
      { key: "locationName", header: "Location" },
      { key: "unitName", header: "Org Unit" },
      { key: "positionName", header: "Position" },
      { key: "userName", header: "Employee" },
      { key: "mappingType", header: "Type", render: renderMappingType },
      { key: "effectiveFrom", header: "Effective From" },
      { key: "effectiveTo", header: "Effective To" },
      { key: "isActive", header: "Status", render: renderIsActive },
    ],
    formFields: [
      { name: "organizationLocationId", label: "Location *", required: true, type: "select", options: "companies", transform: companyIdTransform },
      { name: "organizationUnitId", label: "Org Unit", type: "select", options: "companies", transform: companyIdTransform },
      { name: "positionId", label: "Position", type: "select", options: "companies", transform: companyIdTransform },
      { name: "userId", label: "Employee", type: "select", options: "companies", transform: companyIdTransform },
      { name: "mappingType", label: "Mapping Type", type: "select", options: MAPPING_TYPES },
      { name: "effectiveFrom", label: "Effective From *", required: true, type: "date" },
      { name: "effectiveTo", label: "Effective To", type: "date" },
      { name: "isActive", label: "Active", type: "checkbox" },
    ],
    filters: { searchPlaceholder: "location, unit, or employee" },
    permissions: { create: "org.work_location.create", update: "org.work_location.update", status: null, delete: "org.work_location.delete" },
    statusFilters: [
      { value: "ALL", label: "All" },
      { value: "true", label: "Active" },
      { value: "false", label: "Inactive" },
    ],
    initialFormState: { isActive: true, mappingType: "default" },
    formStateToPayload: (state) => ({
      organizationLocationId: Number(state.organizationLocationId),
      organizationUnitId: state.organizationUnitId,
      positionId: state.positionId,
      userId: state.userId,
      mappingType: state.mappingType,
      effectiveFrom: state.effectiveFrom,
      effectiveTo: state.effectiveTo,
      isActive: state.isActive,
    }),
    canManageChecker: (can) => can("org.work_location.create") || can("org.work_location.update"),
  },

  financialOrganizations: {
    title: "Financial Organizations",
    description: "Cost centers, profit centers, budget centers, payroll areas, and expense units.",
    icon: Coins,
    api: {
      list: organizationApi.financialOrganizations,
      create: organizationApi.createFinancialOrganization,
      update: organizationApi.updateFinancialOrganization,
      remove: organizationApi.deleteFinancialOrganization,
      setStatus: organizationApi.setFinancialOrganizationStatus,
      // Same adapter as above — legalEntityProfileCompanies also takes
      // (accessToken, tokenType) with no leading filters param.
      fetchCompanies: (_filters, accessToken, tokenType) => organizationApi.legalEntityProfileCompanies(accessToken, tokenType),
      fetchOptions: organizationApi.financialOrgOptions,
    },
    columns: [
      { key: "code", header: "Code", className: "font-mono text-xs" },
      { key: "name", header: "Name" },
      { key: "type", header: "Type", render: renderType },
      { key: "parentName", header: "Parent" },
      { key: "companyName", header: "Company" },
      { key: "managerName", header: "Manager" },
      { key: "status", header: "Status", render: renderStatus },
    ],
    formFields: [
      { name: "enterpriseId", label: "Enterprise", type: "select", options: "companies", transform: companyIdTransform },
      { name: "companyId", label: "Company *", required: true, type: "select", options: "companies", transform: companyIdTransform },
      { name: "parentId", label: "Parent", type: "select", options: "tree", transform: parentIdTransform },
      { name: "code", label: "Code", maxLength: 60 },
      { name: "name", label: "Name *", required: true, maxLength: 190 },
      { name: "type", label: "Type", type: "select", options: FIN_TYPES },
      { name: "status", label: "Status", type: "select", options: FIN_STATUSES },
      { name: "description", label: "Description", type: "textarea", rows: 2, maxLength: 2000 },
      { name: "managerUserId", label: "Manager", type: "select", options: "companies", transform: companyIdTransform },
      { name: "legacyCostCenterId", label: "Legacy Cost Center ID", type: "number" },
      { name: "effectiveFrom", label: "Effective From", type: "date" },
      { name: "effectiveTo", label: "Effective To", type: "date" },
    ],
    filters: { searchPlaceholder: "name, code, or type" },
    permissions: { create: "org.financial.create", update: "org.financial.update", status: "org.financial.status", delete: "org.financial.delete" },
    statusFilters: FIN_STATUSES,
    initialFormState: { status: "active", type: "cost_center" },
    formStateToPayload: (state) => ({
      enterpriseId: state.enterpriseId,
      companyId: Number(state.companyId),
      parentId: state.parentId,
      code: state.code,
      name: state.name,
      type: state.type,
      status: state.status,
      description: state.description,
      managerUserId: state.managerUserId,
      legacyCostCenterId: state.legacyCostCenterId,
      effectiveFrom: state.effectiveFrom,
      effectiveTo: state.effectiveTo,
    }),
  },

  glMappings: {
    title: "GL Mappings",
    description: "General Ledger account mappings for financial organizations.",
    icon: FileText,
    api: {
      list: (params, token, tokenType) => organizationApi.financialOrgGlMappings(params.orgId, params, token, tokenType),
      create: (payload, token, tokenType) => organizationApi.createFinancialOrgGlMapping(payload.orgId, payload, token, tokenType),
      update: (id, payload, token, tokenType) => organizationApi.updateFinancialOrgGlMapping(payload.orgId, id, payload, token, tokenType),
      remove: (id, token, tokenType, item) => organizationApi.deleteFinancialOrgGlMapping(item?.financialOrganizationId || item?.orgId, id, token, tokenType),
      setStatus: null,
      fetchCompanies: null,
    },
    columns: [
      { key: "glAccountCode", header: "GL Account Code", className: "font-mono text-xs" },
      { key: "glAccountName", header: "GL Account Name" },
      { key: "mappingType", header: "Type", render: renderMappingType },
      { key: "isActive", header: "Status", render: renderIsActive },
      { key: "effectiveFrom", header: "Effective From" },
      { key: "effectiveTo", header: "Effective To" },
    ],
    formFields: [
      { name: "glAccountCode", label: "GL Account Code *", required: true, maxLength: 60 },
      { name: "glAccountName", label: "GL Account Name", maxLength: 190 },
      { name: "mappingType", label: "Mapping Type", type: "select", options: GL_MAPPING_TYPES },
      { name: "isActive", label: "Active", type: "checkbox" },
      { name: "effectiveFrom", label: "Effective From", type: "date" },
      { name: "effectiveTo", label: "Effective To", type: "date" },
    ],
    filters: { searchPlaceholder: "GL account code or name" },
    permissions: { create: "org.financial_gl.create", update: "org.financial_gl.update", status: null, delete: "org.financial_gl.delete" },
    initialFormState: { isActive: true, mappingType: "primary" },
    formStateToPayload: (state) => ({
      glAccountCode: state.glAccountCode,
      glAccountName: state.glAccountName,
      mappingType: state.mappingType,
      isActive: state.isActive,
      effectiveFrom: state.effectiveFrom,
      effectiveTo: state.effectiveTo,
    }),
    canManageChecker: (can) => can("org.financial_gl.create") || can("org.financial_gl.update"),
  },

  allocationRules: {
    title: "Allocation Rules",
    description: "Financial allocation rules with percentage-based distribution.",
    icon: BarChart2,
    api: {
      list: organizationApi.financialAllocationRules,
      create: organizationApi.createFinancialAllocationRule,
      update: organizationApi.updateFinancialAllocationRule,
      remove: organizationApi.deleteFinancialAllocationRule,
      setStatus: null,
      // Same adapter as above — legalEntityProfileCompanies also takes
      // (accessToken, tokenType) with no leading filters param.
      fetchCompanies: (_filters, accessToken, tokenType) => organizationApi.legalEntityProfileCompanies(accessToken, tokenType),
    },
    columns: [
      { key: "code", header: "Code", className: "font-mono text-xs" },
      { key: "name", header: "Name" },
      { key: "sourceFinancialOrganizationName", header: "Source Org" },
      { key: "status", header: "Status", render: (i) => i.status },
      { key: "effectiveFrom", header: "Effective From" },
      { key: "effectiveTo", header: "Effective To" },
      { key: "isActive", header: "Active", render: (i) => i.isActive ? "Yes" : "No" },
    ],
    formFields: [
      { name: "enterpriseId", label: "Enterprise", type: "select", options: "companies", transform: companyIdTransform },
      { name: "companyId", label: "Company", type: "select", options: "companies", transform: companyIdTransform },
      { name: "sourceFinancialOrganizationId", label: "Source Financial Org *", required: true, type: "select", options: "companies", transform: companyIdTransform },
      { name: "code", label: "Code", maxLength: 60 },
      { name: "name", label: "Name *", required: true, maxLength: 190 },
      { name: "description", label: "Description", type: "textarea", rows: 2, maxLength: 2000 },
      { name: "status", label: "Status", type: "select", options: ALLOC_STATUSES },
      { name: "effectiveFrom", label: "Effective From", type: "date" },
      { name: "effectiveTo", label: "Effective To", type: "date" },
      { name: "isActive", label: "Active", type: "checkbox" },
    ],
    filters: { searchPlaceholder: "name, code, or source org" },
    permissions: { create: "org.financial_allocation.create", update: "org.financial_allocation.update", status: null, delete: "org.financial_allocation.delete" },
    statusFilters: ALLOC_STATUSES,
    initialFormState: { status: "draft", isActive: true },
    formStateToPayload: (state) => ({
      enterpriseId: state.enterpriseId,
      companyId: state.companyId,
      sourceFinancialOrganizationId: Number(state.sourceFinancialOrganizationId),
      code: state.code,
      name: state.name,
      description: state.description,
      status: state.status,
      effectiveFrom: state.effectiveFrom,
      effectiveTo: state.effectiveTo,
      isActive: state.isActive,
    }),
    canManageChecker: (can) => can("org.financial_allocation.create") || can("org.financial_allocation.update"),
  },

  allocationLines: {
    title: "Allocation Lines",
    description: "Percentage-based allocation lines for allocation rules.",
    icon: BarChart2,
    api: {
      list: (params, token, tokenType) => organizationApi.financialAllocationLines(params.ruleId, params, token, tokenType),
      create: (payload, token, tokenType) => organizationApi.createFinancialAllocationLine(payload.ruleId, payload, token, tokenType),
      update: (id, payload, token, tokenType) => organizationApi.updateFinancialAllocationLine(payload.ruleId, id, payload, token, tokenType),
      remove: (id, token, tokenType, item) => organizationApi.deleteFinancialAllocationLine(item?.financialAllocationRuleId || item?.ruleId, id, token, tokenType),
      setStatus: null,
      fetchCompanies: null,
    },
    columns: [
      { key: "targetFinancialOrganizationName", header: "Target Financial Org" },
      { key: "percentage", header: "Percentage %", render: (i) => `${i.percentage}%` },
      { key: "basis", header: "Basis" },
      { key: "isActive", header: "Active", render: (i) => i.isActive ? "Yes" : "No" },
    ],
    formFields: [
      { name: "targetFinancialOrganizationId", label: "Target Financial Org *", required: true, type: "select", options: "companies", transform: companyIdTransform },
      { name: "percentage", label: "Percentage *", required: true, type: "number", maxLength: 5 },
      { name: "basis", label: "Basis", maxLength: 100 },
      { name: "isActive", label: "Active", type: "checkbox" },
    ],
    filters: { searchPlaceholder: "target org or basis" },
    permissions: { create: "org.financial_allocation.create", update: "org.financial_allocation.update", status: null, delete: "org.financial_allocation.delete" },
    initialFormState: { isActive: true, percentage: 0 },
    formStateToPayload: (state) => ({
      targetFinancialOrganizationId: Number(state.targetFinancialOrganizationId),
      percentage: Number(state.percentage),
      basis: state.basis,
      isActive: state.isActive,
    }),
    canManageChecker: (can) => can("org.financial_allocation.create") || can("org.financial_allocation.update"),
  },

  hierarchies: {
    title: "Organization Hierarchies",
    description: "Hierarchy definitions with nodes and edges for org charts and reporting.",
    icon: GitBranch,
    api: {
      list: organizationApi.hierarchies,
      create: organizationApi.createHierarchy,
      update: organizationApi.updateHierarchy,
      remove: organizationApi.deleteHierarchy,
      setStatus: organizationApi.setHierarchyStatus,
      // Same adapter as above — legalEntityProfileCompanies also takes
      // (accessToken, tokenType) with no leading filters param.
      fetchCompanies: (_filters, accessToken, tokenType) => organizationApi.legalEntityProfileCompanies(accessToken, tokenType),
    },
    columns: [
      { key: "code", header: "Code", className: "font-mono text-xs" },
      { key: "name", header: "Name" },
      { key: "type", header: "Type", render: renderType },
      { key: "enterpriseName", header: "Enterprise" },
      { key: "companyName", header: "Company" },
      { key: "nodeCount", header: "Nodes", className: "text-right" },
      { key: "edgeCount", header: "Edges", className: "text-right" },
      { key: "status", header: "Status", render: renderStatus },
      { key: "isActive", header: "Active", render: renderActiveYesNo },
    ],
    formFields: [
      { name: "enterpriseId", label: "Enterprise", type: "select", options: "companies", transform: companyIdTransform },
      { name: "companyId", label: "Company *", required: true, type: "select", options: "companies", transform: companyIdTransform },
      { name: "code", label: "Code", maxLength: 60 },
      { name: "name", label: "Name *", required: true, maxLength: 190 },
      { name: "type", label: "Type", type: "select", options: HIERARCHY_TYPES },
      { name: "status", label: "Status", type: "select", options: HIERARCHY_STATUSES },
      { name: "description", label: "Description", type: "textarea", rows: 2, maxLength: 2000 },
      { name: "effectiveFrom", label: "Effective From", type: "date" },
      { name: "effectiveTo", label: "Effective To", type: "date" },
      { name: "isActive", label: "Active", type: "checkbox" },
    ],
    filters: { searchPlaceholder: "name, code, or type" },
    permissions: { create: "org.hierarchy.create", update: "org.hierarchy.update", status: "org.hierarchy.status", delete: "org.hierarchy.delete" },
    statusFilters: HIERARCHY_STATUSES,
    initialFormState: { status: "active", isActive: true, type: "organizational" },
    formStateToPayload: (state) => ({
      enterpriseId: state.enterpriseId,
      companyId: Number(state.companyId),
      code: state.code,
      name: state.name,
      type: state.type,
      status: state.status,
      description: state.description,
      effectiveFrom: state.effectiveFrom,
      effectiveTo: state.effectiveTo,
      isActive: state.isActive,
    }),
  },

  hierarchyNodes: {
    title: "Hierarchy Nodes",
    description: "Nodes within an organization hierarchy.",
    icon: GitBranch,
    api: {
      list: (params, token, tokenType) => organizationApi.hierarchyNodes(params.hierarchyId, params, token, tokenType),
      create: (payload, token, tokenType) => organizationApi.createHierarchyNode(payload.hierarchyId, payload, token, tokenType),
      update: (id, payload, token, tokenType) => organizationApi.updateHierarchyNode(payload.hierarchyId, id, payload, token, tokenType),
      remove: (id, token, tokenType, item) => organizationApi.deleteHierarchyNode(item?.hierarchyId, id, token, tokenType),
      setStatus: null,
      fetchCompanies: null,
    },
    columns: [
      { key: "code", header: "Code", className: "font-mono text-xs" },
      { key: "name", header: "Name" },
      { key: "nodeType", header: "Node Type", render: renderNodeType },
      { key: "nodeId", header: "Ref ID" },
      { key: "isActive", header: "Active", render: renderActiveYesNo },
    ],
    formFields: [
      { name: "nodeType", label: "Node Type *", required: true, type: "select", options: NODE_TYPES },
      { name: "nodeId", label: "Reference ID *", required: true, type: "number" },
      { name: "code", label: "Code", maxLength: 60 },
      { name: "name", label: "Name *", required: true, maxLength: 190 },
      { name: "metadata", label: "Metadata (JSON)", type: "textarea", rows: 2 },
      { name: "isActive", label: "Active", type: "checkbox" },
    ],
    filters: { searchPlaceholder: "name, code, or node type" },
    permissions: { create: "org.hierarchy_node.create", update: "org.hierarchy_node.update", status: null, delete: "org.hierarchy_node.delete" },
    initialFormState: { isActive: true, nodeType: "department" },
    formStateToPayload: (state) => ({
      nodeType: state.nodeType,
      nodeId: Number(state.nodeId),
      code: state.code,
      name: state.name,
      metadata: state.metadata ? JSON.parse(state.metadata) : undefined,
      isActive: state.isActive,
    }),
    canManageChecker: (can) => can("org.hierarchy_node.create") || can("org.hierarchy_node.update"),
  },

  hierarchyEdges: {
    title: "Hierarchy Edges",
    description: "Relationships between hierarchy nodes.",
    icon: GitBranch,
    api: {
      list: (params, token, tokenType) => organizationApi.hierarchyEdges(params.hierarchyId, params, token, tokenType),
      create: (payload, token, tokenType) => organizationApi.createHierarchyEdge(payload.hierarchyId, payload, token, tokenType),
      update: (id, payload, token, tokenType) => organizationApi.updateHierarchyEdge(payload.hierarchyId, id, payload, token, tokenType),
      remove: (id, token, tokenType, item) => organizationApi.deleteHierarchyEdge(item?.hierarchyId, id, token, tokenType),
      setStatus: null,
      fetchCompanies: null,
    },
    columns: [
      { key: "parentNodeId", header: "Parent Node ID" },
      { key: "childNodeId", header: "Child Node ID" },
      { key: "edgeType", header: "Edge Type", render: renderEdgeType },
      { key: "isActive", header: "Active", render: renderActiveYesNo },
      { key: "effectiveFrom", header: "Effective From" },
      { key: "effectiveTo", header: "Effective To" },
    ],
    formFields: [
      { name: "parentNodeId", label: "Parent Node ID *", required: true, type: "number" },
      { name: "childNodeId", label: "Child Node ID *", required: true, type: "number" },
      { name: "edgeType", label: "Edge Type", type: "select", options: EDGE_TYPES },
      { name: "isActive", label: "Active", type: "checkbox" },
      { name: "effectiveFrom", label: "Effective From", type: "date" },
      { name: "effectiveTo", label: "Effective To", type: "date" },
    ],
    filters: { searchPlaceholder: "parent or child node ID" },
    permissions: { create: "org.hierarchy_edge.create", update: "org.hierarchy_edge.update", status: null, delete: "org.hierarchy_edge.delete" },
    initialFormState: { isActive: true, edgeType: "parent_child" },
    formStateToPayload: (state) => ({
      parentNodeId: Number(state.parentNodeId),
      childNodeId: Number(state.childNodeId),
      edgeType: state.edgeType,
      isActive: state.isActive,
      effectiveFrom: state.effectiveFrom,
      effectiveTo: state.effectiveTo,
    }),
    canManageChecker: (can) => can("org.hierarchy_edge.create") || can("org.hierarchy_edge.update"),
  },
};

export default resourceConfigs;