const check = require("check-types");
const SocketIO = require("socket.io");

function getMatchingVersionOutbound(version) {
  return this.outbounds
    .filter((outbound) => version === outbound.version)
    [0];
}

function checkVersion(socket, next) {
  const version = socket.handshake.query.v;
  if (check.nonEmptyString(version)) {
    const outbound = getMatchingVersionOutbound.call(this, version);
    if (check.assigned(outbound)) {
      socket.outbound = outbound;
      next();
    } else {
      next(new Error(`Version '${version}' not supported`));
    }
  } else {
    next(new Error("Version not found in handshake request, expected query parameter 'v'"));
  }
}

const authenticate = (socket, timeout) => async function (token) {
  try {
    clearTimeout(timeout);
    let disconnected = false;
    socket.on("disconnect", () => {
      disconnected = true;
      this.middlewareServer.remove(socket);
    });
    socket.userId = await socket.outbound.getUserIdByToken(token);
    check.assert.assigned(socket.userId);
    await this.middlewareServer.register(socket);
    if (!disconnected) {
      socket.emit("welcome");
    }
  } catch (error) {
    socket.emit("alert", error);
    socket.disconnect();
  }
};

function onConnection(socket) {
  const timeout = setTimeout(() => {
    socket.emit("alert", "Authentication timeout reached");
    socket.disconnect();
  }, this.config.timeout);
  socket.on("authenticate", authenticate(socket, timeout).bind(this));
}

module.exports = class OutboundServer {

  constructor(outbounds, config, middlewareServer) {
    this.outbounds = outbounds;
    this.config = config;
    this.middlewareServer = middlewareServer;
    Object.seal(this);
  }

  configure(server) {
    return new SocketIO(server)
      .use(checkVersion.bind(this))
      .on("connection", onConnection.bind(this));
  }

};
