import api, { unwrap } from "./api";

export const getPlans = async (params = {}) => {
  const response = await api.get("/plans", { params: { page: 1, limit: 100, ...params } });
  return unwrap(response);
};

export const getActivePlans = async () => {
  const response = await getPlans({ status: "active", limit: 100 });
  return response.data || [];
};

export const createPlan = async (data) => {
  const response = await api.post("/plans", data);
  return response.data.data;
};

export const updatePlan = async (id, data) => {
  const response = await api.put(`/plans/${id}`, data);
  return response.data.data;
};

export const updatePlanStatus = async (id, status) => {
  const response = await api.patch(`/plans/${id}/status`, {
    status,
  });
  return response.data.data;
};

export const deletePlan = async (id) => {
  const response = await api.delete(`/plans/${id}`);
  return response.data;
};
