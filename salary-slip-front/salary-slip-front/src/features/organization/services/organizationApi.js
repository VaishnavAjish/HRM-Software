import { apiRequest } from "../../../utils/api";

function headers(accessToken, tokenType = "Bearer") {
  return accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {};
}

function query(params = {}) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "" && value !== "ALL") {
      if (Array.isArray(value)) {
        value.forEach((item) => search.append(key, item));
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
};

export default organizationApi;