const check = require("check-types");

const Server = require("./Server");

const validateConfig = (config) => {
  check.assert.object(config,
    `Expected config to be an object, but got '${config}' instead`);
  check.assert.integer(config.port,
    `Expected config.port to be an integer, but got '${config.port}' instead`);
  check.assert.object(config.inbound,
    `Expected config.inbound to be an object, but got '${config.inbound}' instead`);
  check.assert.nonEmptyString(config.inbound.realm,
    `Expected config.inbound.realm to be a non empty object, but got '${config.inbound.realm}' instead`);
  check.assert.nonEmptyString(config.inbound.username,
    `Expected config.inbound.username to be a non empty object, but got '${config.inbound.username}' instead`);
  check.assert.nonEmptyString(config.inbound.password,
    `Expected config.inbound.password to be a non empty object, but got '${config.inbound.password}' instead`);
  check.assert.object(config.outbound,
    `Expected config.outbound to be an object, but got '${config.outbound}' instead`);
  check.assert.integer(config.outbound.timeout,
    `Expected config.outbound.timeout to be an object, but got '${config.outbound.timeout}' instead`);
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
    check.assert.nonEmptyString(path,
      `Expected inbound's path to be a non empty string, but got '${path}' instead`);
    check.assert.function(getMessageFromBody,
      `Expected inbound's getMessageFromBody to be a function, but got '${getMessageFromBody}' instead`);
    check.assert.nonEmptyString(middlewareVersion,
      `Expected inbound's middlewareVersion to be a non empty string, but got '${middlewareVersion}' instead`);
    this.inbounds.push({ path, getMessageFromBody, middlewareVersion });
    return this;
  }

  middleware(version, fetchUserById, predicates) {
    check.assert.nonEmptyString(version,
      `Expected middleware's version to be a non empty string, but got '${version}' instead`);
    check.assert.function(fetchUserById,
      `Expected middleware's fetchUserById to be a function, but got '${fetchUserById}' instead`);
    check.assert.object(predicates,
      `Expected inbound's predicates to be an object, but got '${predicates}' instead`);
    this.middlewares.push({ version, fetchUserById, predicates });
    return this;
  }

  outbound(version, getUserIdByToken, middlewareVersion) {
    check.assert.nonEmptyString(version,
      `Expected outbound's version to be a non empty string, but got '${version}' instead`);
    check.assert.function(getUserIdByToken,
      `Expected outbound's getUserIdByToken to be a function, but got '${getUserIdByToken}' instead`);
    check.assert.nonEmptyString(middlewareVersion,
      `Expected outbound's middlewareVersion to be a non empty string, but got '${middlewareVersion}' instead`);
    this.outbounds.push({ version, getUserIdByToken, middlewareVersion });
    return this;
  }

  start() {
    return new Server(this).start();
  }

};
