// Bỏ qua kiểm tra TypeScript cho Prisma Client
// @ts-ignore
import { PrismaClient } from '@prisma/client';

declare global {
  // @ts-ignore
  var prisma: PrismaClient | undefined;
}

// Chỉ khởi tạo PrismaClient trên server
const isBrowser = typeof window !== 'undefined';
let prismaInstance: any;

if (!isBrowser) {
  if (process.env.NODE_ENV === 'production') {
    prismaInstance = new PrismaClient();
  } else {
    // Tránh nhiều instances trong development
    if (!global.prisma) {
      global.prisma = new PrismaClient();
    }
    prismaInstance = global.prisma;
  }
} else {
  // Mock object cho client-side
  prismaInstance = {};
}

export const db = prismaInstance;