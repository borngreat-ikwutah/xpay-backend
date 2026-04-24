import { Context } from 'hono';
import { UserModel } from '../models/user.model';
import { Bindings } from '../types';

export class UserController {
  static async getUsers(c: Context<{ Bindings: Bindings }>) {
    const userModel = new UserModel(c.env.DB);
    const users = await userModel.getAll();
    return c.json(users);
  }

  static async createUser(c: Context<{ Bindings: Bindings }>) {
    const body = await c.req.json();
    const userModel = new UserModel(c.env.DB);

    try {
      await userModel.create({
        address: body.address,
        name: body.name,
      });
      return c.json({ message: 'User created' }, 201);
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  }
}
