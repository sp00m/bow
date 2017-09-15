const Router = require("koa-router");
const auth = require("http-auth");
const bodyParser = require("koa-bodyparser");
const createError = require("http-errors");
const Koa = require("koa");

module.exports = class InboundServer {

  constructor(inbounds, config, middlewareServer) {
    this.inbounds = inbounds;
    this.config = config;
    this.middlewareServer = middlewareServer;
    Object.seal(this);
  }

  configure() {
    const basicAuth = auth.basic({
      realm: this.config.realm
    }, (username, password, callback) => {
      if (username === this.config.username && password === this.config.password) {
        callback(true);
      } else {
        callback(createError(403)); // eslint-disable-line no-magic-numbers
      }
    });
    const router = new Router();
    this.inbounds.forEach((inbound) => {
      router.post(inbound.path, async (context) => {
        try {
          const { name, payload, audience } = await inbound.getMessageFromPayload(context.request.body);
          this.middlewareServer.forward(name, payload, audience);
          context.response.status = 204;
        } catch (error) {
          context.throw(422, error); // eslint-disable-line no-magic-numbers
        }
      });
    });
    return new Koa()
      .use(auth.koa(basicAuth))
      .use(bodyParser())
      .use(router.routes())
      .use(router.allowedMethods());
  }

};
