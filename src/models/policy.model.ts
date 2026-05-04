import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { policies, Policy, NewPolicy } from "../db/schema";

export class PolicyModel {
  private db;
  constructor(d1: D1Database) { this.db = drizzle(d1); }

  async getAgentPolicies(agentId: number): Promise<Policy[]> {
    return await this.db.select().from(policies).where(eq(policies.agentId, agentId)).all();
  }

  async findSpecificPolicy(agentId: number, vendorId: number | null): Promise<Policy | null> {
    const result = await this.db
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.agentId, agentId),
          vendorId ? eq(policies.vendorId, vendorId) : eq(policies.vendorId, null as any)
        )
      )
      .get();
    return result || null;
  }

  async create(data: NewPolicy): Promise<Policy> {
    return await this.db.insert(policies).values(data).returning().get();
  }
}
