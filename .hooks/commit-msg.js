const fs = require("fs");

const version = require("../package").version;
const message = fs.readFileSync("./.git/COMMIT_EDITMSG", "utf8");

if (!message.startsWith(`[${version}] `)) {
  throw new Error(`[POLICY] Wrong commit message format, must start with "[${version}] "`);
}
