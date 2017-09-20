const check = require("check-types");
const debug = require("debug")("bow:Server");
const http = require("http");
const https = require("https");
const killable = require("killable");

const InboundServer = require("./InboundServer");
const MiddlewareServer = require("./MiddlewareServer");
const OutboundServer = require("./OutboundServer");
const PubSubBuilder = require("./PubSubBuilder");

module.exports = class Server {

  constructor(bow) {
    this.config = bow.config;
    const pubSubBuilder = new PubSubBuilder(bow.config.redis);
    this.middlewareServer = new MiddlewareServer(bow.middlewares);
    this.inboundServer = new InboundServer(bow.inbounds, bow.config.inbound, this.middlewareServer, pubSubBuilder);
    this.outboundServer = new OutboundServer(bow.outbounds, bow.config.outbound, this.middlewareServer);
    Object.seal(this);
  }

  async start() {
    await this.middlewareServer.start();
    const app = await this.inboundServer.start();
    const server = killable(
      check.assigned(this.config.https)
        ? https.createServer(this.config.https, app.callback())
        : http.createServer(app.callback())
    );
    await this.outboundServer.start(server);
    const stopServer = async () => {
      await this.outboundServer.stop();
      await this.inboundServer.stop();
      await this.middlewareServer.stop();
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
