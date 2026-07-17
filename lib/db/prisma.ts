import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL

  // During `next build`, DATABASE_URL is not injected yet.
  // Return a stub proxy so the module can be imported at build time;
  // any actual DB call at runtime will still get a clear error if unset.
  if (!connectionString) {
    return new Proxy({} as PrismaClient, {
      get(_t, prop) {
        throw new Error(
          `DATABASE_URL is not set — cannot call prisma.${String(prop)} at runtime`
        )
      },
    })
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
