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

Bow exposes two main JSON-based APIs to third party:

- **an HTTP API to push messages**, built on top of [Koa](http://koajs.com/);
- and **a WebSocket API to receive messages**, built on top of [Socket.IO](https://socket.io/).

To ease horizontal scalability, each Bow instance can connect to a Redis message broker.

Bow is built upon these four main concepts:

- **messages**, that must hold the *audience* to which they must be dispatched to;
- **middlewares**, that know how to resolve the messages audiences;
- **inbounds**, which create new HTTP API endpoints;
- and **outbounds**, which create new WebSocket API endpoints.

### Message

A Bow *message* is composed by:

- a *name*, that will be used for the WebSocket event name;
- a *payload*, that will be used for the WebSocket event content;
- and an *audience*, i.e. the tenants the WebSocket event must be dispatched to.

An audience is composed by *queries*, themselves composed by *predicates*.

#### Predicate

A *predicate* is a key-value pair, where keys are strings and **values only one of the following JSON literals**:

- Boolean (`true` or `false`);
- Number (e.g. `42` or `3.14159`);
- String, non-empty (e.g. `"foobar"`).

#### Query

A *query* is a conjunction (logical `AND`) of predicates as a JSON object, for example:

```json
{ "role": "author", "blogId": 42 }
```

The above query is composed by to predicates: `"role": "author"` and `"blogId": 42`. Such a query will thus select only authors of the blog 42, i.e. both predicates must be fulfilled.

#### Audience

An *audience* is a disjunction (logical `OR`) of queries as a JSON array, for example:

```json
[
  { "role": "admin" }
  { "role": "author", "blogId": 42 },
]
```

The above audience is composed by two queries: one selecting admins, and another one selecting the authors of the blog 42. The message holding this audience will thus be dispatched to either admins, or authors of the blog 42.

#### Example

Here is an example of what could be a message:

```json
{
  "name": "NEW_ARTICLE",
  "title": "This article has just been created",
  "content": "The article content...",
  "audience": [
    { "role": "admin" },
    { "role": "author", "blogId": 42 }
  ]
}
```

### Middleware

The purpose of *middlewares* is to resolve an audience so that holding message can be dispatched to the right tenants.

A middleware is composed by:

- a *version* (String, non-empty);
- and a *function*, that creates *criteria* given a *listener's details* via a promise.

#### Criterion

Just like predicates, *criteria* are key-value pairs, where keys are strings and **values only one of the following JSON literals**:

- Boolean (`true` or `false`);
- Number (e.g. `42` or `3.14159`);
- String, non-empty (e.g. `"foobar"`);
- Array (e.g. `[42, 418]`), which values must be only one of the following JSON literals:
  - Boolean (`true` or `false`);
  - Number (e.g. `42` or `3.14159`);
  - String, non-empty (e.g. `"foobar"`).

For example:

```json
{
  "role": "author",
  "blogId": [42, 418]
}
```

The above criteria mean that the listener is an author of the blogs 42 and 418.

#### Resolution

The *resolution* will first try to match the audiences predicates keys with the listeners criteria keys, then the audiences predicates values with the listeners criteria values.

For example, given the following listener criteria:

```json
{
  "role": "author",
  "blogId": [42, 418]
}
```

And the following audience:

```json
[
  { "role": "admin" }
  { "role": "author", "blogId": 42 },
]
```

The first query in the audience (`{ "role": "admin" }`) won't match, because listener's `role` criterion value is `"author"`.

But the second query in the audience (`{ "role": "author", "blogId": 42 }`) will match, because listener's `role` criterion value is `"author"` and they are linked to blog 42.

The message holding this audience will thus be forwarded to the listener.

### Inbound

Messages are pushed via *inbounds*, which are basically HTTP endpoints built thanks to [Koa](http://koajs.com/). Inbounds are protected by [Basic Auth](https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication#Basic_authentication_scheme), which makes it easily compatible with [Amazon SNS](http://docs.aws.amazon.com/sns/latest/dg/SendMessageToHttp.html) for example (if you plan to use Amazon SNS, [sns-validator](https://www.npmjs.com/package/sns-validator) could be useful).

An inbound is composed by:

- a *path* (String, non-empty), **mapped to the HTTP method `POST`**;
- and a *function*, that creates a *message* given a *request body* via a promise.

For example, given the following message:

```json
{
  "name": "NEW_ARTICLE",
  "title": "This article has just been created",
  "content": "The article content...",
  "audience": [
    { "role": "admin" },
    { "role": "author", "blogId": 42 }
  ]
}
```

The function could be:

```js
const createMessageFromRequestBody = async (body) => {
  await validateRequestBody(body);
  return {
    name: body.name,
    payload: body,
    audience: body.audience
  };
};
```

#### Possible HTTP response statuses

- `404` if the URL is not handled;
- `405` if the verb is not handled (paths are mapped to `POST`);
- `401` if no auth is provided or if the provided auth is wrong;
- `422` if no body is provided in the HTTP request or if the provided body cannot be parsed into a _message_;
- `204` otherwise.

### Outbound

*Outbounds* handle WebSocket connections thanks to [Socket.IO](https://socket.io/), and are composed by:

- a *version* (String, non-empty);
- and a *function* that creates a *listener's details* given a *token* via a promise.

A listener's details should be an object that has at least one `id` property, holding a value of **only one of the following JSON literals**:

- Number (e.g. `42` or `3.14159`);
- String, non-empty (e.g. `"foobar"`).

#### Handshake

When connecting to an outbound, the client must provide the outbound version it wants to use in [the Socket.IO handshake query](https://socket.io/docs/client-api/#with-query-option), thanks to a parameter named `v`. Once successfully connected, it must send an `authenticate` event holding the token needed by the outbound to authenticate the connection, along with [an acknowledgement function](https://socket.io/docs/#sending-and-getting-data-(acknowledgements)) that will be called if the client has been successfully authenticated.

If an error occurred in the authentication process, Bow will first send an `alert` event with an explanation, **and will then disconnect the client**.

For example, client-side:

```js
const io = require("socket.io-client");

const url = "...";
const version = "...";
const token = "...";

const socket = io(url, { query: { v: version } })
  .on("error", (error) => {
    console.error("Oops, something's gone wrong:", error);
  })
  .on("alert", (alert) => {
    console.error("Oops, something's gone wrong:", alert);
  })
  .on("connect", () => {
    console.log("Connected!");
    socket.emit("authenticate", token, () => {
      console.log("Authenticated!");
    });
  });
```

#### Possible received WebSocket events

- `error` if a namespace has been provided, or if no version has been provided in the handshake query parameters, or if the provided version if not handled;
- `alert` if the authentication timeout has been reached, or if a listener id could not be found given the provided token, or if no criteria could get built given the listener id.

Any of the above events **will disconnect the client**.

## Usage

### Installation

Bow requires **Node.js v7.6.0 or higher** for ES2015 and async function support.

```text
npm install --save bow
```

### Environment variables

If used in production environment, it is recommended to set the `NODE_ENV` environment variable to `production`.

Because Bow uses [debug](https://www.npmjs.com/package/debug), you should set [the `DEBUG` environment variable](https://www.npmjs.com/package/debug#environment-variables) to `bow:*` (only useful messages will be logged).

These variables can be easily set thanks to [cross-env](https://www.npmjs.com/package/cross-env).

### new Bow(config)

Creates a new `Bow` instance, expects one `config` object argument:

#### config.port

**Required**, the port the server will be listening to.

#### config.https

Optional, the `options` object to pass to [Node.js `https.createServer(...)` function](https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener). If this option is not provided, then an [HTTP server will be created](https://nodejs.org/api/http.html#http_http_createserver_requestlistener) instead.

#### config.redis

Optional, the `options` object to pass to [Redis `redis.createClient(...)` function](https://www.npmjs.com/package/redis#rediscreateclient). If this option is not provided, then no message broker will be used, **which makes your server inconsistent if deployed in a clustered environment**.

#### config.inbound.realm

**Required**, the realm for the Basic Auth protecting the HTTP API.

#### config.inbound.username

**Required**, the username for the Basic Auth protecting the HTTP API.

#### config.inbound.password

**Required**, the password for the Basic Auth protecting the HTTP API.

#### config.outbound.timeout

**Required**, the timeout for WebSocket connections to authenticate, in seconds.

### bow.middleware(config)

Registers a new middleware, expects one `config` object argument:

#### config.version

**Required**, the version of this middleware, must be unique between all middlewares.

#### config.createCriteriaFromListenerDetails

**Required**, a function that takes one single `listenerId` argument, and returns a promise resolved with the corresponding listener criteria.

### bow.inbound(config)

Registers a new inbound, expects one `config` object argument:

#### config.path

**Required**, the path of this inbound, must be unique between all inbounds. This path will then be passed to Koa router, **mapped to the HTTP method `POST`**. **The path cannot be `/health`**, as it is reserved for health check (returns an empty `200` response).

#### config.createMessageFromRequestBody

**Required**, a function that takes one single `body` argument as found in the HTTP request body, and returns a promise resolved with a *message* object, defined by:

- a `name` property, that will be the `eventName` parameter passed to [Socket.IO `socket.emit(...)`](https://socket.io/docs/emit-cheatsheet/);
- a `payload` property, that will be the `eventPayload`parameter passed to [Socket.IO `socket.emit(...)`](https://socket.io/docs/emit-cheatsheet/);
- and an `audience` property, that will passed to the chosen middleware so that it can dispatch the event as expected.

#### config.middlewareVersion

**Required**, the middleware version to use to resolve the audiences found in pushed messages.

### bow.outbound(config)

Registers a new outbound, expects one `config` object argument:

#### config.version

**Required**, the version of this outbound, must be unique between all outbounds.

#### config.createListenerDetailsFromToken

**Required**, a function that takes one single `token` argument (the one provided when authenticating a WebSocket connection), and returns a promise resolved with the corresponding listener details.

#### config.middlewareVersion

**Required**, the middleware version to use to resolve the listener from the id retrieved thanks to the token.

## Example

Following example uses [JWT](https://jwt.io/) for generating tokens, and a relational database holding the users (i.e. the *listeners*).

### Database

Table `listener`:

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

const createCriteriaFromListenerDetails = async (listenerDetails) => {
  const results = await dbConnection.query("SELECT * FROM listener WHERE id = ?", listenerDetails.id);
  if (1 === results.length) {
    const listener = result[0];
    return {
      role: listener["role"],
      blogId: listener["blog_id"]
    };
  } else {
    throw new Error(`Expected one result for listener id '${listenerDetails.id}', but got ${results.length}`);
  }
};

/*
 * inbound configuration:
 */

const createMessageFromRequestBody = async (body) => ({
  name: body.name,
  payload: body,
  audience: body.audience
});

/*
 * outbound configuration:
 */

// shared with auth server that created the token:
const PRIVATE_KEY = "thisisatopsecretkey";

const createListenerDetailsFromToken = async (token) => {
  const payload = jwt.decrypt(token, PRIVATE_KEY);
  return {
    id: payload.listenerId
  };
};

/*
 * create server:
 */

 const config = {
   port: 443,
   https: { ... },
   redis: { ... },
   inbound: {
     realm: "My blogging platform",
     username: "messagepusher",
     password: "thisisasecret"
   },
   outbound: {
     timeout: 5 // seconds
   }
 };

const bow = new Bow(config)
  .middleware({
    version: "v1.1",
    createCriteriaFromListenerDetails
  })
  .inbound({
    path: "/v1.2/messages",
    createMessageFromRequestBody,
    middlewareVersion: "v1.1"
  })
  .outbound({
    version: "v1.3",
    createListenerDetailsFromToken,
    middlewareVersion: "v1.1"
  });

bow.start().then(() => {
  console.log("Ready!");
});
```

### Client-side

```js
const io = require("socket.io-client");

const onError = (error) => console.error("Oops, something's gone wrong:", error);

const onNewArticle = (article) => {
  // ...
};

const socket = io(url, { query: { v: "v1.3" } })
  .on("NEW_ARTICLE", onNewArticle)
  .on("alert", onError)
  .on("error", onError)
  .on("connect", async () => {
    console.log("Connected!");
    const token = await AuthService.getToken();
    socket.emit("authenticate", token, () => {
      console.log("Authenticated!");
    });
  });
```

### Push new message

```text
POST /v1.2/messages

{
  "name": "NEW_ARTICLE",
  "title": "This article has just been created",
  "content": "The article content",
  "audience": [
    { "role": "admin" },
    { "role": "author", "blogId": 42 }
  ]
}
```

The following users will receive this message:

- Admin 1: `role` is `"admin"`;
- Author 1: `role` is `"author"` and `blogId` is `42`.

The following users will **not** receive this message:

- Author 2: `role` is `"author"` but `blogId` is `418`.
