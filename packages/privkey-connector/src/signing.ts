import {
  WcSignMessageRequest,
  WcSignTransactionRequest,
} from "@bch-wc2/interfaces";
import {
  binToBase64,
  binToHex,
  CompilationContextBch,
  decodeTransaction,
  encodeLockingBytecodeP2pkh,
  encodeTransaction,
  generateSigningSerializationBch,
  generateTransaction,
  hash160,
  hash256,
  hexToBin,
  importWalletTemplate,
  secp256k1,
  sha256,
  SigningSerializationFlag,
  TransactionTemplate,
  utf8ToBin,
  walletTemplateP2pkhNonHd,
  walletTemplateToCompilerBch,
} from "@bitauth/libauth";

export const signWcTransaction = (
  wcSignTransactionRequest: WcSignTransactionRequest,
  signingInfo: {
    privateKey: Uint8Array;
    pubkeyCompressed?: Uint8Array;
    walletLockingBytecodeHex?: string;
  }
): Uint8Array => {
  const { transaction: wcTransactionItem, sourceOutputs } =
    wcSignTransactionRequest;
  const { privateKey } = signingInfo;
  const pubkeyCompressed =
    signingInfo.pubkeyCompressed ??
    (secp256k1.derivePublicKeyCompressed(privateKey) as Uint8Array);
  const walletLockingBytecodeHex =
    signingInfo.walletLockingBytecodeHex ??
    binToHex(encodeLockingBytecodeP2pkh(hash160(pubkeyCompressed)));

  // prepare libauth template for input signing
  const walletTemplate = importWalletTemplate(walletTemplateP2pkhNonHd);
  if (typeof walletTemplate === "string")
    throw new Error("Transaction template error");

  const unsignedTransaction =
    typeof wcTransactionItem === "string"
      ? decodeTransaction(hexToBin(wcTransactionItem))
      : wcTransactionItem;
  // If unsignedTransaction is still a string that means decodeTransaction failed
  if (typeof unsignedTransaction == "string") {
    throw new Error("Transaction template error: " + unsignedTransaction);
  }

  // configure compiler
  const compiler = walletTemplateToCompilerBch(walletTemplate);

  // A Transaction representation that may use compilation directives in place of lockingBytecode and unlockingBytecode instances
  const txTemplate = { ...unsignedTransaction } as TransactionTemplate<
    typeof compiler
  >;

  for (const [index, input] of txTemplate.inputs.entries()) {
    const correspondingSourceOutput = sourceOutputs[
      index
    ] as (typeof sourceOutputs)[number];

    if (correspondingSourceOutput.contract?.artifact.contractName) {
      // instruct compiler to produce signatures for relevant contract inputs

      // replace pubkey and sig placeholders
      let unlockingBytecodeHex = binToHex(
        correspondingSourceOutput.unlockingBytecode
      );
      const sigPlaceholder = "41" + binToHex(Uint8Array.from(Array(65)));
      const pubkeyPlaceholder = "21" + binToHex(Uint8Array.from(Array(33)));
      if (unlockingBytecodeHex.indexOf(sigPlaceholder) !== -1) {
        // compute the signature argument
        const hashType =
          SigningSerializationFlag.allOutputs |
          SigningSerializationFlag.utxos |
          SigningSerializationFlag.forkId;
        const context: CompilationContextBch = {
          inputIndex: index,
          sourceOutputs,
          transaction: unsignedTransaction,
        };
        const signingSerializationType = new Uint8Array([hashType]);

        const coveredBytecode =
          correspondingSourceOutput.contract?.redeemScript;
        if (!coveredBytecode) {
          throw new Error(
            "Not enough information provided, please include contract redeemScript"
          );
        }
        const sighashPreimage = generateSigningSerializationBch(context, {
          coveredBytecode,
          signingSerializationType,
        });
        const sighash = hash256(sighashPreimage);
        const signature = secp256k1.signMessageHashSchnorr(privateKey, sighash);
        if (typeof signature === "string") {
          throw new Error("Signature error: " + signature);
        }
        const sig = Uint8Array.from([...signature, hashType]);

        unlockingBytecodeHex = unlockingBytecodeHex.replace(
          sigPlaceholder,
          "41" + binToHex(sig)
        );
      }
      if (unlockingBytecodeHex.indexOf(pubkeyPlaceholder) !== -1) {
        unlockingBytecodeHex = unlockingBytecodeHex.replace(
          pubkeyPlaceholder,
          "21" + binToHex(pubkeyCompressed)
        );
      }

      input.unlockingBytecode = hexToBin(unlockingBytecodeHex);
    } else {
      // replace unlocking bytecode for placeholder unlockers matching the wallet locking bytecode
      const inputLockingBytecodeHex = binToHex(
        correspondingSourceOutput.lockingBytecode
      );
      if (
        !correspondingSourceOutput.unlockingBytecode?.length &&
        inputLockingBytecodeHex === walletLockingBytecodeHex
      ) {
        input.unlockingBytecode = {
          compiler,
          data: {
            keys: { privateKeys: { key: privateKey } },
          },
          valueSatoshis: correspondingSourceOutput.valueSatoshis,
          script: "unlock",
          token: correspondingSourceOutput.token,
        };
      }
    }
  }

  // generate and encode transaction
  const generated = generateTransaction(txTemplate);
  if (!generated.success) {
    const generationError = generated;
    throw Error(JSON.stringify(generationError, null, 2));
  }

  const encodedTransaction = encodeTransaction(generated.transaction);
  return encodedTransaction;
};

export const signMessage = async (
  signMessageRequest: WcSignMessageRequest,
  privateKey: Uint8Array
): Promise<string | undefined> => {
  const message_magic = (str: string) => {
    const length = utf8ToBin(str).length.toString(16);
    const payload = `\x18Bitcoin Signed Message:\n`;
    return new Uint8Array([
      ...utf8ToBin(payload),
      ...hexToBin(length),
      ...utf8ToBin(str),
    ]);
  };

  const hash_message = (str: string) => {
    return sha256.hash(sha256.hash(message_magic(str)));
  };

  const messageHash = hash_message(signMessageRequest.message);
  const rs = secp256k1.signMessageHashRecoverableCompact(
    privateKey,
    messageHash
  );
  if (typeof rs === "string") {
    throw new Error(rs);
  }

  const electronEncoding = new Uint8Array([
    ...[31 + rs.recoveryId],
    ...rs.signature,
  ]);

  return binToBase64(electronEncoding);
};
