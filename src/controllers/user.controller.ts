import { Context } from "hono";
import { UserModel } from "../models/user.model";
import { Bindings } from "../types";
import { verifyMessage } from "viem";

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
      return c.json({ message: "User created" }, 201);
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  }

  static async getNonce(c: Context<{ Bindings: Bindings }>) {
    const address = c.req.query("address");
    if (!address) return c.json({ error: "Address is required" }, 400);

    const userModel = new UserModel(c.env.DB);
    let user = await userModel.getByAddress(address);

    if (!user) {
      await userModel.create({ address });
      user = await userModel.getByAddress(address);
    }

    const nonce = `Sign this message to verify your identity: ${crypto.randomUUID()}`;
    await userModel.updateNonce(address, nonce);

    return c.json({ nonce });
  }

  static async verifySignature(c: Context<{ Bindings: Bindings }>) {
    const { address, signature } = await c.req.json();
    if (!address || !signature) {
      return c.json({ error: "Address and signature are required" }, 400);
    }

    const userModel = new UserModel(c.env.DB);
    const user = await userModel.getByAddress(address);

    if (!user || !user.nonce) {
      return c.json(
        { error: "Nonce not found. Please request a nonce first." },
        400,
      );
    }

    try {
      const isValid = await verifyMessage({
        address: address as `0x${string}`,
        message: user.nonce,
        signature: signature as `0x${string}`,
      });

      if (isValid) {
        return c.json({
          message: "Verified",
          verified: true,
          user: { id: user.id, address: user.address },
        });
      } else {
        return c.json({ error: "Invalid signature" }, 401);
      }
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  }
}
