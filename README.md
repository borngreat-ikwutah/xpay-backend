```txt
npm install
npm run dev
```

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```
eploying [ DeploymentModule ]

Batch #1
  Executed DeploymentModule#AgentNFT

Batch #2
  Executed DeploymentModule#xPayVault

[ DeploymentModule ] successfully deployed 🚀

Deployed Addresses

DeploymentModule#AgentNFT - 0x377C8667eB1fA1a686DCc25F9b55b57F4923d8F8

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
