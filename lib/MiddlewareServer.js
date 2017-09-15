function append(socket) {
  const user = this.usersByIds.get(socket.userId);
  if (user) {
    user.sockets.push(socket);
  }
  return user;
}

module.exports = class MiddlewareServer {

  constructor(middleware, config) {
    this.fetchUserById = middleware.fetchUserById;
    this.predicates = middleware.predicates;
    this.config = config;
    this.usersByIds = new Map();
    this.users = [];
    Object.seal(this);
  }

  register(socket) {
    const existingUser = append.call(this, socket);
    if (existingUser) {
      return Promise.resolve(existingUser.data);
    }
    return this.fetchUserById(socket.userId).then((userData) => {
      const justCreatedUser = append.call(this, socket);
      if (justCreatedUser) {
        return justCreatedUser.data;
      }
      const user = {
        data: userData,
        sockets: [socket]
      };
      this.usersByIds.set(socket.userId, user);
      this.users.push(user);
      return userData;
    });
  }

  remove(socket) {
    const user = this.usersByIds.get(socket.userId);
    if (user) {
      const socketIndex = user.sockets.indexOf(socket);
      if (0 <= socketIndex) {
        user.sockets.splice(socketIndex, 1);
      }
      if (!user.sockets.length) {
        this.usersByIds.delete(socket.userId);
        this.users.splice(this.users.indexOf(user), 1);
      }
    }
  }

  forward(name, payload, audience) {
    const test = audience.map((criteria) =>
      Object.keys(criteria).map((criterion) =>
        (user) => this.predicates[criterion](user, criteria[criterion])
      )
    );
    const recipients = this.users.filter((user) =>
      test.some((questions) =>
        questions.every((question) => question(user.data))
      )
    );
    recipients.forEach((recipient) => {
      recipient.sockets.forEach((socket) => {
        socket.emit(name, payload);
      });
    });
  }

};
