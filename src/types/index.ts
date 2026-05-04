import { User as DbUser, NewUser } from "../db/schema";

export interface Bindings {
  DB: D1Database;
  ZG_EVM_RPC: string;
  ZG_STORAGE_INDEXER_RPC: string;
  BASE_RPC_URL: string;
  VENDOR_PRIVATE_KEY: string;
}

export type User = DbUser;
export type { NewUser };

// Add more types here as needed
