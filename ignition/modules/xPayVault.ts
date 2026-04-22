import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const AGENT_REGISTRY_ADDRESS = "0x0000000000000000000000000000000000000000"; // Placeholder

const xPayVaultModule = buildModule("xPayVaultModule", (m) => {
  const agentRegistry = m.getParameter("agentRegistry", AGENT_REGISTRY_ADDRESS);
  const xPayVault = m.contract("xPayVault", [agentRegistry]);

  return { xPayVault };
});

export default xPayVaultModule;
