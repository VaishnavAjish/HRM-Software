import { apiRequest } from "../../../utils/api";

function headers(accessToken, tokenType = "Bearer") {
  return { Authorization: `${tokenType} ${accessToken}` };
}

export const permissionMatrixApi = {
  listRoles(token, tokenType) {
    return apiRequest("/v1/roles", { headers: headers(token, tokenType) });
  },

  getMatrix(roleId, token, tokenType) {
    return apiRequest(`/v1/roles/${roleId}/matrix`, { headers: headers(token, tokenType) });
  },

  saveMatrix(roleId, payload, token, tokenType) {
    return apiRequest(`/v1/roles/${roleId}/matrix`, {
      method: "PUT",
      headers: headers(token, tokenType),
      body: JSON.stringify(payload),
    });
  },

  cloneRole(roleId, payload, token, tokenType) {
    return apiRequest(`/v1/roles/${roleId}/clone`, {
      method: "POST",
      headers: headers(token, tokenType),
      body: JSON.stringify(payload),
    });
  },

  simulate(payload, token, tokenType) {
    return apiRequest("/v1/authorization/simulate", {
      method: "POST",
      headers: headers(token, tokenType),
      body: JSON.stringify(payload),
    });
  },

  getAudit(token, tokenType, limit = 8) {
    return apiRequest(`/v1/authorization/audit?limit=${limit}`, {
      headers: headers(token, tokenType),
    });
  },
};

export default permissionMatrixApi;
