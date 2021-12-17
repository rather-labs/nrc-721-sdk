/* eslint-disable no-console */
const NrcSdk = require("@rather-labs/nrc-721-sdk");

const nodeUrl = "http://localhost:8114";
const indexerUrl = "http://localhost:8116";

const main = async () => {

  const { nftCell } = await NrcSdk.initialize({
    nodeUrl,
    indexerUrl,
  });

  // Typescript of a minted nft Cell
  const nftCell_typeScript = {
    codeHash: "0x86d189dc114e8290e3d456e9a8b269e2cebf16b49abe80db1268ce4cb63f6f4e",
    hashType: "type",
    args: "0x00000000000000000000000000000000000000000000000000545950455f494401e7163112428f50384027fdadb679b61bc380330d51875dbf0f4e804123cecd141c44c4bc09db538e32b70694fbe4a3578f32a63538d29de6b30056fbaf2e61ff"
  };
  
  const { tokenId, tokenUri, data, rawCell, factoryData } = await nftCell.read(nftCell_typeScript);
  console.log("Nft Token Id: ", tokenId);
  console.log("Nft Token URI: ", tokenUri);
  console.log("Nft Cell Data: ", JSON.parse(data));
  console.log("Factory Data: ", factoryData);
  console.log("Nft Cell: ", rawCell);

};

main();
