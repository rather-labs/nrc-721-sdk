const { CKBToShannon, bigNumberCKBToShannon, getCellOccupiedCapacity, serializeInputCell } = require("../utils/utils");

module.exports = ({
  collectionCell,
  cellCollector,
  ckb,
}) => {

  const { getLiveCellsByLock, getTypeIdCellByTypeScript, getLiveCellsByType } = cellCollector;
  const { readOne: readCollectionCell, CONSTANTS: COLLECTION_CELL_CONSTANTS } = collectionCell;

  const createNewTypeScript = ({ rawTransaction, collectionTypeScript, nftContractTypeScript, outputIndex }) => {
    /*
      Args:
      COLLECTION_CODE_HASH [32 bytes] + COLLECTION_TYPE [uint8] + COLLECTION_ARGS [32 bytes] + TOKEN_ID [32 bytes]
      TOKEN_ID is blake2b hash of serialized first input txHash + this cell output index
    */
    const collectionArgsBuffer = Buffer.alloc(65);
    let bytesWritten = collectionArgsBuffer.write( collectionTypeScript.codeHash.slice(2), "hex" );
    let type_value = 0;
    if (collectionTypeScript.hashType === "type") type_value = 1;
    bytesWritten = collectionArgsBuffer.writeUInt8(type_value, bytesWritten);
    collectionArgsBuffer.write( collectionTypeScript.args.slice(2), bytesWritten, "hex" );

    const blake2b_32 = ckb.utils.blake2b(32, null, null, Buffer.from("ckb-default-hash"));
    blake2b_32.update(serializeInputCell(rawTransaction.inputs[0]));
    const inputIndexBuffer = Buffer.alloc(8);
    inputIndexBuffer.writeBigUInt64LE(BigInt(outputIndex));
    blake2b_32.update(inputIndexBuffer);
    
    const argsBuffer = Buffer.concat([collectionArgsBuffer, blake2b_32.digest()]);

    // type script to point to type cell
    const typeScript = {
      codeHash: ckb.utils.scriptToHash(nftContractTypeScript),
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
    // discard "0x"
    hexData = hexData.slice(2);
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
    collectionTypeScript,
    sourceAddress,
    targetAddress,
    fee = 0.0001,
    data = {},
  }) => {

    // Get Collection cell info
    const { rawCell: collectionCellRaw } = await readCollectionCell(collectionTypeScript);
    // Prepare Collection dependency
    collectionCellRaw.depType = "code";

    const sourceLockScript = ckb.utils.addressToScript(sourceAddress);
    const targetLockScript = ckb.utils.addressToScript(targetAddress);

    // Prepare NFT contract dependency
    const nftTypeCell = await getTypeIdCellByTypeScript(nftContractTypeScript);
    if (!nftTypeCell) {
      throw new Error("Nft Contract Cell dep not Found!");
    }
    nftTypeCell.depType = "code";

    const inputCells = (await getLiveCellsByLock({ lockScript: sourceLockScript })).cells;

    // TODO: check if pw-lock is needed
    // TODO: check if unipass lock is needed

    const outputIndex = 0;
    const hexData = dataToHex(data);

    const dummyCollectionTypeScript = await createNewTypeScript({
      rawTransaction: {
        inputs: [{
          since: 0,
          previousOutput: {
            txHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
            index: 0,
          }
        }]
      },
      collectionTypeScript: collectionCellRaw.type,
      nftContractTypeScript,
      outputIndex,
    });
    const usedCapacity = getCellOccupiedCapacity({ type: dummyCollectionTypeScript, lock: targetLockScript }, hexData);

    // TODO: check capacity needed to issue
    const rawTransaction = ckb.generateRawTransaction({
      fromAddress: sourceAddress,
      toAddress: targetAddress,
      capacity: bigNumberCKBToShannon(usedCapacity),
      fee: CKBToShannon(fee),
      safeMode: true,
      cells: inputCells,
      deps: [ckb.config.secp256k1Dep, nftTypeCell, collectionCellRaw],
    });

    // Add cell with nft
    const nftTypeScript = await createNewTypeScript({ rawTransaction, collectionTypeScript: collectionCellRaw.type, nftContractTypeScript, outputIndex });
    rawTransaction.outputs[outputIndex].type = nftTypeScript;
    rawTransaction.outputsData[outputIndex] = hexData;

    return { rawTransaction, nftTypeScript, usedCapacity };
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
    let end = start + COLLECTION_CELL_CONSTANTS.TYPE_CODE_HASH_SIZE * 2;
    const codeHash = "0x" + nftCell_typeScript.args.slice(start, end);
    start = end;
    end = start + 2;
    const hashType =
      parseInt(nftCell_typeScript.args.slice(start, end)) === 1
        ? "type" : "data";
    start = end;
    end = start + COLLECTION_CELL_CONSTANTS.TYPE_CODE_HASH_SIZE * 2;
    const args = "0x" + nftCell_typeScript.args.slice(start, end);

    const { data: collectionData } = await readCollectionCell({
      codeHash,
      hashType,
      args,
    });

    return { data, collectionData, rawCell: nftCells.cells[0] };
  };

  const getAllCollectionNftsByAdress = async ({ userAdress, collectionTypeScript }) => {
    const userLockScript = ckb.utils.addressToScript(userAdress);

    const collectionArgsBuffer = Buffer.alloc(65);
    let bytesWritten = collectionArgsBuffer.write( collectionTypeScript.codeHash.slice(2), "hex" );
    let type_value = 0;
    if (collectionTypeScript.hashType === "type") type_value = 1;
    bytesWritten = collectionArgsBuffer.writeUInt8(type_value, bytesWritten);
    collectionArgsBuffer.write( collectionTypeScript.args.slice(2), bytesWritten, "hex" );

    const collectionPrefix = collectionArgsBuffer.toString("hex");
    
    // TODO: Add pagination
    // Get all user's live cells
    const userLivecells = await getLiveCellsByLock({ lockScript: userLockScript });
    // filter the ones that belong to our Issuer
    let userNftsCells = userLivecells.cells.filter((cell) => cell.type && (cell.type.args.slice(2, collectionPrefix.length + 2) === collectionPrefix));
    // parse data and add type script hash to cells
    userNftsCells = userNftsCells.map((cell) => {
      cell.data = parseData(cell.data);
      cell.typeScriptHash = ckb.utils.scriptToHash(cell.type);
      return cell;
    });

    return userNftsCells;
  };

  return {
    getAllCollectionNftsByAdress,
    mint,
    read,
  };
};
