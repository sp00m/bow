const check = require("check-types");
const deepEqual = require("deep-equal");
const uuid = require("uuid/v4");

const assert = require("./utils/assert");

function scatterUser(userId) {
  const userCriteria = this.usersById.get(userId).criteria;
  Object.keys(userCriteria).forEach((criterionKey) => {
    const criterionValue = userCriteria[criterionKey];
    const criterionValues = check.array(criterionValue) ? criterionValue : [criterionValue];
    if (!this.userIdsByCriterion.has(criterionKey)) {
      this.userIdsByCriterion.set(criterionKey, new Map());
    }
    const userIdsByCriterionValue = this.userIdsByCriterion.get(criterionKey);
    criterionValues.forEach((value) => {
      if (!userIdsByCriterionValue.has(value)) {
        userIdsByCriterionValue.set(value, new Set());
      }
      userIdsByCriterionValue.get(value).add(userId);
    });
  });
}

function clearScatteredUser(userId) {
  const userCriteria = this.usersById.get(userId).criteria;
  Object.keys(userCriteria).forEach((criterionKey) => {
    const criterionValue = userCriteria[criterionKey];
    const criterionValues = check.array(criterionValue) ? criterionValue : [criterionValue];
    const userIdsByCriterionValue = this.userIdsByCriterion.get(criterionKey);
    criterionValues.forEach((value) => {
      const userIds = userIdsByCriterionValue.get(value);
      userIds.delete(userId);
      if (0 === userIds.size) {
        userIdsByCriterionValue.delete(value);
      }
    });
    if (0 === userIdsByCriterionValue.size) {
      this.userIdsByCriterion.delete(criterionKey);
    }
  });
}

function findUserIdsByPredicate(predicateKey, predicateValue) {
  let userIds = new Set();
  if (this.userIdsByCriterion.has(predicateKey)) {
    const userIdsByCriterionValue = this.userIdsByCriterion.get(predicateKey);
    if (userIdsByCriterionValue.has(predicateValue)) {
      userIds = userIdsByCriterionValue.get(predicateValue);
    }
  }
  return userIds;
}

const createConjunctionForPredicate = (query) => function (queryUserIds, predicateKey, i) {
  let userIds = queryUserIds;
  if (0 === i || 0 < queryUserIds.size) {
    const predicateUserIds = findUserIdsByPredicate.call(this, predicateKey, query[predicateKey]);
    userIds = 0 === i
      ? predicateUserIds
      : new Set([...queryUserIds].filter((userId) => predicateUserIds.has(userId)));
  }
  return userIds;
};

function createDisjunctionForQuery(audienceUserIds, query) {
  return new Set([
    ...audienceUserIds,
    ...Object.keys(query).reduce(createConjunctionForPredicate(query).bind(this), new Set())
  ]);
}

function refreshUser(id, criteria) {
  const userExists = this.usersById.has(id);
  if (userExists) {
    const existingUser = this.usersById.get(id);
    if (!deepEqual(existingUser.criteria, criteria)) {
      clearScatteredUser.call(this, id);
      existingUser.criteria = criteria;
      scatterUser.call(this, id);
    }
  }
  return userExists;
}

async function connectToPubSub() {
  if (this.pubSubBuilder.isOperational()) {
    this.pubSub = await this.pubSubBuilder.build(`BOW_USER_${this.version}`);
    this.pubSub.onMessage(({ senderUuid, id, criteria }) => {
      if (senderUuid !== this.uuid) {
        refreshUser.call(this, id, criteria);
      }
    });
    this.shareUserCriteria = (id, criteria) =>
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
    this.getUserCriteriaByUserId = middleware.getUserCriteriaByUserId;
    this.pubSubBuilder = pubSubBuilder;
    this.pubSub = undefined;
    this.usersById = new Map();
    this.userIdsByCriterion = new Map();
    this.shareUserCriteria = () => {}; // eslint-disable-line no-empty-function
    Object.seal(this);
  }

  async start() {
    await connectToPubSub.call(this);
  }

  async register(socket) {
    const userCriteria = await this.getUserCriteriaByUserId(socket.userId);
    assert.criteria(userCriteria);
    if (socket.connected) {
      const userExists = refreshUser.call(this, socket.userId, userCriteria);
      if (!userExists) {
        this.usersById.set(socket.userId, { criteria: userCriteria, sockets: new Set() });
        scatterUser.call(this, socket.userId);
      }
      this.usersById.get(socket.userId).sockets.add(socket);
      this.shareUserCriteria(socket.userId, userCriteria);
    }
  }

  remove(socket) {
    if (this.usersById.has(socket.userId)) {
      const user = this.usersById.get(socket.userId);
      user.sockets.delete(socket);
      if (0 === user.sockets.size) {
        clearScatteredUser.call(this, socket.userId);
        this.usersById.delete(socket.userId);
      }
    }
  }

  forward(name, payload, audience) {
    [...audience.reduce(createDisjunctionForQuery.bind(this), new Set())]
      .map((userId) => this.usersById.get(userId))
      .reduce((sockets, user) => new Set([...sockets, ...user.sockets]), new Set())
      .forEach((socket) => socket.emit(name, payload));
  }

  async stop() {
    const userCount = this.usersById.size;
    await disconnectFromPubSub.call(this);
    this.usersById.clear();
    this.userIdsByCriterion.clear();
    return userCount;
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
    const userCounts = await Promise.all([...this.middlewaresByVersion.values()]
      .map((middleware) => middleware.stop()));
    this.middlewaresByVersion.clear();
    return userCounts.reduce((total, userCount) => total + userCount, 0);
  }

};
