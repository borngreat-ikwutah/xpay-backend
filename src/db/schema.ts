import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// 1. Consumers
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  address: text('address').notNull().unique(), // User's main wallet/identity
  name: text('name'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// 2. AI Agents (Assistant Identities)
export const agents = sqliteTable('agents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: integer('owner_id').references(() => users.id),
  agentIdOnChain: integer('agent_id_on_chain'), // From AgentNFT/iNFT
  name: text('name').notNull(), // e.g. "DeepSeek Energy Analyst"
  modelType: text('model_type'), // e.g. "DeepSeek-V3", "OpenClaw-70B"
  publicKey: text('public_key').notNull(), // The agent's session key for signing
  status: text('status').default('active'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// 3. Vendors (Service Providers/Merchants)
export const vendors = sqliteTable('vendors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  address: text('address').notNull().unique(), // Vendor's wallet address
  name: text('name').notNull(), // e.g. "Uyo Electricity Board"
  category: text('category'), // e.g. "Utility", "Food", "Transport"
  isWhitelisted: integer('is_whitelisted', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// 4. Policy Guards (The Rules)
export const policies = sqliteTable('policies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id).notNull(),
  agentId: integer('agent_id').references(() => agents.id).notNull(),
  vendorId: integer('vendor_id').references(() => vendors.id), // Nullable means "any vendor"
  maxAmount: real('max_amount').notNull(), // Max USDC per transaction
  timeframe: text('timeframe').default('per_transaction'), // 'daily', 'monthly', 'per_transaction'
  condition: text('condition'), // JSON string of specific logic (e.g. "under 15000")
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// 5. Events (AI Triggers)
export const agentEvents = sqliteTable('agent_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: integer('agent_id').references(() => agents.id).notNull(),
  eventType: text('event_type').notNull(), // e.g. "bill_detected", "purchase_intent"
  description: text('description'),
  rawPayload: text('raw_payload'), // JSON from the AI reasoning
  status: text('status').default('received'), // 'received', 'verified', 'executed', 'rejected'
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// 6. Payments (Execution Records)
export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').references(() => agentEvents.id),
  agentId: integer('agent_id').references(() => agents.id).notNull(),
  vendorId: integer('vendor_id').references(() => vendors.id).notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').default('USDC'),
  storageRoot: text('storage_root'), // 0G Proof of Compute
  txHash: text('tx_hash'), // Base Network transaction hash
  status: text('status').default('pending'), // 'pending', 'completed', 'failed'
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;

export type Policy = typeof policies.$inferSelect;
export type NewPolicy = typeof policies.$inferInsert;

export type AgentEvent = typeof agentEvents.$inferSelect;
export type NewAgentEvent = typeof agentEvents.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
