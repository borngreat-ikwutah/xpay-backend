import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CDMTECKTTLNFWDZBVVWV4JRLWWYOYJA5RMTTM75FG5UVXDHPNM6NO5OW",
  }
} as const

export type DataKey = {tag: "Session", values: readonly [string, string]} | {tag: "Whitelist", values: readonly [string]};


export interface Session {
  deadline: u64;
  escrowed_amount: i128;
  limit: i128;
  nonce: u64;
  period: u64;
  period_start: u64;
  spent_in_period: i128;
  token: string;
}

export const ContractError = {
  1: {message:"NotInitialized"},
  2: {message:"Unauthorized"},
  3: {message:"ProviderNotWhitelisted"},
  4: {message:"SessionExpired"},
  5: {message:"LimitExceeded"},
  6: {message:"InvalidAmount"},
  7: {message:"SessionNotFound"},
  8: {message:"InvalidSignature"}
}

export interface Client {
  /**
   * Construct and simulate a pay_service transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * On-chain payment executed by the Agent
   */
  pay_service: ({agent, user, destination, amount}: {agent: string, user: string, destination: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a claim_refund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  claim_refund: ({user, agent}: {user: string, agent: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a init_session transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initializes a payment session. Funds are transferred from user to contract.
   */
  init_session: ({user, agent, token, escrow_amount, limit, period, deadline}: {user: string, agent: string, token: string, escrow_amount: i128, limit: i128, period: u64, deadline: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a claim_sequence transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Off-chain signature settlement with Nonce verification
   */
  claim_sequence: ({user_pubkey, user, agent, destination, total_amount, signature}: {user_pubkey: Buffer, user: string, agent: string, destination: string, total_amount: i128, signature: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a add_approved_provider transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  add_approved_provider: ({owner, provider}: {owner: string, provider: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAgAAAAEAAAAAAAAAB1Nlc3Npb24AAAAAAgAAABMAAAATAAAAAQAAAAAAAAAJV2hpdGVsaXN0AAAAAAAAAQAAABM=",
        "AAAAAQAAAAAAAAAAAAAAB1Nlc3Npb24AAAAACAAAAAAAAAAIZGVhZGxpbmUAAAAGAAAAAAAAAA9lc2Nyb3dlZF9hbW91bnQAAAAACwAAAAAAAAAFbGltaXQAAAAAAAALAAAAAAAAAAVub25jZQAAAAAAAAYAAAAAAAAABnBlcmlvZAAAAAAABgAAAAAAAAAMcGVyaW9kX3N0YXJ0AAAABgAAAAAAAAAPc3BlbnRfaW5fcGVyaW9kAAAAAAsAAAAAAAAABXRva2VuAAAAAAAAEw==",
        "AAAABAAAAAAAAAAAAAAADUNvbnRyYWN0RXJyb3IAAAAAAAAIAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAQAAAAAAAAAMVW5hdXRob3JpemVkAAAAAgAAAAAAAAAWUHJvdmlkZXJOb3RXaGl0ZWxpc3RlZAAAAAAAAwAAAAAAAAAOU2Vzc2lvbkV4cGlyZWQAAAAAAAQAAAAAAAAADUxpbWl0RXhjZWVkZWQAAAAAAAAFAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAABgAAAAAAAAAPU2Vzc2lvbk5vdEZvdW5kAAAAAAcAAAAAAAAAEEludmFsaWRTaWduYXR1cmUAAAAI",
        "AAAAAAAAACZPbi1jaGFpbiBwYXltZW50IGV4ZWN1dGVkIGJ5IHRoZSBBZ2VudAAAAAAAC3BheV9zZXJ2aWNlAAAAAAQAAAAAAAAABWFnZW50AAAAAAAAEwAAAAAAAAAEdXNlcgAAABMAAAAAAAAAC2Rlc3RpbmF0aW9uAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAAAgAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAAMY2xhaW1fcmVmdW5kAAAAAgAAAAAAAAAEdXNlcgAAABMAAAAAAAAABWFnZW50AAAAAAAAEwAAAAEAAAPpAAAAAgAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAEtJbml0aWFsaXplcyBhIHBheW1lbnQgc2Vzc2lvbi4gRnVuZHMgYXJlIHRyYW5zZmVycmVkIGZyb20gdXNlciB0byBjb250cmFjdC4AAAAADGluaXRfc2Vzc2lvbgAAAAcAAAAAAAAABHVzZXIAAAATAAAAAAAAAAVhZ2VudAAAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAANZXNjcm93X2Ftb3VudAAAAAAAAAsAAAAAAAAABWxpbWl0AAAAAAAACwAAAAAAAAAGcGVyaW9kAAAAAAAGAAAAAAAAAAhkZWFkbGluZQAAAAYAAAAA",
        "AAAAAAAAADZPZmYtY2hhaW4gc2lnbmF0dXJlIHNldHRsZW1lbnQgd2l0aCBOb25jZSB2ZXJpZmljYXRpb24AAAAAAA5jbGFpbV9zZXF1ZW5jZQAAAAAABgAAAAAAAAALdXNlcl9wdWJrZXkAAAAD7gAAACAAAAAAAAAABHVzZXIAAAATAAAAAAAAAAVhZ2VudAAAAAAAABMAAAAAAAAAC2Rlc3RpbmF0aW9uAAAAABMAAAAAAAAADHRvdGFsX2Ftb3VudAAAAAsAAAAAAAAACXNpZ25hdHVyZQAAAAAAA+4AAABAAAAAAQAAA+kAAAACAAAH0AAAAA1Db250cmFjdEVycm9yAAAA",
        "AAAAAAAAAAAAAAAVYWRkX2FwcHJvdmVkX3Byb3ZpZGVyAAAAAAAAAgAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAhwcm92aWRlcgAAABMAAAAA" ]),
      options
    )
  }
  public readonly fromJSON = {
    pay_service: this.txFromJSON<Result<void>>,
        claim_refund: this.txFromJSON<Result<void>>,
        init_session: this.txFromJSON<null>,
        claim_sequence: this.txFromJSON<Result<void>>,
        add_approved_provider: this.txFromJSON<null>
  }
}