const check = require("check-types");

const assert = require("./assert");
const cleanVersion = require("./cleanVersion");
const Server = require("./Server");

const validateConfig = (config) => {
  assert.object(config, "config");
  assert.integer(config.port, "config.port");
  assert.object(config.inbound, "config.inbound");
  assert.nonEmptyString(config.inbound.realm, "config.inbound.realm");
  assert.nonEmptyString(config.inbound.username, "config.inbound.username");
  assert.nonEmptyString(config.inbound.password, "config.inbound.password");
  if (check.assigned(config.inbound.redis)) {
    assert.object(config.inbound.redis, "config.inbound.redis");
  }
  assert.object(config.outbound, "config.outbound");
  assert.integer(config.outbound.timeout, "config.outbound.timeout");
};

module.exports = class Bow {

  constructor(config) {
    validateConfig(config);
    this.config = config;
    this.inbounds = [];
    this.middlewares = [];
    this.outbounds = [];
    Object.seal(this);
  }

  inbound(path, getMessageFromBody, middlewareVersion) {
    const cleanedMiddlewareVersion = cleanVersion(middlewareVersion);
    assert.nonEmptyString(path, "inbound's path");
    assert.function(getMessageFromBody, "inbound's getMessageFromBody");
    assert.nonEmptyString(cleanedMiddlewareVersion, "inbound's middlewareVersion");
    this.inbounds.push({ path, getMessageFromBody, middlewareVersion: cleanedMiddlewareVersion });
    return this;
  }

  middleware(version, fetchUserById, predicates) {
    const cleanedVersion = cleanVersion(version);
    assert.nonEmptyString(cleanedVersion, "middleware's version");
    assert.function(fetchUserById, "middleware's fetchUserById");
    assert.object(predicates, "middleware's predicates");
    this.middlewares.push({ version: cleanedVersion, fetchUserById, predicates });
    return this;
  }

  outbound(version, getUserIdByToken, middlewareVersion) {
    const cleanedVersion = cleanVersion(version);
    const cleanedMiddlewareVersion = cleanVersion(middlewareVersion);
    assert.nonEmptyString(cleanedVersion, "outbound's version");
    assert.function(getUserIdByToken, "outbound's getUserIdByToken");
    assert.nonEmptyString(cleanedMiddlewareVersion, "outbound's middlewareVersion");
    this.outbounds.push({ version: cleanedVersion, getUserIdByToken, middlewareVersion: cleanedMiddlewareVersion });
    return this;
  }

  start() {
    return new Server(this).start();
  }

};
