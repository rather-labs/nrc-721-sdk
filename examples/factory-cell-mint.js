/* eslint-disable no-console */
const NrcSdk = require("@rather-labs/nrc-721-sdk");

const nodeUrl = "http://localhost:8114";
const indexerUrl = "http://localhost:8116";

// Funding address
const OWNER_ADDRESS = "CKB_ADDRESS";
const OWNER_PRIVATE_KEY = "PRIVATE_KEY";

const main = async () => {

  const { factoryCell, ckb } = await NrcSdk.initialize({
    nodeUrl,
    indexerUrl,
  });

  const { rawTransaction, typeScript, usedCapacity } = await factoryCell.mint({
    name: "Test token factory",
    symbol: "TTF",
    baseTokenUri: "http://test-token.com",
    sourceAddress: OWNER_ADDRESS,
    targetAddress: OWNER_ADDRESS,
    fee: 0.0001,
  });

  const signedTx = ckb.signTransaction(OWNER_PRIVATE_KEY)(rawTransaction);

  const txHash = await ckb.rpc.sendTransaction(signedTx, "passthrough");

  console.log("Transaction Hash: ", txHash);
  console.log("Used Capacity: ", usedCapacity);
  // This type script should be stored to then retrieve the data if necesary
  console.log("Minted cell Type script: ", typeScript);

};

main();
