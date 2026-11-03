const express = require("express");

const router = express.Router();

const planController = require("../controllers/plan.controller");

const {
  cache,
  invalidateCache,
} = require("../middleware/cache.middleware");

// Clear plan cache and caches that include plan details
const invalidatePlanCache = invalidateCache(
  "cache:/api/plans*",
  "cache:/api/subscribers*",
  "cache:/api/subscriptions*"
);

// GET all plans
router.get("/", cache(60), planController.getAllPlans);

// GET plan by ID
router.get("/:id", cache(60), planController.getPlanById);

// CREATE plan
router.post("/", invalidatePlanCache, planController.createPlan);

// UPDATE plan
router.put("/:id", invalidatePlanCache, planController.updatePlan);

// UPDATE plan status
router.patch(
  "/:id/status",
  invalidatePlanCache,
  planController.updatePlanStatus
);

// DELETE plan
router.delete("/:id", invalidatePlanCache, planController.deletePlan);

module.exports = router;