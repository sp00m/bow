const check = require("check-types");

function addSocketToExistingUser(socket) {
  const user = this.usersByIds.get(socket.userId);
  if (check.assigned(user)) {
    user.sockets.push(socket);
  }
  return user;
}

function buildQuestion(criteria, criterion) {
  return (user) => this.predicates[criterion](user, criteria[criterion]);
}

function buildQuestions(criteria) {
  return Object.keys(criteria).map((criterion) => buildQuestion.call(this, criteria, criterion));
}

module.exports = class MiddlewareServer {

  constructor(middleware, config) {
    this.fetchUserById = middleware.fetchUserById;
    this.predicates = middleware.predicates;
    this.config = config;
    this.users = [];
    this.usersByIds = new Map();
    Object.seal(this);
  }

  async register(socket) {
    const existingUser = addSocketToExistingUser.call(this, socket);
    if (check.not.assigned(existingUser)) {
      const userData = await this.fetchUserById(socket.userId);
      check.assert.assigned(userData,
        `Expected user retrived from id to be defined, but got '${userData}' instead`);
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

  forward(name, payload, audience) {
    const exam = audience.map(buildQuestions.bind(this));
    this.users
      .filter((user) => exam.some((questions) => questions.every((question) => question(user.data))))
      .reduce((sockets, user) => sockets.concat(user.sockets), [])
      .forEach((socket) => socket.emit(name, payload));
  }

};
