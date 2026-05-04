import { createPublicClient, createWalletClient, http, parseUnits, Hex, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Bindings } from '../types';
import xPayVaultArtifact from '../abi/xpay-contract.json';

export const zeroGGalileo = defineChain({
  id: 16602,
  name: '0G-Galileo-Testnet',
  nativeCurrency: {
    decimals: 18,
    name: '0G',
    symbol: '0G',
  },
  rpcUrls: {
    default: {
      http: ['https://evmrpc-testnet.0g.ai'],
    },
  },
  blockExplorers: {
    default: {
      name: '0G BlockChain Explorer',
      url: 'https://chainscan-galileo.0g.ai',
    },
  },
  testnet: true,
})

const XPAY_VAULT_ABI = xPayVaultArtifact.abi;

export class XPayGuardService {
  private publicClient;
  private walletClient;
  private account;

  constructor(env: Bindings) {
    const rpcUrl = env.ZG_EVM_RPC || "https://evmrpc-testnet.0g.ai";
    const pKey = env.VENDOR_PRIVATE_KEY as Hex;

    this.account = privateKeyToAccount(pKey);
    this.publicClient = createPublicClient({
      chain: zeroGGalileo,
      transport: http(rpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: zeroGGalileo,
      transport: http(rpcUrl),
    });
  }

  async executeAutonomousPayment(
    vaultAddress: Hex,
    agentId: bigint,
    amount: number,
    storageRoot: Hex,
    signature: Hex
  ) {
    console.log(`[XPayGuard] Executing payment for Agent ${agentId} on Vault ${vaultAddress}`);
    
    // Convert amount to 6 decimals (standard for USDC on many chains) or 18
    const parsedAmount = parseUnits(amount.toString(), 6);

    try {
      const { request } = await this.publicClient.simulateContract({
        address: vaultAddress,
        abi: XPAY_VAULT_ABI,
        functionName: 'claimM2MPayment',
        args: [agentId, parsedAmount, storageRoot, signature],
      });

      const hash = await this.walletClient.writeContract(request);
      console.log(`[XPayGuard] Transaction sent: ${hash}`);
      return hash;
    } catch (error) {
      console.error("[XPayGuard] On-chain execution failed:", error);
      throw error;
    }
  }

  async getAgentSession(vaultAddress: Hex, agentId: bigint) {
    const session = await this.publicClient.readContract({
      address: vaultAddress,
      abi: XPAY_VAULT_ABI,
      functionName: 'agentSessions',
      args: [agentId],
    });
    return session;
  }
}
