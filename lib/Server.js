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

  async start() {
    const app = await this.inboundServer.start();
    const server = killable(http.createServer(app.callback()));
    await this.outboundServer.start(server);
    const stopServer = async () => {
      await this.outboundServer.stop();
      await this.inboundServer.stop();
      return new Promise((resolve) => server.kill(() => {
        debug("Server stopped");
        resolve();
      }));
    };
    return new Promise((resolve) => server.listen(this.config.port, () => {
      debug("Server started");
      resolve(stopServer);
    }));
  }

};
