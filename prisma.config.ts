import { defineConfig } from 'prisma/config'

// earlyAccess is a valid Prisma 7 runtime option (types lag behind)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default (defineConfig as any)({
  earlyAccess: true,
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
})
