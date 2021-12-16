/* eslint-disable no-console */
const NrcSdk = require("@rather-labs/nrc-721-sdk");

const nodeUrl = "http://localhost:8114";
const indexerUrl = "http://localhost:8116";

// Founding address
const OWNER_ADDRESS = "CKB_ADDRESS";
const OWNER_PRIVATE_KEY = "PRIVATE_KEY";

// Type Script of nft Contract
const nftContractTypeScript = {
  codeHash: "0x00000000000000000000000000000000000000000000000000545950455f4944",
  hashType: "type",
  args: "0xa557cb3e137801259f55ccca6dad55e8d4df51e9462471b4f9fa7dd7ab9df108"
};

const main = async () => {

  const { nftCell, ckb } = await NrcSdk.initialize({
    nodeUrl,
    indexerUrl,
  });

  // Type Script of class Cell minted
  const factoryTypeScript = {
    codeHash: "0x00000000000000000000000000000000000000000000000000545950455f4944",
    hashType: "type",
    args: "0xe7163112428f50384027fdadb679b61bc380330d51875dbf0f4e804123cecd14"
  };

  const { rawTransaction, nftTypeScript, usedCapacity } = await nftCell.mint({
    nftContractTypeScript,
    factoryTypeScript,
    sourceAddress: OWNER_ADDRESS,
    targetAddress: OWNER_ADDRESS,
    fee: 0.0001,
    data: {
      someKey: "SomeValue",
      anotherKey: "AnotherValue",
    },
  });

  const signedTx = ckb.signTransaction(OWNER_PRIVATE_KEY)(rawTransaction);

  const txHash = await ckb.rpc.sendTransaction(signedTx, "passthrough");

  console.log("Transaction Hash: ", txHash);
  console.log("Used Capacity: ", usedCapacity);
  // This type script should be stored to then retrieve the data if necesary
  console.log("Minted cell Type script: ", nftTypeScript);

};

main();
