const debug = require("debug")("bow:Server");
const http = require("http");
const killable = require("killable");

const InboundServer = require("./InboundServer");
const MiddlewareServer = require("./MiddlewareServer");
const OutboundServer = require("./OutboundServer");

module.exports = class Server {

  constructor(bow) {
    this.config = bow.config;
    const middlewareServer = new MiddlewareServer(bow.middlewares, bow.config.middleware);
    this.inboundServer = new InboundServer(bow.inbounds, bow.config.inbound, middlewareServer);
    this.outboundServer = new OutboundServer(bow.outbounds, bow.config.outbound, middlewareServer);
    Object.seal(this);
  }

  start() {
    const app = this.inboundServer.configure();
    const server = killable(http.createServer(app.callback()));
    this.outboundServer.configure(server);
    const stopServer = () => new Promise((resolve) => server.kill(() => {
      debug("Server stopped");
      resolve();
    }));
    return new Promise((resolve) => server.listen(this.config.port, () => {
      debug("Server started");
      resolve(stopServer);
    }));
  }

};
