const CKB = require("@nervosnetwork/ckb-sdk-core").default;

const initialize = async ({
  nodeUrl,
  indexerUrl,
}) => {
  const ckb = new CKB(nodeUrl);
  await ckb.loadDeps();

  const cellCollector = require("./utils/cellCollector")(indexerUrl);

  const collectionCell = require("./collection")({
    cellCollector,
    ckb,
  });

  const nftCell = require("./nft")({
    collectionCell,
    cellCollector,
    ckb,
  });

  return {
    collectionCell,
    nftCell,
    ckb,
  };
};

module.exports = {
  initialize
};
