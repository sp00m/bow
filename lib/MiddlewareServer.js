const check = require("check-types");
const debug = require("debug")("dbow:MiddlewareServer");
const log = require("debug")("bow:MiddlewareServer");
const deepEqual = require("deep-equal");
const deepFreeze = require("deep-freeze");
const uuid = require("uuid/v4");

const assert = require("./utils/assert");

const SECONDS_TO_MILLIS = 1000;
const MINUTES_TO_SECONDS = 60;
const DEFAULT_LOG_INTERVAL_IN_MINUTES = 5;

const DISCONNECT_MESSAGE_NAME = "__disconnect";

const cleanCriteria = (criteria) => Object
  .keys(criteria)
  .reduce((accumulated, criterionKey) => {
    const criterionValue = criteria[criterionKey];
    return {
      ...accumulated,
      [criterionKey]: check.array(criterionValue)
        ? [...new Set(criterionValue)]
        : criterionValue };
  }, {});

function scatterListener(listenerId) {
  const criteria = this.listenersById.get(listenerId).criteria;
  Object.keys(criteria).forEach((criterionKey) => {
    const criterionValue = criteria[criterionKey];
    const criterionValues = check.array(criterionValue) ? criterionValue : [criterionValue];
    if (!this.listenerIdsByCriterion.has(criterionKey)) {
      this.listenerIdsByCriterion.set(criterionKey, new Map());
    }
    const listenerIdsByCriterionValue = this.listenerIdsByCriterion.get(criterionKey);
    criterionValues.forEach((value) => {
      if (!listenerIdsByCriterionValue.has(value)) {
        listenerIdsByCriterionValue.set(value, new Set());
      }
      listenerIdsByCriterionValue.get(value).add(listenerId);
    });
  });
}

function clearScatteredListener(listenerId) {
  const criteria = this.listenersById.get(listenerId).criteria;
  Object.keys(criteria).forEach((criterionKey) => {
    const criterionValue = criteria[criterionKey];
    const criterionValues = check.array(criterionValue) ? criterionValue : [criterionValue];
    const listenerIdsByCriterionValue = this.listenerIdsByCriterion.get(criterionKey);
    criterionValues.forEach((value) => {
      const listenerIds = listenerIdsByCriterionValue.get(value);
      listenerIds.delete(listenerId);
      if (0 === listenerIds.size) {
        listenerIdsByCriterionValue.delete(value);
      }
    });
    if (0 === listenerIdsByCriterionValue.size) {
      this.listenerIdsByCriterion.delete(criterionKey);
    }
  });
}

function findListenerIdsByPredicate(predicateKey, predicateValue) {
  let listenerIds = new Set();
  if (this.listenerIdsByCriterion.has(predicateKey)) {
    const listenerIdsByCriterionValue = this.listenerIdsByCriterion.get(predicateKey);
    if (listenerIdsByCriterionValue.has(predicateValue)) {
      listenerIds = listenerIdsByCriterionValue.get(predicateValue);
    }
  }
  return listenerIds;
}

const createConjunctionForPredicate = (query) => function (queryListenerIds, predicateKey, i) {
  let listenerIds = queryListenerIds;
  if (0 === i || 0 < queryListenerIds.size) {
    const predicateListenerIds = findListenerIdsByPredicate.call(this, predicateKey, query[predicateKey]);
    listenerIds = 0 === i
      ? predicateListenerIds
      : new Set([...queryListenerIds].filter((listenerId) => predicateListenerIds.has(listenerId)));
  }
  return listenerIds;
};

function createDisjunctionForQuery(audienceListenerIds, query) {
  return new Set([
    ...audienceListenerIds,
    ...Object.keys(query).reduce(createConjunctionForPredicate(query).bind(this), new Set())
  ]);
}

function refreshListener(id, criteria) {
  const listenerExists = this.listenersById.has(id);
  if (listenerExists) {
    const existingListener = this.listenersById.get(id);
    if (!deepEqual(existingListener.criteria, criteria)) {
      clearScatteredListener.call(this, id);
      existingListener.criteria = criteria;
      scatterListener.call(this, id);
    }
  }
  return listenerExists;
}

async function connectToPubSub() {
  if (this.pubSubBuilder.isOperational()) {
    log("Connecting Middleware v%s/%s to PubSub...", this.version, this.uuid);
    this.pubSub = await this.pubSubBuilder.build(`BOW_LISTENER_${this.version}`);
    this.pubSub.onMessage(({ senderUuid, id, criteria }) => {
      if (senderUuid !== this.uuid) {
        refreshListener.call(this, id, criteria);
      }
    });
    this.shareListenerCriteria = (id, criteria) =>
      this.pubSub.pushMessage({ senderUuid: this.uuid, id, criteria });
  }
}

async function disconnectFromPubSub() {
  if (check.assigned(this.pubSub)) {
    log("Disconnecting Middleware v%s/%s from PubSub...", this.version, this.uuid);
    await this.pubSub.destroy();
  }
}

const emit = (name, payload) => (socket) => {
  if (DISCONNECT_MESSAGE_NAME === name) {
    socket.disconnect();
  } else {
    socket.emit(name, payload);
  }
};

class Middleware {

  constructor(middleware, config, pubSubBuilder) {
    this.uuid = uuid();
    this.version = middleware.version;
    this.createCriteriaFromListenerDetails = middleware.createCriteriaFromListenerDetails;
    this.config = config;
    this.pubSubBuilder = pubSubBuilder;
    this.pubSub = undefined;
    this.logInterval = undefined;
    this.listenersById = new Map();
    this.listenerIdsByCriterion = new Map();
    this.shareListenerCriteria = () => {}; // eslint-disable-line no-empty-function
    Object.seal(this);
  }

  async start() {
    log("Starting Middleware v%s/%s...", this.version, this.uuid);
    await connectToPubSub.call(this);
    if (check.positive(this.config.logInterval)) {
      this.logInterval = setInterval(() => {
        log("Middleware v%s/%s currently manages %s listener(s)", this.version, this.uuid, this.listenersById.size);
      }, this.config.logInterval * SECONDS_TO_MILLIS);
    }
  }

  async register(socket) {
    const criteria = await this.createCriteriaFromListenerDetails(socket.listenerDetails);
    assert.criteria(criteria);
    const identifiedCriteria = deepFreeze(cleanCriteria({ ...criteria, __id: socket.listenerDetails.id }));
    debug("Criteria created: %s", JSON.stringify(identifiedCriteria));
    if (socket.connected) {
      const listenerId = socket.listenerDetails.id;
      const listenerExists = refreshListener.call(this, listenerId, identifiedCriteria);
      if (!listenerExists) {
        this.listenersById.set(listenerId, { criteria: identifiedCriteria, sockets: new Set() });
        scatterListener.call(this, listenerId);
      }
      this.listenersById.get(listenerId).sockets.add(socket);
      this.shareListenerCriteria(listenerId, identifiedCriteria);
    }
  }

  remove(socket) {
    if (check.object(socket.listenerDetails)) {
      const listenerId = socket.listenerDetails.id;
      if (this.listenersById.has(listenerId)) {
        const listener = this.listenersById.get(listenerId);
        listener.sockets.delete(socket);
        if (0 === listener.sockets.size) {
          clearScatteredListener.call(this, listenerId);
          this.listenersById.delete(listenerId);
        }
      }
    }
  }

  forward(name, payload, audience) {
    [...audience.reduce(createDisjunctionForQuery.bind(this), new Set())]
      .map((listenerId) => this.listenersById.get(listenerId))
      .reduce((sockets, listener) => new Set([...sockets, ...listener.sockets]), new Set())
      .forEach(emit(name, payload));
  }

  async stop() {
    log("Stopping Middleware v%s/%s...", this.version, this.uuid);
    const listenerCount = this.listenersById.size;
    await disconnectFromPubSub.call(this);
    this.listenersById.clear();
    this.listenerIdsByCriterion.clear();
    if (check.assigned(this.logInterval)) {
      clearInterval(this.logInterval);
      this.logInterval = undefined;
    }
    return listenerCount;
  }

}

const cleanConfig = (config) => ({
  logInterval: check.assigned(config.logInterval)
    ? config.logInterval
    : DEFAULT_LOG_INTERVAL_IN_MINUTES * MINUTES_TO_SECONDS
});

function forEachMiddleware(action) {
  return Promise.all([...this.middlewaresByVersion.values()]
    .map((middleware) => middleware[action]()));
}

module.exports = class MiddlewareServer {

  constructor(middlewares, config, pubSubBuilder) {
    const cleanedConfig = cleanConfig(config);
    this.middlewaresByVersion = new Map();
    middlewares.forEach((middleware) =>
      this.middlewaresByVersion.set(middleware.version,
        new Middleware(middleware, cleanedConfig, pubSubBuilder)));
    Object.seal(this);
  }

  async start() {
    log("Starting MiddlewareServer...");
    await forEachMiddleware.call(this, "start");
  }

  async register(socket) {
    await this.middlewaresByVersion
      .get(socket.outbound.middlewareVersion)
      .register(socket);
    debug("Listener registered: %s", socket.listenerDetails.id.toString());
  }

  remove(socket) {
    this.middlewaresByVersion
      .get(socket.outbound.middlewareVersion)
      .remove(socket);
    debug("Listener removed: %s", socket.listenerDetails.id.toString());
  }

  forward(version, name, payload, audience) {
    this.middlewaresByVersion
      .get(version)
      .forward(name, payload, audience);
    debug("Message forwarded: %s", JSON.stringify({ name, payload, audience }));
  }

  async stop() {
    log("Stopping MiddlewareServer...");
    const listenerCounts = await forEachMiddleware.call(this, "stop");
    this.middlewaresByVersion.clear();
    return listenerCounts.reduce((total, listenerCount) => total + listenerCount, 0);
  }

};
