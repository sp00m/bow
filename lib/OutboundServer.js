const check = require("check-types");
const clone = require("clone");
const debug = require("debug")("dbow:OutboundServer");
const log = require("debug")("bow:OutboundServer");
const deepFreeze = require("deep-freeze");
const SocketIO = require("socket.io");

const assert = require("./utils/assert");
const normalizeVersion = require("./utils/normalizeVersion");

const IN_MILLIS = 1000;

function checkVersion(socket, next) {
  const version = normalizeVersion(socket.handshake.query.v);
  if (check.nonEmptyString(version)) {
    if (this.outboundsByVersion.has(version)) {
      socket.outbound = this.outboundsByVersion.get(version);
      next();
    } else {
      next(new Error(`Version '${version}' not supported`));
    }
  } else {
    next(new Error("Version not found in handshake request, expected query parameter 'v'"));
  }
}

const authenticationFailed = (socket, error) => {
  const reason = error instanceof Error ? error.message : error;
  log("Listener authentication failed: %s", reason);
  socket.emit("alert", reason);
  socket.disconnect();
};

const authenticate = (socket, timeout) => async function (token, acknowledge) {
  try {
    debug("Authenticating listener...");
    assert.assigned(token, "token");
    assert.function(acknowledge, "authentication acknowledgement");
    clearTimeout(timeout);
    socket.once("disconnect", () => this.middlewareServer.remove(socket));
    const listenerDetails = await socket.outbound.createListenerDetailsFromToken(token);
    assert.object(listenerDetails, "listener details");
    assert.listenerId(listenerDetails.id);
    socket.listenerDetails = deepFreeze(clone(listenerDetails));
    await this.middlewareServer.register(socket);
    if (socket.connected) {
      acknowledge();
    }
  } catch (error) {
    authenticationFailed(socket, error);
  }
};

function onConnection(socket) {
  debug("New listener connected, waiting for authentication...");
  const timeout = setTimeout(() => {
    log("Connection timeout reached (%ds)", this.config.timeout);
    socket.emit("alert", "Authentication timeout reached");
    socket.disconnect();
  }, this.config.timeout * IN_MILLIS);
  socket
    .on("error", (error) => {
      const reason = error instanceof Error ? error.message : error;
      log("Listener received an error: %s", reason);
    })
    .once("authenticate", authenticate(socket, timeout).bind(this));
}

module.exports = class OutboundServer {

  constructor(outbounds, config, middlewareServer) {
    this.outboundsByVersion = new Map();
    outbounds.forEach((outbound) => this.outboundsByVersion.set(outbound.version, outbound));
    this.config = config;
    this.middlewareServer = middlewareServer;
    this.io = undefined;
    Object.seal(this);
  }

  start(server) {
    this.io = new SocketIO(server)
      .use(checkVersion.bind(this))
      .on("connection", onConnection.bind(this));
  }

  async stop() {
    await new Promise((resolve) => this.io.server.close(resolve));
  }

};
