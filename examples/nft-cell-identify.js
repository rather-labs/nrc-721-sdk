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
    codeHash: "0x9cef3391f34e14155caf019b47fc6e44ea31263ec87d62666ef0590f9defb774",
    hashType: "type",
    args: "0x00000000000000000000000000000000000000000000000000545950455f4944012366e059b596555e755807c9add9c88b9a9f225f42076282638f9240111414b73f129eddb51174893d4975b08cae0f6f2dc2e3ecb81bf53571d25a4e0237843a"
  };
  
  const isCellNRC721 = await nftCell.isCellNRC721(nftCell_typeScript);
  console.log("nftCell isCellNRC721: ", isCellNRC721);

};

main();
