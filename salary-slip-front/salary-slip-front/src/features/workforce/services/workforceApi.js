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

function makeCrudApi(basePath, entityName) {
  return {
    list(params = {}, accessToken, tokenType = "Bearer") {
      return apiRequest(`/v1/admin/workforce${basePath}${query(params)}`, { headers: headers(accessToken, tokenType) });
    },

    create(payload, accessToken, tokenType = "Bearer") {
      return apiRequest(`/v1/admin/workforce${basePath}`, {
        method: "POST",
        headers: headers(accessToken, tokenType),
        body: JSON.stringify(payload),
      });
    },

    show(id, accessToken, tokenType = "Bearer") {
      return apiRequest(`/v1/admin/workforce${basePath}/${id}`, { headers: headers(accessToken, tokenType) });
    },

    update(id, payload, accessToken, tokenType = "Bearer") {
      return apiRequest(`/v1/admin/workforce${basePath}/${id}`, {
        method: "PUT",
        headers: headers(accessToken, tokenType),
        body: JSON.stringify(payload),
      });
    },

    delete(id, accessToken, tokenType = "Bearer") {
      return apiRequest(`/v1/admin/workforce${basePath}/${id}`, {
        method: "DELETE",
        headers: headers(accessToken, tokenType),
      });
    },
  };
}

export const jobFunctionApi = makeCrudApi("/job-functions", "Job Function");
export const jobCategoryApi = makeCrudApi("/job-categories", "Job Category");
export const jobLevelApi = makeCrudApi("/job-levels", "Job Level");
export const jobGradeApi = makeCrudApi("/job-grades", "Job Grade");
export const jobFamilyApi = makeCrudApi("/job-families", "Job Family");
export const designationApi = makeCrudApi("/designations", "Designation");
export const jobApi = makeCrudApi("/jobs", "Job");

export const jobDescriptionApi = {
  list(jobId, params = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/descriptions${query(params)}`, { headers: headers(accessToken, tokenType) });
  },

  create(jobId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/descriptions`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  show(jobId, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/descriptions/${id}`, { headers: headers(accessToken, tokenType) });
  },

  update(jobId, id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/descriptions/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  publish(jobId, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/descriptions/${id}/publish`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

  archive(jobId, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/descriptions/${id}/archive`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

  delete(jobId, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/descriptions/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },
};

export const jobResponsibilityApi = {
  list(jobId, params = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/responsibilities${query(params)}`, { headers: headers(accessToken, tokenType) });
  },

  create(jobId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/responsibilities`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  show(jobId, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/responsibilities/${id}`, { headers: headers(accessToken, tokenType) });
  },

  update(jobId, id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/responsibilities/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  delete(jobId, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/responsibilities/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },
};

export const jobRequirementApi = {
  list(jobId, params = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/requirements${query(params)}`, { headers: headers(accessToken, tokenType) });
  },

  create(jobId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/requirements`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  show(jobId, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/requirements/${id}`, { headers: headers(accessToken, tokenType) });
  },

  update(jobId, id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/requirements/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  delete(jobId, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/requirements/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },
};

export const jobEvaluationApi = {
  list(jobId, params = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/evaluations${query(params)}`, { headers: headers(accessToken, tokenType) });
  },

  create(jobId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/evaluations`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  show(jobId, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/evaluations/${id}`, { headers: headers(accessToken, tokenType) });
  },

  update(jobId, id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/evaluations/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  submit(jobId, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/evaluations/${id}/submit`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

  approve(jobId, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/evaluations/${id}/approve`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

  reject(jobId, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/evaluations/${id}/reject`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

  delete(jobId, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/evaluations/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },
};

export const jobClassificationApi = {
  show(jobId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/classification`, { headers: headers(accessToken, tokenType) });
  },

  create(jobId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/classification`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  update(jobId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/classification`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  delete(jobId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/workforce/jobs/${jobId}/classification`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },
};

export const workforceApi = {
  jobFunction: jobFunctionApi,
  jobCategory: jobCategoryApi,
  jobLevel: jobLevelApi,
  jobGrade: jobGradeApi,
  jobFamily: jobFamilyApi,
  designation: designationApi,
  job: jobApi,
  jobDescription: jobDescriptionApi,
  jobResponsibility: jobResponsibilityApi,
  jobRequirement: jobRequirementApi,
  jobEvaluation: jobEvaluationApi,
  jobClassification: jobClassificationApi,
};

export default workforceApi;