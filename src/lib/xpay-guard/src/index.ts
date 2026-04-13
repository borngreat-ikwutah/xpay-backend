// @ts-nocheck

import {
  AssembledTransaction,
  Client as ContractClient,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";

export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CDMTECKTTLNFWDZBVVWV4JRLWWYOYJA5RMTTM75FG5UVXDHPNM6NO5OW",
  },
} as const;

export const ContractError = {
  1: { message: "NotInitialized" },
  2: { message: "Unauthorized" },
  3: { message: "ProviderNotWhitelisted" },
  4: { message: "SessionExpired" },
  5: { message: "LimitExceeded" },
  6: { message: "InvalidAmount" },
  7: { message: "SessionNotFound" },
  8: { message: "InvalidSignature" },
} as const;

type SignTransactionFn = (xdr: string) => Promise<{
  signedTxXdr: string;
  signerAddress?: string;
}>;

type SignAuthEntryFn = (authEntry: string) => Promise<{
  signedAuthEntry: string;
  signerAddress?: string;
}>;

type XpayGuardClientOptions = ConstructorParameters<
  typeof ContractClient
>[0] & {
  signTransaction?: SignTransactionFn;
  signAuthEntry?: SignAuthEntryFn;
};

export class Client extends ContractClient {
  private readonly signTransaction?: SignTransactionFn;
  private readonly signAuthEntry?: SignAuthEntryFn;

  constructor(options: XpayGuardClientOptions) {
    super(options as ConstructorParameters<typeof ContractClient>[0]);
    this.signTransaction = options.signTransaction;
    this.signAuthEntry = options.signAuthEntry;
  }

  async pay_service(
    {
      agent,
      user,
      destination,
      amount,
    }: { agent: string; user: string; destination: string; amount: bigint },
    options?: any,
  ): Promise<AssembledTransaction<any>> {
    return super.pay_service({ agent, user, destination, amount }, options);
  }

  async claim_refund(
    { user, agent }: { user: string; agent: string },
    options?: any,
  ): Promise<AssembledTransaction<any>> {
    return super.claim_refund({ user, agent }, options);
  }

  async init_session(
    {
      user,
      agent,
      token,
      escrow_amount,
      limit,
      period,
      deadline,
    }: {
      user: string;
      agent: string;
      token: string;
      escrow_amount: bigint;
      limit: bigint;
      period: bigint;
      deadline: bigint;
    },
    options?: any,
  ): Promise<AssembledTransaction<any>> {
    return super.init_session(
      { user, agent, token, escrow_amount, limit, period, deadline },
      options,
    );
  }

  async claim_sequence(
    { user, agent }: { user: string; agent: string },
    options?: any,
  ): Promise<AssembledTransaction<any>> {
    return super.claim_sequence({ user, agent }, options);
  }

  async add_approved_provider(
    { provider, agent }: { provider: string; agent: string },
    options?: any,
  ): Promise<AssembledTransaction<any>> {
    return super.add_approved_provider({ provider, agent }, options);
  }
}

export { AssembledTransaction, ContractClient, ContractSpec };
