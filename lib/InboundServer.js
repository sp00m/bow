const auth = require("http-auth");
const bodyParser = require("koa-bodyparser");
const createError = require("http-errors");
const Koa = require("koa");
const Router = require("koa-router");

const httpStatuses = require("./httpStatuses");

function buildBasicAuth() {
  return auth.basic({
    realm: this.config.realm
  }, (username, password, callback) => {
    if (username === this.config.username && password === this.config.password) {
      callback(true);
    } else {
      callback(createError(httpStatuses.forbidden));
    }
  });
}

function registerInbounds(router) {
  this.inbounds.forEach((inbound) => {
    router.post(inbound.path, async (context) => {
      try {
        const { name, payload, audience } = await inbound.getMessageFromBody(context.request.body);
        this.middlewareServer.forward(name, payload, audience);
        context.response.status = httpStatuses.noContent;
      } catch (error) {
        context.throw(httpStatuses.unprocessableEntity, error);
      }
    });
  });
}

module.exports = class InboundServer {

  constructor(inbounds, config, middlewareServer) {
    this.inbounds = inbounds;
    this.config = config;
    this.middlewareServer = middlewareServer;
    Object.seal(this);
  }

  configure() {
    const basicAuth = buildBasicAuth.call(this);
    const router = new Router();
    registerInbounds.call(this, router);
    return new Koa()
      .use(auth.koa(basicAuth))
      .use(bodyParser())
      .use(router.routes())
      .use(router.allowedMethods());
  }

};
