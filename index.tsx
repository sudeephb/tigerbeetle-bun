const { AccountFilterFlags } = require("tigerbeetle-node");
const { createClient } = require("tigerbeetle-node");
const { randomFillSync } = require("crypto");
const { resolve4 } = require("dns/promises");

const TB_ADDRESSES = process.env.TB_ADDRESSES;
const TB_PORT = process.env.TB_PORT;

const hostnames = TB_ADDRESSES.split(",");

const addresses = (await Promise.all(hostnames.map(async (hostname) => {
  const ip = await resolve4(hostname);

  console.log(hostname, ip);
  if (ip.length >= 1) {
    return [`${ip[0]}:${TB_PORT}`];
  }

  return [];
}))).flatMap((i) => i);

console.log(addresses);

const client = createClient({
    cluster_id: 0n,
    replica_addresses: addresses,
  });

console.log(client)

const account1 = {
    id: 1n, // TigerBeetle time-based ID.
    debits_pending: 0n,
    debits_posted: 0n,
    credits_pending: 0n,
    credits_posted: 0n,
    user_data_128: 0n,
    user_data_64: 0n,
    user_data_32: 0,
    reserved: 0,
    ledger: 1,
    code: 718,
    flags: 0,
    timestamp: 0n,
};
  
const account2 = {
  id: 2n, // TigerBeetle time-based ID.
  debits_pending: 0n,
  debits_posted: 0n,
  credits_pending: 0n,
  credits_posted: 0n,
  user_data_128: 0n,
  user_data_64: 0n,
  user_data_32: 0,
  reserved: 0,
  ledger: 1,
  code: 718,
  flags: 0,
  timestamp: 0n,
};
  
const account_errors = await client.createAccounts([account1, account2]);

// const accounts = await client.lookupAccounts([1n]);

let idLastTimestamp = 0;
let idLastBuffer = new ArrayBuffer(16);

/**
 * Generates a Universally Unique and Sortable Identifier as a u128 bigint.
 *
 * @remarks
 * Based on {@link https://github.com/ulid/spec}, IDs returned are guaranteed to be monotonically
 * increasing.
 */
export function id(): bigint {
  // Ensure timestamp monotonically increases and generate a new random on each new timestamp.
  let timestamp = Date.now()
  if (timestamp <= idLastTimestamp) {
    timestamp = idLastTimestamp
  } else {
    idLastTimestamp = timestamp
    randomFillSync(new Uint8Array(idLastBuffer))
  }

  const idLastBufferDv = new DataView(idLastBuffer);

  // Increment the u80 in idLastBuffer using carry arithmetic on u32s (as JS doesn't have fast u64).
  const littleEndian = true
  const randomLo32 = idLastBufferDv.getUint32(0, littleEndian) + 1
  const randomHi32 = idLastBufferDv.getUint32(4, littleEndian) + (randomLo32 > 0xFFFFFFFF ? 1 : 0)
  const randomHi16 = idLastBufferDv.getUint16(8, littleEndian) + (randomHi32 > 0xFFFFFFFF ? 1 : 0)
  if (randomHi16 > 0xFFFF) {
    throw new Error('random bits overflow on monotonic increment')
  }

  // Store the incremented random monotonic and the timestamp into the buffer.
  idLastBufferDv.setUint32(0, randomLo32 & 0xFFFFFFFF, littleEndian)
  idLastBufferDv.setUint32(4, randomHi32 & 0xFFFFFFFF, littleEndian)
  idLastBufferDv.setUint16(8, randomHi16, littleEndian) // No need to mask since checked above.
  idLastBufferDv.setUint16(10, timestamp & 0xFFFF, littleEndian) // timestamp lo.
  idLastBufferDv.setUint32(12, (timestamp >>> 16) & 0xFFFFFFFF, littleEndian) // timestamp hi.

  // Then return the buffer's contents as a little-endian u128 bigint.
  const lo = idLastBufferDv.getBigUint64(0, littleEndian)
  const hi = idLastBufferDv.getBigUint64(8, littleEndian)
  return (hi << 64n) | lo
}

const server = Bun.serve({
    port: 3000,
    async fetch(req) {
      const path = new URL(req.url).pathname;
  
      // respond with text/html
      if (path === "/") {
        const filter = {
          account_id: 1n,
          user_data_128: 0n, // No filter by UserData.
          user_data_64: 0n,
          user_data_32: 0,
          code: 0, // No filter by Code.
          timestamp_min: 0n, // No filter by Timestamp.
          timestamp_max: 0n, // No filter by Timestamp.
          limit: 10, // Limit to ten balances at most.
          flags: AccountFilterFlags.debits | // Include transfer from the debit side.
            AccountFilterFlags.credits | // Include transfer from the credit side.
            AccountFilterFlags.reversed, // Sort by timestamp in reverse-chronological order.
        };
        const txs = await client.getAccountTransfers(filter);

        const txsj = JSON.stringify(txs, (_, v) => typeof v === 'bigint' ? v.toString() : v);
        return Response.json(txsj);
      };
  
      if (path === "/trx") {
        const trx = {
          id: id(), // TigerBeetle time-based ID.
          debit_account_id: 1n,
          credit_account_id: 2n,
          amount: 10n,
          pending_id: 0n,
          user_data_128: 0n,
          user_data_64: 0n,
          user_data_32: 0,
          timeout: 0,
          ledger: 1,
          code: 720,
          flags: 0,
          timestamp: 0n,
        }
        await client.createTransfers([trx])

        return new Response(`${trx.id}`);
      }
    },
  });
  
  console.log(`Listening on localhost:${server.port}`);
