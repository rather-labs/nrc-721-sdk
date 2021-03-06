# <img src="logo.svg" alt="Rather Labs" height="40px">

**Javascript SDK to interact with NRC-721 compliant NFTs on the Nervos Network.**

## Introduction
`@rather-labs/nrc-721-sdk` is the SDK used to interact with NFTs compliant with NRC-721 Standard on Layer 1 of [Nervos Network](https://www.nervos.org/).

### Instalation

#### In Node.js

The preferred way to install the library is using npm package manager. Simply type the following into a terminal window:

```
npm install @rather-labs/nrc-721-sdk
```

## Usage

```
const NrcSdk = require("@rather-labs/nrc-721-sdk");

const nodeUrl = "http://localhost:8114";
const indexerUrl = "http://localhost:8116";

// Inside an async block
const nftSdk = await NrcSdk.initialize({
  nodeUrl,
  indexerUrl,
});
```

Initialization is needed to load dependencies from the blockchain. After this, the sdk can be used to create Factory Cells, Nfts Cells and read them from the blockchain.

The node and indexer urls should be provided, the ones from the example above should work when running them local. For testing purposes Nervos offers a public testnet node:

```
nodeUrl = "http://3.235.223.161:18114";
indexerUrl = "http://3.235.223.161:18116";
```

The Factory cell uses the built-in `TYPE ID` contract so they can be created without the need to deploy any contract to the blockchain. A NRC-721 contract has been deployed on testnet network and can be used to test implementations:

```
nftContractTypeScript = {
  codeHash: "0x00000000000000000000000000000000000000000000000000545950455f4944",
  hashType: "type",
  args: "0xc2407f8b6ef27a10c35a55ab589e6bfc28db3f2fe5b08cab63384c88a02a14e6"
};
```

## License

Rather Labs NRC-721 is released under the [MIT License](LICENSE).
