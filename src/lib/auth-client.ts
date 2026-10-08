import { createAuthClient } from "better-auth/react";

// 同源（/api/auth/*），不需要 baseURL；client 預設帶 credentials: "include"。
export const authClient = createAuthClient();

export const { useSession, signIn, signUp, signOut } = authClient;
