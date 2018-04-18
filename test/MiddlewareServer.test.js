require("should");

const {
  tokens,
  buildServer,
  messages,
  createSocket,
  createSocketExpectingMessage,
  createSocketNotExpectingMessage,
  pushMessage
} = require("./utils/middleware");

describe("MiddlewareServer", () => {

  const serverPort = 3000;

  const serverStoppers = [];
  const sockets = [];

  before(async () => {
    serverStoppers.push(await buildServer(serverPort).start());
  });

  afterEach(() => {
    sockets
      .filter((socket) => socket.connected)
      .forEach((socket) => socket.disconnect());
    sockets.length = 0;
  });

  after(async () => {
    const listenerCounts = await Promise.all(serverStoppers.map((serverStopper) => serverStopper()));
    serverStoppers.length = 0;
    listenerCounts.reduce((total, listenerCount) => total + listenerCount, 0).should.equal(0);
  });

  it("should resolve audience", () => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", serverPort, 1, tokens.firstAdmin, messages.complex,
      connectionSucceeded, connectionFailed
    ));
  }).then((messagePromiseGetter) => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", serverPort, 1, tokens.firstAuthor, messages.complex,
      connectionSucceeded, connectionFailed, messagePromiseGetter
    ));
  })).then((messagePromiseGetter) => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketNotExpectingMessage(
      "http", serverPort, 1, tokens.secondAuthor, messages.complex,
      connectionSucceeded, connectionFailed, messagePromiseGetter
    ));
  })).then((messagePromiseGetter) => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", serverPort, 1, tokens.thirdAuthor, messages.complex,
      connectionSucceeded, connectionFailed, messagePromiseGetter
    ));
  })).then((messagePromiseGetter) => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketNotExpectingMessage(
      "http", serverPort, 1, tokens.fourthAuthor, messages.complex,
      connectionSucceeded, connectionFailed, messagePromiseGetter
    ));
  })).then((messagePromiseGetter) =>
    pushMessage("http", serverPort, "/messages", messages.complex, messagePromiseGetter)
  ));

  it("should handle duplicated criteria", () => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", serverPort, 1, tokens.secondAdmin, messages.simple,
      connectionSucceeded, connectionFailed
    ));
  }).then((messagePromiseGetter) =>
    pushMessage("http", serverPort, "/messages", messages.simple, messagePromiseGetter)
  ));

  it("should handle same listener connected multiple times", () => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", serverPort, 1, tokens.firstAdmin, messages.simple,
      connectionSucceeded, connectionFailed
    ));
  }).then((messagePromiseGetter) => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", serverPort, 1, tokens.firstAdmin, messages.simple,
      connectionSucceeded, connectionFailed, messagePromiseGetter
    ));
  })).then((messagePromiseGetter) =>
    pushMessage("http", serverPort, "/messages", messages.simple, messagePromiseGetter)
  ));

  it("should allow disconnecting clients", () => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocket(
      "http", serverPort, 1, tokens.disconnect,
      connectionFailed, connectionSucceeded
    ));
  }).then((socket) => new Promise((disconnectionSucceeded, disconnectionFailed) => {
    const timeout = setTimeout(disconnectionFailed, 1000); // eslint-disable-line no-magic-numbers
    socket.on("disconnect", () => {
      clearTimeout(timeout);
      disconnectionSucceeded();
    });
    pushMessage("http", serverPort, "/messages", messages.disconnect);
  })));

  it("should fail if id is invalid", () => new Promise((connectionFailed, connectionSucceeded) => {
    sockets.push(createSocket(
      "http", serverPort, 1, tokens.invalidId,
      connectionFailed, connectionSucceeded
    ));
  }));

  it("should fail if criteria is invalid", () => new Promise((connectionFailed, connectionSucceeded) => {
    sockets.push(createSocket(
      "http", serverPort, 1, tokens.invalidCriteria,
      connectionFailed, connectionSucceeded
    ));
  }));

  it("should fail if criteria hold __id", () => new Promise((connectionFailed, connectionSucceeded) => {
    sockets.push(createSocket(
      "http", serverPort, 1, tokens.criteriaHoldingId,
      connectionFailed, connectionSucceeded
    ));
  }));

});
