const { CKBToShannon, bigNumberCKBToShannon, getCellOccupiedCapacity, serializeInputCell, scriptToBuffer } = require("../utils/utils");

module.exports = ({
  factoryCell,
  cellCollector,
  ckb,
}) => {

  const blake2b_16 = ckb.utils.blake2b(16, null, null, null);
  blake2b_16.update(Buffer.from("NRC-721T"));
  const headerHash = Buffer.alloc(16);
  blake2b_16.digest(headerHash);

  const CONSTANTS = {
    TOKEN_HEADER: headerHash.toString("hex"),
  };

  const { getLiveCellsByLock, getSpendableCellsByLock, getTypeIdCellByTypeScript, getLiveCellsByType } = cellCollector;
  const { readOne: readFactoryCell, CONSTANTS: FACTORY_CELL_CONSTANTS } = factoryCell;

  const createNewTypeScript = ({ rawTransaction, factoryTypeScript, nftTypeCodeHash, outputIndex }) => {
    /*
      Args:
      FACTORY_CODE_HASH [32 bytes] + FACTORY_TYPE [uint8] + FACTORY_ARGS [32 bytes] + TOKEN_ID [32 bytes]
      TOKEN_ID is blake2b hash of serialized first input txHash + this cell output index
    */
    const factoryArgsBuffer = Buffer.alloc(65);
    let bytesWritten = factoryArgsBuffer.write( factoryTypeScript.codeHash.slice(2), "hex" );
    let type_value = 0;
    if (factoryTypeScript.hashType === "type") type_value = 1;
    bytesWritten = factoryArgsBuffer.writeUInt8(type_value, bytesWritten);
    factoryArgsBuffer.write( factoryTypeScript.args.slice(2), bytesWritten, "hex" );

    const blake2b_32 = ckb.utils.blake2b(32, null, null, Buffer.from("ckb-default-hash"));
    blake2b_32.update(serializeInputCell(rawTransaction.inputs[0]));
    const inputIndexBuffer = Buffer.alloc(8);
    inputIndexBuffer.writeBigUInt64LE(BigInt(outputIndex));
    blake2b_32.update(inputIndexBuffer);
    
    const argsBuffer = Buffer.concat([factoryArgsBuffer, blake2b_32.digest()]);

    // type script to point to type cell
    const typeScript = {
      codeHash: nftTypeCodeHash,
      hashType: "type",
      args: "0x" + argsBuffer.toString("hex"),
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
    const jsonData = JSON.stringify(data);
    stringbuffers.push(stringTobuffer(jsonData, Buffer.byteLength(jsonData, "utf8")));

    const dataBuffer = Buffer.concat([...stringbuffers]);
    const hexData = "0x" + dataBuffer.toString("hex");

    return hexData;

  };

  const parseData = (hexData) => {

    if (!_isCellNRC721(hexData)) {
      throw new Error("Validation Error: invalid NRC721 token cell");
    }

    // discard "0x" and header
    hexData = hexData.slice(2 + CONSTANTS.TOKEN_HEADER.length);
    const dataBuffer = Buffer.from(hexData, "hex");

    // strings
    const bufferToString = (dataBuffer) => {
      const string_size = dataBuffer.readUInt16BE();
      if (isNaN(string_size)) {
        throw Error("Invalid string size data");
      }
      return dataBuffer.toString("utf-8", 2, 2 + string_size);
    };

    return bufferToString(dataBuffer);

  };

  const mint = async ({
    nftContractTypeScript,
    factoryTypeScript,
    sourceAddress,
    targetAddress,
    nftContractDep = null,
    extraDeps = [],
    fee = 0.0001,
    data = {},
  }) => {

    // Get Factory cell info
    const { rawCell: factoryCellRaw } = await readFactoryCell(factoryTypeScript);
    // Prepare Factory dependency
    factoryCellRaw.depType = "code";

    const sourceLockScript = ckb.utils.addressToScript(sourceAddress);
    const targetLockScript = ckb.utils.addressToScript(targetAddress);

    // Prepare NFT contract dependency
    let nftTypeCell;
    let nftTypeCodeHash;
    if (nftContractDep) {
      nftTypeCell = nftContractDep;
      nftTypeCodeHash = nftContractDep.codeHash;
    } else {
      nftTypeCell = await getTypeIdCellByTypeScript(nftContractTypeScript);
      if (!nftTypeCell) {
        throw new Error("Nft Contract Cell dep not Found!");
      }
      nftTypeCell.depType = "code";
      nftTypeCodeHash = ckb.utils.scriptToHash(nftContractTypeScript);
    }

    // TODO: check if pw-lock is needed
    // TODO: check if unipass lock is needed

    const hexData = "0x" + CONSTANTS.TOKEN_HEADER + dataToHex(data).slice(2);
    const outputIndex = 0;

    const dummyTypeScript = await createNewTypeScript({
      rawTransaction: {
        inputs: [{
          since: 0,
          previousOutput: {
            txHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
            index: 0,
          }
        }]
      },
      factoryTypeScript: factoryCellRaw.type,
      nftTypeCodeHash,
      outputIndex,
    });
    const usedCapacity = getCellOccupiedCapacity({ type: dummyTypeScript, lock: targetLockScript }, hexData);

    const lockBufffer = scriptToBuffer(sourceLockScript);
    const changeThreshold = lockBufffer.byteLength + 8;
    const inputCells = await getSpendableCellsByLock({ lockScript: sourceLockScript, amountCkb: usedCapacity + changeThreshold });

    // TODO: check capacity needed to issue
    const rawTransaction = ckb.generateRawTransaction({
      fromAddress: sourceAddress,
      toAddress: targetAddress,
      capacity: bigNumberCKBToShannon(usedCapacity),
      fee: CKBToShannon(fee),
      safeMode: true,
      cells: inputCells,
      deps: [ckb.config.secp256k1Dep, nftTypeCell, factoryCellRaw, ...extraDeps],
      changeThreshold: BigInt(changeThreshold * 10E8),
    });

    // Add cell with nft
    const nftTypeScript = await createNewTypeScript({ rawTransaction, factoryTypeScript: factoryCellRaw.type, nftTypeCodeHash, outputIndex });
    rawTransaction.outputs[outputIndex].type = nftTypeScript;
    rawTransaction.outputsData[outputIndex] = hexData;

    return { rawTransaction, nftTypeScript, usedCapacity, inputCells };
  };

  const read = async (nftCell_typeScript) => {
    const nftCells = await getLiveCellsByType({ typeScript: nftCell_typeScript });
    if (nftCells.cells.length === 0) {
      throw new Error("Cell not found");
    } else if (nftCells.cells.length > 1) {
      throw new Error("Validation Error: more than one cell with nft type script");
    }

    const data = parseData(nftCells.cells[0].data);

    nftCells.cells[0].type = nftCell_typeScript;

    let start = 2;
    let end = start + FACTORY_CELL_CONSTANTS.TYPE_CODE_HASH_SIZE * 2;
    const codeHash = "0x" + nftCell_typeScript.args.slice(start, end);
    start = end;
    end = start + 2;
    const hashType =
      parseInt(nftCell_typeScript.args.slice(start, end)) === 1
        ? "type" : "data";
    start = end;
    end = start + FACTORY_CELL_CONSTANTS.TYPE_CODE_HASH_SIZE * 2;
    const args = "0x" + nftCell_typeScript.args.slice(start, end);
    const tokenId = nftCell_typeScript.args.slice(end);

    const { data: factoryData } = await readFactoryCell({
      codeHash,
      hashType,
      args,
    });

    const tokenUri = factoryData.baseTokenUri + "/" + tokenId;

    return { tokenId, tokenUri, data, factoryData, rawCell: nftCells.cells[0] };
  };

  const getAllFactoryNftsByAdress = async ({ userAdress, factoryTypeScript }) => {
    const userLockScript = ckb.utils.addressToScript(userAdress);

    const factoryArgsBuffer = Buffer.alloc(65);
    let bytesWritten = factoryArgsBuffer.write( factoryTypeScript.codeHash.slice(2), "hex" );
    let type_value = 0;
    if (factoryTypeScript.hashType === "type") type_value = 1;
    bytesWritten = factoryArgsBuffer.writeUInt8(type_value, bytesWritten);
    factoryArgsBuffer.write( factoryTypeScript.args.slice(2), bytesWritten, "hex" );

    const factoryPrefix = factoryArgsBuffer.toString("hex");
    
    // TODO: Add pagination
    // Get all user's live cells
    const userLivecells = await getLiveCellsByLock({ lockScript: userLockScript });
    // filter the ones that belong to our Issuer
    let userNftsCells = userLivecells.cells.filter((cell) => cell.type && (cell.type.args.slice(2, factoryPrefix.length + 2) === factoryPrefix));
    // parse data and add type script hash to cells
    userNftsCells = userNftsCells.map((cell) => {
      cell.data = parseData(cell.data);
      cell.typeScriptHash = ckb.utils.scriptToHash(cell.type);
      return cell;
    });

    return userNftsCells;
  };

  const _isCellNRC721 = (nftCellData) => {
    if (nftCellData.length < (2 + CONSTANTS.TOKEN_HEADER.length)) return false;
    const hexData = nftCellData.slice(2, 2 + CONSTANTS.TOKEN_HEADER.length);
    return hexData === CONSTANTS.TOKEN_HEADER;
  };

  const isCellNRC721 = async (nftCell_typeScript) => {
    const nftCells = await getLiveCellsByType({ typeScript: nftCell_typeScript });
    if (nftCells.cells.length === 0) {
      throw new Error("Cell not found");
    } else if (nftCells.cells.length > 1) {
      throw new Error("Validation Error: more than one cell with nft type script");
    }
    return _isCellNRC721(nftCells.cells[0].data);
  };

  return {
    getAllFactoryNftsByAdress,
    createNewTypeScript,
    isCellNRC721,
    mint,
    read,
    CONSTANTS,
  };
};
