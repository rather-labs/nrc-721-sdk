const bignumber = require("bignumber.js");
const axios = require("axios").default;

// use constant to set default limit

// last_cursor is like offset, should came from the result of a previous call, dont try to parse an int!!
// order can be, "asc" or "desc"
module.exports = (indexerUrl = "http://localhost:8116") => {

  const getLiveCellsByLock = async ({ lockScript, limit = 250, last_cursor = null, order = "asc" }) => {

    const post_data = {
      id: Date.now(),
      jsonrpc: "2.0",
      method: "get_cells",
      params: [
        {
          script: {
            code_hash: lockScript.codeHash,
            hash_type: lockScript.hashType,
            args: lockScript.args
          },
          script_type: "lock"
        },
        order,
        "0x" + limit.toString(16),
        last_cursor
      ],
    };

    const post_options = {
      headers: {
        "Content-Type": "application/json",
      }
    };

    return axios.post(indexerUrl, post_data, post_options)
      .then((response) => {
        if (response.data.error) throw Error(response.data.error.message);
        // parse to return cells data structure compatible with ckb-sdk
        const last_cursor = response.data.result.last_cursor;
        const cells = response.data.result.objects.map((value) => ({
          lock: {
            codeHash: value.output.lock.code_hash,
            hashType: value.output.lock.hash_type,
            args: value.output.lock.args,
          },
          type: value.output.type ? {
            codeHash: value.output.type.code_hash,
            hashType: value.output.type.hash_type,
            args: value.output.type.args,
          } : null,
          outPoint: {
            txHash: value.out_point.tx_hash,
            index: value.out_point.index,
          },
          capacity: value.output.capacity,
          data: value.output_data,
        }));
        return ({ cells, last_cursor });
      })
      .catch((error) => {
        throw error;
      });
  };

  const getLiveCellsByType = async ({ typeScript, limit = 250, last_cursor = null, order = "asc" }) => {

    const post_data = {
      id: Date.now(),
      jsonrpc: "2.0",
      method: "get_cells",
      params: [
        {
          script: {
            code_hash: typeScript.codeHash,
            hash_type: typeScript.hashType,
            args: typeScript.args
          },
          script_type: "type"
        },
        order,
        "0x" + limit.toString(16),
        last_cursor
      ],
    };

    const post_options = {
      headers: {
        "Content-Type": "application/json",
      }
    };

    return axios.post(indexerUrl, post_data, post_options)
      .then((response) => {
        if (response.data.error) throw Error(response.data.error.message);
        // parse to return cells data structure compatible with ckb-sdk
        const last_cursor = response.data.result.last_cursor;
        const cells = response.data.result.objects.map((value) => ({
          lock: {
            codeHash: value.output.lock.code_hash,
            hashType: value.output.lock.hash_type,
            args: value.output.lock.args,
          },
          outPoint: {
            txHash: value.out_point.tx_hash,
            index: value.out_point.index,
          },
          capacity: value.output.capacity,
          data: value.output_data,
        }));
        return ({ cells, last_cursor });
      })
      .catch((error) => {
        throw error;
      });
  };

  const getTypeIdCellByTypeScript = async (typeScript) => {

    const typeCell = (await getLiveCellsByType({ typeScript })).cells;
    if (typeCell.lenght > 1) {
      throw new Error("More than one type cell found");
    } else if (typeCell.lenght === 0) {
      throw new Error("No type cell found");
    }

    return typeCell[0];
  };

  const getSpendableCellsByLock = async ({ lockScript, amountCkb = null, maxCells = null }) => {
    let last_cursor = null;
    const cells = [];
    let totalCapacity = 0;

    while (
      last_cursor != "0x"
      && (!amountCkb || bignumber(totalCapacity).lt(amountCkb))
      && (!maxCells || cells.length <= maxCells)
    ) {
      let rawCells = [];
      ({ cells: rawCells, last_cursor } = await getLiveCellsByLock({ lockScript, limit: 100, last_cursor }));
      cells.push(...rawCells.filter((cell) => cell.data === "0x" && !cell.type));
      totalCapacity = cells.reduce((balance, cell) => bignumber(cell.capacity).div(100000000).plus(balance).toFixed(), 0);
    }

    if (maxCells) {
      return cells.slice(0, maxCells);
    }

    return cells;

  };

  return {
    getTypeIdCellByTypeScript,
    getSpendableCellsByLock,
    getLiveCellsByLock,
    getLiveCellsByType,
  };
};
