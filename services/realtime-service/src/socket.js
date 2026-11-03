const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { config, duplicateRedis, startConsumer, LIVE_CHANNEL } = require("@isp/shared");
const { authenticateToken, sessionsAlive, parseLiveMessage } = require("./service");

const SESSION_CHECK_MS = 60 * 1000;

const onStart = async ({ server, logger }) => {
  const io = new Server(server, {
    cors: { origin: config.frontendUrl, credentials: true },
  });

  const pubClient = await duplicateRedis(logger, "socket-pub");
  const subClient = await duplicateRedis(logger, "socket-sub");
  io.adapter(createAdapter(pubClient, subClient));

  io.use(async (socket, next) => {
    try {
      const user = await authenticateToken(socket.handshake.auth && socket.handshake.auth.token);
      if (!user) return next(new Error("unauthorized"));
      socket.data.user = user;
      next();
    } catch (error) {
      logger.error("Socket authentication failed", { error });
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const { user } = socket.data;
    socket.join("admins");
    socket.join(`role:${user.role}`);
  });

  const sessionTimer = setInterval(async () => {
    try {
      const sockets = [...io.of("/").sockets.values()];
      const alive = await sessionsAlive(sockets.map((socket) => socket.data.user.sid));
      sockets.forEach((socket, index) => {
        if (!alive[index]) {
          socket.emit("session_revoked");
          socket.disconnect(true);
        }
      });
    } catch (error) {
      logger.error("Socket session check failed", { error });
    }
  }, SESSION_CHECK_MS);

  const stopConsumer = await startConsumer({
    group: "realtime",
    startId: "$",
    dedupe: false,
    logger,
    handlers: {
      "*": async (event) => {
        io.to("admins").emit("event", {
          id: event.id,
          type: event.type,
          payload: event.payload,
          occurredAt: event.occurredAt,
        });
      },
    },
  });

  const liveClient = await duplicateRedis(logger, "live-sub");
  await liveClient.subscribe(LIVE_CHANNEL, (message) => {
    const parsed = parseLiveMessage(message);
    if (parsed) io.local.to("admins").emit("live", parsed);
  });

  const closeSockets = () => {
    io.local.disconnectSockets(true);
    io.engine.close();
  };
  process.once("SIGINT", closeSockets);
  process.once("SIGTERM", closeSockets);

  return [
    async () => {
      clearInterval(sessionTimer);
    },
    stopConsumer,
    async () => {
      await liveClient.unsubscribe(LIVE_CHANNEL);
    },
    () =>
      new Promise((resolve) => {
        io.close(() => resolve());
      }),
  ];
};

module.exports = { onStart };
