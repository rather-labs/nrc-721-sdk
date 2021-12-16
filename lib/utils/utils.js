const shannonToCKB = (amount) => Number(amount / BigInt(1.0e8));

const CKBToShannon = (amount) => BigInt(amount * 1.0e8);

const bigNumberCKBToShannon = (amount) => BigInt(amount) * BigInt(1.0e8);

const hxShannonToCKB = (hexString) => Number(parseInt(hexString, 16) / 1.0e8);

const hexToBytes = (hexString) => {
  let i = 0;
  const bytes = [];
  while ( i < hexString.length ) {
    bytes.push(parseInt(hexString.slice(i, i + 2), 16));
    i += 2;
  }

  return bytes;
};

/**
 * @param {object} input input Cell
 * @return {Buffer} a buffer with the serialized fields of input cell
 */
const serializeInputCell = (inputCell) => {
  const inputBuffer = Buffer.alloc(44);
  // since
  let offset = inputBuffer.writeBigUInt64LE(BigInt(inputCell.since));
  // prev out txhash
  const bytesWritten = inputBuffer.write(inputCell.previousOutput.txHash.slice(2), offset, "hex");
  // prev out index
  offset = inputBuffer.writeUInt32LE(parseInt(inputCell.previousOutput.index, 16), offset + bytesWritten);

  return inputBuffer;
};

/**
 * @param {object} input Cell
 * @param {object} string Cell Hex Data
 * @return {number} the occupied capacity of the cell
 */
const getCellOccupiedCapacity = (cell, cellData) => {

  // Capacity field size
  let totalSize = 8;

  // Lock Script
  // Field sizes
  totalSize += Buffer.byteLength(cell.lock.codeHash.slice(2), "hex");
  totalSize += 1;
  totalSize += Buffer.byteLength(cell.lock.args.slice(2), "hex");

  // Type Script
  if (cell.type) {
    // Field sizes
    totalSize += Buffer.byteLength(cell.type.codeHash.slice(2), "hex");
    totalSize += 1;
    totalSize += Buffer.byteLength(cell.type.args.slice(2), "hex");
  }

  if (cellData) {
    totalSize += Buffer.byteLength(cellData.slice(2), "hex");
  }

  return totalSize;
};

module.exports = {
  getCellOccupiedCapacity,
  bigNumberCKBToShannon,
  serializeInputCell,
  hxShannonToCKB,
  CKBToShannon,
  shannonToCKB,
  hexToBytes,
};
