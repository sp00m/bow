const check = require("check-types");
const clone = require("clone");
const debug = require("debug")("bow:Bow");
const deepFreeze = require("deep-freeze");

const assert = require("./utils/assert");
const normalizeVersion = require("./utils/normalizeVersion");
const Server = require("./Server");

const validateInboundConfig = (inboundConfig) => {
  assert.object(inboundConfig, "config.inbound");
  assert.nonEmptyString(inboundConfig.realm, "config.inbound.realm");
  assert.nonEmptyString(inboundConfig.username, "config.inbound.username");
  assert.nonEmptyString(inboundConfig.password, "config.inbound.password");
  if (check.assigned(inboundConfig.redis)) {
    assert.object(inboundConfig.redis, "config.inbound.redis");
  } else {
    debug("WARNING: no Redis config has been provided, your Bow server will be inconsistent if deployed on a clustered environment");
  }
};

const validateOutboundConfig = (outboundConfig) => {
  assert.object(outboundConfig, "config.outbound");
  assert.integer(outboundConfig.timeout, "config.outbound.timeout");
  assert.positive(outboundConfig.timeout, "config.outbound.timeout");
};

const validateConfig = (config) => {
  assert.object(config, "config");
  assert.integer(config.port, "config.port");
  assert.positive(config.port, "config.port");
  if (check.assigned(config.https)) {
    assert.object(config.https, "config.https");
  } else {
    debug("WARNING: no HTTPS config has been provided, your Bow server will run on HTTP");
  }
  validateInboundConfig(config.inbound);
  validateOutboundConfig(config.outbound);
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

function validateMiddlewareState(middlewareVersions, inboundMiddlewareVersions, outboundMiddlewareVersions) {
  if (0 === this.middlewares.length) {
    throw new Error("No middleware has been registered");
  }
  const unusedByInboundsMiddlewareVersions = middlewareVersions.filter((middlewareVersion) =>
    inboundMiddlewareVersions.indexOf(middlewareVersion) < 0);
  if (0 < unusedByInboundsMiddlewareVersions.length) {
    throw new Error(`Middlewares are unused by inbounds: '${unusedByInboundsMiddlewareVersions.join("', '")}'`);
  }
  const unusedByOutboundsMiddlewareVersions = middlewareVersions.filter((middlewareVersion) =>
    outboundMiddlewareVersions.indexOf(middlewareVersion) < 0);
  if (0 < unusedByOutboundsMiddlewareVersions.length) {
    throw new Error(`Middlewares are unused by outbounds: '${unusedByOutboundsMiddlewareVersions.join("', '")}'`);
  }
}

function validateInboundState(middlewareVersions, inboundMiddlewareVersions) {
  if (0 === this.inbounds.length) {
    throw new Error("No inbound has been registered");
  }
  const inboundDuplicatedPaths = findDuplicates(this.inbounds.map((inbound) => inbound.path));
  if (0 < inboundDuplicatedPaths.length) {
    throw new Error(`Inbounds have duplicated paths: '${inboundDuplicatedPaths.join("', '")}'`);
  }
  const unexistingInboundMiddlewareVersions = inboundMiddlewareVersions.filter((inboundMiddlewareVersion) =>
    middlewareVersions.indexOf(inboundMiddlewareVersion) < 0);
  if (0 < unexistingInboundMiddlewareVersions.length) {
    throw new Error(`Inbounds have middleware versions that don't exist: '${unexistingInboundMiddlewareVersions.join("', '")}'`);
  }
}

function validateOutboundState(middlewareVersions, outboundMiddlewareVersions) {
  if (0 === this.outbounds.length) {
    throw new Error("No outbound has been registered");
  }
  const outboundDuplicatedVersions = findDuplicates(this.outbounds.map((outbound) => outbound.version));
  if (0 < outboundDuplicatedVersions.length) {
    throw new Error(`Outbounds have duplicated versions: '${outboundDuplicatedVersions.join("', '")}'`);
  }
  const unexistingOutboundMiddlewareVersions = outboundMiddlewareVersions.filter((outboundMiddlewareVersion) =>
    middlewareVersions.indexOf(outboundMiddlewareVersion) < 0);
  if (0 < unexistingOutboundMiddlewareVersions.length) {
    throw new Error(`Inbounds have middleware versions that don't exist: '${unexistingOutboundMiddlewareVersions.join("', '")}'`);
  }
}

function validateState() {
  const middlewareVersions = this.middlewares.map((middleware) => middleware.version);
  const inboundMiddlewareVersions = this.inbounds.map((inbound) => inbound.middlewareVersion);
  const outboundMiddlewareVersions = this.outbounds.map((outbound) => outbound.middlewareVersion);
  validateMiddlewareState.call(this, middlewareVersions, inboundMiddlewareVersions, outboundMiddlewareVersions);
  validateInboundState.call(this, middlewareVersions, inboundMiddlewareVersions);
  validateOutboundState.call(this, middlewareVersions, outboundMiddlewareVersions);
}

module.exports = class Bow {

  constructor(config) {
    validateConfig(config);
    this.config = Object.freeze(clone(config));
    if (check.assigned(this.config.middleware)) {
      deepFreeze(this.config.middleware);
    }
    if (check.assigned(this.config.inbound)) {
      deepFreeze(this.config.inbound);
    }
    if (check.assigned(this.config.outbound)) {
      deepFreeze(this.config.outbound);
    }
    this.middlewares = [];
    this.inbounds = [];
    this.outbounds = [];
    Object.seal(this);
  }

  middleware(version, getUserById, predicates) {
    const cleanedVersion = normalizeVersion(version);
    assert.nonEmptyString(cleanedVersion, "middleware's version");
    assert.function(getUserById, "middleware's getUserById");
    assert.object(predicates, "middleware's predicates");
    this.middlewares.push(deepFreeze(clone({ version: cleanedVersion, getUserById, predicates })));
    return this;
  }

  inbound(path, getMessageFromBody, middlewareVersion) {
    const cleanedMiddlewareVersion = normalizeVersion(middlewareVersion);
    assert.nonEmptyString(path, "inbound's path");
    assert.function(getMessageFromBody, "inbound's getMessageFromBody");
    assert.nonEmptyString(cleanedMiddlewareVersion, "inbound's middlewareVersion");
    this.inbounds.push(deepFreeze(clone({ path, getMessageFromBody, middlewareVersion: cleanedMiddlewareVersion })));
    return this;
  }

  outbound(version, getUserIdByToken, middlewareVersion) {
    const cleanedVersion = normalizeVersion(version);
    const cleanedMiddlewareVersion = normalizeVersion(middlewareVersion);
    assert.nonEmptyString(cleanedVersion, "outbound's version");
    assert.function(getUserIdByToken, "outbound's getUserIdByToken");
    assert.nonEmptyString(cleanedMiddlewareVersion, "outbound's middlewareVersion");
    this.outbounds.push(deepFreeze(clone({ version: cleanedVersion, getUserIdByToken, middlewareVersion: cleanedMiddlewareVersion })));
    return this;
  }

  async start() {
    validateState.call(this);
    deepFreeze(this.middlewares);
    deepFreeze(this.inbounds);
    deepFreeze(this.outbounds);
    return new Server(this).start();
  }

};
