/* eslint-disable no-console */
const NrcSdk = require("@rather-labs/nrc-721-sdk");

const nodeUrl = "http://localhost:8114";
const indexerUrl = "http://localhost:8116";

(async () => {

  const { collectionCell } = await NrcSdk.initialize({
    nodeUrl,
    indexerUrl,
  });

  // Typescript of a minted Collection Cell
  const typeScript = {
    codeHash: "0x00000000000000000000000000000000000000000000000000545950455f4944",
    hashType: "type",
    args: "0xe7163112428f50384027fdadb679b61bc380330d51875dbf0f4e804123cecd14"
  };
  
  const { data, rawCell } = await collectionCell.readOne(typeScript);
  console.log("Collection Cell Data: ", data);
  console.log("Collection Cell: ", rawCell);

})();
