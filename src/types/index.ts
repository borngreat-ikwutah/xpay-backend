import { User as DbUser, NewUser } from "../db/schema";

export interface Bindings {
  DB: D1Database;
}

export type User = DbUser;
export type { NewUser };

// Add more types here as needed
