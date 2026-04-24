import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import "dotenv/config";

const ENTRY_POINT = process.env.ENTRY_POINT || "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const SETTLEMENT_TOKEN = process.env.SETTLEMENT_TOKEN || "0x7C43825EeB76DF7aAf3e1D2e8f684d4876F0CC05"; // 0G Testnet USDC

const DeploymentModule = buildModule("DeploymentModule", (m) => {
  // 1. Deploy the AgentNFT (Registry)
  const agentNFT = m.contract("AgentNFT");

  // 2. Deploy the xPayVault, passing the AgentNFT address
  const entryPoint = m.getParameter("entryPoint", ENTRY_POINT);
  const settlementToken = m.getParameter("settlementToken", SETTLEMENT_TOKEN);

  const xPayVault = m.contract("xPayVault", [
    entryPoint,
    agentNFT, // The newly deployed registry
    settlementToken
  ]);

  return { agentNFT, xPayVault };
});

export default DeploymentModule;
