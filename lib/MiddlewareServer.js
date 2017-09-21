const check = require("check-types");
const deepEqual = require("deep-equal");

function scatterUser(userId) {
  const userCriteria = this.usersById.get(userId).criteria;
  Object.keys(userCriteria).forEach((criterionKey) => {
    const criterionValue = userCriteria[criterionKey];
    if (!this.userIdsByCriterion.has(criterionKey)) {
      this.userIdsByCriterion.set(criterionKey, new Map());
    }
    const userIdsByCriterionValue = this.userIdsByCriterion.get(criterionKey);
    if (!userIdsByCriterionValue.has(criterionValue)) {
      userIdsByCriterionValue.set(criterionValue, new Set());
    }
    userIdsByCriterionValue.get(criterionValue).add(userId);
  });
}

function clearScatteredUser(userId) {
  const userCriteria = this.usersById.get(userId).criteria;
  Object.keys(userCriteria).forEach((criterionKey) => {
    const criterionValue = userCriteria[criterionKey];
    const userIdsByCriterionValue = this.userIdsByCriterion.get(criterionKey);
    const userIds = userIdsByCriterionValue.get(criterionValue);
    userIds.delete(userId);
    if (0 === userIds.size) {
      userIdsByCriterionValue.delete(criterionValue);
      if (0 === userIdsByCriterionValue.size) {
        this.userIdsByCriterion.delete(criterionKey);
      }
    }
  });
}

function findUserIdsByCriterion(criterionKey, criterionValue) {
  let userIds = new Set();
  if (this.userIdsByCriterion.has(criterionKey)) {
    const userIdsByCriterionValue = this.userIdsByCriterion.get(criterionKey);
    if (userIdsByCriterionValue.has(criterionValue)) {
      userIds = userIdsByCriterionValue.get(criterionValue);
    }
  }
  return userIds;
}

const findUserIdsByCriteria = (criteria) => function (criteriaUserIds, criterionKey, i) {
  let userIds = criteriaUserIds;
  if (0 === i || 0 < criteriaUserIds.size) {
    const criterionUserIds = findUserIdsByCriterion.call(this, criterionKey, criteria[criterionKey]);
    userIds = 0 === i
      ? criterionUserIds
      : new Set([...criteriaUserIds].filter((userId) => criterionUserIds.has(userId)));
  }
  return userIds;
};

function findUserIdsByAudience(audienceUserIds, criteria) {
  return new Set([
    ...audienceUserIds,
    ...Object.keys(criteria).reduce(findUserIdsByCriteria(criteria).bind(this), new Set())
  ]);
}

function addResolver(userId, resolver) {
  if (!this.resolversByUserId.has(userId)) {
    this.resolversByUserId.set(userId, new Set());
  }
  this.resolversByUserId.get(userId).add(resolver);
}

function clearResolvers(userId) {
  if (this.resolversByUserId.has(userId)) {
    this.resolversByUserId.get(userId).forEach((resolver) => resolver());
    this.resolversByUserId.delete(userId);
  }
}

async function refreshUser(id, criteria) {
  if (this.usersById.has(id)) {
    const existingUser = this.usersById.get(id);
    if (!deepEqual(existingUser.criteria, criteria)) {
      clearScatteredUser.call(this, id);
      existingUser.criteria = criteria;
      scatterUser.call(this, id);
    }
  }
  clearResolvers.call(this, id);
}

async function connectToPubSub() {
  if (this.pubSubBuilder.isOperational()) {
    this.pubSub = await this.pubSubBuilder.build(`BOW_USER_${this.version}`);
    this.pubSub.onMessage(({ id, criteria }) =>
      refreshUser.call(this, id, criteria));
    this.refreshUser = (id, criteria) => new Promise((resolver) => {
      addResolver.call(this, id, resolver);
      this.pubSub.pushMessage({ id, criteria });
    });
  }
}

async function disconnectFromPubSub() {
  if (check.assigned(this.pubSub)) {
    await this.pubSub.destroy();
  }
}

class Middleware {

  constructor(middleware, pubSubBuilder) {
    this.version = middleware.version;
    this.getUserCriteriaByUserId = middleware.getUserCriteriaByUserId;
    this.pubSubBuilder = pubSubBuilder;
    this.pubSub = undefined;
    this.usersById = new Map();
    this.userIdsByCriterion = new Map();
    this.refreshUser = refreshUser.bind(this);
    this.resolversByUserId = new Map();
    Object.seal(this);
  }

  async start() {
    await connectToPubSub.call(this);
  }

  async register(socket) {
    const userCriteria = await this.getUserCriteriaByUserId(socket.userId);
    if (socket.connected) {
      if (!this.usersById.has(socket.userId)) {
        this.usersById.set(socket.userId, { criteria: userCriteria, sockets: new Set() });
        scatterUser.call(this, socket.userId);
      }
      await this.refreshUser(socket.userId, userCriteria);
      if (socket.connected) {
        this.usersById.get(socket.userId).sockets.add(socket);
      }
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
    clearResolvers.call(this, socket.userId);
  }

  forward(name, payload, audience) {
    [...audience.reduce(findUserIdsByAudience.bind(this), new Set())]
      .map((userId) => this.usersById.get(userId))
      .reduce((sockets, user) => new Set([...sockets, ...user.sockets]), new Set())
      .forEach((socket) => socket.emit(name, payload));
  }

  async stop() {
    await disconnectFromPubSub.call(this);
    this.usersById.clear();
    this.userIdsByCriterion.clear();
    this.resolversByUserId.clear();
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
    await Promise.all([...this.middlewaresByVersion.values()]
      .map((middleware) => middleware.stop()));
    this.middlewaresByVersion.clear();
  }

};
