import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { agents, Agent, NewAgent, vendors, Vendor, NewVendor } from "../db/schema";

export class AgentModel {
  private db;
  constructor(d1: D1Database) { this.db = drizzle(d1); }

  async getAllByOwner(ownerId: number): Promise<Agent[]> {
    return await this.db.select().from(agents).where(eq(agents.ownerId, ownerId)).all();
  }

  async getById(id: number): Promise<Agent | null> {
    const result = await this.db.select().from(agents).where(eq(agents.id, id)).get();
    return result || null;
  }

  async create(data: NewAgent): Promise<Agent> {
    return await this.db.insert(agents).values(data).returning().get();
  }
}

export class VendorModel {
  private db;
  constructor(d1: D1Database) { this.db = drizzle(d1); }

  async getWhitelisted(): Promise<Vendor[]> {
    return await this.db.select().from(vendors).where(eq(vendors.isWhitelisted, true)).all();
  }

  async getByAddress(address: string): Promise<Vendor | null> {
    const result = await this.db.select().from(vendors).where(eq(vendors.address, address)).get();
    return result || null;
  }

  async create(data: NewVendor): Promise<Vendor> {
    return await this.db.insert(vendors).values(data).returning().get();
  }
}
