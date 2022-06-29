const { CKBToShannon, serializeInputCell, getCellOccupiedCapacity, hxShannonToCKB, getPaymentCells, scriptToBuffer } = require("../utils/utils");
const { EMPTY_WITNESS_ARGS } = require("@nervosnetwork/ckb-sdk-utils/lib/const");

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

  const blake2b_16 = ckb.utils.blake2b(16, null, null, null);
  blake2b_16.update(Buffer.from("NRC-721F"));
  const headerHash = Buffer.alloc(16);
  blake2b_16.digest(headerHash);

  const CONSTANTS = {
    TYPE_CODE_HASH_SIZE: 32,
    TYPE_ARGS_SIZE: 32,
    FACTORY_HEADER: headerHash.toString("hex")
  };

  const { getSpendableCellsByLock, getLiveCellsByType, getTypeIdCellByTypeScript } = cellCollector;

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

  const parseData = (hexData, options = { unsafe: false }) => {

    // discard 0x
    let headerLength = 2;

    if (_isCellNRC721(hexData)) {
      // Also discard header
      headerLength += CONSTANTS.FACTORY_HEADER.length;
    } else {
      // Unsafe allows to read and update a Factory cell that does not have the header yet
      if (!options.unsafe) throw new Error("Validation Error: invalid NRC721 factory cell");
    }
    
    // discard "0x" and header
    hexData = hexData.slice(headerLength);
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

    if (dataBuffer.length >= offset) {
      data.extraData = dataBuffer.toString("hex", offset);
    }

    return data;

  };

  const mint = async ({
    name,
    symbol,
    baseTokenUri,
    sourceAddress,
    targetAddress,
    fee = 0.0001,
    factoryContractTypeScript = null,
    factoryContractDep = null,
    extraDeps = [],
    // Extra data as a Databuffer
    extraData,
  }) => {

    // Initial Factory Data
    const factoryCellData = {
      name,
      symbol,
      baseTokenUri,
    };

    if (extraData && !Buffer.isBuffer(extraData)) throw Error("Extra data should be a Buffer");

    const sourceLockScript = ckb.utils.addressToScript(sourceAddress);
    const targetLockScript = ckb.utils.addressToScript(targetAddress);

    // TODO: check if pw-lock is needed
    // TODO: check if unipass lock is needed

    let hexData = "0x" + CONSTANTS.FACTORY_HEADER + dataToHex(factoryCellData).slice(2);
    if (extraData) hexData += extraData.toString("hex");
    const outputIndex = 0;

    const deps = [ckb.config.secp256k1Dep];
    let factoryCodeHash = "0x00000000000000000000000000000000000000000000000000545950455f4944";
    if (factoryContractDep) {
      deps.push(factoryContractDep);
      factoryCodeHash = factoryContractDep.codeHash;
    } else if (factoryContractTypeScript) {
      // get cell to add as dependency
      const factoryContractCell = await getTypeIdCellByTypeScript(factoryContractTypeScript);
      if (!factoryContractCell) {
        throw new Error("Nft Contract Cell dep not Found!");
      }
      factoryContractCell.depType = "code";
      factoryCodeHash = ckb.utils.scriptToHash(factoryContractTypeScript);
      deps.push(factoryContractCell);
    }

    if (extraDeps.length > 0) deps.push(...extraDeps);

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
      outputIndex,
      factoryCodeHash
    });
    const usedCapacity = getCellOccupiedCapacity({ type: dummyFactoryTypeScript, lock: targetLockScript }, hexData);

    // get unspent cells
    const lockBufffer = scriptToBuffer(sourceLockScript);
    const changeThreshold = lockBufffer.byteLength + 8;
    const inputCells = await getSpendableCellsByLock({ lockScript: sourceLockScript, amountCkb: usedCapacity + changeThreshold });

    // TODO: check capacity needed to issue
    const rawTransaction = ckb.generateRawTransaction({
      fromAddress: sourceAddress,
      toAddress: targetAddress,
      capacity: CKBToShannon(usedCapacity),
      fee: CKBToShannon(fee),
      safeMode: true,
      cells: inputCells,
      deps,
      changeThreshold: BigInt(changeThreshold),
    });

    // Add Factory cell to tx output
    const factoryTypeScript = await createNewTypeScript({ rawTransaction, outputIndex, factoryCodeHash });
    rawTransaction.outputs[outputIndex].type = factoryTypeScript;
    rawTransaction.outputsData[outputIndex] = hexData;

    return { rawTransaction, typeScript: factoryTypeScript, usedCapacity, inputCells };
  };

  const update = async ({
    name = null,
    symbol = null,
    baseTokenUri = null,
    sourceAddress,
    targetAddress = null,
    factoryTypeScript,
    fee = 0.0001,
    factoryContractTypeScript = null,
    factoryContractDep = null,
    extraDeps = [],
    // Extra data as a Databuffer
    extraData = null,
  }) => {

    if (extraData && !Buffer.isBuffer(extraData)) throw Error("Extra data should be a Buffer");

    const sourceLockScript = ckb.utils.addressToScript(sourceAddress);
    let targetLockScript;
    if (targetAddress) targetLockScript = ckb.utils.addressToScript(targetAddress);
    else targetLockScript = ckb.utils.addressToScript(sourceAddress);

    // Get cell to update
    const { rawCell, data } = await readOne(factoryTypeScript, { unsafe: true });

    // Update data
    if (name) data.name = name;
    if (symbol) data.symbol = symbol;
    if (baseTokenUri) data.baseTokenUri = baseTokenUri;

    // Check ownership
    if (
      rawCell.lock.codeHash !== sourceLockScript.codeHash ||
      rawCell.lock.hashType !== sourceLockScript.hashType ||
      rawCell.lock.args !== sourceLockScript.args
    ) throw Error("Cell not owned by sourceAddress");

    // TODO: check if pw-lock is needed
    // TODO: check if unipass lock is needed

    let hexData = "0x" + CONSTANTS.FACTORY_HEADER + dataToHex(data).slice(2);
    if (extraData) hexData += extraData.toString("hex");
    else if (data.extraData) hexData += data.extraData.toString("hex");

    const deps = [ckb.config.secp256k1Dep];
    if (factoryContractDep) {
      deps.push(factoryContractDep);
    } else if (factoryContractTypeScript) {
      // get cell to add as dependency
      const factoryContractCell = await getTypeIdCellByTypeScript(factoryContractTypeScript);
      if (!factoryContractCell) {
        throw new Error("Nft Contract Cell dep not Found!");
      }
      factoryContractCell.depType = "code";
      deps.push(factoryContractCell);
    }
    if (extraDeps.length > 0) deps.push(...extraDeps);

    const usedCapacity = getCellOccupiedCapacity(rawCell, hexData);
    const cellCurrentCapacity = hxShannonToCKB(rawCell.capacity);
    const capacityDifference = cellCurrentCapacity - usedCapacity;

    let rawTransaction, inputCells;
    // Check if Cell can pay for transaction
    if ((capacityDifference > 0) && (capacityDifference > fee)) {
      inputCells = [rawCell];

      const cellOutput = {
        type: rawCell.type,
        lock: targetLockScript,
        capacity: "0x" + (BigInt(rawCell.capacity) - CKBToShannon(fee)).toString(16),
      };

      rawTransaction = {
        version: "0x0",
        cellDeps: deps.map((dep) => ({ outPoint: dep.outPoint, depType: dep.depType })),
        headerDeps: [],
        inputs: inputCells.map((cell) => ({ previousOutput: cell.outPoint, since: "0x0" })),
        outputs: [cellOutput],
        witnesses: [EMPTY_WITNESS_ARGS],
        outputsData: [rawCell.data],
      };

    } else {

      // get unspent cells
      const lockBufffer = scriptToBuffer(sourceLockScript);
      const changeThreshold = lockBufffer.byteLength + 8;
      inputCells = await getSpendableCellsByLock({ lockScript: sourceLockScript, amountCkb: usedCapacity + changeThreshold });

      const { changeCell, inputs } = await getPaymentCells({ amountCKB: (fee - capacityDifference), cells: inputCells });

      const outputCell = {
        type: rawCell.type,
        lock: targetLockScript,
        capacity: "0x" + (CKBToShannon(usedCapacity)).toString(16),
      };

      // Build transaction
      inputs.unshift({ previousOutput: rawCell.outPoint, since: "0x0" });
      inputCells.unshift(rawCell);
      const outputs = [outputCell];
      const outputsData = [hexData];
      if (changeCell) {
        outputs.push(changeCell);
        outputsData.push("0x");
      }
      
      rawTransaction = {
        version: "0x0",
        cellDeps: deps.map((dep) => ({ outPoint: dep.outPoint, depType: dep.depType })),
        headerDeps: [],
        inputs,
        outputs,
        witnesses: inputs.map(() => EMPTY_WITNESS_ARGS),
        outputsData,
        changeThreshold: BigInt(changeThreshold),
      };

    }

    return { rawTransaction, typeScript: factoryTypeScript, usedCapacity, inputCells };
  };

  const readOne = async (typeScript, options = { unsafe: false }) => {
    const factoryCells = await getLiveCellsByType({ typeScript });
    if (factoryCells.cells.length === 0) {
      throw new Error("Validation Error: no cell found for type script");
    } else if (factoryCells.cells.length > 1) {
      throw new Error("Validation Error: more than one cell for type script");
    }
    // parse cell data
    const factoryData = parseData(factoryCells.cells[0].data, options);

    factoryCells.cells[0].type = typeScript;

    return { data: factoryData, rawCell: factoryCells.cells[0] };
  };

  const _isCellNRC721 = (factoryCellData) => {
    if (factoryCellData.length < (2 + CONSTANTS.FACTORY_HEADER.length)) return false;
    const hexData = factoryCellData.slice(2, 2 + CONSTANTS.FACTORY_HEADER.length);
    return hexData === CONSTANTS.FACTORY_HEADER;
  };

  const isCellNRC721 = async (typeScript) => {
    const factoryCells = await getLiveCellsByType({ typeScript });
    if (factoryCells.cells.length === 0) {
      throw new Error("Validation Error: no cell found for type script");
    } else if (factoryCells.cells.length > 1) {
      throw new Error("Validation Error: more than one cell for type script");
    }
    return _isCellNRC721(factoryCells.cells[0].data);
  };

  return {
    mint,
    update,
    readOne,
    isCellNRC721,
    CONSTANTS,
  };
};

