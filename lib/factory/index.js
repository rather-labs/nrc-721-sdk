const { CKBToShannon, serializeInputCell, getCellOccupiedCapacity } = require("../utils/utils");

// size of each field in bytes(u8)
const COLECCTION_CELL_DATA_SIZES = {
  name_lenght: 2,
  symbol_lenght: 2,
  baseTokenUri_lenght: 2,
};

module.exports = ({
  cellCollector,
  ckb,
}) => {

  const CONSTANTS = {
    TYPE_CODE_HASH_SIZE: 32,
    TYPE_ARGS_SIZE: 32,
  };

  const { getLiveCellsByLock, getLiveCellsByType } = cellCollector;

  const createNewTypeScript = async ({ rawTransaction, outputIndex, factoryCodeHash }) => {
    /*
      Args:
      TYPE ID [32 bytes]: blake2b hash of serialized first input txHash + this cell output index
    */

    const blake2b_32 = ckb.utils.blake2b(32, null, null, Buffer.from("ckb-default-hash"));
    blake2b_32.update(serializeInputCell(rawTransaction.inputs[0]));
    const inputIndexBuffer = Buffer.alloc(8);
    inputIndexBuffer.writeBigUInt64LE(BigInt(outputIndex));
    blake2b_32.update(inputIndexBuffer);

    const typeScript = {
      codeHash: factoryCodeHash,
      hashType: "type",
      args: "0x" + blake2b_32.digest("hex")
    };

    return typeScript;
  };

  const dataToHex = (data) => {

    // compute strings
    const stringTobuffer = (string, size_field_size) => {
      const size = Buffer.byteLength(string, "utf-8");
      const string_buffer = Buffer.alloc(size + size_field_size);
      const offset = string_buffer.writeUInt16BE(size);
      string_buffer.write(string, offset, "utf-8");
      return string_buffer;
    };

    const stringbuffers = [];
    stringbuffers.push(stringTobuffer(data.name, COLECCTION_CELL_DATA_SIZES.name_lenght));
    stringbuffers.push(stringTobuffer(data.symbol, COLECCTION_CELL_DATA_SIZES.symbol_lenght));
    stringbuffers.push(stringTobuffer(data.baseTokenUri, COLECCTION_CELL_DATA_SIZES.baseTokenUri_lenght));

    const dataBuffer = Buffer.concat([...stringbuffers]);
    const hexData = "0x" + dataBuffer.toString("hex");

    return hexData;

  };

  const parseData = (hexData) => {
    // discard "0x"
    hexData = hexData.slice(2);
    const dataBuffer = Buffer.from(hexData, "hex");
    let offset = 0;

    const data = {};

    // strings
    const bufferToString = (dataBuffer, _offset, size_field_size) => {
      const string_size = dataBuffer.readUInt16BE(_offset);
      if (isNaN(string_size)) {
        throw Error("Invalid string size data");
      }
      _offset += size_field_size;
      return { string: dataBuffer.toString("utf-8", _offset, _offset + string_size), offset: _offset + string_size };
    };

    ({ string: data.name, offset } = bufferToString(dataBuffer, offset, COLECCTION_CELL_DATA_SIZES.name_lenght));
    ({ string: data.symbol, offset } = bufferToString(dataBuffer, offset, COLECCTION_CELL_DATA_SIZES.symbol_lenght));
    ({ string: data.baseTokenUri, offset } = bufferToString(dataBuffer, offset, COLECCTION_CELL_DATA_SIZES.baseTokenUri_lenght));

    return data;

  };

  const mint = async ({
    name,
    symbol,
    baseTokenUri,
    sourceAddress,
    targetAddress,
    fee = 0.0001,
    factoryCodeHash = "0x00000000000000000000000000000000000000000000000000545950455f4944",
  }) => {

    // Initial Factory Data
    const factoryCellData = {
      name,
      symbol,
      baseTokenUri,
    };

    const sourceLockScript = ckb.utils.addressToScript(sourceAddress);
    const targetLockScript = ckb.utils.addressToScript(targetAddress);

    // get unspent cells
    const inputCells = (await getLiveCellsByLock({ lockScript: sourceLockScript })).cells;

    // TODO: check if pw-lock is needed
    // TODO: check if unipass lock is needed

    const outputIndex = 0;
    const hexData = dataToHex(factoryCellData);

    const dummyFactoryTypeScript = await createNewTypeScript({
      rawTransaction: {
        inputs: [{
          since: 0,
          previousOutput: {
            txHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
            index: 0,
          }
        }]
      },
      outputIndex
    });
    const usedCapacity = getCellOccupiedCapacity({ type: dummyFactoryTypeScript, lock: targetLockScript }, hexData);

    // TODO: check capacity needed to issue
    const rawTransaction = ckb.generateRawTransaction({
      fromAddress: sourceAddress,
      toAddress: targetAddress,
      capacity: CKBToShannon(usedCapacity),
      fee: CKBToShannon(fee),
      safeMode: true,
      cells: inputCells,
      deps: [ckb.config.secp256k1Dep],
    });

    // Add Factory cell to tx output
    const factoryTypeScript = await createNewTypeScript({ rawTransaction, outputIndex, factoryCodeHash });
    rawTransaction.outputs[outputIndex].type = factoryTypeScript;
    rawTransaction.outputsData[outputIndex] = hexData;

    return { rawTransaction, typeScript: factoryTypeScript, usedCapacity };
  };

  const readOne = async (typeScript) => {
    const factoryCells = await getLiveCellsByType({ typeScript });
    if (factoryCells.cells.length === 0) {
      throw new Error("Validation Error: no cell found for type script");
    } else if (factoryCells.cells.length > 1) {
      throw new Error("Validation Error: more than one cell for type script");
    }
    // parse cell data
    const factoryData = parseData(factoryCells.cells[0].data);

    factoryCells.cells[0].type = typeScript;

    return { data: factoryData, rawCell: factoryCells.cells[0] };
  };

  return {
    mint,
    readOne,
    CONSTANTS,
  };
};

