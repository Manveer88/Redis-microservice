
require("dotenv").config();

const app = require("./app");
const redisClient = require("./config/redis");

const PORT = process.env.PORT || 5001;

const startServer = async () => {
  try {
    await redisClient.connect();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
