const CKB = require("@nervosnetwork/ckb-sdk-core").default;

const initialize = async ({
  nodeUrl,
  indexerUrl,
}) => {
  const ckb = new CKB(nodeUrl);
  await ckb.loadDeps();

  const cellCollector = require("./utils/cellCollector")(indexerUrl);

  const factoryCell = require("./factory")({
    cellCollector,
    ckb,
  });

  const nftCell = require("./nft")({
    factoryCell,
    cellCollector,
    ckb,
  });

  return {
    factoryCell,
    nftCell,
    ckb,
  };
};

module.exports = {
  initialize
};
