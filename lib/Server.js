const http = require("http");
const killable = require("killable");

const InboundServer = require("./InboundServer");
const MiddlewareServer = require("./MiddlewareServer");
const OutboundServer = require("./OutboundServer");

module.exports = class Server {

  constructor(bow) {
    this.config = bow.config;
    const middlewareServer = new MiddlewareServer(bow.middleware, bow.config.middleware);
    this.inboundServer = new InboundServer(bow.inbounds, bow.config.inbound, middlewareServer);
    this.outboundServer = new OutboundServer(bow.outbounds, bow.config.outbound, middlewareServer);
    Object.seal(this);
  }

  start() {
    const app = this.inboundServer.configure();
    const server = killable(http.createServer(app.callback()));
    this.outboundServer.configure(server);
    return new Promise((serverStarted) => {
      server.listen(this.config.port, () => {
        serverStarted(() => new Promise((serverStopped) => {
          server.kill(serverStopped);
        }));
      });
    });
  }

};
