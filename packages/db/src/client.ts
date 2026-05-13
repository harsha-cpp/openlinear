import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let cached: PrismaClient | undefined;

function getClient(): PrismaClient {
  if (cached) return cached;
  if (globalForPrisma.prisma) {
    cached = globalForPrisma.prisma;
    return cached;
  }
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  cached = new PrismaClient({ adapter });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = cached;
  }
  return cached;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client as unknown as object, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as PrismaClient;

export default prisma;
