import { Context } from "hono";
import { Bindings } from "../types";
import { AgentModel, VendorModel } from "../models/agent.model";
import { PolicyModel } from "../models/policy.model";
import { EventModel, PaymentModel } from "../models/execution.model";
import { ZGStorageService } from "../services/zg-storage.service";
import { XPayGuardService } from "../services/xpay-guard.service";
import { Hex } from "viem";

export class AgencyController {
  static async triggerExecution(c: Context<{ Bindings: Bindings }>) {
    const body = await c.req.json();
    const { agentId, eventType, vendorAddress, amount, signature, vaultAddress } = body;

    const db = c.env.DB;
    const agentModel = new AgentModel(db);
    const vendorModel = new VendorModel(db);
    const policyModel = new PolicyModel(db);
    const eventModel = new EventModel(db);
    const paymentModel = new PaymentModel(db);
    const zgService = new ZGStorageService(c.env);
    const xPayService = new XPayGuardService(c.env);

    try {
      // 1. Fetch Entities
      const agent = await agentModel.getById(agentId);
      if (!agent) return c.json({ error: "Agent not found" }, 404);

      let vendor = await vendorModel.getByAddress(vendorAddress);
      if (!vendor) {
        // Auto-register vendor if not exists (for demo)
        vendor = await vendorModel.create({ address: vendorAddress, name: "Merchant", isWhitelisted: true });
      }

      // 2. Policy Guard Check (The Core Safety Thesis)
      const policy = await policyModel.findSpecificPolicy(agentId, vendor.id);
      if (!policy || !policy.isActive) {
        return c.json({ error: "No active policy found for this agent/vendor pair" }, 403);
      }

      if (amount > policy.maxAmount) {
        return c.json({ error: `Amount ${amount} exceeds policy limit of ${policy.maxAmount}` }, 403);
      }

      // 3. Log Event
      const event = await eventModel.create({
        agentId,
        eventType,
        description: `Autonomous payment for ${vendor.name}`,
        rawPayload: JSON.stringify(body),
        status: 'verified'
      });

      // 4. Proof of Compute (0G Storage)
      const storageRoot = await zgService.uploadData(
        `Proof of execution for task: ${eventType}. Amount: ${amount}. Vendor: ${vendorAddress}`,
        c.env.VENDOR_PRIVATE_KEY
      ) as Hex;

      // 5. On-Chain Settlement (Base)
      const txHash = await xPayService.executeAutonomousPayment(
        vaultAddress as Hex,
        BigInt(agent.agentIdOnChain || 0),
        amount,
        storageRoot,
        signature as Hex
      );

      // 6. Record Payment
      await paymentModel.create({
        eventId: event.id,
        agentId,
        vendorId: vendor.id,
        amount,
        storageRoot,
        txHash,
        status: 'completed'
      });

      await eventModel.updateStatus(event.id, 'executed');

      return c.json({
        message: "Autonomous execution successful",
        txHash,
        storageRoot
      });

    } catch (error: any) {
      console.error("Agency Execution Error:", error);
      return c.json({ error: error.message }, 500);
    }
  }
}
