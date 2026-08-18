import { apiRequest } from "../../../utils/api";

function headers(accessToken, tokenType = "Bearer") {
  if (!accessToken) return {};
  const formattedType = tokenType
    ? tokenType.charAt(0).toUpperCase() + tokenType.slice(1)
    : "Bearer";
  return { Authorization: `${formattedType} ${accessToken}` };
}

function query(params = {}) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "" && value !== "ALL") {
      if (Array.isArray(value)) {
        value.forEach((item) => search.append(key, item));
      } else if (typeof value === "boolean") {
        // Laravel's `boolean` validation rule strictly accepts
        // true|false|0|1|'0'|'1' — NOT the strings "true"/"false" that
        // String(value) would produce, which fail validation with a 422.
        search.set(key, value ? "1" : "0");
      } else {
        search.set(key, String(value));
      }
    }
  });

  const string = search.toString();
  return string ? `?${string}` : "";
}

export const organizationApi = {
  /* -------------------------------------------------------- enterprise master */

  enterpriseList(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/enterprise${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  updateEnterprise(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/enterprise/${id}`, {
      method: "PATCH",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  /* ----------------------------------------------------------- legal entities */

  legalEntities(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entities${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  

  createLegalEntity(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/legal-entities", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateLegalEntity(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entities/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  setLegalEntityStatus(id, isActive, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entities/${id}/status`, {
      method: "PATCH",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ isActive }),
    });
  },

  deleteLegalEntity(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entities/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* --------------------------------------------------------------- locations */

  locations(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/locations${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createLocation(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/locations", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateLocation(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/locations/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  setLocationStatus(id, isActive, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/locations/${id}/status`, {
      method: "PATCH",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ isActive }),
    });
  },

  deleteLocation(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/locations/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  locationMembers(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/locations/${id}/members`, { headers: headers(accessToken, tokenType) });
  },

  assignLocationMembers(id, userIds, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/locations/${id}/members`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ userIds }),
    });
  },

  removeLocationMember(id, userId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/locations/${id}/members/${userId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ---------------------------------------------------------------- calendars */

  calendars(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/calendars${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createCalendar(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/calendars", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateCalendar(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/calendars/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  setCalendarStatus(id, isActive, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/calendars/${id}/status`, {
      method: "PATCH",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ isActive }),
    });
  },

  deleteCalendar(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/calendars/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  calendarHolidays(id, year, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/calendars/${id}/holidays${query({ year })}`, { headers: headers(accessToken, tokenType) });
  },

  upsertHoliday(calendarId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/calendars/${calendarId}/holidays`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteHoliday(calendarId, holidayId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/calendars/${calendarId}/holidays/${holidayId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* -------------------------------------------------------- enterprises (V2 group structure) */

  enterprises(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/enterprises${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  enterpriseCompanies(accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/enterprises/companies", { headers: headers(accessToken, tokenType) });
  },

  getEnterprise(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/enterprises/${id}`, { headers: headers(accessToken, tokenType) });
  },

  enterpriseHistory(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/enterprises/${id}/history`, { headers: headers(accessToken, tokenType) });
  },

  createEnterprise(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/enterprises", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateEnterpriseRecord(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/enterprises/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  setEnterpriseStatus(id, status, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/enterprises/${id}/status`, {
      method: "PATCH",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ status }),
    });
  },

  deleteEnterprise(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/enterprises/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* -------------------------------------------------- legal entity profiles */

  legalEntityProfiles(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  legalEntityProfileCompanies(accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/legal-entity-profiles/companies", { headers: headers(accessToken, tokenType) });
  },

  createLegalEntityProfile(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/legal-entity-profiles", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  getLegalEntityProfile(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${id}`, { headers: headers(accessToken, tokenType) });
  },

  updateLegalEntityProfile(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  setLegalEntityProfileStatus(id, isActive, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${id}/status`, {
      method: "PATCH",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ isActive }),
    });
  },

  deleteLegalEntityProfile(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  legalEntityProfileDocuments(profileId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/documents`, { headers: headers(accessToken, tokenType) });
  },

  /* --------------------------- legal entity profile - registrations */

  legalEntityRegistrations(profileId, filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/registrations${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createLegalEntityRegistration(profileId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/registrations`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateLegalEntityRegistration(profileId, registrationId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/registrations/${registrationId}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteLegalEntityRegistration(profileId, registrationId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/registrations/${registrationId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ------------------------------- legal entity profile - addresses */

  legalEntityAddresses(profileId, filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/addresses${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createLegalEntityAddress(profileId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/addresses`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateLegalEntityAddress(profileId, addressId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/addresses/${addressId}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteLegalEntityAddress(profileId, addressId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/addresses/${addressId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* --------------------------- legal entity profile - representatives */

  legalEntityRepresentatives(profileId, filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/representatives${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createLegalEntityRepresentative(profileId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/representatives`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateLegalEntityRepresentative(profileId, representativeId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/representatives/${representativeId}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteLegalEntityRepresentative(profileId, representativeId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/representatives/${representativeId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ------------------------------ legal entity profile - bank accounts */

  legalEntityBankAccounts(profileId, filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/bank-accounts${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createLegalEntityBankAccount(profileId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/bank-accounts`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateLegalEntityBankAccount(profileId, accountId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/bank-accounts/${accountId}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteLegalEntityBankAccount(profileId, accountId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/legal-entity-profiles/${profileId}/bank-accounts/${accountId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ---------------------------------------------------- organization units */

  orgUnits(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  orgUnitOptions(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units/options${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  syncLegacyDepartments(accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/org-units/sync-legacy-departments", {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

  createOrgUnit(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/org-units", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  getOrgUnit(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units/${id}`, { headers: headers(accessToken, tokenType) });
  },

  updateOrgUnit(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  setOrgUnitStatus(id, status, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units/${id}/status`, {
      method: "PATCH",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ status }),
    });
  },

  deleteOrgUnit(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ----------------------------------------------------- org unit positions */

  orgUnitPositions(unitId, filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units/${unitId}/positions${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createOrgUnitPosition(unitId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units/${unitId}/positions`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateOrgUnitPosition(unitId, positionId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units/${unitId}/positions/${positionId}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  freezeOrgUnitPosition(unitId, positionId, reason, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units/${unitId}/positions/${positionId}/freeze`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ reason }),
    });
  },

  releaseOrgUnitPosition(unitId, positionId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units/${unitId}/positions/${positionId}/release`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

  headcountSummary(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units/headcount-summary${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  departmentBranchSummary(accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/org-units/department-branch-summary", { headers: headers(accessToken, tokenType) });
  },

  deleteOrgUnitPosition(unitId, positionId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units/${unitId}/positions/${positionId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ---------------------------------------------------- org unit assignments */

  orgUnitAssignments(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units/assignments${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createOrgUnitAssignment(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/org-units/assignments", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateOrgUnitAssignment(assignmentId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units/assignments/${assignmentId}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteOrgUnitAssignment(assignmentId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-units/assignments/${assignmentId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ---------------------------------------------------- organization locations (new) */

  orgLocations(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-locations${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  orgLocationOptions(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-locations/options${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createOrgLocation(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/org-locations", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  getOrgLocation(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-locations/${id}`, { headers: headers(accessToken, tokenType) });
  },

  updateOrgLocation(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-locations/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  setOrgLocationStatus(id, status, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-locations/${id}/status`, {
      method: "PATCH",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ status }),
    });
  },

  deleteOrgLocation(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-locations/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ---------------------------------------------------------- location types */

  orgLocationTypes(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-locations/types${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createOrgLocationType(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/org-locations/types", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  /* ------------------------------------------------------- work-location mappings */

  orgLocationMappings(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-locations/mappings${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createOrgLocationMapping(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/org-locations/mappings", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteOrgLocationMapping(mappingId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-locations/mappings/${mappingId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* -------------------------------------------------- financial organizations */

  financialOrganizations(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  financialOrgOptions(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/options${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createFinancialOrganization(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/financial-organizations", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  getFinancialOrganization(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/${id}`, { headers: headers(accessToken, tokenType) });
  },

  updateFinancialOrganization(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  setFinancialOrganizationStatus(id, status, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/${id}/status`, {
      method: "PATCH",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ status }),
    });
  },

  deleteFinancialOrganization(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ------------------------------------------------------------ GL mappings */

  financialOrgGlMappings(orgId, filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/${orgId}/gl-mappings${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createFinancialOrgGlMapping(orgId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/${orgId}/gl-mappings`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateFinancialOrgGlMapping(orgId, mappingId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/${orgId}/gl-mappings/${mappingId}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteFinancialOrgGlMapping(orgId, mappingId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/${orgId}/gl-mappings/${mappingId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* --------------------------------------------------------- allocation rules */

  financialAllocationRules(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/allocation-rules${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createFinancialAllocationRule(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/financial-organizations/allocation-rules", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateFinancialAllocationRule(ruleId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/allocation-rules/${ruleId}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteFinancialAllocationRule(ruleId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/allocation-rules/${ruleId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ---------------------------------------------------------- allocation lines */

  financialAllocationLines(ruleId, filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/allocation-rules/${ruleId}/lines${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createFinancialAllocationLine(ruleId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/allocation-rules/${ruleId}/lines`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateFinancialAllocationLine(ruleId, lineId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/allocation-rules/${ruleId}/lines/${lineId}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteFinancialAllocationLine(ruleId, lineId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/financial-organizations/allocation-rules/${ruleId}/lines/${lineId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* -------------------------------------------------------------- hierarchies */

  hierarchies(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/hierarchies${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createHierarchy(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/hierarchies", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  getHierarchy(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/hierarchies/${id}`, { headers: headers(accessToken, tokenType) });
  },

  updateHierarchy(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/hierarchies/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  setHierarchyStatus(id, status, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/hierarchies/${id}/status`, {
      method: "PATCH",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ status }),
    });
  },

  deleteHierarchy(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/hierarchies/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  validateHierarchy(hierarchyId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/hierarchies/${hierarchyId}/validate`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  /* ---------------------------------------------------------- hierarchy nodes */

  hierarchyNodes(hierarchyId, filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/hierarchies/${hierarchyId}/nodes${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createHierarchyNode(hierarchyId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/hierarchies/${hierarchyId}/nodes`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateHierarchyNode(hierarchyId, nodeId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/hierarchies/${hierarchyId}/nodes/${nodeId}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteHierarchyNode(hierarchyId, nodeId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/hierarchies/${hierarchyId}/nodes/${nodeId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ---------------------------------------------------------- hierarchy edges */

  hierarchyEdges(hierarchyId, filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/hierarchies/${hierarchyId}/edges${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createHierarchyEdge(hierarchyId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/hierarchies/${hierarchyId}/edges`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateHierarchyEdge(hierarchyId, edgeId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/hierarchies/${hierarchyId}/edges/${edgeId}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteHierarchyEdge(hierarchyId, edgeId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/hierarchies/${hierarchyId}/edges/${edgeId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ----------------------------------------------------------- reporting structure */

  reportingRelationships(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/reporting/relationships${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createReportingRelationship(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/reporting/relationships", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateReportingRelationship(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/reporting/relationships/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteReportingRelationship(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/reporting/relationships/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  reportingChain(employeeId, asOf = null, accessToken, tokenType = "Bearer") {
    const params = asOf ? { asOf } : {};
    return apiRequest(`/v1/admin/organization/reporting/chain/${employeeId}${query(params)}`, { headers: headers(accessToken, tokenType) });
  },

  /* --------------------------------------------------------- leadership assignments */

  leadershipAssignments(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/reporting/leadership-assignments${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createLeadershipAssignment(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/reporting/leadership-assignments", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateLeadershipAssignment(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/reporting/leadership-assignments/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteLeadershipAssignment(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/reporting/leadership-assignments/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ---------------------------------------------------------------- org chart */

  orgChart(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-chart${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  recentActivity(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/activity${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  /* ---------------------------------------------------------- org changes (change management) */

  orgChanges(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-changes${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createOrgChange(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/org-changes", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  createPromotionTransfer(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/org-changes/promotion-transfer", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  getOrgChange(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-changes/${id}`, { headers: headers(accessToken, tokenType) });
  },

  updateOrgChange(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-changes/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  submitOrgChange(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-changes/${id}/submit`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

  approveOrgChange(id, comments = null, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-changes/${id}/approve`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ comments }),
    });
  },

  rejectOrgChange(id, reason, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-changes/${id}/reject`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ reason }),
    });
  },

  cancelOrgChange(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-changes/${id}/cancel`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

  scheduleOrgChange(id, scheduledAt, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-changes/${id}/schedule`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ scheduledAt }),
    });
  },

  applyOrgChange(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-changes/${id}/apply`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

  deleteOrgChange(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-changes/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ----------------------------------------------------------- org change items */

  orgChangeItems(changeId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-changes/${changeId}/items`, { headers: headers(accessToken, tokenType) });
  },

  createOrgChangeItem(changeId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-changes/${changeId}/items`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteOrgChangeItem(changeId, itemId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-changes/${changeId}/items/${itemId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ---------------------------------------------------------- org change approvals */

  orgChangeApprovals(changeId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-changes/${changeId}/approvals`, { headers: headers(accessToken, tokenType) });
  },

  orgChangeImpact(changeId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/org-changes/${changeId}/impact`, { headers: headers(accessToken, tokenType) });
  },

  /* ------------------------------------------------------- calendar assignments */

  calendarAssignments(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/calendar-assignments${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createCalendarAssignment(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/organization/calendar-assignments", {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateCalendarAssignment(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/calendar-assignments/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  setCalendarAssignmentStatus(id, isActive, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/calendar-assignments/${id}/status`, {
      method: "PATCH",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ isActive }),
    });
  },

  deleteCalendarAssignment(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/calendar-assignments/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  resolveCalendarAssignment(payload = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/calendar-assignments/resolve${query(payload)}`, { headers: headers(accessToken, tokenType) });
  },

  previewCalendarAssignment(payload = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/organization/calendar-assignments/preview${query(payload)}`, { headers: headers(accessToken, tokenType) });
  },

};

export default organizationApi;