const check = require("check-types");

module.exports = (version) => check.string(version) ? version.replace(/^v/, "") : version;
