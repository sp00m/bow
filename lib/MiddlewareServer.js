const check = require("check-types");

const assert = require("./assert");

function getMiddleware(version) {
  return this.middlewares
    .filter((middleware) => middleware.version === version)
    [0];
}

function addSocketToExistingUser(socket) {
  const user = this.usersByIds.get(socket.userId);
  if (check.assigned(user)) {
    user.sockets.push(socket);
  }
  return user;
}

const buildExam = (middleware, audience) =>
  audience.map((criteria) =>
    Object.keys(criteria).map((criterion) =>
      (user) => middleware.predicates[criterion](user, criteria[criterion])));

module.exports = class MiddlewareServer {

  constructor(middlewares, config) {
    this.middlewares = middlewares;
    this.config = config;
    this.users = [];
    this.usersByIds = new Map();
    Object.seal(this);
  }

  async register(version, socket) {
    const existingUser = addSocketToExistingUser.call(this, socket);
    if (check.not.assigned(existingUser)) {
      const middleware = getMiddleware.call(this, version);
      const userData = await middleware.fetchUserById(socket.userId);
      assert.assigned(userData, "user retrived from id");
      const justCreatedUser = addSocketToExistingUser.call(this, socket);
      if (check.not.assigned(justCreatedUser)) {
        const user = {
          data: userData,
          sockets: [socket]
        };
        this.usersByIds.set(socket.userId, user);
        this.users.push(user);
      }
    }
  }

  remove(socket) {
    const user = this.usersByIds.get(socket.userId);
    if (check.assigned(user)) {
      const socketIndex = user.sockets.indexOf(socket);
      if (0 <= socketIndex) {
        user.sockets.splice(socketIndex, 1);
      }
      if (0 === user.sockets.length) {
        this.usersByIds.delete(socket.userId);
        this.users.splice(this.users.indexOf(user), 1);
      }
    }
  }

  forward(version, name, payload, audience) {
    const middleware = getMiddleware.call(this, version);
    const exam = buildExam(middleware, audience);
    this.users
      .filter((user) => exam.some((questions) => questions.every((question) => question(user.data))))
      .reduce((sockets, user) => sockets.concat(user.sockets), [])
      .forEach((socket) => socket.emit(name, payload));
  }

};
