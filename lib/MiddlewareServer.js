const check = require("check-types");

const assert = require("./assert");

function addSocketToExistingUser(socket) {
  const user = this.usersByIds.get(socket.userId);
  if (check.assigned(user)) {
    user.sockets.push(socket);
  }
  return user;
}

function addUser(user) {
  this.usersByIds.set(user.id, user);
  this.users.push(user);
}

function buildExam(audience) {
  return audience.map((criteria) =>
    Object.keys(criteria).map((criterion) =>
      (user) => this.predicates[criterion](user, criteria[criterion])));
}

class Middleware {

  constructor(fetchUserById, predicates) {
    this.fetchUserById = fetchUserById;
    this.predicates = predicates;
    this.users = [];
    this.usersByIds = new Map();
    Object.seal(this);
  }

  async register(socket) {
    const existingUser = addSocketToExistingUser.call(this, socket);
    if (check.not.assigned(existingUser)) {
      const userData = await this.fetchUserById(socket.userId);
      assert.assigned(userData, "user retrived from id");
      const justCreatedUser = addSocketToExistingUser.call(this, socket);
      if (check.not.assigned(justCreatedUser)) {
        addUser.call(this, {
          id: socket.userId,
          data: userData,
          sockets: [socket]
        });
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

  forward(name, payload, audience) {
    const exam = buildExam.call(this, audience);
    this.users
      .filter((user) => exam.some((questions) => questions.every((question) => question(user.data))))
      .reduce((sockets, user) => sockets.concat(user.sockets), [])
      .forEach((socket) => socket.emit(name, payload));
  }

}

module.exports = class MiddlewareServer {

  constructor(middlewares, config) {
    this.middlewaresByVersion = new Map();
    middlewares.forEach((middleware) =>
      this.middlewaresByVersion.set(middleware.version, new Middleware(middleware.fetchUserById, middleware.predicates)));
    this.config = config;
    Object.seal(this);
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

};
