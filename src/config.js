const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config();

const config = {
  port: Number(process.env.PORT || 3210),
  printRoot: process.env.PRINT_ROOT || "/u/saci/print",
  mysql: {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || ""
  },
  defaultPhoto: "/images/no-image.svg"
};

config.printRoot = path.resolve(config.printRoot);

module.exports = { config };
