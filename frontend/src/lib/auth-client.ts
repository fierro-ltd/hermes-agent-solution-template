import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: "",  // Same origin — auth requests are proxied through FastAPI
});
