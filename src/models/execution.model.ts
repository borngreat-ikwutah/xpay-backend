import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { agentEvents, AgentEvent, NewAgentEvent, payments, Payment, NewPayment } from "../db/schema";

export class EventModel {
  private db;
  constructor(d1: D1Database) { this.db = drizzle(d1); }

  async getByAgent(agentId: number): Promise<AgentEvent[]> {
    return await this.db.select().from(agentEvents).where(eq(agentEvents.agentId, agentId)).all();
  }

  async create(data: NewAgentEvent): Promise<AgentEvent> {
    return await this.db.insert(agentEvents).values(data).returning().get();
  }

  async updateStatus(id: number, status: string): Promise<void> {
    await this.db.update(agentEvents).set({ status }).where(eq(agentEvents.id, id)).run();
  }
}

export class PaymentModel {
  private db;
  constructor(d1: D1Database) { this.db = drizzle(d1); }

  async getRecent(): Promise<Payment[]> {
    return await this.db.select().from(payments).orderBy(payments.createdAt).all();
  }

  async create(data: NewPayment): Promise<Payment> {
    return await this.db.insert(payments).values(data).returning().get();
  }

  async updateTx(id: number, txHash: string, status: string = 'completed'): Promise<void> {
    await this.db.update(payments).set({ txHash, status }).where(eq(payments.id, id)).run();
  }
}
