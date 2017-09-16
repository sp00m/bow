const check = require("check-types");

const cleanVersion = require("./cleanVersion");
const Server = require("./Server");

const validateConfig = (config) => {
  check.assert.object(config,
    `Expected config to be an object, but got '${config}' instead`);
  check.assert.integer(config.port,
    `Expected config.port to be an integer, but got '${config.port}' instead`);
  check.assert.object(config.inbound,
    `Expected config.inbound to be an object, but got '${config.inbound}' instead`);
  check.assert.nonEmptyString(config.inbound.realm,
    `Expected config.inbound.realm to be a non empty string, but got '${config.inbound.realm}' instead`);
  check.assert.nonEmptyString(config.inbound.username,
    `Expected config.inbound.username to be a non empty string, but got '${config.inbound.username}' instead`);
  check.assert.nonEmptyString(config.inbound.password,
    `Expected config.inbound.password to be a non empty string, but got '${config.inbound.password}' instead`);
  if (check.assigned(config.inbound.redis)) {
    check.assert.object(config.inbound.redis,
      `Expected config.inbound.redis to be an object, but got '${config.inbound.redis}' instead`);
  }
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
    const cleanedMiddlewareVersion = cleanVersion(middlewareVersion);
    check.assert.nonEmptyString(path,
      `Expected inbound's path to be a non empty string, but got '${path}' instead`);
    check.assert.function(getMessageFromBody,
      `Expected inbound's getMessageFromBody to be a function, but got '${getMessageFromBody}' instead`);
    check.assert.nonEmptyString(cleanedMiddlewareVersion,
      `Expected inbound's middlewareVersion to be a non empty string, but got '${middlewareVersion}' instead`);
    this.inbounds.push({ path, getMessageFromBody, middlewareVersion: cleanedMiddlewareVersion });
    return this;
  }

  middleware(version, fetchUserById, predicates) {
    const cleanedVersion = cleanVersion(version);
    check.assert.nonEmptyString(cleanedVersion,
      `Expected middleware's version to be a non empty string, but got '${version}' instead`);
    check.assert.function(fetchUserById,
      `Expected middleware's fetchUserById to be a function, but got '${fetchUserById}' instead`);
    check.assert.object(predicates,
      `Expected inbound's predicates to be an object, but got '${predicates}' instead`);
    this.middlewares.push({ version: cleanedVersion, fetchUserById, predicates });
    return this;
  }

  outbound(version, getUserIdByToken, middlewareVersion) {
    const cleanedVersion = cleanVersion(version);
    const cleanedMiddlewareVersion = cleanVersion(middlewareVersion);
    check.assert.nonEmptyString(cleanedVersion,
      `Expected outbound's version to be a non empty string, but got '${version}' instead`);
    check.assert.function(getUserIdByToken,
      `Expected outbound's getUserIdByToken to be a function, but got '${getUserIdByToken}' instead`);
    check.assert.nonEmptyString(cleanedMiddlewareVersion,
      `Expected outbound's middlewareVersion to be a non empty string, but got '${middlewareVersion}' instead`);
    this.outbounds.push({ version: cleanedVersion, getUserIdByToken, middlewareVersion: cleanedMiddlewareVersion });
    return this;
  }

  start() {
    return new Server(this).start();
  }

};
