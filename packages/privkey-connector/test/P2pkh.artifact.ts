export default {
  contractName: "P2PKH",
  constructorInputs: [
    {
      name: "pkh",
      type: "bytes20"
    }
  ],
  abi: [
    {
      name: "spend",
      inputs: [
        {
          name: "pk",
          type: "pubkey"
        },
        {
          name: "s",
          type: "sig"
        }
      ]
    }
  ],
  bytecode: "OP_OVER OP_HASH160 OP_EQUALVERIFY OP_CHECKSIG",
  source: `contract P2PKH(bytes20 pkh) {
  // Require pk to match stored pkh and signature to match
  function spend(pubkey pk, sig s) {
    require(hash160(pk) == pkh);
    require(checkSig(s, pk));
  }
}
`,
  debug: {
    bytecode: "78a988ac",
    sourceMap: "4:24:4:26;:16::27:1;:8::36;5::5:33",
    logs: [],
    requires: [
      {
        ip: 3,
        line: 4
      },
      {
        ip: 5,
        line: 5
      }
    ]
  },
  compiler: {
    name: "cashc",
    version: "0.11.0"
  },
  updatedAt: "2025-06-16T15:05:57.597Z"
} as const;