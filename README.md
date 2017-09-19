# Bow - Broadcast Over WebSocket

Bow helps you building a multitenant WebSocket server that fits into a microservice architecture.

## State

`master`: [![Build](https://api.travis-ci.org/bowjs/bow.svg?branch=master)](https://travis-ci.org/bowjs/bow)
[![Coverage](https://coveralls.io/repos/github/bowjs/bow/badge.svg?branch=master)](https://coveralls.io/github/bowjs/bow?branch=master)

`develop`: [![Build](https://api.travis-ci.org/bowjs/bow.svg?branch=develop)](https://travis-ci.org/bowjs/bow)
[![Coverage](https://coveralls.io/repos/github/bowjs/bow/badge.svg?branch=develop)](https://coveralls.io/github/bowjs/bow?branch=develop)

[![Dependencies](https://david-dm.org/bowjs/bow/status.svg)](https://david-dm.org/bowjs/bow)
[![Vulnerabilities](https://snyk.io/test/github/bowjs/bow/badge.svg)](https://snyk.io/test/github/bowjs/bow)
[![License](https://img.shields.io/badge/license-MIT-brightgreen.svg?style=flat)](https://opensource.org/licenses/MIT)

## Specs

Bow exposes two main APIs:

- **an HTTP API to push messages**, built on top of [Koa](http://koajs.com/);
- and **a WebSocket API to receive messages**, built on top of [Socket.IO](https://socket.io/).

To ease horizontal scalability, each Bow instance can connect to a Redis message broker.

Bow is built upon these four main concepts:

- **messages**, that must hold the *audience* to which they must be dispatched to;
- **middlewares**, that know how to resolve the messages audiences;
- **inbounds**, which create new HTTP API endpoints;
- and **outbounds**, which create new WebSocket API endpoints.

### Message

Messages must hold their *audience*, i.e. the tenant they must be dispatched to. An audience is composed by an array of criteria. Criteria are objects, where each property is a criterion.

For a criteria to be matched, each criterion must be fulfilled (logical `AND`).

For an audience to be matched, at least one of its criteria must be matched (logical `OR`).

#### Example

```json
[
  { "role": "admin" },
  { "role": "author", "blogId": 42 }
]
```

For the above audience of a blogging platform for example, the holding message will be sent:

- either to the admins;
- or to the authors, but for the blog 42 only.

Note that you will implement the resolution of the value of a criterion thanks to middlewares. This means that you can provide more complex value types if you want (e.g. `"blogIds": [42, 43]`), in which case you'll have to decide and implement whether it should be any of these blog ids, or all of them.

## Usage

### Installation

Bow requires **Node.js v7.6.0 or higher** for ES2015 and async function support.

```text
npm install --save bow
```

### new Bow(config)

Creates a new `Bow` instance, expected one `config` object argument:

#### config.port

**Required**, the port the server will be listening to.

#### config.https

Optional, the `options` object to pass to [Node.js `https.createServer(...)` function](https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener). If this option is not provided, then an [HTTP server will be created](https://nodejs.org/api/http.html#http_http_createserver_requestlistener) instead.

#### config.inbound.realm

**Required**, the realm for the Basic Auth protecting the HTTP API.

#### config.inbound.username

**Required**, the username for the Basic Auth protecting the HTTP API.

#### config.inbound.password

**Required**, the password for the Basic Auth protecting the HTTP API.

#### config.inbound.redis

Optional, the `options` object to pass to [Redis `redis.createClient(...)` function](https://www.npmjs.com/package/redis#rediscreateclient). If this option is not provided, then no message broker will be used, **which makes your server inconsistent if deployed in a clustered environment**.

#### config.outbound.timeout

**Required**, the timeout for WebSocket connections to authenticate.

### bow.middleware(version, getUserById, predicates)

Registers a new middleware.

#### version

The version of this middleware, must be unique between all middlewares.

#### getUserById

A function that takes one single `userId` argument, and returns a promise resolved with the corresponding user.

#### predicates

An object where keys are predicates names, and values functions taking two arguments:

1. a user, as returned by the provided `getUserById` function;
2. and a value, as found in the pushed messages for this predicate's name.

These functions must return a boolean, indicating whether the given user fulfills the given value for this predicate or not.

### bow.inbound(path, getMessageFromBody, middlewareVersion)

Registers a new inbound.

#### path

The path of this inbound, must be unique between all inbounds. This path will then be passed to Koa router, **mapped to the HTTP method POST**.

#### getMessageFromBody

A function that takes one single `body` argument as found in the HTTP request body, and returns a promise resolved with a *message* object, defined by:

- a `name` property, that will be the `eventName` parameter passed to [Socket.IO `socket.emit(...)`](https://socket.io/docs/emit-cheatsheet/);
- a `payload` property, that will be the `eventPayload`parameter passed to [Socket.IO `socket.emit(...)`](https://socket.io/docs/emit-cheatsheet/);
- and an `audience` property, that will passed to the chosen middleware so that it can dispatch the event as expected.

#### middlewareVersion

The middleware version to use to resolve the audiences found in pushed messages.

### bow.outbound(version, getUserIdByToken, middlewareVersion)

Registers a new outbound.

#### version

The version of this outbound, must be unique between all outbounds.

#### getUserIdByToken

A function that takes one single `token` argument (the one provided when authenticating a WebSocket connection), and returns a promise resolved with the corresponding user id.

#### middlewareVersion

The middleware version to use to resolve the user from the id retrieved thanks to the token.

## Example

Following example uses [JWT](https://jwt.io/) for generating tokens, and a relational database holding the users.

### Database

Table `user`:

```text
+----+----------+--------+---------+
| id |   name   |  role  | blog_id |
+----+----------+--------+---------+
|  1 | Admin 1  | admin  |      42 |
|  2 | Author 1 | author |      42 |
|  3 | Author 2 | author |     418 |
+----+----------+--------+---------+
```

### Server-side

```js
const Bow = require("bow");

/*
 * middleware configuration:
 */

const getUserById = async (id) => {
  const results = await dbConnection.query("SELECT * FROM user WHERE id = ?", id);
  if (1 === results.length) {
    return {
      role: result[0]["role"],
      blogId: result[0]["blog_id"]
    };
  } else {
    throw new Error(`Expected one result for user id '${id}', but got ${results.length}`);
  }
};

const predicates = {
  role: (user, role) => user.role === role,
  blogId: (user, blogId) => user.blogId === blogId
};

/*
 * inbound configuration:
 */

const getMessageFromBody = async (body) => ({
  name: body.name,
  payload: body,
  audience: body.audience
});

/*
 * outbound configuration:
 */

// shared with auth server that created the token:
const PRIVATE_KEY = "thisisatopsecretkey";

const getUserIdFromToken = async (token) => {
  const payload = jwt.decrypt(token, PRIVATE_KEY);
  return payload.userId;
};

/*
 * create server:
 */

 const config = {
   port: 443,
   https: { ... }
   inbound: {
     realm: "My blogging platform",
     username: "messagepusher",
     password: "thisisasecret",
     redis: { ... }
   },
   outbound: {
     timeout: 5000 // 5 seconds
   }
 };

const bow = new Bow(config)
  .middleware("v1.1", getUserById, predicates)
  .inbound("/v1.2/messages", getMessageFromBody, "v1.1")
  .outbound("v1.3", getUserIdFromToken, "v1.1");

bow.start().then(() => {
  console.log("Ready!");
});
```

### Client-side

```js
const io = require("socket.io-client");

AuthApi.askForToken().then((token) => {
  const socket = io(url, { query: { v: "v1.3" } })
    .on("welcome", () => {
      console.log("Authenticated!");
    })
    .on("NEW_ARTICLE", (article) => {
      ArticleService.gatherArticle(article);
    })
    .on("connect", () => {
      console.log("Connected!");
      socket.emit("authenticate", token);
    });
});
```

### Push new message

```text
POST /v1.2/messages

{
  name: "NEW_ARTICLE",
  title: "This article has just been created",
  content: "The article content",
  audience: [
    { "role": "admin" },
    { "role": "author", "blogId": 42 }
  ]
}
```

The following users will receive this message:

- Admin 1: `role` is "admin";
- Author 1: `role` is "author" and `blogId` is 42.

The following users will **not** receive this message:

- Author 2: `role` is "author" but `blogId` is 418.
