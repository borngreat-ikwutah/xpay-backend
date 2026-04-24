require("@nomicfoundation/hardhat-toolbox-viem");
require("dotenv").config();

const PRIVATE_KEY =
  process.env.PRIVATE_KEY ||
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    "0g-chain": {
      url: process.env.RPC_URL || "https://evmrpc-testnet.0g.ai",
      accounts: [PRIVATE_KEY],
      chainId: 16602,
    },
  },
};
