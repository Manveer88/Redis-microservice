
const express = require("express");
const { cache, clearCache } = require("../middleware/cache.middleware");
const router = express.Router();

const invalidateSubscriberCache = async (req, res, next) => {
  res.on("finish", async () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      await clearCache("cache:/api/subscribers*");
    }
  });

  next();
};
const controller = require("../controllers/subscriber.controller");

router.get("/",invalidateSubscriberCache, controller.getSubscribers);
router.post("/",invalidateSubscriberCache, controller.createSubscriber,);

router.put("/:id", invalidateSubscriberCache, controller.updateSubscriber);
router.delete("/:id", invalidateSubscriberCache, controller.deleteSubscriber);

router.patch("/:id/status", invalidateSubscriberCache, controller.updateStatus);

module.exports = router;
