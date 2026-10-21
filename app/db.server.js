import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

// Load MONGODB_URI directly from backend/.env so it is not required in root/frontend .env
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;
