import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const createPrismaClient = () => {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });

  return new PrismaClient({ adapter }).$extends({
    query: {
      user: {
        // Legacy/backfill policy:
        // 1. WRITES: Blocked. No new accessTokens can be written to the DB.
        // 2. READS: Allowed. Existing tokens can still be read during the migration period.
        // 3. DELETES: Allowed. Setting accessToken to null is permitted to clear legacy tokens.
        // 4. TARGET: Complete removal of the accessToken field from the schema in a future release.
        async create({ args, query }) {
          if (args.data?.accessToken !== undefined && args.data?.accessToken !== null) {
            throw new Error('Writing accessToken to database is deprecated and blocked.');
          }
          return query(args);
        },
        async createMany({ args, query }) {
          const dataArray = Array.isArray(args.data) ? args.data : [args.data];
          for (const data of dataArray) {
            if (data?.accessToken !== undefined && data?.accessToken !== null) {
              throw new Error('Writing accessToken to database is deprecated and blocked.');
            }
          }
          return query(args);
        },
        async update({ args, query }) {
          if (args.data?.accessToken !== undefined && args.data?.accessToken !== null) {
            throw new Error('Writing accessToken to database is deprecated and blocked.');
          }
          return query(args);
        },
        async upsert({ args, query }) {
          if (args.create?.accessToken !== undefined && args.create?.accessToken !== null) {
            throw new Error('Writing accessToken to database is deprecated and blocked.');
          }
          if (args.update?.accessToken !== undefined && args.update?.accessToken !== null) {
            throw new Error('Writing accessToken to database is deprecated and blocked.');
          }
          return query(args);
        },
        async updateMany({ args, query }) {
          if (args.data?.accessToken !== undefined && args.data?.accessToken !== null) {
            throw new Error('Writing accessToken to database is deprecated and blocked.');
          }
          return query(args);
        }
      }
    }
  });
};

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

function getPrismaClient(): ExtendedPrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const client = createPrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }

  return client;
}

export const prisma = new Proxy({} as ExtendedPrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    return (client as any)[prop];
  },
});

export default prisma;
