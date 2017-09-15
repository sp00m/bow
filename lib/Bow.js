const Server = require("./Server");

module.exports = class Bow {

  constructor(config) {
    this.config = config;
    this.inbounds = [];
    this.middleware = {};
    this.outbounds = [];
    Object.seal(this);
  }

  addInbound(path, getMessageFromBody) {
    this.inbounds.push({ path, getMessageFromBody });
    return this;
  }

  setMiddleware(fetchUserById, predicates) {
    this.middleware = { fetchUserById, predicates };
    return this;
  }

  addOutbound(version, getUserIdByToken) {
    this.outbounds.push({ version, getUserIdByToken });
    return this;
  }

  start() {
    return new Server(this).start();
  }

};
