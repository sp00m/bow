const should = require("should");

const check = require("check-types");

const {
  tokens,
  ids,
  criteriaByListenersId,
  buildServer,
  messages,
  createSocketExpectingMessage,
  createSocketNotExpectingMessage,
  pushMessage
} = require("./utils/middleware");

describe("MiddlewareServer with Redis", () => {

  const firstServerPort = 3000;
  const secondServerPort = 3001;
  const thirdServerPort = 3002;

  const serverStoppers = [];
  const sockets = [];
  const reverters = [];

  before(async () => {
    serverStoppers.push(await buildServer(firstServerPort, { redis: {} }).start());
    serverStoppers.push(await buildServer(secondServerPort, { redis: {} }).start());
  });

  afterEach(() => {
    sockets
      .filter((socket) => socket.connected)
      .forEach((socket) => socket.disconnect());
    sockets.length = 0;
  });

  afterEach(() => {
    reverters.forEach((reverter) => reverter());
    reverters.length = 0;
  });

  after(async () => {
    const listenerCounts = await Promise.all(serverStoppers.map((serverStopper) => serverStopper()));
    serverStoppers.length = 0;
    listenerCounts.reduce((total, listenerCount) => total + listenerCount, 0).should.equal(0);
  });

  it("should fail if Redis connection is not valid", async () => {
    let stopServer = undefined;
    try {
      stopServer = await buildServer(thirdServerPort, { redis: { port: 404 } }).start();
    } catch (error) {
      // expected error
    } finally {
      if (check.assigned(stopServer)) {
        await stopServer();
        should.fail("Server should have failed starting");
      }
    }
  });

  it("should resolve audience on distinct instances", () => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", firstServerPort, 1, tokens.firstAdmin, messages.simple,
      connectionSucceeded, connectionFailed
    ));
  }).then((messagePromiseGetter) =>
    pushMessage("http", secondServerPort, "/messages", messages.simple, messagePromiseGetter)
  ));

  it("should resolve audience on the same instance", () => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", firstServerPort, 1, tokens.firstAdmin, messages.simple,
      connectionSucceeded, connectionFailed
    ));
  }).then((messagePromiseGetter) =>
    pushMessage("http", firstServerPort, "/messages", messages.simple, messagePromiseGetter)
  ));

  it("should share listener criteria between instances", () => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketNotExpectingMessage(
      "http", firstServerPort, 1, tokens.firstAdmin, messages.simple,
      connectionSucceeded, connectionFailed
    ));
  }).then((messagePromiseGetter) => new Promise((connectionSucceeded, connectionFailed) => {
    criteriaByListenersId[ids.firstAdmin].role = "author";
    reverters.push(() => {
      criteriaByListenersId[ids.firstAdmin].role = "admin";
    });
    sockets.push(createSocketNotExpectingMessage(
      "http", secondServerPort, 1, tokens.firstAdmin, messages.simple,
      connectionSucceeded, connectionFailed, messagePromiseGetter
    ));
  })).then((messagePromiseGetter) => new Promise((resolve) => {
    setTimeout(() => resolve(messagePromiseGetter), 500); // eslint-disable-line no-magic-numbers
  })).then((messagePromiseGetter) =>
    pushMessage("http", firstServerPort, "/messages", messages.simple, messagePromiseGetter)
  ));

});
