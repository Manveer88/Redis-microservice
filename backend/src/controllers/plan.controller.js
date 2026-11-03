const planService = require("../services/plan.service");

// GET /api/plans
const getAllPlans = async (req, res, next) => {
  try {
    const plans = await planService.getAllPlans();

    res.status(200).json({
      success: true,
      data: plans,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/plans/:id
const getPlanById = async (req, res, next) => {
  try {
    const plan = await planService.getPlanById(req.params.id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    res.status(200).json({
      success: true,
      data: plan,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/plans
const createPlan = async (req, res, next) => {
  try {
    const {
      name,
      download_speed,
      upload_speed,
      data_limit_gb,
      validity_days,
      price,
    } = req.body;

    if (
      !name?.trim() ||
      !Number.isFinite(Number(download_speed)) ||
      Number(download_speed) <= 0 ||
      !Number.isFinite(Number(upload_speed)) ||
      Number(upload_speed) <= 0 ||
      !Number.isFinite(Number(data_limit_gb)) ||
      Number(data_limit_gb) < 0 ||
      !Number.isInteger(Number(validity_days)) ||
      Number(validity_days) <= 0 ||
      !Number.isFinite(Number(price)) ||
      Number(price) < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid plan details",
      });
    }

    const plan = await planService.createPlan({
      name: name.trim(),
      download_speed: Number(download_speed),
      upload_speed: Number(upload_speed),
      data_limit_gb: Number(data_limit_gb),
      validity_days: Number(validity_days),
      price: Number(price),
    });

    res.status(201).json({
      success: true,
      message: "Plan created successfully",
      data: plan,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/plans/:id
const updatePlan = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan ID",
      });
    }

    const existingPlan = await planService.getPlanById(id);

    if (!existingPlan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    const {
      name,
      download_speed,
      upload_speed,
      data_limit_gb,
      validity_days,
      price,
    } = req.body;

    if (
      !name?.trim() ||
      !Number.isFinite(Number(download_speed)) ||
      Number(download_speed) <= 0 ||
      !Number.isFinite(Number(upload_speed)) ||
      Number(upload_speed) <= 0 ||
      !Number.isFinite(Number(data_limit_gb)) ||
      Number(data_limit_gb) < 0 ||
      !Number.isInteger(Number(validity_days)) ||
      Number(validity_days) <= 0 ||
      !Number.isFinite(Number(price)) ||
      Number(price) < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid plan details",
      });
    }

    const plan = await planService.updatePlan(id, {
      name: name.trim(),
      download_speed: Number(download_speed),
      upload_speed: Number(upload_speed),
      data_limit_gb: Number(data_limit_gb),
      validity_days: Number(validity_days),
      price: Number(price),
    });

    res.status(200).json({
      success: true,
      message: "Plan updated successfully",
      data: plan,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/plans/:id/status
const updatePlanStatus = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan ID",
      });
    }

    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be active or inactive",
      });
    }

    const existingPlan = await planService.getPlanById(id);

    if (!existingPlan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    const plan = await planService.updatePlanStatus(id, status);

    res.status(200).json({
      success: true,
      message: "Plan status updated successfully",
      data: plan,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/plans/:id
const deletePlan = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan ID",
      });
    }

    const existingPlan = await planService.getPlanById(id);

    if (!existingPlan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    if (await planService.isPlanInUse(id)) {
      return res.status(409).json({
        success: false,
        message: "Plan is used by subscribers or subscriptions. Deactivate it instead.",
      });
    }

    const deleted = await planService.deletePlan(id);

    if (!deleted) {
      return res.status(409).json({
        success: false,
        message: "Unable to delete plan",
      });
    }

    res.status(200).json({
      success: true,
      message: "Plan deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllPlans,
  getPlanById,
  createPlan,
  updatePlan,
  updatePlanStatus,
  deletePlan,
};