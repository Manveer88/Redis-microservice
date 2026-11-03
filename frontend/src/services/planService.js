import api from "./api";

export const getPlans = async () => {
  const response = await api.get("/plans");
  return response.data.data;
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