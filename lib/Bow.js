const check = require("check-types");
const debug = require("debug")("bow:Bow");

const assert = require("./utils/assert");
const cleanVersion = require("./utils/cleanVersion");
const Server = require("./Server");

const validateConfig = (config) => {
  assert.object(config, "config");
  assert.integer(config.port, "config.port");
  if (check.assigned(config.https)) {
    assert.object(config.https, "config.https");
  } else {
    debug("WARNING: no HTTPS config has been provided, your Bow server will run on HTTP");
  }
  assert.object(config.inbound, "config.inbound");
  assert.nonEmptyString(config.inbound.realm, "config.inbound.realm");
  assert.nonEmptyString(config.inbound.username, "config.inbound.username");
  assert.nonEmptyString(config.inbound.password, "config.inbound.password");
  if (check.assigned(config.inbound.redis)) {
    assert.object(config.inbound.redis, "config.inbound.redis");
  } else {
    debug("WARNING: no Redis config has been provided, your Bow server will be inconsistent if deployed on a clustered environment");
  }
  assert.object(config.outbound, "config.outbound");
  assert.integer(config.outbound.timeout, "config.outbound.timeout");
};

const findDuplicates = (array) => {
  const counts = new Map();
  array.forEach((element) => {
    const count = counts.get(element);
    counts.set(element, (check.assigned(count) ? count : 0) + 1);
  });
  return Array.from(counts.keys())
    .filter((count) => 1 < counts.get(count));
};

function validateState() {
  const inboundDuplicatedPaths = findDuplicates(this.inbounds.map((inbound) => inbound.path));
  if (0 < inboundDuplicatedPaths.length) {
    throw new Error(`Inbounds have duplicated paths: '${inboundDuplicatedPaths.join("', '")}'`);
  }
  const outboundDuplicatedVersions = findDuplicates(this.outbounds.map((outbound) => outbound.version));
  if (0 < outboundDuplicatedVersions.length) {
    throw new Error(`Outbounds have duplicated versions: '${outboundDuplicatedVersions.join("', '")}'`);
  }
  const middlewareVersions = this.middlewares.map((middleware) => middleware.version);
  const inboundMiddlewareVersions = this.inbounds.map((inbound) => inbound.middlewareVersion);
  const outboundMiddlewareVersions = this.outbounds.map((outbound) => outbound.middlewareVersion);
  const unexistingInboundMiddlewareVersions = inboundMiddlewareVersions.filter((inboundMiddlewareVersion) =>
    middlewareVersions.indexOf(inboundMiddlewareVersion) < 0);
  if (0 < unexistingInboundMiddlewareVersions.length) {
    throw new Error(`Inbounds have middleware versions that don't exist: '${unexistingInboundMiddlewareVersions.join("', '")}'`);
  }
  const unexistingOutboundMiddlewareVersions = outboundMiddlewareVersions.filter((outboundMiddlewareVersion) =>
    middlewareVersions.indexOf(outboundMiddlewareVersion) < 0);
  if (0 < unexistingOutboundMiddlewareVersions.length) {
    throw new Error(`Inbounds have middleware versions that don't exist: '${unexistingOutboundMiddlewareVersions.join("', '")}'`);
  }
}

module.exports = class Bow {

  constructor(config) {
    validateConfig(config);
    this.config = config;
    this.middlewares = [];
    this.inbounds = [];
    this.outbounds = [];
    Object.seal(this);
  }

  middleware(version, fetchUserById, predicates) {
    const cleanedVersion = cleanVersion(version);
    assert.nonEmptyString(cleanedVersion, "middleware's version");
    assert.function(fetchUserById, "middleware's fetchUserById");
    assert.object(predicates, "middleware's predicates");
    this.middlewares.push({ version: cleanedVersion, fetchUserById, predicates });
    return this;
  }

  inbound(path, getMessageFromBody, middlewareVersion) {
    const cleanedMiddlewareVersion = cleanVersion(middlewareVersion);
    assert.nonEmptyString(path, "inbound's path");
    assert.function(getMessageFromBody, "inbound's getMessageFromBody");
    assert.nonEmptyString(cleanedMiddlewareVersion, "inbound's middlewareVersion");
    this.inbounds.push({ path, getMessageFromBody, middlewareVersion: cleanedMiddlewareVersion });
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

  async start() {
    validateState.call(this);
    return new Server(this).start();
  }

};
