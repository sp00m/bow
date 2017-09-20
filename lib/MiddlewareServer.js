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
  if (0 === i || 0 < criteriaUserIds.length) {
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

class Middleware {

  constructor(getUserCriteriaById) {
    this.getUserCriteriaById = getUserCriteriaById;
    this.usersById = new Map();
    this.userIdsByCriterion = new Map();
    Object.seal(this);
  }

  async register(socket) {
    const userCriteria = await this.getUserCriteriaById(socket.userId);
    if (this.usersById.has(socket.userId)) {
      const existingUser = this.usersById.get(socket.userId);
      existingUser.sockets.push(socket);
      if (!deepEqual(existingUser.criteria, userCriteria)) {
        clearScatteredUser.call(this, socket.userId);
        existingUser.criteria = userCriteria;
        scatterUser.call(this, socket.userId);
      }
    } else {
      this.usersById.set(socket.userId, {
        criteria: userCriteria,
        sockets: [socket]
      });
      scatterUser.call(this, socket.userId);
    }
  }

  remove(socket) {
    if (this.usersById.has(socket.userId)) {
      const user = this.usersById.get(socket.userId);
      user.sockets.splice(user.sockets.indexOf(socket), 1);
      if (0 === user.sockets.length) {
        clearScatteredUser.call(this, socket.userId);
        this.usersById.delete(socket.userId);
      }
    }
  }

  forward(name, payload, audience) {
    [...audience.reduce(findUserIdsByAudience.bind(this), new Set())]
      .map((userId) => this.usersById.get(userId))
      .reduce((sockets, user) => sockets.concat(user.sockets), [])
      .forEach((socket) => socket.emit(name, payload));
  }

}

module.exports = class MiddlewareServer {

  constructor(middlewares) {
    this.middlewares = middlewares;
    this.middlewaresByVersion = new Map();
    Object.seal(this);
  }

  async start() {
    this.middlewares.forEach((middleware) =>
      this.middlewaresByVersion.set(middleware.version, new Middleware(middleware.getUserCriteriaById)));
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
    this.middlewaresByVersion.clear();
  }

};
