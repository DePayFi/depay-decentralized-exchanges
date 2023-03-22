/*#if _EVM

/*#elif _SOLANA

import { request } from '@depay/web3-client-solana'

//#else */

import { request } from '@depay/web3-client'

//#endif

import Raydium from '../basics'

const INITIALIZED = 1
const SWAP = 6

let getAccounts = async (base, quote) => {
  let accounts = await request(`solana://${Raydium.pair.v4.address}/getProgramAccounts`, {
    params: { filters: [
      { dataSize: Raydium.pair.v4.api.span },
      { memcmp: { offset: 400, bytes: base }},
      { memcmp: { offset: 432, bytes: quote }}
    ]},
    api: Raydium.pair.v4.api,
    cache: 3600000,
  })
  return accounts
}

let getPairs = async(base, quote) => {
  try {
    let accounts = await getAccounts(base, quote)
    if(accounts.length == 0) { accounts = await getAccounts(quote, base) }
    return accounts
  } catch(e) {
    console.log(e)
    return []
  }
}

let getPair = async(base, quote) => {
  let accounts = await getPairs(base, quote)
  if(accounts.length == 1){ return accounts[0] }
  if(accounts.length < 1){ return null }
  let best = accounts.reduce((account, current) => {
    if(![INITIALIZED, SWAP].includes(current.data.status.toNumber())) { return }
    let currentReserve = current.data.lpReserve
    let accountReserve = account.data.lpReserve
    if(accountReserve.gte(currentReserve)) {
      return account
    } else {
      return current
    }
  })  
  return best
}

let anyPairs = async(base, quote) => {
  return (await getPairs(base, quote)).length > 0
}

export {
  anyPairs,
  getPair
}
