/* eslint-disable no-console */
const NrcSdk = require("@rather-labs/nrc-721-sdk");

const nodeUrl = "http://localhost:8114";
const indexerUrl = "http://localhost:8116";

const main = async () => {

  const { factoryCell } = await NrcSdk.initialize({
    nodeUrl,
    indexerUrl,
  });

  // Typescript of a minted Factory Cell
  const typeScript = {
    codeHash: "0x00000000000000000000000000000000000000000000000000545950455f4944",
    hashType: "type",
    args: "0x2366e059b596555e755807c9add9c88b9a9f225f42076282638f9240111414b7"
  };
  
  const isCellNRC721 = await factoryCell.isCellNRC721(typeScript);
  console.log("factoryCell isCellNRC721: ", isCellNRC721);

};

main();
