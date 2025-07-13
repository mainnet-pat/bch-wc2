import { Input, Output, Transaction } from "@bitauth/libauth";

export interface ContractInfo {
  contract?: {
    abiFunction: AbiFunction;
    redeemScript: Uint8Array;
    artifact: Partial<Artifact>;
  }
}

export interface AbiInput {
  name: string;
  type: string;
}

export interface AbiFunction {
  name: string;
  inputs: readonly AbiInput[];
}

export interface Artifact {
  contractName: string;
  constructorInputs: readonly AbiInput[];
  abi: readonly AbiFunction[];
  bytecode: string;
  source: string;
  compiler: {
    name: string;
    version: string;
  }
  updatedAt: string;
}

export type WcSourceOutput = Input & Output & ContractInfo;

export interface WcSignTransactionRequest {
  transaction: Transaction | string;
  sourceOutputs: WcSourceOutput[];
  broadcast?: boolean;
  userPrompt?: string;
}

export interface WcSignTransactionResponse {
  signedTransaction: string;
  signedTransactionHash: string;
}

export interface WcSignMessageRequest {
  message: string;
  userPrompt?: string;
}

export type WcSignMessageResponse = string;
