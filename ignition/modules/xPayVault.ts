import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import "dotenv/config";

// Default placeholders or environment variables
const ENTRY_POINT =
  process.env.ENTRY_POINT || "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"; // Standard v0.6 EntryPoint
const AGENT_REGISTRY =
  process.env.AGENT_REGISTRY || "0x0000000000000000000000000000000000000000";
const SETTLEMENT_TOKEN =
  process.env.SETTLEMENT_TOKEN || "0x7C43825EeB76DF7aAf3e1D2e8f684d4876F0CC05"; // 0G Testnet USDC

const xPayVaultModule = buildModule("xPayVaultModule", (m) => {
  const entryPoint = m.getParameter("entryPoint", ENTRY_POINT);
  const agentRegistry = m.getParameter("agentRegistry", AGENT_REGISTRY);
  const settlementToken = m.getParameter("settlementToken", SETTLEMENT_TOKEN);

  const xPayVault = m.contract("xPayVault", [
    entryPoint,
    agentRegistry,
    settlementToken,
  ]);

  return { xPayVault };
});

export default xPayVaultModule;
