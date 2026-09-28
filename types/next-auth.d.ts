import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      tenantId?: string;
      objectId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tenantId?: string;
    objectId?: string;
  }
}
