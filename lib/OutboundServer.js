const SocketIO = require("socket.io");

function getMatchingVersionOutbound(version) {
  return this.outbounds
    .filter((outbound) => version === outbound.version)
    [0];
}

module.exports = class OutboundServer {

  constructor(outbounds, config, middlewareServer) {
    this.outbounds = outbounds;
    this.config = config;
    this.middlewareServer = middlewareServer;
  }

  configure(server) {
    return new SocketIO(server)
      .use((socket, next) => {
        const version = socket.handshake.query.v;
        if (!version) {
          next(new Error("Version not found in handshake request"));
        } else {
          const outbound = getMatchingVersionOutbound.call(this, version);
          if (!outbound) {
            next(new Error(`Version '${version}' not supported`));
          } else {
            socket.outbound = outbound;
            next();
          }
        }
      })
      .on("connection", (socket) => {

        const authTimeout = setTimeout(() => {
          socket.emit("alert", "Authentication timeout reached");
          socket.disconnect();
        }, this.config.timeout);

        socket.on("authenticate", (token) => {
          clearTimeout(authTimeout);
          let disconnected = false;
          socket.outbound.getUserIdByToken(token).then((userId) => {
            socket.userId = userId;
            socket.on("disconnect", () => {
              disconnected = true;
              this.middlewareServer.remove(socket);
            });
            return this.middlewareServer.register(socket);
          }).then(() => {
            if (disconnected) {
              this.middlewareServer.remove(socket);
            } else {
              socket.emit("welcome");
            }
          }).catch((error) => {
            socket.emit("alert", error);
            socket.disconnect();
          });
        });

      });
  }

};
