const express = require("express");

const router = express.Router();

const planController = require("../controllers/plan.controller");

const {
  cache,
  clearCache,
} = require("../middleware/cache.middleware");

// Clear plan cache after successful changes
const invalidatePlanCache = (req, res, next) => {
  res.on("finish", async () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      await clearCache("cache:/api/plans*");
    }
  });

  next();
};

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