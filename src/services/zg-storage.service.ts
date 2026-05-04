import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import { Bindings } from "../types";

export class ZGStorageService {
  private indexerRpc: string;
  private evmRpc: string;

  constructor(env: Bindings) {
    // 0G Storage uses two URLs: The EVM RPC (for the flow contract) and the Indexer RPC (Turbo recommended)
    this.evmRpc = env.ZG_EVM_RPC || "https://evmrpc-testnet.0g.ai";
    this.indexerRpc = env.ZG_STORAGE_INDEXER_RPC || "https://indexer-storage-testnet-turbo.0g.ai";
  }

  async uploadData(content: string, privateKey: string): Promise<string> {
    try {
      // 1. Initialize configuration
      const provider = new ethers.JsonRpcProvider(this.evmRpc);
      const signer = new ethers.Wallet(privateKey, provider);
      const indexer = new Indexer(this.indexerRpc);

      // 2. Prepare In-Memory Data
      const data = new TextEncoder().encode(content);
      const memData = new MemData(data);

      // 3. Generate Merkle Tree (Required before upload)
      const [tree, treeErr] = await memData.merkleTree();
      if (treeErr !== null) throw new Error(`Merkle tree error: ${treeErr}`);

      const rootHash = tree?.rootHash();
      console.log(`[0G] Generated Root Hash: ${rootHash}`);

      // 4. Upload to 0G Storage
      const [tx, uploadErr] = await indexer.upload(memData, this.evmRpc, signer);
      if (uploadErr !== null) throw new Error(`Upload error: ${uploadErr}`);

      // 5. Handle response
      if (tx && 'rootHash' in tx) {
        return tx.rootHash;
      } else if (tx && 'rootHashes' in tx) {
        return tx.rootHashes[0];
      }

      return rootHash || "";
    } catch (error) {
      console.error("[0G Service] Failed to anchor data:", error);
      throw error;
    }
  }
}
