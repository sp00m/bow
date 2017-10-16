const check = require("check-types");
const deepEqual = require("deep-equal");
const uuid = require("uuid/v4");

const assert = require("./utils/assert");

function scatterListener(listenerId) {
  const listenerCriteria = this.usersById.get(listenerId).criteria;
  Object.keys(listenerCriteria).forEach((criterionKey) => {
    const criterionValue = listenerCriteria[criterionKey];
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
  const listenerCriteria = this.usersById.get(listenerId).criteria;
  Object.keys(listenerCriteria).forEach((criterionKey) => {
    const criterionValue = listenerCriteria[criterionKey];
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
  const listenerExists = this.usersById.has(id);
  if (listenerExists) {
    const existingListener = this.usersById.get(id);
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
    await this.pubSub.destroy();
  }
}

class Middleware {

  constructor(middleware, pubSubBuilder) {
    this.uuid = uuid();
    this.version = middleware.version;
    this.getCriteriaByListenerId = middleware.getCriteriaByListenerId;
    this.pubSubBuilder = pubSubBuilder;
    this.pubSub = undefined;
    this.usersById = new Map();
    this.listenerIdsByCriterion = new Map();
    this.shareListenerCriteria = () => {}; // eslint-disable-line no-empty-function
    Object.seal(this);
  }

  async start() {
    await connectToPubSub.call(this);
  }

  async register(socket) {
    const listenerCriteria = await this.getCriteriaByListenerId(socket.listenerId);
    assert.criteria(listenerCriteria);
    if (socket.connected) {
      const listenerExists = refreshListener.call(this, socket.listenerId, listenerCriteria);
      if (!listenerExists) {
        this.usersById.set(socket.listenerId, { criteria: listenerCriteria, sockets: new Set() });
        scatterListener.call(this, socket.listenerId);
      }
      this.usersById.get(socket.listenerId).sockets.add(socket);
      this.shareListenerCriteria(socket.listenerId, listenerCriteria);
    }
  }

  remove(socket) {
    if (this.usersById.has(socket.listenerId)) {
      const listener = this.usersById.get(socket.listenerId);
      listener.sockets.delete(socket);
      if (0 === listener.sockets.size) {
        clearScatteredListener.call(this, socket.listenerId);
        this.usersById.delete(socket.listenerId);
      }
    }
  }

  forward(name, payload, audience) {
    [...audience.reduce(createDisjunctionForQuery.bind(this), new Set())]
      .map((listenerId) => this.usersById.get(listenerId))
      .reduce((sockets, listener) => new Set([...sockets, ...listener.sockets]), new Set())
      .forEach((socket) => socket.emit(name, payload));
  }

  async stop() {
    const listenerCount = this.usersById.size;
    await disconnectFromPubSub.call(this);
    this.usersById.clear();
    this.listenerIdsByCriterion.clear();
    return listenerCount;
  }

}

module.exports = class MiddlewareServer {

  constructor(middlewares, pubSubBuilder) {
    this.middlewaresByVersion = new Map();
    middlewares.forEach((middleware) =>
      this.middlewaresByVersion.set(middleware.version,
        new Middleware(middleware, pubSubBuilder)));
    Object.seal(this);
  }

  async start() {
    await Promise.all([...this.middlewaresByVersion.values()]
      .map((middleware) => middleware.start()));
  }

  async register(socket) {
    await this.middlewaresByVersion
      .get(socket.outbound.middlewareVersion)
      .register(socket);
  }

  remove(socket) {
    this.middlewaresByVersion
      .get(socket.outbound.middlewareVersion)
      .remove(socket);
  }

  forward(version, name, payload, audience) {
    this.middlewaresByVersion
      .get(version)
      .forward(name, payload, audience);
  }

  async stop() {
    const listenerCounts = await Promise.all([...this.middlewaresByVersion.values()]
      .map((middleware) => middleware.stop()));
    this.middlewaresByVersion.clear();
    return listenerCounts.reduce((total, listenerCount) => total + listenerCount, 0);
  }

};
