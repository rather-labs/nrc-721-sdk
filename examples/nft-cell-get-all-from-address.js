/* eslint-disable no-console */
const NrcSdk = require("@rather-labs/nrc-721-sdk");

const nodeUrl = "http://localhost:8114";
const indexerUrl = "http://localhost:8116";

const factoryTypeScript = {
  codeHash: "0x00000000000000000000000000000000000000000000000000545950455f4944",
  hashType: "type",
  args: "0xe7163112428f50384027fdadb679b61bc380330d51875dbf0f4e804123cecd14"
};
// Adress of the user
const userAdress = "CKB_ADDRESS";

const main = async () => {

  const { nftCell } = await NrcSdk.initialize({
    nodeUrl,
    indexerUrl,
  });

  // Use the factory type script to get all nft from an address corresponding to that factory Cell
  const userNftsCells = await nftCell.getAllFactoryNftsByAdress({ userAdress, factoryTypeScript });
  console.log("Nft Cells: ", userNftsCells);

};

main();
