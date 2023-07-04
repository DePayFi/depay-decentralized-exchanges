/*#if _EVM

import Token from '@depay/web3-tokens-evm'
import { ethers } from 'ethers'
import { request } from '@depay/web3-client-evm'

/*#elif _SOLANA

//#else */

import Token from '@depay/web3-tokens'
import { ethers } from 'ethers'
import { request } from '@depay/web3-client'

//#endif

import Blockchains from '@depay/web3-blockchains'

// Replaces 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE with the wrapped token and implies wrapping.
//
// We keep 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE internally
// to be able to differentiate between ETH<>Token and WETH<>Token swaps
// as they are not the same!
//
const getExchangePath = (blockchain, exchange, path) => {
  if(!path) { return }
  let exchangePath = path.map((token, index) => {
    if (
      token === Blockchains[blockchain].currency.address && path[index+1] != Blockchains[blockchain].wrapped.address &&
      path[index-1] != Blockchains[blockchain].wrapped.address
    ) {
      return Blockchains[blockchain].wrapped.address
    } else {
      return token
    }
  })

  if(exchangePath[0] == Blockchains[blockchain].currency.address && exchangePath[1] == Blockchains[blockchain].wrapped.address) {
    exchangePath.splice(0, 1)
  } else if(exchangePath[exchangePath.length-1] == Blockchains[blockchain].currency.address && exchangePath[exchangePath.length-2] == Blockchains[blockchain].wrapped.address) {
    exchangePath.splice(exchangePath.length-1, 1)
  }

  return exchangePath
}

const findPath = async ({ blockchain, exchange, tokenIn, tokenOut }) => {
  
  let pools
  let pool = getPool(blockchain, exchange, getExchangePath(blockchain, exchange, [tokenIn, tokenOut]))
  let path

  if(pool) {
    path = [tokenIn, tokenOut]
    pools = [pool]
  }

  return { path, pools, exchangePath: getExchangePath(blockchain, exchange, path) }
}

const pathExists = async (blockchain, exchange, path) => {
  return !!getPool(blockchain, exchange, path)
}

const getPool = (blockchain, exchange, path) => {
  let pool = exchange[blockchain].pools.find((pool)=>{
    return pool.coins.includes(path[0]) && pool.coins.includes(path[1])
  })
  return pool
}

let getAmountOut = async(blockchain, exchange, { path, pools, amountIn, tokenIn, tokenOut }) => {
  path = getExchangePath(blockchain, exchange, path)
  if(pools[0].onlyStablecoins) { return amountIn }
  return request({
    blockchain: blockchain,
    address: pools[0].address,
    method: 'get_dy',
    api: exchange[blockchain].pool.api,
    params: [pools[0].coins.indexOf(path[0]), pools[0].coins.indexOf(path[1]), amountIn],
  }).catch(()=>{})
}

let getAmountIn = async(blockchain, exchange, { path, pools, amountOut, block }) => {
  path = getExchangePath(blockchain, exchange, path)
  if(pools[0].onlyStablecoins) { return amountOut }
  return request({
    blockchain: blockchain,
    address: pools[0].address,
    method: 'get_dx',
    api: exchange[blockchain].pool.api,
    params: [pools[0].coins.indexOf(path[0]), pools[0].coins.indexOf(path[1]), amountOut],
  }).catch(()=>{})
}

const getAmounts = async (blockchain, exchange, {
  path,
  pools,
  block,
  tokenIn,
  tokenOut,
  amountOut,
  amountIn,
  amountInMax,
  amountOutMin
}) => {
  if (amountOut) {
    amountIn = await getAmountIn(blockchain, exchange, { block, path, pools, amountOut, tokenIn, tokenOut })
    if (amountIn == undefined || amountInMax && amountIn.gt(amountInMax)) {
      return {}
    } else if (amountInMax === undefined) {
      amountInMax = amountIn
    }
  } else if (amountIn) {
    amountOut = await getAmountOut(blockchain, exchange, { path, pools, amountIn, tokenIn, tokenOut })
    if (amountOut == undefined || amountOutMin && amountOut.lt(amountOutMin)) {
      return {}
    } else if (amountOutMin === undefined) {
      amountOutMin = amountOut
    }
  } else if(amountOutMin) {
    amountIn = await getAmountIn(blockchain, exchange, { block, path, pools, amountOut: amountOutMin, tokenIn, tokenOut })
    if (amountIn == undefined || amountInMax && amountIn.gt(amountInMax)) {
      return {}
    } else if (amountInMax === undefined) {
      amountInMax = amountIn
    }
  } else if(amountInMax) {
    amountOut = await getAmountOut(blockchain, exchange, { path, pools, amountIn: amountInMax, tokenIn, tokenOut })
    if (amountOut == undefined ||amountOutMin && amountOut.lt(amountOutMin)) {
      return {}
    } else if (amountOutMin === undefined) {
      amountOutMin = amountOut
    }
  }
  return { amountOut, amountIn, amountInMax, amountOutMin }
}

const getTransaction = async({
  blockchain,
  exchange,
  pools,
  path,
  amountIn,
  amountInMax,
  amountOut,
  amountOutMin,
  amountInInput,
  amountOutInput,
  amountInMaxInput,
  amountOutMinInput,
  fromAddress
}) => {

  let transaction = {
    blockchain,
    from: fromAddress,
    to: exchange[blockchain].router.address,
    api: exchange[blockchain].router.api,
    method: 'exchange_multiple',
    params: {
      _route: [path[0], pools[0].address, path[1], Blockchains[blockchain].zero, Blockchains[blockchain].zero, Blockchains[blockchain].zero, Blockchains[blockchain].zero, Blockchains[blockchain].zero, Blockchains[blockchain].zero],
      _swap_params: [[1,2,1], [0,0,0], [0,0,0]],
      _amount: (amountIn || amountInMax),
      _expected: (amountOut || amountOutMin),
      _pools: [Blockchains[blockchain].zero, Blockchains[blockchain].zero, Blockchains[blockchain].zero, Blockchains[blockchain].zero]
    }
  }

  return transaction
}

const REGISTRY = [{"name":"PoolAdded","inputs":[{"name":"pool","type":"address","indexed":true},{"name":"rate_method_id","type":"bytes","indexed":false}],"anonymous":false,"type":"event"},{"name":"PoolRemoved","inputs":[{"name":"pool","type":"address","indexed":true}],"anonymous":false,"type":"event"},{"stateMutability":"nonpayable","type":"constructor","inputs":[{"name":"_address_provider","type":"address"},{"name":"_gauge_controller","type":"address"}],"outputs":[]},{"stateMutability":"view","type":"function","name":"find_pool_for_coins","inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"}],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"find_pool_for_coins","inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"i","type":"uint256"}],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"get_n_coins","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[2]"}],"gas":1521},{"stateMutability":"view","type":"function","name":"get_coins","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"address[8]"}],"gas":12102},{"stateMutability":"view","type":"function","name":"get_underlying_coins","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"address[8]"}],"gas":12194},{"stateMutability":"view","type":"function","name":"get_decimals","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[8]"}],"gas":7874},{"stateMutability":"view","type":"function","name":"get_underlying_decimals","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[8]"}],"gas":7966},{"stateMutability":"view","type":"function","name":"get_rates","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[8]"}],"gas":36992},{"stateMutability":"view","type":"function","name":"get_gauges","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"address[10]"},{"name":"","type":"int128[10]"}],"gas":20157},{"stateMutability":"view","type":"function","name":"get_balances","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[8]"}],"gas":16583},{"stateMutability":"view","type":"function","name":"get_underlying_balances","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[8]"}],"gas":162842},{"stateMutability":"view","type":"function","name":"get_virtual_price_from_lp_token","inputs":[{"name":"_token","type":"address"}],"outputs":[{"name":"","type":"uint256"}],"gas":1927},{"stateMutability":"view","type":"function","name":"get_A","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256"}],"gas":1045},{"stateMutability":"view","type":"function","name":"get_parameters","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"A","type":"uint256"},{"name":"future_A","type":"uint256"},{"name":"fee","type":"uint256"},{"name":"admin_fee","type":"uint256"},{"name":"future_fee","type":"uint256"},{"name":"future_admin_fee","type":"uint256"},{"name":"future_owner","type":"address"},{"name":"initial_A","type":"uint256"},{"name":"initial_A_time","type":"uint256"},{"name":"future_A_time","type":"uint256"}],"gas":6305},{"stateMutability":"view","type":"function","name":"get_fees","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[2]"}],"gas":1450},{"stateMutability":"view","type":"function","name":"get_admin_balances","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[8]"}],"gas":36454},{"stateMutability":"view","type":"function","name":"get_coin_indices","inputs":[{"name":"_pool","type":"address"},{"name":"_from","type":"address"},{"name":"_to","type":"address"}],"outputs":[{"name":"","type":"int128"},{"name":"","type":"int128"},{"name":"","type":"bool"}],"gas":27131},{"stateMutability":"view","type":"function","name":"estimate_gas_used","inputs":[{"name":"_pool","type":"address"},{"name":"_from","type":"address"},{"name":"_to","type":"address"}],"outputs":[{"name":"","type":"uint256"}],"gas":32004},{"stateMutability":"view","type":"function","name":"is_meta","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"bool"}],"gas":1900},{"stateMutability":"view","type":"function","name":"get_pool_name","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"string"}],"gas":8323},{"stateMutability":"view","type":"function","name":"get_coin_swap_count","inputs":[{"name":"_coin","type":"address"}],"outputs":[{"name":"","type":"uint256"}],"gas":1951},{"stateMutability":"view","type":"function","name":"get_coin_swap_complement","inputs":[{"name":"_coin","type":"address"},{"name":"_index","type":"uint256"}],"outputs":[{"name":"","type":"address"}],"gas":2090},{"stateMutability":"view","type":"function","name":"get_pool_asset_type","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256"}],"gas":2011},{"stateMutability":"nonpayable","type":"function","name":"add_pool","inputs":[{"name":"_pool","type":"address"},{"name":"_n_coins","type":"uint256"},{"name":"_lp_token","type":"address"},{"name":"_rate_info","type":"bytes32"},{"name":"_decimals","type":"uint256"},{"name":"_underlying_decimals","type":"uint256"},{"name":"_has_initial_A","type":"bool"},{"name":"_is_v1","type":"bool"},{"name":"_name","type":"string"}],"outputs":[],"gas":61485845},{"stateMutability":"nonpayable","type":"function","name":"add_pool_without_underlying","inputs":[{"name":"_pool","type":"address"},{"name":"_n_coins","type":"uint256"},{"name":"_lp_token","type":"address"},{"name":"_rate_info","type":"bytes32"},{"name":"_decimals","type":"uint256"},{"name":"_use_rates","type":"uint256"},{"name":"_has_initial_A","type":"bool"},{"name":"_is_v1","type":"bool"},{"name":"_name","type":"string"}],"outputs":[],"gas":31306062},{"stateMutability":"nonpayable","type":"function","name":"add_metapool","inputs":[{"name":"_pool","type":"address"},{"name":"_n_coins","type":"uint256"},{"name":"_lp_token","type":"address"},{"name":"_decimals","type":"uint256"},{"name":"_name","type":"string"}],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"add_metapool","inputs":[{"name":"_pool","type":"address"},{"name":"_n_coins","type":"uint256"},{"name":"_lp_token","type":"address"},{"name":"_decimals","type":"uint256"},{"name":"_name","type":"string"},{"name":"_base_pool","type":"address"}],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"remove_pool","inputs":[{"name":"_pool","type":"address"}],"outputs":[],"gas":779731418758},{"stateMutability":"nonpayable","type":"function","name":"set_pool_gas_estimates","inputs":[{"name":"_addr","type":"address[5]"},{"name":"_amount","type":"uint256[2][5]"}],"outputs":[],"gas":390460},{"stateMutability":"nonpayable","type":"function","name":"set_coin_gas_estimates","inputs":[{"name":"_addr","type":"address[10]"},{"name":"_amount","type":"uint256[10]"}],"outputs":[],"gas":392047},{"stateMutability":"nonpayable","type":"function","name":"set_gas_estimate_contract","inputs":[{"name":"_pool","type":"address"},{"name":"_estimator","type":"address"}],"outputs":[],"gas":72629},{"stateMutability":"nonpayable","type":"function","name":"set_liquidity_gauges","inputs":[{"name":"_pool","type":"address"},{"name":"_liquidity_gauges","type":"address[10]"}],"outputs":[],"gas":400675},{"stateMutability":"nonpayable","type":"function","name":"set_pool_asset_type","inputs":[{"name":"_pool","type":"address"},{"name":"_asset_type","type":"uint256"}],"outputs":[],"gas":72667},{"stateMutability":"nonpayable","type":"function","name":"batch_set_pool_asset_type","inputs":[{"name":"_pools","type":"address[32]"},{"name":"_asset_types","type":"uint256[32]"}],"outputs":[],"gas":1173447},{"stateMutability":"view","type":"function","name":"address_provider","inputs":[],"outputs":[{"name":"","type":"address"}],"gas":2048},{"stateMutability":"view","type":"function","name":"gauge_controller","inputs":[],"outputs":[{"name":"","type":"address"}],"gas":2078},{"stateMutability":"view","type":"function","name":"pool_list","inputs":[{"name":"arg0","type":"uint256"}],"outputs":[{"name":"","type":"address"}],"gas":2217},{"stateMutability":"view","type":"function","name":"pool_count","inputs":[],"outputs":[{"name":"","type":"uint256"}],"gas":2138},{"stateMutability":"view","type":"function","name":"coin_count","inputs":[],"outputs":[{"name":"","type":"uint256"}],"gas":2168},{"stateMutability":"view","type":"function","name":"get_coin","inputs":[{"name":"arg0","type":"uint256"}],"outputs":[{"name":"","type":"address"}],"gas":2307},{"stateMutability":"view","type":"function","name":"get_pool_from_lp_token","inputs":[{"name":"arg0","type":"address"}],"outputs":[{"name":"","type":"address"}],"gas":2443},{"stateMutability":"view","type":"function","name":"get_lp_token","inputs":[{"name":"arg0","type":"address"}],"outputs":[{"name":"","type":"address"}],"gas":2473},{"stateMutability":"view","type":"function","name":"last_updated","inputs":[],"outputs":[{"name":"","type":"uint256"}],"gas":2288}]
const POOL = [{"name":"Transfer","inputs":[{"name":"sender","type":"address","indexed":true},{"name":"receiver","type":"address","indexed":true},{"name":"value","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"Approval","inputs":[{"name":"owner","type":"address","indexed":true},{"name":"spender","type":"address","indexed":true},{"name":"value","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"TokenExchange","inputs":[{"name":"buyer","type":"address","indexed":true},{"name":"sold_id","type":"uint256","indexed":false},{"name":"tokens_sold","type":"uint256","indexed":false},{"name":"bought_id","type":"uint256","indexed":false},{"name":"tokens_bought","type":"uint256","indexed":false},{"name":"fee","type":"uint256","indexed":false},{"name":"packed_price_scale","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"AddLiquidity","inputs":[{"name":"provider","type":"address","indexed":true},{"name":"token_amounts","type":"uint256[3]","indexed":false},{"name":"fee","type":"uint256","indexed":false},{"name":"token_supply","type":"uint256","indexed":false},{"name":"packed_price_scale","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"RemoveLiquidity","inputs":[{"name":"provider","type":"address","indexed":true},{"name":"token_amounts","type":"uint256[3]","indexed":false},{"name":"token_supply","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"RemoveLiquidityOne","inputs":[{"name":"provider","type":"address","indexed":true},{"name":"token_amount","type":"uint256","indexed":false},{"name":"coin_index","type":"uint256","indexed":false},{"name":"coin_amount","type":"uint256","indexed":false},{"name":"approx_fee","type":"uint256","indexed":false},{"name":"packed_price_scale","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"CommitNewParameters","inputs":[{"name":"deadline","type":"uint256","indexed":true},{"name":"mid_fee","type":"uint256","indexed":false},{"name":"out_fee","type":"uint256","indexed":false},{"name":"fee_gamma","type":"uint256","indexed":false},{"name":"allowed_extra_profit","type":"uint256","indexed":false},{"name":"adjustment_step","type":"uint256","indexed":false},{"name":"ma_time","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"NewParameters","inputs":[{"name":"mid_fee","type":"uint256","indexed":false},{"name":"out_fee","type":"uint256","indexed":false},{"name":"fee_gamma","type":"uint256","indexed":false},{"name":"allowed_extra_profit","type":"uint256","indexed":false},{"name":"adjustment_step","type":"uint256","indexed":false},{"name":"ma_time","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"RampAgamma","inputs":[{"name":"initial_A","type":"uint256","indexed":false},{"name":"future_A","type":"uint256","indexed":false},{"name":"initial_gamma","type":"uint256","indexed":false},{"name":"future_gamma","type":"uint256","indexed":false},{"name":"initial_time","type":"uint256","indexed":false},{"name":"future_time","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"StopRampA","inputs":[{"name":"current_A","type":"uint256","indexed":false},{"name":"current_gamma","type":"uint256","indexed":false},{"name":"time","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"ClaimAdminFee","inputs":[{"name":"admin","type":"address","indexed":true},{"name":"tokens","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"stateMutability":"nonpayable","type":"constructor","inputs":[{"name":"_name","type":"string"},{"name":"_symbol","type":"string"},{"name":"_coins","type":"address[3]"},{"name":"_math","type":"address"},{"name":"_weth","type":"address"},{"name":"_salt","type":"bytes32"},{"name":"packed_precisions","type":"uint256"},{"name":"packed_A_gamma","type":"uint256"},{"name":"packed_fee_params","type":"uint256"},{"name":"packed_rebalancing_params","type":"uint256"},{"name":"packed_prices","type":"uint256"}],"outputs":[]},{"stateMutability":"payable","type":"fallback"},{"stateMutability":"payable","type":"function","name":"exchange","inputs":[{"name":"i","type":"uint256"},{"name":"j","type":"uint256"},{"name":"dx","type":"uint256"},{"name":"min_dy","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"payable","type":"function","name":"exchange","inputs":[{"name":"i","type":"uint256"},{"name":"j","type":"uint256"},{"name":"dx","type":"uint256"},{"name":"min_dy","type":"uint256"},{"name":"use_eth","type":"bool"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"payable","type":"function","name":"exchange","inputs":[{"name":"i","type":"uint256"},{"name":"j","type":"uint256"},{"name":"dx","type":"uint256"},{"name":"min_dy","type":"uint256"},{"name":"use_eth","type":"bool"},{"name":"receiver","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"payable","type":"function","name":"exchange_underlying","inputs":[{"name":"i","type":"uint256"},{"name":"j","type":"uint256"},{"name":"dx","type":"uint256"},{"name":"min_dy","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"payable","type":"function","name":"exchange_underlying","inputs":[{"name":"i","type":"uint256"},{"name":"j","type":"uint256"},{"name":"dx","type":"uint256"},{"name":"min_dy","type":"uint256"},{"name":"receiver","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"nonpayable","type":"function","name":"exchange_extended","inputs":[{"name":"i","type":"uint256"},{"name":"j","type":"uint256"},{"name":"dx","type":"uint256"},{"name":"min_dy","type":"uint256"},{"name":"use_eth","type":"bool"},{"name":"sender","type":"address"},{"name":"receiver","type":"address"},{"name":"cb","type":"bytes32"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"payable","type":"function","name":"add_liquidity","inputs":[{"name":"amounts","type":"uint256[3]"},{"name":"min_mint_amount","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"payable","type":"function","name":"add_liquidity","inputs":[{"name":"amounts","type":"uint256[3]"},{"name":"min_mint_amount","type":"uint256"},{"name":"use_eth","type":"bool"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"payable","type":"function","name":"add_liquidity","inputs":[{"name":"amounts","type":"uint256[3]"},{"name":"min_mint_amount","type":"uint256"},{"name":"use_eth","type":"bool"},{"name":"receiver","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"nonpayable","type":"function","name":"remove_liquidity","inputs":[{"name":"_amount","type":"uint256"},{"name":"min_amounts","type":"uint256[3]"}],"outputs":[{"name":"","type":"uint256[3]"}]},{"stateMutability":"nonpayable","type":"function","name":"remove_liquidity","inputs":[{"name":"_amount","type":"uint256"},{"name":"min_amounts","type":"uint256[3]"},{"name":"use_eth","type":"bool"}],"outputs":[{"name":"","type":"uint256[3]"}]},{"stateMutability":"nonpayable","type":"function","name":"remove_liquidity","inputs":[{"name":"_amount","type":"uint256"},{"name":"min_amounts","type":"uint256[3]"},{"name":"use_eth","type":"bool"},{"name":"receiver","type":"address"}],"outputs":[{"name":"","type":"uint256[3]"}]},{"stateMutability":"nonpayable","type":"function","name":"remove_liquidity","inputs":[{"name":"_amount","type":"uint256"},{"name":"min_amounts","type":"uint256[3]"},{"name":"use_eth","type":"bool"},{"name":"receiver","type":"address"},{"name":"claim_admin_fees","type":"bool"}],"outputs":[{"name":"","type":"uint256[3]"}]},{"stateMutability":"nonpayable","type":"function","name":"remove_liquidity_one_coin","inputs":[{"name":"token_amount","type":"uint256"},{"name":"i","type":"uint256"},{"name":"min_amount","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"nonpayable","type":"function","name":"remove_liquidity_one_coin","inputs":[{"name":"token_amount","type":"uint256"},{"name":"i","type":"uint256"},{"name":"min_amount","type":"uint256"},{"name":"use_eth","type":"bool"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"nonpayable","type":"function","name":"remove_liquidity_one_coin","inputs":[{"name":"token_amount","type":"uint256"},{"name":"i","type":"uint256"},{"name":"min_amount","type":"uint256"},{"name":"use_eth","type":"bool"},{"name":"receiver","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"nonpayable","type":"function","name":"claim_admin_fees","inputs":[],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"transferFrom","inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"outputs":[{"name":"","type":"bool"}]},{"stateMutability":"nonpayable","type":"function","name":"transfer","inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"outputs":[{"name":"","type":"bool"}]},{"stateMutability":"nonpayable","type":"function","name":"approve","inputs":[{"name":"_spender","type":"address"},{"name":"_value","type":"uint256"}],"outputs":[{"name":"","type":"bool"}]},{"stateMutability":"nonpayable","type":"function","name":"increaseAllowance","inputs":[{"name":"_spender","type":"address"},{"name":"_add_value","type":"uint256"}],"outputs":[{"name":"","type":"bool"}]},{"stateMutability":"nonpayable","type":"function","name":"decreaseAllowance","inputs":[{"name":"_spender","type":"address"},{"name":"_sub_value","type":"uint256"}],"outputs":[{"name":"","type":"bool"}]},{"stateMutability":"nonpayable","type":"function","name":"permit","inputs":[{"name":"_owner","type":"address"},{"name":"_spender","type":"address"},{"name":"_value","type":"uint256"},{"name":"_deadline","type":"uint256"},{"name":"_v","type":"uint8"},{"name":"_r","type":"bytes32"},{"name":"_s","type":"bytes32"}],"outputs":[{"name":"","type":"bool"}]},{"stateMutability":"view","type":"function","name":"fee_receiver","inputs":[],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"calc_token_amount","inputs":[{"name":"amounts","type":"uint256[3]"},{"name":"deposit","type":"bool"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"get_dy","inputs":[{"name":"i","type":"uint256"},{"name":"j","type":"uint256"},{"name":"dx","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"get_dx","inputs":[{"name":"i","type":"uint256"},{"name":"j","type":"uint256"},{"name":"dy","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"lp_price","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"get_virtual_price","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"price_oracle","inputs":[{"name":"k","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"last_prices","inputs":[{"name":"k","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"price_scale","inputs":[{"name":"k","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"fee","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"calc_withdraw_one_coin","inputs":[{"name":"token_amount","type":"uint256"},{"name":"i","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"calc_token_fee","inputs":[{"name":"amounts","type":"uint256[3]"},{"name":"xp","type":"uint256[3]"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"A","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"gamma","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"mid_fee","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"out_fee","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"fee_gamma","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"allowed_extra_profit","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"adjustment_step","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"ma_time","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"precisions","inputs":[],"outputs":[{"name":"","type":"uint256[3]"}]},{"stateMutability":"view","type":"function","name":"fee_calc","inputs":[{"name":"xp","type":"uint256[3]"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"DOMAIN_SEPARATOR","inputs":[],"outputs":[{"name":"","type":"bytes32"}]},{"stateMutability":"nonpayable","type":"function","name":"ramp_A_gamma","inputs":[{"name":"future_A","type":"uint256"},{"name":"future_gamma","type":"uint256"},{"name":"future_time","type":"uint256"}],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"stop_ramp_A_gamma","inputs":[],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"commit_new_parameters","inputs":[{"name":"_new_mid_fee","type":"uint256"},{"name":"_new_out_fee","type":"uint256"},{"name":"_new_fee_gamma","type":"uint256"},{"name":"_new_allowed_extra_profit","type":"uint256"},{"name":"_new_adjustment_step","type":"uint256"},{"name":"_new_ma_time","type":"uint256"}],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"apply_new_parameters","inputs":[],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"revert_new_parameters","inputs":[],"outputs":[]},{"stateMutability":"view","type":"function","name":"WETH20","inputs":[],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"MATH","inputs":[],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"coins","inputs":[{"name":"arg0","type":"uint256"}],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"factory","inputs":[],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"last_prices_timestamp","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"initial_A_gamma","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"initial_A_gamma_time","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"future_A_gamma","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"future_A_gamma_time","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"balances","inputs":[{"name":"arg0","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"D","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"xcp_profit","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"xcp_profit_a","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"virtual_price","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"packed_rebalancing_params","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"packed_fee_params","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"ADMIN_FEE","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"admin_actions_deadline","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"name","inputs":[],"outputs":[{"name":"","type":"string"}]},{"stateMutability":"view","type":"function","name":"symbol","inputs":[],"outputs":[{"name":"","type":"string"}]},{"stateMutability":"view","type":"function","name":"decimals","inputs":[],"outputs":[{"name":"","type":"uint8"}]},{"stateMutability":"view","type":"function","name":"version","inputs":[],"outputs":[{"name":"","type":"string"}]},{"stateMutability":"view","type":"function","name":"balanceOf","inputs":[{"name":"arg0","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"allowance","inputs":[{"name":"arg0","type":"address"},{"name":"arg1","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"totalSupply","inputs":[],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"nonces","inputs":[{"name":"arg0","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"salt","inputs":[],"outputs":[{"name":"","type":"bytes32"}]}]
const ROUTER = [{"name":"TokenExchange","inputs":[{"name":"buyer","type":"address","indexed":true},{"name":"receiver","type":"address","indexed":true},{"name":"pool","type":"address","indexed":true},{"name":"token_sold","type":"address","indexed":false},{"name":"token_bought","type":"address","indexed":false},{"name":"amount_sold","type":"uint256","indexed":false},{"name":"amount_bought","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"ExchangeMultiple","inputs":[{"name":"buyer","type":"address","indexed":true},{"name":"receiver","type":"address","indexed":true},{"name":"route","type":"address[9]","indexed":false},{"name":"swap_params","type":"uint256[3][4]","indexed":false},{"name":"pools","type":"address[4]","indexed":false},{"name":"amount_sold","type":"uint256","indexed":false},{"name":"amount_bought","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"stateMutability":"nonpayable","type":"constructor","inputs":[{"name":"_address_provider","type":"address"},{"name":"_calculator","type":"address"},{"name":"_weth","type":"address"}],"outputs":[]},{"stateMutability":"payable","type":"fallback"},{"stateMutability":"payable","type":"function","name":"exchange_with_best_rate","inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_amount","type":"uint256"},{"name":"_expected","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"payable","type":"function","name":"exchange_with_best_rate","inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_amount","type":"uint256"},{"name":"_expected","type":"uint256"},{"name":"_receiver","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"payable","type":"function","name":"exchange","inputs":[{"name":"_pool","type":"address"},{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_amount","type":"uint256"},{"name":"_expected","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"payable","type":"function","name":"exchange","inputs":[{"name":"_pool","type":"address"},{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_amount","type":"uint256"},{"name":"_expected","type":"uint256"},{"name":"_receiver","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"payable","type":"function","name":"exchange_multiple","inputs":[{"name":"_route","type":"address[9]"},{"name":"_swap_params","type":"uint256[3][4]"},{"name":"_amount","type":"uint256"},{"name":"_expected","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"payable","type":"function","name":"exchange_multiple","inputs":[{"name":"_route","type":"address[9]"},{"name":"_swap_params","type":"uint256[3][4]"},{"name":"_amount","type":"uint256"},{"name":"_expected","type":"uint256"},{"name":"_pools","type":"address[4]"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"payable","type":"function","name":"exchange_multiple","inputs":[{"name":"_route","type":"address[9]"},{"name":"_swap_params","type":"uint256[3][4]"},{"name":"_amount","type":"uint256"},{"name":"_expected","type":"uint256"},{"name":"_pools","type":"address[4]"},{"name":"_receiver","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"get_best_rate","inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_amount","type":"uint256"}],"outputs":[{"name":"","type":"address"},{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"get_best_rate","inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_amount","type":"uint256"},{"name":"_exclude_pools","type":"address[8]"}],"outputs":[{"name":"","type":"address"},{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"get_exchange_amount","inputs":[{"name":"_pool","type":"address"},{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_amount","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"get_input_amount","inputs":[{"name":"_pool","type":"address"},{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_amount","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"get_exchange_amounts","inputs":[{"name":"_pool","type":"address"},{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_amounts","type":"uint256[100]"}],"outputs":[{"name":"","type":"uint256[100]"}]},{"stateMutability":"view","type":"function","name":"get_exchange_multiple_amount","inputs":[{"name":"_route","type":"address[9]"},{"name":"_swap_params","type":"uint256[3][4]"},{"name":"_amount","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"get_exchange_multiple_amount","inputs":[{"name":"_route","type":"address[9]"},{"name":"_swap_params","type":"uint256[3][4]"},{"name":"_amount","type":"uint256"},{"name":"_pools","type":"address[4]"}],"outputs":[{"name":"","type":"uint256"}]},{"stateMutability":"view","type":"function","name":"get_calculator","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"nonpayable","type":"function","name":"update_registry_address","inputs":[],"outputs":[{"name":"","type":"bool"}]},{"stateMutability":"nonpayable","type":"function","name":"set_calculator","inputs":[{"name":"_pool","type":"address"},{"name":"_calculator","type":"address"}],"outputs":[{"name":"","type":"bool"}]},{"stateMutability":"nonpayable","type":"function","name":"set_default_calculator","inputs":[{"name":"_calculator","type":"address"}],"outputs":[{"name":"","type":"bool"}]},{"stateMutability":"nonpayable","type":"function","name":"claim_balance","inputs":[{"name":"_token","type":"address"}],"outputs":[{"name":"","type":"bool"}]},{"stateMutability":"nonpayable","type":"function","name":"set_killed","inputs":[{"name":"_is_killed","type":"bool"}],"outputs":[{"name":"","type":"bool"}]},{"stateMutability":"view","type":"function","name":"registry","inputs":[],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"factory_registry","inputs":[],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"crypto_registry","inputs":[],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"default_calculator","inputs":[],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"is_killed","inputs":[],"outputs":[{"name":"","type":"bool"}]}]

export default {
  findPath,
  pathExists,
  getAmounts,
  getTransaction,
  REGISTRY,
  POOL,
  ROUTER,
}
