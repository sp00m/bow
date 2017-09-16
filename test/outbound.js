require("should");

const io = require("socket.io-client");
const Bow = require("../");
const config = require("./config");

describe("outbound", () => {

  const url = `http://localhost:${config.port}`;

  let socket = undefined;
  let stopServer = undefined;

  before(async () => {
    stopServer = await new Bow(config)
      .outbound("1", (token) => new Promise((resolve, reject) => {
        if ("ok" === token) {
          resolve(42);
        } else {
          reject(`Wrong token '${token}'`);
        }
      }), "1")
      .start();
  });

  it("should fail if specifying a namespace", () => new Promise((resolve, reject) => {

    socket = io(`${url}/foo/bar`, { forceNew: true }).on("error", (error) => {
      if ("Invalid namespace" === error) {
        resolve();
      } else {
        reject(`Unexpected error: ${error}`);
      }
    }).on("connect", () => {
      reject("Connection should have been impossible");
    });

  }));

  it("should fail if specifying no version", () => new Promise((resolve, reject) => {

    socket = io(url, { forceNew: true }).on("error", (error) => {
      if ("Version not found in handshake request, expected query parameter 'v'" === error) {
        resolve();
      } else {
        reject(`Unexpected error: ${error}`);
      }
    }).on("connect", () => {
      reject("Connection should have been impossible");
    });

  }));

  it("should fail if specifying wrong version", () => new Promise((resolve, reject) => {

    socket = io(url, { forceNew: true, query: { v: 42 } }).on("error", (error) => {
      if ("Version '42' not supported" === error) {
        resolve();
      } else {
        reject(`Unexpected error: ${error}`);
      }
    }).on("connect", () => {
      reject("Connection should have been impossible");
    });

  }));

  it("should disconnect in no authentication is received", () => new Promise((resolve, reject) => {

    socket = io("http://localhost:3000", { forceNew: true, query: { v: 1 } }).on("error", (error) => {
      reject(`Unexpected error: ${error}`);
    }).on("connect", () => {
      socket.on("alert", (message) => {
        if ("Authentication timeout reached" === message) {
          socket.on("disconnect", () => {
            resolve();
          });
        } else {
          reject(`Unexpected alert: ${message}`);
        }
      });
    });

  }));

  it("should disconnect if authentication is invalid", () => new Promise((resolve, reject) => {

    socket = io(url, { forceNew: true, query: { v: 1 } }).on("error", (error) => {
      reject(`Unexpected error: ${error}`);
    }).on("connect", () => {
      const token = "foobar";
      socket.on("alert", (message) => {
        if (message === `Wrong token '${token}'`) {
          socket.on("disconnect", () => {
            resolve();
          });
        } else {
          reject(`Unexpected alert: ${message}`);
        }
      });
      socket.emit("authenticate", token);
    });

  }));

  afterEach(() => {
    if (socket) {
      socket.disconnect();
    }
  });

  after(async () => {
    if (stopServer) {
      await stopServer();
    }
  });

});
