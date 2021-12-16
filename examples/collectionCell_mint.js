/* eslint-disable no-console */
const NrcSdk = require("@rather-labs/nrc-721-sdk");

const nodeUrl = "http://localhost:8114";
const indexerUrl = "http://localhost:8116";

// Funding address
const OWNER_ADDRESS = "ckt1qyq80t4rehal4hyrej76nq398s6v7rr25fyqytvncl";
const OWNER_PRIVATE_KEY = "0xc9d3723a34b8144c2b7a2d92c2c0a15f29c03ae80e391d3b6f979674a763300a";

(async () => {

  const { collectionCell, ckb } = await NrcSdk.initialize({
    nodeUrl,
    indexerUrl,
  });

  const { rawTransaction, typeScript, usedCapacity } = await collectionCell.mint({
    name: "Test token collection",
    symbol: "TTC",
    tokenUri: "http://test-token.com",
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

})();
