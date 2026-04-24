import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { users, User, NewUser } from "../db/schema";

export class UserModel {
  private db;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async getAll(): Promise<User[]> {
    return await this.db.select().from(users).all();
  }

  async getById(id: number): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .get();
    return result || null;
  }

  async getByAddress(address: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.address, address))
      .get();
    return result || null;
  }

  async create(data: NewUser): Promise<void> {
    await this.db.insert(users).values(data).run();
  }
}
