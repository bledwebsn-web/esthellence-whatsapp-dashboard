import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

function createMissingDbProxy(): Pool {
  return new Proxy({} as Pool, {
    get(_target, property) {
      if (property === "then") {
        return undefined;
      }

      if (property === "toString") {
        return () => "[missing pg pool]";
      }

      return () => {
        throw new Error("DATABASE_URL is missing");
      };
    },
  });
}

export const db = connectionString
  ? global.pgPool ??
    new Pool({
      connectionString,
    })
  : createMissingDbProxy();

if (connectionString && process.env.NODE_ENV !== "production") {
  global.pgPool = db;
}
