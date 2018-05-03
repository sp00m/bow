require("should");

const {
  tokens,
  buildServer,
  messages,
  createSocketExpectingMessage,
  pushMessage
} = require("./utils/middleware");

describe("MiddlewareServer logging", () => {

  const serverPort = 3000;

  const serverStoppers = [];
  const sockets = [];

  it("should log the number of currently connected listeners", () => buildServer(serverPort, { middleware: { logInterval: 1 } }).start()
    .then((server) => {
      serverStoppers.push(server);
      return new Promise((connectionSucceeded, connectionFailed) => {
        sockets.push(createSocketExpectingMessage(
          "http", serverPort, 1, tokens.firstAdmin, messages.simple,
          connectionSucceeded, connectionFailed
        ));
      });
    })
    .then((messagePromiseGetter) =>
      pushMessage("http", serverPort, "/messages", messages.simple, messagePromiseGetter)
    )
    .then(() => new Promise((resolve) => {
      setTimeout(resolve, 1000); // eslint-disable-line no-magic-numbers
    }))
    .then(() => {
      sockets
        .filter((socket) => socket.connected)
        .forEach((socket) => socket.disconnect());
      sockets.length = 0;
      return Promise.all(serverStoppers.map((serverStopper) => serverStopper()));
    })
    .then((listenerCounts) => {
      serverStoppers.length = 0;
      listenerCounts.reduce((total, listenerCount) => total + listenerCount, 0).should.equal(0);
    }));

  it("should allow disabling the logs", () => buildServer(serverPort, { middleware: { logInterval: 0 } }).start()
    .then((server) => {
      serverStoppers.push(server);
      return new Promise((connectionSucceeded, connectionFailed) => {
        sockets.push(createSocketExpectingMessage(
          "http", serverPort, 1, tokens.firstAdmin, messages.simple,
          connectionSucceeded, connectionFailed
        ));
      });
    })
    .then((messagePromiseGetter) =>
      pushMessage("http", serverPort, "/messages", messages.simple, messagePromiseGetter)
    )
    .then(() => {
      sockets
        .filter((socket) => socket.connected)
        .forEach((socket) => socket.disconnect());
      sockets.length = 0;
      return Promise.all(serverStoppers.map((serverStopper) => serverStopper()));
    })
    .then((listenerCounts) => {
      serverStoppers.length = 0;
      listenerCounts.reduce((total, listenerCount) => total + listenerCount, 0).should.equal(0);
    }));

});
