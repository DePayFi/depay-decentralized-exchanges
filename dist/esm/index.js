import Blockchains from '@depay/web3-blockchains';
import { request, getProvider } from '@depay/web3-client';
import { ethers } from 'ethers';
import Token from '@depay/web3-tokens';
import { struct, publicKey, u128, u64 as u64$1, seq, u8, u16, i32, bool, i128, BN, PublicKey, Buffer, Keypair, SystemProgram, TransactionInstruction } from '@depay/solana-web3.js';
import Decimal from 'decimal.js';

function _optionalChain$3(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }class Route {
  constructor({
    tokenIn,
    tokenOut,
    path,
    pools,
    amountIn,
    amountInMax,
    amountOut,
    amountOutMin,
    exchange,
    approvalRequired,
    getApproval,
    getTransaction,
  }) {
    this.tokenIn = tokenIn;
    this.tokenOut = tokenOut;
    this.path = path;
    this.pools = pools;
    this.amountIn = _optionalChain$3([amountIn, 'optionalAccess', _ => _.toString, 'call', _2 => _2()]);
    this.amountOutMin = _optionalChain$3([amountOutMin, 'optionalAccess', _3 => _3.toString, 'call', _4 => _4()]);
    this.amountOut = _optionalChain$3([amountOut, 'optionalAccess', _5 => _5.toString, 'call', _6 => _6()]);
    this.amountInMax = _optionalChain$3([amountInMax, 'optionalAccess', _7 => _7.toString, 'call', _8 => _8()]);
    this.exchange = exchange;
    this.getTransaction = getTransaction;
  }
}

let supported = ['ethereum', 'bsc', 'polygon', 'solana', 'fantom', 'arbitrum', 'avalanche', 'gnosis', 'optimism'];
supported.evm = ['ethereum', 'bsc', 'polygon', 'fantom', 'arbitrum', 'avalanche', 'gnosis', 'optimism'];
supported.solana = ['solana'];

const DEFAULT_SLIPPAGE = '0.5'; // percent

const getDefaultSlippage = ({ amountIn, amountOut })=>{
  return DEFAULT_SLIPPAGE
};

const calculateAmountInWithSlippage = async ({ exchange, blockchain, pools, fixedPath, amountIn, amountOut })=>{

  let defaultSlippage = getDefaultSlippage({ amountIn, amountOut });

  let newAmountInWithDefaultSlippageBN = amountIn.add(amountIn.mul(parseFloat(defaultSlippage)*100).div(10000));

  if(!supported.evm.includes(exchange.blockchain || blockchain)) { 
    return newAmountInWithDefaultSlippageBN
  }

  const currentBlock = await request({ blockchain: (exchange.blockchain || blockchain), method: 'latestBlockNumber' });

  let blocks = [];
  for(var i = 0; i <= 2; i++){
    blocks.push(currentBlock-i);
  }

  const lastAmountsIn = await Promise.all(blocks.map(async (block)=>{
    let { amountIn } = await exchange.getAmounts({
      blockchain,
      path: fixedPath,
      pools,
      amountOut,
      block
    });
    return amountIn
  }));

  if(!lastAmountsIn[0] || !lastAmountsIn[1] || !lastAmountsIn[2]) { return newAmountInWithDefaultSlippageBN }

  let newAmountInWithExtremeSlippageBN;
  
  if(
    (lastAmountsIn[0].gt(lastAmountsIn[1])) &&
    (lastAmountsIn[1].gt(lastAmountsIn[2]))
  ) {
    // EXTREME DIRECTIONAL PRICE CHANGE

    const difference1 = lastAmountsIn[0].sub(lastAmountsIn[1]);
    const difference2 = lastAmountsIn[1].sub(lastAmountsIn[2]);

    // velocity (avg. step size)
    const slippage = difference1.add(difference2).div(2);

    newAmountInWithExtremeSlippageBN = lastAmountsIn[0].add(slippage);

    if(newAmountInWithExtremeSlippageBN.gt(newAmountInWithDefaultSlippageBN)) {
      return newAmountInWithExtremeSlippageBN
    }
  } else if (
    !(
      lastAmountsIn[0].eq(lastAmountsIn[1]) ||
      lastAmountsIn[1].eq(lastAmountsIn[2])
    )
  ) {
    // EXTREME BASE VOLATILITIES

    const difference1 = lastAmountsIn[0].sub(lastAmountsIn[1]).abs();
    const difference2 = lastAmountsIn[1].sub(lastAmountsIn[2]).abs();

    let slippage;
    if(difference1.lt(difference2)) {
      slippage = difference1;
    } else {
      slippage = difference2;
    }

    let highestAmountBN;
    if(lastAmountsIn[0].gt(lastAmountsIn[1]) && lastAmountsIn[0].gt(lastAmountsIn[2])) {
      highestAmountBN = lastAmountsIn[0];
    } else if(lastAmountsIn[1].gt(lastAmountsIn[2]) && lastAmountsIn[1].gt(lastAmountsIn[0])) {
      highestAmountBN = lastAmountsIn[1];
    } else {
      highestAmountBN = lastAmountsIn[2];
    }

    newAmountInWithExtremeSlippageBN = highestAmountBN.add(slippage);

    if(newAmountInWithExtremeSlippageBN.gt(newAmountInWithDefaultSlippageBN)) {
      return newAmountInWithExtremeSlippageBN
    }
  }

  return newAmountInWithDefaultSlippageBN
};

const calculateAmountOutLessSlippage = async ({ exchange, fixedPath, amountOut, amountIn })=>{
  let defaultSlippage = getDefaultSlippage({ amountIn, amountOut });

  let newAmountOutWithoutDefaultSlippageBN = amountOut.sub(amountOut.mul(parseFloat(defaultSlippage)*100).div(10000));

  return newAmountOutWithoutDefaultSlippageBN
};

const calculateAmountsWithSlippage = async ({
  exchange,
  blockchain,
  pools,
  fixedPath,
  amounts,
  tokenIn, tokenOut,
  amountIn, amountInMax, amountOut, amountOutMin,
  amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput,
})=>{
  if(amountOutMinInput || amountOutInput) {
    if(supported.evm.includes(exchange.blockchain || blockchain)) {
      amountIn = amountInMax = await calculateAmountInWithSlippage({ exchange, blockchain, pools, fixedPath, amountIn, amountOut: (amountOutMinInput || amountOut) });
    } else if(supported.solana.includes(exchange.blockchain || blockchain)){
      let amountsWithSlippage = [];
      await Promise.all(fixedPath.map((step, index)=>{
        if(index != 0) {
          let amountWithSlippage = calculateAmountInWithSlippage({ exchange, pools, fixedPath: [fixedPath[index-1], fixedPath[index]], amountIn: amounts[index-1], amountOut: amounts[index] });
          amountWithSlippage.then((amount)=>amountsWithSlippage.push(amount));
          return amountWithSlippage
        }
      }));
      amountsWithSlippage.push(amounts[amounts.length-1]);
      amounts = amountsWithSlippage;
      amountIn = amountInMax = amounts[0];
    }
  } else if(amountInMaxInput || amountInInput) {
    if(supported.solana.includes(exchange.blockchain || blockchain)){
      let amountsWithSlippage = [];
      await Promise.all(fixedPath.map((step, index)=>{
        if(index !== 0 && index < fixedPath.length-1) {
          amountsWithSlippage.unshift(amounts[index]);
        } else if(index === fixedPath.length-1) {
          let amountWithSlippage = calculateAmountOutLessSlippage({ exchange, fixedPath: [fixedPath[index-1], fixedPath[index]], amountIn: amounts[index-1], amountOut: amounts[index] });
          amountWithSlippage.then((amount)=>{
            amountsWithSlippage.unshift(amount);
            return amount
          });
          return amountWithSlippage
        }
      }));
      amountsWithSlippage.push(amounts[0]);
      amounts = amountsWithSlippage.slice().reverse();
      amountOut = amountOutMin = amounts[amounts.length-1];
    }
  }

  return({ amountIn, amountInMax, amountOut, amountOutMin, amounts })
};

const fixAddress = (address)=>{
  if(address.match('0x')) {
    return ethers.utils.getAddress(address)
  } else {
    return address
  }
};

let getAmount = async ({ amount, blockchain, address }) => {
  return await Token.BigNumber({ amount, blockchain, address })
};

let fixRouteParams = async ({
  blockchain,
  exchange,
  tokenIn,
  tokenOut,
  amountIn,
  amountOut,
  amountInMax,
  amountOutMin,
}) => {
  let params = {
    exchange,
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    amountInMax,
    amountOutMin,
  };
  
  if (amountOut && typeof amountOut === 'number') {
    params.amountOut = await getAmount({ amount: amountOut, blockchain, address: tokenOut });
  }

  if (amountOutMin && typeof amountOutMin === 'number') {
    params.amountOutMin = await getAmount({ amount: amountOutMin, blockchain, address: tokenOut });
  }

  if (amountIn && typeof amountIn === 'number') {
    params.amountIn = await getAmount({ amount: amountIn, blockchain, address: tokenIn });
  }

  if (amountInMax && typeof amountInMax === 'number') {
    params.amountInMax = await getAmount({ amount: amountInMax, blockchain, address: tokenIn });
  }
  
  return params
};

let preflight = ({
  blockchain,
  exchange,
  tokenIn,
  tokenOut,
  amountIn,
  amountOut,
  amountInMax,
  amountOutMin,
  amountOutMax,
  amountInMin,
}) => {
  if(blockchain === undefined && exchange.blockchains != undefined) {
    throw 'You need to provide a blockchain when calling route on an exchange that supports multiple blockchains!'
  }

  if (typeof amountOutMax !== 'undefined') {
    throw 'You cannot not set amountOutMax! Only amountInMax or amountOutMin!'
  }

  if (typeof amountInMin !== 'undefined') {
    throw 'You cannot not set amountInMin! Only amountInMax or amountOutMin!'
  }

  if (typeof amountOut !== 'undefined' && typeof amountIn !== 'undefined') {
    throw 'You cannot set amountIn and amountOut at the same time, use amountInMax or amountOutMin to describe the non exact part of the swap!'
  }

  if (typeof amountInMax !== 'undefined' && typeof amountOutMin !== 'undefined') {
    throw 'You cannot set amountInMax and amountOutMin at the same time, use amountIn or amountOut to describe the part of the swap that needs to be exact!'
  }

  if (typeof amountIn !== 'undefined' && typeof amountInMax !== 'undefined') {
    throw 'Setting amountIn and amountInMax at the same time makes no sense. Decide if amountIn needs to be exact or not!'
  }

  if (typeof amountOut !== 'undefined' && typeof amountOutMin !== 'undefined') {
    throw 'Setting amountOut and amountOutMin at the same time makes no sense. Decide if amountOut needs to be exact or not!'
  }
};

const route$1 = ({
  blockchain,
  exchange,
  tokenIn,
  tokenOut,
  amountIn = undefined,
  amountOut = undefined,
  amountInMax = undefined,
  amountOutMin = undefined,
  findPath,
  getAmounts,
  getTransaction,
  slippage,
}) => {
  
  tokenIn = fixAddress(tokenIn);
  tokenOut = fixAddress(tokenOut);

  if([amountIn, amountOut, amountInMax, amountOutMin].filter(Boolean).length > 1) { throw('You can only pass one: amountIn, amountOut, amountInMax or amountOutMin') }
  if([amountIn, amountOut, amountInMax, amountOutMin].filter(Boolean).length < 1) { throw('You need to pass exactly one: amountIn, amountOut, amountInMax or amountOutMin') }

  return new Promise(async (resolve)=> {
    let { path, fixedPath, pools } = await findPath({ blockchain, tokenIn, tokenOut, amountIn, amountOut, amountInMax, amountOutMin });
    if (path === undefined || path.length == 0) { return resolve() }
    let [amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput] = [amountIn, amountOut, amountInMax, amountOutMin];

    let amounts; // includes intermediary amounts for longer routes
    ({ amountIn, amountInMax, amountOut, amountOutMin, amounts } = await getAmounts({ blockchain, path, pools, tokenIn, tokenOut, amountIn, amountInMax, amountOut, amountOutMin }));
    if([amountIn, amountInMax, amountOut, amountOutMin].every((amount)=>{ return amount == undefined })) { return resolve() }

    if(slippage || exchange.slippage) {
      ({ amountIn, amountInMax, amountOut, amountOutMin, amounts } = await calculateAmountsWithSlippage({
        exchange,
        blockchain,
        pools,
        fixedPath,
        amounts,
        tokenIn, tokenOut,
        amountIn, amountInMax, amountOut, amountOutMin,
        amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput,
      }));
    }

    resolve(
      new Route({
        tokenIn,
        tokenOut,
        path,
        pools,
        amountIn,
        amountInMax,
        amountOut,
        amountOutMin,
        exchange,
        getTransaction: async ({ from })=> await getTransaction({
          exchange,
          blockchain,
          pools,
          path,
          amountIn,
          amountInMax,
          amountOut,
          amountOutMin,
          amounts,
          amountInInput,
          amountOutInput,
          amountInMaxInput,
          amountOutMinInput,
          fromAddress: from
        }),
      })
    );
  })
};

class Exchange {
  constructor(...args) {
    Object.assign(this, ...args);
  }

  async route({
    blockchain,
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    amountInMax,
    amountOutMin,
    amountOutMax,
    amountInMin,
  }) {
    if(tokenIn === tokenOut){ return Promise.resolve() }
    
    preflight({
      blockchain,
      exchange: this,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      amountInMax,
      amountOutMin,
      amountOutMax,
      amountInMin,
    });

    return await route$1({
      ...
      await fixRouteParams({
        blockchain: blockchain || this.blockchain,
        exchange: this,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        amountInMax,
        amountOutMin,
      }),
      blockchain,
      findPath: this.findPath,
      getAmounts: this.getAmounts,
      getTransaction: this.getTransaction,
      slippage: this.slippage,
    })
  }
}

const findPath$4 = async ({ blockchain, exchange, tokenIn, tokenOut, amountIn, amountOut, amountInMax, amountOutMin }) => {
  
};

const pathExists$4 = async (blockchain, exchange, path, amountIn, amountOut, amountInMax, amountOutMin) => {
};

const getAmounts$4 = async (blockchain, exchange, {
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
    amountIn = await getAmountIn(blockchain, exchange, { block, path, pools, amountOut, tokenIn, tokenOut });
    if (amountIn == undefined || amountInMax && amountIn.gt(amountInMax)) {
      return {}
    } else if (amountInMax === undefined) {
      amountInMax = amountIn;
    }
  } else if (amountIn) {
    amountOut = await getAmountOut(blockchain, exchange, { path, pools, amountIn, tokenIn, tokenOut });
    if (amountOut == undefined || amountOutMin && amountOut.lt(amountOutMin)) {
      return {}
    } else if (amountOutMin === undefined) {
      amountOutMin = amountOut;
    }
  } else if(amountOutMin) {
    amountIn = await getAmountIn(blockchain, exchange, { block, path, pools, amountOut: amountOutMin, tokenIn, tokenOut });
    if (amountIn == undefined || amountInMax && amountIn.gt(amountInMax)) {
      return {}
    } else if (amountInMax === undefined) {
      amountInMax = amountIn;
    }
  } else if(amountInMax) {
    amountOut = await getAmountOut(blockchain, exchange, { path, pools, amountIn: amountInMax, tokenIn, tokenOut });
    if (amountOut == undefined ||amountOutMin && amountOut.lt(amountOutMin)) {
      return {}
    } else if (amountOutMin === undefined) {
      amountOutMin = amountOut;
    }
  }
  return { amountOut, amountIn, amountInMax, amountOutMin }
};

const getTransaction$4 = async({
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

};

const REGISTRY = [{"name":"PoolAdded","inputs":[{"name":"pool","type":"address","indexed":true},{"name":"rate_method_id","type":"bytes","indexed":false}],"anonymous":false,"type":"event"},{"name":"PoolRemoved","inputs":[{"name":"pool","type":"address","indexed":true}],"anonymous":false,"type":"event"},{"stateMutability":"nonpayable","type":"constructor","inputs":[{"name":"_address_provider","type":"address"},{"name":"_gauge_controller","type":"address"}],"outputs":[]},{"stateMutability":"view","type":"function","name":"find_pool_for_coins","inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"}],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"find_pool_for_coins","inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"i","type":"uint256"}],"outputs":[{"name":"","type":"address"}]},{"stateMutability":"view","type":"function","name":"get_n_coins","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[2]"}],"gas":1521},{"stateMutability":"view","type":"function","name":"get_coins","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"address[8]"}],"gas":12102},{"stateMutability":"view","type":"function","name":"get_underlying_coins","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"address[8]"}],"gas":12194},{"stateMutability":"view","type":"function","name":"get_decimals","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[8]"}],"gas":7874},{"stateMutability":"view","type":"function","name":"get_underlying_decimals","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[8]"}],"gas":7966},{"stateMutability":"view","type":"function","name":"get_rates","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[8]"}],"gas":36992},{"stateMutability":"view","type":"function","name":"get_gauges","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"address[10]"},{"name":"","type":"int128[10]"}],"gas":20157},{"stateMutability":"view","type":"function","name":"get_balances","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[8]"}],"gas":16583},{"stateMutability":"view","type":"function","name":"get_underlying_balances","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[8]"}],"gas":162842},{"stateMutability":"view","type":"function","name":"get_virtual_price_from_lp_token","inputs":[{"name":"_token","type":"address"}],"outputs":[{"name":"","type":"uint256"}],"gas":1927},{"stateMutability":"view","type":"function","name":"get_A","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256"}],"gas":1045},{"stateMutability":"view","type":"function","name":"get_parameters","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"A","type":"uint256"},{"name":"future_A","type":"uint256"},{"name":"fee","type":"uint256"},{"name":"admin_fee","type":"uint256"},{"name":"future_fee","type":"uint256"},{"name":"future_admin_fee","type":"uint256"},{"name":"future_owner","type":"address"},{"name":"initial_A","type":"uint256"},{"name":"initial_A_time","type":"uint256"},{"name":"future_A_time","type":"uint256"}],"gas":6305},{"stateMutability":"view","type":"function","name":"get_fees","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[2]"}],"gas":1450},{"stateMutability":"view","type":"function","name":"get_admin_balances","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256[8]"}],"gas":36454},{"stateMutability":"view","type":"function","name":"get_coin_indices","inputs":[{"name":"_pool","type":"address"},{"name":"_from","type":"address"},{"name":"_to","type":"address"}],"outputs":[{"name":"","type":"int128"},{"name":"","type":"int128"},{"name":"","type":"bool"}],"gas":27131},{"stateMutability":"view","type":"function","name":"estimate_gas_used","inputs":[{"name":"_pool","type":"address"},{"name":"_from","type":"address"},{"name":"_to","type":"address"}],"outputs":[{"name":"","type":"uint256"}],"gas":32004},{"stateMutability":"view","type":"function","name":"is_meta","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"bool"}],"gas":1900},{"stateMutability":"view","type":"function","name":"get_pool_name","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"string"}],"gas":8323},{"stateMutability":"view","type":"function","name":"get_coin_swap_count","inputs":[{"name":"_coin","type":"address"}],"outputs":[{"name":"","type":"uint256"}],"gas":1951},{"stateMutability":"view","type":"function","name":"get_coin_swap_complement","inputs":[{"name":"_coin","type":"address"},{"name":"_index","type":"uint256"}],"outputs":[{"name":"","type":"address"}],"gas":2090},{"stateMutability":"view","type":"function","name":"get_pool_asset_type","inputs":[{"name":"_pool","type":"address"}],"outputs":[{"name":"","type":"uint256"}],"gas":2011},{"stateMutability":"nonpayable","type":"function","name":"add_pool","inputs":[{"name":"_pool","type":"address"},{"name":"_n_coins","type":"uint256"},{"name":"_lp_token","type":"address"},{"name":"_rate_info","type":"bytes32"},{"name":"_decimals","type":"uint256"},{"name":"_underlying_decimals","type":"uint256"},{"name":"_has_initial_A","type":"bool"},{"name":"_is_v1","type":"bool"},{"name":"_name","type":"string"}],"outputs":[],"gas":61485845},{"stateMutability":"nonpayable","type":"function","name":"add_pool_without_underlying","inputs":[{"name":"_pool","type":"address"},{"name":"_n_coins","type":"uint256"},{"name":"_lp_token","type":"address"},{"name":"_rate_info","type":"bytes32"},{"name":"_decimals","type":"uint256"},{"name":"_use_rates","type":"uint256"},{"name":"_has_initial_A","type":"bool"},{"name":"_is_v1","type":"bool"},{"name":"_name","type":"string"}],"outputs":[],"gas":31306062},{"stateMutability":"nonpayable","type":"function","name":"add_metapool","inputs":[{"name":"_pool","type":"address"},{"name":"_n_coins","type":"uint256"},{"name":"_lp_token","type":"address"},{"name":"_decimals","type":"uint256"},{"name":"_name","type":"string"}],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"add_metapool","inputs":[{"name":"_pool","type":"address"},{"name":"_n_coins","type":"uint256"},{"name":"_lp_token","type":"address"},{"name":"_decimals","type":"uint256"},{"name":"_name","type":"string"},{"name":"_base_pool","type":"address"}],"outputs":[]},{"stateMutability":"nonpayable","type":"function","name":"remove_pool","inputs":[{"name":"_pool","type":"address"}],"outputs":[],"gas":779731418758},{"stateMutability":"nonpayable","type":"function","name":"set_pool_gas_estimates","inputs":[{"name":"_addr","type":"address[5]"},{"name":"_amount","type":"uint256[2][5]"}],"outputs":[],"gas":390460},{"stateMutability":"nonpayable","type":"function","name":"set_coin_gas_estimates","inputs":[{"name":"_addr","type":"address[10]"},{"name":"_amount","type":"uint256[10]"}],"outputs":[],"gas":392047},{"stateMutability":"nonpayable","type":"function","name":"set_gas_estimate_contract","inputs":[{"name":"_pool","type":"address"},{"name":"_estimator","type":"address"}],"outputs":[],"gas":72629},{"stateMutability":"nonpayable","type":"function","name":"set_liquidity_gauges","inputs":[{"name":"_pool","type":"address"},{"name":"_liquidity_gauges","type":"address[10]"}],"outputs":[],"gas":400675},{"stateMutability":"nonpayable","type":"function","name":"set_pool_asset_type","inputs":[{"name":"_pool","type":"address"},{"name":"_asset_type","type":"uint256"}],"outputs":[],"gas":72667},{"stateMutability":"nonpayable","type":"function","name":"batch_set_pool_asset_type","inputs":[{"name":"_pools","type":"address[32]"},{"name":"_asset_types","type":"uint256[32]"}],"outputs":[],"gas":1173447},{"stateMutability":"view","type":"function","name":"address_provider","inputs":[],"outputs":[{"name":"","type":"address"}],"gas":2048},{"stateMutability":"view","type":"function","name":"gauge_controller","inputs":[],"outputs":[{"name":"","type":"address"}],"gas":2078},{"stateMutability":"view","type":"function","name":"pool_list","inputs":[{"name":"arg0","type":"uint256"}],"outputs":[{"name":"","type":"address"}],"gas":2217},{"stateMutability":"view","type":"function","name":"pool_count","inputs":[],"outputs":[{"name":"","type":"uint256"}],"gas":2138},{"stateMutability":"view","type":"function","name":"coin_count","inputs":[],"outputs":[{"name":"","type":"uint256"}],"gas":2168},{"stateMutability":"view","type":"function","name":"get_coin","inputs":[{"name":"arg0","type":"uint256"}],"outputs":[{"name":"","type":"address"}],"gas":2307},{"stateMutability":"view","type":"function","name":"get_pool_from_lp_token","inputs":[{"name":"arg0","type":"address"}],"outputs":[{"name":"","type":"address"}],"gas":2443},{"stateMutability":"view","type":"function","name":"get_lp_token","inputs":[{"name":"arg0","type":"address"}],"outputs":[{"name":"","type":"address"}],"gas":2473},{"stateMutability":"view","type":"function","name":"last_updated","inputs":[],"outputs":[{"name":"","type":"uint256"}],"gas":2288}];
const POOL$1 = [{"name":"TokenExchange","inputs":[{"type":"address","name":"buyer","indexed":true},{"type":"int128","name":"sold_id","indexed":false},{"type":"uint256","name":"tokens_sold","indexed":false},{"type":"int128","name":"bought_id","indexed":false},{"type":"uint256","name":"tokens_bought","indexed":false}],"anonymous":false,"type":"event"},{"name":"AddLiquidity","inputs":[{"type":"address","name":"provider","indexed":true},{"type":"uint256[3]","name":"token_amounts","indexed":false},{"type":"uint256[3]","name":"fees","indexed":false},{"type":"uint256","name":"invariant","indexed":false},{"type":"uint256","name":"token_supply","indexed":false}],"anonymous":false,"type":"event"},{"name":"RemoveLiquidity","inputs":[{"type":"address","name":"provider","indexed":true},{"type":"uint256[3]","name":"token_amounts","indexed":false},{"type":"uint256[3]","name":"fees","indexed":false},{"type":"uint256","name":"token_supply","indexed":false}],"anonymous":false,"type":"event"},{"name":"RemoveLiquidityOne","inputs":[{"type":"address","name":"provider","indexed":true},{"type":"uint256","name":"token_amount","indexed":false},{"type":"uint256","name":"coin_amount","indexed":false}],"anonymous":false,"type":"event"},{"name":"RemoveLiquidityImbalance","inputs":[{"type":"address","name":"provider","indexed":true},{"type":"uint256[3]","name":"token_amounts","indexed":false},{"type":"uint256[3]","name":"fees","indexed":false},{"type":"uint256","name":"invariant","indexed":false},{"type":"uint256","name":"token_supply","indexed":false}],"anonymous":false,"type":"event"},{"name":"CommitNewAdmin","inputs":[{"type":"uint256","name":"deadline","indexed":true},{"type":"address","name":"admin","indexed":true}],"anonymous":false,"type":"event"},{"name":"NewAdmin","inputs":[{"type":"address","name":"admin","indexed":true}],"anonymous":false,"type":"event"},{"name":"CommitNewFee","inputs":[{"type":"uint256","name":"deadline","indexed":true},{"type":"uint256","name":"fee","indexed":false},{"type":"uint256","name":"admin_fee","indexed":false}],"anonymous":false,"type":"event"},{"name":"NewFee","inputs":[{"type":"uint256","name":"fee","indexed":false},{"type":"uint256","name":"admin_fee","indexed":false}],"anonymous":false,"type":"event"},{"name":"RampA","inputs":[{"type":"uint256","name":"old_A","indexed":false},{"type":"uint256","name":"new_A","indexed":false},{"type":"uint256","name":"initial_time","indexed":false},{"type":"uint256","name":"future_time","indexed":false}],"anonymous":false,"type":"event"},{"name":"StopRampA","inputs":[{"type":"uint256","name":"A","indexed":false},{"type":"uint256","name":"t","indexed":false}],"anonymous":false,"type":"event"},{"outputs":[],"inputs":[{"type":"address","name":"_owner"},{"type":"address[3]","name":"_coins"},{"type":"address","name":"_pool_token"},{"type":"uint256","name":"_A"},{"type":"uint256","name":"_fee"},{"type":"uint256","name":"_admin_fee"}],"stateMutability":"nonpayable","type":"constructor"},{"name":"A","outputs":[{"type":"uint256","name":""}],"inputs":[],"stateMutability":"view","type":"function","gas":5227},{"name":"get_virtual_price","outputs":[{"type":"uint256","name":""}],"inputs":[],"stateMutability":"view","type":"function","gas":1133537},{"name":"calc_token_amount","outputs":[{"type":"uint256","name":""}],"inputs":[{"type":"uint256[3]","name":"amounts"},{"type":"bool","name":"deposit"}],"stateMutability":"view","type":"function","gas":4508776},{"name":"add_liquidity","outputs":[],"inputs":[{"type":"uint256[3]","name":"amounts"},{"type":"uint256","name":"min_mint_amount"}],"stateMutability":"nonpayable","type":"function","gas":6954858},{"name":"get_dy","outputs":[{"type":"uint256","name":""}],"inputs":[{"type":"int128","name":"i"},{"type":"int128","name":"j"},{"type":"uint256","name":"dx"}],"stateMutability":"view","type":"function","gas":2673791},{"name":"get_dy_underlying","outputs":[{"type":"uint256","name":""}],"inputs":[{"type":"int128","name":"i"},{"type":"int128","name":"j"},{"type":"uint256","name":"dx"}],"stateMutability":"view","type":"function","gas":2673474},{"name":"exchange","outputs":[],"inputs":[{"type":"int128","name":"i"},{"type":"int128","name":"j"},{"type":"uint256","name":"dx"},{"type":"uint256","name":"min_dy"}],"stateMutability":"nonpayable","type":"function","gas":2818066},{"name":"remove_liquidity","outputs":[],"inputs":[{"type":"uint256","name":"_amount"},{"type":"uint256[3]","name":"min_amounts"}],"stateMutability":"nonpayable","type":"function","gas":192846},{"name":"remove_liquidity_imbalance","outputs":[],"inputs":[{"type":"uint256[3]","name":"amounts"},{"type":"uint256","name":"max_burn_amount"}],"stateMutability":"nonpayable","type":"function","gas":6951851},{"name":"calc_withdraw_one_coin","outputs":[{"type":"uint256","name":""}],"inputs":[{"type":"uint256","name":"_token_amount"},{"type":"int128","name":"i"}],"stateMutability":"view","type":"function","gas":1102},{"name":"remove_liquidity_one_coin","outputs":[],"inputs":[{"type":"uint256","name":"_token_amount"},{"type":"int128","name":"i"},{"type":"uint256","name":"min_amount"}],"stateMutability":"nonpayable","type":"function","gas":4025523},{"name":"ramp_A","outputs":[],"inputs":[{"type":"uint256","name":"_future_A"},{"type":"uint256","name":"_future_time"}],"stateMutability":"nonpayable","type":"function","gas":151919},{"name":"stop_ramp_A","outputs":[],"inputs":[],"stateMutability":"nonpayable","type":"function","gas":148637},{"name":"commit_new_fee","outputs":[],"inputs":[{"type":"uint256","name":"new_fee"},{"type":"uint256","name":"new_admin_fee"}],"stateMutability":"nonpayable","type":"function","gas":110461},{"name":"apply_new_fee","outputs":[],"inputs":[],"stateMutability":"nonpayable","type":"function","gas":97242},{"name":"revert_new_parameters","outputs":[],"inputs":[],"stateMutability":"nonpayable","type":"function","gas":21895},{"name":"commit_transfer_ownership","outputs":[],"inputs":[{"type":"address","name":"_owner"}],"stateMutability":"nonpayable","type":"function","gas":74572},{"name":"apply_transfer_ownership","outputs":[],"inputs":[],"stateMutability":"nonpayable","type":"function","gas":60710},{"name":"revert_transfer_ownership","outputs":[],"inputs":[],"stateMutability":"nonpayable","type":"function","gas":21985},{"name":"admin_balances","outputs":[{"type":"uint256","name":""}],"inputs":[{"type":"uint256","name":"i"}],"stateMutability":"view","type":"function","gas":3481},{"name":"withdraw_admin_fees","outputs":[],"inputs":[],"stateMutability":"nonpayable","type":"function","gas":21502},{"name":"donate_admin_fees","outputs":[],"inputs":[],"stateMutability":"nonpayable","type":"function","gas":111389},{"name":"kill_me","outputs":[],"inputs":[],"stateMutability":"nonpayable","type":"function","gas":37998},{"name":"unkill_me","outputs":[],"inputs":[],"stateMutability":"nonpayable","type":"function","gas":22135},{"name":"coins","outputs":[{"type":"address","name":""}],"inputs":[{"type":"uint256","name":"arg0"}],"stateMutability":"view","type":"function","gas":2220},{"name":"balances","outputs":[{"type":"uint256","name":""}],"inputs":[{"type":"uint256","name":"arg0"}],"stateMutability":"view","type":"function","gas":2250},{"name":"fee","outputs":[{"type":"uint256","name":""}],"inputs":[],"stateMutability":"view","type":"function","gas":2171},{"name":"admin_fee","outputs":[{"type":"uint256","name":""}],"inputs":[],"stateMutability":"view","type":"function","gas":2201},{"name":"owner","outputs":[{"type":"address","name":""}],"inputs":[],"stateMutability":"view","type":"function","gas":2231},{"name":"initial_A","outputs":[{"type":"uint256","name":""}],"inputs":[],"stateMutability":"view","type":"function","gas":2261},{"name":"future_A","outputs":[{"type":"uint256","name":""}],"inputs":[],"stateMutability":"view","type":"function","gas":2291},{"name":"initial_A_time","outputs":[{"type":"uint256","name":""}],"inputs":[],"stateMutability":"view","type":"function","gas":2321},{"name":"future_A_time","outputs":[{"type":"uint256","name":""}],"inputs":[],"stateMutability":"view","type":"function","gas":2351},{"name":"admin_actions_deadline","outputs":[{"type":"uint256","name":""}],"inputs":[],"stateMutability":"view","type":"function","gas":2381},{"name":"transfer_ownership_deadline","outputs":[{"type":"uint256","name":""}],"inputs":[],"stateMutability":"view","type":"function","gas":2411},{"name":"future_fee","outputs":[{"type":"uint256","name":""}],"inputs":[],"stateMutability":"view","type":"function","gas":2441},{"name":"future_admin_fee","outputs":[{"type":"uint256","name":""}],"inputs":[],"stateMutability":"view","type":"function","gas":2471},{"name":"future_owner","outputs":[{"type":"address","name":""}],"inputs":[],"stateMutability":"view","type":"function","gas":2501}];

var Curve = {
  findPath: findPath$4,
  pathExists: pathExists$4,
  getAmounts: getAmounts$4,
  getTransaction: getTransaction$4,
  REGISTRY,
  POOL: POOL$1,
};

const exchange$d = {

  blockchains: ['ethereum', 'arbitrum', 'avalanche', 'fantom', 'optimism', 'polygon', 'gnosis'],
  name: 'curve',
  alternativeNames: [],
  label: 'Curve',
  logo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgNDE0LjggNDE3LjgiPjxkZWZzPjxjbGlwUGF0aCBpZD0iY2xpcC1wYXRoIj48cmVjdCB3aWR0aD0iNDE0LjciIGhlaWdodD0iNDE3LjgiIHN0eWxlPSJmaWxsOm5vbmUiLz48L2NsaXBQYXRoPjwvZGVmcz48dGl0bGU+QXNzZXQgMTwvdGl0bGU+PGcgaWQ9IkxheWVyXzIiIGRhdGEtbmFtZT0iTGF5ZXIgMiI+PGcgaWQ9IkxheWVyXzEtMiIgZGF0YS1uYW1lPSJMYXllciAxIj48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzYuNCAyNTMuNCAxNDQuOCAyNjAuNCAxNDAuOCAyNDUuNiAxNzQuNSAyMzkuNSAxNzYuNCAyNTMuNCIgc3R5bGU9ImZpbGw6Ymx1ZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDQuOCAyNjAuNCAxMTcuMiAyNjkuNyAxMTEuMyAyNTQuMyAxNDAuOCAyNDUuNiAxNDQuOCAyNjAuNCIgc3R5bGU9ImZpbGw6Ymx1ZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzQuNCAyMzkuNSAxNDAuOCAyNDUuNiAxMzcuMyAyMjguMyAxNzIuNyAyMjMuMSAxNzQuNCAyMzkuNSIgc3R5bGU9ImZpbGw6IzAwMjhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDAuOCAyNDUuNiAxMTEuMyAyNTQuMyAxMDUuOSAyMzYuMyAxMzcuMyAyMjguMyAxNDAuOCAyNDUuNiIgc3R5bGU9ImZpbGw6IzAwMThmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzguNSAyNjQuNyAxNDkgMjcyLjQgMTQ0LjcgMjYwLjQgMTc2LjQgMjUzLjQgMTc4LjUgMjY0LjciIHN0eWxlPSJmaWxsOiMwMDAwZjEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQ5IDI3Mi40IDEyMy42IDI4Mi4yIDExNy4yIDI2OS43IDE0NC44IDI2MC40IDE0OSAyNzIuNCIgc3R5bGU9ImZpbGw6IzAwMDBkYSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzIuNyAyMjMuMSAxMzcuMyAyMjguMyAxMzQuMiAyMDkgMTcxLjIgMjA0LjggMTcyLjcgMjIzLjEiIHN0eWxlPSJmaWxsOiMwMDU4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTM3LjMgMjI4LjMgMTA1LjkgMjM2LjMgMTAxLjMgMjE2LjEgMTM0LjIgMjA5IDEzNy4zIDIyOC4zIiBzdHlsZT0iZmlsbDojMDA0OGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxMSAyNDguOSAxNzYuNCAyNTMuNCAxNzQuNSAyMzkuNSAyMTAuOSAyMzUuOCAyMTEgMjQ4LjkiIHN0eWxlPSJmaWxsOiMwMDE0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTgwLjggMjczIDE1My40IDI4MS4yIDE0OSAyNzIuNCAxNzguNSAyNjQuNyAxODAuOCAyNzMiIHN0eWxlPSJmaWxsOiMwMDAwZGEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTE3LjIgMjY5LjcgOTQuNyAyODEuMyA4Ni43IDI2NS40IDExMS4zIDI1NC4zIDExNy4yIDI2OS43IiBzdHlsZT0iZmlsbDojMDAwMGU4Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1My40IDI4MS4yIDEzMC4zIDI5MS41IDEyMy42IDI4Mi4yIDE0OSAyNzIuNCAxNTMuNCAyODEuMiIgc3R5bGU9ImZpbGw6IzAwMDBjNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTAuOSAyMzUuOCAxNzQuNSAyMzkuNSAxNzIuNyAyMjMuMSAyMTAuOCAyMjAuNSAyMTAuOSAyMzUuOCIgc3R5bGU9ImZpbGw6IzAwM2NmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTEuMyAyNTQuMyA4Ni44IDI2NS40IDc5LjYgMjQ2LjggMTA1LjkgMjM2LjMgMTExLjMgMjU0LjMiIHN0eWxlPSJmaWxsOiMwMDA4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjExLjIgMjU5LjMgMTc4LjUgMjY0LjcgMTc2LjQgMjUzLjQgMjExIDI0OC45IDIxMS4yIDI1OS4zIiBzdHlsZT0iZmlsbDpibHVlIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyMy42IDI4Mi4yIDEwMy4yIDI5NC4xIDk0LjcgMjgxLjMgMTE3LjIgMjY5LjcgMTIzLjYgMjgyLjIiIHN0eWxlPSJmaWxsOiMwMDAwYzgiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTcxLjIgMjA0LjggMTM0LjIgMjA5IDEzMS43IDE4OC4xIDE3MCAxODUgMTcxLjIgMjA0LjgiIHN0eWxlPSJmaWxsOiMwMDkwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTM0LjIgMjA5IDEwMS4zIDIxNi4xIDk3LjUgMTk0LjIgMTMxLjcgMTg4LjEgMTM0LjIgMjA5IiBzdHlsZT0iZmlsbDojMDA4NGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxMC44IDIyMC41IDE3Mi43IDIyMy4xIDE3MS4yIDIwNC44IDIxMC43IDIwMy40IDIxMC44IDIyMC41IiBzdHlsZT0iZmlsbDojMDA2OGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwNS45IDIzNi4zIDc5LjYgMjQ2LjggNzMuNCAyMjYgMTAxLjMgMjE2LjEgMTA1LjkgMjM2LjMiIHN0eWxlPSJmaWxsOiMwMDNjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjExLjQgMjY3IDE4MC44IDI3MyAxNzguNSAyNjQuNyAyMTEuMiAyNTkuMyAyMTEuNCAyNjciIHN0eWxlPSJmaWxsOiMwMDAwZjYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTgzIDI3OC4xIDE1Ny45IDI4Ni43IDE1My40IDI4MS4yIDE4MC44IDI3MyAxODMgMjc4LjEiIHN0eWxlPSJmaWxsOiMwMDAwZDEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTMwLjMgMjkxLjUgMTEyLjEgMzAzLjYgMTAzLjIgMjk0LjEgMTIzLjYgMjgyLjIgMTMwLjMgMjkxLjUiIHN0eWxlPSJmaWxsOiMwMDAwYWQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTU3LjkgMjg2LjcgMTM3LjEgMjk3LjIgMTMwLjMgMjkxLjUgMTUzLjQgMjgxLjIgMTU3LjkgMjg2LjciIHN0eWxlPSJmaWxsOiMwMGIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjEwLjcgMjAzLjQgMTcxLjIgMjA0LjggMTcwIDE4NSAyMTAuNyAxODQuOCAyMTAuNyAyMDMuNCIgc3R5bGU9ImZpbGw6IzAwOWNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMDEuMyAyMTYuMSA3My40IDIyNiA2OC4zIDIwMy40IDk3LjUgMTk0LjIgMTAxLjMgMjE2LjEiIHN0eWxlPSJmaWxsOiMwMDc4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjExLjYgMjcxLjYgMTgzIDI3OC4xIDE4MC44IDI3MyAyMTEuNCAyNjcgMjExLjYgMjcxLjYiIHN0eWxlPSJmaWxsOiMwMDAwZWQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTcwIDE4NSAxMzEuNyAxODguMSAxMjkuOCAxNjYuMSAxNjkuMSAxNjQuMSAxNzAgMTg1IiBzdHlsZT0iZmlsbDojMGNmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI0NyAyNDYuNSAyMTEgMjQ4LjkgMjEwLjkgMjM1LjggMjQ4LjUgMjM0LjUgMjQ3IDI0Ni41IiBzdHlsZT0iZmlsbDojMDAyY2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzMS43IDE4OC4xIDk3LjQgMTk0LjIgOTQuNSAxNzEuMiAxMjkuOCAxNjYuMSAxMzEuNyAxODguMSIgc3R5bGU9ImZpbGw6IzAwYzRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNDUuNCAyNTYuMSAyMTEuMiAyNTkuMyAyMTEgMjQ4LjkgMjQ3IDI0Ni41IDI0NS40IDI1Ni4xIiBzdHlsZT0iZmlsbDojMDAxNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI0OC41IDIzNC41IDIxMC45IDIzNS44IDIxMC44IDIyMC42IDI0OS45IDIyMC40IDI0OC41IDIzNC41IiBzdHlsZT0iZmlsbDojMDA1MGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijk0LjcgMjgxLjMgNzcuNSAyOTQuOCA2Ny43IDI3OC43IDg2LjcgMjY1LjQgOTQuNyAyODEuMyIgc3R5bGU9ImZpbGw6IzAwMDBkYSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4Ni43IDI2NS40IDY3LjcgMjc4LjcgNTguOSAyNTkuNyA3OS42IDI0Ni44IDg2LjcgMjY1LjQiIHN0eWxlPSJmaWxsOmJsdWUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTM3LjEgMjk3LjIgMTIxLjEgMzA5LjQgMTEyLjEgMzAzLjYgMTMwLjMgMjkxLjUgMTM3LjEgMjk3LjIiIHN0eWxlPSJmaWxsOiMwMDAwYTQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTAzLjIgMjk0LjEgODcuOSAzMDcuOCA3Ny41IDI5NC44IDk0LjcgMjgxLjMgMTAzLjIgMjk0LjEiIHN0eWxlPSJmaWxsOiMwMDAwYjYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTg1LjMgMjc5LjkgMTYyLjQgMjg4LjcgMTU3LjkgMjg2LjcgMTgzIDI3OC4xIDE4NS4zIDI3OS45IiBzdHlsZT0iZmlsbDojMDAwMGQ2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI0My44IDI2MyAyMTEuNCAyNjcgMjExLjIgMjU5LjMgMjQ1LjQgMjU2LjEgMjQzLjggMjYzIiBzdHlsZT0iZmlsbDojMDAwNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI0OS45IDIyMC40IDIxMC44IDIyMC41IDIxMC43IDIwMy40IDI1MS4xIDIwNC41IDI0OS45IDIyMC40IiBzdHlsZT0iZmlsbDojMDA3OGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2Mi40IDI4OC43IDE0My45IDI5OS4zIDEzNy4xIDI5Ny4yIDE1Ny45IDI4Ni43IDE2Mi40IDI4OC43IiBzdHlsZT0iZmlsbDojMDAwMGJmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxMC43IDE4NC44IDE3MCAxODUgMTY5LjEgMTY0LjEgMjEwLjcgMTY1LjEgMjEwLjcgMTg0LjgiIHN0eWxlPSJmaWxsOiMwMGQ4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNzkuNiAyNDYuOCA1OC45IDI1OS43IDUxLjIgMjM4LjUgNzMuNCAyMjYgNzkuNiAyNDYuOCIgc3R5bGU9ImZpbGw6IzAwMzRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTEuOCAyNzMuMSAxODUuMyAyNzkuOSAxODMgMjc4LjIgMjExLjYgMjcxLjYgMjExLjggMjczLjEiIHN0eWxlPSJmaWxsOiMwMDAwZjEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTEyLjEgMzAzLjYgOTguOSAzMTcuMyA4Ny45IDMwNy44IDEwMy4yIDI5NC4xIDExMi4xIDMwMy42IiBzdHlsZT0iZmlsbDojMDAwMDlmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijk3LjQgMTk0LjIgNjguMyAyMDMuNCA2NC40IDE3OS42IDk0LjUgMTcxLjIgOTcuNCAxOTQuMiIgc3R5bGU9ImZpbGw6IzAwYmNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNDIuMiAyNjcgMjExLjYgMjcxLjYgMjExLjQgMjY3IDI0My44IDI2MyAyNDIuMiAyNjciIHN0eWxlPSJmaWxsOmJsdWUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTY5LjEgMTY0LjEgMTI5LjggMTY2LjEgMTI4LjYgMTQzLjUgMTY4LjUgMTQyLjYgMTY5LjEgMTY0LjEiIHN0eWxlPSJmaWxsOiMyM2ZmZDQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjUxLjEgMjA0LjUgMjEwLjcgMjAzLjQgMjEwLjcgMTg0LjggMjUyLjIgMTg3LjIgMjUxLjEgMjA0LjUiIHN0eWxlPSJmaWxsOiMwMGFjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTI5LjggMTY2LjEgOTQuNiAxNzEuMiA5Mi43IDE0Ny42IDEyOC42IDE0My41IDEyOS44IDE2Ni4xIiBzdHlsZT0iZmlsbDojMWNmZmRiIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0My45IDI5OS4zIDEzMC4xIDMxMS41IDEyMS4xIDMwOS40IDEzNy4xIDI5Ny4yIDE0My45IDI5OS4zIiBzdHlsZT0iZmlsbDojMDAwMGFkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjczLjQgMjI2IDUxLjIgMjM4LjUgNDQuOSAyMTUuMyA2OC4zIDIwMy40IDczLjQgMjI2IiBzdHlsZT0iZmlsbDojMDA3MGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4Ny41IDI3OC4zIDE2Ni43IDI4Ny4yIDE2Mi40IDI4OC43IDE4NS4zIDI3OS45IDE4Ny41IDI3OC4zIiBzdHlsZT0iZmlsbDojMDAwMGU4Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyMS4xIDMwOS40IDExMCAzMjMgOTguOSAzMTcuMyAxMTIuMSAzMDMuNiAxMjEuMSAzMDkuNCIgc3R5bGU9ImZpbGw6IzAwMDA5NiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTAuNyAxNjUuMSAxNjkuMSAxNjQuMSAxNjguNSAxNDIuNiAyMTAuOCAxNDQuOSAyMTAuNyAxNjUuMSIgc3R5bGU9ImZpbGw6IzI2ZmZkMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNDAuNiAyNjguMSAyMTEuOCAyNzMgMjExLjYgMjcxLjYgMjQyLjIgMjY3IDI0MC42IDI2OC4xIiBzdHlsZT0iZmlsbDpibHVlIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI4Mi42IDI0Ni4yIDI0NyAyNDYuNSAyNDguNSAyMzQuNSAyODUuNSAyMzUuNCAyODIuNiAyNDYuMiIgc3R5bGU9ImZpbGw6IzA0ZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNzkuNSAyNTQuOCAyNDUuNCAyNTYuMSAyNDcgMjQ2LjUgMjgyLjYgMjQ2LjIgMjc5LjUgMjU0LjgiIHN0eWxlPSJmaWxsOiMwMDJjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTY2LjggMjg3LjIgMTUwLjQgMjk3LjcgMTQzLjkgMjk5LjMgMTYyLjQgMjg4LjcgMTY2LjggMjg3LjIiIHN0eWxlPSJmaWxsOiMwMDAwZDEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjUyLjIgMTg3LjIgMjEwLjcgMTg0LjggMjEwLjcgMTY1LjEgMjUzIDE2OC45IDI1Mi4yIDE4Ny4yIiBzdHlsZT0iZmlsbDojMDBlMGZiIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxMiAyNzEuMyAxODcuNSAyNzguMyAxODUuMyAyNzkuOSAyMTEuOCAyNzMuMSAyMTIgMjcxLjMiIHN0eWxlPSJmaWxsOmJsdWUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjg1LjUgMjM1LjQgMjQ4LjUgMjM0LjUgMjQ5LjkgMjIwLjQgMjg4LjEgMjIyLjUgMjg1LjUgMjM1LjQiIHN0eWxlPSJmaWxsOiMwMDY0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iOTQuNiAxNzEuMiA2NC40IDE3OS42IDYxLjggMTU1LjEgOTIuNyAxNDcuNiA5NC42IDE3MS4yIiBzdHlsZT0iZmlsbDojMTlmZmRlIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI3Ni40IDI2MC45IDI0My44IDI2MyAyNDUuNCAyNTYuMSAyNzkuNSAyNTQuOCAyNzYuNCAyNjAuOSIgc3R5bGU9ImZpbGw6IzAwMWNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI3Ny41IDI5NC44IDY1LjUgMzA5LjggNTQuMiAyOTMuNyA2Ny43IDI3OC43IDc3LjUgMjk0LjgiIHN0eWxlPSJmaWxsOiMwMDAwZDEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iODcuOSAzMDcuOCA3Ny43IDMyMi43IDY1LjUgMzA5LjggNzcuNSAyOTQuOCA4Ny45IDMwNy44IiBzdHlsZT0iZmlsbDojMDAwMGE4Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2OC41IDE0Mi42IDEyOC42IDE0My41IDEyOC4xIDEyMC44IDE2OC4zIDEyMS4xIDE2OC41IDE0Mi42IiBzdHlsZT0iZmlsbDojNWFmZjlkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI4OC4xIDIyMi41IDI0OS45IDIyMC40IDI1MS4xIDIwNC41IDI5MC40IDIwNy45IDI4OC4xIDIyMi41IiBzdHlsZT0iZmlsbDojMDA4Y2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjY3LjcgMjc4LjcgNTQuMSAyOTMuNyA0My45IDI3NC42IDU4LjkgMjU5LjcgNjcuNyAyNzguNyIgc3R5bGU9ImZpbGw6Ymx1ZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI2OC4zIDIwMy40IDQ0LjkgMjE1LjQgNDAuMSAxOTAuOSA2NC40IDE3OS42IDY4LjMgMjAzLjQiIHN0eWxlPSJmaWxsOiMwMGI4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTI4LjYgMTQzLjUgOTIuNyAxNDcuNiA5MS44IDEyNCAxMjguMSAxMjAuOCAxMjguNiAxNDMuNSIgc3R5bGU9ImZpbGw6IzVhZmY5ZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNzMuMiAyNjQuMyAyNDIuMiAyNjcgMjQzLjggMjYzIDI3Ni40IDI2MC45IDI3My4yIDI2NC4zIiBzdHlsZT0iZmlsbDojMDAxOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1MC40IDI5Ny43IDEzOC45IDMwOS43IDEzMC4xIDMxMS41IDE0My45IDI5OS4zIDE1MC40IDI5Ny43IiBzdHlsZT0iZmlsbDojMDAwMGJmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzMC4xIDMxMS41IDEyMS4xIDMyNC45IDExMC4xIDMyMyAxMjEuMSAzMDkuNSAxMzAuMSAzMTEuNSIgc3R5bGU9ImZpbGw6IzAwMDA5YiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI5OC45IDMxNy4zIDkwLjUgMzMyIDc3LjggMzIyLjcgODcuOSAzMDcuOCA5OC45IDMxNy4zIiBzdHlsZT0iZmlsbDojMDAwMDkyIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzOSAyNjYuMiAyMTIgMjcxLjMgMjExLjggMjczLjEgMjQwLjYgMjY4LjEgMjM5IDI2Ni4yIiBzdHlsZT0iZmlsbDojMDAwY2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjU4LjkgMjU5LjcgNDMuOSAyNzQuNiAzNC45IDI1My4yIDUxLjIgMjM4LjUgNTguOSAyNTkuNyIgc3R5bGU9ImZpbGw6IzAwMmNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTAuOCAxNDQuOSAxNjguNSAxNDIuNiAxNjguMyAxMjEuMSAyMTAuOSAxMjQuNyAyMTAuOCAxNDQuOSIgc3R5bGU9ImZpbGw6IzVkZmY5YSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNTMgMTY4LjkgMjEwLjcgMTY1LjEgMjEwLjggMTQ0LjkgMjUzLjYgMTUwIDI1MyAxNjguOSIgc3R5bGU9ImZpbGw6IzJjZmZjYSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyOTAuNCAyMDcuOSAyNTEuMSAyMDQuNSAyNTIuMiAxODcuMiAyOTIuNCAxOTEuOSAyOTAuNCAyMDcuOSIgc3R5bGU9ImZpbGw6IzAwYjhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODkuNiAyNzMuMyAxNzAuOSAyODIgMTY2LjggMjg3LjIgMTg3LjUgMjc4LjMgMTg5LjYgMjczLjMiIHN0eWxlPSJmaWxsOmJsdWUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjEyLjMgMjY2LjQgMTg5LjYgMjczLjMgMTg3LjUgMjc4LjMgMjEyIDI3MS4zIDIxMi4zIDI2Ni40IiBzdHlsZT0iZmlsbDojMDAwY2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI3MCAyNjUgMjQwLjYgMjY4LjEgMjQyLjIgMjY3IDI3My4yIDI2NC4zIDI3MCAyNjUiIHN0eWxlPSJmaWxsOiMwMDE4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTcwLjkgMjgyIDE1Ni42IDI5Mi4zIDE1MC40IDI5Ny43IDE2Ni44IDI4Ny4yIDE3MC45IDI4MiIgc3R5bGU9ImZpbGw6IzAwMDBmMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI5Mi43IDE0Ny42IDYxLjggMTU1LjEgNjAuNyAxMzAuNiA5MS44IDEyNCA5Mi43IDE0Ny42IiBzdHlsZT0iZmlsbDojNTZmZmEwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjExMC4xIDMyMyAxMDMuNSAzMzcuNSA5MC41IDMzMiA5OC45IDMxNy4zIDExMC4xIDMyMyIgc3R5bGU9ImZpbGw6IzAwMDA4OSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI1MS4yIDIzOC41IDM0LjkgMjUzLjIgMjcuNiAyMjkuOCA0NC45IDIxNS4zIDUxLjIgMjM4LjUiIHN0eWxlPSJmaWxsOiMwMDZjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNjQuNCAxNzkuNiA0MC4xIDE5MC45IDM2LjkgMTY1LjggNjEuOCAxNTUuMSA2NC40IDE3OS42IiBzdHlsZT0iZmlsbDojMTZmZmUxIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI5Mi40IDE5MS45IDI1Mi4yIDE4Ny4yIDI1MyAxNjguOSAyOTMuOSAxNzUgMjkyLjQgMTkxLjkiIHN0eWxlPSJmaWxsOiMwNmVjZjEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTY4LjMgMTIxLjEgMTI4LjEgMTIwLjggMTI4LjMgOTguOCAxNjguNCAxMDAuMiAxNjguMyAxMjEuMSIgc3R5bGU9ImZpbGw6Izk0ZmY2MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMzcuNiAyNjEuNCAyMTIuMyAyNjYuNCAyMTIgMjcxLjMgMjM5IDI2Ni4yIDIzNy42IDI2MS40IiBzdHlsZT0iZmlsbDojMDAyNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzOC45IDMwOS43IDEzMS45IDMyMi44IDEyMS4xIDMyNC45IDEzMC4xIDMxMS41IDEzOC45IDMwOS43IiBzdHlsZT0iZmlsbDojMDAwMGFkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMxMS42IDI1NS4zIDI3OS41IDI1NC44IDI4Mi42IDI0Ni4yIDMxNS44IDI0Ny43IDMxMS42IDI1NS4zIiBzdHlsZT0iZmlsbDojMDRmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMxNS44IDI0Ny43IDI4Mi42IDI0Ni4yIDI4NS41IDIzNS40IDMxOS44IDIzOCAzMTUuOCAyNDcuNyIgc3R5bGU9ImZpbGw6IzAwNWNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNTMuNiAxNTAgMjEwLjggMTQ0LjkgMjEwLjkgMTI0LjcgMjU0IDEzMS4xIDI1My42IDE1MCIgc3R5bGU9ImZpbGw6IzVkZmY5YSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMjguMSAxMjAuOCA5MS44IDEyNCA5Mi4xIDEwMC45IDEyOC4zIDk4LjggMTI4LjEgMTIwLjgiIHN0eWxlPSJmaWxsOiM5NGZmNjMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjY3IDI2Mi45IDIzOSAyNjYuMiAyNDAuNiAyNjguMSAyNzAgMjY1IDI2NyAyNjIuOSIgc3R5bGU9ImZpbGw6IzAwMjhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTYuNiAyOTIuMyAxNDcuMSAzMDQgMTM4LjkgMzA5LjcgMTUwLjQgMjk3LjcgMTU2LjYgMjkyLjMiIHN0eWxlPSJmaWxsOiMwMDAwZGYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzA3LjIgMjYwLjYgMjc2LjQgMjYwLjkgMjc5LjUgMjU0LjggMzExLjYgMjU1LjMgMzA3LjIgMjYwLjYiIHN0eWxlPSJmaWxsOiMwMDM4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzE5LjggMjM4IDI4NS41IDIzNS40IDI4OC4xIDIyMi41IDMyMy40IDIyNi4zIDMxOS44IDIzOCIgc3R5bGU9ImZpbGw6IzAwNzhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTAuOSAxMjQuNyAxNjguMyAxMjEuMSAxNjguNCAxMDAuMiAyMTEgMTA0LjkgMjEwLjkgMTI0LjciIHN0eWxlPSJmaWxsOiM5MGZmNjYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTIxLjEgMzI0LjkgMTE2LjQgMzM5IDEwMy41IDMzNy41IDExMC4xIDMyMyAxMjEuMSAzMjQuOSIgc3R5bGU9ImZpbGw6IzAwMDA4ZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTEuNiAyNjUgMTc0LjYgMjczLjQgMTcwLjkgMjgyIDE4OS42IDI3My4zIDE5MS42IDI2NSIgc3R5bGU9ImZpbGw6IzAwMWNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMDIuNyAyNjMuNCAyNzMuMiAyNjQuMyAyNzYuNCAyNjAuOSAzMDcuMSAyNjAuNiAzMDIuNyAyNjMuNCIgc3R5bGU9ImZpbGw6IzAwMzRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTIuNSAyNTguNCAxOTEuNiAyNjUgMTg5LjYgMjczLjMgMjEyLjMgMjY2LjQgMjEyLjUgMjU4LjQiIHN0eWxlPSJmaWxsOiMwMDMwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzIzLjQgMjI2LjMgMjg4LjEgMjIyLjUgMjkwLjQgMjA3LjkgMzI2LjYgMjEzLjEgMzIzLjQgMjI2LjMiIHN0eWxlPSJmaWxsOiMwMGEwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjkzLjkgMTc1IDI1MyAxNjguOSAyNTMuNiAxNTAgMjk1IDE1Ny41IDI5My45IDE3NSIgc3R5bGU9ImZpbGw6IzMzZmZjNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0NC45IDIxNS4zIDI3LjYgMjI5LjggMjIgMjA1IDQwLjEgMTkwLjkgNDQuOSAyMTUuMyIgc3R5bGU9ImZpbGw6IzAwYjBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI2NS41IDMwOS44IDU4LjUgMzI1LjggNDUuOCAzMDkuOSA1NC4xIDI5My43IDY1LjUgMzA5LjgiIHN0eWxlPSJmaWxsOiMwMDAwYzgiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNzcuOCAzMjIuNyA3Mi4xIDMzOC40IDU4LjUgMzI1LjggNjUuNSAzMDkuOCA3Ny44IDMyMi43IiBzdHlsZT0iZmlsbDojMDAwMGE0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE3NC42IDI3My40IDE2Mi4zIDI4My40IDE1Ni42IDI5Mi4zIDE3MC45IDI4MiAxNzQuNiAyNzMuNCIgc3R5bGU9ImZpbGw6IzAwMDhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI1NC4yIDI5My43IDQ1LjggMzA5LjkgMzQuNCAyOTEgNDMuOSAyNzQuNiA1NC4yIDI5My43IiBzdHlsZT0iZmlsbDpibHVlIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjkxLjggMTI0IDYwLjcgMTMwLjYgNjEgMTA2LjcgOTIuMSAxMDAuOSA5MS44IDEyNCIgc3R5bGU9ImZpbGw6Izk0ZmY2MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyOTguMyAyNjMuNyAyNzAgMjY1IDI3My4yIDI2NC4zIDMwMi43IDI2My40IDI5OC4zIDI2My43IiBzdHlsZT0iZmlsbDojMDAzNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI2NC4yIDI1OC4xIDIzNy42IDI2MS40IDIzOSAyNjYuMiAyNjcgMjYyLjkgMjY0LjIgMjU4LjEiIHN0eWxlPSJmaWxsOiMwMDNjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNjEuOCAxNTUuMSAzNi45IDE2NS44IDM1LjUgMTQwLjYgNjAuNyAxMzAuNiA2MS44IDE1NS4xIiBzdHlsZT0iZmlsbDojNTZmZmEwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjkwLjUgMzMyIDg2LjMgMzQ3LjMgNzIuMSAzMzguNCA3Ny44IDMyMi43IDkwLjUgMzMyIiBzdHlsZT0iZmlsbDojMDAwMDg5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzNi40IDI1My42IDIxMi41IDI1OC40IDIxMi4zIDI2Ni40IDIzNy42IDI2MS40IDIzNi40IDI1My42IiBzdHlsZT0iZmlsbDojMDRmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyNi42IDIxMy4xIDI5MC40IDIwNy45IDI5Mi40IDE5MS45IDMyOS4zIDE5OC41IDMyNi42IDIxMy4xIiBzdHlsZT0iZmlsbDojMDBjOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI1NCAxMzEuMSAyMTAuOSAxMjQuNyAyMTEgMTA0LjkgMjU0IDExMi42IDI1NCAxMzEuMSIgc3R5bGU9ImZpbGw6IzkwZmY2NiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjguNCAxMDAuMiAxMjguMyA5OC44IDEyOS4yIDc3LjggMTY5IDgwLjMgMTY4LjQgMTAwLjIiIHN0eWxlPSJmaWxsOiNjYWZmMmMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQ3LjEgMzA0IDE0Mi4xIDMxNi43IDEzMS45IDMyMi44IDEzOC45IDMwOS43IDE0Ny4xIDMwNCIgc3R5bGU9ImZpbGw6IzAwMDBjZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0My45IDI3NC42IDM0LjQgMjkxIDI0LjQgMjY5LjYgMzQuOSAyNTMuMiA0My45IDI3NC42IiBzdHlsZT0iZmlsbDojMDAyOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyOC4zIDk4LjggOTIuMSAxMDAuOSA5My40IDc5IDEyOS4yIDc3LjggMTI4LjMgOTguOCIgc3R5bGU9ImZpbGw6I2NlZmYyOSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTEgMTA0LjkgMTY4LjQgMTAwLjIgMTY5IDgwLjMgMjExLjEgODYuMSAyMTEgMTA0LjkiIHN0eWxlPSJmaWxsOiNjN2ZmMzAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTMxLjkgMzIyLjggMTI5IDMzNi41IDExNi40IDMzOSAxMjEuMiAzMjQuOSAxMzEuOSAzMjIuOCIgc3R5bGU9ImZpbGw6IzAwMDA5ZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyOTUgMTU3LjUgMjUzLjYgMTUwIDI1NCAxMzEuMSAyOTUuNiAxMzkuOSAyOTUgMTU3LjUiIHN0eWxlPSJmaWxsOiM2MGZmOTciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjk0LjIgMjYxLjQgMjY3IDI2Mi45IDI3MCAyNjUgMjk4LjMgMjYzLjcgMjk0LjIgMjYxLjQiIHN0eWxlPSJmaWxsOiMwMDQwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTYyLjMgMjgzLjMgMTU0LjcgMjk0LjYgMTQ3LjEgMzA0IDE1Ni42IDI5Mi4zIDE2Mi4zIDI4My4zIiBzdHlsZT0iZmlsbDpibHVlIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwMy41IDMzNy41IDEwMC44IDM1Mi4zIDg2LjMgMzQ3LjMgOTAuNSAzMzIgMTAzLjUgMzM3LjUiIHN0eWxlPSJmaWxsOm5hdnkiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDAuMSAxOTAuOSAyMiAyMDUgMTguMyAxNzkuNCAzNi45IDE2NS44IDQwLjEgMTkwLjkiIHN0eWxlPSJmaWxsOiMxNmZmZTEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzI5LjMgMTk4LjUgMjkyLjQgMTkxLjkgMjkzLjkgMTc1IDMzMS40IDE4MyAzMjkuMyAxOTguNSIgc3R5bGU9ImZpbGw6IzBmZjhlNyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTIuNyAyNDcuNSAxOTMuMyAyNTMuNiAxOTEuNiAyNjUgMjEyLjUgMjU4LjQgMjEyLjcgMjQ3LjUiIHN0eWxlPSJmaWxsOiMwMDU4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTkzLjMgMjUzLjYgMTc4IDI2MS41IDE3NC42IDI3My40IDE5MS42IDI2NSAxOTMuMyAyNTMuNiIgc3R5bGU9ImZpbGw6IzAwNDhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNjEuNyAyNTAuNiAyMzYuNCAyNTMuNiAyMzcuNiAyNjEuNCAyNjQuMiAyNTguMSAyNjEuNyAyNTAuNiIgc3R5bGU9ImZpbGw6IzAwNThmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNC45IDI1My4yIDI0LjQgMjY5LjYgMTYuMiAyNDYuMSAyNy42IDIyOS44IDM0LjkgMjUzLjIiIHN0eWxlPSJmaWxsOiMwMDY4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzM5LjYgMjU3LjMgMzExLjYgMjU1LjMgMzE1LjggMjQ3LjcgMzQ0LjcgMjUwLjcgMzM5LjYgMjU3LjMiIHN0eWxlPSJmaWxsOiMwMDYwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzM0LjMgMjYxLjggMzA3LjIgMjYwLjYgMzExLjYgMjU1LjMgMzM5LjYgMjU3LjMgMzM0LjMgMjYxLjgiIHN0eWxlPSJmaWxsOiMwMDU0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzQ0LjcgMjUwLjcgMzE1LjggMjQ3LjcgMzE5LjggMjM4IDM0OS41IDI0MiAzNDQuNyAyNTAuNyIgc3R5bGU9ImZpbGw6IzAwNzRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMzUuMyAyNDMuMiAyMTIuNyAyNDcuNSAyMTIuNSAyNTguNCAyMzYuNCAyNTMuNiAyMzUuMyAyNDMuMiIgc3R5bGU9ImZpbGw6IzAwNmNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzggMjYxLjUgMTY3LjMgMjcwLjkgMTYyLjMgMjgzLjMgMTc0LjYgMjczLjQgMTc4IDI2MS41IiBzdHlsZT0iZmlsbDojMDAzOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI5MC4yIDI1Ni41IDI2NC4yIDI1OC4xIDI2NyAyNjIuOSAyOTQuMSAyNjEuNCAyOTAuMiAyNTYuNSIgc3R5bGU9ImZpbGw6IzAwNTRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNTQgMTEyLjYgMjExIDEwNC45IDIxMS4xIDg2LjEgMjUzLjkgOTQuOSAyNTQgMTEyLjYiIHN0eWxlPSJmaWxsOiNjMWZmMzYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTE2LjQgMzM5IDExNS4xIDM1My40IDEwMC44IDM1Mi40IDEwMy41IDMzNy41IDExNi40IDMzOSIgc3R5bGU9ImZpbGw6IzAwMDA4NCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI2MC43IDEzMC42IDM1LjUgMTQwLjYgMzUuOSAxMTUuOSA2MSAxMDYuNyA2MC43IDEzMC42IiBzdHlsZT0iZmlsbDojOTdmZjYwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyOC45IDI2My45IDMwMi43IDI2My40IDMwNy4yIDI2MC42IDMzNC4zIDI2MS44IDMyOC45IDI2My45IiBzdHlsZT0iZmlsbDojMDA0Y2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjkyLjEgMTAwLjkgNjEgMTA2LjcgNjIuNyA4My45IDkzLjQgNzkgOTIuMSAxMDAuOSIgc3R5bGU9ImZpbGw6I2QxZmYyNiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNDkuNSAyNDIgMzE5LjggMjM4IDMyMy40IDIyNi4zIDM1My45IDIzMS42IDM0OS41IDI0MiIgc3R5bGU9ImZpbGw6IzAwOTBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzEuNCAxODMgMjkzLjkgMTc1IDI5NSAxNTcuNSAzMzIuOCAxNjYuOSAzMzEuNCAxODMiIHN0eWxlPSJmaWxsOiMzNmZmYzEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjk1LjYgMTM5LjkgMjU0IDEzMS4xIDI1NCAxMTIuNiAyOTUuNiAxMjIuNyAyOTUuNiAxMzkuOSIgc3R5bGU9ImZpbGw6IzhkZmY2YSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjkgODAuMyAxMjkuMiA3Ny44IDEzMC44IDU4LjUgMTY5LjggNjEuOSAxNjkgODAuMyIgc3R5bGU9ImZpbGw6I2ZmZWEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTQuNyAyOTQuNiAxNTEuNCAzMDYuOSAxNDIuMSAzMTYuNyAxNDcuMSAzMDQgMTU0LjcgMjk0LjYiIHN0eWxlPSJmaWxsOmJsdWUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzIzLjYgMjYzLjggMjk4LjMgMjYzLjcgMzAyLjcgMjYzLjQgMzI4LjkgMjYzLjkgMzIzLjYgMjYzLjgiIHN0eWxlPSJmaWxsOiMwMDUwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQyLjEgMzE2LjcgMTQwLjggMzMwIDEyOSAzMzYuNSAxMzEuOSAzMjIuOCAxNDIuMSAzMTYuNyIgc3R5bGU9ImZpbGw6IzAwMDBjNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNTMuOSAyMzEuNiAzMjMuNCAyMjYuMyAzMjYuNiAyMTMuMSAzNTcuOCAyMTkuNiAzNTMuOSAyMzEuNiIgc3R5bGU9ImZpbGw6IzAwYjBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTEuMSA4Ni4xIDE2OSA4MC4zIDE2OS44IDYxLjkgMjExLjMgNjguNyAyMTEuMSA4Ni4xIiBzdHlsZT0iZmlsbDojZmJmMTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI1OS41IDI0MC43IDIzNS4zIDI0My4yIDIzNi40IDI1My42IDI2MS43IDI1MC42IDI1OS41IDI0MC43IiBzdHlsZT0iZmlsbDojMDA4MGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyOS4yIDc3LjggOTMuNCA3OSA5NS44IDU4LjggMTMwLjggNTguNSAxMjkuMiA3Ny44IiBzdHlsZT0iZmlsbDojZmZlMjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM2LjkgMTY1LjggMTguMyAxNzkuNCAxNi42IDE1My43IDM1LjUgMTQwLjYgMzYuOSAxNjUuOCIgc3R5bGU9ImZpbGw6IzUzZmZhNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNy42IDIyOS44IDE2LjIgMjQ2LjEgMTAgMjIxLjIgMjIgMjA1IDI3LjYgMjI5LjgiIHN0eWxlPSJmaWxsOiMwMGIwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTY3LjMgMjcwLjkgMTYxLjMgMjgxLjYgMTU0LjcgMjk0LjYgMTYyLjMgMjgzLjMgMTY3LjMgMjcwLjkiIHN0eWxlPSJmaWxsOiMwMDJjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjg2LjcgMjQ5LjMgMjYxLjcgMjUwLjYgMjY0LjIgMjU4LjEgMjkwLjIgMjU2LjUgMjg2LjcgMjQ5LjMiIHN0eWxlPSJmaWxsOiMwMDcwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNzIuMSAzMzguNCA3MC45IDM1My42IDU2LjcgMzQxLjIgNTguNSAzMjUuOCA3Mi4xIDMzOC40IiBzdHlsZT0iZmlsbDojMDAwMDlmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjU4LjUgMzI1LjggNTYuNyAzNDEuMiA0My41IDMyNS41IDQ1LjggMzA5LjkgNTguNSAzMjUuOCIgc3R5bGU9ImZpbGw6IzAwMDBjOCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTMgMjMzLjkgMTk0LjggMjM5LjQgMTkzLjMgMjUzLjYgMjEyLjcgMjQ3LjUgMjEzIDIzMy45IiBzdHlsZT0iZmlsbDojMDA4Y2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMxOC42IDI2MS4zIDI5NC4xIDI2MS40IDI5OC4zIDI2My43IDMyMy42IDI2My44IDMxOC42IDI2MS4zIiBzdHlsZT0iZmlsbDojMDA1Y2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE5NC44IDIzOS40IDE4MC44IDI0Ni41IDE3OCAyNjEuNSAxOTMuMyAyNTMuNiAxOTQuOCAyMzkuNCIgc3R5bGU9ImZpbGw6IzAwN2NmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNTcuOCAyMTkuNiAzMjYuNiAyMTMuMSAzMjkuMyAxOTguNSAzNjEgMjA2LjQgMzU3LjggMjE5LjYiIHN0eWxlPSJmaWxsOiMwMGQ4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iODYuMyAzNDcuMyA4NS43IDM2Mi4yIDcwLjkgMzUzLjYgNzIuMSAzMzguNCA4Ni4zIDM0Ny4zIiBzdHlsZT0iZmlsbDojMDAwMDg5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyOSAzMzYuNSAxMjkuMSAzNTAuMyAxMTUuMSAzNTMuNCAxMTYuNCAzMzkgMTI5IDMzNi41IiBzdHlsZT0iZmlsbDojMDAwMDliIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzMi44IDE2Ni45IDI5NSAxNTcuNSAyOTUuNiAxMzkuOSAzMzMuNiAxNTAuNyAzMzIuOCAxNjYuOSIgc3R5bGU9ImZpbGw6IzYzZmY5NCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0NS44IDMwOS45IDQzLjUgMzI1LjUgMzEuNiAzMDYuNyAzNC40IDI5MSA0NS44IDMwOS45IiBzdHlsZT0iZmlsbDojMDAwMGZhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzNC40IDIzMC4zIDIxMyAyMzMuOSAyMTIuOCAyNDcuNSAyMzUuMyAyNDMuMiAyMzQuNCAyMzAuMyIgc3R5bGU9ImZpbGw6IzAwOWNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNTMuOSA5NC45IDIxMS4xIDg2LjEgMjExLjMgNjguNyAyNTMuNCA3OC42IDI1My45IDk0LjkiIHN0eWxlPSJmaWxsOiNmMWZjMDYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjk1LjYgMTIyLjcgMjU0IDExMi41IDI1My45IDk0LjkgMjk1LjIgMTA2LjIgMjk1LjYgMTIyLjciIHN0eWxlPSJmaWxsOiNiZWZmMzkiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTgwLjggMjQ2LjUgMTcxLjUgMjU1LjMgMTY3LjMgMjcwLjkgMTc4IDI2MS41IDE4MC44IDI0Ni41IiBzdHlsZT0iZmlsbDojMDA3MGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwMC44IDM1Mi40IDEwMC44IDM2NyA4NS43IDM2Mi4yIDg2LjMgMzQ3LjMgMTAwLjggMzUyLjQiIHN0eWxlPSJmaWxsOm5hdnkiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzEzLjggMjU2LjUgMjkwLjIgMjU2LjUgMjk0LjIgMjYxLjQgMzE4LjYgMjYxLjMgMzEzLjggMjU2LjUiIHN0eWxlPSJmaWxsOiMwMDZjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNjEgMTA2LjcgMzUuOSAxMTYgMzggOTIuNCA2Mi43IDgzLjkgNjEgMTA2LjciIHN0eWxlPSJmaWxsOiNkNGZmMjMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzYxIDIwNi40IDMyOS4zIDE5OC41IDMzMS40IDE4MyAzNjMuNCAxOTIuMyAzNjEgMjA2LjQiIHN0eWxlPSJmaWxsOiMxOWZmZGUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iOTMuNCA3OSA2Mi43IDgzLjkgNjUuOSA2Mi45IDk1LjggNTguOCA5My40IDc5IiBzdHlsZT0iZmlsbDojZmZkYjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM0LjQgMjkxIDMxLjYgMzA2LjcgMjEuMiAyODUuNCAyNC40IDI2OS42IDM0LjQgMjkxIiBzdHlsZT0iZmlsbDojMDAyNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI4My43IDIzOS45IDI1OS41IDI0MC43IDI2MS43IDI1MC42IDI4Ni43IDI0OS4zIDI4My43IDIzOS45IiBzdHlsZT0iZmlsbDojMDA5NGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI1Ny43IDIyOC41IDIzNC40IDIzMC4zIDIzNS4zIDI0My4yIDI1OS41IDI0MC43IDI1Ny43IDIyOC41IiBzdHlsZT0iZmlsbDojMDBhY2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2OS44IDYxLjkgMTMwLjggNTguNSAxMzMuMSA0MS40IDE3MS4xIDQ1LjYgMTY5LjggNjEuOSIgc3R5bGU9ImZpbGw6I2ZmYjIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMiAyMDUgMTAgMjIxLjIgNS45IDE5NS40IDE4LjMgMTc5LjQgMjIgMjA1IiBzdHlsZT0iZmlsbDojMTNmY2U0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1MS40IDMwNi45IDE1MS42IDMxOS42IDE0MC44IDMzMCAxNDIuMSAzMTYuNyAxNTEuNCAzMDYuOSIgc3R5bGU9ImZpbGw6IzAwMDBmMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTEuMyA2OC43IDE2OS44IDYxLjkgMTcxIDQ1LjYgMjExLjUgNTMuMyAyMTEuMyA2OC43IiBzdHlsZT0iZmlsbDojZmZiZDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2MS4zIDI4MS42IDE1OS42IDI5My4zIDE1MS40IDMwNi45IDE1NC43IDI5NC42IDE2MS4zIDI4MS42IiBzdHlsZT0iZmlsbDojMDAyMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzMy42IDE1MC42IDI5NS42IDEzOS45IDI5NS42IDEyMi43IDMzMy42IDEzNC43IDMzMy42IDE1MC42IiBzdHlsZT0iZmlsbDojOGRmZjZhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM1NS45IDI2NC4xIDMzNC4zIDI2MS44IDMzOS42IDI1Ny4zIDM2MS44IDI2MC40IDM1NS45IDI2NC4xIiBzdHlsZT0iZmlsbDojMDA2Y2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM2MS44IDI2MC40IDMzOS42IDI1Ny4zIDM0NC43IDI1MC43IDM2Ny41IDI1NC43IDM2MS44IDI2MC40IiBzdHlsZT0iZmlsbDojMDA3OGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM1LjUgMTQwLjYgMTYuNiAxNTMuNyAxNy4xIDEyOC41IDM1LjkgMTE1LjkgMzUuNSAxNDAuNiIgc3R5bGU9ImZpbGw6Izk3ZmY2MCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNDkuOSAyNjUuNyAzMjguOSAyNjMuOSAzMzQuMyAyNjEuOCAzNTUuOSAyNjQuMSAzNDkuOSAyNjUuNyIgc3R5bGU9ImZpbGw6IzAwNjhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNjcuNSAyNTQuNyAzNDQuNyAyNTAuNyAzNDkuNSAyNDIgMzcyLjkgMjQ3LjEgMzY3LjUgMjU0LjciIHN0eWxlPSJmaWxsOiMwMDhjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTMwLjggNTguNSA5NS44IDU4LjggOTkuMiA0MC44IDEzMy4xIDQxLjQgMTMwLjggNTguNSIgc3R5bGU9ImZpbGw6I2ZmYTcwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTMuMiAyMTggMTk1LjkgMjIyLjYgMTk0LjggMjM5LjMgMjEzIDIzMy45IDIxMy4yIDIxOCIgc3R5bGU9ImZpbGw6IzAwYzRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTUuMSAzNTMuNCAxMTUuNyAzNjcuOCAxMDAuOCAzNjcgMTAwLjggMzUyLjQgMTE1LjEgMzUzLjQiIHN0eWxlPSJmaWxsOiMwMDAwODQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQwLjggMzMwIDE0Mi4yIDM0My4zIDEyOS4xIDM1MC4zIDEyOSAzMzYuNSAxNDAuOCAzMzAiIHN0eWxlPSJmaWxsOiMwMGIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzA5LjYgMjQ5LjUgMjg2LjcgMjQ5LjMgMjkwLjIgMjU2LjUgMzEzLjggMjU2LjUgMzA5LjYgMjQ5LjUiIHN0eWxlPSJmaWxsOiMwMDg0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTcxLjUgMjU1LjMgMTY2LjkgMjY1LjQgMTYxLjMgMjgxLjcgMTY3LjMgMjcwLjkgMTcxLjUgMjU1LjMiIHN0eWxlPSJmaWxsOiMwMDY4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzYzLjQgMTkyLjMgMzMxLjQgMTgzIDMzMi44IDE2Ni45IDM2NS4xIDE3Ny42IDM2My40IDE5Mi4zIiBzdHlsZT0iZmlsbDojM2NmZmJhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzMy44IDIxNS4zIDIxMy4yIDIxOCAyMTMgMjMzLjkgMjM0LjQgMjMwLjMgMjMzLjggMjE1LjMiIHN0eWxlPSJmaWxsOiMwMGQwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjQuNCAyNjkuNiAyMS4yIDI4NS40IDEyLjcgMjYxLjkgMTYuMiAyNDYuMSAyNC40IDI2OS42IiBzdHlsZT0iZmlsbDojMDA2NGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM0NC4xIDI2NS4yIDMyMy42IDI2My44IDMyOC45IDI2My45IDM0OS45IDI2NS43IDM0NC4xIDI2NS4yIiBzdHlsZT0iZmlsbDojMDA2OGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE5NS45IDIyMi42IDE4MyAyMjguOSAxODAuOCAyNDYuNSAxOTQuOCAyMzkuNCAxOTUuOSAyMjIuNiIgc3R5bGU9ImZpbGw6IzAwYjhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNzIuOSAyNDcuMSAzNDkuNSAyNDIgMzUzLjkgMjMxLjYgMzc3LjggMjM3LjkgMzcyLjkgMjQ3LjEiIHN0eWxlPSJmaWxsOiMwMGE0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjk1LjIgMTA2LjIgMjUzLjkgOTQuOSAyNTMuNCA3OC42IDI5NC4yIDkwLjkgMjk1LjIgMTA2LjIiIHN0eWxlPSJmaWxsOiNlYmZmMGMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjUzLjQgNzguNiAyMTEuMyA2OC43IDIxMS41IDUzLjMgMjUyLjcgNjQgMjUzLjQgNzguNiIgc3R5bGU9ImZpbGw6I2ZmYzgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyODEuMiAyMjguNCAyNTcuNyAyMjguNSAyNTkuNSAyNDAuNyAyODMuNyAyMzkuOSAyODEuMiAyMjguNCIgc3R5bGU9ImZpbGw6IzAwYmNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzguNCAyNjIuNSAzMTguNiAyNjEuMyAzMjMuNiAyNjMuOCAzNDQuMSAyNjUuMiAzMzguNCAyNjIuNSIgc3R5bGU9ImZpbGw6IzAwNzRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNzcuOCAyMzcuOSAzNTMuOSAyMzEuNiAzNTcuNyAyMTkuNiAzODIgMjI3LjIgMzc3LjggMjM3LjkiIHN0eWxlPSJmaWxsOiMwMGM0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjU2LjQgMjE0LjQgMjMzLjggMjE1LjMgMjM0LjQgMjMwLjMgMjU3LjcgMjI4LjUgMjU2LjQgMjE0LjQiIHN0eWxlPSJmaWxsOiMwMGRjZmUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTgzIDIyOC45IDE3NC44IDIzNi45IDE3MS41IDI1NS4zIDE4MC44IDI0Ni41IDE4MyAyMjguOSIgc3R5bGU9ImZpbGw6IzAwYjBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzMuNiAxMzQuNyAyOTUuNiAxMjIuNyAyOTUuMSAxMDYuMiAzMzIuOSAxMTkuNCAzMzMuNiAxMzQuNyIgc3R5bGU9ImZpbGw6I2I3ZmY0MCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMDUuOSAyNDAuNSAyODMuNyAyMzkuOSAyODYuNyAyNDkuMyAzMDkuNiAyNDkuNSAzMDUuOSAyNDAuNSIgc3R5bGU9ImZpbGw6IzAwYTRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNjUuMSAxNzcuNiAzMzIuOCAxNjYuOSAzMzMuNiAxNTAuNyAzNjYgMTYyLjcgMzY1LjEgMTc3LjYiIHN0eWxlPSJmaWxsOiM2M2ZmOTQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTI5LjEgMzUwLjMgMTMwLjIgMzY0LjQgMTE1LjcgMzY3LjggMTE1LjEgMzUzLjQgMTI5LjEgMzUwLjMiIHN0eWxlPSJmaWxsOiMwMDAwOTYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTguMyAxNzkuNCA1LjkgMTk1LjQgNCAxNjkuNCAxNi42IDE1My43IDE4LjMgMTc5LjQiIHN0eWxlPSJmaWxsOiM1M2ZmYTQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNjIuNyA4My45IDM4IDkyLjQgNDIgNzAuNyA2NS45IDYyLjkgNjIuNyA4My45IiBzdHlsZT0iZmlsbDpnb2xkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE3MSA0NS42IDEzMy4xIDQxLjQgMTM2LjEgMjYuOSAxNzIuNiAzMS44IDE3MSA0NS42IiBzdHlsZT0iZmlsbDojZmY3YTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijk1LjggNTguOCA2NS45IDYyLjkgNzAuNSA0NC4yIDk5LjIgNDAuOCA5NS44IDU4LjgiIHN0eWxlPSJmaWxsOiNmZjljMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjExLjUgNTMuMyAxNzEuMSA0NS42IDE3Mi42IDMxLjggMjExLjcgNDAuMiAyMTEuNSA1My4zIiBzdHlsZT0iZmlsbDojZmY4OTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzMy4yIDI1Ny43IDMxMy44IDI1Ni41IDMxOC42IDI2MS4zIDMzOC40IDI2Mi41IDMzMy4yIDI1Ny43IiBzdHlsZT0iZmlsbDojMDA4NGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjcwLjkgMzUzLjYgNzIuNiAzNjcuNCA1OC41IDM1NS4xIDU2LjcgMzQxLjIgNzAuOSAzNTMuNiIgc3R5bGU9ImZpbGw6IzAwMDA5ZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzODIgMjI3LjIgMzU3LjggMjE5LjYgMzYxIDIwNi40IDM4NS42IDIxNS4yIDM4MiAyMjcuMiIgc3R5bGU9ImZpbGw6IzAwZTRmOCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI1Ni43IDM0MS4yIDU4LjUgMzU1LjEgNDUuMyAzMzkuNCA0My41IDMyNS41IDU2LjcgMzQxLjIiIHN0eWxlPSJmaWxsOiMwMDAwYzgiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTU5LjYgMjkzLjMgMTYxLjIgMzA1LjUgMTUxLjYgMzE5LjYgMTUxLjQgMzA2LjkgMTU5LjYgMjkzLjMiIHN0eWxlPSJmaWxsOiMwMDE4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTYuMiAyNDYuMSAxMi43IDI2MiA2LjIgMjM3IDEwIDIyMS4yIDE2LjIgMjQ2LjEiIHN0eWxlPSJmaWxsOiMwMGFjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iODUuNyAzNjIuMiA4Ny40IDM3Ni4xIDcyLjYgMzY3LjQgNzAuOSAzNTMuNiA4NS43IDM2Mi4yIiBzdHlsZT0iZmlsbDojMDAwMDg5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2Ni45IDI2NS40IDE2Ni40IDI3Ni41IDE1OS42IDI5My4zIDE2MS4zIDI4MS43IDE2Ni45IDI2NS40IiBzdHlsZT0iZmlsbDojMDA1Y2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxMy4zIDIwMC4xIDE5Ni43IDIwMy43IDE5NS45IDIyMi42IDIxMy4yIDIxOCAyMTMuMyAyMDAuMSIgc3R5bGU9ImZpbGw6IzE2ZmZlMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTEuNiAzMTkuNiAxNTQuMyAzMzIuMyAxNDIuMiAzNDMuMyAxNDAuOCAzMzAgMTUxLjYgMzE5LjYiIHN0eWxlPSJmaWxsOiMwMDAwZWQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjk0LjIgOTAuOSAyNTMuNCA3OC42IDI1Mi43IDY0IDI5Mi43IDc3LjIgMjk0LjIgOTAuOSIgc3R5bGU9ImZpbGw6Z29sZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMzMuNCAxOTguNSAyMTMuMyAyMDAuMSAyMTMuMiAyMTggMjMzLjggMjE1LjMgMjMzLjQgMTk4LjUiIHN0eWxlPSJmaWxsOiMxY2ZmZGIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzUuOSAxMTUuOSAxNy4xIDEyOC41IDE5LjYgMTA0LjMgMzggOTIuNCAzNS45IDExNS45IiBzdHlsZT0iZmlsbDojZDdmZjFmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQzLjUgMzI1LjUgNDUuMyAzMzkuNCAzMy40IDMyMC43IDMxLjYgMzA2LjcgNDMuNSAzMjUuNSIgc3R5bGU9ImZpbGw6IzAwMDBmYSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNzkuMyAyMTUuMiAyNTYuNCAyMTQuNCAyNTcuNyAyMjguNSAyODEuMiAyMjguNCAyNzkuMyAyMTUuMiIgc3R5bGU9ImZpbGw6IzAyZThmNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzMuMSA0MS40IDk5LjIgNDAuOCAxMDMuNiAyNS43IDEzNi4xIDI2LjkgMTMzLjEgNDEuNCIgc3R5bGU9ImZpbGw6I2ZmNmYwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNTIuNyA2NCAyMTEuNSA1My4zIDIxMS43IDQwLjIgMjUxLjggNTEuNiAyNTIuNyA2NCIgc3R5bGU9ImZpbGw6I2ZmOTgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTYuNyAyMDMuNyAxODQuNSAyMDkgMTgzIDIyOC45IDE5NS45IDIyMi42IDE5Ni43IDIwMy43IiBzdHlsZT0iZmlsbDojMTNmY2U0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyOC40IDI1MSAzMDkuNiAyNDkuNSAzMTMuOCAyNTYuNSAzMzMuMSAyNTcuNyAzMjguNCAyNTEiIHN0eWxlPSJmaWxsOiMwMDljZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc0LjggMjM2LjkgMTcxLjIgMjQ2LjMgMTY2LjkgMjY1LjQgMTcxLjUgMjU1LjMgMTc0LjggMjM2LjkiIHN0eWxlPSJmaWxsOiMwMGE4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzAyLjggMjI5LjcgMjgxLjIgMjI4LjQgMjgzLjcgMjM5LjkgMzA1LjkgMjQwLjUgMzAyLjggMjI5LjciIHN0eWxlPSJmaWxsOiMwY2YiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzg1LjYgMjE1LjIgMzYxIDIwNi40IDM2My40IDE5Mi4zIDM4OC4zIDIwMi40IDM4NS42IDIxNS4yIiBzdHlsZT0iZmlsbDojMWZmZmQ3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwMC43IDM2NyAxMDIuNCAzODAuOSA4Ny40IDM3Ni4xIDg1LjcgMzYyLjIgMTAwLjcgMzY3IiBzdHlsZT0iZmlsbDpuYXZ5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM2NiAxNjIuNyAzMzMuNiAxNTAuNyAzMzMuNiAxMzQuNyAzNjYgMTQ4IDM2NiAxNjIuNyIgc3R5bGU9ImZpbGw6IzhkZmY2YSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzIuOSAxMTkuNCAyOTUuMiAxMDYuMiAyOTQuMiA5MC45IDMzMS41IDEwNS4xIDMzMi45IDExOS40IiBzdHlsZT0iZmlsbDojZTFmZjE2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI1NS42IDE5OC43IDIzMy40IDE5OC41IDIzMy44IDIxNS4zIDI1Ni40IDIxNC40IDI1NS42IDE5OC43IiBzdHlsZT0iZmlsbDojMjNmZmQ0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMxLjYgMzA2LjcgMzMuNCAzMjAuNyAyMyAyOTkuNCAyMS4yIDI4NS40IDMxLjYgMzA2LjciIHN0eWxlPSJmaWxsOiMwMDI0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzcwLjYgMjY3LjUgMzU1LjkgMjY0LjEgMzYxLjggMjYwLjQgMzc2LjggMjY0LjUgMzcwLjYgMjY3LjUiIHN0eWxlPSJmaWxsOiMwMDg0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQyLjIgMzQzLjMgMTQzLjkgMzU3LjEgMTMwLjIgMzY0LjQgMTI5LjEgMzUwLjMgMTQyLjIgMzQzLjMiIHN0eWxlPSJmaWxsOiMwMGIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzY0LjMgMjY4LjUgMzQ5LjkgMjY1LjcgMzU1LjkgMjY0LjEgMzcwLjYgMjY3LjUgMzY0LjMgMjY4LjUiIHN0eWxlPSJmaWxsOiMwMDgwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzc2LjggMjY0LjUgMzYxLjggMjYwLjQgMzY3LjUgMjU0LjcgMzgyLjkgMjU5LjYgMzc2LjggMjY0LjUiIHN0eWxlPSJmaWxsOiMwMDkwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzU4LjEgMjY3LjcgMzQ0LjEgMjY1LjIgMzQ5LjkgMjY1LjcgMzY0LjMgMjY4LjUgMzU4LjEgMjY3LjciIHN0eWxlPSJmaWxsOiMwMDg0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzgyLjkgMjU5LjYgMzY3LjUgMjU0LjcgMzcyLjkgMjQ3LjEgMzg4LjUgMjUzIDM4Mi45IDI1OS42IiBzdHlsZT0iZmlsbDojMDBhMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4NC41IDIwOSAxNzcgMjE2LjEgMTc0LjggMjM2LjkgMTgzIDIyOC45IDE4NC41IDIwOSIgc3R5bGU9ImZpbGw6IzBjZjRlYiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMCAyMjEuMiA2LjIgMjM3IDEuOSAyMTEuMiA1LjkgMTk1LjQgMTAgMjIxLjIiIHN0eWxlPSJmaWxsOiMxM2ZjZTQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzI0LjMgMjQyLjUgMzA1LjkgMjQwLjUgMzA5LjYgMjQ5LjUgMzI4LjQgMjUxIDMyNC4zIDI0Mi41IiBzdHlsZT0iZmlsbDojMDBiOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxMS43IDQwLjIgMTcyLjYgMzEuOCAxNzQuNCAyMC45IDIxMiAyOS44IDIxMS43IDQwLjIiIHN0eWxlPSJmaWxsOiNmZjYwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzg4LjMgMjAyLjQgMzYzLjQgMTkyLjMgMzY1LjEgMTc3LjYgMzkwLjIgMTg5IDM4OC4zIDIwMi40IiBzdHlsZT0iZmlsbDojNDNmZmI0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2LjYgMTUzLjcgNCAxNjkuNCA0LjUgMTQzLjcgMTcuMSAxMjguNSAxNi42IDE1My43IiBzdHlsZT0iZmlsbDojOTdmZjYwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjExNS43IDM2Ny44IDExNy40IDM4MS43IDEwMi40IDM4MC45IDEwMC44IDM2NyAxMTUuNyAzNjcuOCIgc3R5bGU9ImZpbGw6IzAwMDA4NCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzIuNiAzMS44IDEzNi4xIDI2LjkgMTM5LjUgMTUuNCAxNzQuNCAyMC45IDE3Mi42IDMxLjgiIHN0eWxlPSJmaWxsOiNmZjRlMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjkyLjcgNzcuMiAyNTIuNyA2NCAyNTEuOCA1MS42IDI5MC44IDY1LjUgMjkyLjcgNzcuMiIgc3R5bGU9ImZpbGw6I2ZmYWIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNTIuMSAyNjQuOCAzMzguNCAyNjIuNSAzNDQuMSAyNjUuMiAzNTguMSAyNjcuNyAzNTIuMSAyNjQuOCIgc3R5bGU9ImZpbGw6IzAwOGNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNzguMSAyMDAuNiAyNTUuNiAxOTguNyAyNTYuNCAyMTQuNCAyNzkuMyAyMTUuMiAyNzguMSAyMDAuNiIgc3R5bGU9ImZpbGw6IzJjZmZjYSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzODguNSAyNTMgMzcyLjkgMjQ3LjEgMzc3LjggMjM3LjkgMzkzLjcgMjQ0LjggMzg4LjUgMjUzIiBzdHlsZT0iZmlsbDojMDBiOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjY1LjkgNjIuOSA0MiA3MC43IDQ3LjYgNTEuMyA3MC41IDQ0LjIgNjUuOSA2Mi45IiBzdHlsZT0iZmlsbDojZmY5NDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijk5LjIgNDAuOCA3MC41IDQ0LjIgNzYuMyAyOC4zIDEwMy42IDI1LjcgOTkuMiA0MC44IiBzdHlsZT0iZmlsbDojZmY2NDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMwMC42IDIxNy40IDI3OS4zIDIxNS4yIDI4MS4yIDIyOC40IDMwMi44IDIyOS43IDMwMC42IDIxNy40IiBzdHlsZT0iZmlsbDojMGNmNGViIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzMy4zIDE4MC4zIDIxMy41IDE4MC44IDIxMy4zIDIwMC4xIDIzMy40IDE5OC41IDIzMy4zIDE4MC4zIiBzdHlsZT0iZmlsbDojNTBmZmE3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxMy41IDE4MC44IDE5Ny4yIDE4My4xIDE5Ni43IDIwMy43IDIxMy4zIDIwMC4xIDIxMy41IDE4MC44IiBzdHlsZT0iZmlsbDojNGRmZmFhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM2NiAxNDggMzMzLjYgMTM0LjcgMzMyLjkgMTE5LjQgMzY1LjEgMTMzLjggMzY2IDE0OCIgc3R5bGU9ImZpbGw6I2I0ZmY0MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjYuNCAyNzYuNSAxNjkuMiAyODguMSAxNjEuMiAzMDUuNSAxNTkuNiAyOTMuMyAxNjYuNCAyNzYuNSIgc3R5bGU9ImZpbGw6IzAwNThmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNTEuOCA1MS42IDIxMS43IDQwLjIgMjEyIDI5LjggMjUwLjcgNDEuOCAyNTEuOCA1MS42IiBzdHlsZT0iZmlsbDojZmY2ZjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxLjIgMjg1LjQgMjMgMjk5LjQgMTQuNSAyNzYuMSAxMi43IDI2MS45IDIxLjIgMjg1LjQiIHN0eWxlPSJmaWxsOiMwMDY4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzMxLjUgMTA1LjEgMjk0LjIgOTAuOSAyOTIuNyA3Ny4yIDMyOS40IDkyLjMgMzMxLjUgMTA1LjEiIHN0eWxlPSJmaWxsOiNmZmUyMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTYxLjIgMzA1LjUgMTY0LjkgMzE3LjcgMTU0LjMgMzMyLjMgMTUxLjYgMzE5LjYgMTYxLjIgMzA1LjUiIHN0eWxlPSJmaWxsOiMwMDE0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTcxLjIgMjQ2LjMgMTcxLjggMjU2LjcgMTY2LjQgMjc2LjUgMTY2LjkgMjY1LjQgMTcxLjIgMjQ2LjMiIHN0eWxlPSJmaWxsOiMwMGEwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzQ2LjYgMjYwLjEgMzMzLjEgMjU3LjggMzM4LjQgMjYyLjUgMzUyLjEgMjY0LjggMzQ2LjYgMjYwLjEiIHN0eWxlPSJmaWxsOiMwMDljZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjU1LjMgMTgxLjggMjMzLjMgMTgwLjQgMjMzLjQgMTk4LjUgMjU1LjYgMTk4LjcgMjU1LjMgMTgxLjgiIHN0eWxlPSJmaWxsOiM1M2ZmYTQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzkzLjcgMjQ0LjggMzc3LjggMjM3LjkgMzgyIDIyNy4yIDM5OC4xIDIzNS4yIDM5My43IDI0NC44IiBzdHlsZT0iZmlsbDojMDBkNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzNi4xIDI2LjkgMTAzLjYgMjUuNyAxMDguOSAxMy43IDEzOS41IDE1LjQgMTM2LjEgMjYuOSIgc3R5bGU9ImZpbGw6I2ZmM2YwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzOCA5Mi40IDE5LjYgMTA0LjMgMjQuMiA4MiA0MiA3MC43IDM4IDkyLjQiIHN0eWxlPSJmaWxsOiNmZmQzMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTk3LjIgMTgzLjEgMTg1LjMgMTg3LjQgMTg0LjUgMjA5IDE5Ni43IDIwMy43IDE5Ny4yIDE4My4xIiBzdHlsZT0iZmlsbDojNDlmZmFkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyMC45IDIzMi40IDMwMi44IDIyOS43IDMwNS45IDI0MC41IDMyNC4zIDI0Mi41IDMyMC45IDIzMi40IiBzdHlsZT0iZmlsbDojMDBkY2ZlIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM5MC4yIDE4OSAzNjUuMSAxNzcuNiAzNjYgMTYyLjcgMzkxLjEgMTc1LjQgMzkwLjIgMTg5IiBzdHlsZT0iZmlsbDojNjZmZjkwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE3NyAyMTYuMSAxNzQuMiAyMjQuNyAxNzEuMiAyNDYuMyAxNzQuOCAyMzYuOSAxNzcgMjE2LjEiIHN0eWxlPSJmaWxsOiMwOWYwZWUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTMwLjIgMzY0LjUgMTMxLjggMzc4LjQgMTE3LjQgMzgxLjcgMTE1LjcgMzY3LjggMTMwLjIgMzY0LjUiIHN0eWxlPSJmaWxsOiMwMDAwOWIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTU0LjMgMzMyLjMgMTU2LjUgMzQ1LjkgMTQzLjkgMzU3LjEgMTQyLjIgMzQzLjMgMTU0LjMgMzMyLjMiIHN0eWxlPSJmaWxsOiMwMDAwZTgiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzQxLjUgMjUzLjYgMzI4LjQgMjUxIDMzMy4yIDI1Ny43IDM0Ni42IDI2MC4xIDM0MS41IDI1My42IiBzdHlsZT0iZmlsbDojMDBiMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM5OC4xIDIzNS4yIDM4MiAyMjcuMiAzODUuNiAyMTUuMiA0MDEuOSAyMjQuNSAzOTguMSAyMzUuMiIgc3R5bGU9ImZpbGw6IzBjZjRlYiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyOTkuMSAyMDMuOSAyNzguMSAyMDAuNiAyNzkuMyAyMTUuMiAzMDAuNiAyMTcuNCAyOTkuMSAyMDMuOSIgc3R5bGU9ImZpbGw6IzMzZmZjNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNzcuNiAxODQuOSAyNTUuMiAxODEuOCAyNTUuNiAxOTguNyAyNzguMSAyMDAuNiAyNzcuNiAxODQuOSIgc3R5bGU9ImZpbGw6IzU2ZmZhMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTIgMjkuOCAxNzQuNCAyMC45IDE3Ni40IDEzLjIgMjEyLjIgMjIuNSAyMTIgMjkuOCIgc3R5bGU9ImZpbGw6I2ZmM2IwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI3Mi42IDM2Ny40IDc1LjMgMzc5LjkgNjEuMyAzNjcuNyA1OC41IDM1NS4xIDcyLjYgMzY3LjQiIHN0eWxlPSJmaWxsOiMwMDAwYTgiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzY1LjEgMTMzLjggMzMyLjkgMTE5LjQgMzMxLjUgMTA1LjEgMzYzLjQgMTIwLjYgMzY1LjEgMTMzLjgiIHN0eWxlPSJmaWxsOiNkN2ZmMWYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjkwLjggNjUuNSAyNTEuOCA1MS42IDI1MC43IDQxLjggMjg4LjUgNTYuMiAyOTAuOCA2NS41IiBzdHlsZT0iZmlsbDojZmY4NjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjU4LjUgMzU1LjEgNjEuMyAzNjcuNyA0OC4yIDM1Mi4xIDQ1LjMgMzM5LjQgNTguNSAzNTUuMSIgc3R5bGU9ImZpbGw6IzAwMDBjZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI1LjkgMTk1LjQgMS45IDIxMS4yIDAgMTg1IDQgMTY5LjQgNS45IDE5NS40IiBzdHlsZT0iZmlsbDojNTNmZmE0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4NS4zIDE4Ny40IDE3OC4yIDE5My41IDE3NyAyMTYuMSAxODQuNSAyMDkgMTg1LjMgMTg3LjQiIHN0eWxlPSJmaWxsOiM0NmZmYjEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc0LjQgMjAuOSAxMzkuNSAxNS40IDE0My41IDcuNCAxNzYuNCAxMy4yIDE3NC40IDIwLjkiIHN0eWxlPSJmaWxsOiNmZjI5MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTIuNyAyNjEuOSAxNC41IDI3Ni4xIDggMjUxLjIgNi4yIDIzNyAxMi43IDI2MS45IiBzdHlsZT0iZmlsbDojMDBiMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzMy41IDE2MS4zIDIxMy42IDE2MC40IDIxMy41IDE4MC44IDIzMy4zIDE4MC40IDIzMy41IDE2MS4zIiBzdHlsZT0iZmlsbDojODBmZjc3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijg3LjQgMzc2LjEgODkuOSAzODguNSA3NS4zIDM3OS45IDcyLjYgMzY3LjQgODcuNCAzNzYuMSIgc3R5bGU9ImZpbGw6IzAwMDA5MiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMjkuNCA5Mi4zIDI5Mi43IDc3LjIgMjkwLjggNjUuNSAzMjYuNyA4MS4zIDMyOS40IDkyLjMiIHN0eWxlPSJmaWxsOiNmZmI5MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjEzLjYgMTYwLjQgMTk3LjIgMTYxLjUgMTk3LjIgMTgzLjEgMjEzLjUgMTgwLjggMjEzLjYgMTYwLjQiIHN0eWxlPSJmaWxsOiM4MGZmNzciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzE4LjQgMjIwLjkgMzAwLjYgMjE3LjQgMzAyLjggMjI5LjggMzIwLjkgMjMyLjQgMzE4LjQgMjIwLjkiIHN0eWxlPSJmaWxsOiMxNmZmZTEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjUwLjcgNDEuOCAyMTIgMjkuOCAyMTIuMiAyMi41IDI0OS4zIDM0LjcgMjUwLjcgNDEuOCIgc3R5bGU9ImZpbGw6I2ZmNGUwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzOTEuMSAxNzUuNCAzNjYgMTYyLjcgMzY2IDE0OCAzOTEuMSAxNjEuOSAzOTEuMSAxNzUuNCIgc3R5bGU9ImZpbGw6IzhhZmY2ZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNy4xIDEyOC41IDQuNSAxNDMuNyA3LjQgMTE5LjIgMTkuNiAxMDQuMyAxNy4xIDEyOC41IiBzdHlsZT0iZmlsbDojZDdmZjFmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQ1LjMgMzM5LjQgNDguMiAzNTIuMSAzNi40IDMzMy42IDMzLjQgMzIwLjcgNDUuMyAzMzkuNCIgc3R5bGU9ImZpbGw6Ymx1ZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzcuMiAyNDUuNSAzMjQuMyAyNDIuNSAzMjguNCAyNTEgMzQxLjUgMjUzLjYgMzM3LjIgMjQ1LjUiIHN0eWxlPSJmaWxsOiMwMGM4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjU1LjUgMTY0LjEgMjMzLjUgMTYxLjMgMjMzLjMgMTgwLjMgMjU1LjIgMTgxLjggMjU1LjUgMTY0LjEiIHN0eWxlPSJmaWxsOiM4MGZmNzciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDAxLjkgMjI0LjUgMzg1LjYgMjE1LjIgMzg4LjMgMjAyLjQgNDA0LjggMjEzIDQwMS45IDIyNC41IiBzdHlsZT0iZmlsbDojMjlmZmNlIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwMy42IDI1LjcgNzYuMyAyOC4zIDgzLjMgMTUuOCAxMDguOCAxMy43IDEwMy42IDI1LjciIHN0eWxlPSJmaWxsOiNmZjMwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNzAuNSA0NC4yIDQ3LjYgNTEuMyA1NC44IDM0LjggNzYuMyAyOC4zIDcwLjUgNDQuMiIgc3R5bGU9ImZpbGw6I2ZmNTkwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNzAuOSAyNzIuMiAzNjQuMyAyNjguNSAzNzAuNiAyNjcuNSAzNzcuMyAyNzEuNiAzNzAuOSAyNzIuMiIgc3R5bGU9ImZpbGw6IzAwOThmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNzcuMyAyNzEuNiAzNzAuNiAyNjcuNSAzNzYuOCAyNjQuNSAzODMuNiAyNjkuMiAzNzcuMyAyNzEuNiIgc3R5bGU9ImZpbGw6IzAwOWNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMDIuNCAzODAuOSAxMDQuOCAzOTMuMiA4OS45IDM4OC41IDg3LjQgMzc2LjEgMTAyLjQgMzgwLjkiIHN0eWxlPSJmaWxsOiMwMDAwODQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzY0LjUgMjcxIDM1OC4xIDI2Ny43IDM2NC4zIDI2OC41IDM3MC45IDI3Mi4yIDM2NC41IDI3MSIgc3R5bGU9ImZpbGw6IzAwOThmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTcuMiAxNjEuNSAxODUuMyAxNjQuNiAxODUuMyAxODcuNCAxOTcuMiAxODMuMSAxOTcuMiAxNjEuNSIgc3R5bGU9ImZpbGw6IzgwZmY3NyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzODMuNiAyNjkuMiAzNzYuOCAyNjQuNSAzODIuOSAyNTkuNiAzODkuNyAyNjUuMSAzODMuNiAyNjkuMiIgc3R5bGU9ImZpbGw6IzAwYTRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzEuOCAyNTYuNyAxNzUuNCAyNjcuNyAxNjkuMiAyODguMSAxNjYuNCAyNzYuNSAxNzEuOCAyNTYuNyIgc3R5bGU9ImZpbGw6IzAwOWNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDMuOSAzNTcuMSAxNDUuNSAzNzEuMSAxMzEuOSAzNzguNCAxMzAuMiAzNjQuNSAxNDMuOSAzNTcuMSIgc3R5bGU9ImZpbGw6IzAwYiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjkuMiAyODguMSAxNzMuOCAyOTkuOCAxNjQuOSAzMTcuNyAxNjEuMiAzMDUuNSAxNjkuMiAyODguMSIgc3R5bGU9ImZpbGw6IzAwNTRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzkuNSAxNS40IDEwOC44IDEzLjcgMTE0LjggNS4yIDE0My41IDcuNCAxMzkuNSAxNS40IiBzdHlsZT0iZmlsbDojZmYxNjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI5OC41IDE4OS40IDI3Ny42IDE4NC45IDI3OC4xIDIwMC42IDI5OS4xIDIwMy45IDI5OC41IDE4OS40IiBzdHlsZT0iZmlsbDojNWFmZjlkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM1OC41IDI2OCAzNTIuMSAyNjQuOCAzNTguMSAyNjcuNyAzNjQuNSAyNzEgMzU4LjUgMjY4IiBzdHlsZT0iZmlsbDojMDBhMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzLjQgMzIwLjcgMzYuNCAzMzMuNiAyNi4yIDMxMi42IDIzIDI5OS40IDMzLjQgMzIwLjciIHN0eWxlPSJmaWxsOiMwMDI4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc0LjIgMjI0LjcgMTc1LjUgMjM0LjQgMTcxLjggMjU2LjcgMTcxLjIgMjQ2LjMgMTc0LjIgMjI0LjciIHN0eWxlPSJmaWxsOiMwNmVjZjEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzYzLjQgMTIwLjYgMzMxLjUgMTA1LjEgMzI5LjQgOTIuMyAzNjAuOCAxMDguNiAzNjMuNCAxMjAuNiIgc3R5bGU9ImZpbGw6I2ZiZjEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNzcuOSAxNjguNiAyNTUuNSAxNjQuMSAyNTUuMiAxODEuOCAyNzcuNiAxODQuOSAyNzcuOSAxNjguNiIgc3R5bGU9ImZpbGw6IzgwZmY3NyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzODkuNyAyNjUuMSAzODIuOSAyNTkuNiAzODguNSAyNTMgMzk1LjUgMjU5LjMgMzg5LjcgMjY1LjEiIHN0eWxlPSJmaWxsOiMwMGI0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzMzLjYgMjM2LjEgMzIwLjkgMjMyLjQgMzI0LjMgMjQyLjUgMzM3LjIgMjQ1LjUgMzMzLjYgMjM2LjEiIHN0eWxlPSJmaWxsOiMwMmU4ZjQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjg4LjUgNTYuMiAyNTAuNyA0MS44IDI0OS4zIDM0LjcgMjg1LjggNDkuNCAyODguNSA1Ni4yIiBzdHlsZT0iZmlsbDojZmY2NDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQyIDcwLjcgMjQuMiA4MiAzMC43IDYxLjkgNDcuNiA1MS4zIDQyIDcwLjciIHN0eWxlPSJmaWxsOiNmZjkxMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDA0LjcgMjEzIDM4OC4zIDIwMi40IDM5MC4yIDE4OSA0MDYuNyAyMDAuOCA0MDQuNyAyMTMiIHN0eWxlPSJmaWxsOiM0NmZmYjEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzE2LjcgMjA4LjQgMjk5LjEgMjAzLjkgMzAwLjYgMjE3LjQgMzE4LjQgMjIwLjkgMzE2LjcgMjA4LjQiIHN0eWxlPSJmaWxsOiMzOWZmYmUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjEyLjIgMjIuNSAxNzYuNCAxMy4yIDE3OC42IDkgMjEyLjUgMTguNCAyMTIuMiAyMi41IiBzdHlsZT0iZmlsbDojZjIwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM5MS4xIDE2MS45IDM2NiAxNDcuOSAzNjUuMSAxMzMuOCAzOTAuMSAxNDguOCAzOTEuMSAxNjEuOSIgc3R5bGU9ImZpbGw6I2FkZmY0OSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzguMiAxOTMuNSAxNzUuNyAyMDEuMiAxNzQuMiAyMjQuNyAxNzcgMjE2LjEgMTc4LjIgMTkzLjUiIHN0eWxlPSJmaWxsOiM0M2ZmYjQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzUyLjggMjYzLjQgMzQ2LjYgMjYwLjEgMzUyLjEgMjY0LjggMzU4LjUgMjY4IDM1Mi44IDI2My40IiBzdHlsZT0iZmlsbDojMDBiMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyNi43IDgxLjMgMjkwLjggNjUuNSAyODguNSA1Ni4yIDMyMy41IDcyLjQgMzI2LjcgODEuMyIgc3R5bGU9ImZpbGw6I2ZmOTgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjQuOSAzMTcuNyAxNjcuNSAzMzEgMTU2LjUgMzQ1LjkgMTU0LjMgMzMyLjMgMTY0LjkgMzE3LjciIHN0eWxlPSJmaWxsOiMwMDE0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjMzLjkgMTQxLjkgMjEzLjcgMTM5LjYgMjEzLjYgMTYwLjQgMjMzLjUgMTYxLjMgMjMzLjkgMTQxLjkiIHN0eWxlPSJmaWxsOiNiNGZmNDMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzk1LjUgMjU5LjMgMzg4LjUgMjUzIDM5My43IDI0NC44IDQwMC43IDI1Mi4xIDM5NS41IDI1OS4zIiBzdHlsZT0iZmlsbDojMDBjOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjExNy40IDM4MS43IDExOS42IDM5NCAxMDQuOCAzOTMuMiAxMDIuNCAzODAuOSAxMTcuNCAzODEuNyIgc3R5bGU9ImZpbGw6IzAwMDA4ZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNDkuMyAzNC43IDIxMi4yIDIyLjUgMjEyLjUgMTguNCAyNDcuOCAzMC42IDI0OS4zIDM0LjciIHN0eWxlPSJmaWxsOiNmZjM4MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNi4yIDIzNyA4IDI1MS4yIDMuOCAyMjUuNSAxLjkgMjExLjIgNi4yIDIzNyIgc3R5bGU9ImZpbGw6IzEzZmNlNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNTYuMiAxNDYuMiAyMzMuOSAxNDEuOSAyMzMuNSAxNjEuMyAyNTUuNSAxNjQuMSAyNTYuMiAxNDYuMiIgc3R5bGU9ImZpbGw6I2FkZmY0OSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTMuNyAxMzkuNiAxOTYuOSAxMzkuMyAxOTcuMiAxNjEuNSAyMTMuNiAxNjAuNCAyMTMuNyAxMzkuNiIgc3R5bGU9ImZpbGw6I2I3ZmY0MCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzYuNCAxMy4yIDE0My41IDcuNCAxNDcuOCAzIDE3OC42IDkgMTc2LjQgMTMuMiIgc3R5bGU9ImZpbGw6I2Y2MGIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODUuMyAxNjQuNiAxNzguMiAxNjkuNiAxNzguMiAxOTMuNSAxODUuMyAxODcuNCAxODUuMyAxNjQuNiIgc3R5bGU9ImZpbGw6IzgwZmY3NyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0IDE2OS40IDAgMTg1IDAuNSAxNTkuMiA0LjUgMTQzLjggNCAxNjkuNCIgc3R5bGU9ImZpbGw6Izk3ZmY2MCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNDcuNyAyNTcuMSAzNDEuNSAyNTMuNiAzNDYuNiAyNjAuMSAzNTIuOCAyNjMuNCAzNDcuNyAyNTcuMSIgc3R5bGU9ImZpbGw6IzAwYzBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMyAyOTkuNCAyNi4yIDMxMi42IDE3LjggMjg5LjUgMTQuNSAyNzYuMSAyMyAyOTkuNCIgc3R5bGU9ImZpbGw6IzAwNjhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzAuOSAyMjUuNCAzMTguNCAyMjAuOSAzMjAuOSAyMzIuNCAzMzMuNiAyMzYuMSAzMzAuOSAyMjUuNCIgc3R5bGU9ImZpbGw6IzFmZmZkNyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0MDAuNyAyNTIuMSAzOTMuNiAyNDQuOCAzOTguMSAyMzUuMiA0MDUuMiAyNDMuNiA0MDAuNyAyNTIuMSIgc3R5bGU9ImZpbGw6IzAwZTBmYiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyOTguOCAxNzQuNSAyNzcuOSAxNjguNiAyNzcuNiAxODQuOSAyOTguNSAxODkuNCAyOTguOCAxNzQuNSIgc3R5bGU9ImZpbGw6IzgwZmY3NyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0MDYuNyAyMDAuOCAzOTAuMiAxODkgMzkxLjEgMTc1LjQgNDA3LjYgMTg4LjMgNDA2LjcgMjAwLjgiIHN0eWxlPSJmaWxsOiM2NmZmOTAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzYwLjggMTA4LjYgMzI5LjQgOTIuMyAzMjYuNyA4MS4zIDM1Ny41IDk4LjMgMzYwLjggMTA4LjYiIHN0eWxlPSJmaWxsOiNmYzAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjc4LjkgMTUyLjEgMjU2LjIgMTQ2LjIgMjU1LjUgMTY0LjEgMjc3LjkgMTY4LjYgMjc4LjkgMTUyLjEiIHN0eWxlPSJmaWxsOiNhYWZmNGQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTk2LjkgMTM5LjMgMTg0LjYgMTQxLjIgMTg1LjMgMTY0LjYgMTk3LjIgMTYxLjUgMTk2LjkgMTM5LjMiIHN0eWxlPSJmaWxsOiNiYWZmM2MiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzE2IDE5NS4xIDI5OC41IDE4OS40IDI5OS4xIDIwMy45IDMxNi43IDIwOC40IDMxNiAxOTUuMSIgc3R5bGU9ImZpbGw6IzVhZmY5ZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyODUuOCA0OS40IDI0OS4zIDM0LjcgMjQ3LjggMzAuNiAyODIuOSA0NS4zIDI4NS44IDQ5LjQiIHN0eWxlPSJmaWxsOiNmZjRlMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTkuNiAxMDQuMyA3LjQgMTE5LjIgMTIuNSA5Ni4zIDI0LjIgODIgMTkuNiAxMDQuMyIgc3R5bGU9ImZpbGw6I2ZmZDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzOTAuMSAxNDguOCAzNjUuMSAxMzMuOCAzNjMuNCAxMjAuNiAzODguMSAxMzYuNiAzOTAuMSAxNDguOCIgc3R5bGU9ImZpbGw6I2QxZmYyNiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMDguOSAxMy43IDgzLjMgMTUuOCA5MS4yIDYuOSAxMTQuOCA1LjIgMTA4LjkgMTMuNyIgc3R5bGU9ImZpbGw6I2YxMDgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNDMuMyAyNDkuNCAzMzcuMiAyNDUuNSAzNDEuNSAyNTMuNiAzNDcuNyAyNTcuMSAzNDMuMyAyNDkuNCIgc3R5bGU9ImZpbGw6IzAwZDhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTYuNSAzNDUuOSAxNTggMzU5LjkgMTQ1LjUgMzcxLjEgMTQzLjkgMzU3LjEgMTU2LjUgMzQ1LjkiIHN0eWxlPSJmaWxsOiMwMDAwZWQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzIzLjQgNzIuNCAyODguNSA1Ni4yIDI4NS44IDQ5LjQgMzE5LjcgNjUuOSAzMjMuNCA3Mi40IiBzdHlsZT0iZmlsbDojZmY3YTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0My41IDcuNCAxMTQuOCA1LjIgMTIxLjMgMC42IDE0Ny44IDMgMTQzLjUgNy40IiBzdHlsZT0iZmlsbDojZGYwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzNC42IDEyMi42IDIxMy43IDExOC44IDIxMy43IDEzOS42IDIzMy45IDE0MS45IDIzNC42IDEyMi42IiBzdHlsZT0iZmlsbDojZTRmZjEzIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxMi41IDE4LjQgMTc4LjYgOSAxODAuOSA4LjQgMjEyLjcgMTcuNiAyMTIuNSAxOC40IiBzdHlsZT0iZmlsbDojZmEwZjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijc2LjMgMjguMyA1NC44IDM0LjggNjMuMyAyMS43IDgzLjMgMTUuOCA3Ni4zIDI4LjMiIHN0eWxlPSJmaWxsOiNmZjI1MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDA1LjIgMjQzLjYgMzk4LjEgMjM1LjIgNDAxLjkgMjI0LjUgNDA5IDIzMy45IDQwNS4yIDI0My42IiBzdHlsZT0iZmlsbDojMTZmZmUxIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzMS45IDM3OC40IDEzMy45IDM5MC44IDExOS42IDM5NCAxMTcuNCAzODEuNyAxMzEuOSAzNzguNCIgc3R5bGU9ImZpbGw6IzAwMDA5ZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNDcuOCAzMC42IDIxMi41IDE4LjQgMjEyLjcgMTcuNiAyNDYuMiAyOS43IDI0Ny44IDMwLjYiIHN0eWxlPSJmaWxsOiNmZjI1MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjU3LjUgMTI4LjQgMjM0LjYgMTIyLjYgMjMzLjkgMTQxLjkgMjU2LjIgMTQ2LjIgMjU3LjUgMTI4LjQiIHN0eWxlPSJmaWxsOiNkYmZmMWMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjEzLjcgMTE4LjggMTk2LjIgMTE3LjIgMTk2LjkgMTM5LjMgMjEzLjcgMTM5LjYgMjEzLjcgMTE4LjgiIHN0eWxlPSJmaWxsOiNlYmZmMGMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc1LjUgMjM0LjQgMTc5LjcgMjQ0LjggMTc1LjQgMjY3LjcgMTcxLjggMjU2LjcgMTc1LjUgMjM0LjQiIHN0eWxlPSJmaWxsOiMwMmU4ZjQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzI5LjIgMjEzLjggMzE2LjcgMjA4LjQgMzE4LjQgMjIwLjkgMzMwLjkgMjI1LjQgMzI5LjIgMjEzLjgiIHN0eWxlPSJmaWxsOiMzY2ZmYmEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc1LjQgMjY3LjcgMTgwLjggMjc4LjkgMTczLjggMjk5LjggMTY5LjIgMjg4LjEgMTc1LjQgMjY3LjciIHN0eWxlPSJmaWxsOiMwMDk4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc1LjcgMjAxLjIgMTc3LjMgMjEwLjIgMTc1LjUgMjM0LjQgMTc0LjIgMjI0LjcgMTc1LjcgMjAxLjIiIHN0eWxlPSJmaWxsOiM0M2ZmYjQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc4LjYgOSAxNDcuOCAzIDE1Mi40IDIuNCAxODAuOSA4LjQgMTc4LjYgOSIgc3R5bGU9ImZpbGw6I2RmMDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI3NS4zIDM3OS45IDc3LjkgMzkwLjMgNjQuMiAzNzguMyA2MS4zIDM2Ny43IDc1LjMgMzc5LjkiIHN0eWxlPSJmaWxsOiMwMDAwYjIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDA3LjYgMTg4LjMgMzkxLjEgMTc1LjQgMzkxLjEgMTYxLjkgNDA3LjYgMTc2IDQwNy42IDE4OC4zIiBzdHlsZT0iZmlsbDojOGFmZjZkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjYxLjMgMzY3LjcgNjQuMSAzNzguMyA1MS40IDM2My4xIDQ4LjIgMzUyLjEgNjEuMyAzNjcuNyIgc3R5bGU9ImZpbGw6IzAwMDBkYSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyOTkuOSAxNTkuNCAyNzguOCAxNTIuMSAyNzcuOSAxNjguNiAyOTguOCAxNzQuNSAyOTkuOSAxNTkuNCIgc3R5bGU9ImZpbGw6I2E3ZmY1MCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzguMiAxNjkuNiAxNzUuNyAxNzYuNCAxNzUuNyAyMDEuMiAxNzguMiAxOTMuNSAxNzguMiAxNjkuNiIgc3R5bGU9ImZpbGw6IzgwZmY3NyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzkuNiAyNDAuNSAzMzMuNiAyMzYuMSAzMzcuMiAyNDUuNSAzNDMuMyAyNDkuNCAzMzkuNiAyNDAuNSIgc3R5bGU9ImZpbGw6IzBjZjRlYiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNjkgMjc2LjUgMzcwLjggMjcyLjIgMzc3LjMgMjcxLjYgMzc1LjQgMjc2LjMgMzY5IDI3Ni41IiBzdHlsZT0iZmlsbDojMDBhOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM1Ny41IDk4LjMgMzI2LjcgODEuMyAzMjMuNCA3Mi40IDM1My42IDg5LjggMzU3LjUgOTguMyIgc3R5bGU9ImZpbGw6I2ZmYWIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNC41IDI3Ni4xIDE3LjggMjg5LjUgMTEuNCAyNjUgOCAyNTEuMiAxNC41IDI3Ni4xIiBzdHlsZT0iZmlsbDojMDBiMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI4MC41IDEzNS44IDI1Ny41IDEyOC40IDI1Ni4yIDE0Ni4yIDI3OC44IDE1Mi4xIDI4MC41IDEzNS44IiBzdHlsZT0iZmlsbDojZDRmZjIzIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM2Mi44IDI3NSAzNjQuNSAyNzEgMzcwLjggMjcyLjIgMzY5IDI3Ni41IDM2Mi44IDI3NSIgc3R5bGU9ImZpbGw6IzAwYWNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0Ny42IDUxLjMgMzAuNyA2MS45IDM5LjEgNDQuOCA1NC44IDM0LjggNDcuNiA1MS4zIiBzdHlsZT0iZmlsbDojZjUwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEuOSAyMTEuMiAzLjggMjI1LjUgMS45IDE5OS40IDAgMTg1IDEuOSAyMTEuMiIgc3R5bGU9ImZpbGw6IzUzZmZhNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4OS45IDM4OC41IDkyLjIgMzk4LjcgNzcuOSAzOTAuMyA3NS4zIDM3OS45IDg5LjkgMzg4LjUiIHN0eWxlPSJmaWxsOiMwMDAwOWIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjgyLjkgNDUuMyAyNDcuOCAzMC42IDI0Ni4yIDI5LjcgMjc5LjcgNDQuMiAyODIuOSA0NS4zIiBzdHlsZT0iZmlsbDojZmYzZjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM3NS40IDI3Ni4zIDM3Ny4zIDI3MS42IDM4My42IDI2OS4yIDM4MS42IDI3NC40IDM3NS40IDI3Ni4zIiBzdHlsZT0iZmlsbDojMDBhY2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4NC42IDE0MS4yIDE3NyAxNDUuMiAxNzguMiAxNjkuNiAxODUuMyAxNjQuNiAxODQuNiAxNDEuMiIgc3R5bGU9ImZpbGw6I2JlZmYzOSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzMuOCAyOTkuOCAxNzYuOCAzMTIuOCAxNjcuNSAzMzEgMTY0LjkgMzE3LjcgMTczLjggMjk5LjgiIHN0eWxlPSJmaWxsOiMwMDUwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzE2LjMgMTgxLjUgMjk4LjggMTc0LjUgMjk4LjUgMTg5LjQgMzE2IDE5NS4xIDMxNi4zIDE4MS41IiBzdHlsZT0iZmlsbDojODBmZjc3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQwOSAyMzMuOSA0MDEuOSAyMjQuNSA0MDQuNyAyMTMgNDExLjkgMjIzLjUgNDA5IDIzMy45IiBzdHlsZT0iZmlsbDojMzBmZmM3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM4OC4xIDEzNi42IDM2My40IDEyMC42IDM2MC44IDEwOC42IDM4NS4zIDEyNS41IDM4OC4xIDEzNi42IiBzdHlsZT0iZmlsbDojZjFmYzA2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM1Ni44IDI3MS45IDM1OC41IDI2OCAzNjQuNSAyNzEgMzYyLjggMjc1IDM1Ni44IDI3MS45IiBzdHlsZT0iZmlsbDojMDBiNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQ4LjIgMzUyLjEgNTEuMyAzNjMuMSAzOS44IDM0NC45IDM2LjQgMzMzLjYgNDguMiAzNTIuMSIgc3R5bGU9ImZpbGw6Ymx1ZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMTkuNyA2NS45IDI4NS44IDQ5LjQgMjgyLjkgNDUuMyAzMTUuNiA2MS44IDMxOS43IDY1LjkiIHN0eWxlPSJmaWxsOiNmZjY0MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzgxLjcgMjc0LjQgMzgzLjYgMjY5LjIgMzg5LjcgMjY1LjEgMzg3LjcgMjcwLjkgMzgxLjcgMjc0LjQiIHN0eWxlPSJmaWxsOiMwMGI4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjM1LjUgMTA0IDIxMy43IDk4LjggMjEzLjcgMTE4LjggMjM0LjYgMTIyLjYgMjM1LjUgMTA0IiBzdHlsZT0iZmlsbDpnb2xkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE5Ni4yIDExNy4yIDE4My4xIDExNy45IDE4NC41IDE0MS4yIDE5Ni45IDEzOS4zIDE5Ni4yIDExNy4yIiBzdHlsZT0iZmlsbDojZjFmYzA2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxMi43IDE3LjYgMTgwLjkgOC40IDE4My4zIDExLjQgMjEyLjkgMjAuMyAyMTIuNyAxNy42IiBzdHlsZT0iZmlsbDojZWQwNDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI0Ni4yIDI5LjcgMjEyLjcgMTcuNiAyMTIuOSAyMC4zIDI0NC41IDMyIDI0Ni4yIDI5LjciIHN0eWxlPSJmaWxsOiNmZjFlMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjU5LjIgMTExLjMgMjM1LjUgMTA0IDIzNC42IDEyMi42IDI1Ny41IDEyOC40IDI1OS4yIDExMS4zIiBzdHlsZT0iZmlsbDojZmZlMjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM1MS4yIDI2Ny4zIDM1Mi44IDI2My40IDM1OC41IDI2OCAzNTYuOCAyNzIgMzUxLjIgMjY3LjMiIHN0eWxlPSJmaWxsOiMwMGMwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNC41IDE0My43IDAuNSAxNTkuMiAzLjUgMTM0LjUgNy40IDExOS4yIDQuNSAxNDMuNyIgc3R5bGU9ImZpbGw6I2Q3ZmYxZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMDQuOCAzOTMuMiAxMDYuOCA0MDMuNCA5Mi4yIDM5OC43IDg5LjkgMzg4LjUgMTA0LjggMzkzLjIiIHN0eWxlPSJmaWxsOiMwMDAwOTIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjEzLjcgOTguOCAxOTUuMiA5NS44IDE5Ni4yIDExNy4yIDIxMy43IDExOC44IDIxMy43IDk4LjgiIHN0eWxlPSJmaWxsOiNmYzAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzg3LjcgMjcwLjkgMzg5LjcgMjY1LjEgMzk1LjQgMjU5LjMgMzkzLjMgMjY1LjkgMzg3LjcgMjcwLjkiIHN0eWxlPSJmaWxsOiMwMGM0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzI4LjQgMjAxLjYgMzE2IDE5NS4xIDMxNi43IDIwOC40IDMyOS4yIDIxMy44IDMyOC40IDIwMS42IiBzdHlsZT0iZmlsbDojNWRmZjlhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzNi45IDIzMC42IDMzMC45IDIyNS40IDMzMy42IDIzNi4xIDMzOS43IDI0MC41IDMzNi45IDIzMC42IiBzdHlsZT0iZmlsbDojMjZmZmQxIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQwNy42IDE3NiAzOTEuMSAxNjEuOSAzOTAuMSAxNDguOCA0MDYuNSAxNjMuOSA0MDcuNiAxNzYiIHN0eWxlPSJmaWxsOiNhYWZmNGQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQ3LjggMyAxMjEuMyAwLjYgMTI4LjIgMCAxNTIuNCAyLjQgMTQ3LjggMyIgc3R5bGU9ImZpbGw6I2M4MDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDUuNSAzNzEuMSAxNDcuNCAzODMuNiAxMzMuOSAzOTAuOCAxMzEuOCAzNzguNCAxNDUuNSAzNzEuMSIgc3R5bGU9ImZpbGw6IzAwMDBjNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNDYuMSAyNjEuMyAzNDcuNyAyNTcuMSAzNTIuOCAyNjMuNCAzNTEuMiAyNjcuMyAzNDYuMSAyNjEuMyIgc3R5bGU9ImZpbGw6IzAwZDBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTQuOCA1LjIgOTEuMiA2LjkgOTkuOCAyIDEyMS4zIDAuNiAxMTQuOCA1LjIiIHN0eWxlPSJmaWxsOiNjZDAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzAyIDE0NC42IDI4MC41IDEzNS44IDI3OC44IDE1Mi4xIDI5OS45IDE1OS40IDMwMiAxNDQuNiIgc3R5bGU9ImZpbGw6I2NlZmYyOSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNzkuNyA0NC4yIDI0Ni4yIDI5LjcgMjQ0LjYgMzIgMjc2LjQgNDYgMjc5LjcgNDQuMiIgc3R5bGU9ImZpbGw6I2ZmMzgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyODIuOSAxMjAuMiAyNTkuMiAxMTEuMyAyNTcuNSAxMjguNCAyODAuNSAxMzUuOCAyODIuOSAxMjAuMiIgc3R5bGU9ImZpbGw6I2ZiZjEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0MTEuOSAyMjMuNSA0MDQuOCAyMTMgNDA2LjcgMjAwLjggNDEzLjggMjEyLjQgNDExLjkgMjIzLjUiIHN0eWxlPSJmaWxsOiM0ZGZmYWEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzYuNCAzMzMuNiAzOS44IDM0NC45IDI5LjggMzI0LjMgMjYuMiAzMTIuNiAzNi40IDMzMy42IiBzdHlsZT0iZmlsbDojMDAzMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4MC45IDguNCAxNTIuNCAyLjQgMTU3LjEgNS43IDE4My4zIDExLjQgMTgwLjkgOC40IiBzdHlsZT0iZmlsbDojZDEwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM1My42IDg5LjggMzIzLjUgNzIuNCAzMTkuNyA2NS45IDM0OSA4My41IDM1My42IDg5LjgiIHN0eWxlPSJmaWxsOiNmZjkxMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTY3LjUgMzMxIDE2OS4xIDM0NS4xIDE1OC4xIDM1OS45IDE1Ni41IDM0NS45IDE2Ny41IDMzMSIgc3R5bGU9ImZpbGw6IzAwMTRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMzYuNyA4Ni42IDIxMy43IDc5LjkgMjEzLjcgOTguOCAyMzUuNSAxMDQgMjM2LjcgODYuNiIgc3R5bGU9ImZpbGw6I2ZmYTcwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzOTMuNCAyNjUuOSAzOTUuNSAyNTkuMyA0MDAuNyAyNTIuMSAzOTguNSAyNTkuNiAzOTMuNCAyNjUuOSIgc3R5bGU9ImZpbGw6IzAwZDhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMTcuNiAxNjcuNyAyOTkuOSAxNTkuNCAyOTguOCAxNzQuNSAzMTYuMyAxODEuNSAzMTcuNiAxNjcuNyIgc3R5bGU9ImZpbGw6I2E0ZmY1MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMTUuNiA2MS44IDI4Mi45IDQ1LjMgMjc5LjcgNDQuMiAzMTEuMiA2MC41IDMxNS42IDYxLjgiIHN0eWxlPSJmaWxsOiNmNTAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzg1LjMgMTI1LjUgMzYwLjggMTA4LjYgMzU3LjUgOTguMyAzODEuNiAxMTUuOCAzODUuMyAxMjUuNSIgc3R5bGU9ImZpbGw6I2ZmZGIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNDQuNiAzMiAyMTIuOSAyMC4zIDIxMy4xIDI2LjQgMjQyLjkgMzcuNCAyNDQuNiAzMiIgc3R5bGU9ImZpbGw6I2ZmMWUwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNC4yIDgyIDEyLjUgOTYuMyAxOS44IDc1LjggMzAuNyA2MS45IDI0LjIgODIiIHN0eWxlPSJmaWxsOiNmZjhkMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjYxLjQgOTUuMyAyMzYuNyA4Ni42IDIzNS41IDEwNCAyNTkuMiAxMTEuMyAyNjEuNCA5NS4zIiBzdHlsZT0iZmlsbDojZmZiNjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxMi45IDIwLjMgMTgzLjMgMTEuNCAxODUuNyAxOC4xIDIxMy4xIDI2LjQgMjEyLjkgMjAuMyIgc3R5bGU9ImZpbGw6I2YxMDgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4My4zIDE1LjggNjMuMyAyMS43IDczLjEgMTIuMyA5MS4yIDYuOSA4My4zIDE1LjgiIHN0eWxlPSJmaWxsOiNlNDAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzQxLjggMjUzLjkgMzQzLjMgMjQ5LjQgMzQ3LjcgMjU3LjEgMzQ2LjEgMjYxLjMgMzQxLjggMjUzLjkiIHN0eWxlPSJmaWxsOiMwMmU4ZjQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTk1LjIgOTUuOCAxODAuOSA5NS4yIDE4My4xIDExNy44IDE5Ni4yIDExNy4yIDE5NS4yIDk1LjgiIHN0eWxlPSJmaWxsOiNmZmMxMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjEzLjcgNzkuOSAxOTMuOCA3NS42IDE5NS4yIDk1LjggMjEzLjcgOTguOCAyMTMuNyA3OS45IiBzdHlsZT0iZmlsbDojZmY5ODAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjExOS42IDM5NCAxMjEuMyA0MDQuMiAxMDYuOCA0MDMuNCAxMDQuOCAzOTMuMiAxMTkuNiAzOTQiIHN0eWxlPSJmaWxsOiMwMDAwOTYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTgzLjEgMTE3LjggMTc0LjcgMTIwLjcgMTc3IDE0NS4yIDE4NC42IDE0MS4yIDE4My4xIDExNy44IiBzdHlsZT0iZmlsbDojZjhmNTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzNS4xIDIxOS45IDMyOS4yIDIxMy44IDMzMC45IDIyNS40IDMzNi45IDIzMC42IDMzNS4xIDIxOS45IiBzdHlsZT0iZmlsbDojNDNmZmI0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjggMjUxLjIgMTEuNCAyNjUgNy4yIDIzOS42IDMuOCAyMjUuNSA4IDI1MS4yIiBzdHlsZT0iZmlsbDojMTNmY2U0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI3Ni40IDQ2IDI0NC41IDMyIDI0Mi44IDM3LjQgMjczLjEgNTAuOCAyNzYuNCA0NiIgc3R5bGU9ImZpbGw6I2ZmMzgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzcgMTQ1LjIgMTc0LjIgMTUxLjEgMTc1LjcgMTc2LjQgMTc4LjIgMTY5LjYgMTc3IDE0NS4yIiBzdHlsZT0iZmlsbDojYzFmZjM2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyOC43IDE4OS4yIDMxNi4zIDE4MS41IDMxNiAxOTUuMSAzMjguNCAyMDEuNiAzMjguNyAxODkuMiIgc3R5bGU9ImZpbGw6IzgwZmY3NyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMzggNzAuOCAyMTMuNiA2Mi44IDIxMy43IDc5LjkgMjM2LjcgODYuNiAyMzggNzAuOCIgc3R5bGU9ImZpbGw6I2ZmN2UwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzOTguNSAyNTkuNiA0MDAuNyAyNTIuMSA0MDUuMiAyNDMuNiA0MDMgMjUxLjkgMzk4LjUgMjU5LjYiIHN0eWxlPSJmaWxsOiMwOWYwZWUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc1LjcgMTc2LjUgMTc3LjMgMTg0LjcgMTc3LjMgMjEwLjIgMTc1LjcgMjAxLjIgMTc1LjcgMTc2LjUiIHN0eWxlPSJmaWxsOiM4M2ZmNzMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjg1LjkgMTA1LjcgMjYxLjQgOTUuMyAyNTkuMiAxMTEuMyAyODIuOSAxMjAuMiAyODUuOSAxMDUuNyIgc3R5bGU9ImZpbGw6I2ZmYzQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNDIuOSAzNy40IDIxMy4xIDI2LjQgMjEzLjMgMzUuNyAyNDEuMiA0NS45IDI0Mi45IDM3LjQiIHN0eWxlPSJmaWxsOiNmZjI5MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc3LjMgMjEwLjIgMTgxLjkgMjIwLjEgMTc5LjcgMjQ0LjkgMTc1LjUgMjM0LjQgMTc3LjMgMjEwLjIiIHN0eWxlPSJmaWxsOiM0MGZmYjciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjYzLjkgODAuOSAyMzguMSA3MC44IDIzNi43IDg2LjYgMjYxLjQgOTUuMyAyNjMuOSA4MC45IiBzdHlsZT0iZmlsbDojZmY5MTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQwNi41IDE2My45IDM5MC4xIDE0OC44IDM4OC4xIDEzNi42IDQwNC40IDE1Mi42IDQwNi41IDE2My45IiBzdHlsZT0iZmlsbDojY2FmZjJjIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQxMy44IDIxMi40IDQwNi43IDIwMC44IDQwNy42IDE4OC40IDQxNC44IDIwMSA0MTMuOCAyMTIuNCIgc3R5bGU9ImZpbGw6IzZhZmY4ZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMDQuOCAxMzAuNSAyODIuOSAxMjAuMiAyODAuNSAxMzUuOCAzMDIgMTQ0LjYgMzA0LjggMTMwLjUiIHN0eWxlPSJmaWxsOiNmMWZjMDYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc5LjcgMjQ0LjkgMTg1LjUgMjU1LjYgMTgwLjggMjc4LjkgMTc1LjQgMjY3LjcgMTc5LjcgMjQ0LjkiIHN0eWxlPSJmaWxsOiMwMGU0ZjgiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzQ5IDgzLjUgMzE5LjcgNjUuOSAzMTUuNiA2MS44IDM0NC4xIDc5LjUgMzQ5IDgzLjUiIHN0eWxlPSJmaWxsOiNmZjdhMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzExLjIgNjAuNSAyNzkuNyA0NC4yIDI3Ni40IDQ2IDMwNi42IDYxLjkgMzExLjIgNjAuNSIgc3R5bGU9ImZpbGw6I2ZmNGUwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTMuMSAyNi40IDE4NS43IDE4LjEgMTg4IDI4LjEgMjEzLjMgMzUuNyAyMTMuMSAyNi40IiBzdHlsZT0iZmlsbDojZmYxMzAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4My4zIDExLjQgMTU3LjEgNS43IDE2MS44IDEyLjggMTg1LjcgMTguMSAxODMuMyAxMS40IiBzdHlsZT0iZmlsbDojZDYwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzOS41IDU3LjEgMjEzLjUgNDcuOSAyMTMuNiA2Mi44IDIzOCA3MC44IDIzOS41IDU3LjEiIHN0eWxlPSJmaWxsOiNmZjU5MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMCAxODUgMS45IDE5OS40IDIuNCAxNzMuOCAwLjUgMTU5LjIgMCAxODUiIHN0eWxlPSJmaWxsOiM5N2ZmNjAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjQxLjIgNDUuOSAyMTMuMyAzNS43IDIxMy41IDQ3LjkgMjM5LjYgNTcuMSAyNDEuMiA0NS45IiBzdHlsZT0iZmlsbDojZmYzYjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI2LjIgMzEyLjYgMjkuOCAzMjQuMyAyMS41IDMwMS44IDE3LjggMjg5LjUgMjYuMiAzMTIuNiIgc3R5bGU9ImZpbGw6IzAwNzBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzguMiAyNDUuNSAzMzkuNiAyNDAuNSAzNDMuMyAyNDkuNCAzNDEuOCAyNTQgMzM4LjIgMjQ1LjUiIHN0eWxlPSJmaWxsOiMxNmZmZTEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjczLjEgNTAuOCAyNDIuOCAzNy40IDI0MS4yIDQ1LjkgMjY5LjkgNTguMyAyNzMuMSA1MC44IiBzdHlsZT0iZmlsbDojZmY0MzAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxMy42IDYyLjggMTkyLjEgNTcuMyAxOTMuOCA3NS42IDIxMy43IDc5LjkgMjEzLjYgNjIuOCIgc3R5bGU9ImZpbGw6I2ZmNmMwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNjYuOCA2OC40IDIzOS42IDU3LjEgMjM4LjEgNzAuOCAyNjMuOSA4MC45IDI2Ni44IDY4LjQiIHN0eWxlPSJmaWxsOiNmZjZmMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzE5LjggMTU0LjMgMzAyIDE0NC42IDI5OS45IDE1OS40IDMxNy42IDE2Ny43IDMxOS44IDE1NC4zIiBzdHlsZT0iZmlsbDojYzdmZjMwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjU0LjggMzQuOCAzOS4xIDQ0LjggNDkuMSAzMS4xIDYzLjMgMjEuNyA1NC44IDM0LjgiIHN0eWxlPSJmaWxsOiNmZjFlMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTUyLjQgMi40IDEyOC4yIDAgMTM1LjMgMy40IDE1Ny4xIDUuNyAxNTIuNCAyLjQiIHN0eWxlPSJmaWxsOiNiMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzgxLjYgMTE1LjggMzU3LjUgOTguMyAzNTMuNiA4OS44IDM3Ny4xIDEwNy44IDM4MS42IDExNS44IiBzdHlsZT0iZmlsbDojZmZiZDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI2OS45IDU4LjMgMjQxLjIgNDUuOSAyMzkuNiA1Ny4xIDI2Ni44IDY4LjQgMjY5LjkgNTguMyIgc3R5bGU9ImZpbGw6I2Y1MCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODAuOCAyNzguOSAxODQgMjkxLjcgMTc2LjggMzEyLjggMTczLjggMjk5LjggMTgwLjggMjc4LjkiIHN0eWxlPSJmaWxsOiMwMDk4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjEzLjMgMzUuNyAxODggMjguMSAxOTAuMSA0MS4zIDIxMy41IDQ3LjkgMjEzLjMgMzUuNyIgc3R5bGU9ImZpbGw6I2ZmMjkwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTMuNSA0Ny45IDE5MC4xIDQxLjMgMTkyLjEgNTcuMyAyMTMuNiA2Mi44IDIxMy41IDQ3LjkiIHN0eWxlPSJmaWxsOiNmZjQ3MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjg5LjQgOTIuNyAyNjMuOSA4MC45IDI2MS40IDk1LjMgMjg1LjkgMTA1LjcgMjg5LjQgOTIuNyIgc3R5bGU9ImZpbGw6I2ZmYTMwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTMuOCA3NS42IDE3OCA3My44IDE4MC45IDk1LjIgMTk1LjIgOTUuOCAxOTMuOCA3NS42IiBzdHlsZT0iZmlsbDojZmY4OTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQwMyAyNTEuOSA0MDUuMiAyNDMuNiA0MDkgMjMzLjkgNDA2LjcgMjQzLjIgNDAzIDI1MS45IiBzdHlsZT0iZmlsbDojMWNmZmRiIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMwNi42IDYxLjkgMjc2LjQgNDYgMjczLjEgNTAuOCAzMDIuMSA2NS45IDMwNi42IDYxLjkiIHN0eWxlPSJmaWxsOiNmZjUyMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzM0LjQgMjA4LjYgMzI4LjQgMjAxLjYgMzI5LjIgMjEzLjggMzM1LjEgMjE5LjggMzM0LjQgMjA4LjYiIHN0eWxlPSJmaWxsOiM2MGZmOTciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzUyLjkgMjc5LjcgMzYyLjggMjc1IDM2OSAyNzYuNSAzNTguOSAyODEuNCAzNTIuOSAyNzkuNyIgc3R5bGU9ImZpbGw6IzAwYmNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMjEuMyAwLjYgOTkuOCAyIDEwOSAxLjIgMTI4LjIgMCAxMjEuMyAwLjYiIHN0eWxlPSJmaWxsOiNiMjAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzU4LjkgMjgxLjQgMzY5IDI3Ni41IDM3NS40IDI3Ni4zIDM2NS4xIDI4MS41IDM1OC45IDI4MS40IiBzdHlsZT0iZmlsbDojMDBiOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1OC4xIDM1OS45IDE1OS44IDM3Mi42IDE0Ny40IDM4My42IDE0NS41IDM3MS4xIDE1OC4xIDM1OS45IiBzdHlsZT0iZmlsbDojMDAwMGYxIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM0NyAyNzYuNSAzNTYuOCAyNzEuOSAzNjIuOCAyNzUgMzUyLjkgMjc5LjcgMzQ3IDI3Ni41IiBzdHlsZT0iZmlsbDojMDBjNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMwOC4zIDExNy40IDI4NS45IDEwNS43IDI4Mi45IDEyMC4yIDMwNC44IDEzMC41IDMwOC4zIDExNy40IiBzdHlsZT0iZmlsbDpnb2xkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzMC4xIDE3Ni43IDMxNy42IDE2Ny43IDMxNi4zIDE4MS41IDMyOC43IDE4OS4xIDMzMC4xIDE3Ni43IiBzdHlsZT0iZmlsbDojYTBmZjU2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM0NC4xIDc5LjUgMzE1LjYgNjEuOCAzMTEuMiA2MC41IDMzOC44IDc3LjkgMzQ0LjEgNzkuNSIgc3R5bGU9ImZpbGw6I2ZmNmYwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODUuNyAxOC4xIDE2MS44IDEyLjggMTY2LjMgMjMuNSAxODggMjguMSAxODUuNyAxOC4xIiBzdHlsZT0iZmlsbDojZTQwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI5My4zIDgxLjUgMjY2LjggNjguNSAyNjMuOSA4MC45IDI4OS40IDkyLjcgMjkzLjMgODEuNSIgc3R5bGU9ImZpbGw6I2ZmODIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI3LjQgMTE5LjIgMy41IDEzNC41IDguOCAxMTEuNCAxMi41IDk2LjMgNy40IDExOS4yIiBzdHlsZT0iZmlsbDojZmZkMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzMy45IDM5MC44IDEzNS40IDQwMS4xIDEyMS4zIDQwNC4yIDExOS42IDM5NCAxMzMuOSAzOTAuOCIgc3R5bGU9ImZpbGw6IzAwMDBhOCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODAuOSA5NS4yIDE3MS40IDk3IDE3NC43IDEyMC43IDE4My4xIDExNy44IDE4MC45IDk1LjIiIHN0eWxlPSJmaWxsOiNmZmI5MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzM1LjQgMjM2LjIgMzM2LjkgMjMwLjYgMzM5LjYgMjQwLjUgMzM4LjIgMjQ1LjUgMzM1LjQgMjM2LjIiIHN0eWxlPSJmaWxsOiMzMGZmYzciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzY1LjEgMjgxLjUgMzc1LjQgMjc2LjMgMzgxLjYgMjc0LjQgMzcxLjEgMjgwLjEgMzY1LjEgMjgxLjUiIHN0eWxlPSJmaWxsOiMwMGJjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDE0LjggMjAxIDQwNy42IDE4OC40IDQwNy42IDE3NiA0MTQuNyAxODkuNiA0MTQuOCAyMDEiIHN0eWxlPSJmaWxsOiM4N2ZmNzAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzAyLjEgNjUuOSAyNzMuMSA1MC44IDI2OS45IDU4LjMgMjk3LjYgNzIuNSAzMDIuMSA2NS45IiBzdHlsZT0iZmlsbDojZmY1OTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQwNC40IDE1Mi42IDM4OC4xIDEzNi42IDM4NS4zIDEyNS41IDQwMS4zIDE0Mi4yIDQwNC40IDE1Mi42IiBzdHlsZT0iZmlsbDojZTdmZjBmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM0MS42IDI3MS45IDM1MS4yIDI2Ny4zIDM1Ni44IDI3MiAzNDcgMjc2LjUgMzQxLjYgMjcxLjkiIHN0eWxlPSJmaWxsOiMwMGQwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjk3LjYgNzIuNSAyNjkuOSA1OC4zIDI2Ni44IDY4LjUgMjkzLjMgODEuNSAyOTcuNiA3Mi41IiBzdHlsZT0iZmlsbDojZmY2YzAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE5Mi4xIDU3LjMgMTc0LjYgNTQuNCAxNzggNzMuOCAxOTMuOCA3NS42IDE5Mi4xIDU3LjMiIHN0eWxlPSJmaWxsOiNmZjVkMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNzcuOSAzOTAuMyA3OS43IDM5OC4yIDY2LjMgMzg2LjYgNjQuMiAzNzguMyA3Ny45IDM5MC4zIiBzdHlsZT0iZmlsbDojMDAwMGM0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyMi45IDE0MS42IDMwNC44IDEzMC41IDMwMiAxNDQuNiAzMTkuOCAxNTQuMyAzMjIuOSAxNDEuNiIgc3R5bGU9ImZpbGw6I2U3ZmYwZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNzEuMSAyODAuMSAzODEuNiAyNzQuNCAzODcuNyAyNzAuOSAzNzcgMjc3LjIgMzcxLjEgMjgwLjEiIHN0eWxlPSJmaWxsOiMwMGM0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzc3LjEgMTA3LjggMzUzLjYgODkuOCAzNDkgODMuNSAzNzIuMSAxMDEuNyAzNzcuMSAxMDcuOCIgc3R5bGU9ImZpbGw6I2ZmYTcwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODggMjguMSAxNjYuMyAyMy41IDE3MC42IDM3LjUgMTkwLjEgNDEuMyAxODggMjguMSIgc3R5bGU9ImZpbGw6I2ZmMTMwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI2NC4yIDM3OC4zIDY2LjMgMzg2LjYgNTMuOSAzNzEuOCA1MS40IDM2My4xIDY0LjIgMzc4LjMiIHN0eWxlPSJmaWxsOiMwMDAwZTgiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDA2LjcgMjQzLjIgNDA5IDIzMy45IDQxMS45IDIyMy41IDQwOS41IDIzMy43IDQwNi43IDI0My4yIiBzdHlsZT0iZmlsbDojMzZmZmMxIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzNi43IDI2NiAzNDYuMSAyNjEuMyAzNTEuMiAyNjcuMyAzNDEuNiAyNzEuOSAzMzYuNyAyNjYiIHN0eWxlPSJmaWxsOiMwMGUwZmIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTkwLjEgNDEuMyAxNzAuNiAzNy41IDE3NC42IDU0LjQgMTkyLjEgNTcuMyAxOTAuMSA0MS4zIiBzdHlsZT0iZmlsbDojZmYzNDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE3NC43IDEyMC43IDE3MS4xIDEyNS43IDE3NC4yIDE1MS4xIDE3NyAxNDUuMiAxNzQuNyAxMjAuNyIgc3R5bGU9ImZpbGw6I2ZiZjEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzYuOCAzMTIuOCAxNzguNCAzMjcgMTY5LjEgMzQ1LjEgMTY3LjUgMzMxIDE3Ni44IDMxMi44IiBzdHlsZT0iZmlsbDojMDA1NGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjkxLjIgNi45IDczLjEgMTIuMyA4My44IDcgOTkuOCAyIDkxLjIgNi45IiBzdHlsZT0iZmlsbDojYjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1Ny4xIDUuNyAxMzUuMyAzLjQgMTQyLjQgMTAuOCAxNjEuOCAxMi44IDE1Ny4xIDUuNyIgc3R5bGU9ImZpbGw6I2JmMDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMTIuNSAxMDUuOCAyODkuNCA5Mi43IDI4NS45IDEwNS43IDMwOC4zIDExNy40IDMxMi41IDEwNS44IiBzdHlsZT0iZmlsbDojZmZiNjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzOC43IDc3LjkgMzExLjIgNjAuNSAzMDYuNiA2MS45IDMzMy4zIDc4LjggMzM4LjcgNzcuOSIgc3R5bGU9ImZpbGw6I2ZmNjgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI5Mi4yIDM5OC43IDkzLjYgNDA2LjQgNzkuNyAzOTguMiA3Ny45IDM5MC4zIDkyLjIgMzk4LjciIHN0eWxlPSJmaWxsOiMwMDAwYWQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTcuOCAyODkuNSAyMS41IDMwMS44IDE1LjMgMjc3LjcgMTEuNCAyNjUgMTcuOCAyODkuNSIgc3R5bGU9ImZpbGw6IzAwYjRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzLjggMjI1LjUgNy4yIDIzOS42IDUuMyAyMTMuOSAxLjkgMTk5LjQgMy44IDIyNS41IiBzdHlsZT0iZmlsbDojNTNmZmE0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzNC42IDE5Ny4yIDMyOC43IDE4OS4yIDMyOC40IDIwMS42IDMzNC40IDIwOC42IDMzNC42IDE5Ny4yIiBzdHlsZT0iZmlsbDojN2RmZjdhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMwLjcgNjEuOSAxOS44IDc1LjggMjkuMiA1OC4xIDM5LjEgNDQuOCAzMC43IDYxLjkiIHN0eWxlPSJmaWxsOiNmZjRlMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzc3IDI3Ny4yIDM4Ny43IDI3MC45IDM5My4zIDI2NiAzODIuNSAyNzIuOCAzNzcgMjc3LjIiIHN0eWxlPSJmaWxsOiMwMGQ0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNTEuNCAzNjMuMSA1My45IDM3MS44IDQyLjcgMzU0LjEgMzkuOCAzNDUgNTEuNCAzNjMuMSIgc3R5bGU9ImZpbGw6IzAwMDRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzMuNyAyMjYuMiAzMzUuMSAyMTkuOSAzMzYuOSAyMzAuNiAzMzUuNCAyMzYuMiAzMzMuNyAyMjYuMiIgc3R5bGU9ImZpbGw6IzQ5ZmZhZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzQuMiAxNTEuMSAxNzUuNSAxNTguNiAxNzcuNCAxODQuNyAxNzUuNyAxNzYuNSAxNzQuMiAxNTEuMSIgc3R5bGU9ImZpbGw6I2MxZmYzNiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzIuNCAyNTkgMzQxLjggMjU0IDM0Ni4xIDI2MS4zIDMzNi43IDI2NiAzMzIuNCAyNTkiIHN0eWxlPSJmaWxsOiMwY2Y0ZWIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzMyLjQgMTY0LjYgMzE5LjggMTU0LjMgMzE3LjYgMTY3LjcgMzMwIDE3Ni43IDMzMi40IDE2NC42IiBzdHlsZT0iZmlsbDojYzFmZjM2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMxNy4yIDk1LjggMjkzLjMgODEuNSAyODkuNCA5Mi43IDMxMi41IDEwNS44IDMxNy4yIDk1LjgiIHN0eWxlPSJmaWxsOiNmZjk4MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc4IDczLjggMTY3IDc0LjcgMTcxLjQgOTcgMTgwLjkgOTUuMiAxNzggNzMuOCIgc3R5bGU9ImZpbGw6I2ZmN2UwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzMuMyA3OC44IDMwNi42IDYxLjkgMzAyLjEgNjUuOSAzMjcuOCA4Mi4yIDMzMy4zIDc4LjgiIHN0eWxlPSJmaWxsOiNmZjZjMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDE0LjcgMTg5LjYgNDA3LjYgMTc2IDQwNi41IDE2My45IDQxMy41IDE3OC41IDQxNC43IDE4OS42IiBzdHlsZT0iZmlsbDojYTdmZjUwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQwMS4zIDE0Mi4yIDM4NS4zIDEyNS41IDM4MS42IDExNS44IDM5Ny40IDEzMy4xIDQwMS4zIDE0Mi4yIiBzdHlsZT0iZmlsbDojZmZlYTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyNi44IDEyOS45IDMwOC4zIDExNy40IDMwNC44IDEzMC41IDMyMi45IDE0MS42IDMyNi44IDEyOS45IiBzdHlsZT0iZmlsbDojZmZlNjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM3Mi4xIDEwMS43IDM0OSA4My41IDM0NC4xIDc5LjUgMzY2LjUgOTcuNyAzNzIuMSAxMDEuNyIgc3R5bGU9ImZpbGw6I2ZmOTQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzcuNCAxODQuNyAxODEuOSAxOTQuMSAxODEuOSAyMjAuMSAxNzcuMyAyMTAuMiAxNzcuNCAxODQuNyIgc3R5bGU9ImZpbGw6IzgzZmY3MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMjIuNCA4Ny45IDI5Ny42IDcyLjUgMjkzLjMgODEuNSAzMTcuMiA5NS44IDMyMi40IDg3LjkiIHN0eWxlPSJmaWxsOiNmZjgyMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzI3LjggODIuMiAzMDIuMSA2NS45IDI5Ny42IDcyLjUgMzIyLjQgODcuOSAzMjcuOCA4Mi4yIiBzdHlsZT0iZmlsbDojZmY3MzAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwNi44IDQwMy40IDEwNy44IDQxMSA5My42IDQwNi40IDkyLjIgMzk4LjcgMTA2LjggNDAzLjQiIHN0eWxlPSJmaWxsOiMwMDAwYTQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTI4LjIgMCAxMDkgMS4yIDExOC41IDQuNiAxMzUuMyAzLjQgMTI4LjIgMCIgc3R5bGU9ImZpbGw6I2E0MDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0MDkuNSAyMzMuNyA0MTEuOSAyMjMuNSA0MTMuOCAyMTIuNCA0MTEuNCAyMjMuNiA0MDkuNSAyMzMuNyIgc3R5bGU9ImZpbGw6IzUwZmZhNyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzODIuNSAyNzIuOCAzOTMuMyAyNjYgMzk4LjUgMjU5LjYgMzg3LjUgMjY3LjEgMzgyLjUgMjcyLjgiIHN0eWxlPSJmaWxsOiMwMGU0ZjgiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTYxLjggMTIuOCAxNDIuNCAxMC44IDE0OS4zIDIyIDE2Ni4zIDIzLjUgMTYxLjggMTIuOCIgc3R5bGU9ImZpbGw6I2NkMDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODEuOSAyMjAuMSAxODggMjMwLjUgMTg1LjYgMjU1LjYgMTc5LjcgMjQ0LjggMTgxLjkgMjIwLjEiIHN0eWxlPSJmaWxsOiM0MGZmYjciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzI4LjkgMjUwLjkgMzM4LjIgMjQ1LjUgMzQxLjggMjU0IDMzMi40IDI1OSAzMjguOSAyNTAuOSIgc3R5bGU9ImZpbGw6IzFmZmZkNyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIwLjUgMTU5LjIgMi40IDE3My44IDUuNCAxNDkuMSAzLjUgMTM0LjUgMC41IDE1OS4yIiBzdHlsZT0iZmlsbDojZDdmZjFmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjYzLjMgMjEuNyA0OS4xIDMxLjIgNjAuNSAyMS4zIDczLjEgMTIuMyA2My4zIDIxLjciIHN0eWxlPSJmaWxsOiNkYTAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQ3LjQgMzgzLjYgMTQ4LjcgMzk0LjEgMTM1LjQgNDAxLjEgMTMzLjkgMzkwLjggMTQ3LjQgMzgzLjYiIHN0eWxlPSJmaWxsOiMwMDAwY2QiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzkuOCAzNDUgNDIuNyAzNTQuMSAzMi45IDMzNC4xIDI5LjggMzI0LjQgMzkuOCAzNDUiIHN0eWxlPSJmaWxsOiMwMDNjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc0LjYgNTQuNCAxNjEuOCA1NC40IDE2NyA3NC43IDE3OCA3My45IDE3NC42IDU0LjQiIHN0eWxlPSJmaWxsOiNmZjRlMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzM1LjkgMTg1LjkgMzMwIDE3Ni43IDMyOC43IDE4OS4yIDMzNC42IDE5Ny4yIDMzNS45IDE4NS45IiBzdHlsZT0iZmlsbDojOWRmZjVhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzMi45IDIxNS44IDMzNC40IDIwOC42IDMzNS4xIDIxOS45IDMzMy43IDIyNi4yIDMzMi45IDIxNS44IiBzdHlsZT0iZmlsbDojNjNmZjk0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2Ni4zIDIzLjUgMTQ5LjMgMjIgMTU1LjggMzYuNiAxNzAuNiAzNy41IDE2Ni4zIDIzLjUiIHN0eWxlPSJmaWxsOiNlODAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzMxLjUgMTE5LjUgMzEyLjUgMTA1LjggMzA4LjMgMTE3LjQgMzI2LjggMTI5LjkgMzMxLjUgMTE5LjUiIHN0eWxlPSJmaWxsOiNmZmM0MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTcxLjQgOTcgMTY2LjcgMTAxLjIgMTcxLjEgMTI1LjcgMTc0LjcgMTIwLjcgMTcxLjQgOTciIHN0eWxlPSJmaWxsOiNmZmFlMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzY2LjUgOTcuNyAzNDQuMSA3OS41IDMzOC44IDc3LjkgMzYwLjYgOTUuOCAzNjYuNSA5Ny43IiBzdHlsZT0iZmlsbDojZmY4NjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzNS42IDE1My4xIDMyMi45IDE0MS42IDMxOS44IDE1NC4zIDMzMi40IDE2NC42IDMzNS42IDE1My4xIiBzdHlsZT0iZmlsbDojZGVmZjE5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4NS41IDI1NS42IDE4OSAyNjguMyAxODQgMjkxLjcgMTgwLjggMjc4LjkgMTg1LjUgMjU1LjYiIHN0eWxlPSJmaWxsOiMwMGU0ZjgiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTcwLjYgMzcuNSAxNTUuOCAzNi42IDE2MS44IDU0LjQgMTc0LjYgNTQuNCAxNzAuNiAzNy41IiBzdHlsZT0iZmlsbDojZjIwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2OS4xIDM0NS4xIDE3MC44IDM1OCAxNTkuOCAzNzIuNiAxNTguMSAzNTkuOSAxNjkuMSAzNDUuMSIgc3R5bGU9ImZpbGw6IzAwMThmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzOTcuNCAxMzMuMSAzODEuNiAxMTUuOCAzNzcuMSAxMDcuOCAzOTIuNyAxMjUuNSAzOTcuNCAxMzMuMSIgc3R5bGU9ImZpbGw6I2ZmZDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzODcuNSAyNjcuMSAzOTguNSAyNTkuNiA0MDMgMjUxLjkgMzkxLjggMjYwLjIgMzg3LjUgMjY3LjEiIHN0eWxlPSJmaWxsOiMwZmY4ZTciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDEzLjUgMTc4LjUgNDA2LjUgMTYzLjkgNDA0LjQgMTUyLjYgNDExLjMgMTY4IDQxMy41IDE3OC41IiBzdHlsZT0iZmlsbDojYzFmZjM2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyNi4yIDI0Mi4xIDMzNS40IDIzNi4yIDMzOC4yIDI0NS41IDMyOC45IDI1MC45IDMyNi4yIDI0Mi4xIiBzdHlsZT0iZmlsbDojMzNmZmM0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyMS4zIDQwNC4yIDEyMS45IDQxMS44IDEwNy44IDQxMSAxMDYuOCA0MDMuNCAxMjEuMyA0MDQuMiIgc3R5bGU9ImZpbGw6IzAwMDBhOCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0MTEuNCAyMjMuNiA0MTMuOCAyMTIuNCA0MTQuOCAyMDEgNDEyLjMgMjEzLjEgNDExLjQgMjIzLjYiIHN0eWxlPSJmaWxsOiM2YWZmOGQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iOTkuOCAyIDgzLjggNyA5NS4xIDYgMTA5IDEuMiA5OS44IDIiIHN0eWxlPSJmaWxsOiM5ZjAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzM1LjMgMjg1IDM1Mi45IDI3OS43IDM1OC45IDI4MS40IDM0MS4xIDI4Ni45IDMzNS4zIDI4NSIgc3R5bGU9ImZpbGw6IzAwYzhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzYuNyAxMTAuOCAzMTcuMiA5NS44IDMxMi41IDEwNS44IDMzMS41IDExOS41IDMzNi43IDExMC44IiBzdHlsZT0iZmlsbDojZmZhYjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyOS44IDI4MS43IDM0NyAyNzYuNSAzNTIuOSAyNzkuNyAzMzUuMyAyODUgMzI5LjggMjgxLjciIHN0eWxlPSJmaWxsOiMwMGQwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzYwLjYgOTUuOCAzMzguNyA3Ny45IDMzMy4zIDc4LjggMzU0LjUgOTYuMyAzNjAuNiA5NS44IiBzdHlsZT0iZmlsbDojZmY4MjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjExLjQgMjY1IDE1LjMgMjc3LjcgMTEuMiAyNTIuOCA3LjIgMjM5LjYgMTEuNCAyNjUiIHN0eWxlPSJmaWxsOiMxNmZmZTEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTIuNSA5Ni4zIDguOCAxMTEuNCAxNi41IDkwLjYgMTkuOCA3NS44IDEyLjUgOTYuMyIgc3R5bGU9ImZpbGw6I2ZmOGQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNDEuMSAyODYuOSAzNTguOSAyODEuNCAzNjUuMSAyODEuNSAzNDcgMjg3LjMgMzQxLjEgMjg2LjkiIHN0eWxlPSJmaWxsOiMwMGM4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzI0LjUgMjc3LjEgMzQxLjYgMjcxLjkgMzQ3IDI3Ni41IDMyOS43IDI4MS43IDMyNC41IDI3Ny4xIiBzdHlsZT0iZmlsbDojMDBkOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzNS4zIDMuNCAxMTguNSA0LjYgMTI4IDEyLjEgMTQyLjQgMTAuOCAxMzUuMyAzLjQiIHN0eWxlPSJmaWxsOiNhODAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTcxLjEgMTI1LjcgMTcxLjcgMTMyLjcgMTc1LjUgMTU4LjYgMTc0LjIgMTUxLjEgMTcxLjEgMTI1LjciIHN0eWxlPSJmaWxsOiNmZWVkMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzQyLjQgMTAzLjggMzIyLjQgODcuOSAzMTcuMiA5NS44IDMzNi43IDExMC44IDM0Mi40IDEwMy44IiBzdHlsZT0iZmlsbDojZmY5ODAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM1NC41IDk2LjMgMzMzLjMgNzguOCAzMjcuOCA4Mi4yIDM0OC40IDk5IDM1NC41IDk2LjMiIHN0eWxlPSJmaWxsOiNmZjgyMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzMzLjEgMjA1LjMgMzM0LjYgMTk3LjIgMzM0LjQgMjA4LjYgMzMyLjkgMjE1LjggMzMzLjEgMjA1LjMiIHN0eWxlPSJmaWxsOiM3ZGZmN2EiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzM4LjMgMTc0LjkgMzMyLjQgMTY0LjYgMzMwLjEgMTc2LjcgMzM2IDE4NS45IDMzOC4zIDE3NC45IiBzdHlsZT0iZmlsbDojYmFmZjNjIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzOS43IDE0Mi43IDMyNi44IDEyOS45IDMyMi45IDE0MS42IDMzNS42IDE1My4xIDMzOS43IDE0Mi43IiBzdHlsZT0iZmlsbDojZmJmMTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM0NyAyODcuMyAzNjUuMSAyODEuNSAzNzEuMSAyODAuMSAzNTIuOSAyODYuMiAzNDcgMjg3LjMiIHN0eWxlPSJmaWxsOiMwMGM4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzkxLjggMjYwLjIgNDAzIDI1MS45IDQwNi43IDI0My4yIDM5NS40IDI1Mi4zIDM5MS44IDI2MC4yIiBzdHlsZT0iZmlsbDojMjZmZmQxIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMxOS44IDI3MS4yIDMzNi43IDI2NiAzNDEuNiAyNzEuOSAzMjQuNSAyNzcuMSAzMTkuOCAyNzEuMiIgc3R5bGU9ImZpbGw6IzAyZThmNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyOS44IDMyNC4zIDMyLjkgMzM0LjEgMjQuOSAzMTIuMiAyMS41IDMwMS44IDI5LjggMzI0LjMiIHN0eWxlPSJmaWxsOiMwMDc4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzQ4LjQgOTkgMzI3LjggODIuMiAzMjIuNCA4Ny45IDM0Mi40IDEwMy45IDM0OC40IDk5IiBzdHlsZT0iZmlsbDojZmY4OTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM5Mi43IDEyNS41IDM3Ny4xIDEwNy44IDM3Mi4xIDEwMS43IDM4Ny4zIDExOS42IDM5Mi43IDEyNS41IiBzdHlsZT0iZmlsbDojZmZiOTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4NCAyOTEuNyAxODUuNiAzMDYuMSAxNzguNCAzMjcgMTc2LjggMzEyLjggMTg0IDI5MS43IiBzdHlsZT0iZmlsbDojMDA5OGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEuOSAxOTkuNCA1LjMgMjEzLjkgNS45IDE4OC41IDIuNCAxNzMuOCAxLjkgMTk5LjQiIHN0eWxlPSJmaWxsOiM5N2ZmNjAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTY3IDc0LjcgMTYwLjggNzguMSAxNjYuNyAxMDEuMiAxNzEuNCA5NyAxNjcgNzQuNyIgc3R5bGU9ImZpbGw6I2ZmNzMwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMjQuNSAyMzIuNyAzMzMuNyAyMjYuMiAzMzUuNCAyMzYuMiAzMjYuMiAyNDIuMSAzMjQuNSAyMzIuNyIgc3R5bGU9ImZpbGw6IzRkZmZhYSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0MTEuMyAxNjggNDA0LjQgMTUyLjYgNDAxLjMgMTQyLjIgNDA4LjIgMTU4LjMgNDExLjMgMTY4IiBzdHlsZT0iZmlsbDojZGVmZjE5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM5LjEgNDQuOCAyOS4yIDU4LjEgNDAuNCA0My45IDQ5LjEgMzEuMSAzOS4xIDQ0LjgiIHN0eWxlPSJmaWxsOiNmZjFhMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzUyLjkgMjg2LjIgMzcxLjEgMjgwLjEgMzc3IDI3Ny4yIDM1OC41IDI4My43IDM1Mi45IDI4Ni4yIiBzdHlsZT0iZmlsbDojMDBkMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMxNS43IDI2NC4zIDMzMi40IDI1OSAzMzYuNyAyNjYgMzE5LjggMjcxLjIgMzE1LjcgMjY0LjMiIHN0eWxlPSJmaWxsOiMxM2ZjZTQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDEyLjMgMjEzLjEgNDE0LjggMjAxIDQxNC43IDE4OS42IDQxMi4yIDIwMi42IDQxMi4zIDIxMy4xIiBzdHlsZT0iZmlsbDojODdmZjcwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE3NS41IDE1OC42IDE3OS43IDE2Ny41IDE4MS45IDE5NC4xIDE3Ny40IDE4NC43IDE3NS41IDE1OC42IiBzdHlsZT0iZmlsbDojYzRmZjMzIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0Mi40IDEwLjggMTI4IDEyLjEgMTM3LjIgMjMuNiAxNDkuMyAyMiAxNDIuNCAxMC44IiBzdHlsZT0iZmlsbDojYjYwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM0NC42IDEzMy41IDMzMS41IDExOS41IDMyNi44IDEyOS45IDMzOS43IDE0Mi43IDM0NC42IDEzMy41IiBzdHlsZT0iZmlsbDpnb2xkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM4Ny4zIDExOS42IDM3MiAxMDEuNyAzNjYuNSA5Ny43IDM4MS41IDExNS42IDM4Ny4zIDExOS42IiBzdHlsZT0iZmlsbDojZmZhNzAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1OS44IDM3Mi42IDE2MC44IDM4My4zIDE0OC43IDM5NC4xIDE0Ny40IDM4My42IDE1OS44IDM3Mi42IiBzdHlsZT0iZmlsbDojMDAwMGZhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzNS40IDQwMS4xIDEzNS42IDQwOC43IDEyMS45IDQxMS44IDEyMS4zIDQwNC4yIDEzNS40IDQwMS4xIiBzdHlsZT0iZmlsbDojMDBiIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM5NS40IDI1Mi4zIDQwNi43IDI0My4yIDQwOS41IDIzMy43IDM5OC4xIDI0My41IDM5NS40IDI1Mi4zIiBzdHlsZT0iZmlsbDojM2NmZmJhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM1OC41IDI4My43IDM3NyAyNzcuMiAzODIuNSAyNzIuOCAzNjMuNyAyNzkuOSAzNTguNSAyODMuNyIgc3R5bGU9ImZpbGw6IzAwZGNmZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNDEuNSAxNjQuNiAzMzUuNiAxNTMuMSAzMzIuNCAxNjQuNiAzMzguMyAxNzQuOSAzNDEuNSAxNjQuNiIgc3R5bGU9ImZpbGw6I2Q0ZmYyMyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjEuOCA1NC40IDE1My45IDU3IDE2MC44IDc4LjEgMTY3IDc0LjcgMTYxLjggNTQuNCIgc3R5bGU9ImZpbGw6I2ZmM2YwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzQuNCAxOTQuOSAzMzYgMTg1LjkgMzM0LjYgMTk3LjIgMzMzLjEgMjA1LjMgMzM0LjQgMTk0LjkiIHN0eWxlPSJmaWxsOiM5YWZmNWQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNzMuMSAxMi4zIDYwLjUgMjEuMyA3MyAxNS41IDgzLjggNyA3My4xIDEyLjMiIHN0eWxlPSJmaWxsOiNiMjAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNzkuNyAzOTguMiA4MC4zIDQwMy4zIDY3LjQgMzkyIDY2LjMgMzg2LjYgNzkuNyAzOTguMiIgc3R5bGU9ImZpbGw6IzAwMDBkNiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMTIuMyAyNTYuNSAzMjguOSAyNTAuOSAzMzIuNCAyNTkgMzE1LjcgMjY0LjMgMzEyLjMgMjU2LjUiIHN0eWxlPSJmaWxsOiMyNmZmZDEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNjYuMyAzODYuNiA2Ny40IDM5MiA1NS41IDM3Ny44IDUzLjkgMzcxLjggNjYuMyAzODYuNiIgc3R5bGU9ImZpbGw6IzAwMDBmYSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMjMuNyAyMjMgMzMyLjkgMjE1LjggMzMzLjcgMjI2LjIgMzI0LjUgMjMyLjcgMzIzLjcgMjIzIiBzdHlsZT0iZmlsbDojNjNmZjk0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4MS45IDE5NC4xIDE4OC4xIDIwNC4yIDE4OCAyMzAuNSAxODEuOSAyMjAuMSAxODEuOSAxOTQuMSIgc3R5bGU9ImZpbGw6IzgzZmY3MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDkuMyAyMiAxMzcuMiAyMy42IDE0NS45IDM4LjcgMTU1LjggMzYuNiAxNDkuMyAyMiIgc3R5bGU9ImZpbGw6I2Q2MDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMDkgMS4yIDk1LjEgNS45IDEwNi44IDkuMiAxMTguNSA0LjYgMTA5IDEuMiIgc3R5bGU9ImZpbGw6Izk2MDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0MDguMiAxNTguMyA0MDEuMyAxNDIuMiAzOTcuNCAxMzMuMSA0MDQuMiAxNDkuNyA0MDguMiAxNTguMyIgc3R5bGU9ImZpbGw6I2Y0ZjgwMiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTUuOCAzNi42IDE0NS45IDM4LjcgMTUzLjggNTcgMTYxLjggNTQuNCAxNTUuOCAzNi42IiBzdHlsZT0iZmlsbDojZmYxMzAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjkzLjYgNDA2LjQgOTMuNyA0MTEuMiA4MC4zIDQwMy4zIDc5LjcgMzk4LjIgOTMuNiA0MDYuNCIgc3R5bGU9ImZpbGw6IzAwMDBiZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNTAuMSAxMjUuOCAzMzYuNyAxMTAuOCAzMzEuNSAxMTkuNSAzNDQuNiAxMzMuNSAzNTAuMSAxMjUuOCIgc3R5bGU9ImZpbGw6I2ZmYzEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzLjUgMTM0LjUgNS40IDE0OS4xIDEwLjcgMTI2LjEgOC44IDExMS40IDMuNSAxMzQuNSIgc3R5bGU9ImZpbGw6I2ZmZDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzODEuNSAxMTUuNiAzNjYuNSA5Ny43IDM2MC42IDk1LjggMzc1LjIgMTEzLjYgMzgxLjUgMTE1LjYiIHN0eWxlPSJmaWxsOiNmZjljMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDEyLjIgMjAyLjYgNDE0LjcgMTg5LjYgNDEzLjUgMTc4LjUgNDExIDE5Mi4zIDQxMi4yIDIwMi42IiBzdHlsZT0iZmlsbDojYTBmZjU2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2Ni43IDEwMS4yIDE2Ni4yIDEwNy41IDE3MS43IDEzMi42IDE3MS4xIDEyNS43IDE2Ni43IDEwMS4yIiBzdHlsZT0iZmlsbDojZmZhYjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjUzLjkgMzcxLjggNTUuNCAzNzcuOCA0NC42IDM2MC44IDQyLjcgMzU0LjEgNTMuOSAzNzEuOCIgc3R5bGU9ImZpbGw6IzAwMTRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNjMuNyAyNzkuOSAzODIuNSAyNzIuOCAzODcuNSAyNjcuMSAzNjguNSAyNzQuNyAzNjMuNyAyNzkuOSIgc3R5bGU9ImZpbGw6IzA2ZWNmMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMS41IDMwMS44IDI0LjkgMzEyLjIgMTguOCAyODguOSAxNS4zIDI3Ny43IDIxLjUgMzAxLjgiIHN0eWxlPSJmaWxsOiMwMGJjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc4LjQgMzI3IDE3OS45IDM0MC4yIDE3MC44IDM1OCAxNjkuMSAzNDUuMSAxNzguNCAzMjciIHN0eWxlPSJmaWxsOiMwMDU0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzA5LjggMjQ4LjEgMzI2LjIgMjQyLjEgMzI4LjkgMjUwLjkgMzEyLjMgMjU2LjUgMzA5LjggMjQ4LjEiIHN0eWxlPSJmaWxsOiMzOWZmYmUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzU2LjEgMTE5LjggMzQyLjQgMTAzLjggMzM2LjcgMTEwLjggMzUwLjEgMTI1LjggMzU2LjEgMTE5LjgiIHN0eWxlPSJmaWxsOiNmZmFlMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTg4IDIzMC41IDE5MS42IDI0MyAxODkgMjY4LjMgMTg1LjUgMjU1LjYgMTg4IDIzMC41IiBzdHlsZT0iZmlsbDojNDBmZmI3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM3NS4yIDExMy42IDM2MC42IDk1LjggMzU0LjUgOTYuMyAzNjguOCAxMTMuNyAzNzUuMiAxMTMuNiIgc3R5bGU9ImZpbGw6I2ZmOTgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI3LjIgMjM5LjYgMTEuMiAyNTIuOCA5LjMgMjI3LjcgNS4zIDIxMy45IDcuMiAyMzkuNiIgc3R5bGU9ImZpbGw6IzU2ZmZhMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzOTguMSAyNDMuNSA0MDkuNSAyMzMuNyA0MTEuNCAyMjMuNiAzOTkuOSAyMzQuMiAzOTguMSAyNDMuNSIgc3R5bGU9ImZpbGw6IzUzZmZhNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNDUuNyAxNTUuMyAzMzkuNyAxNDIuNyAzMzUuNiAxNTMuMSAzNDEuNiAxNjQuNiAzNDUuNyAxNTUuMyIgc3R5bGU9ImZpbGw6I2VlZmYwOSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNjIuNCAxMTUuNyAzNDguNCA5OSAzNDIuNCAxMDMuOCAzNTYuMSAxMTkuOCAzNjIuNCAxMTUuNyIgc3R5bGU9ImZpbGw6I2ZmOWYwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNjguOCAxMTMuNyAzNTQuNSA5Ni4zIDM0OC40IDk5IDM2Mi40IDExNS43IDM2OC44IDExMy43IiBzdHlsZT0iZmlsbDojZmY5ODAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzNi43IDE4NSAzMzguMyAxNzQuOSAzMzYgMTg1LjkgMzM0LjQgMTk0LjkgMzM2LjcgMTg1IiBzdHlsZT0iZmlsbDojYjRmZjQzIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwNy44IDQxMSAxMDcuNCA0MTUuNiA5My43IDQxMS4yIDkzLjYgNDA2LjQgMTA3LjggNDExIiBzdHlsZT0iZmlsbDojMDAwMGI2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMwNi4xIDI4Ny41IDMyOS43IDI4MS43IDMzNS4zIDI4NSAzMTEuNCAyOTAuOSAzMDYuMSAyODcuNSIgc3R5bGU9ImZpbGw6IzAwZDhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0MDQuMiAxNDkuNyAzOTcuNCAxMzMuMSAzOTIuNyAxMjUuNSAzOTkuNCAxNDIuNSA0MDQuMiAxNDkuNyIgc3R5bGU9ImZpbGw6I2ZmZGUwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMjQgMjEzLjIgMzMzLjEgMjA1LjMgMzMyLjkgMjE1LjggMzIzLjcgMjIzIDMyNCAyMTMuMiIgc3R5bGU9ImZpbGw6IzdkZmY3YSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMTEuNCAyOTAuOSAzMzUuMyAyODUgMzQxLjEgMjg2LjkgMzE3IDI5MyAzMTEuNCAyOTAuOSIgc3R5bGU9ImZpbGw6IzAwZDBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMDEuMSAyODIuOCAzMjQuNSAyNzcuMSAzMjkuNyAyODEuNyAzMDYuMSAyODcuNSAzMDEuMSAyODIuOCIgc3R5bGU9ImZpbGw6IzAwZTBmYiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMTcgMjkzIDM0MS4yIDI4Ni45IDM0NyAyODcuMyAzMjIuNiAyOTMuNyAzMTcgMjkzIiBzdHlsZT0iZmlsbDojMDBkMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE5LjggNzUuOCAxNi41IDkwLjYgMjYuMyA3Mi43IDI5LjIgNTguMSAxOS44IDc1LjgiIHN0eWxlPSJmaWxsOiNmZjRlMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjk2LjYgMjc2LjkgMzE5LjggMjcxLjIgMzI0LjUgMjc3LjEgMzAxLjEgMjgyLjggMjk2LjYgMjc2LjkiIHN0eWxlPSJmaWxsOiMwOWYwZWUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzY4LjUgMjc0LjcgMzg3LjUgMjY3LjEgMzkxLjggMjYwLjIgMzcyLjYgMjY4LjQgMzY4LjUgMjc0LjciIHN0eWxlPSJmaWxsOiMxOWZmZGUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDIuNyAzNTQuMSA0NC42IDM2MC44IDM1LjMgMzQxLjYgMzIuOSAzMzQuMSA0Mi43IDM1NC4xIiBzdHlsZT0iZmlsbDojMDA0OGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMwOC4xIDIzOS4xIDMyNC41IDIzMi43IDMyNi4yIDI0Mi4xIDMwOS44IDI0OC4xIDMwOC4xIDIzOS4xIiBzdHlsZT0iZmlsbDojNTBmZmE3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQxMSAxOTIuMyA0MTMuNSAxNzguNSA0MTEuNCAxNjggNDA4LjggMTgyLjQgNDExIDE5Mi4zIiBzdHlsZT0iZmlsbDojYmVmZjM5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjExOC41IDQuNiAxMDYuOCA5LjIgMTE4LjUgMTYuNyAxMjggMTIuMSAxMTguNSA0LjYiIHN0eWxlPSJmaWxsOiM5NjAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzUwLjYgMTQ3LjEgMzQ0LjYgMTMzLjUgMzM5LjcgMTQyLjcgMzQ1LjcgMTU1LjMgMzUwLjYgMTQ3LjEiIHN0eWxlPSJmaWxsOiNmZmU2MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQ4LjcgMzk0LjEgMTQ4LjUgNDAyIDEzNS42IDQwOC43IDEzNS40IDQwMS4xIDE0OC43IDM5NC4xIiBzdHlsZT0iZmlsbDojMDAwMGRhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyMi42IDI5My43IDM0NyAyODcuMyAzNTIuOSAyODYuMiAzMjguMSAyOTIuOSAzMjIuNiAyOTMuNyIgc3R5bGU9ImZpbGw6IzAwZDBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzEuNyAxMzIuNiAxNzUuNCAxNDEuMSAxNzkuNyAxNjcuNSAxNzUuNSAxNTguNiAxNzEuNyAxMzIuNiIgc3R5bGU9ImZpbGw6I2ZmZWEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyOTIuNyAyNzAuMSAzMTUuNyAyNjQuMyAzMTkuOCAyNzEuMiAyOTYuNiAyNzYuOSAyOTIuNyAyNzAuMSIgc3R5bGU9ImZpbGw6IzE2ZmZlMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjAuOCA3OC4xIDE1OSA4My44IDE2Ni4yIDEwNy41IDE2Ni43IDEwMS4yIDE2MC44IDc4LjEiIHN0eWxlPSJmaWxsOiNmZjZjMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMi40IDE3My44IDUuOSAxODguNSA4LjggMTY0LjIgNS40IDE0OS4xIDIuNCAxNzMuOCIgc3R5bGU9ImZpbGw6I2Q3ZmYxZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzOTkuOSAyMzQuMiA0MTEuNCAyMjMuNiA0MTIuMyAyMTMuMSA0MDAuNyAyMjQuNCAzOTkuOSAyMzQuMiIgc3R5bGU9ImZpbGw6IzZkZmY4YSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0OS4xIDMxLjIgNDAuNCA0My45IDUzLjEgMzMuNCA2MC41IDIxLjMgNDkuMSAzMS4yIiBzdHlsZT0iZmlsbDojZDEwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM5OS40IDE0Mi41IDM5Mi43IDEyNS41IDM4Ny4zIDExOS42IDM5My45IDEzNi44IDM5OS40IDE0Mi41IiBzdHlsZT0iZmlsbDojZmMwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4OSAyNjguMyAxOTAuNiAyODIuNyAxODUuNiAzMDYuMSAxODQgMjkxLjcgMTg5IDI2OC4zIiBzdHlsZT0iZmlsbDojMDBlNGY4Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzOS45IDE3NS43IDM0MS42IDE2NC42IDMzOC4zIDE3NC45IDMzNi43IDE4NSAzMzkuOSAxNzUuNyIgc3R5bGU9ImZpbGw6I2NlZmYyOSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4My44IDcgNzMgMTUuNSA4Ni4yIDE0LjEgOTUuMSA2IDgzLjggNyIgc3R5bGU9ImZpbGw6Izk2MDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMjUuMiAyMDMuNiAzMzQuNCAxOTQuOSAzMzMuMSAyMDUuMyAzMjQgMjEzLjIgMzI1LjIgMjAzLjYiIHN0eWxlPSJmaWxsOiM5N2ZmNjAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTIxLjkgNDExLjggMTIwLjkgNDE2LjMgMTA3LjQgNDE1LjYgMTA3LjggNDExIDEyMS45IDQxMS44IiBzdHlsZT0iZmlsbDojMDBiIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyOC4xIDI5Mi45IDM1Mi45IDI4Ni4yIDM1OC41IDI4My43IDMzMy40IDI5MC44IDMyOC4xIDI5Mi45IiBzdHlsZT0iZmlsbDojMDBkOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE3MC44IDM1OCAxNzEuNiAzNjkuMSAxNjAuOCAzODMuMyAxNTkuOCAzNzIuNiAxNzAuOCAzNTgiIHN0eWxlPSJmaWxsOiMwMDIwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzcyLjYgMjY4LjQgMzkxLjggMjYwLjIgMzk1LjQgMjUyLjMgMzc2IDI2MSAzNzIuNiAyNjguNCIgc3R5bGU9ImZpbGw6IzI5ZmZjZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyODkuNCAyNjIuNCAzMTIuMyAyNTYuNSAzMTUuNyAyNjQuMyAyOTIuNyAyNzAuMSAyODkuNCAyNjIuNCIgc3R5bGU9ImZpbGw6IzI5ZmZjZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNTYuMiAxNDAuNCAzNTAuMSAxMjUuOCAzNDQuNiAxMzMuNSAzNTAuNiAxNDcuMSAzNTYuMiAxNDAuNCIgc3R5bGU9ImZpbGw6I2ZmZDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMDcuMyAyMjkuOSAzMjMuNyAyMjMgMzI0LjUgMjMyLjcgMzA4LjEgMjM5LjEgMzA3LjMgMjI5LjkiIHN0eWxlPSJmaWxsOiM2NmZmOTAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDA4LjggMTgyLjQgNDExLjMgMTY4IDQwOC4yIDE1OC4zIDQwNS43IDE3My4zIDQwOC44IDE4Mi40IiBzdHlsZT0iZmlsbDojZDRmZjIzIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM5My45IDEzNi44IDM4Ny4zIDExOS42IDM4MS41IDExNS42IDM4OCAxMzIuOCAzOTMuOSAxMzYuOCIgc3R5bGU9ImZpbGw6I2ZmYjkwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMjggMTIuMSAxMTguNSAxNi43IDEyOS44IDI4LjMgMTM3LjIgMjMuNiAxMjggMTIuMSIgc3R5bGU9ImZpbGw6I2E4MDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNS4zIDI3Ny43IDE4LjggMjg4LjkgMTQuOSAyNjQuNyAxMS4yIDI1Mi44IDE1LjMgMjc3LjciIHN0eWxlPSJmaWxsOiMxOWZmZGUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc5LjcgMTY3LjUgMTg1LjcgMTc3LjQgMTg4LjEgMjA0LjIgMTgxLjkgMTk0LjEgMTc5LjcgMTY3LjUiIHN0eWxlPSJmaWxsOiNjNGZmMzMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTUzLjkgNTcgMTUwLjQgNjIuMyAxNTkgODMuOCAxNjAuOCA3OC4xIDE1My45IDU3IiBzdHlsZT0iZmlsbDojZmYzNDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyLjkgMzM0LjEgMzUuMyAzNDEuNiAyNy42IDMyMC41IDI0LjkgMzEyLjIgMzIuOSAzMzQuMSIgc3R5bGU9ImZpbGw6IzAwODBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNjIuMiAxMzUuMyAzNTYuMSAxMTkuOCAzNTAuMSAxMjUuOCAzNTYuMiAxNDAuNCAzNjIuMiAxMzUuMyIgc3R5bGU9ImZpbGw6I2ZmYzEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzMuNCAyOTAuOCAzNTguNSAyODMuOCAzNjMuNyAyNzkuOSAzMzguNCAyODcuMyAzMzMuNCAyOTAuOCIgc3R5bGU9ImZpbGw6IzAwZTRmOCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0MDAuNyAyMjQuNCA0MTIuMyAyMTMuMSA0MTIuMiAyMDIuNiA0MDAuNiAyMTQuNiA0MDAuNyAyMjQuNCIgc3R5bGU9ImZpbGw6Izg3ZmY3MCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyODcgMjU0IDMwOS43IDI0OC4xIDMxMi4zIDI1Ni42IDI4OS40IDI2Mi40IDI4NyAyNTQiIHN0eWxlPSJmaWxsOiMzY2ZmYmEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzQ0IDE2Ny4zIDM0NS43IDE1NS4zIDM0MS42IDE2NC42IDMzOS45IDE3NS43IDM0NCAxNjcuMyIgc3R5bGU9ImZpbGw6I2U0ZmYxMyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzODggMTMyLjggMzgxLjUgMTE1LjYgMzc1LjIgMTEzLjYgMzgxLjYgMTMwLjYgMzg4IDEzMi44IiBzdHlsZT0iZmlsbDojZmZiMjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzNy4yIDIzLjYgMTI5LjggMjguMyAxNDAuNiA0My43IDE0NS45IDM4LjcgMTM3LjIgMjMuNiIgc3R5bGU9ImZpbGw6I2M4MDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDUuOSAzOC43IDE0MC42IDQzLjcgMTUwLjQgNjIuMyAxNTMuOSA1NyAxNDUuOSAzOC43IiBzdHlsZT0iZmlsbDojZjEwODAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyNy4zIDE5NC40IDMzNi43IDE4NSAzMzQuNCAxOTQuOSAzMjUuMiAyMDMuNiAzMjcuMyAxOTQuNCIgc3R5bGU9ImZpbGw6I2IxZmY0NiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNjguNiAxMzEuOSAzNjIuMyAxMTUuNyAzNTYuMSAxMTkuOCAzNjIuMiAxMzUuMyAzNjguNiAxMzEuOSIgc3R5bGU9ImZpbGw6I2ZmYjIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4LjggMTExLjQgMTAuNyAxMjYuMSAxOC40IDEwNS41IDE2LjUgOTAuNiA4LjggMTExLjQiIHN0eWxlPSJmaWxsOiNmZjhkMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzc2IDI2MSAzOTUuNCAyNTIuMyAzOTguMSAyNDMuNSAzNzguNiAyNTIuOCAzNzYgMjYxIiBzdHlsZT0iZmlsbDojNDBmZmI3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM4MS42IDEzMC42IDM3NS4yIDExMy42IDM2OC44IDExMy42IDM3NS4xIDEzMC4zIDM4MS42IDEzMC42IiBzdHlsZT0iZmlsbDojZmZhYjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM3NS4xIDEzMC4zIDM2OC44IDExMy42IDM2Mi4zIDExNS43IDM2OC42IDEzMS45IDM3NS4xIDEzMC4zIiBzdHlsZT0iZmlsbDojZmZhZTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMwNy41IDIyMC42IDMyNCAyMTMuMiAzMjMuNyAyMjMgMzA3LjMgMjI5LjkgMzA3LjUgMjIwLjYiIHN0eWxlPSJmaWxsOiM3ZGZmN2EiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjc3LjcgMjkzLjkgMzA2LjEgMjg3LjUgMzExLjQgMjkwLjkgMjgyLjggMjk3LjYgMjc3LjcgMjkzLjkiIHN0eWxlPSJmaWxsOiMwMGRjZmUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjczIDI4OSAzMDEuMSAyODIuOCAzMDYuMSAyODcuNSAyNzcuNyAyOTMuOSAyNzMgMjg5IiBzdHlsZT0iZmlsbDojMDBlNGY4Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjUuMyAyMTMuOSA5LjMgMjI3LjcgOS45IDIwMi45IDUuOSAxODguNSA1LjMgMjEzLjkiIHN0eWxlPSJmaWxsOiM5N2ZmNjAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDA1LjcgMTczLjMgNDA4LjIgMTU4LjMgNDA0LjIgMTQ5LjcgNDAxLjcgMTY1LjIgNDA1LjcgMTczLjMiIHN0eWxlPSJmaWxsOiNlYmZmMGMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iODAuMyA0MDMuMyA3OS43IDQwNS4zIDY3LjQgMzk0LjYgNjcuNCAzOTIgODAuMyA0MDMuMyIgc3R5bGU9ImZpbGw6IzAwMDBlZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODUuNiAzMDYuMSAxODcuMSAzMTkuNSAxNzkuOSAzNDAuMiAxNzguNCAzMjcuMSAxODUuNiAzMDYuMSIgc3R5bGU9ImZpbGw6IzAwOWNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODguMSAyMDQuMiAxOTEuNyAyMTYuNiAxOTEuNiAyNDMgMTg4IDIzMC41IDE4OC4xIDIwNC4yIiBzdHlsZT0iZmlsbDojODNmZjczIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI4Mi44IDI5Ny42IDMxMS40IDI5MC45IDMxNyAyOTMgMjg4IDI5OS45IDI4Mi44IDI5Ny42IiBzdHlsZT0iZmlsbDojMDBkNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjY3LjQgMzkyIDY3LjQgMzk0LjYgNTYgMzgxIDU1LjUgMzc3LjggNjcuNCAzOTIiIHN0eWxlPSJmaWxsOmJsdWUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTY2LjIgMTA3LjUgMTY5IDExNS42IDE3NS40IDE0MS4xIDE3MS43IDEzMi42IDE2Ni4yIDEwNy41IiBzdHlsZT0iZmlsbDojZmZhMzAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI2OC43IDI4MyAyOTYuNiAyNzYuOSAzMDEuMSAyODIuOCAyNzMgMjg5IDI2OC43IDI4MyIgc3R5bGU9ImZpbGw6IzBjZjRlYiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzguNCAyODcuMyAzNjMuNyAyNzkuOSAzNjguNSAyNzQuNyAzNDIuOSAyODIuNSAzMzguNCAyODcuMyIgc3R5bGU9ImZpbGw6IzBjZjRlYiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzUuNiA0MDguNyAxMzQuMSA0MTMuNCAxMjEgNDE2LjMgMTIxLjkgNDExLjggMTM1LjYgNDA4LjciIHN0eWxlPSJmaWxsOiMwMDAwY2QiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjg1LjMgMjQ1LjMgMzA4LjEgMjM5LjEgMzA5LjcgMjQ4LjEgMjg3IDI1NCAyODUuMyAyNDUuMyIgc3R5bGU9ImZpbGw6IzUwZmZhNyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI5My43IDQxMS4yIDkyLjUgNDEyLjggNzkuNyA0MDUuMyA4MC4zIDQwMy4zIDkzLjcgNDExLjIiIHN0eWxlPSJmaWxsOiMwMDAwZDYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzQ4LjggMTYwIDM1MC42IDE0Ny4xIDM0NS43IDE1NS4zIDM0NCAxNjcuMyAzNDguOCAxNjAiIHN0eWxlPSJmaWxsOiNmOGY1MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjg4IDI5OS45IDMxNyAyOTMgMzIyLjYgMjkzLjcgMjkzLjMgMzAwLjggMjg4IDI5OS45IiBzdHlsZT0iZmlsbDojMDBkNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijk1LjEgNiA4Ni4yIDE0LjEgOTkuOCAxNy4xIDEwNi44IDkuMiA5NS4xIDYiIHN0eWxlPSJmaWxsOiM4OTAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjY1IDI3Ni4xIDI5Mi43IDI3MC4xIDI5Ni42IDI3Ni45IDI2OC43IDI4My4xIDI2NSAyNzYuMSIgc3R5bGU9ImZpbGw6IzE5ZmZkZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjAuOCAzODMuMyAxNjAuMyAzOTEuNSAxNDguNSA0MDIgMTQ4LjcgMzk0LjEgMTYwLjggMzgzLjMiIHN0eWxlPSJmaWxsOmJsdWUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDAwLjYgMjE0LjYgNDEyLjIgMjAyLjYgNDExIDE5Mi4zIDM5OS40IDIwNC45IDQwMC42IDIxNC42IiBzdHlsZT0iZmlsbDojYTBmZjU2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjU1LjUgMzc3LjggNTYgMzgxIDQ1LjcgMzY0LjggNDQuNiAzNjAuOCA1NS41IDM3Ny44IiBzdHlsZT0iZmlsbDojMDAyNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI5LjIgNTguMSAyNi4zIDcyLjcgMzcuOSA1OC4yIDQwLjQgNDMuOSAyOS4yIDU4LjEiIHN0eWxlPSJmaWxsOiNmZjE2MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzMwLjQgMTg1LjkgMzM5LjkgMTc1LjcgMzM2LjcgMTg1IDMyNy4zIDE5NC40IDMzMC40IDE4NS45IiBzdHlsZT0iZmlsbDojYzdmZjMwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQwMS43IDE2NS4yIDQwNC4yIDE0OS44IDM5OS40IDE0Mi41IDM5NyAxNTguMyA0MDEuNyAxNjUuMiIgc3R5bGU9ImZpbGw6I2ZlZWQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNzguNiAyNTIuOCAzOTguMSAyNDMuNSAzOTkuOSAyMzQuMiAzODAuMyAyNDQuMSAzNzguNiAyNTIuOCIgc3R5bGU9ImZpbGw6IzU2ZmZhMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI2MC41IDIxLjMgNTMuMSAzMy40IDY3IDI3LjIgNzMgMTUuNSA2MC41IDIxLjMiIHN0eWxlPSJmaWxsOiNhODAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjkzLjMgMzAwLjggMzIyLjYgMjkzLjcgMzI4LjEgMjkyLjkgMjk4LjYgMzAwLjMgMjkzLjMgMzAwLjgiIHN0eWxlPSJmaWxsOiMwMGQ0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzA4LjYgMjExLjYgMzI1LjIgMjAzLjYgMzI0IDIxMy4yIDMwNy41IDIyMC42IDMwOC42IDIxMS42IiBzdHlsZT0iZmlsbDojOTdmZjYwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI2MS45IDI2OC4zIDI4OS40IDI2Mi40IDI5Mi43IDI3MC4xIDI2NSAyNzYuMSAyNjEuOSAyNjguMyIgc3R5bGU9ImZpbGw6IzI5ZmZjZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNC45IDMxMi4yIDI3LjYgMzIwLjUgMjEuNyAyOTggMTguOCAyODguOSAyNC45IDMxMi4yIiBzdHlsZT0iZmlsbDojMDBjNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM0Mi45IDI4Mi41IDM2OC41IDI3NC43IDM3Mi42IDI2OC40IDM0Ni44IDI3Ni41IDM0Mi45IDI4Mi41IiBzdHlsZT0iZmlsbDojMWNmZmRiIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwNy40IDQxNS42IDEwNS42IDQxNyA5Mi41IDQxMi44IDkzLjcgNDExLjIgMTA3LjQgNDE1LjYiIHN0eWxlPSJmaWxsOiMwMDAwY2QiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjg0LjYgMjM2LjMgMzA3LjMgMjI5LjkgMzA4LjEgMjM5LjEgMjg1LjMgMjQ1LjMgMjg0LjYgMjM2LjMiIHN0eWxlPSJmaWxsOiM2NmZmOTAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzU0LjMgMTU0LjEgMzU2LjIgMTQwLjQgMzUwLjYgMTQ3LjEgMzQ4LjggMTYwIDM1NC4zIDE1NC4xIiBzdHlsZT0iZmlsbDojZmZkZTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjUuNCAxNDkuMSA4LjggMTY0LjIgMTQuMSAxNDEuNSAxMC43IDEyNi4xIDUuNCAxNDkuMSIgc3R5bGU9ImZpbGw6I2ZmZDMwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTEuNiAyNDMgMTkzLjIgMjU3LjYgMTkwLjYgMjgyLjcgMTg5IDI2OC4zIDE5MS42IDI0MyIgc3R5bGU9ImZpbGw6IzQwZmZiNyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyOTguNiAzMDAuMyAzMjguMSAyOTIuOSAzMzMuNCAyOTAuOCAzMDMuNiAyOTguNCAyOTguNiAzMDAuMyIgc3R5bGU9ImZpbGw6IzAwZGNmZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzOTcgMTU4LjMgMzk5LjQgMTQyLjUgMzkzLjkgMTM2LjggMzkxLjYgMTUyLjggMzk3IDE1OC4zIiBzdHlsZT0iZmlsbDojZmZkYjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM5OS40IDIwNC45IDQxMSAxOTIuMyA0MDguOCAxODIuNSAzOTcuMyAxOTUuNiAzOTkuNCAyMDQuOSIgc3R5bGU9ImZpbGw6I2I3ZmY0MCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzUuNCAxNDEuMSAxODAuOCAxNTAuOCAxODUuNyAxNzcuNCAxNzkuNyAxNjcuNSAxNzUuNCAxNDEuMSIgc3R5bGU9ImZpbGw6I2ZmZTYwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0NC42IDM2MC44IDQ1LjcgMzY0LjggMzYuOCAzNDYuNCAzNS4zIDM0MS42IDQ0LjYgMzYwLjgiIHN0eWxlPSJmaWxsOiMwMDU0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTEuMiAyNTIuOCAxNC45IDI2NC43IDEzLjEgMjQwLjMgOS4zIDIyNy43IDExLjIgMjUyLjgiIHN0eWxlPSJmaWxsOiM1NmZmYTAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjU5LjUgMjYwIDI4NyAyNTQgMjg5LjQgMjYyLjQgMjYxLjkgMjY4LjQgMjU5LjUgMjYwIiBzdHlsZT0iZmlsbDojM2NmZmJhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE3OS45IDM0MC4yIDE4MC42IDM1MS42IDE3MS42IDM2OS4xIDE3MC44IDM1OCAxNzkuOSAzNDAuMiIgc3R5bGU9ImZpbGw6IzAwNWNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTkgODMuOCAxNjAuNiA5MS43IDE2OSAxMTUuNiAxNjYuMiAxMDcuNSAxNTkgODMuOCIgc3R5bGU9ImZpbGw6I2ZmNjQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNjAuMiAxNDkuNyAzNjIuMiAxMzUuMyAzNTYuMiAxNDAuNCAzNTQuMyAxNTQuMSAzNjAuMiAxNDkuNyIgc3R5bGU9ImZpbGw6I2ZmZDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzQuNCAxNzguMyAzNDQgMTY3LjMgMzM5LjkgMTc1LjcgMzMwLjQgMTg1LjkgMzM0LjQgMTc4LjMiIHN0eWxlPSJmaWxsOiNkZWZmMTkiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTA2LjggOS4yIDk5LjggMTcuMSAxMTMuNSAyNC40IDExOC41IDE2LjcgMTA2LjggOS4yIiBzdHlsZT0iZmlsbDojODkwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM4MC4zIDI0NC4xIDM5OS45IDIzNC4yIDQwMC43IDIyNC40IDM4MS4xIDIzNC45IDM4MC4zIDI0NC4xIiBzdHlsZT0iZmlsbDojNmRmZjhhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM5MS41IDE1Mi44IDM5My45IDEzNi44IDM4OCAxMzIuOCAzODUuNiAxNDguOCAzOTEuNSAxNTIuOCIgc3R5bGU9ImZpbGw6I2ZjMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMTAuNyAyMDMgMzI3LjMgMTk0LjQgMzI1LjIgMjAzLjYgMzA4LjYgMjExLjYgMzEwLjcgMjAzIiBzdHlsZT0iZmlsbDojYWRmZjQ5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM0Ni44IDI3Ni41IDM3Mi42IDI2OC40IDM3NiAyNjEgMzUwLjEgMjY5LjYgMzQ2LjggMjc2LjUiIHN0eWxlPSJmaWxsOiMyY2ZmY2EiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjg0LjcgMjI3LjQgMzA3LjUgMjIwLjYgMzA3LjMgMjI5LjkgMjg0LjYgMjM2LjMgMjg0LjcgMjI3LjQiIHN0eWxlPSJmaWxsOiM3ZGZmN2EiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjQ4LjMgMzAzLjYgMjgwLjIgMjk1LjkgMjc1LjMgMjkxLjYgMjQzLjMgMjk5LjIgMjQ4LjMgMzAzLjYiIHN0eWxlPSJmaWxsOiMwMGRjZmUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjQzLjMgMjk5LjIgMjc1LjMgMjkxLjYgMjcwLjggMjg2LjIgMjM4LjcgMjkzLjcgMjQzLjMgMjk5LjIiIHN0eWxlPSJmaWxsOiMwMmU4ZjQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzY2LjUgMTQ2LjkgMzY4LjYgMTMxLjkgMzYyLjIgMTM1LjMgMzYwLjIgMTQ5LjcgMzY2LjUgMTQ2LjkiIHN0eWxlPSJmaWxsOiNmZmM0MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQ4LjUgNDAyIDE0Ni41IDQwNi45IDEzNC4xIDQxMy40IDEzNS42IDQwOC43IDE0OC41IDQwMiIgc3R5bGU9ImZpbGw6IzAwMDBlZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMDMuNiAyOTguNCAzMzMuNCAyOTAuOCAzMzguNCAyODcuMyAzMDguMyAyOTUuMSAzMDMuNiAyOTguNCIgc3R5bGU9ImZpbGw6IzAyZThmNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNTMuNSAzMDYuNiAyODUuNCAyOTguOSAyODAuMiAyOTUuOSAyNDguMyAzMDMuNiAyNTMuNSAzMDYuNiIgc3R5bGU9ImZpbGw6IzAwZDRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMjEgNDE2LjMgMTE4LjUgNDE3LjcgMTA1LjUgNDE3IDEwNy40IDQxNS42IDEyMSA0MTYuMyIgc3R5bGU9ImZpbGw6IzAwMDBkMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzODUuNiAxNDguOCAzODggMTMyLjggMzgxLjYgMTMwLjYgMzc5LjQgMTQ2LjUgMzg1LjYgMTQ4LjgiIHN0eWxlPSJmaWxsOiNmZmM0MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjU3LjkgMjUxLjMgMjg1LjQgMjQ1LjMgMjg3IDI1NCAyNTkuNSAyNjAgMjU3LjkgMjUxLjMiIHN0eWxlPSJmaWxsOiM1M2ZmYTQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjM4LjcgMjkzLjcgMjcwLjggMjg2LjIgMjY2LjggMjc5LjcgMjM0LjYgMjg3LjEgMjM4LjcgMjkzLjciIHN0eWxlPSJmaWxsOiMwZmY4ZTciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzcyLjkgMTQ1LjggMzc1LjEgMTMwLjMgMzY4LjYgMTMxLjkgMzY2LjUgMTQ2LjkgMzcyLjkgMTQ1LjgiIHN0eWxlPSJmaWxsOiNmZmMxMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzk3LjMgMTk1LjYgNDA4LjggMTgyLjQgNDA1LjcgMTczLjMgMzk0LjIgMTg3IDM5Ny4zIDE5NS42IiBzdHlsZT0iZmlsbDojY2VmZjI5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM3OS40IDE0Ni41IDM4MS42IDEzMC43IDM3NS4xIDEzMC4zIDM3Mi45IDE0NS44IDM3OS40IDE0Ni41IiBzdHlsZT0iZmlsbDojZmZiZDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI1OC45IDMwOC4zIDI5MC43IDMwMC41IDI4NS40IDI5OC45IDI1My41IDMwNi42IDI1OC45IDMwOC4zIiBzdHlsZT0iZmlsbDojMDBkNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzOSAxNzEuOCAzNDguOCAxNjAgMzQ0IDE2Ny4zIDMzNC40IDE3OC4zIDMzOSAxNzEuOCIgc3R5bGU9ImZpbGw6I2YxZmMwNiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTAuNCA2Mi4zIDE1MC42IDcwIDE2MC42IDkxLjcgMTU5IDgzLjggMTUwLjQgNjIuMyIgc3R5bGU9ImZpbGw6I2ZmMmQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMzQuNiAyODcuMSAyNjYuOCAyNzkuNyAyNjMuMyAyNzIuMyAyMzEuMSAyNzkuNiAyMzQuNiAyODcuMSIgc3R5bGU9ImZpbGw6IzFjZmZkYiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNi41IDkwLjYgMTguNCAxMDUuNSAyOC4yIDg3LjYgMjYuMyA3Mi43IDE2LjUgOTAuNiIgc3R5bGU9ImZpbGw6I2ZmNGUwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODUuNyAxNzcuNCAxODkuMiAxODkuNyAxOTEuNyAyMTYuNiAxODguMSAyMDQuMiAxODUuNyAxNzcuNCIgc3R5bGU9ImZpbGw6I2M0ZmYzMyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTguNSAxNi43IDExMy41IDI0LjQgMTI2LjcgMzUuOSAxMjkuOCAyOC4zIDExOC41IDE2LjciIHN0eWxlPSJmaWxsOiM5YjAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNS45IDE4OC41IDkuOSAyMDIuOSAxMi44IDE3OS4xIDguOCAxNjQuMiA1LjkgMTg4LjUiIHN0eWxlPSJmaWxsOiNkNGZmMjMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzUuMyAzNDEuNiAzNi44IDM0Ni40IDI5LjQgMzI2LjMgMjcuNiAzMjAuNSAzNS4zIDM0MS42IiBzdHlsZT0iZmlsbDojMDA4Y2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM4MS4xIDIzNC45IDQwMC43IDIyNC40IDQwMC42IDIxNC42IDM4MC45IDIyNS42IDM4MS4xIDIzNC45IiBzdHlsZT0iZmlsbDojODdmZjcwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI2NC4zIDMwOC41IDI5NiAzMDAuNyAyOTAuNyAzMDAuNSAyNTguOSAzMDguMyAyNjQuMyAzMDguNSIgc3R5bGU9ImZpbGw6IzAwZDRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI3MyAxNS41IDY3IDI3LjIgODEuNyAyNS4zIDg2LjIgMTQuMSA3MyAxNS41IiBzdHlsZT0iZmlsbDojOGQwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMxMy42IDE5NS4xIDMzMC40IDE4NS45IDMyNy4zIDE5NC40IDMxMC43IDIwMyAzMTMuNiAxOTUuMSIgc3R5bGU9ImZpbGw6I2M0ZmYzMyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNTAuMSAyNjkuNiAzNzYgMjYxIDM3OC42IDI1Mi44IDM1Mi41IDI2MS44IDM1MC4xIDI2OS42IiBzdHlsZT0iZmlsbDojNDNmZmI0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMwOC4zIDI5NS4xIDMzOC40IDI4Ny4zIDM0Mi45IDI4Mi41IDMxMi42IDI5MC42IDMwOC4zIDI5NS4xIiBzdHlsZT0iZmlsbDojMGZmOGU3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE3MS42IDM2OS4xIDE3MC43IDM3Ny43IDE2MC4zIDM5MS41IDE2MC44IDM4My4zIDE3MS42IDM2OS4xIiBzdHlsZT0iZmlsbDojMDAyOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE5MC42IDI4Mi43IDE5MiAyOTYuNSAxODcuMSAzMTkuNSAxODUuNiAzMDYuMSAxOTAuNiAyODIuNyIgc3R5bGU9ImZpbGw6IzAyZThmNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyODUuOCAyMTguNyAzMDguNiAyMTEuNiAzMDcuNSAyMjAuNiAyODQuNyAyMjcuNCAyODUuOCAyMTguNyIgc3R5bGU9ImZpbGw6Izk0ZmY2MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOC44IDI4OC45IDIxLjcgMjk4IDE3LjkgMjc0LjggMTQuOSAyNjQuNyAxOC44IDI4OC45IiBzdHlsZT0iZmlsbDojMWNmZmRiIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijc5LjcgNDA1LjMgNzguNCA0MDQuMiA2Ni44IDM5NC4xIDY3LjQgMzk0LjYgNzkuNyA0MDUuMyIgc3R5bGU9ImZpbGw6Ymx1ZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNTcuMiAyNDIuNCAyODQuNiAyMzYuMyAyODUuMyAyNDUuMyAyNTcuOSAyNTEuMyAyNTcuMiAyNDIuNCIgc3R5bGU9ImZpbGw6IzY2ZmY5MCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI2Ny40IDM5NC42IDY2LjggMzk0LjEgNTYgMzgxLjMgNTYgMzgxIDY3LjQgMzk0LjYiIHN0eWxlPSJmaWxsOiMwMDEwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjMxLjEgMjc5LjYgMjYzLjMgMjcyLjMgMjYwLjYgMjY0LjIgMjI4LjMgMjcxLjQgMjMxLjEgMjc5LjYiIHN0eWxlPSJmaWxsOiMzMGZmYzciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzk0LjIgMTg3IDQwNS43IDE3My4zIDQwMS43IDE2NS4yIDM5MC4zIDE3OS4yIDM5NC4yIDE4NyIgc3R5bGU9ImZpbGw6I2U0ZmYxMyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDAuNiA0My43IDEzOS4yIDUxLjIgMTUwLjYgNzAgMTUwLjQgNjIuMyAxNDAuNiA0My43IiBzdHlsZT0iZmlsbDojZTgwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyOS44IDI4LjMgMTI2LjcgMzUuOSAxMzkuMiA1MS4yIDE0MC42IDQzLjcgMTI5LjggMjguMyIgc3R5bGU9ImZpbGw6I2IwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0MC40IDQzLjkgMzcuOSA1OC4yIDUxLjIgNDcuNSA1My4xIDMzLjQgNDAuNCA0My45IiBzdHlsZT0iZmlsbDojZDEwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM0NC4zIDE2Ni41IDM1NC4zIDE1NC4xIDM0OC44IDE2MCAzMzkgMTcxLjggMzQ0LjMgMTY2LjUiIHN0eWxlPSJmaWxsOiNmZWVkMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iOTIuNSA0MTIuOCA5MC41IDQxMS40IDc4LjQgNDA0LjIgNzkuNyA0MDUuMyA5Mi41IDQxMi44IiBzdHlsZT0iZmlsbDojMDAwMGYxIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2OSAxMTUuNiAxNzMuNyAxMjUuMiAxODAuOSAxNTAuOCAxNzUuNCAxNDEuMSAxNjkgMTE1LjYiIHN0eWxlPSJmaWxsOiNmZjlmMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjY5LjUgMzA3LjMgMzAxLjEgMjk5LjUgMjk2IDMwMC43IDI2NC4zIDMwOC41IDI2OS41IDMwNy4zIiBzdHlsZT0iZmlsbDojMDBkOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjU2IDM4MSA1NiAzODEuMyA0Ni4yIDM2NiA0NS43IDM2NC44IDU2IDM4MSIgc3R5bGU9ImZpbGw6IzAwMzhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzQuMSA0MTMuNCAxMzEuMSA0MTUgMTE4LjUgNDE3LjcgMTIwLjkgNDE2LjMgMTM0LjEgNDEzLjQiIHN0eWxlPSJmaWxsOiMwMDAwZTMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzgwLjkgMjI1LjYgNDAwLjYgMjE0LjYgMzk5LjQgMjA0LjkgMzc5LjcgMjE2LjMgMzgwLjkgMjI1LjYiIHN0eWxlPSJmaWxsOiM5ZGZmNWEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjI4LjMgMjcxLjQgMjYwLjYgMjY0LjIgMjU4LjYgMjU1LjcgMjI2LjMgMjYyLjcgMjI4LjMgMjcxLjQiIHN0eWxlPSJmaWxsOiM0M2ZmYjQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzkwLjMgMTc5LjIgNDAxLjcgMTY1LjIgMzk3IDE1OC4zIDM4NS43IDE3Mi42IDM5MC4zIDE3OS4yIiBzdHlsZT0iZmlsbDojZjRmODAyIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMxMi42IDI5MC42IDM0Mi45IDI4Mi41IDM0Ni44IDI3Ni41IDMxNi4zIDI4NC44IDMxMi42IDI5MC42IiBzdHlsZT0iZmlsbDojMWZmZmQ3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMxNy4zIDE4OC4xIDMzNC40IDE3OC4zIDMzMC40IDE4NS45IDMxMy42IDE5NS4xIDMxNy4zIDE4OC4xIiBzdHlsZT0iZmlsbDojZDdmZjFmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxNS40IDMxMi4xIDI0OC4zIDMwMy42IDI0My4zIDI5OS4yIDIxMC4yIDMwNy42IDIxNS40IDMxMi4xIiBzdHlsZT0iZmlsbDojMDBkOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM1Mi41IDI2MS44IDM3OC42IDI1Mi44IDM4MC4zIDI0NC4xIDM1NC4xIDI1My40IDM1Mi41IDI2MS44IiBzdHlsZT0iZmlsbDojNTZmZmEwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxMC4yIDMwNy42IDI0My4zIDI5OS4yIDIzOC43IDI5My43IDIwNS40IDMwMS44IDIxMC4yIDMwNy42IiBzdHlsZT0iZmlsbDojMDBlNGY4Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM1MCAxNjIuNyAzNjAuMiAxNDkuNyAzNTQuMyAxNTQuMSAzNDQuMyAxNjYuNiAzNTAgMTYyLjciIHN0eWxlPSJmaWxsOiNmZmRlMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjU3LjMgMjMzLjUgMjg0LjcgMjI3LjQgMjg0LjYgMjM2LjMgMjU3LjIgMjQyLjQgMjU3LjMgMjMzLjUiIHN0eWxlPSJmaWxsOiM3ZGZmN2EiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjg3LjcgMjEwLjUgMzEwLjcgMjAzIDMwOC42IDIxMS42IDI4NS44IDIxOC43IDI4Ny43IDIxMC41IiBzdHlsZT0iZmlsbDojYWFmZjRkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwNS41IDQxNyAxMDIuOCA0MTUuMyA5MC41IDQxMS40IDkyLjUgNDEyLjggMTA1LjUgNDE3IiBzdHlsZT0iZmlsbDojMDAwMGU4Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIyMC45IDMxNS4yIDI1My41IDMwNi42IDI0OC4zIDMwMy42IDIxNS40IDMxMi4xIDIyMC45IDMxNS4yIiBzdHlsZT0iZmlsbDojMDBkMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjkuMyAyMjcuNyAxMy4xIDI0MC4zIDEzLjcgMjE2LjMgOS45IDIwMi45IDkuMyAyMjcuNyIgc3R5bGU9ImZpbGw6Izk0ZmY2MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMDUuNCAzMDEuOCAyMzguNyAyOTMuNyAyMzQuNiAyODcuMSAyMDEuMiAyOTQuOSAyMDUuNCAzMDEuOCIgc3R5bGU9ImZpbGw6IzBjZjRlYiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNzQuNCAzMDQuNiAzMDYgMjk2LjkgMzAxLjEgMjk5LjUgMjY5LjUgMzA3LjMgMjc0LjQgMzA0LjYiIHN0eWxlPSJmaWxsOiMwMGU0ZjgiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTkxLjcgMjE2LjYgMTkzLjIgMjMxLjMgMTkzLjIgMjU3LjYgMTkxLjYgMjQzIDE5MS43IDIxNi42IiBzdHlsZT0iZmlsbDojODNmZjczIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwLjcgMTI2LjEgMTQuMSAxNDEuNSAyMS43IDEyMS4xIDE4LjQgMTA1LjUgMTAuNyAxMjYuMSIgc3R5bGU9ImZpbGw6I2ZmOTEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjAuMyAzOTEuNSAxNTcuOSAzOTYuOSAxNDYuNSA0MDYuOSAxNDguNSA0MDIgMTYwLjMgMzkxLjUiIHN0eWxlPSJmaWxsOiMwMDA4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzg1LjcgMTcyLjYgMzk3IDE1OC4zIDM5MS42IDE1Mi44IDM4MC40IDE2Ny4xIDM4NS43IDE3Mi42IiBzdHlsZT0iZmlsbDojZmZlNjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIyNi40IDMxNi45IDI1OC45IDMwOC4zIDI1My41IDMwNi42IDIyMC45IDMxNS4yIDIyNi40IDMxNi45IiBzdHlsZT0iZmlsbDojMGNmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4Ny4xIDMxOS41IDE4Ny42IDMzMS40IDE4MC42IDM1MS42IDE3OS45IDM0MC4yIDE4Ny4xIDMxOS41IiBzdHlsZT0iZmlsbDojMDBhMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI3LjYgMzIwLjUgMjkuNCAzMjYuMyAyMy44IDMwNC45IDIxLjcgMjk4IDI3LjYgMzIwLjUiIHN0eWxlPSJmaWxsOiMwY2YiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzU2LjEgMTYwLjQgMzY2LjUgMTQ2LjkgMzYwLjIgMTQ5LjcgMzUwIDE2Mi43IDM1Ni4xIDE2MC40IiBzdHlsZT0iZmlsbDojZmZkMzAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQ1LjcgMzY0LjggNDYuMiAzNjYgMzcuOCAzNDguNiAzNi44IDM0Ni40IDQ1LjcgMzY0LjgiIHN0eWxlPSJmaWxsOiMwMDY0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjAxLjIgMjk0LjkgMjM0LjYgMjg3LjEgMjMxLjEgMjc5LjYgMTk3LjUgMjg3LjIgMjAxLjIgMjk0LjkiIHN0eWxlPSJmaWxsOiMxY2ZmZGIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjI2LjMgMjYyLjcgMjU4LjYgMjU1LjcgMjU3LjUgMjQ2LjggMjI1IDI1My44IDIyNi4zIDI2Mi43IiBzdHlsZT0iZmlsbDojNWFmZjlkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijg2LjIgMTQuMSA4MS43IDI1LjMgOTYuOSAyNy44IDk5LjggMTcuMSA4Ni4yIDE0LjEiIHN0eWxlPSJmaWxsOm1hcm9vbiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNzkuNyAyMTYuMyAzOTkuNCAyMDQuOSAzOTcuMyAxOTUuNiAzNzcuNyAyMDcuNCAzNzkuNyAyMTYuMyIgc3R5bGU9ImZpbGw6I2I0ZmY0MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzODAuNCAxNjcuMSAzOTEuNiAxNTIuOCAzODUuNiAxNDguOCAzNzQuNyAxNjMuMSAzODAuNCAxNjcuMSIgc3R5bGU9ImZpbGw6I2ZmZGIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMjEuOCAxODIuMSAzMzkgMTcxLjggMzM0LjQgMTc4LjMgMzE3LjMgMTg4LjEgMzIxLjggMTgyLjEiIHN0eWxlPSJmaWxsOiNlN2ZmMGYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzYyLjQgMTU5LjcgMzcyLjkgMTQ1LjggMzY2LjUgMTQ2LjkgMzU2LjEgMTYwLjQgMzYyLjQgMTU5LjciIHN0eWxlPSJmaWxsOiNmZmQwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjMyIDMxNy4yIDI2NC4zIDMwOC41IDI1OC45IDMwOC4zIDIyNi40IDMxNyAyMzIgMzE3LjIiIHN0eWxlPSJmaWxsOiMwMGQwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzE2LjMgMjg0LjggMzQ2LjggMjc2LjUgMzUwLjEgMjY5LjYgMzE5LjMgMjc4LjEgMzE2LjMgMjg0LjgiIHN0eWxlPSJmaWxsOiMzMGZmYzciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzc0LjcgMTYzLjEgMzg1LjYgMTQ4LjggMzc5LjQgMTQ2LjQgMzY4LjYgMTYwLjYgMzc0LjcgMTYzLjEiIHN0eWxlPSJmaWxsOiNmZmQwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzY4LjYgMTYwLjYgMzc5LjQgMTQ2LjUgMzcyLjkgMTQ1LjggMzYyLjQgMTU5LjcgMzY4LjYgMTYwLjYiIHN0eWxlPSJmaWxsOiNmYzAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzU0LjEgMjUzLjQgMzgwLjMgMjQ0LjEgMzgxLjEgMjM0LjkgMzU0LjggMjQ0LjUgMzU0LjEgMjUzLjQiIHN0eWxlPSJmaWxsOiM2ZGZmOGEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjU4LjMgMjI1IDI4NS44IDIxOC43IDI4NC43IDIyNy40IDI1Ny4zIDIzMy42IDI1OC4zIDIyNSIgc3R5bGU9ImZpbGw6Izk0ZmY2MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyOTAuNSAyMDMgMzEzLjYgMTk1LjEgMzEwLjcgMjAzIDI4Ny43IDIxMC41IDI5MC41IDIwMyIgc3R5bGU9ImZpbGw6I2MxZmYzNiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNzguOSAzMDAuNyAzMTAuNSAyOTMgMzA2IDI5Ni45IDI3NC40IDMwNC42IDI3OC45IDMwMC43IiBzdHlsZT0iZmlsbDojMGNmNGViIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE5Ny41IDI4Ny4yIDIzMS4xIDI3OS42IDIyOC4zIDI3MS40IDE5NC41IDI3OC42IDE5Ny41IDI4Ny4yIiBzdHlsZT0iZmlsbDojMmNmZmNhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2MC42IDkxLjcgMTY0LjUgMTAxLjMgMTczLjcgMTI1LjIgMTY5IDExNS42IDE2MC42IDkxLjciIHN0eWxlPSJmaWxsOiNmZjYwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTgwLjggMTUwLjggMTg0LjIgMTYzLjIgMTg5LjIgMTg5LjcgMTg1LjcgMTc3LjQgMTgwLjggMTUwLjgiIHN0eWxlPSJmaWxsOiNmZmU2MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTE4LjUgNDE3LjggMTE1IDQxNiAxMDIuOCA0MTUuMyAxMDUuNSA0MTcgMTE4LjUgNDE3LjgiIHN0eWxlPSJmaWxsOiMwMDAwZWQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQuOSAyNjQuNyAxNy45IDI3NC44IDE2LjIgMjUxLjQgMTMuMSAyNDAuMyAxNC45IDI2NC43IiBzdHlsZT0iZmlsbDojNTZmZmEwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIyNSAyNTMuOCAyNTcuNSAyNDYuOCAyNTcuMSAyMzcuOSAyMjQuNyAyNDQuNyAyMjUgMjUzLjgiIHN0eWxlPSJmaWxsOiM2ZGZmOGEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjM3LjQgMzE1LjkgMjY5LjUgMzA3LjMgMjY0LjMgMzA4LjUgMjMyIDMxNy4yIDIzNy40IDMxNS45IiBzdHlsZT0iZmlsbDojMDBkNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI2LjMgNzIuNyAyOC4yIDg3LjcgMzkuOCA3My4yIDM3LjkgNTguMiAyNi4zIDcyLjciIHN0eWxlPSJmaWxsOiNmZjFhMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzc3LjcgMjA3LjQgMzk3LjMgMTk1LjYgMzk0LjIgMTg3IDM3NC43IDE5OS4xIDM3Ny43IDIwNy40IiBzdHlsZT0iZmlsbDojY2FmZjJjIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijc4LjQgNDA0LjIgNzcuMSA0MDAuNCA2Ni4yIDM5MC45IDY2LjggMzk0LjEgNzguNCA0MDQuMiIgc3R5bGU9ImZpbGw6IzAwMGNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDYuNSA0MDYuOSAxNDIuOSA0MDguOCAxMzEuMSA0MTUgMTM0LjEgNDEzLjQgMTQ2LjUgNDA2LjkiIHN0eWxlPSJmaWxsOmJsdWUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTgzLjYgMzIxLjQgMjE1LjQgMzEyLjEgMjEwLjIgMzA3LjYgMTc4LjEgMzE2LjYgMTgzLjYgMzIxLjQiIHN0eWxlPSJmaWxsOiMwMGQwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc4LjEgMzE2LjYgMjEwLjIgMzA3LjYgMjA1LjQgMzAxLjggMTczIDMxMC41IDE3OC4xIDMxNi42IiBzdHlsZT0iZmlsbDojMDBkY2ZlIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjY2LjggMzk0LjEgNjYuMiAzOTAuOSA1Ni4xIDM3OC44IDU2IDM4MS4zIDY2LjggMzk0LjEiIHN0eWxlPSJmaWxsOiMwMDI4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzI2LjggMTc3LjQgMzQ0LjMgMTY2LjUgMzM5IDE3MS44IDMyMS44IDE4Mi4xIDMyNi44IDE3Ny40IiBzdHlsZT0iZmlsbDojZjhmNTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjUzLjEgMzMuNCA1MS4yIDQ3LjUgNjUuNyA0MC45IDY3IDI3LjIgNTMuMSAzMy40IiBzdHlsZT0iZmlsbDojYTQwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4OS4zIDMyNC44IDIyMC45IDMxNS4yIDIxNS40IDMxMi4xIDE4My42IDMyMS40IDE4OS4zIDMyNC44IiBzdHlsZT0iZmlsbDojMDBjOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4MC42IDM1MS42IDE3OS41IDM2MC44IDE3MC43IDM3Ny43IDE3MS42IDM2OS4xIDE4MC42IDM1MS42IiBzdHlsZT0iZmlsbDojMDA2NGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjguOCAxNjQuMiAxMi44IDE3OS4xIDE4IDE1Ni45IDE0LjEgMTQxLjUgOC44IDE2NC4yIiBzdHlsZT0iZmlsbDpnb2xkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM2LjcgMzQ2LjQgMzcuOCAzNDguNiAzMC44IDMyOS42IDI5LjQgMzI2LjMgMzYuNyAzNDYuNCIgc3R5bGU9ImZpbGw6IzAwOThmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTQuNSAyNzguNiAyMjguMyAyNzEuNCAyMjYuMyAyNjIuNyAxOTIuNCAyNjkuNiAxOTQuNSAyNzguNiIgc3R5bGU9ImZpbGw6IzQzZmZiNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzMgMzEwLjUgMjA1LjQgMzAxLjggMjAxLjIgMjk0LjkgMTY4LjQgMzAzLjIgMTczIDMxMC41IiBzdHlsZT0iZmlsbDojMDZlY2YxIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjkwLjUgNDExLjQgODguNCA0MDcuMSA3Ny4xIDQwMC40IDc4LjQgNDA0LjIgOTAuNSA0MTEuNCIgc3R5bGU9ImZpbGw6Ymx1ZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMTkuMyAyNzguMSAzNTAgMjY5LjYgMzUyLjUgMjYxLjggMzIxLjYgMjcwLjUgMzE5LjMgMjc4LjEiIHN0eWxlPSJmaWxsOiM0M2ZmYjQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzU0LjggMjQ0LjUgMzgxLjEgMjM0LjkgMzgwLjkgMjI1LjYgMzU0LjYgMjM1LjUgMzU0LjggMjQ0LjUiIHN0eWxlPSJmaWxsOiM4M2ZmNzMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iOTkuOCAxNy4xIDk2LjkgMjcuOCAxMTIuMSAzNC44IDExMy41IDI0LjQgOTkuOCAxNy4xIiBzdHlsZT0iZmlsbDojODQwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI4Mi45IDI5NS40IDMxNC41IDI4Ny44IDMxMC41IDI5MyAyNzguOSAzMDAuNyAyODIuOSAyOTUuNCIgc3R5bGU9ImZpbGw6IzE5ZmZkZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTMuMSAyNTcuNiAxOTQuNiAyNzEuNyAxOTIgMjk2LjUgMTkwLjYgMjgyLjcgMTkzLjEgMjU3LjYiIHN0eWxlPSJmaWxsOiM0MGZmYjciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTk1LjIgMzI2LjYgMjI2LjQgMzE3IDIyMC45IDMxNS4yIDE4OS4zIDMyNC44IDE5NS4yIDMyNi42IiBzdHlsZT0iZmlsbDojMDBjNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI5NCAxOTYuNCAzMTcuMyAxODguMSAzMTMuNiAxOTUuMSAyOTAuNSAyMDMgMjk0IDE5Ni40IiBzdHlsZT0iZmlsbDojZDRmZjIzIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI2MC4xIDIxNyAyODcuNyAyMTAuNSAyODUuOCAyMTguNyAyNTguMyAyMjUgMjYwLjEgMjE3IiBzdHlsZT0iZmlsbDojYWFmZjRkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjU2IDM4MS4zIDU2LjEgMzc4LjggNDYuOSAzNjQuNSA0Ni4yIDM2NiA1NiAzODEuMyIgc3R5bGU9ImZpbGw6IzAwNGNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNDIuNSAzMTMuMiAyNzQuNCAzMDQuNiAyNjkuNSAzMDcuMyAyMzcuNCAzMTUuOSAyNDIuNSAzMTMuMiIgc3R5bGU9ImZpbGw6IzAwZTBmYiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjguNCAzMDMuMiAyMDEuMiAyOTQuOSAxOTcuNSAyODcuMiAxNjQuNSAyOTUgMTY4LjQgMzAzLjIiIHN0eWxlPSJmaWxsOiMxNmZmZTEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzc0LjcgMTk5LjEgMzk0LjIgMTg3IDM5MC4zIDE3OS4yIDM3MC45IDE5MS42IDM3NC43IDE5OS4xIiBzdHlsZT0iZmlsbDojZGVmZjE5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1MC42IDcwIDE1My40IDc5LjcgMTY0LjUgMTAxLjMgMTYwLjYgOTEuNyAxNTAuNiA3MCIgc3R5bGU9ImZpbGw6I2ZmMjkwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzIuMyAxNzQuMSAzNTAgMTYyLjcgMzQ0LjMgMTY2LjUgMzI2LjggMTc3LjQgMzMyLjMgMTc0LjEiIHN0eWxlPSJmaWxsOiNmZmVhMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjI0LjcgMjQ0LjcgMjU3LjEgMjM3LjkgMjU3LjcgMjI5LjIgMjI1LjIgMjM1LjkgMjI0LjcgMjQ0LjciIHN0eWxlPSJmaWxsOiM4M2ZmNzMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjEuNyAyOTggMjMuOCAzMDQuOSAyMC4yIDI4Mi44IDE3LjkgMjc0LjggMjEuNyAyOTgiIHN0eWxlPSJmaWxsOiMxZmZmZDciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTAyLjggNDE1LjMgOTkuOSA0MTAuOCA4OC40IDQwNy4xIDkwLjUgNDExLjQgMTAyLjggNDE1LjMiIHN0eWxlPSJmaWxsOmJsdWUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjAxLjEgMzI2LjkgMjMyIDMxNy4yIDIyNi40IDMxNi45IDE5NS4yIDMyNi42IDIwMS4xIDMyNi45IiBzdHlsZT0iZmlsbDojMDBjNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE5Mi40IDI2OS42IDIyNi4zIDI2Mi43IDIyNSAyNTMuOCAxOTEuMSAyNjAuMyAxOTIuNCAyNjkuNiIgc3R5bGU9ImZpbGw6IzU2ZmZhMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzEuMSA0MTUgMTI2LjkgNDEzLjQgMTE1IDQxNiAxMTguNSA0MTcuOCAxMzEuMSA0MTUiIHN0eWxlPSJmaWxsOmJsdWUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTY0LjUgMjk1IDE5Ny41IDI4Ny4yIDE5NC41IDI3OC42IDE2MS4zIDI4NS45IDE2NC41IDI5NSIgc3R5bGU9ImZpbGw6IzI5ZmZjZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNzAuOSAxOTEuNiAzOTAuMyAxNzkuMiAzODUuNyAxNzIuNiAzNjYuNSAxODUgMzcwLjkgMTkxLjYiIHN0eWxlPSJmaWxsOiNlZWZmMDkiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTEzLjQgMjQuNCAxMTIuMSAzNC44IDEyNi44IDQ2IDEyNi43IDM1LjkgMTEzLjQgMjQuNCIgc3R5bGU9ImZpbGw6IzkyMDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzAuNyAzNzcuNyAxNjcuOSAzODMuNiAxNTcuOSAzOTYuOSAxNjAuMyAzOTEuNSAxNzAuNyAzNzcuNyIgc3R5bGU9ImZpbGw6IzAwMzhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMzguMSAxNzIuMiAzNTYuMSAxNjAuNCAzNTAgMTYyLjcgMzMyLjMgMTc0LjEgMzM4LjEgMTcyLjIiIHN0eWxlPSJmaWxsOiNmZmRlMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzU0LjYgMjM1LjUgMzgwLjkgMjI1LjYgMzc5LjcgMjE2LjMgMzUzLjUgMjI2LjUgMzU0LjYgMjM1LjUiIHN0eWxlPSJmaWxsOiM5YWZmNWQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDYuMiAzNjYgNDYuOSAzNjQuNSAzOSAzNDguMiAzNy44IDM0OC42IDQ2LjIgMzY2IiBzdHlsZT0iZmlsbDojMDA3NGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyMS42IDI3MC41IDM1Mi41IDI2MS44IDM1NC4xIDI1My40IDMyMy4xIDI2Mi4yIDMyMS42IDI3MC41IiBzdHlsZT0iZmlsbDojNWFmZjlkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1NC40IDMzMS42IDE4My42IDMyMS40IDE3OC4xIDMxNi42IDE0OC41IDMyNi40IDE1NC40IDMzMS42IiBzdHlsZT0iZmlsbDojMDBjNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0OC41IDMyNi40IDE3OC4xIDMxNi42IDE3MyAzMTAuNSAxNDMgMzE5LjggMTQ4LjUgMzI2LjQiIHN0eWxlPSJmaWxsOiMwMGQwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iOS45IDIwMi45IDEzLjcgMjE2LjMgMTYuNSAxOTMuMiAxMi44IDE3OS4xIDkuOSAyMDIuOSIgc3R5bGU9ImZpbGw6I2QxZmYyNiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyOTguMiAxOTAuOSAzMjEuOCAxODIuMSAzMTcuMyAxODguMSAyOTQgMTk2LjQgMjk4LjIgMTkwLjkiIHN0eWxlPSJmaWxsOiNlNGZmMTMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTM5LjIgNTEuMiAxNDAuNyA2MS4xIDE1My40IDc5LjcgMTUwLjYgNzAgMTM5LjIgNTEuMiIgc3R5bGU9ImZpbGw6I2RmMDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyODYuMyAyODkuMSAzMTcuOSAyODEuNiAzMTQuNSAyODcuOCAyODIuOSAyOTUuNCAyODYuMyAyODkuMSIgc3R5bGU9ImZpbGw6IzI5ZmZjZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODkuMiAxODkuNyAxOTAuNyAyMDQuNSAxOTMuMiAyMzEuMyAxOTEuNyAyMTYuNiAxODkuMiAxODkuNyIgc3R5bGU9ImZpbGw6I2M0ZmYzMyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjAuNyAzMzUuMiAxODkuMyAzMjQuOCAxODMuNiAzMjEuNCAxNTQuNCAzMzEuNiAxNjAuNyAzMzUuMiIgc3R5bGU9ImZpbGw6IzAwYmNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNDcuMSAzMDkuMSAyNzguOSAzMDAuNyAyNzQuNCAzMDQuNiAyNDIuNSAzMTMuMiAyNDcuMSAzMDkuMSIgc3R5bGU9ImZpbGw6IzA5ZjBlZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNjIuNiAyMDkuNyAyOTAuNSAyMDMgMjg3LjcgMjEwLjUgMjYwLjEgMjE3IDI2Mi42IDIwOS43IiBzdHlsZT0iZmlsbDojYmVmZjM5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyNi43IDM1LjkgMTI2LjggNDYgMTQwLjcgNjEuMSAxMzkuMiA1MS4yIDEyNi43IDM1LjkiIHN0eWxlPSJmaWxsOiNiMjAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjA2LjggMzI1LjUgMjM3LjQgMzE1LjkgMjMyIDMxNy4yIDIwMS4xIDMyNi45IDIwNi44IDMyNS41IiBzdHlsZT0iZmlsbDojMGNmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0MyAzMTkuOCAxNzMgMzEwLjUgMTY4LjQgMzAzLjIgMTM4LjEgMzExLjkgMTQzIDMxOS44IiBzdHlsZT0iZmlsbDojMDBlMGZiIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM2Ni41IDE4NSAzODUuNyAxNzIuNiAzODAuNCAxNjcuMSAzNjEuNCAxNzkuNyAzNjYuNSAxODUiIHN0eWxlPSJmaWxsOiNmYmYxMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTguNCAxMDUuNSAyMS43IDEyMS4xIDMxLjQgMTAzLjYgMjguMiA4Ny43IDE4LjQgMTA1LjUiIHN0eWxlPSJmaWxsOiNmZjUyMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzQ0LjEgMTcxLjggMzYyLjQgMTU5LjcgMzU2LjEgMTYwLjQgMzM4LjEgMTcyLjIgMzQ0LjEgMTcxLjgiIHN0eWxlPSJmaWxsOiNmZmRiMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTczLjcgMTI1LjIgMTc2LjggMTM3LjYgMTg0LjIgMTYzLjIgMTgwLjggMTUwLjggMTczLjcgMTI1LjIiIHN0eWxlPSJmaWxsOiNmZjlmMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjkuNCAzMjYuMyAzMC44IDMyOS42IDI1LjUgMzA5LjQgMjMuOCAzMDQuOSAyOS40IDMyNi4zIiBzdHlsZT0iZmlsbDojMDBkNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijc3LjEgNDAwLjQgNzYuOCAzOTQgNjYuNyAzODUuMiA2Ni4yIDM5MC45IDc3LjEgNDAwLjQiIHN0eWxlPSJmaWxsOiMwMDI4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTY3IDMzNy4yIDE5NS4yIDMyNi42IDE4OS4zIDMyNC44IDE2MC43IDMzNS4yIDE2NyAzMzcuMiIgc3R5bGU9ImZpbGw6IzAwYjhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMjUuMiAyMzUuOSAyNTcuNyAyMjkuMiAyNTkuMSAyMjAuOSAyMjYuNSAyMjcuNSAyMjUuMiAyMzUuOSIgc3R5bGU9ImZpbGw6IzlhZmY1ZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTIgMjk2LjUgMTkyLjQgMzA4LjggMTg3LjYgMzMxLjQgMTg3LjEgMzE5LjUgMTkyIDI5Ni41IiBzdHlsZT0iZmlsbDojMDJlOGY0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjY2LjIgMzkwLjkgNjYuNyAzODUuMiA1Ny4zIDM3NCA1Ni4xIDM3OC44IDY2LjIgMzkwLjkiIHN0eWxlPSJmaWxsOiMwMDQwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTkxLjEgMjYwLjMgMjI1IDI1My44IDIyNC43IDI0NC43IDE5MC42IDI1MC45IDE5MS4xIDI2MC4zIiBzdHlsZT0iZmlsbDojNmRmZjhhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2MS4zIDI4NS45IDE5NC41IDI3OC42IDE5Mi40IDI2OS42IDE1OSAyNzYuMyAxNjEuMyAyODUuOSIgc3R5bGU9ImZpbGw6IzQwZmZiNyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNjEuNCAxNzkuNiAzODAuNCAxNjcuMSAzNzQuNyAxNjMuMSAzNTUuOSAxNzUuNiAzNjEuNCAxNzkuNiIgc3R5bGU9ImZpbGw6I2ZmZTYwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNTAuMSAxNzMgMzY4LjYgMTYwLjYgMzYyLjQgMTU5LjcgMzQ0LjEgMTcxLjggMzUwLjEgMTczIiBzdHlsZT0iZmlsbDpnb2xkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjExNSA0MTYgMTExLjQgNDExLjQgOTkuOSA0MTAuOCAxMDIuOCA0MTUuMyAxMTUgNDE2IiBzdHlsZT0iZmlsbDpibHVlIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM1NS45IDE3NS42IDM3NC43IDE2My4xIDM2OC42IDE2MC42IDM1MC4xIDE3Mi45IDM1NS45IDE3NS42IiBzdHlsZT0iZmlsbDojZmZkYjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzOCAzMTEuOSAxNjguNCAzMDMuMiAxNjQuNSAyOTUgMTMzLjggMzAzIDEzOCAzMTEuOSIgc3R5bGU9ImZpbGw6IzBmZjhlNyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4OC40IDQwNy4xIDg3LjQgNDAwLjIgNzYuOCAzOTQgNzcuMSA0MDAuNCA4OC40IDQwNy4xIiBzdHlsZT0iZmlsbDojMDAxOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjY3IDI3LjIgNjUuNyA0MSA4MS4xIDM4LjggODEuNyAyNS4zIDY3IDI3LjIiIHN0eWxlPSJmaWxsOiM4OTAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTU3LjkgMzk2LjkgMTUzLjcgMzk5LjIgMTQyLjkgNDA4LjggMTQ2LjUgNDA2LjkgMTU3LjkgMzk2LjkiIHN0eWxlPSJmaWxsOiMwMDE4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzUzLjQgMjI2LjUgMzc5LjcgMjE2LjMgMzc3LjcgMjA3LjQgMzUxLjQgMjE3LjggMzUzLjQgMjI2LjUiIHN0eWxlPSJmaWxsOiNiMWZmNDYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzAzIDE4Ni41IDMyNi44IDE3Ny40IDMyMS44IDE4Mi4xIDI5OC4yIDE5MC45IDMwMyAxODYuNSIgc3R5bGU9ImZpbGw6I2YxZmMwNiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI1Ni4xIDM3OC44IDU3LjMgMzc0IDQ4LjggMzYwLjcgNDYuOSAzNjQuNSA1Ni4xIDM3OC44IiBzdHlsZT0iZmlsbDojMDA2MGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyMy4xIDI2Mi4yIDM1NC4xIDI1My40IDM1NC44IDI0NC41IDMyMy43IDI1My41IDMyMy4xIDI2Mi4yIiBzdHlsZT0iZmlsbDojNmRmZjhhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE3My4zIDMzNy41IDIwMS4xIDMyNi45IDE5NS4yIDMyNi42IDE2NyAzMzcuMiAxNzMuMyAzMzcuNSIgc3R5bGU9ImZpbGw6IzAwYjhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMy4xIDI0MC4zIDE2LjIgMjUxLjQgMTYuNyAyMjguMyAxMy42IDIxNi4zIDEzLjEgMjQwLjMiIHN0eWxlPSJmaWxsOiM5NGZmNjMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjEyLjIgMzIyLjYgMjQyLjUgMzEzLjIgMjM3LjQgMzE1LjkgMjA2LjggMzI1LjUgMjEyLjIgMzIyLjYiIHN0eWxlPSJmaWxsOiMwMGQ4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTI5LjQgMzQyLjQgMTU0LjQgMzMxLjYgMTQ4LjUgMzI2LjQgMTIyLjkgMzM2LjcgMTI5LjQgMzQyLjQiIHN0eWxlPSJmaWxsOiMwMGI0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjg5IDI4MS44IDMyMC41IDI3NC40IDMxNy45IDI4MS42IDI4Ni4zIDI4OS4xIDI4OSAyODEuOCIgc3R5bGU9ImZpbGw6IzNjZmZiYSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNTEuMyAzMDMuNiAyODIuOSAyOTUuNCAyNzguOSAzMDAuNyAyNDcuMSAzMDkuMSAyNTEuMyAzMDMuNiIgc3R5bGU9ImZpbGw6IzE2ZmZlMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMjIuOSAzMzYuNyAxNDguNSAzMjYuNCAxNDMgMzE5LjggMTE2LjkgMzI5LjUgMTIyLjkgMzM2LjciIHN0eWxlPSJmaWxsOiMwMGMwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzcuNyAzNDguNiAzOSAzNDguMiAzMi41IDMzMC40IDMwLjggMzI5LjYgMzcuNyAzNDguNiIgc3R5bGU9ImZpbGw6IzAwYThmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNjYgMjAzLjMgMjk0IDE5Ni40IDI5MC41IDIwMyAyNjIuNiAyMDkuNyAyNjYgMjAzLjMiIHN0eWxlPSJmaWxsOiNkMWZmMjYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzggNTguMiAzOS44IDczLjIgNTMgNjIuNiA1MS4yIDQ3LjUgMzggNTguMiIgc3R5bGU9ImZpbGw6I2QxMDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzYuMiAzNDYuMyAxNjAuNyAzMzUuMiAxNTQuNCAzMzEuNiAxMjkuNCAzNDIuNCAxMzYuMiAzNDYuMyIgc3R5bGU9ImZpbGw6IzAwYThmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzMuOCAzMDMgMTY0LjUgMjk1IDE2MS4zIDI4NS45IDEzMC4zIDI5My4zIDEzMy44IDMwMyIgc3R5bGU9ImZpbGw6IzIzZmZkNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI5OS45IDQxMC44IDk4LjEgNDAzLjYgODcuNCA0MDAuMiA4OC40IDQwNyA5OS45IDQxMC44IiBzdHlsZT0iZmlsbDojMDAxMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjExNi45IDMyOS41IDE0MyAzMTkuOCAxMzggMzExLjkgMTExLjUgMzIxIDExNi45IDMyOS41IiBzdHlsZT0iZmlsbDojMDBkNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1OSAyNzYuMyAxOTIuNCAyNjkuNiAxOTEuMSAyNjAuMyAxNTcuNSAyNjYuNCAxNTkgMjc2LjMiIHN0eWxlPSJmaWxsOiM1NmZmYTAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQyLjkgNDA4LjggMTM4LjEgNDA3LjUgMTI2LjkgNDEzLjQgMTMxLjEgNDE1IDE0Mi45IDQwOC44IiBzdHlsZT0iZmlsbDojMDAwOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE5MC42IDI1MC45IDIyNC43IDI0NC43IDIyNS4yIDIzNS45IDE5MS4xIDI0MS43IDE5MC42IDI1MC45IiBzdHlsZT0iZmlsbDojODNmZjczIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIyNi41IDIyNy41IDI1OS4xIDIyMC45IDI2MS4zIDIxMy4yIDIyOC43IDIxOS42IDIyNi41IDIyNy41IiBzdHlsZT0iZmlsbDojYjFmZjQ2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM1MS40IDIxNy44IDM3Ny43IDIwNy40IDM3NC43IDE5OS4xIDM0OC42IDIwOS42IDM1MS40IDIxNy44IiBzdHlsZT0iZmlsbDojYzRmZjMzIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0My4xIDM0OC41IDE2NyAzMzcuMiAxNjAuNyAzMzUuMiAxMzYuMiAzNDYuMyAxNDMuMSAzNDguNSIgc3R5bGU9ImZpbGw6IzAwYThmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMDguMiAxODMuNiAzMzIuMyAxNzQuMSAzMjYuOCAxNzcuNCAzMDMgMTg2LjUgMzA4LjIgMTgzLjYiIHN0eWxlPSJmaWxsOiNmZWVkMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTg3LjYgMzMxLjQgMTg2LjMgMzQxLjIgMTc5LjUgMzYwLjggMTgwLjYgMzUxLjYgMTg3LjYgMzMxLjQiIHN0eWxlPSJmaWxsOiMwMGE4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc5LjQgMzM2IDIwNi44IDMyNS41IDIwMS4xIDMyNi45IDE3My4zIDMzNy41IDE3OS40IDMzNiIgc3R5bGU9ImZpbGw6IzAwYzBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI3Ni44IDM5NCA3OC45IDM4NS42IDY5LjYgMzc3LjUgNjYuNyAzODUuMiA3Ni44IDM5NCIgc3R5bGU9ImZpbGw6IzAwNDBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0Ni45IDM2NC41IDQ4LjggMzYwLjcgNDEuNSAzNDUuNSAzOSAzNDguMiA0Ni45IDM2NC41IiBzdHlsZT0iZmlsbDojMDhmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE3LjkgMjc0LjggMjAuMiAyODIuOCAxOC42IDI2MC41IDE2LjIgMjUxLjQgMTcuOSAyNzQuOCIgc3R5bGU9ImZpbGw6IzVhZmY5ZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI2Ni43IDM4NS4yIDY5LjYgMzc3LjUgNjAuOSAzNjcuMSA1Ny4zIDM3NCA2Ni43IDM4NS4yIiBzdHlsZT0iZmlsbDojMDA1OGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0LjEgMTQxLjUgMTggMTU2LjkgMjUuNSAxMzcgMjEuNyAxMjEuMSAxNC4xIDE0MS41IiBzdHlsZT0iZmlsbDojZmY5NDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjExMS41IDMyMSAxMzguMSAzMTEuOSAxMzMuOCAzMDMgMTA2LjggMzExLjMgMTExLjUgMzIxIiBzdHlsZT0iZmlsbDojMDZlY2YxIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwOS4yIDM1My42IDEyOS40IDM0Mi40IDEyMi45IDMzNi43IDEwMi4xIDM0Ny40IDEwOS4yIDM1My42IiBzdHlsZT0iZmlsbDojMDBhMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxNy4xIDMxOC4zIDI0Ny4xIDMwOS4xIDI0Mi41IDMxMy4yIDIxMi4yIDMyMi43IDIxNy4xIDMxOC4zIiBzdHlsZT0iZmlsbDojMDJlOGY0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwMi4xIDM0Ny40IDEyMi45IDMzNi43IDExNi45IDMyOS41IDk1LjUgMzM5LjUgMTAyLjEgMzQ3LjQiIHN0eWxlPSJmaWxsOiMwMGIwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTkzLjIgMjMxLjMgMTk0LjcgMjQ1LjcgMTk0LjYgMjcxLjYgMTkzLjEgMjU3LjYgMTkzLjIgMjMxLjMiIHN0eWxlPSJmaWxsOiM4M2ZmNzMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iODcuNCA0MDAuMiA4OC42IDM5MS4zIDc4LjkgMzg1LjYgNzYuOCAzOTQgODcuNCA0MDAuMiIgc3R5bGU9ImZpbGw6IzAwMzRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMjMuNyAyNTMuNSAzNTQuOCAyNDQuNSAzNTQuNiAyMzUuNSAzMjMuNSAyNDQuNSAzMjMuNyAyNTMuNSIgc3R5bGU9ImZpbGw6IzgzZmY3MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMjYuOSA0MTMuNCAxMjIuNSA0MDguOSAxMTEuNCA0MTEuNCAxMTUgNDE2IDEyNi45IDQxMy40IiBzdHlsZT0iZmlsbDojMDAwOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzMC4zIDI5My4zIDE2MS4zIDI4NS45IDE1OSAyNzYuMyAxMjcuOCAyODIuOSAxMzAuMyAyOTMuMyIgc3R5bGU9ImZpbGw6IzM5ZmZiZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjQuNSAxMDEuMyAxNjcuMiAxMTMuNyAxNzYuOCAxMzcuNiAxNzMuNyAxMjUuMiAxNjQuNSAxMDEuMyIgc3R5bGU9ImZpbGw6I2ZmNjAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTYuNiAzNTcuOSAxMzYuMiAzNDYuMyAxMjkuNCAzNDIuNCAxMDkuMiAzNTMuNiAxMTYuNiAzNTcuOSIgc3R5bGU9ImZpbGw6IzAwOTRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNjkuOSAxOTcuOSAyOTguMiAxOTAuOSAyOTQgMTk2LjQgMjY2IDIwMy4zIDI2OS45IDE5Ny45IiBzdHlsZT0iZmlsbDojZTFmZjE2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI1NC43IDI5Ny4xIDI4Ni4zIDI4OS4xIDI4Mi45IDI5NS40IDI1MS4zIDMwMy43IDI1NC43IDI5Ny4xIiBzdHlsZT0iZmlsbDojMjlmZmNlIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI5MC44IDI3My43IDMyMi40IDI2Ni40IDMyMC41IDI3NC40IDI4OSAyODEuOCAyOTAuOCAyNzMuNyIgc3R5bGU9ImZpbGw6IzUzZmZhNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI1Ny4zIDM3NCA2MC45IDM2Ny4xIDUzLjEgMzU0LjggNDguOCAzNjAuNyA1Ny4zIDM3NCIgc3R5bGU9ImZpbGw6IzAwNzRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDkuOSAzNDguOCAxNzMuMyAzMzcuNSAxNjcgMzM3LjIgMTQzLjEgMzQ4LjUgMTQ5LjkgMzQ4LjgiIHN0eWxlPSJmaWxsOiMwMGE4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzQ4LjYgMjA5LjYgMzc0LjcgMTk5LjEgMzcwLjkgMTkxLjYgMzQ1IDIwMi4yIDM0OC42IDIwOS42IiBzdHlsZT0iZmlsbDojZDdmZjFmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijk1LjUgMzM5LjUgMTE2LjkgMzI5LjUgMTExLjUgMzIxIDg5LjYgMzMwLjEgOTUuNSAzMzkuNSIgc3R5bGU9ImZpbGw6IzAwYzRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMTMuNyAxODIgMzM4LjEgMTcyLjIgMzMyLjMgMTc0LjEgMzA4LjIgMTgzLjYgMzEzLjcgMTgyIiBzdHlsZT0iZmlsbDojZmZlNjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzLjggMzA0LjkgMjUuNSAzMDkuNCAyMi4xIDI4OC41IDIwLjIgMjgyLjggMjMuOCAzMDQuOSIgc3R5bGU9ImZpbGw6IzI2ZmZkMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTEuNCA0MTEuNCAxMDguOCA0MDQuMiA5OC4xIDQwMy43IDk5LjkgNDEwLjggMTExLjQgNDExLjQiIHN0eWxlPSJmaWxsOiMwMDE0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTU3LjUgMjY2LjQgMTkxLjEgMjYwLjMgMTkwLjYgMjUwLjkgMTU3IDI1Ni40IDE1Ny41IDI2Ni40IiBzdHlsZT0iZmlsbDojNmRmZjhhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjgxLjcgMjUuMyA4MS4xIDM4LjggOTYuOSA0MS4xIDk2LjkgMjcuOCA4MS43IDI1LjMiIHN0eWxlPSJmaWxsOm1hcm9vbiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI3OC45IDM4NS42IDg0LjQgMzc1LjcgNzUuOSAzNjguMiA2OS42IDM3Ny41IDc4LjkgMzg1LjYiIHN0eWxlPSJmaWxsOiMwMDVjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iOTQuMyAzNjQuOSAxMDkuMiAzNTMuNiAxMDIuMSAzNDcuNCA4Ni41IDM1OC4xIDk0LjMgMzY0LjkiIHN0eWxlPSJmaWxsOiMwMDhjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNjkuNiAzNzcuNSA3NS45IDM2OC4yIDY3LjkgMzU4LjggNjAuOSAzNjcuMSA2OS42IDM3Ny41IiBzdHlsZT0iZmlsbDojMDA3MGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwNi44IDMxMS4zIDEzMy44IDMwMyAxMzAuMyAyOTMuMyAxMDMgMzAwLjYgMTA2LjggMzExLjMiIHN0eWxlPSJmaWxsOiMxY2ZmZGIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iODYuNSAzNTguMSAxMDIuMSAzNDcuNCA5NS41IDMzOS41IDc5LjIgMzQ5LjQgODYuNSAzNTguMSIgc3R5bGU9ImZpbGw6IzAwOWNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMjQuMiAzNjAuMyAxNDMuMSAzNDguNSAxMzYuMiAzNDYuMyAxMTYuNiAzNTcuOSAxMjQuMiAzNjAuMyIgc3R5bGU9ImZpbGw6IzAwOTRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI5OC4xIDQwMy43IDk4LjUgMzk0LjUgODguNiAzOTEuMyA4Ny40IDQwMC4yIDk4LjEgNDAzLjciIHN0eWxlPSJmaWxsOiMwMDJjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTg0LjIgMTYzLjIgMTg1LjggMTc4LjEgMTkwLjcgMjA0LjUgMTg5LjIgMTg5LjcgMTg0LjIgMTYzLjIiIHN0eWxlPSJmaWxsOiNmZmU2MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTg1LjIgMzMyLjkgMjEyLjIgMzIyLjcgMjA2LjggMzI1LjUgMTc5LjQgMzM2IDE4NS4yIDMzMi45IiBzdHlsZT0iZmlsbDojMGNmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE3OS41IDM2MC44IDE3Ni4zIDM2Ny40IDE2Ny45IDM4My42IDE3MC43IDM3Ny43IDE3OS41IDM2MC44IiBzdHlsZT0iZmlsbDojMDA3MGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE5MS4xIDI0MS43IDIyNS4yIDIzNS45IDIyNi41IDIyNy41IDE5Mi41IDIzMi45IDE5MS4xIDI0MS43IiBzdHlsZT0iZmlsbDojOWFmZjVkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIyOC43IDIxOS42IDI2MS4zIDIxMy4yIDI2NC4yIDIwNi4zIDIzMS43IDIxMi43IDIyOC43IDIxOS42IiBzdHlsZT0iZmlsbDojYzRmZjMzIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijg0LjQgMzc1LjcgOTQuMyAzNjQuOCA4Ni41IDM1OCA3NS45IDM2OC4yIDg0LjQgMzc1LjciIHN0eWxlPSJmaWxsOiMwMDc0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTAyLjQgMzY5LjYgMTE2LjYgMzU3LjkgMTA5LjIgMzUzLjYgOTQuMyAzNjQuOCAxMDIuNCAzNjkuNiIgc3R5bGU9ImZpbGw6IzAwODBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4OC42IDM5MS4zIDkzLjMgMzgwLjkgODQuNCAzNzUuNyA3OC45IDM4NS42IDg4LjYgMzkxLjMiIHN0eWxlPSJmaWxsOiMwMDRjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzAuOCAzMjkuNiAzMi41IDMzMC40IDI3LjYgMzExLjUgMjUuNSAzMDkuNCAzMC44IDMyOS42IiBzdHlsZT0iZmlsbDojMDBlMGZiIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM0NSAyMDIuMiAzNzAuOSAxOTEuNiAzNjYuNSAxODUgMzQwLjcgMTk1LjYgMzQ1IDIwMi4yIiBzdHlsZT0iZmlsbDojZTdmZjBmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijc1LjkgMzY4LjIgODYuNSAzNTggNzkuMyAzNDkuNCA2Ny45IDM1OC44IDc1LjkgMzY4LjIiIHN0eWxlPSJmaWxsOiMwMDg0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzE5LjQgMTgxLjkgMzQ0LjEgMTcxLjggMzM4LjEgMTcyLjIgMzEzLjcgMTgyIDMxOS40IDE4MS45IiBzdHlsZT0iZmlsbDojZmZlMjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijg5LjYgMzMwLjEgMTExLjUgMzIxIDEwNi44IDMxMS4zIDg0LjUgMzE5LjUgODkuNiAzMzAuMSIgc3R5bGU9ImZpbGw6IzAwZTBmYiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI3OS4yIDM0OS40IDk1LjUgMzM5LjUgODkuNiAzMzAuMSA3Mi43IDMzOS4xIDc5LjIgMzQ5LjQiIHN0eWxlPSJmaWxsOiMwMGI0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNjAuOSAzNjcuMSA2Ny45IDM1OC44IDYwLjcgMzQ3LjUgNTMuMSAzNTQuOCA2MC45IDM2Ny4xIiBzdHlsZT0iZmlsbDojMDA4Y2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM5IDM0OC4yIDQxLjUgMzQ1LjUgMzUuNCAzMjkgMzIuNSAzMzAuNCAzOSAzNDguMiIgc3R5bGU9ImZpbGw6IzAwYjRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI5My4zIDM4MC45IDEwMi40IDM2OS42IDk0LjMgMzY0LjggODQuNCAzNzUuNyA5My4zIDM4MC45IiBzdHlsZT0iZmlsbDojMDA2OGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyMy41IDI0NC41IDM1NC42IDIzNS41IDM1My41IDIyNi41IDMyMi40IDIzNS41IDMyMy41IDI0NC41IiBzdHlsZT0iZmlsbDojOWFmZjVkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQ4LjggMzYwLjcgNTMuMSAzNTQuOCA0Ni4zIDM0MC45IDQxLjUgMzQ1LjUgNDguOCAzNjAuNyIgc3R5bGU9ImZpbGw6IzAwOWNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMjEuNCAzMTIuNSAyNTEuMyAzMDMuNyAyNDcuMSAzMDkuMSAyMTcuMSAzMTguMyAyMjEuNCAzMTIuNSIgc3R5bGU9ImZpbGw6IzEzZmNlNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTYuNiAzNDcuMyAxNzkuNCAzMzYgMTczLjMgMzM3LjUgMTQ5LjkgMzQ4LjggMTU2LjYgMzQ3LjMiIHN0eWxlPSJmaWxsOiMwMGIwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTIuOCAxNzkuMSAxNi41IDE5My4yIDIxLjYgMTcxLjggMTggMTU2LjkgMTIuOCAxNzkuMSIgc3R5bGU9ImZpbGw6I2ZmZGIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMjcuOCAyODIuOSAxNTkgMjc2LjMgMTU3LjUgMjY2LjQgMTI2LjIgMjcyLjIgMTI3LjggMjgyLjkiIHN0eWxlPSJmaWxsOiM1M2ZmYTQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjc0LjQgMTkzLjkgMzAzIDE4Ni42IDI5OC4yIDE5MC45IDI2OS45IDE5OCAyNzQuNCAxOTMuOSIgc3R5bGU9ImZpbGw6I2VlZmYwOSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNDAuNyAxOTUuNiAzNjYuNSAxODUgMzYxLjQgMTc5LjcgMzM1LjkgMTkwLjIgMzQwLjcgMTk1LjYiIHN0eWxlPSJmaWxsOiNmNGY4MDIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNjcuOSAzNTguOCA3OS4yIDM0OS40IDcyLjcgMzM5LjEgNjAuNyAzNDcuNSA2Ny45IDM1OC44IiBzdHlsZT0iZmlsbDojMDBhMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyNS4xIDE4My4zIDM1MC4xIDE3MyAzNDQuMSAxNzEuOCAzMTkuNCAxODEuOSAzMjUuMSAxODMuMyIgc3R5bGU9ImZpbGw6I2ZmZTIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTAuNyAzNzIuMyAxMjQuMiAzNjAuMyAxMTYuNiAzNTcuOSAxMDIuNCAzNjkuNiAxMTAuNyAzNzIuMyIgc3R5bGU9ImZpbGw6IzAwN2NmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzEuNyAzNjAuNyAxNDkuOSAzNDguOCAxNDMuMSAzNDguNSAxMjQuMiAzNjAuMyAxMzEuNyAzNjAuNyIgc3R5bGU9ImZpbGw6IzAwOTRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjcuOSAzODMuNiAxNjMuMyAzODYuNiAxNTMuNyAzOTkuMiAxNTcuOSAzOTYuOSAxNjcuOSAzODMuNiIgc3R5bGU9ImZpbGw6IzA0ZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyOC4yIDg3LjcgMzEuNCAxMDMuNiA0Mi45IDg5LjQgMzkuOCA3My4yIDI4LjIgODcuNyIgc3R5bGU9ImZpbGw6I2ZmMWUwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyOTEuOSAyNjUgMzIzLjUgMjU3LjkgMzIyLjQgMjY2LjQgMjkwLjggMjczLjcgMjkxLjkgMjY1IiBzdHlsZT0iZmlsbDojNjZmZjkwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijk4LjUgMzk0LjUgMTAyLjQgMzgzLjggOTMuMyAzODAuOSA4OC42IDM5MS4zIDk4LjUgMzk0LjUiIHN0eWxlPSJmaWxsOiMwMDQ4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzM1LjkgMTkwLjIgMzYxLjQgMTc5LjcgMzU1LjkgMTc1LjYgMzMwLjYgMTg2LjEgMzM1LjkgMTkwLjIiIHN0eWxlPSJmaWxsOiNmZWVkMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjU3LjUgMjg5LjUgMjg5IDI4MS44IDI4Ni4zIDI4OS4xIDI1NC43IDI5Ny4xIDI1Ny41IDI4OS41IiBzdHlsZT0iZmlsbDojM2NmZmJhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzMC42IDE4Ni4xIDM1NS45IDE3NS42IDM1MC4xIDE3MyAzMjUuMSAxODMuMyAzMzAuNiAxODYuMSIgc3R5bGU9ImZpbGw6I2ZmZTIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMDMgMzAwLjYgMTMwLjMgMjkzLjMgMTI3LjggMjgyLjkgMTAwLjIgMjg5LjQgMTAzIDMwMC42IiBzdHlsZT0iZmlsbDojMzZmZmMxIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwMi40IDM4My44IDExMC43IDM3Mi4zIDEwMi40IDM2OS42IDkzLjMgMzgwLjkgMTAyLjQgMzgzLjgiIHN0eWxlPSJmaWxsOiMwMDY0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNzIuNyAzMzkuMSA4OS42IDMzMC4xIDg0LjUgMzE5LjUgNjcuMSAzMjcuNCA3Mi43IDMzOS4xIiBzdHlsZT0iZmlsbDojMDBkMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1My40IDc5LjcgMTU1LjcgOTIuMiAxNjcuMiAxMTMuNyAxNjQuNSAxMDEuMyAxNTMuNCA3OS43IiBzdHlsZT0iZmlsbDojZmYyOTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1NyAyNTYuNCAxOTAuNiAyNTAuOSAxOTEuMSAyNDEuNyAxNTcuNSAyNDYuNyAxNTcgMjU2LjQiIHN0eWxlPSJmaWxsOiM4N2ZmNzAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTA4LjggNDA0LjIgMTA4LjMgMzk1IDk4LjUgMzk0LjUgOTguMSA0MDMuNiAxMDguOCA0MDQuMiIgc3R5bGU9ImZpbGw6IzAwMzBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4NC41IDMxOS41IDEwNi44IDMxMS4zIDEwMyAzMDAuNiA4MC4zIDMwNy44IDg0LjUgMzE5LjUiIHN0eWxlPSJmaWxsOiMxM2ZjZTQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTk0LjYgMjcxLjYgMTk0LjkgMjg0LjYgMTkyLjQgMzA4LjggMTkyIDI5Ni41IDE5NC42IDI3MS42IiBzdHlsZT0iZmlsbDojNDNmZmI0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjUzLjEgMzU0LjggNjAuNyAzNDcuNSA1NC41IDMzNC43IDQ2LjMgMzQwLjkgNTMuMSAzNTQuOCIgc3R5bGU9ImZpbGw6IzAwYWNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTMuNyAzOTkuMiAxNDguMyAzOTguNSAxMzguMSA0MDcuNSAxNDIuOSA0MDguOCAxNTMuNyAzOTkuMiIgc3R5bGU9ImZpbGw6IzAwMmNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI1MS4yIDQ3LjUgNTMgNjIuNiA2Ny41IDU2LjEgNjUuNyA0MSA1MS4yIDQ3LjUiIHN0eWxlPSJmaWxsOiNhODAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTkwLjUgMzI4LjIgMjE3LjEgMzE4LjMgMjEyLjIgMzIyLjcgMTg1LjIgMzMyLjkgMTkwLjUgMzI4LjIiIHN0eWxlPSJmaWxsOiMwMGRjZmUiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iOTYuOSAyNy44IDk2LjkgNDEuMSAxMTIuNiA0Ny44IDExMi4xIDM0LjggOTYuOSAyNy44IiBzdHlsZT0iZmlsbDptYXJvb24iLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTIyLjUgNDA5IDExOS4xIDQwMS45IDEwOC44IDQwNC4yIDExMS40IDQxMS40IDEyMi41IDQwOSIgc3R5bGU9ImZpbGw6IzAwMjBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMzEuNyAyMTIuNyAyNjQuMiAyMDYuMyAyNjcuOSAyMDAuNSAyMzUuMyAyMDYuNyAyMzEuNyAyMTIuNyIgc3R5bGU9ImZpbGw6I2Q3ZmYxZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI2MC43IDM0Ny41IDcyLjcgMzM5LjEgNjcuMSAzMjcuNCA1NC41IDMzNC43IDYwLjcgMzQ3LjUiIHN0eWxlPSJmaWxsOiMwMGMwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTM4LjEgNDA3LjUgMTMzIDQwMy40IDEyMi41IDQwOC45IDEyNi45IDQxMy40IDEzOC4xIDQwNy41IiBzdHlsZT0iZmlsbDojMDAyMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE5Mi41IDIzMi45IDIyNi41IDIyNy40IDIyOC43IDIxOS42IDE5NC43IDIyNC44IDE5Mi41IDIzMi45IiBzdHlsZT0iZmlsbDojYjFmZjQ2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyMi40IDIzNS41IDM1My40IDIyNi41IDM1MS40IDIxNy44IDMyMC40IDIyNi44IDMyMi40IDIzNS41IiBzdHlsZT0iZmlsbDojYjFmZjQ2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzLjcgMjE2LjMgMTYuNyAyMjguMyAxOS41IDIwNi4xIDE2LjUgMTkzLjIgMTMuNyAyMTYuMyIgc3R5bGU9ImZpbGw6I2NlZmYyOSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTguOSAzNzIuNyAxMzEuNyAzNjAuNyAxMjQuMiAzNjAuMyAxMTAuNyAzNzIuMyAxMTguOSAzNzIuNyIgc3R5bGU9ImZpbGw6IzAwN2NmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNzkuMyAxOTEuMSAzMDguMiAxODMuNiAzMDMgMTg2LjUgMjc0LjQgMTkzLjkgMjc5LjMgMTkxLjEiIHN0eWxlPSJmaWxsOiNmYmYxMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTYyLjggMzQzLjkgMTg1LjIgMzMyLjkgMTc5LjQgMzM2IDE1Ni42IDM0Ny4zIDE2Mi44IDM0My45IiBzdHlsZT0iZmlsbDojMDBiY2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQxLjUgMzQ1LjUgNDYuMyAzNDAuOSA0MC43IDMyNS42IDM1LjQgMzI5IDQxLjUgMzQ1LjUiIHN0eWxlPSJmaWxsOiMwMGM0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTM5IDM1OSAxNTYuNiAzNDcuMyAxNDkuOSAzNDguOCAxMzEuNyAzNjAuNyAxMzkgMzU5IiBzdHlsZT0iZmlsbDojMDA5Y2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyNi4yIDI3Mi4yIDE1Ny41IDI2Ni40IDE1NyAyNTYuNCAxMjUuNiAyNjEuNSAxMjYuMiAyNzIuMiIgc3R5bGU9ImZpbGw6IzZkZmY4YSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMDguMyAzOTUgMTExLjQgMzg0LjMgMTAyLjQgMzgzLjggOTguNSAzOTQuNSAxMDguMyAzOTUiIHN0eWxlPSJmaWxsOiMwMDRjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjI1LjEgMzA1LjUgMjU0LjcgMjk3LjEgMjUxLjMgMzAzLjcgMjIxLjQgMzEyLjUgMjI1LjEgMzA1LjUiIHN0eWxlPSJmaWxsOiMyM2ZmZDQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTExLjQgMzg0LjMgMTE4LjkgMzcyLjcgMTEwLjcgMzcyLjMgMTAyLjQgMzgzLjggMTExLjQgMzg0LjMiIHN0eWxlPSJmaWxsOiMwMDY0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNjcuMSAzMjcuNCA4NC41IDMxOS41IDgwLjMgMzA3LjggNjIuNCAzMTQuNiA2Ny4xIDMyNy40IiBzdHlsZT0iZmlsbDojMDlmMGVlIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0MC43IDYxLjEgMTQyLjUgNzMuOCAxNTUuNyA5Mi4yIDE1My40IDc5LjcgMTQwLjcgNjEuMSIgc3R5bGU9ImZpbGw6I2RmMDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyOTIgMjU2IDMyMy43IDI0OSAzMjMuNSAyNTcuOSAyOTEuOSAyNjUgMjkyIDI1NiIgc3R5bGU9ImZpbGw6IzdkZmY3YSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMi41IDMzMC40IDM1LjQgMzI5IDMwLjkgMzExLjQgMjcuNiAzMTEuNSAzMi41IDMzMC40IiBzdHlsZT0iZmlsbDojMDJlOGY0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2LjIgMjUxLjQgMTguNiAyNjAuNCAxOS4xIDIzOC41IDE2LjggMjI4LjMgMTYuMiAyNTEuNCIgc3R5bGU9ImZpbGw6Izk0ZmY2MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTIuMSAzNC44IDExMi42IDQ3LjggMTI4IDU4LjggMTI2LjggNDYgMTEyLjEgMzQuOCIgc3R5bGU9ImZpbGw6IzkyMDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNTkuNCAyODEgMjkwLjggMjczLjcgMjg5IDI4MS44IDI1Ny41IDI4OS41IDI1OS40IDI4MSIgc3R5bGU9ImZpbGw6IzUwZmZhNyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMDAuMiAyODkuNCAxMjcuOCAyODIuOSAxMjYuMiAyNzIuMiA5OC40IDI3Ny43IDEwMC4yIDI4OS40IiBzdHlsZT0iZmlsbDojNTBmZmE3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjgwLjMgMzA3LjggMTAzIDMwMC42IDEwMC4yIDI4OS40IDc3LjEgMjk1LjUgODAuMyAzMDcuOCIgc3R5bGU9ImZpbGw6IzMwZmZjNyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMjAuNCAyMjYuOCAzNTEuNCAyMTcuOCAzNDguNiAyMDkuNiAzMTcuNyAyMTguNiAzMjAuNCAyMjYuOCIgc3R5bGU9ImZpbGw6I2M0ZmYzMyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNS41IDMwOS40IDI3LjYgMzExLjUgMjQuNCAyOTEuOSAyMi4xIDI4OC41IDI1LjUgMzA5LjQiIHN0eWxlPSJmaWxsOiMyY2ZmY2EiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDYuMyAzNDAuOSA1NC41IDMzNC43IDQ5LjQgMzIwLjcgNDAuNyAzMjUuNiA0Ni4zIDM0MC45IiBzdHlsZT0iZmlsbDojMDBkNGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIwLjIgMjgyLjggMjIuMSAyODguNSAyMC42IDI2Ny40IDE4LjYgMjYwLjUgMjAuMiAyODIuOCIgc3R5bGU9ImZpbGw6IzVhZmY5ZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMjYuOCA0NiAxMjggNTguOCAxNDIuNSA3My44IDE0MC43IDYxLjEgMTI2LjggNDYiIHN0eWxlPSJmaWxsOiNiMjAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNTQuNSAzMzQuNyA2Ny4xIDMyNy40IDYyLjQgMzE0LjYgNDkuNCAzMjAuNyA1NC41IDMzNC43IiBzdHlsZT0iZmlsbDojMDBlNGY4Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI4NC41IDE4OS44IDMxMy43IDE4MiAzMDguMiAxODMuNiAyNzkuMyAxOTEuMSAyODQuNSAxODkuOCIgc3R5bGU9ImZpbGw6I2ZmZWEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTcuNSAyNDYuNyAxOTEuMSAyNDEuNyAxOTIuNSAyMzIuOSAxNTguOSAyMzcuNCAxNTcuNSAyNDYuNyIgc3R5bGU9ImZpbGw6IzlkZmY1YSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMzUuMyAyMDYuNyAyNjcuOSAyMDAuNSAyNzIuMSAxOTUuNyAyMzkuNiAyMDEuOSAyMzUuMyAyMDYuNyIgc3R5bGU9ImZpbGw6I2U3ZmYwZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTUuMSAzMjIgMjIxLjQgMzEyLjUgMjE3LjEgMzE4LjMgMTkwLjUgMzI4LjIgMTk1LjEgMzIyIiBzdHlsZT0iZmlsbDojMDlmMGVlIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE5Mi40IDMwOC44IDE5MSAzMTkuMyAxODYuMyAzNDEuMiAxODcuNiAzMzEuNCAxOTIuNCAzMDguOCIgc3R5bGU9ImZpbGw6IzA2ZWNmMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTkuMSA0MDEuOSAxMTcuOCAzOTIuOSAxMDguMyAzOTUgMTA4LjggNDA0LjIgMTE5LjEgNDAxLjkiIHN0eWxlPSJmaWxsOiMwMDNjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTI2LjkgMzcwLjkgMTM5IDM1OSAxMzEuNyAzNjAuNyAxMTguOSAzNzIuNyAxMjYuOSAzNzAuOSIgc3R5bGU9ImZpbGw6IzA4ZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTAuNyAyMDQuNSAxOTIuMiAyMTkuMyAxOTQuNyAyNDUuNyAxOTMuMiAyMzEuMyAxOTAuNyAyMDQuNSIgc3R5bGU9ImZpbGw6I2M0ZmYzMyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzYuOCAxMzcuNiAxNzguNCAxNTIuNiAxODUuOCAxNzguMSAxODQuMiAxNjMuMiAxNzYuOCAxMzcuNiIgc3R5bGU9ImZpbGw6I2ZmOWYwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTQuNyAyMjQuOCAyMjguNyAyMTkuNiAyMzEuNyAyMTIuNyAxOTcuNyAyMTcuNSAxOTQuNyAyMjQuOCIgc3R5bGU9ImZpbGw6I2M3ZmYzMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMS43IDEyMS4xIDI1LjUgMTM3IDM1IDExOS45IDMxLjQgMTAzLjYgMjEuNyAxMjEuMSIgc3R5bGU9ImZpbGw6I2ZmNTkwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjguNSAzMzguOCAxOTAuNSAzMjguMiAxODUuMiAzMzIuOSAxNjIuOCAzNDMuOSAxNjguNSAzMzguOCIgc3R5bGU9ImZpbGw6IzAwZDBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMTcuNyAyMTguNiAzNDguNiAyMDkuNiAzNDUgMjAyLjIgMzE0LjMgMjExLjEgMzE3LjcgMjE4LjYiIHN0eWxlPSJmaWxsOiNkN2ZmMWYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQ1LjggMzU1LjQgMTYyLjggMzQzLjkgMTU2LjYgMzQ3LjMgMTM5IDM1OSAxNDUuOCAzNTUuNCIgc3R5bGU9ImZpbGw6IzAwYWNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyODkuOSAxODkuOSAzMTkuNCAxODEuOSAzMTMuNyAxODIgMjg0LjYgMTg5LjggMjg5LjkgMTg5LjkiIHN0eWxlPSJmaWxsOiNmZmU2MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTIwLjEgMzgyLjMgMTI2LjkgMzcwLjkgMTE4LjkgMzcyLjcgMTExLjQgMzg0LjMgMTIwLjEgMzgyLjMiIHN0eWxlPSJmaWxsOiMwMDcwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTE3LjggMzkyLjkgMTIwLjEgMzgyLjMgMTExLjQgMzg0LjMgMTA4LjMgMzk1IDExNy44IDM5Mi45IiBzdHlsZT0iZmlsbDojMDA1NGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyNS42IDI2MS41IDE1NyAyNTYuNCAxNTcuNSAyNDYuNyAxMjYgMjUwLjkgMTI1LjYgMjYxLjUiIHN0eWxlPSJmaWxsOiM4N2ZmNzAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjkxLjMgMjQ2LjkgMzIzIDI0MCAzMjMuNyAyNDkgMjkyIDI1NiAyOTEuMyAyNDYuOSIgc3R5bGU9ImZpbGw6Izk0ZmY2MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI2Mi40IDMxNC42IDgwLjMgMzA3LjggNzcuMSAyOTUuNSA1OSAzMDEuMSA2Mi40IDMxNC42IiBzdHlsZT0iZmlsbDojMjZmZmQxIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIyNy45IDI5Ny41IDI1Ny41IDI4OS41IDI1NC43IDI5Ny4xIDIyNS4xIDMwNS41IDIyNy45IDI5Ny41IiBzdHlsZT0iZmlsbDojMzlmZmJlIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzMyA0MDMuNCAxMjguOCAzOTYuOCAxMTkuMSA0MDEuOSAxMjIuNSA0MDguOSAxMzMgNDAzLjQiIHN0eWxlPSJmaWxsOiMwMDM4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzUuNCAzMjkgNDAuNyAzMjUuNiAzNi41IDMwOS40IDMwLjkgMzExLjQgMzUuNCAzMjkiIHN0eWxlPSJmaWxsOiMwY2Y0ZWIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjYwLjQgMjcyIDI5MS45IDI2NSAyOTAuOSAyNzMuNyAyNTkuNCAyODEuMSAyNjAuNCAyNzIiIHN0eWxlPSJmaWxsOiM2NmZmOTAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTg2LjMgMzQxLjIgMTgyLjkgMzQ4LjUgMTc2LjMgMzY3LjQgMTc5LjUgMzYwLjggMTg2LjMgMzQxLjIiIHN0eWxlPSJmaWxsOiMwMGIwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzE0LjMgMjExLjEgMzQ1IDIwMi4yIDM0MC43IDE5NS42IDMxMC4yIDIwNC40IDMxNC4zIDIxMS4xIiBzdHlsZT0iZmlsbDojZTRmZjEzIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijk4LjQgMjc3LjcgMTI2LjIgMjcyLjIgMTI1LjYgMjYxLjUgOTcuNyAyNjYgOTguNCAyNzcuNyIgc3R5bGU9ImZpbGw6IzZhZmY4ZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyOTUuMyAxOTEuNSAzMjUuMSAxODMuMyAzMTkuNCAxODEuOSAyODkuOSAxODkuOSAyOTUuMyAxOTEuNSIgc3R5bGU9ImZpbGw6I2ZmZTYwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI3Ny4xIDI5NS41IDEwMC4yIDI4OS40IDk4LjQgMjc3LjcgNzUuMSAyODIuNyA3Ny4xIDI5NS41IiBzdHlsZT0iZmlsbDojNDlmZmFkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzOS42IDIwMS45IDI3Mi4xIDE5NS43IDI3Ni44IDE5Mi4zIDI0NC4zIDE5OC40IDIzOS42IDIwMS45IiBzdHlsZT0iZmlsbDojZjRmODAyIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjY1LjcgNDEgNjcuNSA1Ni4xIDgyLjggNTQgODEuMSAzOC44IDY1LjcgNDEiIHN0eWxlPSJmaWxsOiM4ZDAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQ4LjMgMzk4LjUgMTQyLjUgMzk1IDEzMyA0MDMuNCAxMzguMSA0MDcuNiAxNDguMyAzOTguNSIgc3R5bGU9ImZpbGw6IzAwNDBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0OS40IDMyMC43IDYyLjQgMzE0LjYgNTkgMzAxLjEgNDUuNiAzMDUuOCA0OS40IDMyMC43IiBzdHlsZT0iZmlsbDojMWZmZmQ3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQwLjcgMzI1LjYgNDkuNCAzMjAuNyA0NS42IDMwNS44IDM2LjUgMzA5LjQgNDAuNyAzMjUuNiIgc3R5bGU9ImZpbGw6IzE2ZmZlMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMTAuMiAyMDQuNCAzNDAuNyAxOTUuNiAzMzUuOSAxOTAuMiAzMDUuNiAxOTguOSAzMTAuMiAyMDQuNCIgc3R5bGU9ImZpbGw6I2YxZmMwNiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTguOSAyMzcuNCAxOTIuNSAyMzIuOSAxOTQuNyAyMjQuOCAxNjEuMiAyMjguNyAxNTguOSAyMzcuNCIgc3R5bGU9ImZpbGw6I2I0ZmY0MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMDAuNiAxOTQuNSAzMzAuNiAxODYuMSAzMjUuMSAxODMuMyAyOTUuMyAxOTEuNSAzMDAuNiAxOTQuNSIgc3R5bGU9ImZpbGw6I2ZmZTYwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzYuMyAzNjcuNCAxNzEuMyAzNzEuMSAxNjMuMyAzODYuNiAxNjcuOSAzODMuNiAxNzYuMyAzNjcuNCIgc3R5bGU9ImZpbGw6IzAwN2NmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMDUuNiAxOTguOSAzMzUuOSAxOTAuMiAzMzAuNiAxODYuMSAzMDAuNiAxOTQuNSAzMDUuNiAxOTguOSIgc3R5bGU9ImZpbGw6I2ZlZWQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTkgMzE0LjUgMjI1LjEgMzA1LjUgMjIxLjQgMzEyLjUgMTk1LjEgMzIyIDE5OSAzMTQuNSIgc3R5bGU9ImZpbGw6IzFjZmZkYiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjMuMyAzODYuNiAxNTcuMyAzODYuNiAxNDguMyAzOTguNSAxNTMuNyAzOTkuMiAxNjMuMyAzODYuNiIgc3R5bGU9ImZpbGw6IzAwNTRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzOS44IDczLjIgNDIuOSA4OS40IDU2IDc4LjkgNTMgNjIuNiAzOS44IDczLjIiIHN0eWxlPSJmaWxsOiNkNjAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTM0LjQgMzY2LjggMTQ1LjggMzU1LjMgMTM5IDM1OSAxMjYuOSAzNzAuOSAxMzQuNCAzNjYuOCIgc3R5bGU9ImZpbGw6IzAwOThmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTcuNyAyMTcuNSAyMzEuNyAyMTIuNyAyMzUuMyAyMDYuNyAyMDEuNSAyMTEuMyAxOTcuNyAyMTcuNSIgc3R5bGU9ImZpbGw6I2Q3ZmYxZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOCAxNTYuOSAyMS42IDE3MS44IDI4LjggMTUyLjUgMjUuNSAxMzcgMTggMTU2LjkiIHN0eWxlPSJmaWxsOiNmZjljMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjcuNiAzMTEuNSAzMC45IDMxMS40IDI3LjkgMjkzLjIgMjQuNCAyOTEuOSAyNy42IDMxMS41IiBzdHlsZT0iZmlsbDojMzBmZmM3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI4OS43IDIzNy45IDMyMS41IDIzMS4yIDMyMyAyNDAgMjkxLjMgMjQ2LjkgMjg5LjcgMjM3LjkiIHN0eWxlPSJmaWxsOiNhYWZmNGQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTI4LjggMzk2LjggMTI2LjggMzg4LjEgMTE3LjggMzkyLjkgMTE5LjEgNDAxLjkgMTI4LjggMzk2LjgiIHN0eWxlPSJmaWxsOiMwMDUwZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTczLjYgMzMyLjEgMTk1LjEgMzIyIDE5MC41IDMyOC4yIDE2OC41IDMzOC44IDE3My42IDMzMi4xIiBzdHlsZT0iZmlsbDojMDBlNGY4Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1Mi4xIDM0OS44IDE2OC41IDMzOC44IDE2Mi44IDM0My45IDE0NS44IDM1NS4zIDE1Mi4xIDM0OS44IiBzdHlsZT0iZmlsbDojMDBjMGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI0NC40IDE5OC40IDI3Ni44IDE5Mi4zIDI4MS45IDE5MC4zIDI0OS41IDE5Ni40IDI0NC40IDE5OC40IiBzdHlsZT0iZmlsbDojZmVlZDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyNiAyNTAuOSAxNTcuNSAyNDYuNyAxNTguOSAyMzcuNCAxMjcuNSAyNDAuOSAxMjYgMjUwLjkiIHN0eWxlPSJmaWxsOiNhMGZmNTYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjI5LjkgMjg4LjUgMjU5LjQgMjgxLjEgMjU3LjUgMjg5LjUgMjI3LjkgMjk3LjUgMjI5LjkgMjg4LjUiIHN0eWxlPSJmaWxsOiM1MGZmYTciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTI4LjMgMzc4IDEzNC40IDM2Ni44IDEyNi45IDM3MC45IDEyMC4xIDM4Mi4zIDEyOC4zIDM3OCIgc3R5bGU9ImZpbGw6IzAwODBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI1OSAzMDEuMSA3Ny4xIDI5NS41IDc1LjEgMjgyLjcgNTYuNyAyODcuMSA1OSAzMDEuMSIgc3R5bGU9ImZpbGw6IzQ2ZmZiMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTQuNyAyNDUuNyAxOTUgMjU5LjIgMTk0LjkgMjg0LjYgMTk0LjYgMjcxLjYgMTk0LjcgMjQ1LjciIHN0eWxlPSJmaWxsOiM4M2ZmNzMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjYwLjUgMjYyLjcgMjkyIDI1NiAyOTEuOSAyNjUgMjYwLjQgMjcyIDI2MC41IDI2Mi43IiBzdHlsZT0iZmlsbDojN2RmZjdhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyNi44IDM4OC4xIDEyOC4zIDM3Ny45IDEyMC4xIDM4Mi4zIDExNy44IDM5Mi45IDEyNi44IDM4OC4xIiBzdHlsZT0iZmlsbDojMDA2OGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIyLjEgMjg4LjUgMjQuNCAyOTEuOSAyMyAyNzIuMiAyMC42IDI2Ny40IDIyLjEgMjg4LjUiIHN0eWxlPSJmaWxsOiM1ZGZmOWEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTY3LjIgMTEzLjcgMTY4LjggMTI4LjggMTc4LjQgMTUyLjYgMTc2LjggMTM3LjYgMTY3LjIgMTEzLjciIHN0eWxlPSJmaWxsOiNmZjYwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTYuNSAxOTMuMiAxOS41IDIwNi4xIDI0LjQgMTg1LjUgMjEuNiAxNzEuOCAxNi41IDE5My4yIiBzdHlsZT0iZmlsbDojZmZlMjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijk3LjcgMjY2IDEyNS42IDI2MS41IDEyNiAyNTAuOSA5OC4xIDI1NC41IDk3LjcgMjY2IiBzdHlsZT0iZmlsbDojODdmZjcwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijc1LjEgMjgyLjcgOTguNCAyNzcuNyA5Ny43IDI2NiA3NC4zIDI2OS45IDc1LjEgMjgyLjciIHN0eWxlPSJmaWxsOiM2YWZmOGQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjg3LjMgMjI5LjMgMzE5LjIgMjIyLjcgMzIxLjUgMjMxLjIgMjg5LjcgMjM3LjkgMjg3LjMgMjI5LjMiIHN0eWxlPSJmaWxsOiNiZWZmMzkiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzAuOSAzMTEuNCAzNi41IDMwOS40IDMzLjggMjkyLjYgMjcuOSAyOTMuMiAzMC45IDMxMS40IiBzdHlsZT0iZmlsbDojMzZmZmMxIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2MS4yIDIyOC43IDE5NC43IDIyNC44IDE5Ny43IDIxNy41IDE2NC4zIDIyMSAxNjEuMiAyMjguNyIgc3R5bGU9ImZpbGw6I2NhZmYyYyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMDEuNSAyMTEuMyAyMzUuMyAyMDYuNyAyMzkuNiAyMDEuOSAyMDUuOSAyMDYuMyAyMDEuNSAyMTEuMyIgc3R5bGU9ImZpbGw6I2U3ZmYwZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOC42IDI2MC40IDIwLjYgMjY3LjQgMjEuMSAyNDYuNyAxOS4xIDIzOC41IDE4LjYgMjYwLjQiIHN0eWxlPSJmaWxsOiM5MGZmNjYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTYuOCAyMjguMyAxOS4xIDIzOC41IDIxLjcgMjE3LjQgMTkuNSAyMDYuMSAxNi44IDIyOC4zIiBzdHlsZT0iZmlsbDojY2FmZjJjIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQ1LjYgMzA1LjggNTkgMzAxLjEgNTYuNyAyODcuMSA0My4xIDI5MC41IDQ1LjYgMzA1LjgiIHN0eWxlPSJmaWxsOiM0MGZmYjciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjQ5LjUgMTk2LjQgMjgxLjkgMTkwLjMgMjg3LjIgMTg5LjcgMjU0LjkgMTk1LjggMjQ5LjUgMTk2LjQiIHN0eWxlPSJmaWxsOiNmZmU2MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQyLjUgMzk1IDEzNy42IDM4OC45IDEyOC44IDM5Ni44IDEzMyA0MDMuNCAxNDIuNSAzOTUiIHN0eWxlPSJmaWxsOiMwMDU0ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjAyIDMwNS44IDIyNy45IDI5Ny41IDIyNS4xIDMwNS41IDE5OSAzMTQuNSAyMDIgMzA1LjgiIHN0eWxlPSJmaWxsOiMzM2ZmYzQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzYuNSAzMDkuNCA0NS42IDMwNS44IDQzLjEgMjkwLjUgMzMuOCAyOTIuNyAzNi41IDMwOS40IiBzdHlsZT0iZmlsbDojM2NmZmJhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0MS4yIDM2MC43IDE1MiAzNDkuOCAxNDUuOCAzNTUuMyAxMzQuNCAzNjYuOCAxNDEuMiAzNjAuNyIgc3R5bGU9ImZpbGw6IzAwYWNmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4MS4xIDM4LjggODIuOCA1NCA5OC42IDU2LjMgOTYuOCA0MS4xIDgxLjEgMzguOCIgc3R5bGU9ImZpbGw6bWFyb29uIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4NS44IDE3OC4xIDE4Ny4zIDE5My4xIDE5Mi4yIDIxOS4zIDE5MC43IDIwNC41IDE4NS44IDE3OC4xIiBzdHlsZT0iZmlsbDojZmZlYTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI4NC4yIDIyMS4yIDMxNi4xIDIxNC43IDMxOS4yIDIyMi43IDI4Ny4zIDIyOS4zIDI4NC4yIDIyMS4yIiBzdHlsZT0iZmlsbDojZDFmZjI2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI1OS43IDI1My4yIDI5MS4zIDI0Ni45IDI5MiAyNTYgMjYwLjUgMjYyLjcgMjU5LjcgMjUzLjIiIHN0eWxlPSJmaWxsOiM5NGZmNjMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc3LjggMzIzLjkgMTk5IDMxNC41IDE5NS4xIDMyMiAxNzMuNiAzMzIuMSAxNzcuOCAzMjMuOSIgc3R5bGU9ImZpbGw6IzE2ZmZlMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTcuNSAzNDIuNCAxNzMuNiAzMzIuMSAxNjguNSAzMzguOCAxNTIgMzQ5LjggMTU3LjUgMzQyLjQiIHN0eWxlPSJmaWxsOiMwMGQ4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjMwLjkgMjc5IDI2MC40IDI3MiAyNTkuNCAyODEuMSAyMjkuOSAyODguNiAyMzAuOSAyNzkiIHN0eWxlPSJmaWxsOiM2NmZmOTAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjU0LjkgMTk1LjggMjg3LjIgMTg5LjcgMjkyLjYgMTkwLjUgMjYwLjMgMTk2LjYgMjU0LjkgMTk1LjgiIHN0eWxlPSJmaWxsOiNmZmUyMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTI3LjUgMjQwLjkgMTU4LjkgMjM3LjQgMTYxLjIgMjI4LjcgMTI5LjkgMjMxLjYgMTI3LjUgMjQwLjkiIHN0eWxlPSJmaWxsOiNiN2ZmNDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTk0LjkgMjg0LjYgMTkzLjQgMjk1LjggMTkxIDMxOS4zIDE5Mi40IDMwOC44IDE5NC45IDI4NC42IiBzdHlsZT0iZmlsbDojNDNmZmI0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMxLjQgMTAzLjYgMzUgMTE5LjkgNDYuMyAxMDYgNDIuOSA4OS40IDMxLjQgMTAzLjYiIHN0eWxlPSJmaWxsOiNmZjI1MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNTYuNyAyODcuMSA3NS4xIDI4Mi43IDc0LjMgMjY5LjkgNTUuOCAyNzMgNTYuNyAyODcuMSIgc3R5bGU9ImZpbGw6IzY2ZmY5MCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzUuOCAzNzEuMyAxNDEuMiAzNjAuNyAxMzQuNCAzNjYuOCAxMjguMyAzNzcuOSAxMzUuOCAzNzEuMyIgc3R5bGU9ImZpbGw6IzAwOThmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTcuMyAzODYuNiAxNTAuOSAzODMuOCAxNDIuNSAzOTUgMTQ4LjMgMzk4LjUgMTU3LjMgMzg2LjYiIHN0eWxlPSJmaWxsOiMwMDY4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjgwLjMgMjE0IDMxMi4zIDIwNy42IDMxNi4xIDIxNC43IDI4NC4yIDIyMS4yIDI4MC4zIDIxNCIgc3R5bGU9ImZpbGw6I2UxZmYxNiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMDUuOSAyMDYuMyAyMzkuNiAyMDEuOSAyNDQuNCAxOTguNCAyMTAuOCAyMDIuNyAyMDUuOSAyMDYuMyIgc3R5bGU9ImZpbGw6I2Y4ZjUwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzcuNiAzODguOSAxMzUgMzgwLjggMTI2LjggMzg4LjEgMTI4LjggMzk2LjggMTM3LjYgMzg4LjkiIHN0eWxlPSJmaWxsOiMwMDZjZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTU1LjcgOTIuMiAxNTcuMyAxMDcuNCAxNjguOCAxMjguOCAxNjcuMiAxMTMuNyAxNTUuNyA5Mi4yIiBzdHlsZT0iZmlsbDojZmYyOTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI0LjQgMjkxLjkgMjcuOSAyOTMuMiAyNi42IDI3NC45IDIzIDI3Mi4yIDI0LjQgMjkxLjkiIHN0eWxlPSJmaWxsOiM2MGZmOTciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjYwLjMgMTk2LjcgMjkyLjYgMTkwLjUgMjk4IDE5Mi45IDI2NS43IDE5OSAyNjAuMyAxOTYuNyIgc3R5bGU9ImZpbGw6I2ZmZTYwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjQuMyAyMjEgMTk3LjcgMjE3LjUgMjAxLjUgMjExLjMgMTY4LjMgMjE0LjQgMTY0LjMgMjIxIiBzdHlsZT0iZmlsbDojZGVmZjE5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijk4LjEgMjU0LjUgMTI2IDI1MC45IDEyNy41IDI0MC45IDk5LjcgMjQzLjUgOTguMSAyNTQuNSIgc3R5bGU9ImZpbGw6I2E0ZmY1MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzUgMzgwLjkgMTM1LjggMzcxLjMgMTI4LjMgMzc4IDEyNi44IDM4OC4xIDEzNSAzODAuOSIgc3R5bGU9ImZpbGw6IzAwODBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI3NC4zIDI2OS45IDk3LjcgMjY2IDk4LjEgMjU0LjUgNzQuNyAyNTcuMyA3NC4zIDI2OS45IiBzdHlsZT0iZmlsbDojODdmZjcwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI3NS45IDIwNy44IDMwNy45IDIwMS41IDMxMi4zIDIwNy42IDI4MC4zIDIxNCAyNzUuOSAyMDcuOCIgc3R5bGU9ImZpbGw6I2VlZmYwOSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNjUuNyAxOTkgMjk4IDE5Mi44IDMwMy4xIDE5Ni41IDI3MSAyMDIuNyAyNjUuNyAxOTkiIHN0eWxlPSJmaWxsOiNmZmVhMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNTMgNjIuNiA1NiA3OC45IDcwLjQgNzIuNiA2Ny41IDU2LjEgNTMgNjIuNiIgc3R5bGU9ImZpbGw6I2FkMDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNzEgMjAyLjcgMzAzLjEgMTk2LjUgMzA3LjkgMjAxLjUgMjc1LjkgMjA3LjggMjcxIDIwMi43IiBzdHlsZT0iZmlsbDojZmJmMTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE5MSAzMTkuMyAxODcuNCAzMjcuNSAxODIuOSAzNDguNSAxODYuMyAzNDEuMiAxOTEgMzE5LjMiIHN0eWxlPSJmaWxsOiMwY2Y0ZWIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjU4IDI0My44IDI4OS43IDIzNy45IDI5MS4zIDI0Ni45IDI1OS43IDI1My4yIDI1OCAyNDMuOCIgc3R5bGU9ImZpbGw6I2FhZmY0ZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMDQuMSAyOTYuMiAyMjkuOSAyODguNSAyMjcuOSAyOTcuNSAyMDIgMzA1LjggMjA0LjEgMjk2LjIiIHN0eWxlPSJmaWxsOiM0ZGZmYWEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTcxLjMgMzcxLjEgMTY0LjggMzcxLjkgMTU3LjMgMzg2LjYgMTYzLjMgMzg2LjYgMTcxLjMgMzcxLjEiIHN0eWxlPSJmaWxsOiMwOGYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iOTYuOSA0MS4xIDk4LjYgNTYuMyAxMTQuNCA2My4xIDExMi42IDQ3LjggOTYuOSA0MS4xIiBzdHlsZT0iZmlsbDptYXJvb24iLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDMuMSAyOTAuNSA1Ni43IDI4Ny4xIDU1LjggMjczIDQyLjEgMjc1IDQzLjEgMjkwLjUiIHN0eWxlPSJmaWxsOiM2NmZmOTAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTgyLjkgMzQ4LjUgMTc3LjUgMzUzLjEgMTcxLjMgMzcxLjEgMTc2LjMgMzY3LjQgMTgyLjkgMzQ4LjUiIHN0eWxlPSJmaWxsOiMwMGI4ZmYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQ3LjIgMzUyLjYgMTU3LjUgMzQyLjQgMTUyIDM0OS44IDE0MS4yIDM2MC43IDE0Ny4yIDM1Mi42IiBzdHlsZT0iZmlsbDojMDBjOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzMSAyNjkgMjYwLjUgMjYyLjcgMjYwLjQgMjcyIDIzMC45IDI3OSAyMzEgMjY5IiBzdHlsZT0iZmlsbDojN2RmZjdhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI3LjkgMjkzLjIgMzMuOCAyOTIuNiAzMi42IDI3NS44IDI2LjYgMjc0LjkgMjcuOSAyOTMuMiIgc3R5bGU9ImZpbGw6IzYwZmY5NyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTAuOCAyMDIuNyAyNDQuMyAxOTguNCAyNDkuNSAxOTYuNCAyMTYuMSAyMDAuNiAyMTAuOCAyMDIuNyIgc3R5bGU9ImZpbGw6I2ZmZWEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDIuNSA3My44IDE0NC4xIDg4LjkgMTU3LjMgMTA3LjQgMTU1LjcgOTIuMiAxNDIuNSA3My44IiBzdHlsZT0iZmlsbDojZGYwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzLjggMjkyLjYgNDMuMSAyOTAuNSA0Mi4xIDI3NSAzMi42IDI3NS44IDMzLjggMjkyLjYiIHN0eWxlPSJmaWxsOiM2M2ZmOTQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjAuNiAyNjcuNCAyMyAyNzIuMiAyMy40IDI1Mi44IDIxLjEgMjQ2LjcgMjAuNiAyNjcuNCIgc3R5bGU9ImZpbGw6IzkwZmY2NiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODEgMzE0LjQgMjAyIDMwNS44IDE5OSAzMTQuNSAxNzcuOCAzMjMuOSAxODEgMzE0LjQiIHN0eWxlPSJmaWxsOiMyY2ZmY2EiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTI5LjkgMjMxLjYgMTYxLjIgMjI4LjcgMTY0LjMgMjIxIDEzMy4zIDIyMy4zIDEyOS45IDIzMS42IiBzdHlsZT0iZmlsbDojZDFmZjI2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI1LjUgMTM3IDI4LjggMTUyLjUgMzguMSAxMzUuOSAzNSAxMTkuOSAyNS41IDEzNyIgc3R5bGU9ImZpbGw6I2ZmNjAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjIuMSAzMzMuNCAxNzcuOCAzMjMuOSAxNzMuNiAzMzIuMSAxNTcuNSAzNDIuNCAxNjIuMSAzMzMuNCIgc3R5bGU9ImZpbGw6IzBjZjRlYiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTIuNiA0Ny44IDExNC40IDYzLjEgMTI5LjcgNzQgMTI4IDU4LjggMTEyLjYgNDcuOCIgc3R5bGU9ImZpbGw6IzkyMDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjguMyAyMTQuNCAyMDEuNSAyMTEuMyAyMDUuOSAyMDYuMyAxNzIuOSAyMDkuMSAxNjguMyAyMTQuNCIgc3R5bGU9ImZpbGw6I2VlZmYwOSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNTUuNSAyMzQuOCAyODcuMyAyMjkuMyAyODkuNyAyMzcuOSAyNTggMjQzLjggMjU1LjUgMjM0LjgiIHN0eWxlPSJmaWxsOiNjMWZmMzYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTUwLjkgMzgzLjggMTQ1LjQgMzc4LjUgMTM3LjYgMzg4LjkgMTQyLjUgMzk1IDE1MC45IDM4My44IiBzdHlsZT0iZmlsbDojMDA3Y2ZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyOCA1OC44IDEyOS43IDc0IDE0NC4xIDg4LjkgMTQyLjUgNzMuOCAxMjggNTguOCIgc3R5bGU9ImZpbGw6I2IyMDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTIuMiAyMTkuMyAxOTIuNiAyMzMuNCAxOTUgMjU5LjIgMTk0LjcgMjQ1LjcgMTkyLjIgMjE5LjMiIHN0eWxlPSJmaWxsOiNjMWZmMzYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNTUuOCAyNzMgNzQuMyAyNjkuOSA3NC43IDI1Ny4zIDU2LjIgMjU5LjEgNTUuOCAyNzMiIHN0eWxlPSJmaWxsOiM4YWZmNmQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjE2LjEgMjAwLjYgMjQ5LjUgMTk2LjQgMjU0LjkgMTk1LjggMjIxLjcgMjAwIDIxNi4xIDIwMC42IiBzdHlsZT0iZmlsbDojZmZlMjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijk5LjcgMjQzLjUgMTI3LjUgMjQwLjkgMTI5LjkgMjMxLjYgMTAyLjMgMjMzLjQgOTkuNyAyNDMuNSIgc3R5bGU9ImZpbGw6I2JlZmYzOSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDIuNCAzNjIuNCAxNDcuMiAzNTIuNiAxNDEuMiAzNjAuNyAxMzUuOCAzNzEuMyAxNDIuNCAzNjIuNCIgc3R5bGU9ImZpbGw6IzAwYjRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzguNCAxNTIuNiAxODAgMTY4IDE4Ny4zIDE5My4xIDE4NS44IDE3OCAxNzguNCAxNTIuNiIgc3R5bGU9ImZpbGw6I2ZmYTMwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOS4xIDIzOC41IDIxLjEgMjQ2LjcgMjMuNiAyMjYuOCAyMS43IDIxNy40IDE5LjEgMjM4LjUiIHN0eWxlPSJmaWxsOiNjN2ZmMzAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNzQuNyAyNTcuMyA5OC4xIDI1NC41IDk5LjcgMjQzLjUgNzYuNCAyNDUuMiA3NC43IDI1Ny4zIiBzdHlsZT0iZmlsbDojYTdmZjUwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxLjYgMTcxLjggMjQuNCAxODUuNSAzMS40IDE2NyAyOC44IDE1Mi41IDIxLjYgMTcxLjgiIHN0eWxlPSJmaWxsOiNmZmEzMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjA1LjIgMjg1LjkgMjMwLjkgMjc5IDIyOS45IDI4OC42IDIwNC4xIDI5Ni4yIDIwNS4yIDI4NS45IiBzdHlsZT0iZmlsbDojNjNmZjk0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzMC4xIDI1OSAyNTkuNyAyNTMuMiAyNjAuNSAyNjIuNyAyMzEgMjY5IDIzMC4xIDI1OSIgc3R5bGU9ImZpbGw6Izk3ZmY2MCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOS41IDIwNi4xIDIxLjcgMjE3LjQgMjYuNCAxOTcuOCAyNC40IDE4NS41IDE5LjUgMjA2LjEiIHN0eWxlPSJmaWxsOiNmZmVhMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjUyLjIgMjI2LjUgMjg0LjIgMjIxLjIgMjg3LjMgMjI5LjMgMjU1LjUgMjM0LjggMjUyLjIgMjI2LjUiIHN0eWxlPSJmaWxsOiNkNGZmMjMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQ1LjQgMzc4LjUgMTQyLjEgMzcxLjIgMTM1IDM4MC44IDEzNy42IDM4OC45IDE0NS40IDM3OC41IiBzdHlsZT0iZmlsbDojMDA5MGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0Mi4xIDM3MS4yIDE0Mi4zIDM2Mi40IDEzNS44IDM3MS4zIDEzNSAzODAuOSAxNDIuMSAzNzEuMiIgc3R5bGU9ImZpbGw6IzAwYTBmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMjEuNyAyMDAgMjU0LjkgMTk1LjggMjYwLjMgMTk2LjcgMjI3LjMgMjAwLjkgMjIxLjcgMjAwIiBzdHlsZT0iZmlsbDojZmZkZTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzIDI3Mi4yIDI2LjYgMjc0LjkgMjcuMSAyNTYuOSAyMy40IDI1Mi44IDIzIDI3Mi4yIiBzdHlsZT0iZmlsbDojOGRmZjZhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzMy4zIDIyMy4yIDE2NC4zIDIyMSAxNjguMyAyMTQuNCAxMzcuNSAyMTYuMSAxMzMuMyAyMjMuMiIgc3R5bGU9ImZpbGw6I2U0ZmYxMyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzIuOSAyMDkuMSAyMDUuOSAyMDYuMyAyMTAuOCAyMDIuNyAxNzguMSAyMDUuMyAxNzIuOSAyMDkuMSIgc3R5bGU9ImZpbGw6I2ZlZWQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0Mi4xIDI3NSA1NS44IDI3MyA1Ni4yIDI1OS4xIDQyLjUgMjU5LjggNDIuMSAyNzUiIHN0eWxlPSJmaWxsOiM4YWZmNmQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTUyLjIgMzQyLjggMTYyLjEgMzMzLjQgMTU3LjUgMzQyLjQgMTQ3LjIgMzUyLjYgMTUyLjIgMzQyLjgiIHN0eWxlPSJmaWxsOiMwMmU4ZjQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTY0LjggMzcxLjkgMTU4IDM3MC4xIDE1MC45IDM4My44IDE1Ny4zIDM4Ni42IDE2NC44IDM3MS45IiBzdHlsZT0iZmlsbDojMDA5OGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4My4zIDMwMy45IDIwNC4xIDI5Ni4yIDIwMiAzMDUuOCAxODEgMzE0LjQgMTgzLjMgMzAzLjkiIHN0eWxlPSJmaWxsOiM0NmZmYjEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjQ4LjEgMjE5IDI4MC4zIDIxNCAyODQuMiAyMjEuMiAyNTIuMiAyMjYuNSAyNDguMSAyMTkiIHN0eWxlPSJmaWxsOiNlNGZmMTMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNjcuNSA1Ni4xIDcwLjQgNzIuNiA4NS41IDcwLjUgODIuOCA1NCA2Ny41IDU2LjEiIHN0eWxlPSJmaWxsOiM5MjAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDIuOSA4OS40IDQ2LjMgMTA2IDU5LjEgOTUuOCA1NiA3OC45IDQyLjkgODkuNCIgc3R5bGU9ImZpbGw6I2RmMDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMjcuMyAyMDAuOSAyNjAuMyAxOTYuNyAyNjUuOCAxOTkgMjMzIDIwMy4zIDIyNy4zIDIwMC45IiBzdHlsZT0iZmlsbDojZmZkZTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2NS43IDMyMyAxODEgMzE0LjQgMTc3LjggMzIzLjkgMTYyLjEgMzMzLjQgMTY1LjcgMzIzIiBzdHlsZT0iZmlsbDojMjZmZmQxIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE5NSAyNTkuMiAxOTMuNSAyNzEuMiAxOTMuNCAyOTUuOCAxOTQuOSAyODQuNiAxOTUgMjU5LjIiIHN0eWxlPSJmaWxsOiM4M2ZmNzMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjQzLjUgMjEyLjUgMjc1LjkgMjA3LjggMjgwLjMgMjE0IDI0OC4xIDIxOSAyNDMuNSAyMTIuNSIgc3R5bGU9ImZpbGw6I2YxZmMwNiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMzMgMjAzLjMgMjY1LjggMTk5IDI3MSAyMDIuOCAyMzguNCAyMDcuMiAyMzMgMjAzLjMiIHN0eWxlPSJmaWxsOiNmZmU2MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjYuNiAyNzQuOSAzMi42IDI3NS44IDMzLjEgMjU5LjIgMjcuMSAyNTYuOSAyNi42IDI3NC45IiBzdHlsZT0iZmlsbDojOGRmZjZhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMyLjYgMjc1LjggNDIuMSAyNzUgNDIuNSAyNTkuOCAzMy4xIDI1OS4yIDMyLjYgMjc1LjgiIHN0eWxlPSJmaWxsOiM4ZGZmNmEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjI4LjMgMjQ5IDI1OCAyNDMuOCAyNTkuNyAyNTMuMiAyMzAuMSAyNTkgMjI4LjMgMjQ5IiBzdHlsZT0iZmlsbDojYWRmZjQ5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzOC40IDIwNy4yIDI3MSAyMDIuNyAyNzUuOSAyMDcuOCAyNDMuNSAyMTIuNSAyMzguNCAyMDcuMiIgc3R5bGU9ImZpbGw6I2ZlZWQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMDIuMyAyMzMuNCAxMjkuOSAyMzEuNiAxMzMuMyAyMjMuMyAxMDUuOSAyMjQuMyAxMDIuMyAyMzMuNCIgc3R5bGU9ImZpbGw6I2Q3ZmYxZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMDUuMiAyNzUuMSAyMzEgMjY5IDIzMC45IDI3OSAyMDUuMiAyODUuOSAyMDUuMiAyNzUuMSIgc3R5bGU9ImZpbGw6IzdkZmY3YSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI1Ni4yIDI1OS4xIDc0LjcgMjU3LjMgNzYuNCAyNDUuMiA1OCAyNDUuOSA1Ni4yIDI1OS4xIiBzdHlsZT0iZmlsbDojYWFmZjRkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE3Ny41IDM1My4xIDE3MC43IDM1NSAxNjQuOCAzNzEuOSAxNzEuMyAzNzEuMSAxNzcuNSAzNTMuMSIgc3R5bGU9ImZpbGw6IzAwYzRmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzguMSAyMDUuMyAyMTAuOCAyMDIuNyAyMTYuMSAyMDAuNiAxODMuNyAyMDMgMTc4LjEgMjA1LjMiIHN0eWxlPSJmaWxsOiNmZmUyMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNzYuNCAyNDUuMiA5OS43IDI0My41IDEwMi4zIDIzMy40IDc5LjIgMjM0LjEgNzYuNCAyNDUuMiIgc3R5bGU9ImZpbGw6I2M0ZmYzMyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDcuOCAzNTEuNiAxNTIuMiAzNDIuOCAxNDcuMiAzNTIuNiAxNDIuMyAzNjIuNCAxNDcuOCAzNTEuNiIgc3R5bGU9ImZpbGw6IzAwZDhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTMuNCAyOTUuOCAxODkuNyAzMDQuOSAxODcuNCAzMjcuNSAxOTEgMzE5LjMgMTkzLjQgMjk1LjgiIHN0eWxlPSJmaWxsOiM0NmZmYjEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjEuMSAyNDYuNyAyMy40IDI1Mi44IDI1LjggMjM0LjIgMjMuNiAyMjYuOCAyMS4xIDI0Ni43IiBzdHlsZT0iZmlsbDojYzFmZjM2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2OC44IDEyOC44IDE3MC42IDE0NC41IDE4MCAxNjggMTc4LjQgMTUyLjYgMTY4LjggMTI4LjgiIHN0eWxlPSJmaWxsOiNmZjY0MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTM3LjUgMjE2LjEgMTY4LjMgMjE0LjQgMTcyLjkgMjA5LjEgMTQyLjQgMjEwLjQgMTM3LjUgMjE2LjEiIHN0eWxlPSJmaWxsOiNmOGY1MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTU4IDM3MC4xIDE1MS45IDM2NS44IDE0NS40IDM3OC41IDE1MC45IDM4My44IDE1OCAzNzAuMSIgc3R5bGU9ImZpbGw6IzAwYThmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODcuNCAzMjcuNSAxODEuNyAzMzMuMSAxNzcuNSAzNTMuMSAxODIuOSAzNDguNSAxODcuNCAzMjcuNSIgc3R5bGU9ImZpbGw6IzBmZjhlNyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMjUuNiAyMzkuNSAyNTUuNSAyMzQuOCAyNTggMjQzLjggMjI4LjMgMjQ5IDIyNS42IDIzOS41IiBzdHlsZT0iZmlsbDojYzRmZjMzIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4NC40IDI5Mi43IDIwNS4yIDI4NS45IDIwNC4xIDI5Ni4yIDE4My4zIDMwMy45IDE4NC40IDI5Mi43IiBzdHlsZT0iZmlsbDojNjNmZjk0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4Ny4zIDE5My4xIDE4Ny44IDIwNy44IDE5Mi42IDIzMy4zIDE5Mi4yIDIxOS4zIDE4Ny4zIDE5My4xIiBzdHlsZT0iZmlsbDojZmZlYTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM1IDExOS45IDM4LjEgMTM1LjkgNDkuMSAxMjIuNSA0Ni4zIDEwNiAzNSAxMTkuOSIgc3R5bGU9ImZpbGw6I2ZmMzAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDguMSAzNTkuNSAxNDcuOCAzNTEuNiAxNDIuNCAzNjIuNCAxNDIuMSAzNzEuMiAxNDguMSAzNTkuNSIgc3R5bGU9ImZpbGw6IzAwYzhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODMuNyAyMDMgMjE2LjEgMjAwLjYgMjIxLjcgMjAwIDE4OS42IDIwMi40IDE4My43IDIwMyIgc3R5bGU9ImZpbGw6I2ZmZGIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTEuOSAzNjUuOCAxNDguMSAzNTkuNSAxNDIuMSAzNzEuMiAxNDUuNCAzNzguNSAxNTEuOSAzNjUuOCIgc3R5bGU9ImZpbGw6IzAwYjhmZiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTYuMSAzMzEuNCAxNjUuNiAzMjMgMTYyLjEgMzMzLjQgMTUyLjIgMzQyLjggMTU2LjEgMzMxLjQiIHN0eWxlPSJmaWxsOiMxY2ZmZGIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDIuNSAyNTkuOCA1Ni4yIDI1OS4xIDU4IDI0NS45IDQ0LjQgMjQ1LjMgNDIuNSAyNTkuOCIgc3R5bGU9ImZpbGw6I2FkZmY0OSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4Mi44IDU0IDg1LjUgNzAuNSAxMDEuMSA3Mi44IDk4LjYgNTYuMyA4Mi44IDU0IiBzdHlsZT0iZmlsbDojODQwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIwNC4yIDI2NC4zIDIzMC4xIDI1OSAyMzEgMjY5IDIwNS4yIDI3NS4xIDIwNC4yIDI2NC4zIiBzdHlsZT0iZmlsbDojOTdmZjYwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2OC4xIDMxMS41IDE4My4yIDMwMy45IDE4MSAzMTQuNCAxNjUuNiAzMjMgMTY4LjEgMzExLjUiIHN0eWxlPSJmaWxsOiM0M2ZmYjQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjEuNyAyMTcuNCAyMy42IDIyNi44IDI4IDIwOC4zIDI2LjQgMTk3LjggMjEuNyAyMTcuNCIgc3R5bGU9ImZpbGw6I2ZiZjEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMjIgMjMwLjYgMjUyLjIgMjI2LjUgMjU1LjUgMjM0LjggMjI1LjYgMjM5LjUgMjIyIDIzMC42IiBzdHlsZT0iZmlsbDojZDdmZjFmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwNS45IDIyNC4zIDEzMy4zIDIyMy4yIDEzNy41IDIxNi4xIDExMC40IDIxNi41IDEwNS45IDIyNC4zIiBzdHlsZT0iZmlsbDojZWVmZjA5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzLjQgMjUyLjggMjcuMSAyNTYuOSAyOS4yIDIzOS43IDI1LjggMjM0LjIgMjMuNCAyNTIuOCIgc3R5bGU9ImZpbGw6I2JlZmYzOSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDIuNCAyMTAuNCAxNzIuOSAyMDkuMSAxNzguMSAyMDUuMyAxNDggMjA2LjMgMTQyLjQgMjEwLjQiIHN0eWxlPSJmaWxsOiNmZmU2MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTg5LjYgMjAyLjQgMjIxLjcgMjAwIDIyNy4zIDIwMC45IDE5NS42IDIwMy4zIDE4OS42IDIwMi40IiBzdHlsZT0iZmlsbDpnb2xkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI4LjggMTUyLjUgMzEuNCAxNjcgNDAuMyAxNTEuMSAzOC4xIDEzNS45IDI4LjggMTUyLjUiIHN0eWxlPSJmaWxsOiNmZjZjMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNTggMjQ1LjkgNzYuNCAyNDUuMiA3OS4yIDIzNC4xIDYxIDIzMy42IDU4IDI0NS45IiBzdHlsZT0iZmlsbDojY2FmZjJjIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjMzLjEgMjU5LjIgNDIuNSAyNTkuOCA0NC40IDI0NS4zIDM1LjEgMjQzLjMgMzMuMSAyNTkuMiIgc3R5bGU9ImZpbGw6I2I0ZmY0MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNC40IDE4NS41IDI2LjQgMTk3LjggMzMuMSAxODAuMiAzMS40IDE2NyAyNC40IDE4NS41IiBzdHlsZT0iZmlsbDojZmZhZTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijc5LjIgMjM0LjEgMTAyLjMgMjMzLjQgMTA1LjkgMjI0LjMgODMuMSAyMjQuMSA3OS4yIDIzNC4xIiBzdHlsZT0iZmlsbDojZGVmZjE5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1Ny4zIDEwNy40IDE1OS4yIDEyMy4zIDE3MC42IDE0NC41IDE2OC44IDEyOC44IDE1Ny4zIDEwNy40IiBzdHlsZT0iZmlsbDojZmYyZDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIxNy43IDIyMi42IDI0OC4xIDIxOSAyNTIuMiAyMjYuNSAyMjIgMjMwLjYgMjE3LjcgMjIyLjYiIHN0eWxlPSJmaWxsOiNlYmZmMGMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTcwLjcgMzU1IDE2My40IDM1NC4yIDE1OCAzNzAuMSAxNjQuOCAzNzEuOSAxNzAuNyAzNTUiIHN0eWxlPSJmaWxsOiMwY2YiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNTYgNzguOSA1OS4xIDk1LjggNzMuMiA4OS43IDcwLjQgNzIuNiA1NiA3OC45IiBzdHlsZT0iZmlsbDojYjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI3LjEgMjU2LjkgMzMuMSAyNTkuMiAzNS4xIDI0My4zIDI5LjIgMjM5LjcgMjcuMSAyNTYuOSIgc3R5bGU9ImZpbGw6I2I3ZmY0MCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTUuNiAyMDMuMyAyMjcuMyAyMDAuOSAyMzMgMjAzLjMgMjAxLjYgMjA1LjkgMTk1LjYgMjAzLjMiIHN0eWxlPSJmaWxsOmdvbGQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTg0LjQgMjgwLjkgMjA1LjIgMjc1LjEgMjA1LjIgMjg1LjkgMTg0LjQgMjkyLjcgMTg0LjQgMjgwLjkiIHN0eWxlPSJmaWxsOiM3ZGZmN2EiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjAyLjIgMjUzLjUgMjI4LjMgMjQ5IDIzMC4xIDI1OSAyMDQuMiAyNjQuMyAyMDIuMiAyNTMuNSIgc3R5bGU9ImZpbGw6I2IxZmY0NiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTIuMSAzMzkuMiAxNTYuMSAzMzEuNCAxNTIuMiAzNDIuOCAxNDcuOCAzNTEuNiAxNTIuMSAzMzkuMiIgc3R5bGU9ImZpbGw6IzE2ZmZlMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyMTIuOCAyMTUuNyAyNDMuNSAyMTIuNSAyNDguMSAyMTkgMjE3LjcgMjIyLjYgMjEyLjggMjE1LjciIHN0eWxlPSJmaWxsOiNmOGY1MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjAxLjYgMjA1LjkgMjMzIDIwMy4zIDIzOC40IDIwNy4yIDIwNy4zIDIxMC4xIDIwMS42IDIwNS45IiBzdHlsZT0iZmlsbDojZmZkYjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijk4LjYgNTYuMyAxMDEuMSA3Mi45IDExNi43IDc5LjUgMTE0LjQgNjMuMSA5OC42IDU2LjMiIHN0eWxlPSJmaWxsOiM4OTAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjA3LjMgMjEwLjEgMjM4LjQgMjA3LjIgMjQzLjUgMjEyLjUgMjEyLjggMjE1LjcgMjA3LjMgMjEwLjEiIHN0eWxlPSJmaWxsOiNmZmU2MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTkyLjYgMjMzLjQgMTkxLjEgMjQ2LjIgMTkzLjUgMjcxLjIgMTk1IDI1OS4yIDE5Mi42IDIzMy40IiBzdHlsZT0iZmlsbDojYzFmZjM2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0OCAyMDYuMyAxNzguMSAyMDUuMyAxODMuNyAyMDMgMTU0IDIwMy44IDE0OCAyMDYuMyIgc3R5bGU9ImZpbGw6Z29sZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTAuNCAyMTYuNSAxMzcuNSAyMTYuMSAxNDIuNCAyMTAuNCAxMTUuOCAyMTAuMyAxMTAuNCAyMTYuNSIgc3R5bGU9ImZpbGw6I2ZmZWEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjkuMyAyOTkuMiAxODQuNCAyOTIuNyAxODMuMiAzMDMuOSAxNjguMSAzMTEuNSAxNjkuMyAyOTkuMiIgc3R5bGU9ImZpbGw6IzYwZmY5NyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTguNyAzMTguOCAxNjguMSAzMTEuNSAxNjUuNiAzMjMgMTU2LjEgMzMxLjQgMTU4LjcgMzE4LjgiIHN0eWxlPSJmaWxsOiMzY2ZmYmEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQ0LjEgODguOSAxNDYuMiAxMDUuMSAxNTkuMiAxMjMuMyAxNTcuMyAxMDcuNCAxNDQuMSA4OC45IiBzdHlsZT0iZmlsbDojZTQwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2My40IDM1NC4yIDE1NyAzNTEgMTUxLjkgMzY1LjggMTU4IDM3MC4xIDE2My40IDM1NC4yIiBzdHlsZT0iZmlsbDojMDBkOGZmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4MS44IDMzMy4xIDE3NC43IDMzNi4xIDE3MC43IDM1NSAxNzcuNSAzNTMuMSAxODEuOCAzMzMuMSIgc3R5bGU9ImZpbGw6IzE2ZmZlMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTIuNyAzNDUuOSAxNTIuMSAzMzkuMiAxNDcuOCAzNTEuNiAxNDguMSAzNTkuNSAxNTIuNyAzNDUuOSIgc3R5bGU9ImZpbGw6IzBjZjRlYiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0NC40IDI0NS4zIDU4IDI0NS45IDYxIDIzMy42IDQ3LjcgMjMxLjkgNDQuNCAyNDUuMyIgc3R5bGU9ImZpbGw6I2QxZmYyNiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTQuNCA2My4xIDExNi43IDc5LjUgMTMxLjkgOTAuNCAxMjkuNyA3NCAxMTQuNCA2My4xIiBzdHlsZT0iZmlsbDojOWIwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjIzLjYgMjI2LjggMjUuOCAyMzQuMiAyOS45IDIxNyAyOCAyMDguMyAyMy42IDIyNi44IiBzdHlsZT0iZmlsbDojZjRmODAyIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE5OS4yIDI0My4yIDIyNS42IDIzOS41IDIyOC4zIDI0OSAyMDIuMiAyNTMuNSAxOTkuMiAyNDMuMiIgc3R5bGU9ImZpbGw6I2M3ZmYzMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODAgMTY4IDE4MC43IDE4My4xIDE4Ny44IDIwNy44IDE4Ny4zIDE5My4xIDE4MCAxNjgiIHN0eWxlPSJmaWxsOiNmZmE3MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTI5LjcgNzQgMTMxLjkgOTAuNCAxNDYuMiAxMDUuMSAxNDQuMSA4OC45IDEyOS43IDc0IiBzdHlsZT0iZmlsbDojYjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1NyAzNTEgMTUyLjcgMzQ1LjkgMTQ4LjEgMzU5LjUgMTUxLjkgMzY1LjggMTU3IDM1MSIgc3R5bGU9ImZpbGw6IzAyZThmNCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTMuNSAyNzEuMiAxODkuNyAyODEuMyAxODkuNyAzMDQuOSAxOTMuNCAyOTUuOCAxOTMuNSAyNzEuMiIgc3R5bGU9ImZpbGw6IzgwZmY3NyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4My4xIDIyNC4xIDEwNS45IDIyNC4zIDExMC40IDIxNi41IDg4IDIxNS42IDgzLjEgMjI0LjEiIHN0eWxlPSJmaWxsOiNmOGY1MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTgzLjMgMjY5LjEgMjA0LjIgMjY0LjMgMjA1LjIgMjc1LjEgMTg0LjQgMjgwLjkgMTgzLjMgMjY5LjEiIHN0eWxlPSJmaWxsOiM5YWZmNWQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTg5LjcgMzA0LjkgMTgzLjkgMzExLjYgMTgxLjggMzMzLjEgMTg3LjQgMzI3LjUgMTg5LjcgMzA0LjkiIHN0eWxlPSJmaWxsOiM0OWZmYWQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTU0IDIwMy44IDE4My43IDIwMyAxODkuNiAyMDIuNCAxNjAuMyAyMDMuMSAxNTQgMjAzLjgiIHN0eWxlPSJmaWxsOiNmZmQwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNjEgMjMzLjYgNzkuMiAyMzQuMSA4My4xIDIyNC4xIDY1LjMgMjIyLjYgNjEgMjMzLjYiIHN0eWxlPSJmaWxsOiNlN2ZmMGYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDYuMyAxMDYgNDkuMSAxMjIuNSA2MS42IDExMi43IDU5LjEgOTUuOCA0Ni4zIDEwNiIgc3R5bGU9ImZpbGw6I2YxMDgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzNS4xIDI0My4zIDQ0LjQgMjQ1LjMgNDcuNyAyMzEuOCAzOC43IDIyOC42IDM1LjEgMjQzLjMiIHN0eWxlPSJmaWxsOiNkYmZmMWMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTk1LjQgMjMzLjYgMjIyIDIzMC42IDIyNS42IDIzOS41IDE5OS4yIDI0My4yIDE5NS40IDIzMy42IiBzdHlsZT0iZmlsbDojZGVmZjE5Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjExNS44IDIxMC4zIDE0Mi40IDIxMC40IDE0OCAyMDYuMyAxMjEuOCAyMDUuOCAxMTUuOCAyMTAuMyIgc3R5bGU9ImZpbGw6Z29sZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNS44IDIzNC4yIDI5LjIgMjM5LjcgMzMuMSAyMjMuNyAyOS45IDIxNyAyNS44IDIzNC4yIiBzdHlsZT0iZmlsbDojZWJmZjBjIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjcwLjQgNzIuNiA3My4yIDg5LjYgODguMSA4Ny43IDg1LjUgNzAuNSA3MC40IDcyLjYiIHN0eWxlPSJmaWxsOiM5ZjAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTU1IDMyNS4zIDE1OC43IDMxOC44IDE1Ni4xIDMzMS40IDE1Mi4xIDMzOS4yIDE1NSAzMjUuMyIgc3R5bGU9ImZpbGw6IzM2ZmZjMSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIyNi40IDE5Ny44IDI4IDIwOC4zIDM0LjMgMTkxLjggMzMuMSAxODAuMiAyNi40IDE5Ny44IiBzdHlsZT0iZmlsbDojZmZiOTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2MC4zIDIwMy4xIDE4OS42IDIwMi40IDE5NS42IDIwMy4zIDE2Ni44IDIwNC4yIDE2MC4zIDIwMy4xIiBzdHlsZT0iZmlsbDojZmMwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2OS4zIDI4Ni4zIDE4NC40IDI4MC45IDE4NC40IDI5Mi43IDE2OS4zIDI5OS4yIDE2OS4zIDI4Ni4zIiBzdHlsZT0iZmlsbDojODBmZjc3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI5LjIgMjM5LjcgMzUuMSAyNDMuMyAzOC43IDIyOC42IDMzLjEgMjIzLjcgMjkuMiAyMzkuNyIgc3R5bGU9ImZpbGw6I2UxZmYxNiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTAuNyAyMjUgMjE3LjcgMjIyLjYgMjIyIDIzMC42IDE5NS40IDIzMy42IDE5MC43IDIyNSIgc3R5bGU9ImZpbGw6I2YxZmMwNiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjAuMSAzMDUuMiAxNjkuMyAyOTkuMiAxNjguMSAzMTEuNSAxNTguNyAzMTguOCAxNjAuMSAzMDUuMiIgc3R5bGU9ImZpbGw6IzVkZmY5YSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzOC4xIDEzNS45IDQwLjMgMTUxLjEgNTAuOSAxMzguMyA0OS4xIDEyMi41IDM4LjEgMTM1LjkiIHN0eWxlPSJmaWxsOiNmZjNiMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc0LjcgMzM2LjEgMTY3LjEgMzM2LjUgMTYzLjQgMzU0LjIgMTcwLjcgMzU1IDE3NC43IDMzNi4xIiBzdHlsZT0iZmlsbDojMWNmZmRiIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4MS4xIDI1Ny4zIDIwMi4yIDI1My41IDIwNC4yIDI2NC4zIDE4My4zIDI2OS4xIDE4MS4xIDI1Ny4zIiBzdHlsZT0iZmlsbDojYjdmZjQwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2Ni44IDIwNC4yIDE5NS42IDIwMy4zIDIwMS42IDIwNS45IDE3My4yIDIwNyAxNjYuOCAyMDQuMiIgc3R5bGU9ImZpbGw6I2ZjMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMS40IDE2NyAzMy4xIDE4MC4yIDQxLjYgMTY1LjEgNDAuMyAxNTEuMSAzMS40IDE2NyIgc3R5bGU9ImZpbGw6I2ZmN2EwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODUuNCAyMTcuNSAyMTIuOCAyMTUuNyAyMTcuNyAyMjIuNiAxOTAuNyAyMjUgMTg1LjQgMjE3LjUiIHN0eWxlPSJmaWxsOiNmZmVhMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iODggMjE1LjYgMTEwLjQgMjE2LjUgMTE1LjggMjEwLjMgOTMuOSAyMDguNyA4OCAyMTUuNiIgc3R5bGU9ImZpbGw6I2ZmZGIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzMuMiAyMDcgMjAxLjYgMjA1LjkgMjA3LjMgMjEwLjEgMTc5LjUgMjExLjUgMTczLjIgMjA3IiBzdHlsZT0iZmlsbDojZmZkMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQ3LjcgMjMxLjkgNjEgMjMzLjYgNjUuMyAyMjIuNiA1Mi4zIDIxOS44IDQ3LjcgMjMxLjkiIHN0eWxlPSJmaWxsOiNmNGY4MDIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc5LjUgMjExLjUgMjA3LjMgMjEwLjEgMjEyLjggMjE1LjcgMTg1LjQgMjE3LjUgMTc5LjUgMjExLjUiIHN0eWxlPSJmaWxsOiNmZmRiMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTIxLjggMjA1LjggMTQ4IDIwNi4zIDE1NCAyMDMuOCAxMjguMyAyMDMuMSAxMjEuOCAyMDUuOCIgc3R5bGU9ImZpbGw6I2ZmYzgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzAuNiAxNDQuNSAxNzEuNCAxNjAuMiAxODAuNyAxODMuMSAxODAgMTY4IDE3MC42IDE0NC41IiBzdHlsZT0iZmlsbDojZmY2YzAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4Ny44IDIwNy44IDE4Ni41IDIyMS40IDE5MS4xIDI0Ni4yIDE5Mi42IDIzMy40IDE4Ny44IDIwNy44IiBzdHlsZT0iZmlsbDojZmJmMTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1NS45IDMzMC44IDE1NSAzMjUuMyAxNTIuMSAzMzkuMiAxNTIuNyAzNDUuOSAxNTUuOSAzMzAuOCIgc3R5bGU9ImZpbGw6IzMwZmZjNyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI2NS4zIDIyMi42IDgzLjEgMjI0LjEgODggMjE1LjYgNzAuNyAyMTMuMyA2NS4zIDIyMi42IiBzdHlsZT0iZmlsbDojZmZlNjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2Ny4xIDMzNi41IDE2MC40IDMzNC42IDE1NyAzNTEgMTYzLjQgMzU0LjIgMTY3LjEgMzM2LjUiIHN0eWxlPSJmaWxsOiMyM2ZmZDQiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTYwLjQgMzM0LjYgMTU1LjkgMzMwLjggMTUyLjcgMzQ1LjkgMTU3IDM1MSAxNjAuNCAzMzQuNiIgc3R5bGU9ImZpbGw6IzI5ZmZjZSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzcuOCAyNDYuMSAxOTkuMiAyNDMuMiAyMDIuMiAyNTMuNSAxODEuMSAyNTcuMyAxNzcuOCAyNDYuMSIgc3R5bGU9ImZpbGw6I2QxZmYyNiIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjggMjczLjMgMTgzLjMgMjY5LjEgMTg0LjQgMjgwLjkgMTY5LjMgMjg2LjMgMTY4IDI3My4zIiBzdHlsZT0iZmlsbDojOWRmZjVhIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjI4IDIwOC4zIDI5LjkgMjE3IDM1LjggMjAxLjUgMzQuMyAxOTEuOCAyOCAyMDguMyIgc3R5bGU9ImZpbGw6I2ZmYzQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODMuOSAzMTEuNiAxNzYuNyAzMTUuOCAxNzQuNyAzMzYuMSAxODEuNyAzMzMuMSAxODMuOSAzMTEuNiIgc3R5bGU9ImZpbGw6IzRkZmZhYSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4NS41IDcwLjUgODguMSA4Ny43IDEwMy4zIDkwIDEwMS4xIDcyLjggODUuNSA3MC41IiBzdHlsZT0iZmlsbDojOTIwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyOC4zIDIwMy4xIDE1NCAyMDMuOCAxNjAuMyAyMDMuMSAxMzUuMiAyMDIuMyAxMjguMyAyMDMuMSIgc3R5bGU9ImZpbGw6I2ZmYzEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzOC43IDIyOC42IDQ3LjcgMjMxLjkgNTIuMyAyMTkuOCA0My43IDIxNS40IDM4LjcgMjI4LjYiIHN0eWxlPSJmaWxsOiNmZWVkMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTU2LjQgMzEwLjUgMTYwLjEgMzA1LjIgMTU4LjcgMzE4LjggMTU1IDMyNS4zIDE1Ni40IDMxMC41IiBzdHlsZT0iZmlsbDojNWFmZjlkIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjU5LjEgOTUuOCA2MS42IDExMi43IDc1LjIgMTA2LjcgNzMuMiA4OS43IDU5LjEgOTUuOCIgc3R5bGU9ImZpbGw6I2M4MDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxOTEuMSAyNDYuMiAxODcuNSAyNTcuMiAxODkuNyAyODEuMyAxOTMuNSAyNzEuMiAxOTEuMSAyNDYuMiIgc3R5bGU9ImZpbGw6I2JlZmYzOSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjAgMjkxLjEgMTY5LjMgMjg2LjMgMTY5LjMgMjk5LjIgMTYwLjEgMzA1LjIgMTYwIDI5MS4xIiBzdHlsZT0iZmlsbDojODBmZjc3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjkzLjkgMjA4LjcgMTE1LjggMjEwLjMgMTIxLjggMjA1LjggMTAwLjQgMjAzLjggOTMuOSAyMDguNyIgc3R5bGU9ImZpbGw6I2ZmYzgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODkuNyAyODEuMyAxODQgMjg5LjEgMTgzLjkgMzExLjYgMTg5LjcgMzA0LjkgMTg5LjcgMjgxLjMiIHN0eWxlPSJmaWxsOiM4MGZmNzciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTczLjUgMjM1LjYgMTk1LjQgMjMzLjYgMTk5LjMgMjQzLjIgMTc3LjggMjQ2LjEgMTczLjUgMjM1LjYiIHN0eWxlPSJmaWxsOiNlN2ZmMGYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMjkuOSAyMTcgMzMuMSAyMjMuNyAzOC42IDIwOS40IDM1LjggMjAxLjUgMjkuOSAyMTciIHN0eWxlPSJmaWxsOiNmZmQzMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTU5LjIgMTIzLjMgMTYwLjIgMTM5LjUgMTcxLjQgMTYwLjIgMTcwLjYgMTQ0LjUgMTU5LjIgMTIzLjMiIHN0eWxlPSJmaWxsOiNmZjM0MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzMuMSAyMjMuNyAzOC43IDIyOC42IDQzLjcgMjE1LjQgMzguNiAyMDkuNCAzMy4xIDIyMy43IiBzdHlsZT0iZmlsbDojZmZkZTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzNS4yIDIwMi4zIDE2MC4zIDIwMy4xIDE2Ni44IDIwNC4yIDE0Mi4zIDIwMy40IDEzNS4yIDIwMi4zIiBzdHlsZT0iZmlsbDojZmZiOTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjUyLjMgMjE5LjggNjUuMyAyMjIuNiA3MC43IDIxMy4zIDU4LjIgMjA5LjUgNTIuMyAyMTkuOCIgc3R5bGU9ImZpbGw6Z29sZCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI3MC43IDIxMy4zIDg4IDIxNS42IDkzLjkgMjA4LjcgNzcgMjA1LjcgNzAuNyAyMTMuMyIgc3R5bGU9ImZpbGw6I2ZjMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIzMy4xIDE4MC4yIDM0LjMgMTkxLjggNDIuMyAxNzcuNiA0MS42IDE2NS4xIDMzLjEgMTgwLjIiIHN0eWxlPSJmaWxsOiNmZjg2MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTY1LjUgMjYwLjQgMTgxLjEgMjU3LjMgMTgzLjMgMjY5LjEgMTY4IDI3My4zIDE2NS41IDI2MC40IiBzdHlsZT0iZmlsbDojYmFmZjNjIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwMS4xIDcyLjkgMTAzLjMgOTAgMTE4LjYgOTYuNiAxMTYuNyA3OS41IDEwMS4xIDcyLjkiIHN0eWxlPSJmaWxsOiM5NjAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTY4LjQgMjI2LjIgMTkwLjcgMjI1IDE5NS40IDIzMy42IDE3My41IDIzNS42IDE2OC40IDIyNi4yIiBzdHlsZT0iZmlsbDojZmJmMTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1Ny41IDMxNC41IDE1Ni40IDMxMC41IDE1NSAzMjUuMyAxNTUuOSAzMzAuOCAxNTcuNSAzMTQuNSIgc3R5bGU9ImZpbGw6IzU2ZmZhMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzYuNyAzMTUuOCAxNjkgMzE3LjUgMTY3LjEgMzM2LjUgMTc0LjcgMzM2LjEgMTc2LjcgMzE1LjgiIHN0eWxlPSJmaWxsOiM0ZGZmYWEiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNDkuMSAxMjIuNSA1MC45IDEzOC4zIDYyLjkgMTI4LjkgNjEuNiAxMTIuNyA0OS4xIDEyMi41IiBzdHlsZT0iZmlsbDojZmYxMzAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0Mi4zIDIwMy40IDE2Ni44IDIwNC4yIDE3My4yIDIwNyAxNDkuMyAyMDYuNSAxNDIuMyAyMDMuNCIgc3R5bGU9ImZpbGw6I2ZmYmQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODAuNyAxODMuMSAxNzkuNSAxOTcuNSAxODYuNSAyMjEuNCAxODcuOCAyMDcuOCAxODAuNyAxODMuMSIgc3R5bGU9ImZpbGw6I2ZmYWUwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDYuMiAxMDUuMSAxNDcuNSAxMjEuNiAxNjAuMiAxMzkuNSAxNTkuMiAxMjMuMyAxNDYuMiAxMDUuMSIgc3R5bGU9ImZpbGw6I2YxMDgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMDAuNCAyMDMuNyAxMjEuOCAyMDUuOCAxMjguMyAyMDMuMSAxMDcuNiAyMDAuOCAxMDAuNCAyMDMuNyIgc3R5bGU9ImZpbGw6I2ZmYjkwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjIuNSAyMTggMTg1LjQgMjE3LjUgMTkwLjcgMjI1IDE2OC40IDIyNi4yIDE2Mi41IDIxOCIgc3R5bGU9ImZpbGw6I2ZmZGIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0MC4zIDE1MS4xIDQxLjYgMTY1LjEgNTEuNyAxNTMgNTAuOSAxMzguMyA0MC4zIDE1MS4xIiBzdHlsZT0iZmlsbDojZmY0YTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0OS4zIDIwNi41IDE3My4yIDIwNyAxNzkuNSAyMTEuNSAxNTYuMSAyMTEuNCAxNDkuMyAyMDYuNSIgc3R5bGU9ImZpbGw6I2ZmYzEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTYuMSAyMTEuNCAxNzkuNSAyMTEuNSAxODUuNCAyMTcuNSAxNjIuNSAyMTggMTU2LjEgMjExLjQiIHN0eWxlPSJmaWxsOiNmYzAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTE2LjcgNzkuNSAxMTguNiA5Ni42IDEzMy41IDEwNy4yIDEzMS45IDkwLjQgMTE2LjcgNzkuNSIgc3R5bGU9ImZpbGw6I2E0MDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTguNiAyNzYuOCAxNjggMjczLjMgMTY5LjMgMjg2LjMgMTYwIDI5MS4xIDE1OC42IDI3Ni44IiBzdHlsZT0iZmlsbDojYTBmZjU2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzMS45IDkwLjQgMTMzLjUgMTA3LjIgMTQ3LjUgMTIxLjYgMTQ2LjIgMTA1LjEgMTMxLjkgOTAuNCIgc3R5bGU9ImZpbGw6I2M0MDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjIuMSAzMTcgMTU3LjUgMzE0LjUgMTU1LjkgMzMwLjggMTYwLjQgMzM0LjYgMTYyLjEgMzE3IiBzdHlsZT0iZmlsbDojNTNmZmE0Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1Ni4zIDI5NSAxNjAgMjkxLjEgMTYwLjEgMzA1LjIgMTU2LjQgMzEwLjUgMTU2LjMgMjk1IiBzdHlsZT0iZmlsbDojODBmZjc3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2OSAzMTcuNSAxNjIuMSAzMTcgMTYwLjQgMzM0LjYgMTY3LjEgMzM2LjUgMTY5IDMxNy41IiBzdHlsZT0iZmlsbDojNTBmZmE3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2MS45IDI0OC4xIDE3Ny44IDI0Ni4xIDE4MS4xIDI1Ny4zIDE2NS41IDI2MC40IDE2MS45IDI0OC4xIiBzdHlsZT0iZmlsbDojZDdmZjFmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQzLjcgMjE1LjQgNTIuMyAyMTkuOCA1OC4yIDIwOS41IDUwLjIgMjA0LjIgNDMuNyAyMTUuNCIgc3R5bGU9ImZpbGw6I2ZmYzgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI3My4yIDg5LjcgNzUuMiAxMDYuNyA4OS42IDEwNC45IDg4IDg3LjcgNzMuMiA4OS43IiBzdHlsZT0iZmlsbDojYWQwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM0LjMgMTkxLjggMzUuOCAyMDEuNSA0My4zIDE4OC4yIDQyLjMgMTc3LjYgMzQuMyAxOTEuOCIgc3R5bGU9ImZpbGw6I2ZmOTgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI3Ny4xIDIwNS43IDkzLjkgMjA4LjcgMTAwLjQgMjAzLjggODQuMyAyMDAuMiA3Ny4xIDIwNS43IiBzdHlsZT0iZmlsbDojZmZiNjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE4NCAyODkuMSAxNzYuNyAyOTQuNiAxNzYuNyAzMTUuOCAxODMuOSAzMTEuNiAxODQgMjg5LjEiIHN0eWxlPSJmaWxsOiM4MGZmNzciLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTA3LjYgMjAwLjggMTI4LjMgMjAzLjEgMTM1LjIgMjAyLjMgMTE1LjIgMTk5LjkgMTA3LjYgMjAwLjgiIHN0eWxlPSJmaWxsOiNmZmFlMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNTguMiAyMDkuNSA3MC43IDIxMy4zIDc3IDIwNS43IDY1LjIgMjAxLjIgNTguMiAyMDkuNSIgc3R5bGU9ImZpbGw6I2ZmYjkwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODYuNSAyMjEuNCAxODMgMjMzLjQgMTg3LjUgMjU3LjIgMTkxLjEgMjQ2LjIgMTg2LjUgMjIxLjQiIHN0eWxlPSJmaWxsOiNmOGY1MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMzguNiAyMDkuNCA0My43IDIxNS40IDUwLjIgMjA0LjIgNDUuNSAxOTcuMSAzOC42IDIwOS40IiBzdHlsZT0iZmlsbDojZmZiNjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjM1LjggMjAxLjUgMzguNiAyMDkuNCA0NS41IDE5Ny4xIDQzLjMgMTg4LjIgMzUuOCAyMDEuNSIgc3R5bGU9ImZpbGw6I2ZmYTcwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODcuNSAyNTcuMiAxODEuOCAyNjYuMyAxODQgMjg5LjEgMTg5LjcgMjgxLjMgMTg3LjUgMjU3LjIiIHN0eWxlPSJmaWxsOiNiYWZmM2MiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTU3LjIgMjM2LjUgMTczLjUgMjM1LjYgMTc3LjggMjQ2LjEgMTYxLjkgMjQ4LjEgMTU3LjIgMjM2LjUiIHN0eWxlPSJmaWxsOiNmMWZjMDYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTU1LjkgMjYyLjYgMTY1LjUgMjYwLjQgMTY4IDI3My4zIDE1OC42IDI3Ni44IDE1NS45IDI2Mi42IiBzdHlsZT0iZmlsbDojYzFmZjM2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1Ny40IDI5Ny42IDE1Ni4zIDI5NSAxNTYuNCAzMTAuNSAxNTcuNSAzMTQuNSAxNTcuNCAyOTcuNiIgc3R5bGU9ImZpbGw6IzgwZmY3NyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzEuNCAxNjAuMiAxNzAuNSAxNzUuMiAxNzkuNSAxOTcuNSAxODAuNyAxODMuMiAxNzEuNCAxNjAuMiIgc3R5bGU9ImZpbGw6I2ZmNzMwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTUuMiAxOTkuOSAxMzUuMiAyMDIuMyAxNDIuMyAyMDMuNCAxMjIuOSAyMDEuMiAxMTUuMiAxOTkuOSIgc3R5bGU9ImZpbGw6I2ZmYTcwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI0MS42IDE2NS4xIDQyLjMgMTc3LjYgNTEuOSAxNjYuMSA1MS43IDE1MyA0MS42IDE2NS4xIiBzdHlsZT0iZmlsbDojZmY1ZDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1NC44IDI3OS4yIDE1OC42IDI3Ni44IDE2MCAyOTEuMSAxNTYuMyAyOTUgMTU0LjggMjc5LjIiIHN0eWxlPSJmaWxsOiNhNGZmNTMiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNjEuNiAxMTIuNyA2Mi45IDEyOC45IDc2IDEyMy4yIDc1LjIgMTA2LjcgNjEuNiAxMTIuNyIgc3R5bGU9ImZpbGw6I2RhMDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTEuNiAyMjYuMiAxNjguNCAyMjYuMiAxNzMuNSAyMzUuNiAxNTcuMiAyMzYuNSAxNTEuNiAyMjYuMiIgc3R5bGU9ImZpbGw6I2ZmZTIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4NC4zIDIwMC4yIDEwMC40IDIwMy44IDEwNy42IDIwMC44IDkyLjEgMTk3IDg0LjMgMjAwLjIiIHN0eWxlPSJmaWxsOiNmZmEzMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTc2LjcgMjk0LjYgMTY5IDI5Ny43IDE2OSAzMTcuNSAxNzYuNyAzMTUuOCAxNzYuNyAyOTQuNiIgc3R5bGU9ImZpbGw6IzgwZmY3NyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4OCA4Ny43IDg5LjYgMTA0LjggMTA0LjUgMTA3LjEgMTAzLjMgOTAgODggODcuNyIgc3R5bGU9ImZpbGw6I2E0MDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMjIuOSAyMDEuMiAxNDIuMyAyMDMuNCAxNDkuMyAyMDYuNSAxMzAuNiAyMDQuNiAxMjIuOSAyMDEuMiIgc3R5bGU9ImZpbGw6I2ZmYWIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI1MC4xIDIwNC4xIDU4LjIgMjA5LjUgNjUuMiAyMDEuMiA1Ny44IDE5NS4xIDUwLjEgMjA0LjEiIHN0eWxlPSJmaWxsOiNmZmE3MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTYyLjEgMjk4LjYgMTU3LjQgMjk3LjYgMTU3LjUgMzE0LjUgMTYyLjEgMzE3IDE2Mi4xIDI5OC42IiBzdHlsZT0iZmlsbDojODBmZjc3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjUwLjkgMTM4LjMgNTEuNyAxNTMgNjMuMSAxNDQgNjIuOSAxMjguOSA1MC45IDEzOC4zIiBzdHlsZT0iZmlsbDojZmYyNTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0NS4xIDIxNy4yIDE2Mi41IDIxOCAxNjguNCAyMjYuMiAxNTEuNiAyMjYuMiAxNDUuMSAyMTcuMiIgc3R5bGU9ImZpbGw6I2ZjMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzAuNiAyMDQuNiAxNDkuMyAyMDYuNSAxNTYuMSAyMTEuNCAxMzguMSAyMTAgMTMwLjYgMjA0LjYiIHN0eWxlPSJmaWxsOiNmZmFlMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTY5IDI5Ny43IDE2Mi4xIDI5OC42IDE2Mi4xIDMxNyAxNjkgMzE3LjUgMTY5IDI5Ny43IiBzdHlsZT0iZmlsbDojODBmZjc3Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjY1LjIgMjAxLjIgNzcuMSAyMDUuNyA4NC4zIDIwMC4yIDczLjEgMTk1LjIgNjUuMiAyMDEuMiIgc3R5bGU9ImZpbGw6I2ZmOWYwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzguMSAyMTAgMTU2LjEgMjExLjQgMTYyLjUgMjE4IDE0NS4xIDIxNy4yIDEzOC4xIDIxMCIgc3R5bGU9ImZpbGw6I2ZmYmQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTEuOSAyNDkgMTYxLjkgMjQ4LjEgMTY1LjUgMjYwLjQgMTU1LjkgMjYyLjYgMTUxLjkgMjQ5IiBzdHlsZT0iZmlsbDojZTFmZjE2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2MC4yIDEzOS41IDE1OS43IDE1NS4yIDE3MC41IDE3NS4yIDE3MS40IDE2MC4yIDE2MC4yIDEzOS41IiBzdHlsZT0iZmlsbDojZmYzZjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQyLjMgMTc3LjYgNDMuMyAxODguMiA1Mi4yIDE3Ny42IDUxLjkgMTY2LjEgNDIuMyAxNzcuNiIgc3R5bGU9ImZpbGw6I2ZmNmYwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzkuNSAxOTcuNSAxNzYuMyAyMTAuNSAxODMgMjMzLjQgMTg2LjUgMjIxLjQgMTc5LjUgMTk3LjUiIHN0eWxlPSJmaWxsOiNmZmI2MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iOTIuMSAxOTcgMTA3LjYgMjAwLjggMTE1LjEgMTk5LjkgMTAwLjQgMTk2IDkyLjEgMTk3IiBzdHlsZT0iZmlsbDojZmY5ODAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQ1LjUgMTk3LjEgNTAuMSAyMDQuMSA1Ny44IDE5NS4xIDUzLjggMTg3LjIgNDUuNSAxOTcuMSIgc3R5bGU9ImZpbGw6I2ZmOTQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODEuOCAyNjYuMyAxNzQuNyAyNzMgMTc2LjcgMjk0LjYgMTg0IDI4OS4xIDE4MS44IDI2Ni4zIiBzdHlsZT0iZmlsbDojYjdmZjQwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwMy4zIDkwIDEwNC41IDEwNy4xIDExOS4zIDExMy41IDExOC42IDk2LjYgMTAzLjMgOTAiIHN0eWxlPSJmaWxsOiNhNDAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTU1LjcgMjgwLjQgMTU0LjggMjc5LjIgMTU2LjMgMjk1IDE1Ny40IDI5Ny42IDE1NS43IDI4MC40IiBzdHlsZT0iZmlsbDojYTdmZjUwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1MS44IDI2My43IDE1NS45IDI2Mi42IDE1OC42IDI3Ni44IDE1NC44IDI3OS4yIDE1MS44IDI2My43IiBzdHlsZT0iZmlsbDojYzdmZjMwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjQzLjMgMTg4LjIgNDUuNSAxOTcuMSA1My44IDE4Ny4yIDUyLjIgMTc3LjYgNDMuMyAxODguMiIgc3R5bGU9ImZpbGw6I2ZmODIwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxODMgMjMzLjQgMTc3LjUgMjQzLjYgMTgxLjggMjY2LjIgMTg3LjUgMjU3LjIgMTgzIDIzMy40IiBzdHlsZT0iZmlsbDojZjFmYzA2Ii8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0Ni43IDIzNi4zIDE1Ny4yIDIzNi41IDE2MS45IDI0OC4xIDE1MS45IDI0OSAxNDYuNyAyMzYuMyIgc3R5bGU9ImZpbGw6I2ZiZjEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDcuNSAxMjEuNiAxNDcuMyAxMzcuOSAxNTkuNyAxNTUuMiAxNjAuMiAxMzkuNSAxNDcuNSAxMjEuNiIgc3R5bGU9ImZpbGw6I2ZmMTMwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI3NS4yIDEwNi43IDc2IDEyMy4yIDg5LjkgMTIxLjUgODkuNiAxMDQuOCA3NS4yIDEwNi43IiBzdHlsZT0iZmlsbDojYzQwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjExOC42IDk2LjYgMTE5LjMgMTEzLjUgMTMzLjcgMTIzLjkgMTMzLjUgMTA3LjIgMTE4LjYgOTYuNiIgc3R5bGU9ImZpbGw6I2I2MDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMDAuNCAxOTYgMTE1LjEgMTk5LjkgMTIyLjkgMjAxLjIgMTA4LjkgMTk3LjQgMTAwLjQgMTk2IiBzdHlsZT0iZmlsbDojZmY5NDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjczLjEgMTk1LjIgODQuMyAyMDAuMiA5Mi4xIDE5NyA4MS43IDE5MS42IDczLjEgMTk1LjIiIHN0eWxlPSJmaWxsOiNmZjhkMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNTcuOCAxOTUuMSA2NS4yIDIwMS4yIDczLjEgMTk1LjIgNjYuNCAxODguNSA1Ny44IDE5NS4xIiBzdHlsZT0iZmlsbDojZmY4ZDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzMy41IDEwNy4yIDEzMy43IDEyMy45IDE0Ny4zIDEzNy45IDE0Ny41IDEyMS42IDEzMy41IDEwNy4yIiBzdHlsZT0iZmlsbDojZDEwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjUxLjcgMTUzIDUxLjkgMTY2LjEgNjIuNyAxNTcuNyA2My4xIDE0NCA1MS43IDE1MyIgc3R5bGU9ImZpbGw6I2ZmMzgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjAuMyAyNzkuOSAxNTUuNyAyODAuNCAxNTcuNCAyOTcuNiAxNjIuMSAyOTguNiAxNjAuMyAyNzkuOSIgc3R5bGU9ImZpbGw6I2FkZmY0OSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzQuNyAyNzMgMTY3LjEgMjc3LjUgMTY5IDI5Ny43IDE3Ni43IDI5NC42IDE3NC43IDI3MyIgc3R5bGU9ImZpbGw6I2I0ZmY0MyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDAuNSAyMjQuOSAxNTEuNiAyMjYuMiAxNTcuMiAyMzYuNSAxNDYuNyAyMzYuMyAxNDAuNSAyMjQuOSIgc3R5bGU9ImZpbGw6I2ZmZDMwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI2Mi45IDEyOC45IDYzLjEgMTQ0IDc1LjYgMTM4LjcgNzYgMTIzLjIgNjIuOSAxMjguOSIgc3R5bGU9ImZpbGw6I2YxMDgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMDguOSAxOTcuNCAxMjIuOSAyMDEuMiAxMzAuNiAyMDQuNiAxMTcuNCAyMDEuMSAxMDguOSAxOTcuNCIgc3R5bGU9ImZpbGw6I2ZmOTQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjcuMSAyNzcuNiAxNjAuMyAyNzkuOSAxNjIuMSAyOTguNiAxNjkgMjk3LjcgMTY3LjEgMjc3LjYiIHN0eWxlPSJmaWxsOiNiMWZmNDYiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQ3LjQgMjQ4LjcgMTUxLjkgMjQ5IDE1NS45IDI2Mi42IDE1MS44IDI2My43IDE0Ny40IDI0OC43IiBzdHlsZT0iZmlsbDojZWJmZjBjIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE3MC41IDE3NS4yIDE2Ny43IDE4OS4xIDE3Ni4zIDIxMC41IDE3OS41IDE5Ny41IDE3MC41IDE3NS4yIiBzdHlsZT0iZmlsbDojZmY3ZTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzMy40IDIxNS4xIDE0NS4xIDIxNy4yIDE1MS42IDIyNi4yIDE0MC41IDIyNC45IDEzMy40IDIxNS4xIiBzdHlsZT0iZmlsbDojZmZiOTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjExNy40IDIwMS4xIDEzMC42IDIwNC42IDEzOC4xIDIxMCAxMjUuNiAyMDcuMSAxMTcuNCAyMDEuMSIgc3R5bGU9ImZpbGw6I2ZmOWMwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTIuNCAyNjMuNCAxNTEuOCAyNjMuNyAxNTQuOCAyNzkuMiAxNTUuNyAyODAuNCAxNTIuNCAyNjMuNCIgc3R5bGU9ImZpbGw6I2NlZmYyOSIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMjUuNiAyMDcuMSAxMzguMSAyMTAgMTQ1LjEgMjE3LjIgMTMzLjQgMjE1LjEgMTI1LjYgMjA3LjEiIHN0eWxlPSJmaWxsOiNmZmE3MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNTMuOCAxODcuMiA1Ny44IDE5NS4xIDY2LjQgMTg4LjUgNjMuMiAxODAgNTMuOCAxODcuMiIgc3R5bGU9ImZpbGw6I2Y3MCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4MS43IDE5MS42IDkyLjEgMTk3IDEwMC40IDE5NiA5MC44IDE5MC41IDgxLjcgMTkxLjYiIHN0eWxlPSJmaWxsOiNmZjgyMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNTEuOSAxNjYuMSA1Mi4yIDE3Ny42IDYyLjMgMTY5LjggNjIuNyAxNTcuNyA1MS45IDE2Ni4xIiBzdHlsZT0iZmlsbDojZmY0YTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijg5LjYgMTA0LjggODkuOSAxMjEuNSAxMDQuMiAxMjMuNyAxMDQuNSAxMDcuMSA4OS42IDEwNC44IiBzdHlsZT0iZmlsbDojYjYwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE3Ny41IDI0My42IDE3MC42IDI1MS43IDE3NC43IDI3MyAxODEuOCAyNjYuMyAxNzcuNSAyNDMuNiIgc3R5bGU9ImZpbGw6I2ViZmYwYyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI1Mi4yIDE3Ny42IDUzLjggMTg3LjIgNjMuMiAxODAgNjIuMyAxNjkuOCA1Mi4yIDE3Ny42IiBzdHlsZT0iZmlsbDojZmY2MDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjY2LjQgMTg4LjUgNzMuMSAxOTUuMiA4MS43IDE5MS42IDc1LjggMTg0LjUgNjYuNCAxODguNSIgc3R5bGU9ImZpbGw6I2Y3MCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzYuMyAyMTAuNSAxNzEuMSAyMjEuOCAxNzcuNSAyNDMuNiAxODMgMjMzLjQgMTc2LjMgMjEwLjUiIHN0eWxlPSJmaWxsOiNmZmMxMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQxLjcgMjM0LjggMTQ2LjcgMjM2LjMgMTUxLjkgMjQ5IDE0Ny40IDI0OC43IDE0MS43IDIzNC44IiBzdHlsZT0iZmlsbDojZmZlMjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1Ni43IDI2MS40IDE1Mi40IDI2My40IDE1NS43IDI4MC40IDE2MC4zIDI3OS45IDE1Ni43IDI2MS40IiBzdHlsZT0iZmlsbDojZDdmZjFmIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1OS43IDE1NS4yIDE1Ny4yIDE2OS45IDE2Ny43IDE4OS4xIDE3MC41IDE3NS4yIDE1OS43IDE1NS4yIiBzdHlsZT0iZmlsbDojZmY0YTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjkwLjggMTkwLjUgMTAwLjQgMTk2IDEwOC45IDE5Ny40IDEwMC4xIDE5Mi4xIDkwLjggMTkwLjUiIHN0eWxlPSJmaWxsOiNmZjdhMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNjMuMSAxNDQgNjIuNyAxNTcuNyA3NC40IDE1Mi43IDc1LjYgMTM4LjcgNjMuMSAxNDQiIHN0eWxlPSJmaWxsOiNmZjFhMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNzYgMTIzLjIgNzUuNiAxMzguNyA4OC44IDEzNyA4OS45IDEyMS41IDc2IDEyMy4yIiBzdHlsZT0iZmlsbDojZGEwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0Ny42IDI0NyAxNDcuNCAyNDguNyAxNTEuOCAyNjMuNyAxNTIuNCAyNjMuNCAxNDcuNiAyNDciIHN0eWxlPSJmaWxsOiNmNGY4MDIiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTcwLjYgMjUxLjcgMTYzLjIgMjU3LjYgMTY3IDI3Ny42IDE3NC43IDI3MyAxNzAuNiAyNTEuNyIgc3R5bGU9ImZpbGw6I2U0ZmYxMyIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMDQuNSAxMDcuMSAxMDQuMiAxMjMuNyAxMTguNCAxMjkuOCAxMTkuMyAxMTMuNSAxMDQuNSAxMDcuMSIgc3R5bGU9ImZpbGw6I2IwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzQuOCAyMjIuMyAxNDAuNSAyMjQuOSAxNDYuNyAyMzYuMyAxNDEuNyAyMzQuOCAxMzQuOCAyMjIuMyIgc3R5bGU9ImZpbGw6I2ZmYzEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNjMuMiAyNTcuNiAxNTYuNyAyNjEuNCAxNjAuMyAyNzkuOSAxNjcgMjc3LjYgMTYzLjIgMjU3LjYiIHN0eWxlPSJmaWxsOiNkZWZmMTkiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNjMuMiAxODAgNjYuNCAxODguNSA3NS44IDE4NC41IDczLjQgMTc1LjcgNjMuMiAxODAiIHN0eWxlPSJmaWxsOiNmZjYwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTAwLjEgMTkyLjEgMTA4LjkgMTk3LjQgMTE3LjQgMjAxLjEgMTA5LjQgMTk2LjEgMTAwLjEgMTkyLjEiIHN0eWxlPSJmaWxsOiNmZjdlMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNzUuOCAxODQuNSA4MS43IDE5MS42IDkwLjggMTkwLjUgODUuNyAxODMuNCA3NS44IDE4NC41IiBzdHlsZT0iZmlsbDojZmY2YzAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0Ny4zIDEzNy45IDE0NS4zIDE1My4zIDE1Ny4yIDE2OS45IDE1OS43IDE1NS4yIDE0Ny4zIDEzNy45IiBzdHlsZT0iZmlsbDojZmYxZTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyNyAyMTEuNCAxMzMuNCAyMTUuMSAxNDAuNSAyMjQuOSAxMzQuOCAyMjIuMyAxMjcgMjExLjQiIHN0eWxlPSJmaWxsOiNmZmE3MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTE5LjMgMTEzLjUgMTE4LjQgMTI5LjggMTMyLjMgMTM5LjggMTMzLjcgMTIzLjkgMTE5LjMgMTEzLjUiIHN0eWxlPSJmaWxsOiNjODAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTA5LjQgMTk2LjEgMTE3LjQgMjAxLjEgMTI1LjYgMjA3LjEgMTE4LjUgMjAyLjYgMTA5LjQgMTk2LjEiIHN0eWxlPSJmaWxsOiNmZjg2MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNjIuNyAxNTcuNyA2Mi4zIDE2OS44IDczLjMgMTY1LjEgNzQuNCAxNTIuNyA2Mi43IDE1Ny43IiBzdHlsZT0iZmlsbDojZmYzMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE2Ny43IDE4OS4xIDE2Mi45IDIwMS41IDE3MS4xIDIyMS44IDE3Ni4zIDIxMC41IDE2Ny43IDE4OS4xIiBzdHlsZT0iZmlsbDojZmY4OTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjExOC41IDIwMi42IDEyNS42IDIwNy4xIDEzMy40IDIxNS4xIDEyNyAyMTEuNCAxMTguNSAyMDIuNiIgc3R5bGU9ImZpbGw6I2ZmOTQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzMuNyAxMjMuOSAxMzIuMyAxMzkuOCAxNDUuMyAxNTMuMyAxNDcuMyAxMzcuOSAxMzMuNyAxMjMuOSIgc3R5bGU9ImZpbGw6I2U0MDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNzEuMSAyMjEuOCAxNjQuNSAyMzEuMSAxNzAuNiAyNTEuNyAxNzcuNSAyNDMuNiAxNzEuMSAyMjEuOCIgc3R5bGU9ImZpbGw6I2ZmYzgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI2Mi4zIDE2OS44IDYzLjIgMTgwIDczLjQgMTc1LjcgNzMuMyAxNjUuMSA2Mi4zIDE2OS44IiBzdHlsZT0iZmlsbDojZmY0YTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0MS40IDIzMS44IDE0MS43IDIzNC44IDE0Ny40IDI0OC43IDE0Ny42IDI0NyAxNDEuNCAyMzEuOCIgc3R5bGU9ImZpbGw6I2ZmZDMwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTEuNCAyNDMuNyAxNDcuNiAyNDcgMTUyLjQgMjYzLjQgMTU2LjcgMjYxLjQgMTUxLjQgMjQzLjciIHN0eWxlPSJmaWxsOiNmZWVkMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iODkuOSAxMjEuNSA4OC44IDEzNyAxMDIuNCAxMzkuMiAxMDQuMiAxMjMuNyA4OS45IDEyMS41IiBzdHlsZT0iZmlsbDojY2QwMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijg1LjcgMTgzLjQgOTAuOCAxOTAuNSAxMDAuMSAxOTIuMSA5NS45IDE4NSA4NS43IDE4My40IiBzdHlsZT0iZmlsbDojZmY2NDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijc1LjYgMTM4LjcgNzQuNCAxNTIuNyA4Ni45IDE1MS4yIDg4LjggMTM3IDc1LjYgMTM4LjciIHN0eWxlPSJmaWxsOiNmMTA4MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTY0LjUgMjMxLjEgMTU3LjYgMjM4LjQgMTYzLjIgMjU3LjYgMTcwLjYgMjUxLjcgMTY0LjUgMjMxLjEiIHN0eWxlPSJmaWxsOiNmZmQzMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iNzMuNCAxNzUuNyA3NS44IDE4NC41IDg1LjcgMTgzLjQgODQuMiAxNzQuNCA3My40IDE3NS43IiBzdHlsZT0iZmlsbDojZmY1MjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1Ny42IDIzOC40IDE1MS40IDI0My43IDE1Ni43IDI2MS41IDE2My4yIDI1Ny42IDE1Ny42IDIzOC40IiBzdHlsZT0iZmlsbDojZmZlMjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEzMy45IDIxOC4xIDEzNC44IDIyMi4zIDE0MS43IDIzNC44IDE0MS40IDIzMS44IDEzMy45IDIxOC4xIiBzdHlsZT0iZmlsbDojZmZiMjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE1Ny4yIDE2OS45IDE1Mi45IDE4My4xIDE2Mi45IDIwMS41IDE2Ny43IDE4OS4xIDE1Ny4yIDE2OS45IiBzdHlsZT0iZmlsbDojZmY1OTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijk1LjkgMTg1IDEwMC4xIDE5Mi4xIDEwOS40IDE5Ni4xIDEwNi4xIDE4OS41IDk1LjkgMTg1IiBzdHlsZT0iZmlsbDojZmY2NDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijc0LjQgMTUyLjcgNzMuMyAxNjUuMSA4NSAxNjMuNyA4Ni45IDE1MS4yIDc0LjQgMTUyLjciIHN0eWxlPSJmaWxsOiNmMjAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQ0LjcgMjI3LjEgMTQxLjQgMjMxLjggMTQ3LjYgMjQ3IDE1MS40IDI0My43IDE0NC43IDIyNy4xIiBzdHlsZT0iZmlsbDojZmZjNDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjczLjMgMTY1LjEgNzMuNCAxNzUuNyA4NC4yIDE3NC40IDg1IDE2My43IDczLjMgMTY1LjEiIHN0eWxlPSJmaWxsOiNmZjM4MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTYyLjkgMjAxLjUgMTU2LjcgMjEyIDE2NC41IDIzMS4xIDE3MS4xIDIyMS44IDE2Mi45IDIwMS41IiBzdHlsZT0iZmlsbDojZmY5NDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwNC4yIDEyMy43IDEwMi40IDEzOS4yIDExNiAxNDUgMTE4LjQgMTI5LjggMTA0LjIgMTIzLjciIHN0eWxlPSJmaWxsOiNkMTAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTI1LjQgMjA2LjIgMTI3IDIxMS40IDEzNC44IDIyMi4zIDEzMy45IDIxOC4xIDEyNS40IDIwNi4yIiBzdHlsZT0iZmlsbDojZmY5NDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEwNi4xIDE4OS41IDEwOS40IDE5Ni4xIDExOC41IDIwMi42IDExNiAxOTYuNiAxMDYuMSAxODkuNSIgc3R5bGU9ImZpbGw6I2ZmNmMwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTYgMTk2LjYgMTE4LjUgMjAyLjYgMTI3IDIxMS40IDEyNS40IDIwNi4yIDExNiAxOTYuNiIgc3R5bGU9ImZpbGw6I2ZmN2UwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDUuMyAxNTMuMyAxNDEuNiAxNjcuMyAxNTIuOSAxODMuMSAxNTcuMiAxNjkuOSAxNDUuMyAxNTMuMyIgc3R5bGU9ImZpbGw6I2ZmMzAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4NC4yIDE3NC40IDg1LjcgMTgzLjQgOTUuOSAxODUgOTUuMyAxNzYuMiA4NC4yIDE3NC40IiBzdHlsZT0iZmlsbDojZmY0YTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijg4LjggMTM3IDg2LjkgMTUxLjIgOTkuNyAxNTMuMiAxMDIuNCAxMzkuMiA4OC44IDEzNyIgc3R5bGU9ImZpbGw6I2U4MDAwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTguNCAxMjkuOCAxMTYgMTQ1LjEgMTI5LjIgMTU0LjUgMTMyLjMgMTM5LjggMTE4LjQgMTI5LjgiIHN0eWxlPSJmaWxsOiNkZjAwMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTUwLjMgMjIwLjUgMTQ0LjcgMjI3LjEgMTUxLjUgMjQzLjcgMTU3LjYgMjM4LjQgMTUwLjMgMjIwLjUiIHN0eWxlPSJmaWxsOiNmZmIyMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTMyLjMgMTM5LjggMTI5LjIgMTU0LjUgMTQxLjYgMTY3LjMgMTQ1LjMgMTUzLjIgMTMyLjMgMTM5LjgiIHN0eWxlPSJmaWxsOiNmYTBmMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTU2LjggMjEyIDE1MC4zIDIyMC41IDE1Ny42IDIzOC40IDE2NC42IDIzMS4xIDE1Ni44IDIxMiIgc3R5bGU9ImZpbGw6I2ZmYTMwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMzYuNSAyMTIuMSAxMzMuOSAyMTguMSAxNDEuNCAyMzEuOCAxNDQuNyAyMjcuMSAxMzYuNSAyMTIuMSIgc3R5bGU9ImZpbGw6I2ZmOWYwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNTIuOSAxODMuMSAxNDcuNCAxOTQuNyAxNTYuNyAyMTIgMTYyLjkgMjAxLjUgMTUyLjkgMTgzLjEiIHN0eWxlPSJmaWxsOiNmZjY4MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iODUgMTYzLjcgODQuMiAxNzQuNCA5NS4zIDE3Ni4yIDk3IDE2NS42IDg1IDE2My43IiBzdHlsZT0iZmlsbDojZmYzMDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijk1LjMgMTc2LjIgOTUuOSAxODUgMTA2LjEgMTg5LjUgMTA2LjQgMTgxLjEgOTUuMyAxNzYuMiIgc3R5bGU9ImZpbGw6I2ZmNGEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSI4Ni45IDE1MS4yIDg1IDE2My43IDk3IDE2NS42IDk5LjcgMTUzLjIgODYuOSAxNTEuMiIgc3R5bGU9ImZpbGw6I2ZmMWEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMjcuMyAxOTkuMyAxMjUuNCAyMDYuMiAxMzMuOSAyMTguMSAxMzYuNiAyMTIuMSAxMjcuMyAxOTkuMyIgc3R5bGU9ImZpbGw6I2ZmN2UwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMDIuNCAxMzkuMiA5OS43IDE1My4yIDExMi41IDE1OC44IDExNiAxNDUgMTAyLjQgMTM5LjIiIHN0eWxlPSJmaWxsOiNlZDA0MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTA2LjQgMTgxLjEgMTA2LjEgMTg5LjUgMTE2IDE5Ni42IDExNy4xIDE4OC44IDEwNi40IDE4MS4xIiBzdHlsZT0iZmlsbDojZjUwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjE0MS41IDIwNC40IDEzNi41IDIxMi4xIDE0NC43IDIyNy4xIDE1MC4zIDIyMC41IDE0MS41IDIwNC40IiBzdHlsZT0iZmlsbDojZmY4ZDAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjExNy4xIDE4OC44IDExNiAxOTYuNiAxMjUuNCAyMDYuMiAxMjcuMyAxOTkuMyAxMTcuMSAxODguOCIgc3R5bGU9ImZpbGw6I2ZmNjgwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxNDcuNCAxOTQuNyAxNDEuNSAyMDQuNCAxNTAuMyAyMjAuNSAxNTYuOCAyMTIgMTQ3LjQgMTk0LjciIHN0eWxlPSJmaWxsOiNmZjdhMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTQxLjYgMTY3LjMgMTM2LjcgMTc5LjggMTQ3LjQgMTk0LjcgMTUyLjkgMTgzLjEgMTQxLjYgMTY3LjMiIHN0eWxlPSJmaWxsOiNmZjQzMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iOTcgMTY1LjYgOTUuMyAxNzYuMiAxMDYuNCAxODEuMSAxMDguOSAxNzAuOCA5NyAxNjUuNiIgc3R5bGU9ImZpbGw6I2ZmMzQwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMTYgMTQ1IDExMi41IDE1OC44IDEyNSAxNjcuNyAxMjkuMiAxNTQuNSAxMTYgMTQ1IiBzdHlsZT0iZmlsbDojZmEwZjAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9Ijk5LjcgMTUzLjIgOTcgMTY1LjYgMTA4LjkgMTcwLjggMTEyLjUgMTU4LjggOTkuNyAxNTMuMiIgc3R5bGU9ImZpbGw6I2ZmMWEwMCIvPjwvZz48ZyBzdHlsZT0iY2xpcC1wYXRoOnVybCgjY2xpcC1wYXRoKSI+PHBvbHlnb24gcG9pbnRzPSIxMjkuMiAxNTQuNSAxMjUgMTY3LjcgMTM2LjcgMTc5LjggMTQxLjYgMTY3LjMgMTI5LjIgMTU0LjUiIHN0eWxlPSJmaWxsOiNmMjAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTMxLjUgMTkwLjUgMTI3LjMgMTk5LjMgMTM2LjUgMjEyLjEgMTQxLjUgMjA0LjQgMTMxLjUgMTkwLjUiIHN0eWxlPSJmaWxsOiNmZjY4MDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTM2LjcgMTc5LjggMTMxLjUgMTkwLjUgMTQxLjUgMjA0LjQgMTQ3LjQgMTk0LjcgMTM2LjcgMTc5LjgiIHN0eWxlPSJmaWxsOiNmNTAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTA4LjkgMTcwLjggMTA2LjQgMTgxLjEgMTE3LjEgMTg4LjggMTIwLjUgMTc5LjIgMTA4LjkgMTcwLjgiIHN0eWxlPSJmaWxsOiNmZjNiMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTIwLjUgMTc5LjIgMTE3LjEgMTg4LjggMTI3LjMgMTk5LjMgMTMxLjUgMTkwLjUgMTIwLjUgMTc5LjIiIHN0eWxlPSJmaWxsOiNmZjRlMDAiLz48L2c+PGcgc3R5bGU9ImNsaXAtcGF0aDp1cmwoI2NsaXAtcGF0aCkiPjxwb2x5Z29uIHBvaW50cz0iMTEyLjUgMTU4LjggMTA4LjkgMTcwLjggMTIwLjUgMTc5LjIgMTI1IDE2Ny43IDExMi41IDE1OC44IiBzdHlsZT0iZmlsbDojZmYyNTAwIi8+PC9nPjxnIHN0eWxlPSJjbGlwLXBhdGg6dXJsKCNjbGlwLXBhdGgpIj48cG9seWdvbiBwb2ludHM9IjEyNC45IDE2Ny43IDEyMC41IDE3OS4yIDEzMS41IDE5MC41IDEzNi43IDE3OS44IDEyNC45IDE2Ny43IiBzdHlsZT0iZmlsbDojZmYzODAwIi8+PC9nPjwvZz48L2c+PC9zdmc+',
  slippage: false,
  
  ethereum: {
    registry: {
      address: '0x90E00ACe148ca3b23Ac1bC8C240C2a7Dd9c2d7f5',
      api: Curve.REGISTRY
    },
    pool: {
      api: Curve.POOL
    },
  },

};

var curve = new Exchange(

  Object.assign(exchange$d, {
    findPath: ({ blockchain, tokenIn, tokenOut, amountIn, amountOut, amountInMax, amountOutMin })=>
      Curve.findPath({ blockchain, exchange: exchange$d, tokenIn, tokenOut, amountIn, amountOut, amountInMax, amountOutMin }),
    pathExists: (blockchain, path)=>
      Curve.pathExists(blockchain, exchange$d, path),
    getAmounts: ({ blockchain, path, pools, block, tokenIn, tokenOut, amountOut, amountIn, amountInMax, amountOutMin })=>
      Curve.getAmounts(blockchain, exchange$d, { path, pools, block, tokenIn, tokenOut, amountOut, amountIn, amountInMax, amountOutMin }),
    getTransaction: (...args)=> Curve.getTransaction(...args),
  })
);

const WHIRLPOOL_REWARD_LAYOUT = struct([
  publicKey("mint"),
  publicKey("vault"),
  publicKey("authority"),
  u128("emissionsPerSecondX64"),
  u128("growthGlobalX64"),
]);

const WHIRLPOOL_LAYOUT = struct([
  u64$1("anchorDiscriminator"),
  publicKey("whirlpoolsConfig"),
  seq(u8(), 1, "whirlpoolBump"),
  u16("tickSpacing"),
  seq(u8(), 2, "tickSpacingSeed"),
  u16("feeRate"),
  u16("protocolFeeRate"),
  u128("liquidity"),
  u128("sqrtPrice"),
  i32("tickCurrentIndex"),
  u64$1("protocolFeeOwedA"),
  u64$1("protocolFeeOwedB"),
  publicKey("tokenMintA"),
  publicKey("tokenVaultA"),
  u128("feeGrowthGlobalA"),
  publicKey("tokenMintB"),
  publicKey("tokenVaultB"),
  u128("feeGrowthGlobalB"),
  u64$1("rewardLastUpdatedTimestamp"),
  seq(WHIRLPOOL_REWARD_LAYOUT, 3, "rewardInfos"),
]);

const TICK_LAYOUT = struct([
  bool("initialized"),
  i128("liquidityNet"),
  u128("liquidityGross"),
  u128("feeGrowthOutsideA"),
  u128("feeGrowthOutsideB"),
  seq(u128(), 3, "reward_growths_outside"),
]);

const TICK_ARRAY_LAYOUT = struct([
  u64$1("anchorDiscriminator"),
  i32("startTickIndex"),
  seq(TICK_LAYOUT, 88, "ticks"),
  publicKey("whirlpool"),
]);

var basics = {
  blockchain: 'solana',
  name: 'orca',
  alternativeNames: [],
  label: 'Orca',
  logo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI3LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9ImthdG1hbl8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCIKCSB2aWV3Qm94PSIwIDAgNjAwIDQ1MCIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgNjAwIDQ1MDsiIHhtbDpzcGFjZT0icHJlc2VydmUiPgo8cGF0aCBmaWxsPSIjRkZEMTVDIiBkPSJNNDg4LjQsMjIyLjljMCwxMDMuOC04NC4xLDE4Ny45LTE4Ny45LDE4Ny45Yy0xMDMuOCwwLTE4Ny45LTg0LjEtMTg3LjktMTg3LjlDMTEyLjYsMTE5LjEsMTk2LjcsMzUsMzAwLjUsMzUKCUM0MDQuMiwzNSw0ODguNCwxMTkuMSw0ODguNCwyMjIuOXoiLz4KPHBhdGggZmlsbD0iI0ZGRkZGRiIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjE3LjY3NTUiIGQ9Ik0yMDkuNSwyOTkuOGMxLjYtMS4xLDMuMS0yLjgsMy45LTUuMWMwLjgtMi42LDAuMy00LjksMC02LjJjMCwwLDAtMC4xLDAtMC4xbDAuMy0xLjhjMC45LDAuNSwxLjksMS4xLDMsMS45CgljMC4zLDAuMiwwLjcsMC41LDEuMSwwLjdjMC41LDAuNCwxLjEsMC44LDEuNCwxYzAuNiwwLjQsMS41LDEsMi41LDEuNWMyNS4xLDE1LjYsNDUuOCwyMiw2Mi4yLDIxLjJjMTctMC44LDI4LjktOS40LDM1LjEtMjEuOQoJYzUuOS0xMi4xLDYuMi0yNywyLTQwLjljLTQuMi0xMy45LTEzLTI3LjUtMjYuMi0zNi45Yy0yMi4yLTE1LjgtNDIuNS0zOS44LTUyLjctNjAuM2MtNS4yLTEwLjQtNy4zLTE4LjctNi43LTI0LjIKCWMwLjMtMi41LDEtNC4xLDItNS4xYzAuOS0xLDIuNi0yLjEsNS45LTIuNmM2LjktMS4xLDE1LTMuNiwyMy4xLTYuMmMzLjItMSw2LjMtMiw5LjUtMi45YzExLjctMy40LDI0LjItNi4zLDM3LjItNi4zCgljMjUuMywwLDU1LDExLDg2LjMsNTYuOGM0MC4yLDU4LjgsMTguMSwxMjQuNC0yOC4yLDE1OC45Yy0yMy4xLDE3LjItNTEuOSwyNi4zLTgxLjUsMjIuOUMyNjIuOSwzNDEuMywyMzQuOSwzMjcuOSwyMDkuNSwyOTkuOHoKCSBNMjE0LjIsMjg0LjZDMjE0LjIsMjg0LjYsMjE0LjIsMjg0LjcsMjE0LjIsMjg0LjZDMjE0LjEsMjg0LjcsMjE0LjIsMjg0LjYsMjE0LjIsMjg0LjZ6IE0yMTEuNiwyODUuOAoJQzIxMS42LDI4NS44LDIxMS43LDI4NS44LDIxMS42LDI4NS44QzIxMS43LDI4NS44LDIxMS42LDI4NS44LDIxMS42LDI4NS44eiIvPgo8cGF0aCBkPSJNMjMyLjUsMTI0LjNjMCwwLDcxLjgtMTkuMSw4Ny41LTE5LjFjMTUuNywwLDc4LjYsMzAuNSw5Ni45LDg2LjNjMjYsNzktNDQuNywxMzAuOS01Mi43LDEyNS44CgljNzYuMS02Mi45LTQ4LjQtMTc5LjEtMTA5LjYtMTcwLjRjLTcuNiwxLjEtMy40LDcuNi0zLjQsNy42bC0xLjcsMTdsLTEyLjctMjEuMkwyMzIuNSwxMjQuM3oiLz4KPHBhdGggZD0iTTQwNi41LDE2Ny42YzIyLjcsMzkuOSwxOCwxNy4xLDEyLjksNjIuN2M5LjMtMTUuMSwyMy45LTMuOCwyOS45LDJjMS4xLDEsMi45LDAuNCwyLjgtMS4xYy0wLjItNi44LTIuMi0yMS40LTEzLjQtMzcuMQoJQzQyMy40LDE3Mi42LDQwNi41LDE2Ny42LDQwNi41LDE2Ny42eiIvPgo8cGF0aCBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAwMDAiIHN0cm9rZS13aWR0aD0iMC45OTMiIGQ9Ik00MTkuNCwyMzAuM2M1LTQ1LjYsOS43LTIyLjgtMTIuOS02Mi43YzAsMCwxNi45LDUsMzIuMywyNi41YzExLjIsMTUuNywxMy4xLDMwLjMsMTMuNCwzNy4xCgljMC4xLDEuNS0xLjcsMi4xLTIuOCwxLjFDNDQzLjMsMjI2LjUsNDI4LjcsMjE1LjMsNDE5LjQsMjMwLjN6IE00MTkuNCwyMzAuM2MwLjktMi4xLDIuMi01LjUsMi4yLTUuNSIvPgo8cGF0aCBkPSJNMjI0LDIyNC4yYy05LjYsMTYuMi0yOS4yLDE1LTI4LjgsMzQuM2MxNy41LDM5LDE3LjYsMzYuMiwxNy42LDM2LjJjMzIuNS0xOC4yLDE5LjEtNTguNSwxNC4zLTcwLjQKCUMyMjYuNiwyMjMsMjI0LjcsMjIzLDIyNCwyMjQuMnoiLz4KPHBhdGggZD0iTTE1MC40LDI2MC4xYzE4LjcsMi40LDI5LjgtMTMuOCw0NC44LTEuNmMxOS45LDM3LjgsMTcuNiwzNi4yLDE3LjYsMzYuMmMtMzQuNCwxNC40LTU3LjktMjEtNjQuMy0zMi4xCglDMTQ3LjgsMjYxLjMsMTQ5LDI1OS45LDE1MC40LDI2MC4xeiIvPgo8cGF0aCBkPSJNMzA2LjksMjM2YzAsMCwxOC43LDE5LjEsOC45LDIyLjFjLTEyLjItNy41LTM0LTEuNy00NC43LDEuOWMtMi42LDAuOS01LjItMS40LTQuMy00LjFjMy42LTEwLDEyLjYtMjguNiwyOS45LTMxCglDMzA2LjksMjIyLjQsMzA2LjksMjM2LDMwNi45LDIzNnoiLz4KPHBhdGggZmlsbD0iI0ZGRkZGRiIgZD0iTTMxOC4zLDE0Mi41Yy0yLjEtMy02LjQtMTEsNi44LTExYzEzLjIsMCwzMy4zLDE0LjksMzcuNCwyMC40Yy0xLjMsMy40LTkuOCw0LjEtMTQsMy44Yy00LjItMC4zLTExLjUtMS0xNy0zLjgKCUMzMjYsMTQ5LjIsMzIwLjUsMTQ1LjUsMzE4LjMsMTQyLjV6Ii8+Cjwvc3ZnPgo=',
  router: {
    v1: {
      address: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
      api: WHIRLPOOL_LAYOUT,
    },
  },
  slippage: true,
};

const MAX_SQRT_PRICE = "79226673515401279992447579055";
const MIN_SQRT_PRICE = "4295048016";
const BIT_PRECISION = 14;
const LOG_B_2_X32 = "59543866431248";
const LOG_B_P_ERR_MARGIN_LOWER_X64 = "184467440737095516";
const LOG_B_P_ERR_MARGIN_UPPER_X64 = "15793534762490258745";

const toX64 = (num) => {
  return new BN(num.mul(Decimal.pow(2, 64)).floor().toFixed());
};

const fromX64 = (num) => {
  return new Decimal(num.toString()).mul(Decimal.pow(2, -64));
};

const getInitializableTickIndex = (tickIndex, tickSpacing) => {
  return tickIndex - (tickIndex % tickSpacing)
};

const invertTick = (tick) => {
  return -tick
};

/**
 * A collection of utility functions to convert between price, tickIndex and sqrtPrice.
 *
 * @category Whirlpool Utils
 */
class PriceMath {

  static priceToSqrtPriceX64(price, decimalsA, decimalsB) {
    return toX64(price.mul(Decimal.pow(10, decimalsB - decimalsA)).sqrt());
  }

  static sqrtPriceX64ToPrice(
    sqrtPriceX64,
    decimalsA,
    decimalsB
  ) {
    return fromX64(sqrtPriceX64)
      .pow(2)
      .mul(Decimal.pow(10, decimalsA - decimalsB));
  }

  /**
   * @param tickIndex
   * @returns
   */
  static tickIndexToSqrtPriceX64(tickIndex) {
    if (tickIndex > 0) {
      return new BN(tickIndexToSqrtPricePositive(tickIndex));
    } else {
      return new BN(tickIndexToSqrtPriceNegative(tickIndex));
    }
  }

  /**
   *
   * @param sqrtPriceX64
   * @returns
   */
  static sqrtPriceX64ToTickIndex(sqrtPriceX64) {
    if (sqrtPriceX64.gt(new BN(MAX_SQRT_PRICE)) || sqrtPriceX64.lt(new BN(MIN_SQRT_PRICE))) {
      throw new Error("Provided sqrtPrice is not within the supported sqrtPrice range.");
    }

    const msb = sqrtPriceX64.bitLength() - 1;
    const adjustedMsb = new BN(msb - 64);
    const log2pIntegerX32 = signedShiftLeft(adjustedMsb, 32, 128);

    let bit = new BN("8000000000000000", "hex");
    let precision = 0;
    let log2pFractionX64 = new BN(0);

    let r = msb >= 64 ? sqrtPriceX64.shrn(msb - 63) : sqrtPriceX64.shln(63 - msb);

    while (bit.gt(new BN(0)) && precision < BIT_PRECISION) {
      r = r.mul(r);
      let rMoreThanTwo = r.shrn(127);
      r = r.shrn(63 + rMoreThanTwo.toNumber());
      log2pFractionX64 = log2pFractionX64.add(bit.mul(rMoreThanTwo));
      bit = bit.shrn(1);
      precision += 1;
    }

    const log2pFractionX32 = log2pFractionX64.shrn(32);

    const log2pX32 = log2pIntegerX32.add(log2pFractionX32);
    const logbpX64 = log2pX32.mul(new BN(LOG_B_2_X32));

    const tickLow = signedShiftRight(
      logbpX64.sub(new BN(LOG_B_P_ERR_MARGIN_LOWER_X64)),
      64,
      128
    ).toNumber();
    const tickHigh = signedShiftRight(
      logbpX64.add(new BN(LOG_B_P_ERR_MARGIN_UPPER_X64)),
      64,
      128
    ).toNumber();

    if (tickLow == tickHigh) {
      return tickLow;
    } else {
      const derivedTickHighSqrtPriceX64 = PriceMath.tickIndexToSqrtPriceX64(tickHigh);
      if (derivedTickHighSqrtPriceX64.lte(sqrtPriceX64)) {
        return tickHigh;
      } else {
        return tickLow;
      }
    }
  }

  static tickIndexToPrice(tickIndex, decimalsA, decimalsB) {
    return PriceMath.sqrtPriceX64ToPrice(
      PriceMath.tickIndexToSqrtPriceX64(tickIndex),
      decimalsA,
      decimalsB
    );
  }

  static priceToTickIndex(price, decimalsA, decimalsB) {
    return PriceMath.sqrtPriceX64ToTickIndex(
      PriceMath.priceToSqrtPriceX64(price, decimalsA, decimalsB)
    );
  }

  static priceToInitializableTickIndex(
    price,
    decimalsA,
    decimalsB,
    tickSpacing
  ) {
    return getInitializableTickIndex(
      PriceMath.priceToTickIndex(price, decimalsA, decimalsB),
      tickSpacing
    );
  }

  /**
   * Utility to invert the price Pb/Pa to Pa/Pb
   * @param price Pb / Pa
   * @param decimalsA Decimals of original token A (i.e. token A in the given Pb / Pa price)
   * @param decimalsB Decimals of original token B (i.e. token B in the given Pb / Pa price)
   * @returns inverted price, i.e. Pa / Pb
   */
  static invertPrice(price, decimalsA, decimalsB) {
    const tick = PriceMath.priceToTickIndex(price, decimalsA, decimalsB);
    const invTick = invertTick(tick);
    return PriceMath.tickIndexToPrice(invTick, decimalsB, decimalsA);
  }

  /**
   * Utility to invert the sqrtPriceX64 from X64 repr. of sqrt(Pb/Pa) to X64 repr. of sqrt(Pa/Pb)
   * @param sqrtPriceX64 X64 representation of sqrt(Pb / Pa)
   * @returns inverted sqrtPriceX64, i.e. X64 representation of sqrt(Pa / Pb)
   */
  static invertSqrtPriceX64(sqrtPriceX64) {
    const tick = PriceMath.sqrtPriceX64ToTickIndex(sqrtPriceX64);
    const invTick = invertTick(tick);
    return PriceMath.tickIndexToSqrtPriceX64(invTick);
  }
}

// Private Functions

function tickIndexToSqrtPricePositive(tick) {
  let ratio;

  if ((tick & 1) != 0) {
    ratio = new BN("79232123823359799118286999567");
  } else {
    ratio = new BN("79228162514264337593543950336");
  }

  if ((tick & 2) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("79236085330515764027303304731")), 96, 256);
  }
  if ((tick & 4) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("79244008939048815603706035061")), 96, 256);
  }
  if ((tick & 8) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("79259858533276714757314932305")), 96, 256);
  }
  if ((tick & 16) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("79291567232598584799939703904")), 96, 256);
  }
  if ((tick & 32) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("79355022692464371645785046466")), 96, 256);
  }
  if ((tick & 64) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("79482085999252804386437311141")), 96, 256);
  }
  if ((tick & 128) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("79736823300114093921829183326")), 96, 256);
  }
  if ((tick & 256) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("80248749790819932309965073892")), 96, 256);
  }
  if ((tick & 512) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("81282483887344747381513967011")), 96, 256);
  }
  if ((tick & 1024) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("83390072131320151908154831281")), 96, 256);
  }
  if ((tick & 2048) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("87770609709833776024991924138")), 96, 256);
  }
  if ((tick & 4096) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("97234110755111693312479820773")), 96, 256);
  }
  if ((tick & 8192) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("119332217159966728226237229890")), 96, 256);
  }
  if ((tick & 16384) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("179736315981702064433883588727")), 96, 256);
  }
  if ((tick & 32768) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("407748233172238350107850275304")), 96, 256);
  }
  if ((tick & 65536) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("2098478828474011932436660412517")), 96, 256);
  }
  if ((tick & 131072) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("55581415166113811149459800483533")), 96, 256);
  }
  if ((tick & 262144) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("38992368544603139932233054999993551")), 96, 256);
  }

  return signedShiftRight(ratio, 32, 256);
}

function tickIndexToSqrtPriceNegative(tickIndex) {
  let tick = Math.abs(tickIndex);
  let ratio;

  if ((tick & 1) != 0) {
    ratio = new BN("18445821805675392311");
  } else {
    ratio = new BN("18446744073709551616");
  }

  if ((tick & 2) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("18444899583751176498")), 64, 256);
  }
  if ((tick & 4) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("18443055278223354162")), 64, 256);
  }
  if ((tick & 8) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("18439367220385604838")), 64, 256);
  }
  if ((tick & 16) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("18431993317065449817")), 64, 256);
  }
  if ((tick & 32) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("18417254355718160513")), 64, 256);
  }
  if ((tick & 64) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("18387811781193591352")), 64, 256);
  }
  if ((tick & 128) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("18329067761203520168")), 64, 256);
  }
  if ((tick & 256) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("18212142134806087854")), 64, 256);
  }
  if ((tick & 512) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("17980523815641551639")), 64, 256);
  }
  if ((tick & 1024) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("17526086738831147013")), 64, 256);
  }
  if ((tick & 2048) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("16651378430235024244")), 64, 256);
  }
  if ((tick & 4096) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("15030750278693429944")), 64, 256);
  }
  if ((tick & 8192) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("12247334978882834399")), 64, 256);
  }
  if ((tick & 16384) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("8131365268884726200")), 64, 256);
  }
  if ((tick & 32768) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("3584323654723342297")), 64, 256);
  }
  if ((tick & 65536) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("696457651847595233")), 64, 256);
  }
  if ((tick & 131072) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("26294789957452057")), 64, 256);
  }
  if ((tick & 262144) != 0) {
    ratio = signedShiftRight(ratio.mul(new BN("37481735321082")), 64, 256);
  }

  return ratio;
}

function signedShiftLeft(n0, shiftBy, bitWidth) {
  let twosN0 = n0.toTwos(bitWidth).shln(shiftBy);
  twosN0.imaskn(bitWidth + 1);
  return twosN0.fromTwos(bitWidth);
}

function signedShiftRight(n0, shiftBy, bitWidth) {
  let twoN0 = n0.toTwos(bitWidth).shrn(shiftBy);
  twoN0.imaskn(bitWidth - shiftBy + 1);
  return twoN0.fromTwos(bitWidth - shiftBy);
}

const PROTOCOL_FEE_RATE_MUL_VALUE = new BN(10000);
const FEE_RATE_MUL_VALUE = new BN(1000000);
const ZERO = new BN(0);
const ONE = new BN(1);
const TWO = new BN(2);
const U64_MAX = TWO.pow(new BN(64)).sub(ONE);

const fromX64_BN = (num)=>{
  return num.div(new BN(2).pow(new BN(64)))
};

class u64 extends BN {
  /**
   * Convert to Buffer representation
   */
  toBuffer() {
    const a = super.toArray().reverse();
    const b = buffer.Buffer.from(a);

    if (b.length === 8) {
      return b;
    }

    assert__default['default'](b.length < 8, 'u64 too large');
    const zeroPad = buffer.Buffer.alloc(8);
    b.copy(zeroPad);
    return zeroPad;
  }
  /**
   * Construct a u64 from Buffer representation
   */


  static fromBuffer(buffer) {
    assert__default['default'](buffer.length === 8, `Invalid buffer length: ${buffer.length}`);
    return new u64([...buffer].reverse().map(i => `00${i.toString(16)}`.slice(-2)).join(''), 16);
  }

}

class BitMath {

  static mul(n0, n1, limit) {
    const result = n0.mul(n1);
    if (this.isOverLimit(result, limit)) {
      throw new Error(
        `Mul result higher than u${limit}`
      );
    }
    return result;
  }

  static mulDiv(n0, n1, d, limit) {
    return this.mulDivRoundUpIf(n0, n1, d, false, limit);
  }

  static mulDivRoundUp(n0, n1, d, limit) {
    return this.mulDivRoundUpIf(n0, n1, d, true, limit);
  }

  static mulDivRoundUpIf(n0, n1, d, roundUp, limit) {
    if (d.eq(ZERO)) {
      throw new Error("mulDiv denominator is zero");
    }

    const p = this.mul(n0, n1, limit);
    const n = p.div(d);

    return roundUp && p.mod(d).gt(ZERO) ? n.add(ONE) : n;
  }

  static checked_mul_shift_right(n0, n1, limit) {
    return this.checked_mul_shift_right_round_up_if(n0, n1, false, limit);
  }

  static checked_mul_shift_right_round_up_if(n0, n1, roundUp, limit) {
    if (n0.eq(ZERO) || n1.eq(ZERO)) {
      return ZERO;
    }

    const p = this.mul(n0, n1, limit);
    if (this.isOverLimit(p, limit)) {
      throw new Error(
        `MulShiftRight overflowed u${limit}.`
      );
    }
    const result = fromX64_BN(p);
    const shouldRound = roundUp && result.and(U64_MAX).gt(ZERO);
    if (shouldRound && result.eq(U64_MAX)) {
      throw new Error(
        `MulShiftRight overflowed u${limit}.`
      );
    }

    return shouldRound ? result.add(ONE) : result;
  }

  static isOverLimit(n0, limit) {
    const limitBN = TWO.pow(new BN(limit)).sub(ONE);
    return n0.gt(limitBN);
  }

  static divRoundUp(n, d) {
    return this.divRoundUpIf(n, d, true);
  }

  static divRoundUpIf(n, d, roundUp) {
    if (d.eq(ZERO)) {
      throw new Error("divRoundUpIf - divide by zero");
    }

    let q = n.div(d);

    return roundUp && n.mod(d).gt(ZERO) ? q.add(ONE) : q;
  }
}

const getNextSqrtPriceFromBRoundDown = (
  sqrtPrice,
  currLiquidity,
  amount,
  amountSpecifiedIsInput
) => {
  let amountX64 = amount.shln(64);

  let delta = BitMath.divRoundUpIf(amountX64, currLiquidity, !amountSpecifiedIsInput);

  if (amountSpecifiedIsInput) {
    sqrtPrice = sqrtPrice.add(delta);
  } else {
    sqrtPrice = sqrtPrice.sub(delta);
  }

  return sqrtPrice;
};

const getNextSqrtPriceFromARoundUp = (
  sqrtPrice,
  currLiquidity,
  amount,
  amountSpecifiedIsInput
) => {
  if (amount.eq(ZERO)) {
    return sqrtPrice;
  }

  let p = BitMath.mul(sqrtPrice, amount, 256);
  let numerator = BitMath.mul(currLiquidity, sqrtPrice, 256).shln(64);
  if (BitMath.isOverLimit(numerator, 256)) {
    throw new Error(
      "getNextSqrtPriceFromARoundUp - numerator overflow u256"
    );
  }

  let currLiquidityShiftLeft = currLiquidity.shln(64);
  if (!amountSpecifiedIsInput && currLiquidityShiftLeft.lte(p)) {
    throw new Error(
      "getNextSqrtPriceFromARoundUp - Unable to divide currLiquidityX64 by product"
    );
  }

  let denominator = amountSpecifiedIsInput
    ? currLiquidityShiftLeft.add(p)
    : currLiquidityShiftLeft.sub(p);

  let price = BitMath.divRoundUp(numerator, denominator);

  if (price.lt(new BN(MIN_SQRT_PRICE))) {
    throw new Error(
      "getNextSqrtPriceFromARoundUp - price less than min sqrt price"
    );
  } else if (price.gt(new BN(MAX_SQRT_PRICE))) {
    throw new Error(
      "getNextSqrtPriceFromARoundUp - price less than max sqrt price"
    );
  }

  return price;
};

const getNextSqrtPrices = (nextTick, sqrtPriceLimit, aToB) => {
  const nextTickPrice = PriceMath.tickIndexToSqrtPriceX64(nextTick);
  const nextSqrtPriceLimit = aToB ? BN.max(sqrtPriceLimit, nextTickPrice) : BN.min(sqrtPriceLimit, nextTickPrice);
  return { nextTickPrice, nextSqrtPriceLimit }
};

const toIncreasingPriceOrder = (sqrtPrice0, sqrtPrice1) => {
  if (sqrtPrice0.gt(sqrtPrice1)) {
    return [sqrtPrice1, sqrtPrice0];
  } else {
    return [sqrtPrice0, sqrtPrice1];
  }
};

const getAmountDeltaA = (
  currSqrtPrice,
  targetSqrtPrice,
  currLiquidity,
  roundUp
) => {
  let [sqrtPriceLower, sqrtPriceUpper] = toIncreasingPriceOrder(currSqrtPrice, targetSqrtPrice);
  let sqrtPriceDiff = sqrtPriceUpper.sub(sqrtPriceLower);

  let numerator = currLiquidity.mul(sqrtPriceDiff).shln(64);
  let denominator = sqrtPriceLower.mul(sqrtPriceUpper);

  let quotient = numerator.div(denominator);
  let remainder = numerator.mod(denominator);

  let result = roundUp && !remainder.eq(ZERO) ? quotient.add(ONE) : quotient;

  if (result.gt(U64_MAX)) {
    throw new Error("Results larger than U64");
  }

  return result;
};

const getAmountDeltaB = (
  currSqrtPrice,
  targetSqrtPrice,
  currLiquidity,
  roundUp
) => {
  let [sqrtPriceLower, sqrtPriceUpper] = toIncreasingPriceOrder(currSqrtPrice, targetSqrtPrice);
  let sqrtPriceDiff = sqrtPriceUpper.sub(sqrtPriceLower);
  return BitMath.checked_mul_shift_right_round_up_if(currLiquidity, sqrtPriceDiff, roundUp, 128);
};

const getNextSqrtPrice = (
  sqrtPrice,
  currLiquidity,
  amount,
  amountSpecifiedIsInput,
  aToB
) => {
  if (amountSpecifiedIsInput === aToB) {
    return getNextSqrtPriceFromARoundUp(sqrtPrice, currLiquidity, amount, amountSpecifiedIsInput);
  } else {
    return getNextSqrtPriceFromBRoundDown(sqrtPrice, currLiquidity, amount, amountSpecifiedIsInput);
  }
};

const getAmountUnfixedDelta = (
  currSqrtPrice,
  targetSqrtPrice,
  currLiquidity,
  amountSpecifiedIsInput,
  aToB
) => {
  if (aToB === amountSpecifiedIsInput) {
    return getAmountDeltaB(currSqrtPrice, targetSqrtPrice, currLiquidity, !amountSpecifiedIsInput)
  } else {
    return getAmountDeltaA(currSqrtPrice, targetSqrtPrice, currLiquidity, !amountSpecifiedIsInput)
  }
};

const getAmountFixedDelta = (
  currSqrtPrice,
  targetSqrtPrice,
  currLiquidity,
  amountSpecifiedIsInput,
  aToB
) => {
  if (aToB === amountSpecifiedIsInput) {
    return getAmountDeltaA(currSqrtPrice, targetSqrtPrice, currLiquidity, amountSpecifiedIsInput)
  } else {
    return getAmountDeltaB(currSqrtPrice, targetSqrtPrice, currLiquidity, amountSpecifiedIsInput)
  }
};

const computeSwapStep = (
  amountRemaining,
  feeRate,
  currLiquidity,
  currSqrtPrice,
  targetSqrtPrice,
  amountSpecifiedIsInput,
  aToB
) => {
  let amountFixedDelta = getAmountFixedDelta(
    currSqrtPrice,
    targetSqrtPrice,
    currLiquidity,
    amountSpecifiedIsInput,
    aToB
  );

  let amountCalc = amountRemaining;
  if (amountSpecifiedIsInput) {
    const result = BitMath.mulDiv(
      amountRemaining,
      FEE_RATE_MUL_VALUE.sub(new BN(feeRate)),
      FEE_RATE_MUL_VALUE,
      128
    );
    amountCalc = result;
  }

  let nextSqrtPrice = amountCalc.gte(amountFixedDelta)
    ? targetSqrtPrice
    : getNextSqrtPrice(currSqrtPrice, currLiquidity, amountCalc, amountSpecifiedIsInput, aToB);

  let isMaxSwap = nextSqrtPrice.eq(targetSqrtPrice);

  let amountUnfixedDelta = getAmountUnfixedDelta(
    currSqrtPrice,
    nextSqrtPrice,
    currLiquidity,
    amountSpecifiedIsInput,
    aToB
  );

  if (!isMaxSwap) {
    amountFixedDelta = getAmountFixedDelta(
      currSqrtPrice,
      nextSqrtPrice,
      currLiquidity,
      amountSpecifiedIsInput,
      aToB
    );
  }

  let amountIn = amountSpecifiedIsInput ? amountFixedDelta : amountUnfixedDelta;
  let amountOut = amountSpecifiedIsInput ? amountUnfixedDelta : amountFixedDelta;

  if (!amountSpecifiedIsInput && amountOut.gt(amountRemaining)) {
    amountOut = amountRemaining;
  }

  let feeAmount;
  if (amountSpecifiedIsInput && !isMaxSwap) {
    feeAmount = amountRemaining.sub(amountIn);
  } else {
    const feeRateBN = new BN(feeRate);
    feeAmount = BitMath.mulDivRoundUp(amountIn, feeRateBN, FEE_RATE_MUL_VALUE.sub(feeRateBN), 128);
  }

  return {
    amountIn,
    amountOut,
    nextPrice: nextSqrtPrice,
    feeAmount,
  };
};

const calculateNextLiquidity = (tickNetLiquidity, currLiquidity, aToB) => {
  return aToB ? currLiquidity.sub(tickNetLiquidity) : currLiquidity.add(tickNetLiquidity);
};

const calculateProtocolFee = (globalFee, protocolFeeRate) => {
  return globalFee.mul(new u64(protocolFeeRate).div(PROTOCOL_FEE_RATE_MUL_VALUE));
};

const calculateFees = (
  feeAmount,
  protocolFeeRate,
  currLiquidity,
  currProtocolFee,
  currFeeGrowthGlobalInput
) => {
  let nextProtocolFee = currProtocolFee;
  let nextFeeGrowthGlobalInput = currFeeGrowthGlobalInput;
  let globalFee = feeAmount;

  if (protocolFeeRate > 0) {
    let delta = calculateProtocolFee(globalFee, protocolFeeRate);
    globalFee = globalFee.sub(delta);
    nextProtocolFee = nextProtocolFee.add(currProtocolFee);
  }

  if (currLiquidity.gt(ZERO)) {
    const globalFeeIncrement = globalFee.shln(64).div(currLiquidity);
    nextFeeGrowthGlobalInput = nextFeeGrowthGlobalInput.add(globalFeeIncrement);
  }

  return {
    nextProtocolFee,
    nextFeeGrowthGlobalInput,
  };
};

const compute = ({
  tokenAmount,
  aToB,
  freshWhirlpoolData,
  tickSequence,
  sqrtPriceLimit,
  amountSpecifiedIsInput,
})=> {
  
  let amountRemaining = tokenAmount;
  let amountCalculated = ZERO;
  let currSqrtPrice = freshWhirlpoolData.sqrtPrice;
  let currLiquidity = freshWhirlpoolData.liquidity;
  let currTickIndex = freshWhirlpoolData.tickCurrentIndex;
  let totalFeeAmount = ZERO;
  const feeRate = freshWhirlpoolData.feeRate;
  const protocolFeeRate = freshWhirlpoolData.protocolFeeRate;
  let currProtocolFee = new u64(0);
  let currFeeGrowthGlobalInput = aToB ? freshWhirlpoolData.feeGrowthGlobalA : freshWhirlpoolData.feeGrowthGlobalB;

  while (amountRemaining.gt(ZERO) && !sqrtPriceLimit.eq(currSqrtPrice)) {
    let { nextIndex: nextTickIndex } = tickSequence.findNextInitializedTickIndex(currTickIndex);

    let { nextTickPrice, nextSqrtPriceLimit: targetSqrtPrice } = getNextSqrtPrices(
      nextTickIndex,
      sqrtPriceLimit,
      aToB
    );

    const swapComputation = computeSwapStep(
      amountRemaining,
      feeRate,
      currLiquidity,
      currSqrtPrice,
      targetSqrtPrice,
      amountSpecifiedIsInput,
      aToB
    );

    totalFeeAmount = totalFeeAmount.add(swapComputation.feeAmount);

    if (amountSpecifiedIsInput) {
      amountRemaining = amountRemaining.sub(swapComputation.amountIn);
      amountRemaining = amountRemaining.sub(swapComputation.feeAmount);
      amountCalculated = amountCalculated.add(swapComputation.amountOut);
    } else {
      amountRemaining = amountRemaining.sub(swapComputation.amountOut);
      amountCalculated = amountCalculated.add(swapComputation.amountIn);
      amountCalculated = amountCalculated.add(swapComputation.feeAmount);
    }

    let { nextProtocolFee, nextFeeGrowthGlobalInput } = calculateFees(
      swapComputation.feeAmount,
      protocolFeeRate,
      currLiquidity,
      currProtocolFee,
      currFeeGrowthGlobalInput
    );
    currProtocolFee = nextProtocolFee;
    currFeeGrowthGlobalInput = nextFeeGrowthGlobalInput;

    if (swapComputation.nextPrice.eq(nextTickPrice)) {
      const nextTick = tickSequence.getTick(nextTickIndex);
      if (nextTick.initialized) {
        currLiquidity = calculateNextLiquidity(nextTick.liquidityNet, currLiquidity, aToB);
      }
      currTickIndex = aToB ? nextTickIndex - 1 : nextTickIndex;
    } else {
      currTickIndex = PriceMath.sqrtPriceX64ToTickIndex(swapComputation.nextPrice);
    }

    currSqrtPrice = swapComputation.nextPrice;
  }

  return amountCalculated
};

const MAX_SWAP_TICK_ARRAYS = 3;
const MAX_TICK_INDEX = 443636; // i32
const MIN_TICK_INDEX = -443636; // i32
const TICK_ARRAY_SIZE = 88; // i32

const getStartTickIndex = (tickIndex, tickSpacing, offset) => {
  const realIndex = Math.floor(tickIndex / tickSpacing / TICK_ARRAY_SIZE);
  const startTickIndex = (realIndex + offset) * tickSpacing * TICK_ARRAY_SIZE;

  const ticksInArray = TICK_ARRAY_SIZE * tickSpacing;
  const minTickIndex = MIN_TICK_INDEX - ((MIN_TICK_INDEX % ticksInArray) + ticksInArray);
  if(startTickIndex < minTickIndex) { throw(`startTickIndex is too small - - ${startTickIndex}`) }
  if(startTickIndex > MAX_TICK_INDEX) { throw(`startTickIndex is too large - ${startTickIndex}`) }
  return startTickIndex
};

const getTickArrayAddresses = async({ aToB, pool, tickSpacing, tickCurrentIndex })=>{
  const shift = aToB ? 0 : tickSpacing;
  let offset = 0;
  let tickArrayAddresses = [];
  for (let i = 0; i < MAX_SWAP_TICK_ARRAYS; i++) {
    let startIndex;
    try {
      startIndex = getStartTickIndex(tickCurrentIndex + shift, tickSpacing, offset);
    } catch (e) {
      return tickArrayAddresses
    }

    const pda = (
      await PublicKey.findProgramAddress([
          Buffer.from('tick_array'),
          new PublicKey(pool.toString()).toBuffer(),
          Buffer.from(startIndex.toString())
        ],
        new PublicKey(basics.router.v1.address)
      )
    )[0];
    tickArrayAddresses.push(pda);
    offset = aToB ? offset - 1 : offset + 1;
  }

  return tickArrayAddresses
};

const getTickArrays = async ({ 
  pool, // stale whirlpool pubkey
  freshWhirlpoolData, // fresh whirlpool account data
  aToB, // direction
})=>{

  const tickArrayAddresses = await getTickArrayAddresses({ aToB, pool, tickSpacing: freshWhirlpoolData.tickSpacing, tickCurrentIndex: freshWhirlpoolData.tickCurrentIndex });

  return (
    await Promise.all(tickArrayAddresses.map(async(address, index) => {

      let data;
      try {
        data = await request({ blockchain: 'solana' , address: address.toString(), api: TICK_ARRAY_LAYOUT, cache: 10 });
      } catch (e2) {}

      return { address, data }
    }))
  )
};

class TickArrayIndex {
  
  static fromTickIndex(index, tickSpacing) {
    const arrayIndex = Math.floor(Math.floor(index / tickSpacing) / TICK_ARRAY_SIZE);
    let offsetIndex = Math.floor((index % (tickSpacing * TICK_ARRAY_SIZE)) / tickSpacing);
    if (offsetIndex < 0) {
      offsetIndex = TICK_ARRAY_SIZE + offsetIndex;
    }
    return new TickArrayIndex(arrayIndex, offsetIndex, tickSpacing)
  }

  constructor(arrayIndex, offsetIndex, tickSpacing) {
    if (offsetIndex >= TICK_ARRAY_SIZE) {
      throw new Error("Invalid offsetIndex - value has to be smaller than TICK_ARRAY_SIZE")
    }
    if (offsetIndex < 0) {
      throw new Error("Invalid offsetIndex - value is smaller than 0")
    }

    if (tickSpacing < 0) {
      throw new Error("Invalid tickSpacing - value is less than 0")
    }

    this.arrayIndex = arrayIndex;
    this.offsetIndex = offsetIndex;
    this.tickSpacing = tickSpacing;
  }

  toTickIndex() {
    return (
      this.arrayIndex * TICK_ARRAY_SIZE * this.tickSpacing + this.offsetIndex * this.tickSpacing
    );
  }

  toNextInitializableTickIndex() {
    return TickArrayIndex.fromTickIndex(this.toTickIndex() + this.tickSpacing, this.tickSpacing)
  }

  toPrevInitializableTickIndex() {
    return TickArrayIndex.fromTickIndex(this.toTickIndex() - this.tickSpacing, this.tickSpacing)
  }
}

class TickArraySequence {

  constructor(tickArrays, tickSpacing, aToB) {
    if (!tickArrays[0] || !tickArrays[0].data) {
      throw new Error("TickArray index 0 must be initialized");
    }

    // If an uninitialized TickArray appears, truncate all TickArrays after it (inclusive).
    this.sequence = [];
    for (const tickArray of tickArrays) {
      if (!tickArray || !tickArray.data) {
        break;
      }
      this.sequence.push({
        address: tickArray.address,
        data: tickArray.data,
      });
    }

    this.tickArrays = tickArrays;
    this.tickSpacing = tickSpacing;
    this.aToB = aToB;

    this.touchedArrays = [...Array(this.sequence.length).fill(false)];
    this.startArrayIndex = TickArrayIndex.fromTickIndex(
      this.sequence[0].data.startTickIndex,
      this.tickSpacing
    ).arrayIndex;
  }

  isValidTickArray0(tickCurrentIndex) {
    const shift = this.aToB ? 0 : this.tickSpacing;
    const tickArray = this.sequence[0].data;
    return this.checkIfIndexIsInTickArrayRange(tickArray.startTickIndex, tickCurrentIndex + shift);
  }

  getNumOfTouchedArrays() {
    return this.touchedArrays.filter((val) => !!val).length;
  }

  getTouchedArrays(minArraySize) {
    let result = this.touchedArrays.reduce((prev, curr, index) => {
      if (curr) {
        prev.push(this.sequence[index].address);
      }
      return prev;
    }, []);

    // Edge case: nothing was ever touched.
    if (result.length === 0) {
      return [];
    }

    // The quote object should contain the specified amount of tick arrays to be plugged
    // directly into the swap instruction.
    // If the result does not fit minArraySize, pad the rest with the last touched array
    const sizeDiff = minArraySize - result.length;
    if (sizeDiff > 0) {
      result = result.concat(Array(sizeDiff).fill(result[result.length - 1]));
    }

    return result;
  }

  getTick(index) {
    const targetTaIndex = TickArrayIndex.fromTickIndex(index, this.tickSpacing);

    if (!this.isArrayIndexInBounds(targetTaIndex, this.aToB)) {
      throw new Error("Provided tick index is out of bounds for this sequence.");
    }

    const localArrayIndex = this.getLocalArrayIndex(targetTaIndex.arrayIndex, this.aToB);
    const tickArray = this.sequence[localArrayIndex].data;

    this.touchedArrays[localArrayIndex] = true;

    if (!tickArray) {
      throw new Error(
        `TickArray at index ${localArrayIndex} is not initialized.`
      );
    }

    if (!this.checkIfIndexIsInTickArrayRange(tickArray.startTickIndex, index)) {
      throw new Error(
        `TickArray at index ${localArrayIndex} is unexpected for this sequence.`
      );
    }

    return tickArray.ticks[targetTaIndex.offsetIndex];
  }
  /**
   * if a->b, currIndex is included in the search
   * if b->a, currIndex is always ignored
   * @param currIndex
   * @returns
   */
  findNextInitializedTickIndex(currIndex) {
    const searchIndex = this.aToB ? currIndex : currIndex + this.tickSpacing;
    let currTaIndex = TickArrayIndex.fromTickIndex(searchIndex, this.tickSpacing);

    // Throw error if the search attempted to search for an index out of bounds
    if (!this.isArrayIndexInBounds(currTaIndex, this.aToB)) {
      throw new Error(
        `Swap input value traversed too many arrays. Out of bounds at attempt to traverse tick index - ${currTaIndex.toTickIndex()}.`
      );
    }

    while (this.isArrayIndexInBounds(currTaIndex, this.aToB)) {
      const currTickData = this.getTick(currTaIndex.toTickIndex());
      if (currTickData.initialized) {
        return { nextIndex: currTaIndex.toTickIndex(), nextTickData: currTickData };
      }
      currTaIndex = this.aToB
        ? currTaIndex.toPrevInitializableTickIndex()
        : currTaIndex.toNextInitializableTickIndex();
    }

    const lastIndexInArray = Math.max(
      Math.min(
        this.aToB ? currTaIndex.toTickIndex() + this.tickSpacing : currTaIndex.toTickIndex() - 1,
        MAX_TICK_INDEX
      ),
      MIN_TICK_INDEX
    );

    return { nextIndex: lastIndexInArray, nextTickData: null };
  }

  getLocalArrayIndex(arrayIndex, aToB) {
    return aToB ? this.startArrayIndex - arrayIndex : arrayIndex - this.startArrayIndex;
  }

  /**
   * Check whether the array index potentially exists in this sequence.
   * Note: assumes the sequence of tick-arrays are sequential
   * @param index
   */
  isArrayIndexInBounds(index, aToB) {
    // a+0...a+n-1 array index is ok
    const localArrayIndex = this.getLocalArrayIndex(index.arrayIndex, aToB);
    const seqLength = this.sequence.length;
    return localArrayIndex >= 0 && localArrayIndex < seqLength;
  }

  checkIfIndexIsInTickArrayRange(startTick, tickIndex) {
    const upperBound = startTick + this.tickSpacing * TICK_ARRAY_SIZE;
    return tickIndex >= startTick && tickIndex < upperBound;
  }
}

const getPrice = async ({
  account, // stale whirlpool account
  tokenIn,
  tokenOut,
  amountIn,
  amountInMax,
  amountOut,
  amountOutMin,
})=>{

  try {
    
    const freshWhirlpoolData = await request({
      blockchain: 'solana',
      address: account.pubkey.toString(),
      api: basics.router.v1.api,
      cache: 10,
    });

    const aToB = (freshWhirlpoolData.tokenMintA.toString() === tokenIn);

    const tickArrays = await getTickArrays({ pool: account.pubkey, freshWhirlpoolData, aToB });

    const tickSequence = new TickArraySequence(tickArrays, freshWhirlpoolData.tickSpacing, aToB);

    const sqrtPriceLimit = new BN(aToB ? MIN_SQRT_PRICE : MAX_SQRT_PRICE);

    const amount = amountIn || amountInMax || amountOut || amountOutMin;

    const amountSpecifiedIsInput = !!(amountIn || amountInMax);

    const amountCalculated = compute({
      tokenAmount: new BN(amount.toString()),
      aToB,
      freshWhirlpoolData,
      tickSequence,
      sqrtPriceLimit,
      amountSpecifiedIsInput,
    });

    return {
      price: amountCalculated.toString(),
      tickArrays,
      aToB,
      sqrtPriceLimit,
    }

  } catch (e) {
    return {
      price: undefined,
      tickArrays: undefined,
      aToB: undefined,
      sqrtPriceLimit: undefined,
    }
  }
};

// This method is cached and is only to be used to generally existing pools every 24h
// Do not use for price calulations, fetch accounts for pools individually in order to calculate price 
let getAccounts = async (base, quote) => {
  let accounts = await request(`solana://${basics.router.v1.address}/getProgramAccounts`, {
    params: { filters: [
      { dataSize: basics.router.v1.api.span },
      { memcmp: { offset: 8, bytes: '2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ' }}, // whirlpoolsConfig
      { memcmp: { offset: 101, bytes: base }}, // tokenMintA
      { memcmp: { offset: 181, bytes: quote }} // tokenMintB
    ]},
    api: basics.router.v1.api,
    cache: 86400, // 24h,
    cacheKey: ['whirlpool', base.toString(), quote.toString()].join('-')
  });
  return accounts
};

let getPairsWithPrice = async({ tokenIn, tokenOut, amountIn, amountInMax, amountOut, amountOutMin }) => {
  try {
    let accounts = await getAccounts(tokenIn, tokenOut);
    if(accounts.length === 0) { accounts = await getAccounts(tokenOut, tokenIn); }
    accounts = accounts.filter((account)=>account.data.liquidity.gt(1));
    accounts = (await Promise.all(accounts.map(async(account)=>{
      const { price, tickArrays, sqrtPriceLimit, aToB } = await getPrice({ account, tokenIn, tokenOut, amountIn, amountInMax, amountOut, amountOutMin });
      if(price === undefined) { return false }

      return { // return a copy, do not mutate accounts
        pubkey: account.pubkey,
        price: price,
        tickArrays: tickArrays,
        sqrtPriceLimit: sqrtPriceLimit,
        aToB: aToB,
        data: {
          tokenVaultA: account.data.tokenVaultA, 
          tokenVaultB: account.data.tokenVaultB
        }
      }
    }))).filter(Boolean);
    return accounts
  } catch (e) {
    return []
  }
};

let getHighestPrice = (pairs)=>{
  return pairs.reduce((bestPricePair, currentPair)=> ethers.BigNumber.from(currentPair.price).gt(ethers.BigNumber.from(bestPricePair.price)) ? currentPair : bestPricePair)
};

let getLowestPrice = (pairs)=>{
  return pairs.reduce((bestPricePair, currentPair)=> ethers.BigNumber.from(currentPair.price).lt(ethers.BigNumber.from(bestPricePair.price)) ? currentPair : bestPricePair)
};

let getBestPair = async({ tokenIn, tokenOut, amountIn, amountInMax, amountOut, amountOutMin }) => {
  const pairs = await getPairsWithPrice({ tokenIn, tokenOut, amountIn, amountInMax, amountOut, amountOutMin });

  if(!pairs || pairs.length === 0) { return }

  let bestPair;

  if(amountIn || amountInMax) {
    bestPair = getHighestPrice(pairs);
  } else { // amount out
    bestPair = getLowestPrice(pairs);
  }

  return bestPair
};

function _optionalChain$2(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }
const blockchain$d = Blockchains.solana;

// Replaces 11111111111111111111111111111111 with the wrapped token and implies wrapping.
//
// We keep 11111111111111111111111111111111 internally
// to be able to differentiate between SOL<>Token and WSOL<>Token swaps
// as they are not the same!
//
let fixPath$3 = (path) => {
  if(!path) { return }
  let fixedPath = path.map((token, index) => {
    if (
      token === blockchain$d.currency.address && path[index+1] != blockchain$d.wrapped.address &&
      path[index-1] != blockchain$d.wrapped.address
    ) {
      return blockchain$d.wrapped.address
    } else {
      return token
    }
  });

  if(fixedPath[0] == blockchain$d.currency.address && fixedPath[1] == blockchain$d.wrapped.address) {
    fixedPath.splice(0, 1);
  } else if(fixedPath[fixedPath.length-1] == blockchain$d.currency.address && fixedPath[fixedPath.length-2] == blockchain$d.wrapped.address) {
    fixedPath.splice(fixedPath.length-1, 1);
  }

  return fixedPath
};

let pathExists$3 = async ({ path, amountIn, amountInMax, amountOut, amountOutMin }) => {
  if(path.length == 1) { return false }
  path = fixPath$3(path);
  if((await getPairsWithPrice({ tokenIn: path[0], tokenOut: path[1], amountIn, amountInMax, amountOut, amountOutMin })).length > 0) {
    return true
  } else {
    return false
  }
};

let findPath$3 = async ({ tokenIn, tokenOut, amountIn, amountOut, amountInMax, amountOutMin }) => {
  if(
    [tokenIn, tokenOut].includes(blockchain$d.currency.address) &&
    [tokenIn, tokenOut].includes(blockchain$d.wrapped.address)
  ) { return { path: undefined, fixedPath: undefined } }

  let path, stablesIn, stablesOut, stable;

  if (await pathExists$3({ path: [tokenIn, tokenOut], amountIn, amountInMax, amountOut, amountOutMin })) {
    // direct path
    path = [tokenIn, tokenOut];
  } else if (
    tokenIn != blockchain$d.wrapped.address &&
    tokenIn != blockchain$d.currency.address &&
    await pathExists$3({ path: [tokenIn, blockchain$d.wrapped.address], amountIn, amountInMax, amountOut, amountOutMin }) &&
    tokenOut != blockchain$d.wrapped.address &&
    tokenOut != blockchain$d.currency.address &&
    await pathExists$3({ path: [tokenOut, blockchain$d.wrapped.address], amountIn: (amountOut||amountOutMin), amountInMax: (amountOut||amountOutMin), amountOut: (amountIn||amountInMax), amountOutMin: (amountIn||amountInMax) })
  ) {
    // path via blockchain.wrapped.address
    path = [tokenIn, blockchain$d.wrapped.address, tokenOut];
  } else if (
    !blockchain$d.stables.usd.includes(tokenIn) &&
    (stablesIn = (await Promise.all(blockchain$d.stables.usd.map(async(stable)=>await pathExists$3({ path: [tokenIn, stable], amountIn, amountInMax, amountOut, amountOutMin }) ? stable : undefined))).filter(Boolean)) &&
    !blockchain$d.stables.usd.includes(tokenOut) &&
    (stablesOut = (await Promise.all(blockchain$d.stables.usd.map(async(stable)=>await pathExists$3({ path: [tokenOut, stable], amountIn: (amountOut||amountOutMin), amountInMax: (amountOut||amountOutMin), amountOut: (amountIn||amountInMax), amountOutMin: (amountIn||amountInMax) })  ? stable : undefined))).filter(Boolean)) &&
    (stable = stablesIn.filter((stable)=> stablesOut.includes(stable))[0])
  ) {
    // path via TOKEN_IN <> STABLE <> TOKEN_OUT
    path = [tokenIn, stable, tokenOut];
  }

  // Add blockchain.wrapped.address to route path if things start or end with blockchain.currency.address
  // because that actually reflects how things are routed in reality:
  if(_optionalChain$2([path, 'optionalAccess', _ => _.length]) && path[0] == blockchain$d.currency.address) {
    path.splice(1, 0, blockchain$d.wrapped.address);
  } else if(_optionalChain$2([path, 'optionalAccess', _2 => _2.length]) && path[path.length-1] == blockchain$d.currency.address) {
    path.splice(path.length-1, 0, blockchain$d.wrapped.address);
  }
  return { path, fixedPath: fixPath$3(path) }
};

let getAmountsOut = async ({ path, amountIn, amountInMax }) => {

  let amounts = [ethers.BigNumber.from(amountIn || amountInMax)];

  amounts.push(ethers.BigNumber.from((await getBestPair({ tokenIn: path[0], tokenOut: path[1], amountIn, amountInMax })).price));
  
  if (path.length === 3) {
    amounts.push(ethers.BigNumber.from((await getBestPair({ tokenIn: path[1], tokenOut: path[2], amountIn: amountIn ? amounts[1] : undefined, amountInMax: amountInMax ? amounts[1] : undefined })).price));
  }

  if(amounts.length != path.length) { return }

  return amounts
};

let getAmountsIn = async({ path, amountOut, amountOutMin }) => {

  path = path.slice().reverse();
  let amounts = [ethers.BigNumber.from(amountOut || amountOutMin)];

  amounts.push(ethers.BigNumber.from((await getBestPair({ tokenIn: path[1], tokenOut: path[0], amountOut, amountOutMin })).price));
  
  if (path.length === 3) {
    amounts.push(ethers.BigNumber.from((await getBestPair({ tokenIn: path[2], tokenOut: path[1], amountOut: amountOut ? amounts[1] : undefined, amountOutMin: amountOutMin ? amounts[1] : undefined })).price));
  }
  
  if(amounts.length != path.length) { return }

  return amounts.slice().reverse()
};

let getAmounts$3 = async ({
  path,
  tokenIn,
  tokenOut,
  amountOut,
  amountIn,
  amountInMax,
  amountOutMin
}) => {
  path = fixPath$3(path);
  let amounts;
  if (amountOut) {
    amounts = await getAmountsIn({ path, amountOut, tokenIn, tokenOut });
    amountIn = amounts ? amounts[0] : undefined;
    if (amountIn == undefined || amountInMax && amountIn.gt(amountInMax)) {
      return {}
    } else if (amountInMax === undefined) {
      amountInMax = amountIn;
    }
  } else if (amountIn) {
    amounts = await getAmountsOut({ path, amountIn, tokenIn, tokenOut });
    amountOut = amounts ? amounts[amounts.length-1] : undefined;
    if (amountOut == undefined || amountOutMin && amountOut.lt(amountOutMin)) {
      return {}
    } else if (amountOutMin === undefined) {
      amountOutMin = amountOut;
    }
  } else if(amountOutMin) {
    amounts = await getAmountsIn({ path, amountOutMin, tokenIn, tokenOut });
    amountIn = amounts ? amounts[0] : undefined;
    if (amountIn == undefined || amountInMax && amountIn.gt(amountInMax)) {
      return {}
    } else if (amountInMax === undefined) {
      amountInMax = amountIn;
    }
  } else if(amountInMax) {
    amounts = await getAmountsOut({ path, amountInMax, tokenIn, tokenOut });
    amountOut = amounts ? amounts[amounts.length-1] : undefined;
    if (amountOut == undefined ||amountOutMin && amountOut.lt(amountOutMin)) {
      return {}
    } else if (amountOutMin === undefined) {
      amountOutMin = amountOut;
    }
  }
  return {
    amountOut: (amountOut || amountOutMin),
    amountIn: (amountIn || amountInMax),
    amountInMax: (amountInMax || amountIn),
    amountOutMin: (amountOutMin || amountOut),
    amounts
  }
};

const blockchain$c = Blockchains.solana;
const SWAP_INSTRUCTION = new BN("14449647541112719096");
const TWO_HOP_SWAP_INSTRUCTION = new BN("16635068063392030915");

const createTokenAccountIfNotExisting = async ({ instructions, owner, token, account })=>{
  let outAccountExists;
  try{ outAccountExists = !!(await request({ blockchain: 'solana', address: account.toString() })); } catch (e2) {}
  if(!outAccountExists) {
    instructions.push(
      await Token.solana.createAssociatedTokenAccountInstruction({
        token,
        owner,
        payer: owner,
      })
    );
  }
};

const getTwoHopSwapInstructionKeys = async ({
  fromAddress,
  poolOne,
  tickArraysOne,
  tokenAccountOneA,
  tokenVaultOneA,
  tokenAccountOneB,
  tokenVaultOneB,
  poolTwo,
  tickArraysTwo,
  tokenAccountTwoA,
  tokenVaultTwoA,
  tokenAccountTwoB,
  tokenVaultTwoB,
})=> {

  let lastInitializedTickOne = false;
  const onlyInitializedTicksOne = tickArraysOne.map((tickArray, index)=>{
    if(lastInitializedTickOne !== false) {
      return tickArraysOne[lastInitializedTickOne]
    } else if(tickArray.data){
      return tickArray
    } else {
      lastInitializedTickOne = index-1;
      return tickArraysOne[index-1]
    }
  });

  let lastInitializedTickTwo = false;
  const onlyInitializedTicksTwo = tickArraysTwo.map((tickArray, index)=>{
    if(lastInitializedTickTwo !== false) {
      return tickArraysTwo[lastInitializedTickTwo]
    } else if(tickArray.data){
      return tickArray
    } else {
      lastInitializedTickTwo = index-1;
      return tickArraysTwo[index-1]
    }
  });

  return [
    // token_program
    { pubkey: new PublicKey(Token.solana.TOKEN_PROGRAM), isWritable: false, isSigner: false },
    // token_authority
    { pubkey: new PublicKey(fromAddress), isWritable: false, isSigner: true },
    // whirlpool_one
    { pubkey: new PublicKey(poolOne.toString()), isWritable: true, isSigner: false },
    // whirlpool_two
    { pubkey: new PublicKey(poolTwo.toString()), isWritable: true, isSigner: false },
    // token_owner_account_one_a
    { pubkey: new PublicKey(tokenAccountOneA.toString()), isWritable: true, isSigner: false },
    // token_vault_one_a
    { pubkey: new PublicKey(tokenVaultOneA.toString()), isWritable: true, isSigner: false },
    // token_owner_account_one_b
    { pubkey: new PublicKey(tokenAccountOneB.toString()), isWritable: true, isSigner: false },
    // token_vault_one_b
    { pubkey: new PublicKey(tokenVaultOneB.toString()), isWritable: true, isSigner: false },
    // token_owner_account_two_a
    { pubkey: new PublicKey(tokenAccountTwoA.toString()), isWritable: true, isSigner: false },
    // token_vault_two_a
    { pubkey: new PublicKey(tokenVaultTwoA.toString()), isWritable: true, isSigner: false },
    // token_owner_account_two_b
    { pubkey: new PublicKey(tokenAccountTwoB.toString()), isWritable: true, isSigner: false },
    // token_vault_two_b
    { pubkey: new PublicKey(tokenVaultTwoB.toString()), isWritable: true, isSigner: false },
    // tick_array_one_0
    { pubkey: onlyInitializedTicksOne[0].address, isWritable: true, isSigner: false },
    // tick_array_one_1
    { pubkey: onlyInitializedTicksOne[1].address, isWritable: true, isSigner: false },
    // tick_array_one_2
    { pubkey: onlyInitializedTicksOne[2].address, isWritable: true, isSigner: false },
    // tick_array_two_0
    { pubkey: onlyInitializedTicksTwo[0].address, isWritable: true, isSigner: false },
    // tick_array_two_1
    { pubkey: onlyInitializedTicksTwo[1].address, isWritable: true, isSigner: false },
    // tick_array_two_2
    { pubkey: onlyInitializedTicksTwo[2].address, isWritable: true, isSigner: false },
    // oracle_one
    { pubkey: (await PublicKey.findProgramAddress([ Buffer.from('oracle'), new PublicKey(poolOne.toString()).toBuffer() ], new PublicKey(basics.router.v1.address)))[0], isWritable: false, isSigner: false },
    // oracle_two
    { pubkey: (await PublicKey.findProgramAddress([ Buffer.from('oracle'), new PublicKey(poolTwo.toString()).toBuffer() ], new PublicKey(basics.router.v1.address)))[0], isWritable: false, isSigner: false },
  ]
};
const getTwoHopSwapInstructionData = ({
  amount,
  otherAmountThreshold,
  amountSpecifiedIsInput,
  aToBOne,
  aToBTwo,
  sqrtPriceLimitOne,
  sqrtPriceLimitTwo,
})=> {
  let LAYOUT, data;
  
  LAYOUT = struct([
    u64$1("anchorDiscriminator"),
    u64$1("amount"),
    u64$1("otherAmountThreshold"),
    bool("amountSpecifiedIsInput"),
    bool("aToBOne"),
    bool("aToBTwo"),
    u128("sqrtPriceLimitOne"),
    u128("sqrtPriceLimitTwo"),
  ]);
  data = Buffer.alloc(LAYOUT.span);
  LAYOUT.encode(
    {
      anchorDiscriminator: TWO_HOP_SWAP_INSTRUCTION,
      amount: new BN(amount.toString()),
      otherAmountThreshold: new BN(otherAmountThreshold.toString()),
      amountSpecifiedIsInput,
      aToBOne,
      aToBTwo,
      sqrtPriceLimitOne,
      sqrtPriceLimitTwo,
    },
    data,
  );

  return data
};

const getSwapInstructionKeys = async ({
  fromAddress,
  pool,
  tokenAccountA,
  tokenVaultA,
  tokenAccountB,
  tokenVaultB,
  tickArrays,
})=> {

  let lastInitializedTick = false;
  const onlyInitializedTicks = tickArrays.map((tickArray, index)=>{
    if(lastInitializedTick !== false) {
      return tickArrays[lastInitializedTick]
    } else if(tickArray.data){
      return tickArray
    } else {
      lastInitializedTick = index-1;
      return tickArrays[index-1]
    }
  });

  return [
    // token_program
    { pubkey: new PublicKey(Token.solana.TOKEN_PROGRAM), isWritable: false, isSigner: false },
    // token_authority
    { pubkey: new PublicKey(fromAddress), isWritable: false, isSigner: true },
    // whirlpool
    { pubkey: new PublicKey(pool.toString()), isWritable: true, isSigner: false },
    // token_owner_account_a
    { pubkey: new PublicKey(tokenAccountA.toString()), isWritable: true, isSigner: false },
    // token_vault_a
    { pubkey: new PublicKey(tokenVaultA.toString()), isWritable: true, isSigner: false },
    // token_owner_account_b
    { pubkey: new PublicKey(tokenAccountB.toString()), isWritable: true, isSigner: false },
    // token_vault_b
    { pubkey: new PublicKey(tokenVaultB.toString()), isWritable: true, isSigner: false },
    // tick_array_0
    { pubkey: onlyInitializedTicks[0].address, isWritable: true, isSigner: false },
    // tick_array_1
    { pubkey: onlyInitializedTicks[1].address, isWritable: true, isSigner: false },
    // tick_array_2
    { pubkey: onlyInitializedTicks[2].address, isWritable: true, isSigner: false },
    // oracle
    { pubkey: (await PublicKey.findProgramAddress([ Buffer.from('oracle'), new PublicKey(pool.toString()).toBuffer() ], new PublicKey(basics.router.v1.address)))[0], isWritable: false, isSigner: false },
  ]
};

const getSwapInstructionData = ({ amount, otherAmountThreshold, sqrtPriceLimit, amountSpecifiedIsInput, aToB })=> {
  let LAYOUT, data;
  
  LAYOUT = struct([
    u64$1("anchorDiscriminator"),
    u64$1("amount"),
    u64$1("otherAmountThreshold"),
    u128("sqrtPriceLimit"),
    bool("amountSpecifiedIsInput"),
    bool("aToB"),
  ]);
  data = Buffer.alloc(LAYOUT.span);
  LAYOUT.encode(
    {
      anchorDiscriminator: SWAP_INSTRUCTION,
      amount: new BN(amount.toString()),
      otherAmountThreshold: new BN(otherAmountThreshold.toString()),
      sqrtPriceLimit,
      amountSpecifiedIsInput,
      aToB,
    },
    data,
  );

  return data
};

const getTransaction$3 = async ({
  exchange,
  path,
  amountIn,
  amountInMax,
  amountOut,
  amountOutMin,
  amounts,
  amountInInput,
  amountOutInput,
  amountInMaxInput,
  amountOutMinInput,
  fromAddress
}) => {
  let transaction = { blockchain: 'solana' };
  let instructions = [];

  const fixedPath = fixPath$3(path);
  if(fixedPath.length > 3) { throw 'Orca can only handle fixed paths with a max length of 3 (2 pools)!' }
  const tokenIn = fixedPath[0];
  const tokenMiddle = fixedPath.length == 3 ? fixedPath[1] : undefined;
  const tokenOut = fixedPath[fixedPath.length-1];

  let pairs;
  if(fixedPath.length == 2) {
    pairs = [await getBestPair({ tokenIn, tokenOut, amountIn: (amountInInput || amountInMaxInput), amountOut: (amountOutInput || amountOutMinInput) })];
  } else {
    if(amountInInput || amountInMaxInput) {
      pairs = [await getBestPair({ tokenIn, tokenOut: tokenMiddle, amountIn: (amountInInput || amountInMaxInput) })];
      pairs.push(await getBestPair({ tokenIn: tokenMiddle, tokenOut, amountIn: pairs[0].price }));
    } else { // originally amountOut
      pairs = [await getBestPair({ tokenIn: tokenMiddle, tokenOut, amountOut: (amountOutInput || amountOutMinInput) })];
      pairs.unshift(await getBestPair({ tokenIn, tokenOut: tokenMiddle, amountOut: pairs[0].price }));
    }
  }

  let startsWrapped = (path[0] === blockchain$c.currency.address && fixedPath[0] === blockchain$c.wrapped.address);
  let endsUnwrapped = (path[path.length-1] === blockchain$c.currency.address && fixedPath[fixedPath.length-1] === blockchain$c.wrapped.address);
  let wrappedAccount;
  const provider = await getProvider('solana');
  
  if(startsWrapped || endsUnwrapped) {
    const rent = await provider.getMinimumBalanceForRentExemption(Token.solana.TOKEN_LAYOUT.span);
    const keypair = Keypair.generate();
    wrappedAccount = keypair.publicKey.toString();
    const lamports = startsWrapped ? new BN(amountIn.toString()).add(new BN(rent)) :  new BN(rent);
    let createAccountInstruction = SystemProgram.createAccount({
      fromPubkey: new PublicKey(fromAddress),
      newAccountPubkey: new PublicKey(wrappedAccount),
      programId: new PublicKey(Token.solana.TOKEN_PROGRAM),
      space: Token.solana.TOKEN_LAYOUT.span,
      lamports
    });
    createAccountInstruction.signers = [keypair];
    instructions.push(createAccountInstruction);
    instructions.push(
      Token.solana.initializeAccountInstruction({
        account: wrappedAccount,
        token: blockchain$c.wrapped.address,
        owner: fromAddress
      })
    );
  }

  if(pairs.length === 1) {
    // amount is NOT the precise part of the swap (otherAmountThreshold is)
    let amountSpecifiedIsInput = !!(amountInInput || amountOutMinInput);
    let amount = amountSpecifiedIsInput ? amountIn : amountOut;
    let otherAmountThreshold = amountSpecifiedIsInput ? amountOutMin : amountInMax;
    let tokenAccountIn = startsWrapped ? new PublicKey(wrappedAccount) : new PublicKey(await Token.solana.findProgramAddress({ owner: fromAddress, token: tokenIn }));
    let tokenAccountOut = endsUnwrapped ? new PublicKey(wrappedAccount) : new PublicKey(await Token.solana.findProgramAddress({ owner: fromAddress, token: tokenOut }));
    if(!endsUnwrapped) {
      await createTokenAccountIfNotExisting({ instructions, owner: fromAddress, token: tokenOut, account: tokenAccountOut });
    }
    instructions.push(
      new TransactionInstruction({
        programId: new PublicKey(exchange.router.v1.address),
        keys: await getSwapInstructionKeys({
          fromAddress,
          pool: pairs[0].pubkey,
          tokenAccountA: pairs[0].aToB ? tokenAccountIn : tokenAccountOut,
          tokenVaultA: pairs[0].data.tokenVaultA,
          tokenAccountB: pairs[0].aToB ? tokenAccountOut : tokenAccountIn,
          tokenVaultB: pairs[0].data.tokenVaultB,
          tickArrays: pairs[0].tickArrays,
        }),
        data: getSwapInstructionData({
          amount,
          otherAmountThreshold,
          sqrtPriceLimit: pairs[0].sqrtPriceLimit,
          amountSpecifiedIsInput,
          aToB: pairs[0].aToB
        }),
      })
    );
  } else if (pairs.length === 2) {
    // amount is NOT the precise part of the swap (otherAmountThreshold is)
    let amountSpecifiedIsInput = !!(amountInInput || amountOutMinInput);
    let amount = amountSpecifiedIsInput ? amountIn : amountOut;
    let otherAmountThreshold = amountSpecifiedIsInput ? amountOutMin : amountInMax;
    let tokenAccountIn = startsWrapped ? new PublicKey(wrappedAccount) : new PublicKey(await Token.solana.findProgramAddress({ owner: fromAddress, token: tokenIn }));
    let tokenMiddle = fixedPath[1];
    let tokenAccountMiddle = new PublicKey(await Token.solana.findProgramAddress({ owner: fromAddress, token: tokenMiddle }));
    await createTokenAccountIfNotExisting({ instructions, owner: fromAddress, token: tokenMiddle, account: tokenAccountMiddle });
    let tokenAccountOut = endsUnwrapped ? new PublicKey(wrappedAccount) : new PublicKey(await Token.solana.findProgramAddress({ owner: fromAddress, token: tokenOut }));
    if(!endsUnwrapped) {
      await createTokenAccountIfNotExisting({ instructions, owner: fromAddress, token: tokenOut, account: tokenAccountOut });
    }
    instructions.push(
      new TransactionInstruction({
        programId: new PublicKey(exchange.router.v1.address),
        keys: await getTwoHopSwapInstructionKeys({
          fromAddress,
          poolOne: pairs[0].pubkey,
          tickArraysOne: pairs[0].tickArrays,
          tokenAccountOneA: pairs[0].aToB ? tokenAccountIn : tokenAccountMiddle,
          tokenVaultOneA: pairs[0].data.tokenVaultA,
          tokenAccountOneB: pairs[0].aToB ? tokenAccountMiddle : tokenAccountIn,
          tokenVaultOneB: pairs[0].data.tokenVaultB,
          poolTwo: pairs[1].pubkey,
          tickArraysTwo: pairs[1].tickArrays,
          tokenAccountTwoA: pairs[1].aToB ? tokenAccountMiddle : tokenAccountOut,
          tokenVaultTwoA: pairs[1].data.tokenVaultA,
          tokenAccountTwoB: pairs[1].aToB ? tokenAccountOut : tokenAccountMiddle,
          tokenVaultTwoB: pairs[1].data.tokenVaultB,
        }),
        data: getTwoHopSwapInstructionData({
          amount,
          otherAmountThreshold,
          amountSpecifiedIsInput,
          aToBOne: pairs[0].aToB,
          aToBTwo: pairs[1].aToB,
          sqrtPriceLimitOne: pairs[0].sqrtPriceLimit,
          sqrtPriceLimitTwo: pairs[1].sqrtPriceLimit,
        }),
      })
    );
  }
  
  if(startsWrapped || endsUnwrapped) {
    instructions.push(
      Token.solana.closeAccountInstruction({
        account: wrappedAccount,
        owner: fromAddress
      })
    );
  }

  // await debug(instructions, provider)

  transaction.instructions = instructions;
  return transaction
};

var orca = new Exchange(
  Object.assign(basics, {
    findPath: findPath$3,
    pathExists: pathExists$3,
    getAmounts: getAmounts$3,
    getTransaction: getTransaction$3,
  })
);

function _optionalChain$1(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }

// Replaces 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE with the wrapped token and implies wrapping.
//
// We keep 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE internally
// to be able to differentiate between ETH<>Token and WETH<>Token swaps
// as they are not the same!
//
const fixPath$2 = (blockchain, exchange, path) => {
  if(!path) { return }
  let fixedPath = path.map((token, index) => {
    if (
      token === blockchain.currency.address && path[index+1] != blockchain.wrapped.address &&
      path[index-1] != blockchain.wrapped.address
    ) {
      return blockchain.wrapped.address
    } else {
      return token
    }
  });

  if(fixedPath[0] == blockchain.currency.address && fixedPath[1] == blockchain.wrapped.address) {
    fixedPath.splice(0, 1);
  } else if(fixedPath[fixedPath.length-1] == blockchain.currency.address && fixedPath[fixedPath.length-2] == blockchain.wrapped.address) {
    fixedPath.splice(fixedPath.length-1, 1);
  }

  return fixedPath
};

const minReserveRequirements = ({ reserves, min, token, token0, token1, decimals }) => {
  if(token0.toLowerCase() == token.toLowerCase()) {
    return reserves[0].gte(ethers.utils.parseUnits(min.toString(), decimals))
  } else if (token1.toLowerCase() == token.toLowerCase()) {
    return reserves[1].gte(ethers.utils.parseUnits(min.toString(), decimals))
  } else {
    return false
  }
};

const pathExists$2 = async (blockchain, exchange, path) => {
  if(fixPath$2(blockchain, exchange, path).length == 1) { return false }
  try {
    let pair = await request({
      blockchain: blockchain.name,
      address: exchange.factory.address,
      method: 'getPair',
      api: exchange.factory.api,
      cache: 3600000,
      params: fixPath$2(blockchain, exchange, path),
    });
    if(!pair || pair == blockchain.zero) { return false }
    let [reserves, token0, token1] = await Promise.all([
      request({ blockchain: blockchain.name, address: pair, method: 'getReserves', api: exchange.pair.api, cache: 3600000 }),
      request({ blockchain: blockchain.name, address: pair, method: 'token0', api: exchange.pair.api, cache: 3600000 }),
      request({ blockchain: blockchain.name, address: pair, method: 'token1', api: exchange.pair.api, cache: 3600000 })
    ]);
    if(path.includes(blockchain.wrapped.address)) {
      return minReserveRequirements({ min: 1, token: blockchain.wrapped.address, decimals: blockchain.currency.decimals, reserves, token0, token1 })
    } else if (path.find((step)=>blockchain.stables.usd.includes(step))) {
      let address = path.find((step)=>blockchain.stables.usd.includes(step));
      let token = new Token({ blockchain: blockchain.name, address });
      let decimals = await token.decimals();
      return minReserveRequirements({ min: 1000, token: address, decimals, reserves, token0, token1 })
    } else {
      return true
    }
  } catch (e) { return false }
};

const findPath$2 = async (blockchain, exchange, { tokenIn, tokenOut }) => {
  if(
    [tokenIn, tokenOut].includes(blockchain.currency.address) &&
    [tokenIn, tokenOut].includes(blockchain.wrapped.address)
  ) { return { path: undefined, fixedPath: undefined } }

  let path;
  if (await pathExists$2(blockchain, exchange, [tokenIn, tokenOut])) {
    // direct path
    path = [tokenIn, tokenOut];
  } else if (
    tokenIn != blockchain.wrapped.address &&
    await pathExists$2(blockchain, exchange, [tokenIn, blockchain.wrapped.address]) &&
    tokenOut != blockchain.wrapped.address &&
    await pathExists$2(blockchain, exchange, [tokenOut, blockchain.wrapped.address])
  ) {
    // path via WRAPPED
    path = [tokenIn, blockchain.wrapped.address, tokenOut];
  } else if (
    !blockchain.stables.usd.includes(tokenIn) &&
    (await Promise.all(blockchain.stables.usd.map((stable)=>pathExists$2(blockchain, exchange, [tokenIn, stable])))).filter(Boolean).length &&
    tokenOut != blockchain.wrapped.address &&
    await pathExists$2(blockchain, exchange, [blockchain.wrapped.address, tokenOut])
  ) {
    // path via tokenIn -> USD -> WRAPPED -> tokenOut
    let USD = (await Promise.all(blockchain.stables.usd.map(async (stable)=>{ return(await pathExists$2(blockchain, exchange, [tokenIn, stable]) ? stable : undefined) }))).find(Boolean);
    path = [tokenIn, USD, blockchain.wrapped.address, tokenOut];
  } else if (
    tokenIn != blockchain.wrapped.address &&
    await pathExists$2(blockchain, exchange, [tokenIn, blockchain.wrapped.address]) &&
    !blockchain.stables.usd.includes(tokenOut) &&
    (await Promise.all(blockchain.stables.usd.map((stable)=>pathExists$2(blockchain, exchange, [stable, tokenOut])))).filter(Boolean).length
  ) {
    // path via tokenIn -> WRAPPED -> USD -> tokenOut
    let USD = (await Promise.all(blockchain.stables.usd.map(async (stable)=>{ return(await pathExists$2(blockchain, exchange, [stable, tokenOut]) ? stable : undefined) }))).find(Boolean);
    path = [tokenIn, blockchain.wrapped.address, USD, tokenOut];
  }

  // Add WRAPPED to route path if things start or end with NATIVE
  // because that actually reflects how things are routed in reality:
  if(_optionalChain$1([path, 'optionalAccess', _ => _.length]) && path[0] == blockchain.currency.address) {
    path.splice(1, 0, blockchain.wrapped.address);
  } else if(_optionalChain$1([path, 'optionalAccess', _2 => _2.length]) && path[path.length-1] == blockchain.currency.address) {
    path.splice(path.length-1, 0, blockchain.wrapped.address);
  }

  return { path, fixedPath: fixPath$2(blockchain, exchange, path) }
};

let getAmountOut$2 = (blockchain, exchange, { path, amountIn, tokenIn, tokenOut }) => {
  return new Promise((resolve) => {
    request({
      blockchain: blockchain.name,
      address: exchange.router.address,
      method: 'getAmountsOut',
      api: exchange.router.api,
      params: {
        amountIn: amountIn,
        path: fixPath$2(blockchain, exchange, path),
      },
    })
    .then((amountsOut)=>{
      resolve(amountsOut[amountsOut.length - 1]);
    })
    .catch(()=>resolve());
  })
};

let getAmountIn$2 = (blockchain, exchange, { path, amountOut, block }) => {
  return new Promise((resolve) => {
    request({
      blockchain: blockchain.name,
      address: exchange.router.address,
      method: 'getAmountsIn',
      api: exchange.router.api,
      params: {
        amountOut: amountOut,
        path: fixPath$2(blockchain, exchange, path),
      },
      block
    })
    .then((amountsIn)=>resolve(amountsIn[0]))
    .catch(()=>resolve());
  })
};

let getAmounts$2 = async (blockchain, exchange, {
  path,
  block,
  tokenIn,
  tokenOut,
  amountOut,
  amountIn,
  amountInMax,
  amountOutMin
}) => {
  if (amountOut) {
    amountIn = await getAmountIn$2(blockchain, exchange, { block, path, amountOut, tokenIn, tokenOut });
    if (amountIn == undefined || amountInMax && amountIn.gt(amountInMax)) {
      return {}
    } else if (amountInMax === undefined) {
      amountInMax = amountIn;
    }
  } else if (amountIn) {
    amountOut = await getAmountOut$2(blockchain, exchange, { path, amountIn, tokenIn, tokenOut });
    if (amountOut == undefined || amountOutMin && amountOut.lt(amountOutMin)) {
      return {}
    } else if (amountOutMin === undefined) {
      amountOutMin = amountOut;
    }
  } else if(amountOutMin) {
    amountIn = await getAmountIn$2(blockchain, exchange, { block, path, amountOut: amountOutMin, tokenIn, tokenOut });
    if (amountIn == undefined || amountInMax && amountIn.gt(amountInMax)) {
      return {}
    } else if (amountInMax === undefined) {
      amountInMax = amountIn;
    }
  } else if(amountInMax) {
    amountOut = await getAmountOut$2(blockchain, exchange, { path, amountIn: amountInMax, tokenIn, tokenOut });
    if (amountOut == undefined ||amountOutMin && amountOut.lt(amountOutMin)) {
      return {}
    } else if (amountOutMin === undefined) {
      amountOutMin = amountOut;
    }
  }
  return { amountOut, amountIn, amountInMax, amountOutMin }
};

let getTransaction$2 = (blockchain, exchange, {
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
    blockchain: blockchain.name,
    from: fromAddress,
    to: exchange.router.address,
    api: exchange.router.api,
  };

  if (path[0] === blockchain.currency.address) {
    if (amountInInput || amountOutMinInput) {
      transaction.method = 'swapExactETHForTokens';
      transaction.value = amountIn.toString();
      transaction.params = { amountOutMin: amountOutMin.toString() };
    } else if (amountOutInput || amountInMaxInput) {
      transaction.method = 'swapETHForExactTokens';
      transaction.value = amountInMax.toString();
      transaction.params = { amountOut: amountOut.toString() };
    }
  } else if (path[path.length - 1] === blockchain.currency.address) {
    if (amountInInput || amountOutMinInput) {
      transaction.method = 'swapExactTokensForETH';
      transaction.params = { amountIn: amountIn.toString(), amountOutMin: amountOutMin.toString() };
    } else if (amountOutInput || amountInMaxInput) {
      transaction.method = 'swapTokensForExactETH';
      transaction.params = { amountInMax: amountInMax.toString(), amountOut: amountOut.toString() };
    }
  } else {
    if (amountInInput || amountOutMinInput) {
      transaction.method = 'swapExactTokensForTokens';
      transaction.params = { amountIn: amountIn.toString(), amountOutMin: amountOutMin.toString() };
    } else if (amountOutInput || amountInMaxInput) {
      transaction.method = 'swapTokensForExactTokens';
      transaction.params = { amountInMax: amountInMax.toString(), amountOut: amountOut.toString() };
    }
  }

  transaction.params = Object.assign({}, transaction.params, {
    path: fixPath$2(blockchain, exchange, path),
    to: fromAddress,
    deadline: Math.round(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
  });

  return transaction
};

const ROUTER$1 = [{"inputs":[{"internalType":"address","name":"_factory","type":"address"},{"internalType":"address","name":"_WETH","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"WETH","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"tokenA","type":"address"},{"internalType":"address","name":"tokenB","type":"address"},{"internalType":"uint256","name":"amountADesired","type":"uint256"},{"internalType":"uint256","name":"amountBDesired","type":"uint256"},{"internalType":"uint256","name":"amountAMin","type":"uint256"},{"internalType":"uint256","name":"amountBMin","type":"uint256"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"addLiquidity","outputs":[{"internalType":"uint256","name":"amountA","type":"uint256"},{"internalType":"uint256","name":"amountB","type":"uint256"},{"internalType":"uint256","name":"liquidity","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"amountTokenDesired","type":"uint256"},{"internalType":"uint256","name":"amountTokenMin","type":"uint256"},{"internalType":"uint256","name":"amountETHMin","type":"uint256"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"addLiquidityETH","outputs":[{"internalType":"uint256","name":"amountToken","type":"uint256"},{"internalType":"uint256","name":"amountETH","type":"uint256"},{"internalType":"uint256","name":"liquidity","type":"uint256"}],"stateMutability":"payable","type":"function"},{"inputs":[],"name":"factory","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"},{"internalType":"uint256","name":"reserveIn","type":"uint256"},{"internalType":"uint256","name":"reserveOut","type":"uint256"}],"name":"getAmountIn","outputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint256","name":"reserveIn","type":"uint256"},{"internalType":"uint256","name":"reserveOut","type":"uint256"}],"name":"getAmountOut","outputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"},{"internalType":"address[]","name":"path","type":"address[]"}],"name":"getAmountsIn","outputs":[{"internalType":"uint256[]","name":"amounts","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"address[]","name":"path","type":"address[]"}],"name":"getAmountsOut","outputs":[{"internalType":"uint256[]","name":"amounts","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountA","type":"uint256"},{"internalType":"uint256","name":"reserveA","type":"uint256"},{"internalType":"uint256","name":"reserveB","type":"uint256"}],"name":"quote","outputs":[{"internalType":"uint256","name":"amountB","type":"uint256"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"address","name":"tokenA","type":"address"},{"internalType":"address","name":"tokenB","type":"address"},{"internalType":"uint256","name":"liquidity","type":"uint256"},{"internalType":"uint256","name":"amountAMin","type":"uint256"},{"internalType":"uint256","name":"amountBMin","type":"uint256"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"removeLiquidity","outputs":[{"internalType":"uint256","name":"amountA","type":"uint256"},{"internalType":"uint256","name":"amountB","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"liquidity","type":"uint256"},{"internalType":"uint256","name":"amountTokenMin","type":"uint256"},{"internalType":"uint256","name":"amountETHMin","type":"uint256"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"removeLiquidityETH","outputs":[{"internalType":"uint256","name":"amountToken","type":"uint256"},{"internalType":"uint256","name":"amountETH","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"liquidity","type":"uint256"},{"internalType":"uint256","name":"amountTokenMin","type":"uint256"},{"internalType":"uint256","name":"amountETHMin","type":"uint256"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"removeLiquidityETHSupportingFeeOnTransferTokens","outputs":[{"internalType":"uint256","name":"amountETH","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"liquidity","type":"uint256"},{"internalType":"uint256","name":"amountTokenMin","type":"uint256"},{"internalType":"uint256","name":"amountETHMin","type":"uint256"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"bool","name":"approveMax","type":"bool"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"removeLiquidityETHWithPermit","outputs":[{"internalType":"uint256","name":"amountToken","type":"uint256"},{"internalType":"uint256","name":"amountETH","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"liquidity","type":"uint256"},{"internalType":"uint256","name":"amountTokenMin","type":"uint256"},{"internalType":"uint256","name":"amountETHMin","type":"uint256"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"bool","name":"approveMax","type":"bool"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"removeLiquidityETHWithPermitSupportingFeeOnTransferTokens","outputs":[{"internalType":"uint256","name":"amountETH","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"tokenA","type":"address"},{"internalType":"address","name":"tokenB","type":"address"},{"internalType":"uint256","name":"liquidity","type":"uint256"},{"internalType":"uint256","name":"amountAMin","type":"uint256"},{"internalType":"uint256","name":"amountBMin","type":"uint256"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"bool","name":"approveMax","type":"bool"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"removeLiquidityWithPermit","outputs":[{"internalType":"uint256","name":"amountA","type":"uint256"},{"internalType":"uint256","name":"amountB","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"},{"internalType":"address[]","name":"path","type":"address[]"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"swapETHForExactTokens","outputs":[{"internalType":"uint256[]","name":"amounts","type":"uint256[]"}],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountOutMin","type":"uint256"},{"internalType":"address[]","name":"path","type":"address[]"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"swapExactETHForTokens","outputs":[{"internalType":"uint256[]","name":"amounts","type":"uint256[]"}],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountOutMin","type":"uint256"},{"internalType":"address[]","name":"path","type":"address[]"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"swapExactETHForTokensSupportingFeeOnTransferTokens","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint256","name":"amountOutMin","type":"uint256"},{"internalType":"address[]","name":"path","type":"address[]"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"swapExactTokensForETH","outputs":[{"internalType":"uint256[]","name":"amounts","type":"uint256[]"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint256","name":"amountOutMin","type":"uint256"},{"internalType":"address[]","name":"path","type":"address[]"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"swapExactTokensForETHSupportingFeeOnTransferTokens","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint256","name":"amountOutMin","type":"uint256"},{"internalType":"address[]","name":"path","type":"address[]"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"swapExactTokensForTokens","outputs":[{"internalType":"uint256[]","name":"amounts","type":"uint256[]"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint256","name":"amountOutMin","type":"uint256"},{"internalType":"address[]","name":"path","type":"address[]"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"swapExactTokensForTokensSupportingFeeOnTransferTokens","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"},{"internalType":"uint256","name":"amountInMax","type":"uint256"},{"internalType":"address[]","name":"path","type":"address[]"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"swapTokensForExactETH","outputs":[{"internalType":"uint256[]","name":"amounts","type":"uint256[]"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"},{"internalType":"uint256","name":"amountInMax","type":"uint256"},{"internalType":"address[]","name":"path","type":"address[]"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"swapTokensForExactTokens","outputs":[{"internalType":"uint256[]","name":"amounts","type":"uint256[]"}],"stateMutability":"nonpayable","type":"function"},{"stateMutability":"payable","type":"receive"}];
const FACTORY$1 = [{"inputs":[{"internalType":"address","name":"_feeToSetter","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token0","type":"address"},{"indexed":true,"internalType":"address","name":"token1","type":"address"},{"indexed":false,"internalType":"address","name":"pair","type":"address"},{"indexed":false,"internalType":"uint256","name":"","type":"uint256"}],"name":"PairCreated","type":"event"},{"constant":true,"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"allPairs","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"allPairsLength","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"tokenA","type":"address"},{"internalType":"address","name":"tokenB","type":"address"}],"name":"createPair","outputs":[{"internalType":"address","name":"pair","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"feeTo","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"feeToSetter","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"getPair","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"_feeTo","type":"address"}],"name":"setFeeTo","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"_feeToSetter","type":"address"}],"name":"setFeeToSetter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"}];
const PAIR = [{"inputs":[],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"spender","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"},{"indexed":true,"internalType":"address","name":"to","type":"address"}],"name":"Burn","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"}],"name":"Mint","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount0In","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1In","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount0Out","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1Out","type":"uint256"},{"indexed":true,"internalType":"address","name":"to","type":"address"}],"name":"Swap","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint112","name":"reserve0","type":"uint112"},{"indexed":false,"internalType":"uint112","name":"reserve1","type":"uint112"}],"name":"Sync","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Transfer","type":"event"},{"constant":true,"inputs":[],"name":"DOMAIN_SEPARATOR","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"MINIMUM_LIQUIDITY","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"PERMIT_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"to","type":"address"}],"name":"burn","outputs":[{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"factory","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"getReserves","outputs":[{"internalType":"uint112","name":"_reserve0","type":"uint112"},{"internalType":"uint112","name":"_reserve1","type":"uint112"},{"internalType":"uint32","name":"_blockTimestampLast","type":"uint32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"_token0","type":"address"},{"internalType":"address","name":"_token1","type":"address"}],"name":"initialize","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"kLast","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"to","type":"address"}],"name":"mint","outputs":[{"internalType":"uint256","name":"liquidity","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"nonces","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"permit","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"price0CumulativeLast","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"price1CumulativeLast","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"to","type":"address"}],"name":"skim","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"uint256","name":"amount0Out","type":"uint256"},{"internalType":"uint256","name":"amount1Out","type":"uint256"},{"internalType":"address","name":"to","type":"address"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"swap","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[],"name":"sync","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"token0","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"token1","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"}];

var UniswapV2 = {
  findPath: findPath$2,
  pathExists: pathExists$2,
  getAmounts: getAmounts$2,
  getTransaction: getTransaction$2,
  ROUTER: ROUTER$1,
  FACTORY: FACTORY$1,
  PAIR,
};

const blockchain$b = Blockchains.bsc;

const exchange$c = {
  blockchain: 'bsc',
  name: 'pancakeswap',
  alternativeNames: ['pancake'],
  label: 'PancakeSwap',
  logo:'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTk4IiBoZWlnaHQ9IjE5OSIgdmlld0JveD0iMCAwIDE5OCAxOTkiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNOTguNTUyIDE5OC42MDdDNjkuMDYxMyAxOTguNTg1IDQ1LjMwNiAxOTEuNTggMjguNzA3OSAxNzguOTk4QzExLjkxMDggMTY2LjI2NSAzIDE0OC4xOTUgMyAxMjcuNzQ4QzMgMTA4LjA0NyAxMS44OTEzIDkzLjg0MTEgMjEuOTUxNyA4NC4yMzg1QzI5LjgzNTkgNzYuNzEzMiAzOC41MzYzIDcxLjg5MzYgNDQuNTk0NSA2OS4xMjEzQzQzLjIyNDUgNjQuOTU5NCA0MS41MTUzIDU5LjUxMDggMzkuOTg2MSA1My44ODMyQzM3LjkzOTkgNDYuMzUyNyAzNS45MzI1IDM3LjUxNzQgMzUuOTMyNSAzMS4wNDI5QzM1LjkzMjUgMjMuMzc5NSAzNy42MjA0IDE1LjY4MzMgNDIuMTcxNCA5LjcwMzA2QzQ2Ljk3OTcgMy4zODQ3NiA1NC4yMTgyIDAgNjIuOTI2NCAwQzY5LjczMjIgMCA3NS41MTAzIDIuNDk5MDMgODAuMDMzOSA2LjgxMDExQzg0LjM1NzkgMTAuOTMwOSA4Ny4yMzU3IDE2LjQwMzQgODkuMjIyNyAyMi4xMDgyQzkyLjcxNDMgMzIuMTMyNSA5NC4wNzM4IDQ0LjcyNjQgOTQuNDU1MSA1Ny4yOTQ1SDEwMi43OTZDMTAzLjE3OCA0NC43MjY0IDEwNC41MzcgMzIuMTMyNSAxMDguMDI5IDIyLjEwODJDMTEwLjAxNiAxNi40MDM0IDExMi44OTQgMTAuOTMwOSAxMTcuMjE4IDYuODEwMTFDMTIxLjc0MSAyLjQ5OTAzIDEyNy41MTkgMCAxMzQuMzI1IDBDMTQzLjAzMyAwIDE1MC4yNzIgMy4zODQ3NiAxNTUuMDggOS43MDMwNkMxNTkuNjMxIDE1LjY4MzMgMTYxLjMxOSAyMy4zNzk1IDE2MS4zMTkgMzEuMDQyOUMxNjEuMzE5IDM3LjUxNzQgMTU5LjMxMiA0Ni4zNTI3IDE1Ny4yNjUgNTMuODgzMkMxNTUuNzM2IDU5LjUxMDggMTU0LjAyNyA2NC45NTk0IDE1Mi42NTcgNjkuMTIxM0MxNTguNzE1IDcxLjg5MzYgMTY3LjQxNiA3Ni43MTMyIDE3NS4zIDg0LjIzODVDMTg1LjM2IDkzLjg0MTEgMTk0LjI1MiAxMDguMDQ3IDE5NC4yNTIgMTI3Ljc0OEMxOTQuMjUyIDE0OC4xOTUgMTg1LjM0MSAxNjYuMjY1IDE2OC41NDQgMTc4Ljk5OEMxNTEuOTQ1IDE5MS41OCAxMjguMTkgMTk4LjU4NSA5OC42OTk2IDE5OC42MDdIOTguNTUyWiIgZmlsbD0iIzYzMzAwMSIvPgo8cGF0aCBkPSJNNjIuOTI2MiA3LjI4ODMzQzUwLjE3MTYgNy4yODgzMyA0NC4zMDA0IDE2LjgwMzcgNDQuMzAwNCAyOS45NjMyQzQ0LjMwMDQgNDAuNDIzMSA1MS4xMjIyIDYxLjM3MTUgNTMuOTIxMiA2OS41MjYzQzU0LjU1MDggNzEuMzYwNSA1My41NjE2IDczLjM3MDEgNTEuNzU3NCA3NC4wODE0QzQxLjUzNTEgNzguMTEyMSAxMS4zNjc5IDkyLjg3IDExLjM2NzkgMTI2LjY2OUMxMS4zNjc5IDE2Mi4yNzIgNDIuMDI0NiAxODkuMTE3IDk4LjU1ODEgMTg5LjE2Qzk4LjU4MDYgMTg5LjE2IDk4LjYwMzEgMTg5LjE1OSA5OC42MjU2IDE4OS4xNTlDOTguNjQ4MSAxODkuMTU5IDk4LjY3MDYgMTg5LjE2IDk4LjY5MzEgMTg5LjE2QzE1NS4yMjcgMTg5LjExNyAxODUuODgzIDE2Mi4yNzIgMTg1Ljg4MyAxMjYuNjY5QzE4NS44ODMgOTIuODcgMTU1LjcxNiA3OC4xMTIxIDE0NS40OTQgNzQuMDgxNEMxNDMuNjkgNzMuMzcwMSAxNDIuNyA3MS4zNjA1IDE0My4zMyA2OS41MjYzQzE0Ni4xMjkgNjEuMzcxNSAxNTIuOTUxIDQwLjQyMzEgMTUyLjk1MSAyOS45NjMyQzE1Mi45NTEgMTYuODAzNyAxNDcuMDggNy4yODgzMyAxMzQuMzI1IDcuMjg4MzNDMTE1Ljk2NSA3LjI4ODMzIDExMS4zODkgMzMuMjk1NSAxMTEuMDYyIDYxLjIwNzVDMTExLjA0IDYzLjA3MDkgMTA5LjUzNCA2NC41ODI4IDEwNy42NyA2NC41ODI4SDg5LjU4MDdDODcuNzE3MiA2NC41ODI4IDg2LjIxMDggNjMuMDcwOSA4Ni4xODkgNjEuMjA3NUM4NS44NjI2IDMzLjI5NTUgODEuMjg2IDcuMjg4MzMgNjIuOTI2MiA3LjI4ODMzWiIgZmlsbD0iI0QxODg0RiIvPgo8cGF0aCBkPSJNOTguNjkzMSAxNzcuNzU1QzU3LjE1NTEgMTc3Ljc1NSAxMS40Mzk3IDE1NS41MiAxMS4zNjgxIDEyNi43MzdDMTEuMzY4IDEyNi43ODEgMTEuMzY3OSAxMjYuODI2IDExLjM2NzkgMTI2Ljg3MUMxMS4zNjc5IDE2Mi41MDMgNDIuMDczNCAxODkuMzYyIDk4LjY5MzEgMTg5LjM2MkMxNTUuMzEzIDE4OS4zNjIgMTg2LjAxOCAxNjIuNTAzIDE4Ni4wMTggMTI2Ljg3MUMxODYuMDE4IDEyNi44MjYgMTg2LjAxOCAxMjYuNzgxIDE4Ni4wMTggMTI2LjczN0MxODUuOTQ2IDE1NS41MiAxNDAuMjMxIDE3Ny43NTUgOTguNjkzMSAxNzcuNzU1WiIgZmlsbD0iI0ZFREM5MCIvPgo8cGF0aCBkPSJNNzUuNjEzNSAxMTcuODk2Qzc1LjYxMzUgMTI3LjYxNCA3MS4wMjEgMTMyLjY3NSA2NS4zNTU4IDEzMi42NzVDNTkuNjkwNyAxMzIuNjc1IDU1LjA5ODEgMTI3LjYxNCA1NS4wOTgxIDExNy44OTZDNTUuMDk4MSAxMDguMTc4IDU5LjY5MDcgMTAzLjExNyA2NS4zNTU4IDEwMy4xMTdDNzEuMDIxIDEwMy4xMTcgNzUuNjEzNSAxMDguMTc4IDc1LjYxMzUgMTE3Ljg5NloiIGZpbGw9IiM2MzMwMDEiLz4KPHBhdGggZD0iTTE0Mi4yODggMTE3Ljg5NkMxNDIuMjg4IDEyNy42MTQgMTM3LjY5NiAxMzIuNjc1IDEzMi4wMzEgMTMyLjY3NUMxMjYuMzY1IDEzMi42NzUgMTIxLjc3MyAxMjcuNjE0IDEyMS43NzMgMTE3Ljg5NkMxMjEuNzczIDEwOC4xNzggMTI2LjM2NSAxMDMuMTE3IDEzMi4wMzEgMTAzLjExN0MxMzcuNjk2IDEwMy4xMTcgMTQyLjI4OCAxMDguMTc4IDE0Mi4yODggMTE3Ljg5NloiIGZpbGw9IiM2MzMwMDEiLz4KPC9zdmc+Cg==',
  router: {
    address: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    api: UniswapV2.ROUTER
  },
  factory: {
    address: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    api: UniswapV2.FACTORY
  },
  pair: {
    api: UniswapV2.PAIR
  },
  slippage: true,
};

var pancakeswap = new Exchange(

  Object.assign(exchange$c, {
    findPath: ({ tokenIn, tokenOut })=>
      UniswapV2.findPath(blockchain$b, exchange$c, { tokenIn, tokenOut }),
    pathExists: (path)=>
      UniswapV2.pathExists(blockchain$b, exchange$c, path),
    getAmounts: ({ path, block, tokenIn, tokenOut, amountOut, amountIn, amountInMax, amountOutMin })=>
      UniswapV2.getAmounts(blockchain$b, exchange$c, { path, block, tokenIn, tokenOut, amountOut, amountIn, amountInMax, amountOutMin }),
    getTransaction: ({ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress })=>
      UniswapV2.getTransaction(blockchain$b, exchange$c ,{ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress }),
  })
);

const blockchain$a = Blockchains.polygon;

const exchange$b = {
  blockchain: 'polygon',
  name: 'quickswap',
  alternativeNames: [],
  label: 'QuickSwap',
  logo: 'data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgZGF0YS1uYW1lPSJMYXllciAxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgNzAyLjQ1IDcwMi40NyI+PGRlZnM+PGNsaXBQYXRoIGlkPSJjbGlwLXBhdGgiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yMy43OCAtMjMuNzcpIj48cmVjdCB3aWR0aD0iNzUwIiBoZWlnaHQ9Ijc1MCIgZmlsbD0ibm9uZSIvPjwvY2xpcFBhdGg+PC9kZWZzPjxnIGNsaXAtcGF0aD0idXJsKCNjbGlwLXBhdGgpIj48cGF0aCBkPSJNMzU0Ljc0LDI0LjM3YTM1MS4yNywzNTEuMjcsMCwwLDEsMzYzLjc0LDI3NywzNTQsMzU0LDAsMCwxLDEuMjMsMTQxLjI2QTM1MS43NiwzNTEuNzYsMCwwLDEsNTEwLjEyLDY5OS4zYy03My43NywzMS0xNTguMjUsMzUuMzUtMjM0LjkxLDEyLjU0QTM1MiwzNTIsMCwwLDEsNDYuNTEsNDk5LjU2Yy0yOC03My40NS0zMC4xNi0xNTYuMzgtNi4yNC0yMzEuMjVBMzUwLjg4LDM1MC44OCwwLDAsMSwzNTQuNzQsMjQuMzciIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yMy43OCAtMjMuNzcpIiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTE1OC44MSwzNDkuNThjMS4zOSw2LjQxLDIuMjMsMTIuOTIsMy42MSwxOS4zNS44NSwzLjkzLDIuMTMsMyw0LjE1LDEuMjgsMy44Ny0zLjI1LDcuNTktNi42OSwxMS45NC05LjMxLDEuMjMuMjQsMS44NiwxLjIyLDIuNTMsMi4xLDExLjM5LDE0Ljg3LDI2LjUzLDI0LDQ0LjM3LDI4Ljk0YTE0Ny4yMywxNDcuMjMsMCwwLDAsMjUuMTcsNC42Nyw0Mi42OCw0Mi42OCwwLDAsMS02LjYxLTkuOTVjLTIuODUtNi40MS0xLjg1LTEyLjE1LDIuOTUtMTcuMjIsNS44Ny02LjE5LDEzLjYyLTguNzYsMjEuNDgtMTAuOCwxNi40OC00LjMsMzMuMjctNC43Myw1MC4xOC0zLjUzQTIwMi4xMSwyMDIuMTEsMCwwLDEsMzU4Ljc1LDM2MmMxMSwzLjA2LDIxLjcyLDYuNzMsMzEuNDQsMTIuODgsMS4zNiwxLjA5LDIuMywyLjYsMy42MSwzLjc0LDEyLjQ5LDEzLjQxLDE5Ljc4LDI5LjI1LDIwLjI4LDQ3LjU1LjM0LDEyLjY1LTMuMTYsMjQuNzItOS41LDM1LjgyLTExLjQyLDIwLTI4LjA5LDM0LjU2LTQ4LDQ1LjcxQTE3MC41LDE3MC41LDAsMCwxLDI5MSw1MjguNDJjLTQxLjI0LDQuNDctNzkuNDUtNC40Ny0xMTQuNTktMjYuMzYtMjkuMjEtMTguMTktNTEuNjUtNDMuMDgtNzAtNzEuOTJhMzM5LjU3LDMzOS41NywwLDAsMS0yMi41Mi00Mi43NWMtLjgxLTEuOC0xLTMuODEtMS44Mi01LjI5LjUyLDEuNzUsMS40OSwzLjczLS40Myw1LjYtLjU4LTcuNDUuMDgtMTQuOS40Ny0yMi4zMWEyODcuMTMsMjg3LjEzLDAsMCwxLDkuNDgtNjAuNTRBMjkyLjkxLDI5Mi45MSwwLDAsMSwyNjYuMDYsMTA5LjA5LDI4Ny4yLDI4Ny4yLDAsMCwxLDM0Ni41OSw4OS45YzQzLjU3LTQsODUuNzksMS43MywxMjcsMTYuMzQtNi4yNywxMS44OS00Miw0My43Mi02OS44LDYyLjE1YTk0LjExLDk0LjExLDAsMCwwLTUuNDQtMjMuNTFjLS4xNC0yLDEuNjYtMi42NSwyLjc4LTMuNjFxOC42Ny03LjQ2LDE3LjQzLTE0Ljc3YTE3LjE0LDE3LjE0LDAsMCwwLDEuNjktMS40OWMuNjYtLjcxLDEuNzctMS4zLDEuNTQtMi40cy0xLjU1LTEuMTUtMi40Ny0xLjNhNDYuODIsNDYuODIsMCwwLDAtOC4xNy0xYy0zLjgxLS40NS03LjU2LTEuMy0xMS40LTEuMzgtMi45NS0uMTgtNS44NS0uOTMtOC44My0uNjlhMjguMjIsMjguMjIsMCwwLDEtNC41LS4zMmMtMi41LS43OS01LjA3LS40NC03LjYxLS40My0xLjUyLDAtMy0uMTEtNC41NiwwLTQuMzUuMjUtOC43My0uNDgtMTMuMDcuMzRhMTIuODcsMTIuODcsMCwwLDEtMy4yMS4zMmMtMS4yNiwwLTIuNTEuMDYtMy43NywwYTEyLjM1LDEyLjM1LDAsMCwwLTQuODcuNDdjLTQuNTkuNDEtOS4xOS43OC0xMy43MywxLjYxLTUuNDgsMS4xNi0xMS4wOSwxLjQ0LTE2LjUzLDIuNzktNSwxLjMtMTAuMTMsMi0xNSwzLjc0LTYuNTEsMS43OS0xMi45NSwzLjg0LTE5LjM1LDYtOS4zNCwzLjcxLTE4LjgyLDcuMS0yNy43MSwxMS44NmEyNDguNzQsMjQ4Ljc0LDAsMCwwLTU1LjY2LDM2Ljk0QTI2Ni41NSwyNjYuNTUsMCwwLDAsMTU5LjY4LDIyN2EyNTQuODcsMjU0Ljg3LDAsMCwwLTE2LjU0LDI2LjE2Yy0zLjE3LDUuOS02LjIyLDExLjg1LTksMTgtMiw0LjcxLTQuNDIsOS4yNy02LDE0LjE4LTIsNC45LTMuNjQsOS45Mi01LjIyLDE1LTEuODgsNS4wNi0zLDEwLjM1LTQuNDUsMTUuNTMtLjYzLDItMSw0LjExLTEuNTMsNi4xOC0uNjMsMi40OS0xLDUtMS40Nyw3LjU1LS43Nyw0LjI1LTEuNDgsOC41LTIuMDksMTIuNzhhMTE4LjY0LDExOC42NCwwLDAsMC0xLjU3LDEzLjI5Yy0uNzQsMi45NC0uMiw2LS43NCw5LS44MiwzLjY5LS4yOCw3LjQ1LS41MiwxMS4xNi0uMTEsMi42MS0uMTYsNS4yMy0uMDksNy44NSwwLDEuMDctLjQ5LDIuNTcuNjQsMy4wOSwxLjI5LjYsMi4yMy0uNzcsMy4xNi0xLjUzLDMuMTgtMi42LDYuMjktNS4yOSw5LjQtOCwxMC40Ny05LDIxLjA3LTE3Ljg4LDMxLjU4LTI2Ljg1LjkxLS43NywxLjktMi43OSwzLjUyLS43MSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiM0MTg5YzkiLz48cGF0aCBkPSJNMzkwLjExLDM3NS43OGMtMTIuMzctNy4zNS0yNS44OS0xMS42My0zOS43Ny0xNC45MmExOTcuMjUsMTk3LjI1LDAsMCwwLTU1LjY4LTUuMWMtMTMuMjEuNjYtMjYuMzEsMi41LTM4LjQ4LDguM2EzMi42MSwzMi42MSwwLDAsMC00LjIxLDIuNDNjLTkuODUsNi42LTExLjM1LDE1LjQtNC4yMywyNC45MSwxLjQ4LDIsMy4xMiwzLjgxLDUuMSw2LjIyLTYuMzksMC0xMi4wNS0xLjE5LTE3LjY5LTIuMzEtMTUuMTItMy0yOS4zMi04LjI0LTQxLjUtMTgtNS44Ni00LjY4LTExLjIyLTkuOTMtMTUuMTQtMTYuNDUsMS42LTIuNjEsNC4yOC0zLjgzLDYuNzgtNS4yNyw0LjgyLTIsOS4xOS00LjkxLDE0LTcuMDlhMjA3LjU1LDIwNy41NSwwLDAsMSw2Ny40LTE4YzkuMzItLjg3LDE4LjY1LTEuNzYsMjgtMS40MUEzMTEuMzgsMzExLjM4LDAsMCwxLDM3NiwzNDMuMjVjNi44LDIuMTIsMTMuNTIsNC40NSwyMC41OSw2Ljg0LDAtMi0xLjE0LTMuMTktMS45LTQuNDhBOTYuMTgsOTYuMTgsMCwwLDAsMzg1LDMzMS44OGMtMS4zMy0xLjU2LTMuMTgtMi45My0zLjE0LTUuMzMsMy43My44NSw3LjQ2LDEuNjgsMTEuMTgsMi41NiwxLC4yMywyLjE3LjgzLDIuODEsMCwuODUtMS4wOC0uNDMtMi0xLTIuODQtNS40OS04LjE5LTEyLjMzLTE1LjE3LTE5LjY3LTIxLjY4LDMuODktMi4yNiw3Ljg5LS40MiwxMS42OC4wNiwzOC44Nyw1LDc0LjI5LDE4LjgxLDEwNS4xOCw0Myw0MC45LDMyLjA5LDY3LjMzLDczLjU0LDc4LjQ3LDEyNC41MUExODAuNTQsMTgwLjU0LDAsMCwxLDU3My44Nyw1MjRjLTIuMTksMzAuMTEtMTEuNjUsNTcuOS0yOS40NSw4Mi41OC0xLjE3LDEuNjItMi43NSwyLjkxLTMuNjEsNC43Ni00LDYtMTAsMTAuMDgtMTUuNDQsMTQuNTItMjkuNTUsMjQtNjQsMzYuNDYtMTAxLjE0LDQyLjI4YTMxMC4zNCwzMTAuMzQsMCwwLDEtODcuMzEsMS41NCwyODguMTcsMjg4LjE3LDAsMCwxLTEyNy4zOS00OC4xNGMtOS4yNy02LjI5LTE4LjM2LTEyLjg1LTI2LjUxLTIwLjYyYS42NS42NSwwLDAsMSwwLTFjMS43NC0uNjksMi44NC41Nyw0LDEuNDNhMTg5LjA4LDE4OS4wOCwwLDAsMCw2NSwzMS41NiwyMjguNDYsMjI4LjQ2LDAsMCwwLDIzLjg3LDQuNzVjMS44Mi42NiwzLjc1LjM1LDUuNjIuNjZhNy41NSw3LjU1LDAsMCwxLDEuMTMuMjNjMTguMjQsMi4xNiwzNi4zNy44OSw1NC4zNi0yLjI4LDM5LjU0LTcsNzQuNjYtMjMuNTUsMTA0Ljc1LTUwLjE1LDIwLjUtMTguMTIsMzYuNjgtMzkuNTMsNDUuMjQtNjUuOTVzNy4zNS01Mi4xLTQuNjctNzcuNDhjLTIuNDcsMTEuMzgtOC40NCwyMC44LTE1LjkxLDI5LjM4YTEwNi4wOSwxMDYuMDksMCwwLDEtMjYuMDcsMjEuMTljLTEuMTQuNjYtMi40LDEuOTEtMy43MS45LTEuMTMtLjg2LS40NS0yLjM3LS4xLTMuNTFhMTM5LjY0LDEzOS42NCwwLDAsMCw0Ljk0LTI0LjJjMy41LTM0LjUxLTkuODItNjEuMzctMzcuMy04MS43NGExMTkuOCwxMTkuOCwwLDAsMC0xNC4wNi05IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuNzggLTIzLjc3KSIgZmlsbD0iIzI2MmY3MSIvPjxwYXRoIGQ9Ik0yNzYuMDgsNjM4LjQxYTE1MS4xNiwxNTEuMTYsMCwwLDEtMjkuODYtNi4xQTE5OC41MywxOTguNTMsMCwwLDEsMTk0LjM1LDYwOGMtMy44My0yLjUxLTcuMDctNS44Ni0xMS4yNC03Ljg5LTIuMzktLjM0LTMuMzktMi42OC01LjMtMy43LTQwLjM4LTM1LjktNjgtODAtODMuODMtMTMxLjQ4QTI4MC41NCwyODAuNTQsMCwwLDEsODEuNjMsMzg3LjdjLjEtMiwuMi0zLjkzLjM2LTcsMiw0LjM2LDMuNDgsNy44Miw1LjA1LDExLjI2LDE0LjUzLDMxLjg2LDMzLjEzLDYwLjkzLDU4Ljc0LDg1LjEyQzE3Myw1MDIuODIsMjA0LjY4LDUyMCwyNDIsNTI2YzQzLjcxLDcuMTEsODQuNjEtLjUxLDEyMi4yMi0yNC4wNiwxOC43NS0xMS43NSwzNC4xNC0yNi45NCw0My00Ny42NSwxMC43Mi0yNS4xMSw2LjY4LTQ4LjQ0LTkuNjUtNjkuOTUtMS40My0xLjg4LTIuOTUtMy42OS00LjQzLTUuNTQsMS45NC0xLjY2LDMsLjI2LDQuMDcsMS4xOGE4My4yMiw4My4yMiwwLDAsMSwyMi42LDI5LjksODgsODgsMCwwLDEsNy44NSwzNS4xOSw3OS43NSw3OS43NSwwLDAsMS04LDM1Ljg3LDUuMzksNS4zOSwwLDAsMCwzLjI0LTEuMTcsOTguMzQsOTguMzQsMCwwLDAsMTQuNjUtMTAuMzVjMS40Mi0xLjIzLDIuNjctMy4wOCw1LTIuOGExNjUuMywxNjUuMywwLDAsMS02LjA5LDI3Ljc1LDEzMS43NCwxMzEuNzQsMCwwLDAsMTcuMjctMTEuNDhjNC4zMy0zLjM4LDcuODMtNy42MiwxMi4wOC0xMS4wNiwxLjgxLjc3LDEuODEsMi41NiwyLjIzLDQuMDgsNi45MiwyNSwxLjkxLDQ4LjI4LTEwLjQyLDcwLjMtMTUsMjYuNy0zNyw0Ni41Ny02Mi42Miw2Mi42NWEyMTMuMzMsMjEzLjMzLDAsMCwxLTY3LjI3LDI3LjU1LDE0Mi4yLDE0Mi4yLDAsMCwxLTQ1LjY3LDIuNjloMGMtMS45LTEtNC4wNy4xOS02LS43MiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiMxNjFmNDIiLz48cGF0aCBkPSJNNjU0LjE3LDQ1My4wN2EyMTIsMjEyLDAsMCwwLTIwLjc3LTgyLjM1QTIxOC45LDIxOC45LDAsMCwwLDYwMywzMjRjLTEwLjktMTIuOTEtMjMuNDItMjMuOTMtMzYuNTYtMzQuMzgsMS4yMy0xLjIxLDIuNzYtMSw0LjI0LS44YTIzNi4yOCwyMzYuMjgsMCwwLDEsNTMuNzksMTIuNzhBODAuMiw4MC4yLDAsMCwxLDYzNywzMDcuNDNhNDAuMzgsNDAuMzgsMCwwLDEsNC4xNiwyLjQ0Yy4zNC4xOS41My42OSwxLC41OGExLjI3LDEuMjcsMCwwLDEtLjIxLTEuMzdjLTExLjg0LTE1LjQyLTI2LjE1LTI4LjI4LTQxLjE3LTQwLjVhMzAyLDMwMiwwLDAsMC01OC4xOC0zNi45LDI4Ny42NCwyODcuNjQsMCwwLDAtOTEuNTctMjcuNDVjLTIuODMtLjM1LTUuNzUsMC04LjUxLTEtLjI0LTEuODksMS4zNS0yLjUyLDIuNDUtMy40NCwxOC42Ny0xNS41NSwzMy42OS0zNCw0NC4yOC01NS45NGExNTcuMSwxNTcuMSwwLDAsMCw4LjE0LTIwLjUzYy42NC0yLDEtNC4xNywzLTUuNDRhMjg4LjE2LDI4OC4xNiwwLDAsMSw4OC40Nyw2NiwyOTIuMSwyOTIuMSwwLDAsMSw2Ni42NCwyNzBjLS44NC40Ni0xLS4yNi0xLjM0LS43NSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiM0MTg5YzkiLz48cGF0aCBkPSJNNTQwLjgxLDYxMS4zN2MwLTIuOTQsMi4zNC00LjYsMy43OS02LjY2LDEzLjY2LTE5LjUxLDIyLTQxLjEyLDI2LjMxLTY0LjQ4LDIuNjctMTQuNDcsMi45LTI5LjA4LDItNDMuNTctMS40Ny0yMi4zNC03LjE4LTQzLjgzLTE2LjE5LTY0LjQyYTIxMi4yNSwyMTIuMjUsMCwwLDAtMjQuNzMtNDIuNTcsMjIxLjI0LDIyMS4yNCwwLDAsMC0zNi4xNi0zNy42MkEyMDcuNTYsMjA3LjU2LDAsMCwwLDQyNS4xOSwzMTRhMTk4LjEsMTk4LjEsMCwwLDAtNDIuMjUtOC42OWMtMi41OS0uMjMtNS4xNS0uODUtNy43OC0uNjktOS4xMy02LjczLTE4LjM5LTEzLjI0LTI4Ljc5LTE3Ljk0LDAtLjMzLDAtLjY3LjA3LTEsMy43NCwwLDcuNDkuMDYsMTEuMjMsMCw1Mi40My0uOTQsMTAwLjc1LDExLjkxLDE0Myw0My44NEM1NDQuNCwzNjIuNTksNTcxLjc0LDQwNi4zMiw1ODIsNDYwLjNjOC43Myw0Ni4wNSwyLDg5LjU0LTIzLjU2LDEyOS40NC01LDcuODUtMTAuNTMsMTUuNDEtMTcuNjEsMjEuNjMiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yMy43OCAtMjMuNzcpIiBmaWxsPSIjMTYxZjQyIi8+PHBhdGggZD0iTTUwMC40LDExNy45MWMtNS4yNSwxNi4wNS0xMS44NCwzMS40Ny0yMS4yNyw0NS41OWExNzIuNzgsMTcyLjc4LDAsMCwxLTM0LjQyLDM3LjczYy0uNzYuNjMtMS40NSwxLjM1LTIuMTcsMi00LjU4LDIuMzMtOC4zNSw1Ljg1LTEyLjU5LDguNjhhMjY3LjY4LDI2Ny42OCwwLDAsMS00OS4zOSwyNS41Myw4LjA5LDguMDksMCwwLDEtMS4yOS4zMmMtLjc2LTEuMTIuMTQtMS41My42LTIsOS44Mi05LjM1LDE1LjkxLTIwLjkyLDIwLTMzLjY2YTUsNSwwLDAsMSwzLjE3LTMuNjVjMzAuNTEtMTIuMDgsNTQuODYtMzIuMTUsNzQuOC01Ny45LDEuODEtMi4zNCwzLjU4LTQuNzEsNS44Mi03LjY2LTYuMTctLjEyLTEwLjksMy0xNi4xMiwzLjgyLTEsLjA2LTIuMjcuODgtMi41LTFhMjE1LjI3LDIxNS4yNywwLDAsMCw0MS44NC03NS42NWMuNTUtMS43OCwwLTQuMjMsMi40OC01LjEzYS40NC40NCwwLDAsMSwuMjUuNDVjMCwuMTgtLjA4LjI2LS4xMy4yNmEyMzAuNDksMjMwLjQ5LDAsMCwxLTguMzUsNTguNTYsMzYuODgsMzYuODgsMCwwLDAtLjY5LDMuNjMiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yMy43OCAtMjMuNzcpIiBmaWxsPSIjMTYxZjQyIi8+PHBhdGggZD0iTTM4MS44MiwzMjYuNTRhMTIwLDEyMCwwLDAsMSwxNi4wNiwyMi40Yy40My43OSwxLjU0LDEuNjguNTUsMi42MS0uNzUuNy0xLjYyLS4xNi0yLjQxLS40NmEzNDksMzQ5LDAsMCwwLTYyLjU2LTE3Yy0xMC43NS0xLjg1LTIxLjY2LTIuNjYtMzIuNTgtMy40NWExOTQuMDksMTk0LjA5LDAsMCwwLTI5LjQ1LjQyYy0yMi40MiwxLjgtNDQuMjQsNi41OS02NSwxNS41Ni02LjQsMi43Ny0xMi45NCw1LjI1LTE4Ljg5LDktLjY4LjQzLTEuNDksMS4xMy0yLjI3LjA2YTE5OS41OSwxOTkuNTksMCwwLDEsNTkuMi0yOC40MWMyOS4xNS04LjcsNTguOTMtMTAuODQsODkuMTUtOC40NmEzMjguNDIsMzI4LjQyLDAsMCwxLDQ1Ljc0LDYuOTUsMjEuOTIsMjEuOTIsMCwwLDEsMi40NC44MyIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiMxNjFmNDIiLz48cGF0aCBkPSJNMzc0LjMyLDExNi4zOGg0LjVjMi40MiwxLDUuMDctLjI4LDcuNS43NGg0LjQ5Yy4zOCwyLjE3LTEuNDEsMy4wOC0yLjY1LDQuMTMtMjAuNzgsMTcuNTYtNDEuNDEsMzUuMjktNjIuMiw1Mi44My02Ljg3LDUuNzktMTMuNjgsMTEuNjUtMjAuNTQsMTcuNDVhNi4xNCw2LjE0LDAsMCwwLTIuMzUsMi44M2MtOSwzLjM3LTE3LjM2LDcuNi0yNCwxNC45NC0zLjEzLDMuNDgtNS4xOCw3LjUtNy40NCwxMS40Ni02LjE3LDQtMTEuMzYsOS4yNi0xNywxNC0xNC43NywxMi40Mi0yOS4zNSwyNS4wNi00NC4xNiwzNy40My0xLjI1LDEtMi4wNywyLjUtMy41MiwzLjMxLTIuNTUtMy44LTItOC0xLjM5LTEyLjEyLDEuODYtMy4wNiw0LjgtNSw3LjQ0LTcuMjhxMjEuNTQtMTguMjcsNDMtMzYuNTljMTQtMTEuODUsMjcuOTItMjMuNzcsNDEuOS0zNS42M3EyNC4xMi0yMC40NSw0OC4xNy00MWM4LjkzLTcuNiwxNy44LTE1LjI2LDI2Ljg2LTIyLjcxLDEuMzctMS4xMywyLjMzLTIsMS4yOC0zLjgxIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuNzggLTIzLjc3KSIgZmlsbD0iIzVjOTRjZSIvPjxwYXRoIGQ9Ik02MzcuNTEsMzA4LjQxYy0xNy42My04LjU2LTM2LjI3LTEzLjc4LTU1LjU0LTE2LjktNS4xNS0uODQtMTAuMy0xLjg3LTE1LjU1LTEuOTEtNi43Mi00LjI1LTEzLjMxLTguNzMtMjAuMTktMTIuN2EyMDkuNzMsMjA5LjczLDAsMCwwLTcyLjE4LTI1Ljc1LDkuMDksOS4wOSwwLDAsMS0xLjY1LS42NGM3LjY1LTEuNCwzMy42OSwyLjUxLDUxLjcyLDcuNDdhMjQzLjA3LDI0My4wNywwLDAsMSw0OC40NywxOWMtMS42Mi00Ljg1LTQuNTgtOC4xMy02LjM5LTEyLS4xOC0xLTEuNjMtMS45NC0uNjYtM3MyLjA3LjA4LDMsLjQ5YzIuNiwxLjE4LDUuMDgsMi42MSw3LjY5LDMuNzdhMzQ3LjUyLDM0Ny41MiwwLDAsMSw2MS40LDQwLjQ5YzEuMDYsMS40LDEuMDYsMS40LS4xMSwxLjY5IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuNzggLTIzLjc3KSIgZmlsbD0iIzE2MWY0MiIvPjxwYXRoIGQ9Ik0zNzQuMzIsMTE2LjM4Yy40NiwxLjEsMS45Mi4zLDIuNjEsMS41My00LjE4LDMuNjItOC4zNiw3LjMtMTIuNjEsMTAuOTFxLTExLjUxLDkuNzgtMjMuMDcsMTkuNDhRMzI0Ljg3LDE2Mi4xMywzMDguNSwxNzZjLTcuNTgsNi40NC0xNS4wNSwxMy0yMi42MywxOS40Ni05LjE4LDcuOC0xOC40NSwxNS41MS0yNy42NSwyMy4zLTcuMyw2LjE5LTE0LjUzLDEyLjQ3LTIxLjgyLDE4LjY4LTcuNjcsNi41Mi0xNS4zNywxMy0yMy4wNiwxOS40OWwtNy43MSw2LjQ3LDIuMTktOS43NmMtMS4yNC0zLjE5LDEuMzUtNC42MywzLjEzLTYuMSw3LTUuODQsMTMuODgtMTEuODEsMjAuODMtMTcuNzFxMjQuMjUtMjAuNTgsNDguNDktNDEuMjIsMjAuODQtMTcuNyw0MS42Ni0zNS4zOWMxMi45Mi0xMSwyNS45My0yMS45MSwzOC43Mi0zMy4wNywxLS44NiwyLjg1LTEuODcuMTUtMyw0LjQzLTEuNjEsOS0uMzMsMTMuNTItLjczIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuNzggLTIzLjc3KSIgZmlsbD0iIzY0OTdkMCIvPjxwYXRoIGQ9Ik0zNjAuOCwxMTcuMTFjMS4wNS4xOSwyLjItLjM3LDMuMy40OS0yLjY1LDMuOS02LjU1LDYuNDUtMTAsOS40NC05LjgyLDguNTYtMTkuNzksMTctMjkuNzQsMjUuMzctOS4xLDcuNjgtMTguMjksMTUuMjYtMjcuMzcsMjNzLTE4LjIzLDE1Ljc0LTI3LjQsMjMuNTQtMTguMjksMTUuMjctMjcuMzYsMjNTMjI0LDIzNy41OCwyMTQuODcsMjQ1LjQ1Yy0yLjc0LDIuMzctNi4zNyw0LTcuMDUsOC4xNS00Ljg0LjU1LTcuNCw0LjY0LTEwLjk0LDcuMTYtNS41OSw0LTkuODQsOS40Ny0xNSwxMy45NS01LjE5LDMuNjktOS43Nyw4LjEtMTQuNjEsMTIuMi0xNC4zOCwxMi4xOS0yOC43LDI0LjQ2LTQzLjEzLDM2LjU5LTIsMS42OC0zLjc3LDMuNjYtNiw1LjA2LTEsLjYyLTEuOTEsMS43OS0zLjMyLjgxYTE2LjksMTYuOSwwLDAsMSwxLjUxLTcuNTFjNy4xOS00LjU5LDEzLjE3LTEwLjY3LDE5LjY2LTE2LjEsMTcuODgtMTUsMzUuNjEtMzAuMTYsNTMuMzgtNDUuMjlzMzUuMy0zMC4xMyw1My00NS4xNXEyNi0yMiw1MS45NC00NC4wOGMxNy42OC0xNSwzNS40NC0zMCw1My00NS4xNSwzLjQ5LTMsNy4xNi01LjgzLDEwLjU2LTloMyIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiM2ODlhZDEiLz48cGF0aCBkPSJNMzk5LjgxLDExNy44N2M0LjA3LS4wNSw4LDEsMTIsMS41LDEuMDksMi4zOS0xLDMuMzItMi4yMyw0LjQzLTUsNC4zNy0xMC4yMyw4LjQ4LTE1LjEsMTMtLjUyLS42OS0xLjA4LTEuMzYtMS41Ni0yLjA5LTEuMTEtMS42NS0xLjg5LTEuMjEtMi42MS4zMy01LjksMTIuNjYtMTYuMDUsMjEuNDYtMjcuMSwyOS4zYTIwMi4xNCwyMDIuMTQsMCwwLDEtMzkuODcsMjEuNzljLS43Ni0xLjQ0LS44My0xLjUuNDctMi44NCwyLjY5LTIuNzgsNS43Ny01LjE0LDguNzItNy42NCwyMS4yOS0xOC4xLDQyLjY0LTM2LjEyLDYzLjgxLTU0LjM3LDEuMjMtMS4wNywyLjI5LTIuMywzLjQ3LTMuNDEiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yMy43OCAtMjMuNzcpIiBmaWxsPSIjNGU4ZmNjIi8+PHBhdGggZD0iTTM5OS44MSwxMTcuODdhNC41NSw0LjU1LDAsMCwxLTEuNzUsMy4xNHEtMjAuNiwxNy40My00MS4xMywzNC45My0xNS43MiwxMy40LTMxLjM2LDI2Ljg5Yy0uOTQuODItMi43MSwxLjQtMi4yMywzLjNhMTg3LjQsMTg3LjQsMCwwLDEtMjAuMjcsOC4yNGMtMi4zMy0uNjQtLjQtMS40NywwLTEuODUsNC4wOS0zLjYyLDguMjMtNy4xOCwxMi4zOS0xMC43MnExMS40Ny05Ljc1LDIzLTE5LjQ3YzcuNTctNi40LDE1LjE4LTEyLjc3LDIyLjczLTE5LjE5czE1LjEyLTEyLjg3LDIyLjU3LTE5LjQyYzIuNDEtMi4xMiw1LjM2LTMuNjgsNy02LjU5LDMuMDYtLjQ0LDYsLjYsOSwuNzQiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yMy43OCAtMjMuNzcpIiBmaWxsPSIjNTU5MWNkIi8+PHBhdGggZD0iTTM0Ni42MSwyMDhjNy45Mi0zLjkyLDE2LjE5LTcuMjEsMjMuMS0xMi45MywxLjQ0LS4wNiwxLjI4Ljc2Ljk0LDEuNjktNi4zOCwyNi40Mi0yNi40Miw0My43Ny01My41Miw0Ni4zLTUuMjIuNDktMTAuNDMsMS4wOS0xNS42OS41OS42OC0xLjkzLDIuNTEtMS43Niw0LTIuMTcsNS44OC0xLjYsMTEuNzEtMy4zMSwxNy4xNi02LjEzLDEwLjIyLTUuMjgsMTcuNzEtMTMuMDcsMjItMjMuODRhOC4yMiw4LjIyLDAsMCwxLDIuMDUtMy41MSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiMxNjFmNDIiLz48cGF0aCBkPSJNMzQ2LjYxLDIwOGMtMy4yNiwxMi42LTExLjI5LDIxLjMxLTIyLjM5LDI3LjU1LTcuMTMsNC0xNSw1Ljg2LTIyLjc3LDguMS0xLjkxLTUuNTkuMTYtMTAuMzIsMy41Mi0xNC41NywzLjk0LTUsOS4zLTguMDgsMTUtMTAuNjlBMjc3LjA4LDI3Ny4wOCwwLDAsMSwzNDYuNjEsMjA4IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuNzggLTIzLjc3KSIgZmlsbD0iIzQxOGFjOSIvPjxwYXRoIGQ9Ik0xMTQuOCwzMjkuMzdjNC40NS0xLjY1LDcuMzEtNS40MSwxMC44MS04LjI4LDExLjI5LTkuMjcsMjIuMzgtMTguNzgsMzMuNTEtMjguMjQsNS44NS01LDExLjYxLTEwLjA1LDE3LjQxLTE1LjA4LDEuNTgtMS4zNywzLjA1LTIuOTQsNS4zNC0zLjA2LTYsNy41Mi0xMS43MywxNS4yNC0xNiwyMy45M3EtMTcuMjUsMTQuNi0zNC40NCwyOS4yN2MtNS4zLDQuNTMtMTAuNzEsOC45NC0xNS45MywxMy41Ny0uOC43MS0xLjcsMS42LTIuOTQuNjRhNTQuMTMsNTQuMTMsMCwwLDEsMi4yNC0xMi43NSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiM2NDk3ZDAiLz48cGF0aCBkPSJNMTU4LjgxLDM0OS41OGMtMy41NC4yNy01LjE0LDMuNDQtNy40OCw1LjMzLTkuODUsNy45NS0xOS40NSwxNi4yMi0yOSwyNC40OS0zLjIsMi43Ni02LjMsNS42Mi05LjY5LDguMTYtMi4yMywxLjY4LTMuMDcsMS0zLTEuNTgsMC0zLjEyLDAtNi4yNCwwLTkuMzYsMy40Ni0zLjc1LDcuNjEtNi43MiwxMS40OC0xMCwxMS4xNy05LjQ4LDIyLjIzLTE5LjEsMzMuNTUtMjguNDIsMS0uOCwxLjc5LTIuMjYsMy40Ni0xLjMxbC43NSwxMi42OSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiM0NjhjY2EiLz48cGF0aCBkPSJNMjA3LDI3NS40OGE0LjE3LDQuMTcsMCwwLDEsMS45MS0zLjA4YzktNy42LDE4LTE1LjE1LDI3LTIyLjc2LDcuMzktNi4yNSwxNC43Mi0xMi41NiwyMi4wNy0xOC44NywzLjg2LTMuMzEsNy42OS02LjY2LDExLjUyLTEwLC43My0uNjQsMS40MS0xLjEyLDIuMTIsMC0uODMsMy40MS0xLjgyLDYuNzktMS43MiwxMC4zNS00LDQuNDMtOC44OSw3LjkzLTEzLjQyLDExLjgtMTQsMTItMjcuOTUsMjMuOTMtNDIsMzUuNzZhMTEuMzQsMTEuMzQsMCwwLDAtMS40OCwxLjY4LDcuOTMsNy45MywwLDAsMS02LTQuODgiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yMy43OCAtMjMuNzcpIiBmaWxsPSIjNTU5MWNkIi8+PHBhdGggZD0iTTExMi41NiwzNDIuMTJjMy4yNC0xLDUuMTMtMy44MSw3LjU2LTUuODIsMTMuMTctMTAuODksMjYuMTMtMjIsMzkuMTctMzMuMDgsMi4wNS0xLjczLDMuNDktNC4zMyw2LjU4LTQuNThhMTUwLjg5LDE1MC44OSwwLDAsMC02LDE4Yy0yLjM0LS4yMy0zLjUzLDEuNjQtNSwyLjg4LTEzLjU4LDExLjY3LTI3LjI4LDIzLjItNDAuOTIsMzQuOC0uODIuNjktMS41NSwxLjcxLTIuODksMS4yNmE0NC44OCw0NC44OCwwLDAsMSwxLjUtMTMuNSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiM1Yzk0Y2UiLz48cGF0aCBkPSJNMjEzLDI4MC4zNmMtLjkzLTEuNjguNjUtMi4yMywxLjQ3LTIuOTNxMTcuMi0xNC43MSwzNC40OS0yOS4zNCw5Ljc3LTguMjgsMTkuNTktMTYuNDlhNC4xNiw0LjE2LDAsMCwxLDEuMzgtLjQ3LDI5LjkyLDI5LjkyLDAsMCwwLDEuMzgsOWMtMy45Myw0LjU2LTguODcsOC0xMy4zOSwxMS44NnEtMTUuMTMsMTMtMzAuNDUsMjUuOTNhMy41LDMuNSwwLDAsMC0xLjU0LDJjLTQuMjYsMS41OC04LjU2LDIuMjEtMTIuOTMuNDEiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yMy43OCAtMjMuNzcpIiBmaWxsPSIjNGU4ZmNjIi8+PHBhdGggZD0iTTE1OC4wNiwzMzYuODljLTQuMjEsMi40MS03LjU3LDUuOTEtMTEuMjcsOS05Ljc2LDgtMTkuMzcsMTYuMjUtMjguOTQsMjQuNS0yLjY0LDIuMjgtNSw0LjgyLTguMjgsNi4yNy4zOS00LS44NC04LjA4Ljc0LTEycTIyLjE3LTE4Ljk0LDQ0LjQ2LTM3Ljc2YzEtLjg2LDIuMDYtMS45MSwzLjY0LTEuMjMtLjEyLDMuNzUtLjIzLDcuNS0uMzUsMTEuMjYiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yMy43OCAtMjMuNzcpIiBmaWxsPSIjNGU4ZmNjIi8+PHBhdGggZD0iTTE1OC40MSwzMjUuNjNjLTQuNzUsMi41NS04LjQyLDYuNS0xMi41Miw5Ljg4LTkuNjgsNy45NS0xOS4xNCwxNi4xNi0yOC43MywyNC4yMi0yLjE0LDEuODEtMy42NCw0LjU2LTYuODUsNC44OS4zOC0zLS44LTYuMTEuNzUtOXExNC0xMiwyOC4wNi0yMy45MmM2LjM0LTUuMzksMTIuNzQtMTAuNzEsMTkuMDctMTYuMSwyLTEuNzIsMS40Ny4xNywxLjY1LDEuMDhaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuNzggLTIzLjc3KSIgZmlsbD0iIzU1OTFjZCIvPjxwYXRoIGQ9Ik0yMjYsMjgwYy0xLjM4LTEtLjQxLTEuNzQuMzItMi4zNSw4LjgyLTcuNCwxNy42OC0xNC43NSwyNi40OS0yMi4xNiw1LjUtNC42MywxMC45My05LjM0LDE2LjM3LTE0YTMuNjYsMy42NiwwLDAsMSwyLjItMS4yOGwyLjI1LDQuNDljLTEuNzMsMi42Ny00LjUsNC4zMy02LjQ1LDYuNzktMTAuODMsMTItMjIuOTUsMjIuMTQtMzguMjksMjcuOTFBMTkuNTMsMTkuNTMsMCwwLDEsMjI2LDI4MCIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiM0ODhkY2EiLz48cGF0aCBkPSJNMzk0LjQ4LDEzNi44YzEuMzYtNC4yNSw1Ljc3LTUuNDcsOC4zOC04LjQ3LDIuNzgtMy4xOSw3LjMzLTQuNjEsOC45NS05LDMuMjYsMCw2LjM4Ljg2LDkuNTUsMS40NSwyLjc0LjUxLDIuODYsMS43LDEsMy4zOS00LjA4LDMuNjQtOC4yLDcuMjYtMTIuMzQsMTAuODItMy44NiwzLjMyLTcuNzgsNi41Ny0xMS42OCw5Ljg1WiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiM0NjhjY2EiLz48cGF0aCBkPSJNMjA5LjM3LDMwNy44MWMuNjYsMS42Ni0xLjMzLDIuNDktMS4xLDQtMS00LjU2LTMuNTEtNi4zMy04LjA4LTUuNDJhMjMuNjUsMjMuNjUsMCwwLDAtMTIuNjQsNy4zNWMtLjk0LDEtMiwxLjg5LTMsMi44NC0uODItMSwwLTEuODcuMzMtMi43NiwyLTYuNTEsNi4zOS0xMS4xNCwxMS45My0xNC44M2ExMi41NywxMi41NywwLDAsMSw0LjA2LTEuODVjNi40Mi0xLjUzLDkuOTQsMS42MSw5LjA2LDguMTJhOC4yOCw4LjI4LDAsMCwxLS42MSwyLjUzIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuNzggLTIzLjc3KSIgZmlsbD0iIzQyOGFjOSIvPjxwYXRoIGQ9Ik0yMDkuMzcsMzA3LjgxYzAtMSwuMDYtMiwuMDctMywuMTEtNi41NC0zLjYtOS05LjY3LTYuMjUtNywzLjItMTEuNDIsOC45Mi0xNC40OSwxNS43OS0uNzEuMTMtMS4wOC0uMDctLjg2LS44NiwyLjIxLTguMTYsNi40Ny0xNC45MiwxMy41Ni0xOS43M2ExNC44MiwxNC44MiwwLDAsMSw1Ljg1LTIuMjgsNi4yNSw2LjI1LDAsMCwxLDcuNDEsNC42MSwxNC44OCwxNC44OCwwLDAsMS0xLjg3LDExLjciIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yMy43OCAtMjMuNzcpIiBmaWxsPSIjMTgyMTQ0Ii8+PHBhdGggZD0iTTI2Ny4xMywyNTEuNDFjLTEuMjYtMS0uMTUtMS40LjUyLTEuODcsMi4xMS0xLjQ3LDMuMjctNC4xLDUuOTMtNC45MiwzLjQsNS4zOCw4LjgzLDcuNzUsMTQuNDksOS43NywxLjE0LjQxLDIuMzMuNjcsNC4xOSwxLjE5LTguNzIsMi4yNy0xNi4yNCwxLjM5LTIzLjE1LTMuMzNhMywzLDAsMCwwLTItLjg0IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuNzggLTIzLjc3KSIgZmlsbD0iIzQ1OGNjYSIvPjxwYXRoIGQ9Ik01NzYuMjIsMjY2LjIzYy0yLjc1LS4zMi00Ljg0LTIuMi03LjM0LTMuMTMtMS0uMzYtMS44OS0xLjY0LTIuOTItLjgtLjg1LjcuNTQsMS43NC4yNCwyLjcxLTEuNTMtMS4zNC0yLjA2LTMuMjYtMi44Ni01LjIxLDQuNDYsMS44NSw4LjkxLDMuNjQsMTIuODgsNi40MyIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiM2MzY1N2QiLz48cGF0aCBkPSJNNjM3LjUxLDMwOC40MWMuODEtLjUxLDAtMS4xMy4xMS0xLjY5bDQuMzUsMi4zNiwyLjM0LDNjLTIuODUtLjc2LTQuNzgtMi4zMS02LjgtMy42NyIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiMyNjMxNTQiLz48cGF0aCBkPSJNNDY1LjE5LDI0OS4yNmExNC4yNiwxNC4yNiwwLDAsMSw2LC40NWMtMi4zMiwxLjI2LTMuOTIsMS4wOS02LS40NSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiNhMDlhYTkiLz48cGF0aCBkPSJNMTc3LjgxLDU5Ni4zNmMyLjMzLjQyLDMuMzksMi42Nyw1LjMsMy43TDE4Myw2MDFhMTQuMjIsMTQuMjIsMCwwLDEtNS4yMS00LjU5IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuNzggLTIzLjc3KSIgZmlsbD0iIzQyNGE3ZiIvPjxwYXRoIGQ9Ik02NTQuMTcsNDUzLjA3bDEuMzQuNzVjLjE5LDEuNTEtLjQ1LDIuNzUtMS4zNCw0LjZaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuNzggLTIzLjc3KSIgZmlsbD0iIzhjYjdkZSIvPjxwYXRoIGQ9Ik00NjUsMTM1Ljc5Yy41MSwxLjE1LDEuNjYuNjgsMi41LDFsLTQsMS41NWMtLjMxLTEuNTkuNzctMS45NSwxLjUxLTIuNTMiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yMy43OCAtMjMuNzcpIiBmaWxsPSIjNWE1ZDc2Ii8+PHBhdGggZD0iTTE4NC40MiwzMTMuNTFsLjg2Ljg2Yy0uMjMuNzQtLjQ1LDEuNDktLjY4LDIuMjNMMTgzLDMxOC42N2MuNDgtMi40Mi41MS0zLjksMS40My01LjE2IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuNzggLTIzLjc3KSIgZmlsbD0iIzRmNjY4YSIvPjxwYXRoIGQ9Ik0zNzAuNjUsMTk2LjczYy0uMjItLjYyLS4xMy0xLjQtLjk0LTEuNjkuMjQtLjU4Ljg5LTEuMzksMS4xOS0xLjEuOS44Ny41MiwxLjkxLS4yNSwyLjc5IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuNzggLTIzLjc3KSIgZmlsbD0iIzU1NWE3MyIvPjxwYXRoIGQ9Ik0xMTcuOCwzMTUuODZhNjEuNDQsNjEuNDQsMCwwLDEsNC41LTE1Ljc3YzguODItNi4xNSwxNi41OC0xMy42LDI0Ljc5LTIwLjVxMjEuMzUtMTgsNDIuNTMtMzYuMTQsMTkuMzUtMTYuNTUsMzguNzktMzMsMjEtMTcuOCw0Mi0zNS42NmMxMi43NC0xMC44MywyNS41Mi0yMS42MywzOC4yMS0zMi41Myw4LjktNy42NSwxOC0xNS4wNywyNi43NC0yMi44OGE1Myw1MywwLDAsMSwxNC4yNC0xLjUyLDEuNDQsMS40NCwwLDAsMSwxLjU0LS4xOGMxLjA2LDEuODEtLjI5LDIuODQtMS4zOSwzLjc2cS0xOC4xMywxNS4zNi0zNi4xOSwzMC44MVEyOTQuMjgsMTY4LjYzLDI3NSwxODVxLTE3Ljc5LDE1LjE4LTM1LjY0LDMwLjI5UTIxNy43LDIzMy42NywxOTYsMjUyLjFjLTE4LDE1LjI1LTM1Ljg4LDMwLjU5LTUzLjksNDUuNzktNyw1Ljg3LTEzLjgxLDExLjg4LTIwLjg3LDE3LjYzLS44OC43MS0yLjA3LDMtMy40Ny4zNCIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiM2ZDljZDIiLz48cGF0aCBkPSJNMzM1LjMxLDExOS4zOGMtMS4yNiw0LjIxLTUuMzMsNS43OS04LjIyLDguMzYtOS40Nyw4LjQyLTE5LjI2LDE2LjQ5LTI4Ljk0LDI0LjY3LTEwLjgzLDkuMTMtMjEuNzIsMTguMi0zMi41MSwyNy4zOC05LjM4LDgtMTguNjIsMTYuMTEtMjgsMjQuMS05LjA5LDcuNzQtMTguMjksMTUuMzQtMjcuMzgsMjMuMDZzLTE4LjExLDE1LjU1LTI3LjIxLDIzLjI4LTE4LjI1LDE1LjM3LTI3LjM1LDIzLjA5Yy03LjQ5LDYuMzYtMTQuOTIsMTIuNzktMjIuMzksMTkuMTYtMywyLjU4LTYuMTEsNS4xLTkuMTYsNy42NS0uNjYuNTUtMS4yNi44Mi0xLjg2LDBhNjAsNjAsMCwwLDEsNS4yNS0xNWM2LjktNC4zNSwxMi42Ny0xMC4xLDE4Ljg2LTE1LjMycTIxLjMzLTE4LDQyLjUxLTM2LjEzLDIxLjkyLTE4Ljc1LDQzLjkyLTM3LjM5LDE4LjEtMTUuNDIsMzYuMjUtMzAuNzljMTUuNzMtMTMuMywzMS4zMy0yNi43Niw0Ny4xMy00MGE2Ljk0LDYuOTQsMCwwLDAsMi41OC0zLjEzYzUuMzEtMi4wNiwxMS0xLjkzLDE2LjUxLTMiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yMy43OCAtMjMuNzcpIiBmaWxsPSIjNzI5ZmQ0Ii8+PHBhdGggZD0iTTMxOC44LDEyMi4zNmMyLjMzLjYxLjQzLDEuNDYsMCwxLjg1LTQuMjUsMy44Mi04LjU0LDcuNjEtMTIuODksMTEuMzEtNy41Nyw2LjQzLTE1LjIsMTIuNzktMjIuNzksMTkuMnEtMTYuNjcsMTQtMzMuMjksMjguMTNjLTkuMDksNy43My0xOC4wOCwxNS41Ni0yNy4xNiwyMy4yOS05LjM2LDgtMTguNzksMTUuODUtMjguMTYsMjMuODItOS4wOCw3LjczLTE4LjA5LDE1LjU0LTI3LjE3LDIzLjI3UzE0OS4xLDI2OC42MSwxNDAsMjc2LjI5Yy0zLjMzLDIuOC02LjY0LDUuNjItMTAsOC4zNy0uNjYuNTQtMS4zNywxLjc2LTIuNDQuNDQsMS01LjE2LDMuNzItOS42MSw2LTE0LjI0LDEyLjMzLTEwLjU0LDI0LjcyLTIxLDM3LjA2LTMxLjU2cTE5LjA4LTE2LjI5LDM4LjIxLTMyLjUyLDE4LjI1LTE1LjUzLDM2LjUzLTMxUTI2NC42LDE1OS4zOSwyODMuODYsMTQzYzYuNjUtNS42NCwxMy4wOS0xMS41NCwxOS45NS0xNyw0Ljc1LTIuMjEsOS45LTIuODMsMTUtMy43MSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiM3OGEyZDUiLz48cGF0aCBkPSJNMzAzLjgxLDEyNi4wN2MtNC43Niw2LjE5LTExLjIyLDEwLjU1LTE3LDE1LjYzLTcuNTcsNi42NC0xNS4zMiwxMy4wNS0yMywxOS41NS03LjQ5LDYuMzQtMTUsMTIuNjUtMjIuNDksMTlTMjI2LjM5LDE5MywyMTguOSwxOTkuNHMtMTUuMjEsMTIuOC0yMi43OSwxOS4yM2MtNy4zOSw2LjI4LTE0LjcxLDEyLjYzLTIyLjEsMTguOTFxLTE0LjA2LDEyLTI4LjE3LDIzLjg1Yy0zLjMyLDIuODEtNi42Niw1LjYtMTAsOC40YTMuNDMsMy40MywwLDAsMS0yLjMyLDEuMDcsOTkuOTMsOTkuOTMsMCwwLDEsOS0xOGMxNy4xMi0xMy45MSwzMy43Ny0yOC40LDUwLjU3LTQyLjcsMTkuNDUtMTYuNTcsMzktMzMsNTguMzQtNDkuNzMsMTAuOTQtOS40NSwyMi4zLTE4LjQxLDMyLjg1LTI4LjMyYTExMy40MywxMTMuNDMsMCwwLDEsMTkuNS02IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuNzggLTIzLjc3KSIgZmlsbD0iIzdkYTVkNiIvPjxwYXRoIGQ9Ik0yODQuMzEsMTMyLjExYy43NSwxLjM0LS42LDEuNzQtMS4xOCwyLjI2cS0xMi40OCwxMC45NC0yNS4wNiwyMS43M2MtNy4zNSw2LjMxLTE0Ljc3LDEyLjU0LTIyLjE2LDE4LjhxLTEzLjc4LDExLjY3LTI3LjU4LDIzLjM0Yy03LjQ3LDYuMzUtMTQuOSwxMi43Ni0yMi4zOCwxOS4xMS05LjM3LDgtMTguNzgsMTUuODctMjguMTUsMjMuODJxLTUuODQsNS0xMS42MSwxMGE2LjQ1LDYuNDUsMCwwLDEtMy42NCwxLjc0LDE1OS4yNiwxNTkuMjYsMCwwLDEsMTYuNTItMjYuMjRjNS44LTQuMjcsMTEuMS05LjE2LDE2LjU5LTEzLjgxcTIxLjM5LTE4LjEyLDQyLjcyLTM2LjMyLDE2LjUtMTQuMDYsMzMtMjguMTRjMS43LTEuNDUsMy44My0yLjM4LDUuMTMtNC4yOSw4LjcyLTUuMjgsMTguMy04LjUzLDI3LjgyLTExLjk1IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuNzggLTIzLjc3KSIgZmlsbD0iIzgxYTdkOCIvPjxwYXRoIGQ9Ik00NDIuNTUsNDY2LjY0Yy03LjU1LDYuMTYtMTQuOTUsMTIuNTQtMjUsMTYuODFhODguODYsODguODYsMCwwLDAsNi42My0xOC4yNGM1LjkyLTI2LC40My00OS42Ni0xNC44Ny03MS4yNC0zLjc4LTUuMzItOC44Ni05LjQ0LTEzLjM2LTE0LjA5LS43My0uNzUtMS41Mi0xLjY5LTIuODMtMS4wNi0xLjM1LS42Ni0yLTItMy0zLC42NS0uODMsMS4zMi0uMzcsMiwwLDE4LjEzLDEwLjI4LDMzLjI0LDIzLjYyLDQyLjQ3LDQyLjY5YTg1LjIzLDg1LjIzLDAsMCwxLDguMTgsMzAsODYuODYsODYuODYsMCwwLDEtLjE3LDE4LjE3IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuNzggLTIzLjc3KSIgZmlsbD0iIzBlMWY2NiIvPjxwYXRoIGQ9Ik0xMTcuOCwzMTUuODZjMywxLjA4LDQtMS45MSw1LjU0LTMuMTQsMTUuMjEtMTIuNTksMzAuMjEtMjUuNDQsNDUuMjMtMzguMjYsMTQuMTctMTIuMSwyOC4yNS0yNC4zMSw0Mi40NS0zNi4zOCwxNS44MS0xMy40MywzMS43NC0yNi43LDQ3LjU1LTQwLjEzLDE0LjItMTIuMDcsMjguMjgtMjQuMjcsNDIuNDQtMzYuMzhRMzI0LDE0MiwzNDcsMTIyLjRjMS41Ny0xLjM0LDMuODMtMiw0LjExLTQuNTMuODYtLjgyLDIuMTMuMDgsMy0uNzNsMy43NiwwYy0xLjE1LDQtNSw1LjM5LTcuNyw3LjgxLTcuNzYsNy0xNS44NSwxMy41OS0yMy44MiwyMC4zMy05LjExLDcuNy0xOC4yNiwxNS4zNi0yNy4zNiwyMy4wOC03LjM5LDYuMjctMTQuNzIsMTIuNjItMjIuMTIsMTguOS0xMC45LDkuMjQtMjEuODUsMTguNDItMzIuNzQsMjcuNjctNy40LDYuMjgtMTQuNzIsMTIuNjQtMjIuMSwxOC45Mi05LjM4LDgtMTguOCwxNS44OC0yOC4xOCwyMy44NS03LjM5LDYuMjgtMTQuNzEsMTIuNjQtMjIuMSwxOC45Mi03LjU3LDYuNDQtMTUuMjEsMTIuODEtMjIuNzgsMTkuMjVzLTE1LjA4LDEzLTIyLjY1LDE5LjQzYy0yLjY0LDIuMjUtNS4zOCw0LjQtOC4wOCw2LjYtLjY0LjUyLTEuMjUuODUtMS44NywwYTExLjc1LDExLjc1LDAsMCwxLDEuNDktNiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiM2OTlhZDEiLz48cGF0aCBkPSJNMjU2LjQ5LDE0NC4wNmMtLjYzLDMuNTUtNC4wOSw0LjQ4LTYuMjksNi40Ni03LjY2LDYuODktMTUuNjMsMTMuNDMtMjMuNDksMjAuMDgtOS4yLDcuNzctMTguNDIsMTUuNS0yNy42LDIzLjI5LTcuMzksNi4yNi0xNC43MywxMi41OS0yMi4wOCwxOC44OXEtOC4wNiw2LjktMTYuMSwxMy44M2MtLjYzLjU0LTEuMjQuODctMS44NiwwYTE0MS43MiwxNDEuNzIsMCwwLDEsMTMuMTQtMTcuMTFjMTcuNjUtMjAuNSwzNy43LTM4LjMsNjAuNzMtNTIuNiw3LjYtNC43MSwxNS4xNC05LjYsMjMuNTUtMTIuODUiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yMy43OCAtMjMuNzcpIiBmaWxsPSIjODhhYmQ5Ii8+PHBhdGggZD0iTTM4Ni4zMiwxMTcuMTJjLTIuNDktLjMzLTUuMTMuNzctNy41LS43NCwyLjQ5LjMyLDUuMTItLjc4LDcuNS43NCIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiM1NTkxY2QiLz48cGF0aCBkPSJNMzU0LjA1LDExNy4xNGMtLjc5LDEuMDctMiwuNjItMywuNzNoLTEuNTFjMS4zMy0xLjMsMy0uNTIsNC41LS43MiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiM2ODlhZDEiLz48cGF0aCBkPSJNMjgyLjA2LDYzOS4xMmExODIuMywxODIuMywwLDAsMCw3MS44MS0xMS4zMSwyMTQsMjE0LDAsMCwwLDYxLjYxLTM0LjY3YzE4LjA5LTE0LjY4LDMzLjY2LTMxLjUzLDQ0LjA2LTUyLjYxYTEwMS4zNiwxMDEuMzYsMCwwLDAsMTAuMjItMzZjMS0xMS4zMS0uODgtMjItMy45NS0zMi42NC4zNC0yLjYxLDIuNzItMy44LDQuMTEtNS42Myw1LjM4LTcuMDcsOS4zNS0xNC42OSwxMS0yMy40NmEyNy40MywyNy40MywwLDAsMSwxLjIxLTMuNDMsMTExLDExMSwwLDAsMSw4LDIxLjE2YzIuNjMsMTAuMzEsNC4xMSwyMC44LDMuMzMsMzEuNGExMjMuMzEsMTIzLjMxLDAsMCwxLTE2LjA2LDUyLjMyYy05LjE2LDE2LjE1LTIxLDMwLTM0LjYsNDIuMzdhMTk5Ljg5LDE5OS44OSwwLDAsMS0zOS4zNywyNy41NCwyMTkuNSwyMTkuNSwwLDAsMS01NC4yNiwyMC43MSwyMDkuMjcsMjA5LjI3LDAsMCwxLTM2LjA1LDUuMmMtNS44NS4zMy0xMS43MS44My0xNy41Mi40Ni00LjUxLS4yOS05LjE0LDAtMTMuNTYtMS4zNyIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTIzLjc4IC0yMy43NykiIGZpbGw9IiMwZTFmNjYiLz48L2c+PC9zdmc+',
  router: {
    address: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
    api: UniswapV2.ROUTER
  },
  factory: {
    address: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
    api: UniswapV2.FACTORY
  },
  pair: {
    api: UniswapV2.PAIR
  },
  slippage: true,
};

var quickswap = new Exchange(

  Object.assign(exchange$b, {
    findPath: ({ tokenIn, tokenOut })=>
      UniswapV2.findPath(blockchain$a, exchange$b, { tokenIn, tokenOut }),
    pathExists: (path)=>
      UniswapV2.pathExists(blockchain$a, exchange$b, path),
    getAmounts: ({ path, block, tokenIn, tokenOut, amountOut, amountIn, amountInMax, amountOutMin })=>
      UniswapV2.getAmounts(blockchain$a, exchange$b, { path, block, tokenIn, tokenOut, amountOut, amountIn, amountInMax, amountOutMin }),
    getTransaction: ({ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress })=>
      UniswapV2.getTransaction(blockchain$a, exchange$b ,{ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress }),
  })
);

const blockchain$9 = Blockchains.fantom;

const exchange$a = {
  blockchain: 'fantom',
  name: 'spookyswap',
  alternativeNames: [],
  label: 'SpookySwap',
  logo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPHN2ZyB2ZXJzaW9uPSIxLjEiIGlkPSJMYXllcl8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCIKCSB2aWV3Qm94PSIwIDAgNjQxIDY0MCIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgNjQxIDY0MDsiIHhtbDpzcGFjZT0icHJlc2VydmUiPgo8Zz4KCTxwYXRoIGZpbGw9IiMxMjExMjIiIGQ9Ik0zNC4yLDMyMGMwLDE1OC41LDEyOC41LDI4Ni4zLDI4Ni4zLDI4Ni4zYzE1OC41LDAsMjg2LjMtMTI4LjUsMjg2LjMtMjg2LjNjMC0xNTguNS0xMjguNS0yODYuMy0yODYuMy0yODYuMwoJCUMxNjIuNywzMy43LDM0LjIsMTYyLjIsMzQuMiwzMjBMMzQuMiwzMjB6Ii8+Cgk8cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZmlsbD0iI0YyRjRGOCIgZD0iTTEyMC45LDI0Ny42Yy0zLjMsMjIuMiwwLjcsNDUuNyw0LjYsNjcuOGMyLDMuMyw1LjIsNS45LDkuOCw3LjJjLTkuMSwxOS42LTE0LjMsNDAuNC0xNC4zLDYyLjYKCQljMCw5My4zLDkwLDE2OC45LDIwMS41LDE2OC45UzUyNCw0NzguNSw1MjQsMzg1LjJjMC0yMS41LTUuMi00My0xNC4zLTYyLjZjMy45LTEuMyw2LjUtMy45LDcuOC03LjJjNC42LTIyLjIsOC41LTQ1LjcsNS4yLTY3LjgKCQljLTMuMy0zMC0xMy43LTM5LjgtNDUtMzJjLTE1LjcsMy45LTM2LjUsMTMtNTIuOCwyNC4xYy0zMC0xNS02NS4yLTIzLjUtMTAyLjQtMjMuNWMtMzcuOCwwLTczLjcsOS4xLTEwMy43LDI0LjEKCQljLTE2LjMtMTEuMS0zNy4yLTIwLjktNTMuNS0yNC44QzEzNCwyMDcuOCwxMjQuMiwyMTcuNiwxMjAuOSwyNDcuNkwxMjAuOSwyNDcuNnogTTIzOC4zLDM4MC43Yy0yMy41LTEwLjQtNjMuOS03LjgtNjMuOS03LjgKCQlzMiwzNy44LDI0LjgsNTAuOWMyNy40LDE1LDc4LjksNy44LDc4LjksNy44UzI3My41LDM5Ni4zLDIzOC4zLDM4MC43TDIzOC4zLDM4MC43eiBNMzY5LjQsNDMyLjJjMCwwLDUwLjksNy44LDc4LjktNy44CgkJYzIzLjUtMTMsMjQuOC01MC45LDI0LjgtNTAuOXMtNDAuNC0yLjYtNjMuOSw3LjhDMzc0LDM5Ni4zLDM2OS40LDQzMS41LDM2OS40LDQzMi4yTDM2OS40LDQzMi4yeiBNMzEyLjcsNDU4LjkKCQljMCwyLjYsNS4yLDUuMiwxMS43LDUuMnMxMS43LTIsMTEuNy01LjJjMC0yLjYtNS4yLTUuMi0xMS43LTUuMkMzMTcuOSw0NTMuNywzMTIuNyw0NTUuNywzMTIuNyw0NTguOUwzMTIuNyw0NTguOXoiLz4KCTxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBmaWxsPSIjRjJGNEY4IiBkPSJNNTUyLjcsNDM1LjRjLTE4LjktNy4yLTM5LjEtMTEuMS01OS4zLTExLjFjLTUuMiwwLTUuMi03LjgsMC03LjhjMjAuOSwwLDQxLjcsMy45LDYxLjMsMTEuNwoJCWMyLDAuNywzLjMsMi42LDIuNiw0LjZDNTU2LjYsNDM0LjgsNTU0LjYsNDM2LjEsNTUyLjcsNDM1LjRMNTUyLjcsNDM1LjR6IE05Mi4yLDQyNy42YzE5LjYtNy44LDQwLjQtMTEuMSw2MS4zLTExLjcKCQljNS4yLDAsNS4yLDcuOCwwLDcuOGMtMjAuMiwwLTQwLjQsMy45LTU5LjMsMTEuMWMtMiwwLjctNC42LTAuNy01LjItMi42Qzg5LDQzMC45LDkwLjMsNDI4LjMsOTIuMiw0MjcuNkw5Mi4yLDQyNy42eiBNMTMyLjcsNDUwLjQKCQljOS44LTMuMywyMC4yLTQuNiwzMC01LjJjNS4yLDAsNS4yLDcuOCwwLDcuOGMtOS4xLDAtMTguOSwyLTI3LjQsNC42Yy04LjUsMi42LTE3LjYsNS45LTI0LjEsMTEuN2MtMy45LDMuMy05LjEtMi01LjktNS45CgkJQzExMy4xLDQ1NywxMjMuNSw0NTMuNywxMzIuNyw0NTAuNEwxMzIuNyw0NTAuNHogTTE3MS44LDQ2NS40Yy03LjgsMy4zLTE1LjcsNy44LTIyLjgsMTIuNGMtNy4yLDQuNi0xMy43LDEwLjQtMTguOSwxNwoJCWMtMS4zLDItMC43LDQuNiwxLjMsNS4yYzIsMS4zLDQuNiwwLjcsNS4yLTEuM2M0LjYtNS45LDExLjEtMTEuMSwxNy0xNWM3LjItNC42LDE0LjMtOC41LDIxLjUtMTEuN2MyLTEuMywyLjYtMy4zLDEuMy01LjIKCQlDMTc2LjQsNDY0LjgsMTczLjgsNDY0LjEsMTcxLjgsNDY1LjRMMTcxLjgsNDY1LjR6IE00ODMuNSw0NTMuN2M5LjEsMCwxOC45LDIsMjcuNCw0LjZjNC42LDEuMyw5LjEsMy4zLDEzLjcsNS4yCgkJYzMuOSwxLjMsNy4yLDMuOSwxMC40LDYuNWMzLjksMy4zLDkuMS0yLDUuOS01LjljLTcuMi02LjUtMTcuNi0xMC40LTI2LjctMTNjLTkuOC0zLjMtMjAuMi00LjYtMzAtNS4yCgkJQzQ3OSw0NDUuMiw0NzksNDUzLjcsNDgzLjUsNDUzLjdMNDgzLjUsNDUzLjd6IE00OTIuNyw0ODMuN2MtNy4yLTQuNi0xNC4zLTcuOC0yMS41LTExLjFsMCwwYy0yLTEuMy0yLjYtMy4zLTEuMy01LjIKCQljMS4zLTIsMy4zLTIuNiw1LjItMS4zYzE1LjcsNi41LDMyLDE1LjcsNDEuNywyOS4zYzEuMywyLDAuNyw0LjYtMS4zLDUuMmMtMiwxLjMtNC42LDAuNy01LjItMS4zCgkJQzUwNS43LDQ5Mi44LDQ5OS4yLDQ4Ny42LDQ5Mi43LDQ4My43TDQ5Mi43LDQ4My43eiIvPgoJPHBhdGggZmlsbD0iIzY2NjVERCIgZD0iTTYyLjIsMzM1LjdjMy45LTUuOSwzNS45LTIyLjgsNzUuNy0zMy4zYzguNS0yNC44LDE5LjYtNDguMywzMi03MS4xbDMyLTU4Yy05LjEtMy45LTE4LjMtOS4xLTI2LjctMTUKCQljLTEuMy0xLjMtMi42LTIuNi0zLjktMy45Yy0wLjctMS4zLTEuMy0zLjMtMS4zLTQuNnMyLTMuOSwyLjYtNC42YzItMi42LDQuNi00LjYsNy4yLTcuMmM1LjktNS4yLDEyLjQtOS44LDE5LjYtMTMuNwoJCWMzLjMtMiw2LjUtMy45LDkuOC02LjVjMjIuOC0xNC4zLDM1LjktMjUuNCw1Ni43LTM3LjhjMjAuMi0xMS43LDMwLTE4LjMsNTIuOC0xNy42YzI5LjMsMCwxMDEuNyw5Mi42LDEzNC4zLDE0MC4yCgkJYzE5LjYsMjguNyw0Ni4zLDgwLjIsNTYuMSw5OS44YzIsMC43LDQuNiwxLjMsNi41LDJjMzAsOS4xLDU4LjcsMjIuMiw2NS45LDMwLjdjNi41LDcuMi0yMS41LDEwLjQtNDguOSwxNS43CgkJYy0yNy40LDQuNi0xMjAuNyw3LjItMjEwLDcuOGMtODkuMywwLjctMTkzLjctMi42LTIxNi41LTUuOUM4My4xLDM0OS4zLDU3LjcsMzQyLjgsNjIuMiwzMzUuN0w2Mi4yLDMzNS43eiIvPgoJPHBhdGggZmlsbD0iI0ZGOTlBNSIgZD0iTTQ4My41LDI1Ni4xYzAsMC01OC43LTE1LTE2Mi40LTE1Yy0xMTEuNSwwLTE2NSwxNy0xNjUsMTdzLTYuNSwxMi40LTkuMSwxOC45Yy0yLjYsNy4yLTkuMSwyNS40LTkuMSwyNS40CgkJUzIxOC44LDI4OCwzMjIuNSwyODhjNjIuNiwwLDEyNC42LDUuMiwxODYuNSwxNS43YzAsMC05LjEtMjIuMi0xNS0zMS4zQzQ5MC43LDI2Ny4yLDQ4Ny41LDI2MS4zLDQ4My41LDI1Ni4xTDQ4My41LDI1Ni4xeiIvPgoJPHBhdGggZmlsbD0iI0ZGRTYwMCIgZD0iTTEzMy4zLDEzMS41YzYuNS0wLjcsMTUuNywxOS42LDE1LjcsMTkuNnMyMC45LTUuOSwyNC44LDBjMy4zLDUuOS0xNSwxOS42LTE1LDE5LjZzMTEuMSwxOS42LDcuMiwyMy41CgkJYy0zLjMsMy45LTIyLjgtOC41LTIyLjgtOC41cy0xNSwxNy0xOS42LDE0LjNjLTUuMi0yLjYsMC43LTI0LjgsMC43LTI0LjhzLTIxLjUtOS4xLTE5LjYtMTQuM2MxLjMtNS4yLDIzLjUtNy4yLDIzLjUtNy4yCgkJUzEyNi44LDEzMi44LDEzMy4zLDEzMS41TDEzMy4zLDEzMS41eiIvPgo8L2c+Cjwvc3ZnPgo=',
  router: {
    address: '0xF491e7B69E4244ad4002BC14e878a34207E38c29',
    api: UniswapV2.ROUTER
  },
  factory: {
    address: '0x152eE697f2E276fA89E96742e9bB9aB1F2E61bE3',
    api: UniswapV2.FACTORY
  },
  pair: {
    api: UniswapV2.PAIR
  },
  slippage: true,
};

var spookyswap = new Exchange(

  Object.assign(exchange$a, {
    findPath: ({ tokenIn, tokenOut })=>
      UniswapV2.findPath(blockchain$9, exchange$a, { tokenIn, tokenOut }),
    pathExists: (path)=>
      UniswapV2.pathExists(blockchain$9, exchange$a, path),
    getAmounts: ({ path, block, tokenIn, tokenOut, amountOut, amountIn, amountInMax, amountOutMin })=>
      UniswapV2.getAmounts(blockchain$9, exchange$a, { path, block, tokenIn, tokenOut, amountOut, amountIn, amountInMax, amountOutMin }),
    getTransaction: ({ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress })=>
      UniswapV2.getTransaction(blockchain$9, exchange$a ,{ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress }),
  })
);

const blockchain$8 = Blockchains.ethereum;

const exchange$9 = {
  blockchain: 'ethereum',
  name: 'uniswap_v2',
  alternativeNames: [],
  label: 'Uniswap v2',
  logo: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQxIiBoZWlnaHQ9IjY0MCIgdmlld0JveD0iMCAwIDY0MSA2NDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik0yMjQuNTM0IDEyMy4yMjZDMjE4LjY5MiAxMjIuMzIgMjE4LjQ0NSAxMjIuMjEzIDIyMS4xOTUgMTIxLjc5MUMyMjYuNDY0IDEyMC45OCAyMzguOTA1IDEyMi4wODUgMjQ3LjQ3OSAxMjQuMTIzQzI2Ny40OTQgMTI4Ljg4MSAyODUuNzA3IDE0MS4wNjkgMzA1LjE0OCAxNjIuNzE0TDMxMC4zMTMgMTY4LjQ2NUwzMTcuNzAxIDE2Ny4yNzdDMzQ4LjgyOCAxNjIuMjc1IDM4MC40OTMgMTY2LjI1IDQwNi45NzggMTc4LjQ4NUM0MTQuMjY0IDE4MS44NTEgNDI1Ljc1MiAxODguNTUyIDQyNy4xODcgMTkwLjI3NEM0MjcuNjQ1IDE5MC44MjIgNDI4LjQ4NSAxOTQuMzU1IDQyOS4wNTMgMTk4LjEyNEM0MzEuMDIgMjExLjE2NCA0MzAuMDM2IDIyMS4xNiA0MjYuMDQ3IDIyOC42MjVDNDIzLjg3NyAyMzIuNjg4IDQyMy43NTYgMjMzLjk3NSA0MjUuMjE1IDIzNy40NTJDNDI2LjM4IDI0MC4yMjcgNDI5LjYyNyAyNDIuMjggNDMyLjg0MyAyNDIuMjc2QzQzOS40MjUgMjQyLjI2NyA0NDYuNTA5IDIzMS42MjcgNDQ5Ljc5MSAyMTYuODIzTDQ1MS4wOTUgMjEwLjk0M0w0NTMuNjc4IDIxMy44NjhDNDY3Ljg0NiAyMjkuOTIgNDc4Ljk3NCAyNTEuODExIDQ4MC44ODUgMjY3LjM5M0w0ODEuMzgzIDI3MS40NTVMNDc5LjAwMiAyNjcuNzYyQzQ3NC45MDMgMjYxLjQwNyA0NzAuNzg1IDI1Ny4wOCA0NjUuNTEyIDI1My41OTFDNDU2LjAwNiAyNDcuMzAxIDQ0NS45NTUgMjQ1LjE2MSA0MTkuMzM3IDI0My43NThDMzk1LjI5NiAyNDIuNDkxIDM4MS42OSAyNDAuNDM4IDM2OC4xOTggMjM2LjAzOEMzNDUuMjQ0IDIyOC41NTQgMzMzLjY3MiAyMTguNTg3IDMwNi40MDUgMTgyLjgxMkMyOTQuMjk0IDE2Ni45MjMgMjg2LjgwOCAxNTguMTMxIDI3OS4zNjIgMTUxLjA1MUMyNjIuNDQyIDEzNC45NjQgMjQ1LjgxNiAxMjYuNTI3IDIyNC41MzQgMTIzLjIyNloiIGZpbGw9IiNGRjAwN0EiLz4KPHBhdGggZD0iTTQzMi42MSAxNTguNzA0QzQzMy4yMTUgMTQ4LjA1NyA0MzQuNjU5IDE0MS4wMzMgNDM3LjU2MiAxMzQuNjJDNDM4LjcxMSAxMzIuMDgxIDQzOS43ODggMTMwLjAwMyA0MzkuOTU0IDEzMC4wMDNDNDQwLjEyIDEzMC4wMDMgNDM5LjYyMSAxMzEuODc3IDQzOC44NDQgMTM0LjE2N0M0MzYuNzMzIDE0MC4zOTIgNDM2LjM4NyAxNDguOTA1IDQzNy44NCAxNTguODExQzQzOS42ODYgMTcxLjM3OSA0NDAuNzM1IDE3My4xOTIgNDU0LjAxOSAxODYuNzY5QzQ2MC4yNSAxOTMuMTM3IDQ2Ny40OTcgMjAxLjE2OCA0NzAuMTI0IDIwNC42MTZMNDc0LjkwMSAyMTAuODg2TDQ3MC4xMjQgMjA2LjQwNUM0NjQuMjgyIDIwMC45MjYgNDUwLjg0NyAxOTAuMjQgNDQ3Ljg3OSAxODguNzEyQzQ0NS44OSAxODcuNjg4IDQ0NS41OTQgMTg3LjcwNSA0NDQuMzY2IDE4OC45MjdDNDQzLjIzNSAxOTAuMDUzIDQ0Mi45OTcgMTkxLjc0NCA0NDIuODQgMTk5Ljc0MUM0NDIuNTk2IDIxMi4yMDQgNDQwLjg5NyAyMjAuMjA0IDQzNi43OTcgMjI4LjIwM0M0MzQuNTggMjMyLjUyOSA0MzQuMjMgMjMxLjYwNiA0MzYuMjM3IDIyNi43MjNDNDM3LjczNSAyMjMuMDc3IDQzNy44ODcgMjIxLjQ3NCA0MzcuODc2IDIwOS40MDhDNDM3Ljg1MyAxODUuMTY3IDQzNC45NzUgMTc5LjMzOSA0MTguMDk3IDE2OS4zNTVDNDEzLjgyMSAxNjYuODI2IDQwNi43NzYgMTYzLjE3OCA0MDIuNDQyIDE2MS4yNDlDMzk4LjEwNyAxNTkuMzIgMzk0LjY2NCAxNTcuNjM5IDM5NC43ODkgMTU3LjUxNEMzOTUuMjY3IDE1Ny4wMzggNDExLjcyNyAxNjEuODQyIDQxOC4zNTIgMTY0LjM5QzQyOC4yMDYgMTY4LjE4MSA0MjkuODMzIDE2OC42NzIgNDMxLjAzIDE2OC4yMTVDNDMxLjgzMiAxNjcuOTA5IDQzMi4yMiAxNjUuNTcyIDQzMi42MSAxNTguNzA0WiIgZmlsbD0iI0ZGMDA3QSIvPgo8cGF0aCBkPSJNMjM1Ljg4MyAyMDAuMTc1QzIyNC4wMjIgMTgzLjg0NiAyMTYuNjg0IDE1OC44MDkgMjE4LjI3MiAxNDAuMDkzTDIxOC43NjQgMTM0LjMwMUwyMjEuNDYzIDEzNC43OTRDMjI2LjUzNCAxMzUuNzE5IDIzNS4yNzUgMTM4Ljk3MyAyMzkuMzY5IDE0MS40NTlDMjUwLjYwMiAxNDguMjgxIDI1NS40NjUgMTU3LjI2MyAyNjAuNDEzIDE4MC4zMjhDMjYxLjg2MiAxODcuMDgzIDI2My43NjMgMTk0LjcyOCAyNjQuNjM4IDE5Ny4zMTdDMjY2LjA0NyAyMDEuNDgzIDI3MS4zNjkgMjExLjIxNCAyNzUuNjk2IDIxNy41MzRDMjc4LjgxMyAyMjIuMDg1IDI3Ni43NDMgMjI0LjI0MiAyNjkuODUzIDIyMy42MkMyNTkuMzMxIDIyMi42NyAyNDUuMDc4IDIxMi44MzQgMjM1Ljg4MyAyMDAuMTc1WiIgZmlsbD0iI0ZGMDA3QSIvPgo8cGF0aCBkPSJNNDE4LjIyMyAzMjEuNzA3QzM2Mi43OTMgMjk5LjM4OSAzNDMuMjcxIDI4MC4wMTcgMzQzLjI3MSAyNDcuMzMxQzM0My4yNzEgMjQyLjUyMSAzNDMuNDM3IDIzOC41ODUgMzQzLjYzOCAyMzguNTg1QzM0My44NCAyMzguNTg1IDM0NS45ODUgMjQwLjE3MyAzNDguNDA0IDI0Mi4xMTNDMzU5LjY0NCAyNTEuMTI4IDM3Mi4yMzEgMjU0Ljk3OSA0MDcuMDc2IDI2MC4wNjJDNDI3LjU4IDI2My4wNTQgNDM5LjExOSAyNjUuNDcgNDQ5Ljc2MyAyNjlDNDgzLjU5NSAyODAuMjIgNTA0LjUyNyAzMDIuOTkgNTA5LjUxOCAzMzQuMDA0QzUxMC45NjkgMzQzLjAxNiA1MTAuMTE4IDM1OS45MTUgNTA3Ljc2NiAzNjguODIyQzUwNS45MSAzNzUuODU3IDUwMC4yNDUgMzg4LjUzNyA0OTguNzQyIDM4OS4wMjNDNDk4LjMyNSAzODkuMTU4IDQ5Ny45MTcgMzg3LjU2MiA0OTcuODEgMzg1LjM4OUM0OTcuMjQgMzczLjc0NCA0OTEuMzU1IDM2Mi40MDYgNDgxLjQ3MiAzNTMuOTEzQzQ3MC4yMzUgMzQ0LjI1NyA0NTUuMTM3IDMzNi41NjkgNDE4LjIyMyAzMjEuNzA3WiIgZmlsbD0iI0ZGMDA3QSIvPgo8cGF0aCBkPSJNMzc5LjMxIDMzMC45NzhDMzc4LjYxNSAzMjYuODQ2IDM3Ny40MTEgMzIxLjU2OCAzNzYuNjMzIDMxOS4yNUwzNzUuMjE5IDMxNS4wMzZMMzc3Ljg0NiAzMTcuOTg1QzM4MS40ODEgMzIyLjA2NSAzODQuMzU0IDMyNy4yODcgMzg2Ljc4OSAzMzQuMjQxQzM4OC42NDcgMzM5LjU0OSAzODguODU2IDM0MS4xMjcgMzg4Ljg0MiAzNDkuNzUzQzM4OC44MjggMzU4LjIyMSAzODguNTk2IDM1OS45OTYgMzg2Ljg4IDM2NC43NzNDMzg0LjE3NCAzNzIuMzA3IDM4MC44MTYgMzc3LjY0OSAzNzUuMTgxIDM4My4zODNDMzY1LjA1NiAzOTMuNjg4IDM1Mi4wMzggMzk5LjM5MyAzMzMuMjUzIDQwMS43NkMzMjkuOTg3IDQwMi4xNzEgMzIwLjQ3IDQwMi44NjQgMzEyLjEwMyA0MDMuMjk5QzI5MS4wMTYgNDA0LjM5NSAyNzcuMTM4IDQwNi42NjEgMjY0LjY2OCA0MTEuMDRDMjYyLjg3NSA0MTEuNjcgMjYxLjI3NCA0MTIuMDUyIDI2MS4xMTIgNDExLjg5QzI2MC42MDcgNDExLjM4OCAyNjkuMDk4IDQwNi4zMjYgMjc2LjExMSA0MDIuOTQ4QzI4NS45OTkgMzk4LjE4NSAyOTUuODQyIDM5NS41ODYgMzE3Ljg5NyAzOTEuOTEzQzMyOC43OTIgMzkwLjA5OCAzNDAuMDQzIDM4Ny44OTcgMzQyLjkgMzg3LjAyMUMzNjkuODggMzc4Ljc0OSAzODMuNzQ4IDM1Ny40MDIgMzc5LjMxIDMzMC45NzhaIiBmaWxsPSIjRkYwMDdBIi8+CjxwYXRoIGQ9Ik00MDQuNzE5IDM3Ni4xMDVDMzk3LjM1NSAzNjAuMjczIDM5NS42NjQgMzQ0Ljk4OCAzOTkuNjk4IDMzMC43MzJDNDAwLjEzIDMyOS4yMDkgNDAwLjgyNCAzMjcuOTYyIDQwMS4yNDIgMzI3Ljk2MkM0MDEuNjU5IDMyNy45NjIgNDAzLjM5NyAzMjguOTAyIDQwNS4xMDMgMzMwLjA1QzQwOC40OTcgMzMyLjMzNSA0MTUuMzAzIDMzNi4xODIgNDMzLjQzNyAzNDYuMDY5QzQ1Ni4wNjUgMzU4LjQwNiA0NjguOTY2IDM2Ny45NTkgNDc3Ljc0IDM3OC44NzNDNDg1LjQyMyAzODguNDMyIDQ5MC4xNzggMzk5LjMxOCA0OTIuNDY3IDQxMi41OTNDNDkzLjc2MiA0MjAuMTEzIDQ5My4wMDMgNDM4LjIwNiA0OTEuMDc0IDQ0NS43NzhDNDg0Ljk5IDQ2OS42NTMgNDcwLjg1IDQ4OC40MDYgNDUwLjY4MiA0OTkuMzQ5QzQ0Ny43MjcgNTAwLjk1MiA0NDUuMDc1IDUwMi4yNjkgNDQ0Ljc4OCA1MDIuMjc1QzQ0NC41MDEgNTAyLjI4IDQ0NS41NzcgNDk5LjU0MyA0NDcuMTggNDk2LjE5MUM0NTMuOTY1IDQ4Mi4wMDkgNDU0LjczNyA0NjguMjE0IDQ0OS42MDggNDUyLjg1OUM0NDYuNDY3IDQ0My40NTcgNDQwLjA2NCA0MzEuOTg1IDQyNy4xMzUgNDEyLjU5NkM0MTIuMTAzIDM5MC4wNTQgNDA4LjQxNyAzODQuMDU0IDQwNC43MTkgMzc2LjEwNVoiIGZpbGw9IiNGRjAwN0EiLz4KPHBhdGggZD0iTTE5Ni41MTkgNDYxLjUyNUMyMTcuMDg5IDQ0NC4xNTcgMjQyLjY4MiA0MzEuODE5IDI2NS45OTYgNDI4LjAzMkMyNzYuMDQzIDQyNi4zOTkgMjkyLjc4IDQyNy4wNDcgMzAyLjA4NCA0MjkuNDI4QzMxNi45OTggNDMzLjI0NSAzMzAuMzM4IDQ0MS43OTMgMzM3LjI3NiA0NTEuOTc4QzM0NC4wNTcgNDYxLjkzMiAzNDYuOTY2IDQ3MC42MDYgMzQ5Ljk5NSA0ODkuOTA2QzM1MS4xODkgNDk3LjUxOSAzNTIuNDg5IDUwNS4xNjQgMzUyLjg4MiA1MDYuODk1QzM1NS4xNTYgNTE2Ljg5NyAzNTkuNTgzIDUyNC44OTIgMzY1LjA2NyA1MjguOTA3QzM3My43NzkgNTM1LjI4MyAzODguNzggNTM1LjY4IDQwMy41MzYgNTI5LjkyNEM0MDYuMDQxIDUyOC45NDcgNDA4LjIxNSA1MjguMjcxIDQwOC4zNjggNTI4LjQyNEM0MDguOTAzIDUyOC45NTUgNDAxLjQ3MyA1MzMuOTMgMzk2LjIzIDUzNi41NDhDMzg5LjE3NyA1NDAuMDcxIDM4My41NjggNTQxLjQzNCAzNzYuMTE1IDU0MS40MzRDMzYyLjYgNTQxLjQzNCAzNTEuMzc5IDUzNC41NTggMzQyLjAxNiA1MjAuNTM5QzM0MC4xNzQgNTE3Ljc4IDMzNi4wMzIgNTA5LjUxNiAzMzIuODEzIDUwMi4xNzZDMzIyLjkyOCA0NzkuNjI4IDMxOC4wNDYgNDcyLjc1OSAzMDYuNTY4IDQ2NS4yNDJDMjk2LjU3OSA0NTguNzAxIDI4My42OTcgNDU3LjUzIDI3NC4wMDYgNDYyLjI4MkMyNjEuMjc2IDQ2OC41MjMgMjU3LjcyNCA0ODQuNzkxIDI2Ni44NDIgNDk1LjEwMUMyNzAuNDY1IDQ5OS4xOTggMjc3LjIyMyA1MDIuNzMyIDI4Mi43NDkgNTAzLjQxOUMyOTMuMDg2IDUwNC43MDUgMzAxLjk3IDQ5Ni44NDEgMzAxLjk3IDQ4Ni40MDRDMzAxLjk3IDQ3OS42MjcgMjk5LjM2NSA0NzUuNzYgMjkyLjgwOCA0NzIuODAxQzI4My44NTIgNDY4Ljc2IDI3NC4yMjYgNDczLjQ4MyAyNzQuMjcyIDQ4MS44OTdDMjc0LjI5MiA0ODUuNDg0IDI3NS44NTQgNDg3LjczNyAyNzkuNDUgNDg5LjM2NEMyODEuNzU3IDQ5MC40MDggMjgxLjgxMSA0OTAuNDkxIDI3OS45MjkgNDkwLjFDMjcxLjcxMiA0ODguMzk2IDI2OS43ODcgNDc4LjQ5IDI3Ni4zOTQgNDcxLjkxM0MyODQuMzI2IDQ2NC4wMTggMzAwLjcyOSA0NjcuNTAyIDMwNi4zNjIgNDc4LjI3OUMzMDguNzI4IDQ4Mi44MDUgMzA5LjAwMyA0OTEuODIgMzA2Ljk0IDQ5Ny4yNjRDMzAyLjMyMiA1MDkuNDQ4IDI4OC44NTkgNTE1Ljg1NSAyNzUuMjAxIDUxMi4zNjhDMjY1LjkwMyA1MDkuOTk0IDI2Mi4xMTcgNTA3LjQyNCAyNTAuOTA2IDQ5NS44NzZDMjMxLjQyNSA0NzUuODA5IDIyMy44NjIgNDcxLjkyIDE5NS43NzcgNDY3LjUzNkwxOTAuMzk1IDQ2Ni42OTZMMTk2LjUxOSA0NjEuNTI1WiIgZmlsbD0iI0ZGMDA3QSIvPgo8cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTQ5LjYyMDIgMTIuMDAzMUMxMTQuNjc4IDkwLjk2MzggMjE0Ljk3NyAyMTMuOTAxIDIxOS45NTcgMjIwLjc4NEMyMjQuMDY4IDIyNi40NjcgMjIyLjUyMSAyMzEuNTc2IDIxNS40NzggMjM1LjU4QzIxMS41NjEgMjM3LjgwNyAyMDMuNTA4IDI0MC4wNjMgMTk5LjQ3NiAyNDAuMDYzQzE5NC45MTYgMjQwLjA2MyAxODkuNzc5IDIzNy44NjcgMTg2LjAzOCAyMzQuMzE4QzE4My4zOTMgMjMxLjgxIDE3Mi43MjEgMjE1Ljg3NCAxNDguMDg0IDE3Ny42NDZDMTI5LjIzMyAxNDguMzk2IDExMy40NTcgMTI0LjEzMSAxMTMuMDI3IDEyMy43MjVDMTEyLjAzMiAxMjIuNzg1IDExMi4wNDkgMTIyLjgxNyAxNDYuMTYyIDE4My44NTRDMTY3LjU4MiAyMjIuMTgxIDE3NC44MTMgMjM1LjczMSAxNzQuODEzIDIzNy41NDNDMTc0LjgxMyAyNDEuMjI5IDE3My44MDggMjQzLjE2NiAxNjkuMjYxIDI0OC4yMzhDMTYxLjY4MSAyNTYuNjk0IDE1OC4yOTMgMjY2LjE5NSAxNTUuODQ3IDI4NS44NTlDMTUzLjEwNCAzMDcuOTAyIDE0NS4zOTQgMzIzLjQ3MyAxMjQuMDI2IDM1MC4xMjJDMTExLjUxOCAzNjUuNzIyIDEwOS40NzEgMzY4LjU4MSAxMDYuMzE1IDM3NC44NjlDMTAyLjMzOSAzODIuNzg2IDEwMS4yNDYgMzg3LjIyMSAxMDAuODAzIDM5Ny4yMTlDMTAwLjMzNSA0MDcuNzkgMTAxLjI0NyA0MTQuNjE5IDEwNC40NzcgNDI0LjcyNkMxMDcuMzA0IDQzMy41NzUgMTEwLjI1NSA0MzkuNDE3IDExNy44IDQ1MS4xMDRDMTI0LjMxMSA0NjEuMTg4IDEyOC4wNjEgNDY4LjY4MyAxMjguMDYxIDQ3MS42MTRDMTI4LjA2MSA0NzMuOTQ3IDEyOC41MDYgNDczLjk1IDEzOC41OTYgNDcxLjY3MkMxNjIuNzQxIDQ2Ni4yMTkgMTgyLjM0OCA0NTYuNjI5IDE5My4zNzUgNDQ0Ljg3N0MyMDAuMTk5IDQzNy42MDMgMjAxLjgwMSA0MzMuNTg2IDIwMS44NTMgNDIzLjYxOEMyMDEuODg3IDQxNy4wOTggMjAxLjY1OCA0MTUuNzMzIDE5OS44OTYgNDExLjk4MkMxOTcuMDI3IDQwNS44NzcgMTkxLjgwNCA0MDAuODAxIDE4MC4yOTIgMzkyLjkzMkMxNjUuMjA5IDM4Mi42MjEgMTU4Ljc2NyAzNzQuMzIgMTU2Ljk4NyAzNjIuOTA0QzE1NS41MjcgMzUzLjUzNyAxNTcuMjIxIDM0Ni45MjggMTY1LjU2NSAzMjkuNDRDMTc0LjIwMiAzMTEuMzM4IDE3Ni4zNDIgMzAzLjYyNCAxNzcuNzkgMjg1LjM3OEMxNzguNzI1IDI3My41ODkgMTgwLjAyIDI2OC45NCAxODMuNDA3IDI2NS4yMDlDMTg2LjkzOSAyNjEuMzE3IDE5MC4xMTkgMjYwIDE5OC44NjEgMjU4LjgwNUMyMTMuMTEzIDI1Ni44NTggMjIyLjE4OCAyNTMuMTcxIDIyOS42NDggMjQ2LjI5N0MyMzYuMTE5IDI0MC4zMzQgMjM4LjgyNyAyMzQuNTg4IDIzOS4yNDMgMjI1LjkzOEwyMzkuNTU4IDIxOS4zODJMMjM1Ljk0MiAyMTUuMTY2QzIyMi44NDYgMTk5Ljg5NiA0MC44NSAwIDQwLjA0NCAwQzM5Ljg3MTkgMCA0NC4xODEzIDUuNDAxNzggNDkuNjIwMiAxMi4wMDMxWk0xMzUuNDEyIDQwOS4xOEMxMzguMzczIDQwMy45MzcgMTM2LjggMzk3LjE5NSAxMzEuODQ3IDM5My45MDJDMTI3LjE2NyAzOTAuNzkgMTE5Ljg5NyAzOTIuMjU2IDExOS44OTcgMzk2LjMxMUMxMTkuODk3IDM5Ny41NDggMTIwLjU4MiAzOTguNDQ5IDEyMi4xMjQgMzk5LjI0M0MxMjQuNzIgNDAwLjU3OSAxMjQuOTA5IDQwMi4wODEgMTIyLjg2NiA0MDUuMTUyQzEyMC43OTcgNDA4LjI2MiAxMjAuOTY0IDQxMC45OTYgMTIzLjMzNyA0MTIuODU0QzEyNy4xNjIgNDE1Ljg0OSAxMzIuNTc2IDQxNC4yMDIgMTM1LjQxMiA0MDkuMThaIiBmaWxsPSIjRkYwMDdBIi8+CjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNMjQ4LjU1MiAyNjIuMjQ0QzI0MS44NjIgMjY0LjI5OSAyMzUuMzU4IDI3MS4zOSAyMzMuMzQ0IDI3OC44MjZDMjMyLjExNiAyODMuMzYyIDIzMi44MTMgMjkxLjMxOSAyMzQuNjUzIDI5My43NzZDMjM3LjYyNSAyOTcuNzQ1IDI0MC40OTkgMjk4Ljc5MSAyNDguMjgyIDI5OC43MzZDMjYzLjUxOCAyOTguNjMgMjc2Ljc2NCAyOTIuMDk1IDI3OC4zMDQgMjgzLjkyNUMyNzkuNTY3IDI3Ny4yMjkgMjczLjc0OSAyNjcuOTQ4IDI2NS43MzYgMjYzLjg3NEMyNjEuNjAxIDI2MS43NzIgMjUyLjgwNyAyNjAuOTM4IDI0OC41NTIgMjYyLjI0NFpNMjY2LjM2NCAyNzYuMTcyQzI2OC43MTQgMjcyLjgzNCAyNjcuNjg2IDI2OS4yMjUgMjYzLjY5IDI2Ni43ODVDMjU2LjA4IDI2Mi4xMzggMjQ0LjU3MSAyNjUuOTgzIDI0NC41NzEgMjczLjE3M0MyNDQuNTcxIDI3Ni43NTIgMjUwLjU3MiAyODAuNjU2IDI1Ni4wNzQgMjgwLjY1NkMyNTkuNzM1IDI4MC42NTYgMjY0Ljc0NiAyNzguNDczIDI2Ni4zNjQgMjc2LjE3MloiIGZpbGw9IiNGRjAwN0EiLz4KPC9zdmc+Cg==',
  router: {
    address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    api: UniswapV2.ROUTER
  },
  factory: {
    address: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    api: UniswapV2.FACTORY
  },
  pair: {
    api: UniswapV2.PAIR
  },
  slippage: true,
};

var uniswap_v2 = new Exchange(

  Object.assign(exchange$9, {
    findPath: ({ tokenIn, tokenOut })=>
      UniswapV2.findPath(blockchain$8, exchange$9, { tokenIn, tokenOut }),
    pathExists: (path)=>
      UniswapV2.pathExists(blockchain$8, exchange$9, path),
    getAmounts: ({ path, block, tokenIn, tokenOut, amountOut, amountIn, amountInMax, amountOutMin })=>
      UniswapV2.getAmounts(blockchain$8, exchange$9, { path, block, tokenIn, tokenOut, amountOut, amountIn, amountInMax, amountOutMin }),
    getTransaction: ({ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress })=>
      UniswapV2.getTransaction(blockchain$8, exchange$9 ,{ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress }),
  })
);

function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }

const FEES = [100, 500, 3000, 10000];

// Replaces 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE with the wrapped token and implies wrapping.
//
// We keep 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE internally
// to be able to differentiate between ETH<>Token and WETH<>Token swaps
// as they are not the same!
//
const fixPath$1 = (blockchain, exchange, path) => {
  if(!path) { return }
  let fixedPath = path.map((token, index) => {
    if (
      token === Blockchains[blockchain].currency.address && path[index+1] != Blockchains[blockchain].wrapped.address &&
      path[index-1] != Blockchains[blockchain].wrapped.address
    ) {
      return Blockchains[blockchain].wrapped.address
    } else {
      return token
    }
  });

  if(fixedPath[0] == Blockchains[blockchain].currency.address && fixedPath[1] == Blockchains[blockchain].wrapped.address) {
    fixedPath.splice(0, 1);
  } else if(fixedPath[fixedPath.length-1] == Blockchains[blockchain].currency.address && fixedPath[fixedPath.length-2] == Blockchains[blockchain].wrapped.address) {
    fixedPath.splice(fixedPath.length-1, 1);
  }

  return fixedPath
};

const getInputAmount = async (exchange, pool, outputAmount)=>{

  const data = await request({
    blockchain: pool.blockchain,
    address: exchange[pool.blockchain].quoter.address,
    api: exchange[pool.blockchain].quoter.api,
    method: 'quoteExactOutput',
    params: {
      path: ethers.utils.solidityPack(["address","uint24","address"],[pool.path[1], pool.fee, pool.path[0]]),
      amountOut: outputAmount
    },
    cache: 5
  });

  return data.amountIn
};

const getOutputAmount = async (exchange, pool, inputAmount)=>{

  const data = await request({
    blockchain: pool.blockchain,
    address: exchange[pool.blockchain].quoter.address,
    api: exchange[pool.blockchain].quoter.api,
    method: 'quoteExactInput',
    params: {
      path: ethers.utils.solidityPack(["address","uint24","address"],[pool.path[0], pool.fee, pool.path[1]]),
      amountIn: inputAmount
    },
    cache: 5
  });

  return data.amountOut
};

const getBestPool = async ({ blockchain, exchange, path, amountIn, amountOut, block }) => {
  path = fixPath$1(blockchain, exchange, path);
  if(path.length > 2) { throw('Uniswap V3 can only check paths for up to 2 tokens!') }

  try {

    let pools = (await Promise.all(FEES.map((fee)=>{
      return request({
        blockchain: Blockchains[blockchain].name,
        address: exchange[blockchain].factory.address,
        method: 'getPool',
        api: exchange[blockchain].factory.api,
        cache: 3600,
        params: [path[0], path[1], fee],
      }).then((address)=>{
        return {
          blockchain,
          address,
          path,
          fee,
          token0: [...path].sort()[0],
          token1: [...path].sort()[1],
        }
      }).catch(()=>{})
    }))).filter(Boolean);

    pools = pools.filter((pool)=>pool.address != Blockchains[blockchain].zero);

    pools = (await Promise.all(pools.map(async(pool)=>{

      try {

        let amount;
        if(amountIn) {
          amount = await getOutputAmount(exchange, pool, amountIn);
        } else {
          amount = await getInputAmount(exchange, pool, amountOut);
        }

        return { ...pool, amountIn: amountIn || amount, amountOut: amountOut || amount }
      } catch (e) {}

    }))).filter(Boolean);
    
    if(amountIn) {
      // highest amountOut is best pool
      return pools.sort((a,b)=>(b.amountOut.gt(a.amountOut) ? 1 : -1))[0]
    } else {
      // lowest amountIn is best pool
      return pools.sort((a,b)=>(b.amountIn.lt(a.amountIn) ? 1 : -1))[0]
    }

  } catch (e2) { return }
};

const pathExists$1 = async (blockchain, exchange, path, amountIn, amountOut, amountInMax, amountOutMin) => {
  try {

    let pools = (await Promise.all(FEES.map((fee)=>{
      path = fixPath$1(blockchain, exchange, path);
      return request({
        blockchain: Blockchains[blockchain].name,
        address: exchange[blockchain].factory.address,
        method: 'getPool',
        api: exchange[blockchain].factory.api,
        cache: 3600,
        params: [path[0], path[1], fee],
      }).catch(()=>{})
    }))).filter(Boolean).filter((address)=>address != Blockchains[blockchain].zero);

    return pools.length

  } catch (e3) { return false }
};

const findPath$1 = async ({ blockchain, exchange, tokenIn, tokenOut, amountIn, amountOut, amountInMax, amountOutMin }) => {
  if(
    [tokenIn, tokenOut].includes(Blockchains[blockchain].currency.address) &&
    [tokenIn, tokenOut].includes(Blockchains[blockchain].wrapped.address)
  ) { return { path: undefined, fixedPath: undefined } }

  let path;
  if (await pathExists$1(blockchain, exchange, [tokenIn, tokenOut])) {
    // direct path
    path = [tokenIn, tokenOut];
  } else if (
    tokenIn != Blockchains[blockchain].wrapped.address &&
    await pathExists$1(blockchain, exchange, [tokenIn, Blockchains[blockchain].wrapped.address]) &&
    tokenOut != Blockchains[blockchain].wrapped.address &&
    await pathExists$1(blockchain, exchange, [tokenOut, Blockchains[blockchain].wrapped.address])
  ) {
    // path via WRAPPED
    path = [tokenIn, Blockchains[blockchain].wrapped.address, tokenOut];
  } else if (
    (await Promise.all(Blockchains[blockchain].stables.usd.map(async (stable)=>{
      return( (await pathExists$1(blockchain, exchange, [tokenIn, stable]) ? stable : undefined) && await pathExists$1(blockchain, exchange, [tokenOut, stable]) ? stable : undefined )
    }))).find(Boolean)
  ) {
    // path via tokenIn -> USD -> tokenOut
    let USD = (await Promise.all(Blockchains[blockchain].stables.usd.map(async (stable)=>{
      return( (await pathExists$1(blockchain, exchange, [tokenIn, stable]) ? stable : undefined) && await pathExists$1(blockchain, exchange, [tokenOut, stable]) ? stable : undefined )
    }))).find(Boolean);
    path = [tokenIn, USD, tokenOut];
  }

  let pools;
  if(path && path.length == 2) {
    pools = [
      await getBestPool({ blockchain, exchange, path: [path[0], path[1]], amountIn: (amountIn || amountInMax), amountOut: (amountOut || amountOutMin) })
    ];
  } else if (path && path.length == 3) {
    if(amountOut || amountOutMin) {
      let pool2 = await getBestPool({ blockchain, exchange, path: [path[1], path[2]], amountOut: (amountOut || amountOutMin) });
      let pool1 = await getBestPool({ blockchain, exchange, path: [path[0], path[1]], amountOut: pool2.amountIn });
      pools = [pool1, pool2];
    } else { // amountIn
      let pool1 = await getBestPool({ blockchain, exchange, path: [path[0], path[1]], amountIn: (amountIn || amountInMax) });
      let pool2 = await getBestPool({ blockchain, exchange, path: [path[1], path[2]], amountIn: pool1.amountOut });
      pools = [pool1, pool2];
    }
  }

  // Add WRAPPED to route path if things start or end with NATIVE
  // because that actually reflects how things are routed in reality:
  if(_optionalChain([path, 'optionalAccess', _ => _.length]) && path[0] == Blockchains[blockchain].currency.address) {
    path.splice(1, 0, Blockchains[blockchain].wrapped.address);
  } else if(_optionalChain([path, 'optionalAccess', _2 => _2.length]) && path[path.length-1] == Blockchains[blockchain].currency.address) {
    path.splice(path.length-1, 0, Blockchains[blockchain].wrapped.address);
  }

  return { path, pools, fixedPath: fixPath$1(blockchain, exchange, path) }
};

let getAmountOut$1 = (blockchain, exchange, { path, pools, amountIn }) => {
  return pools[pools.length-1].amountOut
};

let getAmountIn$1 = async (blockchain, exchange, { path, pools, amountOut, block }) => {
  if(block === undefined) {
    return pools[0].amountIn
  } else {
    
    let path;
    if(pools.length == 2) {
      path = ethers.utils.solidityPack(["address","uint24","address","uint24","address"],[
        pools[1].path[1], pools[1].fee, pools[0].path[1], pools[0].fee, pools[0].path[0]
      ]);
    } else if(pools.length == 1) { 
      path = ethers.utils.solidityPack(["address","uint24","address"],[
        pools[0].path[1], pools[0].fee, pools[0].path[0]
      ]);
    }

    const data = await request({
      block,
      blockchain,
      address: exchange[blockchain].quoter.address,
      api: exchange[blockchain].quoter.api,
      method: 'quoteExactOutput',
      params: { path, amountOut },
    });

    return data.amountIn
  }
};

let getAmounts$1 = async (blockchain, exchange, {
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
    amountIn = await getAmountIn$1(blockchain, exchange, { block, path, pools, amountOut, tokenIn, tokenOut });
    if (amountIn == undefined || amountInMax && amountIn.gt(amountInMax)) {
      return {}
    } else if (amountInMax === undefined) {
      amountInMax = amountIn;
    }
  } else if (amountIn) {
    amountOut = await getAmountOut$1(blockchain, exchange, { path, pools, amountIn, tokenIn, tokenOut });
    if (amountOut == undefined || amountOutMin && amountOut.lt(amountOutMin)) {
      return {}
    } else if (amountOutMin === undefined) {
      amountOutMin = amountOut;
    }
  } else if(amountOutMin) {
    amountIn = await getAmountIn$1(blockchain, exchange, { block, path, pools, amountOut: amountOutMin, tokenIn, tokenOut });
    if (amountIn == undefined || amountInMax && amountIn.gt(amountInMax)) {
      return {}
    } else if (amountInMax === undefined) {
      amountInMax = amountIn;
    }
  } else if(amountInMax) {
    amountOut = await getAmountOut$1(blockchain, exchange, { path, pools, amountIn: amountInMax, tokenIn, tokenOut });
    if (amountOut == undefined ||amountOutMin && amountOut.lt(amountOutMin)) {
      return {}
    } else if (amountOutMin === undefined) {
      amountOutMin = amountOut;
    }
  }
  return { amountOut, amountIn, amountInMax, amountOutMin }
};

let getTransaction$1 = async({
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

  let commands = [];
  let inputs = [];
  let value = "0";

  if (path[0] === Blockchains[blockchain].currency.address) {
    commands.push("0x0b"); // WRAP_ETH
    inputs.push(
      ethers.utils.solidityPack(
        ["address", "uint256"],
        [fromAddress, (amountIn || amountInMax).toString()]
      )
    );
    value = (amountIn || amountInMax).toString();
  }

  let packedPath;
  if(pools.length === 1) {
    packedPath = ethers.utils.solidityPack(["address","uint24","address"], [pools[0].path[0], pools[0].fee, pools[0].path[1]]);
  } else if(pools.length === 2) {
    packedPath = ethers.utils.solidityPack(["address","uint24","address","uint24","address"], [pools[0].path[0], pools[0].fee, pools[0].path[1], pools[1].fee, pools[1].path[1]]);
  }

  if (amountOutMinInput || amountInInput) {
    commands.push("0x00"); // V3_SWAP_EXACT_IN (minimum out)
    inputs.push(
      ethers.utils.solidityPack(
        ["address", "uint256", "uint256", "bytes", "bool"],
        [
          fromAddress,
          (amountIn || amountInMax).toString(),
          (amountOut || amountOutMin).toString(),
          packedPath,
          true
        ]
      )
    );
  } else {
    commands.push("0x01"); // V3_SWAP_EXACT_OUT (maximum in)
    inputs.push(
      ethers.utils.solidityPack(
        ["address", "uint256", "uint256", "bytes", "bool"],
        [
          fromAddress,
          (amountOut || amountOutMin).toString(),
          (amountIn || amountInMax).toString(),
          packedPath,
          true
        ]
      )
    );
  }

  if (path[path.length-1] === Blockchains[blockchain].currency.address) {
    commands.push("0x0c"); // UNWRAP_WETH
    inputs.push(
      ethers.utils.solidityPack(
        ["address", "uint256"],
        [fromAddress, (amountOut || amountOutMin).toString()]
      )
    );
  }

  const transaction = {
    blockchain,
    from: fromAddress,
    to: exchange[blockchain].router.address,
    api: exchange[blockchain].router.api,
    method: 'execute',
    params: { commands, inputs },
    value
  };

  return transaction
};

const ROUTER = [{"inputs":[{"components":[{"internalType":"address","name":"permit2","type":"address"},{"internalType":"address","name":"weth9","type":"address"},{"internalType":"address","name":"seaportV1_5","type":"address"},{"internalType":"address","name":"seaportV1_4","type":"address"},{"internalType":"address","name":"openseaConduit","type":"address"},{"internalType":"address","name":"nftxZap","type":"address"},{"internalType":"address","name":"x2y2","type":"address"},{"internalType":"address","name":"foundation","type":"address"},{"internalType":"address","name":"sudoswap","type":"address"},{"internalType":"address","name":"elementMarket","type":"address"},{"internalType":"address","name":"nft20Zap","type":"address"},{"internalType":"address","name":"cryptopunks","type":"address"},{"internalType":"address","name":"looksRareV2","type":"address"},{"internalType":"address","name":"routerRewardsDistributor","type":"address"},{"internalType":"address","name":"looksRareRewardsDistributor","type":"address"},{"internalType":"address","name":"looksRareToken","type":"address"},{"internalType":"address","name":"v2Factory","type":"address"},{"internalType":"address","name":"v3Factory","type":"address"},{"internalType":"bytes32","name":"pairInitCodeHash","type":"bytes32"},{"internalType":"bytes32","name":"poolInitCodeHash","type":"bytes32"}],"internalType":"struct RouterParameters","name":"params","type":"tuple"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"BalanceTooLow","type":"error"},{"inputs":[],"name":"BuyPunkFailed","type":"error"},{"inputs":[],"name":"ContractLocked","type":"error"},{"inputs":[],"name":"ETHNotAccepted","type":"error"},{"inputs":[{"internalType":"uint256","name":"commandIndex","type":"uint256"},{"internalType":"bytes","name":"message","type":"bytes"}],"name":"ExecutionFailed","type":"error"},{"inputs":[],"name":"FromAddressIsNotOwner","type":"error"},{"inputs":[],"name":"InsufficientETH","type":"error"},{"inputs":[],"name":"InsufficientToken","type":"error"},{"inputs":[],"name":"InvalidBips","type":"error"},{"inputs":[{"internalType":"uint256","name":"commandType","type":"uint256"}],"name":"InvalidCommandType","type":"error"},{"inputs":[],"name":"InvalidOwnerERC1155","type":"error"},{"inputs":[],"name":"InvalidOwnerERC721","type":"error"},{"inputs":[],"name":"InvalidPath","type":"error"},{"inputs":[],"name":"InvalidReserves","type":"error"},{"inputs":[],"name":"InvalidSpender","type":"error"},{"inputs":[],"name":"LengthMismatch","type":"error"},{"inputs":[],"name":"SliceOutOfBounds","type":"error"},{"inputs":[],"name":"TransactionDeadlinePassed","type":"error"},{"inputs":[],"name":"UnableToClaim","type":"error"},{"inputs":[],"name":"UnsafeCast","type":"error"},{"inputs":[],"name":"V2InvalidPath","type":"error"},{"inputs":[],"name":"V2TooLittleReceived","type":"error"},{"inputs":[],"name":"V2TooMuchRequested","type":"error"},{"inputs":[],"name":"V3InvalidAmountOut","type":"error"},{"inputs":[],"name":"V3InvalidCaller","type":"error"},{"inputs":[],"name":"V3InvalidSwap","type":"error"},{"inputs":[],"name":"V3TooLittleReceived","type":"error"},{"inputs":[],"name":"V3TooMuchRequested","type":"error"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"RewardsSent","type":"event"},{"inputs":[{"internalType":"bytes","name":"looksRareClaim","type":"bytes"}],"name":"collectRewards","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes","name":"commands","type":"bytes"},{"internalType":"bytes[]","name":"inputs","type":"bytes[]"}],"name":"execute","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"bytes","name":"commands","type":"bytes"},{"internalType":"bytes[]","name":"inputs","type":"bytes[]"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"execute","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"},{"internalType":"uint256[]","name":"","type":"uint256[]"},{"internalType":"uint256[]","name":"","type":"uint256[]"},{"internalType":"bytes","name":"","type":"bytes"}],"name":"onERC1155BatchReceived","outputs":[{"internalType":"bytes4","name":"","type":"bytes4"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"},{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"bytes","name":"","type":"bytes"}],"name":"onERC1155Received","outputs":[{"internalType":"bytes4","name":"","type":"bytes4"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"},{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"bytes","name":"","type":"bytes"}],"name":"onERC721Received","outputs":[{"internalType":"bytes4","name":"","type":"bytes4"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"bytes4","name":"interfaceId","type":"bytes4"}],"name":"supportsInterface","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"int256","name":"amount0Delta","type":"int256"},{"internalType":"int256","name":"amount1Delta","type":"int256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"uniswapV3SwapCallback","outputs":[],"stateMutability":"nonpayable","type":"function"},{"stateMutability":"payable","type":"receive"}];
const FACTORY = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint24","name":"fee","type":"uint24"},{"indexed":true,"internalType":"int24","name":"tickSpacing","type":"int24"}],"name":"FeeAmountEnabled","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"oldOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnerChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token0","type":"address"},{"indexed":true,"internalType":"address","name":"token1","type":"address"},{"indexed":true,"internalType":"uint24","name":"fee","type":"uint24"},{"indexed":false,"internalType":"int24","name":"tickSpacing","type":"int24"},{"indexed":false,"internalType":"address","name":"pool","type":"address"}],"name":"PoolCreated","type":"event"},{"inputs":[{"internalType":"address","name":"tokenA","type":"address"},{"internalType":"address","name":"tokenB","type":"address"},{"internalType":"uint24","name":"fee","type":"uint24"}],"name":"createPool","outputs":[{"internalType":"address","name":"pool","type":"address"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint24","name":"fee","type":"uint24"},{"internalType":"int24","name":"tickSpacing","type":"int24"}],"name":"enableFeeAmount","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint24","name":"","type":"uint24"}],"name":"feeAmountTickSpacing","outputs":[{"internalType":"int24","name":"","type":"int24"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"},{"internalType":"uint24","name":"","type":"uint24"}],"name":"getPool","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"parameters","outputs":[{"internalType":"address","name":"factory","type":"address"},{"internalType":"address","name":"token0","type":"address"},{"internalType":"address","name":"token1","type":"address"},{"internalType":"uint24","name":"fee","type":"uint24"},{"internalType":"int24","name":"tickSpacing","type":"int24"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_owner","type":"address"}],"name":"setOwner","outputs":[],"stateMutability":"nonpayable","type":"function"}];
const POOL = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"int24","name":"tickLower","type":"int24"},{"indexed":true,"internalType":"int24","name":"tickUpper","type":"int24"},{"indexed":false,"internalType":"uint128","name":"amount","type":"uint128"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"}],"name":"Burn","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":false,"internalType":"address","name":"recipient","type":"address"},{"indexed":true,"internalType":"int24","name":"tickLower","type":"int24"},{"indexed":true,"internalType":"int24","name":"tickUpper","type":"int24"},{"indexed":false,"internalType":"uint128","name":"amount0","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"amount1","type":"uint128"}],"name":"Collect","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"recipient","type":"address"},{"indexed":false,"internalType":"uint128","name":"amount0","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"amount1","type":"uint128"}],"name":"CollectProtocol","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"recipient","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"paid0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"paid1","type":"uint256"}],"name":"Flash","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint16","name":"observationCardinalityNextOld","type":"uint16"},{"indexed":false,"internalType":"uint16","name":"observationCardinalityNextNew","type":"uint16"}],"name":"IncreaseObservationCardinalityNext","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"},{"indexed":false,"internalType":"int24","name":"tick","type":"int24"}],"name":"Initialize","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"int24","name":"tickLower","type":"int24"},{"indexed":true,"internalType":"int24","name":"tickUpper","type":"int24"},{"indexed":false,"internalType":"uint128","name":"amount","type":"uint128"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"}],"name":"Mint","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint8","name":"feeProtocol0Old","type":"uint8"},{"indexed":false,"internalType":"uint8","name":"feeProtocol1Old","type":"uint8"},{"indexed":false,"internalType":"uint8","name":"feeProtocol0New","type":"uint8"},{"indexed":false,"internalType":"uint8","name":"feeProtocol1New","type":"uint8"}],"name":"SetFeeProtocol","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"recipient","type":"address"},{"indexed":false,"internalType":"int256","name":"amount0","type":"int256"},{"indexed":false,"internalType":"int256","name":"amount1","type":"int256"},{"indexed":false,"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"},{"indexed":false,"internalType":"uint128","name":"liquidity","type":"uint128"},{"indexed":false,"internalType":"int24","name":"tick","type":"int24"}],"name":"Swap","type":"event"},{"inputs":[{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint128","name":"amount","type":"uint128"}],"name":"burn","outputs":[{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint128","name":"amount0Requested","type":"uint128"},{"internalType":"uint128","name":"amount1Requested","type":"uint128"}],"name":"collect","outputs":[{"internalType":"uint128","name":"amount0","type":"uint128"},{"internalType":"uint128","name":"amount1","type":"uint128"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint128","name":"amount0Requested","type":"uint128"},{"internalType":"uint128","name":"amount1Requested","type":"uint128"}],"name":"collectProtocol","outputs":[{"internalType":"uint128","name":"amount0","type":"uint128"},{"internalType":"uint128","name":"amount1","type":"uint128"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"factory","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"fee","outputs":[{"internalType":"uint24","name":"","type":"uint24"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"feeGrowthGlobal0X128","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"feeGrowthGlobal1X128","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"flash","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint16","name":"observationCardinalityNext","type":"uint16"}],"name":"increaseObservationCardinalityNext","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"}],"name":"initialize","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"liquidity","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"maxLiquidityPerTick","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint128","name":"amount","type":"uint128"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"mint","outputs":[{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"observations","outputs":[{"internalType":"uint32","name":"blockTimestamp","type":"uint32"},{"internalType":"int56","name":"tickCumulative","type":"int56"},{"internalType":"uint160","name":"secondsPerLiquidityCumulativeX128","type":"uint160"},{"internalType":"bool","name":"initialized","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint32[]","name":"secondsAgos","type":"uint32[]"}],"name":"observe","outputs":[{"internalType":"int56[]","name":"tickCumulatives","type":"int56[]"},{"internalType":"uint160[]","name":"secondsPerLiquidityCumulativeX128s","type":"uint160[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"name":"positions","outputs":[{"internalType":"uint128","name":"liquidity","type":"uint128"},{"internalType":"uint256","name":"feeGrowthInside0LastX128","type":"uint256"},{"internalType":"uint256","name":"feeGrowthInside1LastX128","type":"uint256"},{"internalType":"uint128","name":"tokensOwed0","type":"uint128"},{"internalType":"uint128","name":"tokensOwed1","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"protocolFees","outputs":[{"internalType":"uint128","name":"token0","type":"uint128"},{"internalType":"uint128","name":"token1","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint8","name":"feeProtocol0","type":"uint8"},{"internalType":"uint8","name":"feeProtocol1","type":"uint8"}],"name":"setFeeProtocol","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"slot0","outputs":[{"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"},{"internalType":"int24","name":"tick","type":"int24"},{"internalType":"uint16","name":"observationIndex","type":"uint16"},{"internalType":"uint16","name":"observationCardinality","type":"uint16"},{"internalType":"uint16","name":"observationCardinalityNext","type":"uint16"},{"internalType":"uint8","name":"feeProtocol","type":"uint8"},{"internalType":"bool","name":"unlocked","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"}],"name":"snapshotCumulativesInside","outputs":[{"internalType":"int56","name":"tickCumulativeInside","type":"int56"},{"internalType":"uint160","name":"secondsPerLiquidityInsideX128","type":"uint160"},{"internalType":"uint32","name":"secondsInside","type":"uint32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"bool","name":"zeroForOne","type":"bool"},{"internalType":"int256","name":"amountSpecified","type":"int256"},{"internalType":"uint160","name":"sqrtPriceLimitX96","type":"uint160"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"swap","outputs":[{"internalType":"int256","name":"amount0","type":"int256"},{"internalType":"int256","name":"amount1","type":"int256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"int16","name":"","type":"int16"}],"name":"tickBitmap","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"tickSpacing","outputs":[{"internalType":"int24","name":"","type":"int24"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"int24","name":"","type":"int24"}],"name":"ticks","outputs":[{"internalType":"uint128","name":"liquidityGross","type":"uint128"},{"internalType":"int128","name":"liquidityNet","type":"int128"},{"internalType":"uint256","name":"feeGrowthOutside0X128","type":"uint256"},{"internalType":"uint256","name":"feeGrowthOutside1X128","type":"uint256"},{"internalType":"int56","name":"tickCumulativeOutside","type":"int56"},{"internalType":"uint160","name":"secondsPerLiquidityOutsideX128","type":"uint160"},{"internalType":"uint32","name":"secondsOutside","type":"uint32"},{"internalType":"bool","name":"initialized","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"token0","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"token1","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}];
const QUOTER = [{"inputs":[{"internalType":"address","name":"_factory","type":"address"},{"internalType":"address","name":"_WETH9","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"WETH9","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"factory","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes","name":"path","type":"bytes"},{"internalType":"uint256","name":"amountIn","type":"uint256"}],"name":"quoteExactInput","outputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"},{"internalType":"uint160[]","name":"sqrtPriceX96AfterList","type":"uint160[]"},{"internalType":"uint32[]","name":"initializedTicksCrossedList","type":"uint32[]"},{"internalType":"uint256","name":"gasEstimate","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"tokenIn","type":"address"},{"internalType":"address","name":"tokenOut","type":"address"},{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint24","name":"fee","type":"uint24"},{"internalType":"uint160","name":"sqrtPriceLimitX96","type":"uint160"}],"internalType":"struct IQuoterV2.QuoteExactInputSingleParams","name":"params","type":"tuple"}],"name":"quoteExactInputSingle","outputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"},{"internalType":"uint160","name":"sqrtPriceX96After","type":"uint160"},{"internalType":"uint32","name":"initializedTicksCrossed","type":"uint32"},{"internalType":"uint256","name":"gasEstimate","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes","name":"path","type":"bytes"},{"internalType":"uint256","name":"amountOut","type":"uint256"}],"name":"quoteExactOutput","outputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint160[]","name":"sqrtPriceX96AfterList","type":"uint160[]"},{"internalType":"uint32[]","name":"initializedTicksCrossedList","type":"uint32[]"},{"internalType":"uint256","name":"gasEstimate","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"tokenIn","type":"address"},{"internalType":"address","name":"tokenOut","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint24","name":"fee","type":"uint24"},{"internalType":"uint160","name":"sqrtPriceLimitX96","type":"uint160"}],"internalType":"struct IQuoterV2.QuoteExactOutputSingleParams","name":"params","type":"tuple"}],"name":"quoteExactOutputSingle","outputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint160","name":"sqrtPriceX96After","type":"uint160"},{"internalType":"uint32","name":"initializedTicksCrossed","type":"uint32"},{"internalType":"uint256","name":"gasEstimate","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"int256","name":"amount0Delta","type":"int256"},{"internalType":"int256","name":"amount1Delta","type":"int256"},{"internalType":"bytes","name":"path","type":"bytes"}],"name":"uniswapV3SwapCallback","outputs":[],"stateMutability":"view","type":"function"}];

var UniswapV3 = {
  findPath: findPath$1,
  pathExists: pathExists$1,
  getAmounts: getAmounts$1,
  getTransaction: getTransaction$1,
  ROUTER,
  FACTORY,
  POOL,
  QUOTER,
};

const exchange$8 = {

  blockchains: ['ethereum', 'bsc', 'polygon', 'optimism', 'arbitrum'],
  name: 'uniswap_v3',
  alternativeNames: [],
  label: 'Uniswap v3',
  logo: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGRhdGEtdGVzdGlkPSJ1bmlzd2FwLWxvZ28iIGNsYXNzPSJyZ3c2ZXo0NHAgcmd3NmV6NGVqIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNMjAuMzUyNiAxOS45MjQyQzIwLjI5MjggMjAuMTU0OSAyMC4xODg1IDIwLjM3MTUgMjAuMDQ1NSAyMC41NjE4QzE5Ljc3OTMgMjAuOTA4OCAxOS40MjcgMjEuMTc5NCAxOS4wMjM5IDIxLjM0NjZDMTguNjYxNCAyMS41MDM1IDE4LjI3NzQgMjEuNjA1IDE3Ljg4NDkgMjEuNjQ3NUMxNy44MDQyIDIxLjY1NzggMTcuNzIwNiAyMS42NjQxIDE3LjYzOTUgMjEuNjcwM0wxNy42MjYzIDIxLjY3MTNDMTcuMzc3NyAyMS42ODA4IDE3LjEzODcgMjEuNzcgMTYuOTQ0MiAyMS45MjU4QzE2Ljc0OTcgMjIuMDgxNyAxNi42MSAyMi4yOTYgMTYuNTQ1NSAyMi41MzczQzE2LjUxNiAyMi42NTc0IDE2LjQ5NCAyMi43NzkyIDE2LjQ3OTggMjIuOTAyMUMxNi40NTcyIDIzLjA4NzQgMTYuNDQ1NiAyMy4yNzcxIDE2LjQzMyAyMy40ODIzQzE2LjQyNCAyMy42Mjk1IDE2LjQxNDQgMjMuNzg0OCAxNi40IDIzLjk1MjFDMTYuMzE1NiAyNC42MzM3IDE2LjExOTMgMjUuMjk2NSAxNS44MTkyIDI1LjkxMzZDMTUuNzU3OSAyNi4wNDMzIDE1LjY5NTQgMjYuMTY5MSAxNS42MzM5IDI2LjI5MjZDMTUuMzA0OSAyNi45NTQ2IDE1LjAwNzYgMjcuNTUyNiAxNS4wOTI5IDI4LjM1MzVDMTUuMTU5NyAyOC45NzA2IDE1LjQ3NDQgMjkuMzg0MSAxNS44OTI1IDI5LjgxMDZDMTYuMDkxMSAzMC4wMTQ2IDE2LjM1NDQgMzAuMTg4OSAxNi42Mjc3IDMwLjM2OTlDMTcuMzkyNyAzMC44NzYzIDE4LjIzNjEgMzEuNDM0NyAxNy45NTgyIDMyLjg0MTVDMTcuNzMwOCAzMy45ODE0IDE1Ljg0OTQgMzUuMTc3NiAxMy4yMDUgMzUuNTk1NEMxMy40NjE1IDM1LjU1NjMgMTIuODk2NSAzNC41ODc5IDEyLjgzMzggMzQuNDgwNEwxMi44MyAzNC40NzM5QzEyLjc1NzEgMzQuMzU5MiAxMi42ODI0IDM0LjI0NjIgMTIuNjA3OSAzNC4xMzM0TDEyLjYwNzkgMzQuMTMzNEwxMi42MDc4IDM0LjEzMzRDMTIuMzkyNiAzMy44MDc2IDEyLjE3ODMgMzMuNDgzNSAxMi4wMTExIDMzLjEyNDFDMTEuNTY5MyAzMi4xODU2IDExLjM2NDUgMzEuMDk5OCAxMS41NDU1IDMwLjA3MTRDMTEuNzA5NSAyOS4xNDA3IDEyLjMyMjEgMjguMzk3MiAxMi45MTE4IDI3LjY4MTNMMTIuOTExOCAyNy42ODEzQzEzLjAwOCAyNy41NjQ2IDEzLjEwMzUgMjcuNDQ4NyAxMy4xOTY0IDI3LjMzMjhDMTMuOTg1MiAyNi4zNDg4IDE0LjgxMjggMjUuMDU5NSAxNC45OTU5IDIzLjc4MjJDMTUuMDExNCAyMy42NzEyIDE1LjAyNTIgMjMuNTUwMiAxNS4wMzk3IDIzLjQyMjlMMTUuMDM5NyAyMy40MjI5TDE1LjAzOTcgMjMuNDIyOUMxNS4wNjU3IDIzLjE5NSAxNS4wOTM5IDIyLjk0NjkgMTUuMTM4MiAyMi42OTk3QzE1LjIwMzkgMjIuMjcyOCAxNS4zMzcxIDIxLjg1OTEgMTUuNTMyNiAyMS40NzQzQzE1LjY2NiAyMS4yMjIgMTUuODQxNyAyMC45OTQ2IDE2LjA1MiAyMC44MDIxQzE2LjE2MTYgMjAuNjk5OSAxNi4yMzM5IDIwLjU2MzcgMTYuMjU3NCAyMC40MTUzQzE2LjI4MDggMjAuMjY3IDE2LjI1NCAyMC4xMTUgMTYuMTgxMyAxOS45ODM3TDExLjk2NTggMTIuMzY3M0wxOC4wMjA3IDE5Ljg3MzNDMTguMDg5NyAxOS45NjAzIDE4LjE3NjggMjAuMDMxIDE4LjI3NiAyMC4wODAzQzE4LjM3NTIgMjAuMTI5NiAxOC40ODQgMjAuMTU2NCAxOC41OTQ2IDIwLjE1ODhDMTguNzA1MyAyMC4xNjEyIDE4LjgxNTEgMjAuMTM5MSAxOC45MTYzIDIwLjA5NEMxOS4wMTc1IDIwLjA0OSAxOS4xMDc2IDE5Ljk4MjEgMTkuMTgwMiAxOS44OTgyQzE5LjI1NjkgMTkuODA4NCAxOS4zMDA0IDE5LjY5NDcgMTkuMzAzMyAxOS41NzYzQzE5LjMwNjMgMTkuNDU4IDE5LjI2ODUgMTkuMzQyMyAxOS4xOTYzIDE5LjI0ODdDMTguOTE0OCAxOC44ODczIDE4LjYyMTggMTguNTIxIDE4LjMzMDIgMTguMTU2M0wxOC4zMyAxOC4xNTZDMTguMjEyIDE4LjAwODUgMTguMDk0MyAxNy44NjEzIDE3Ljk3NzYgMTcuNzE0OEwxNi40NTM5IDE1LjgyMDVMMTMuMzk1NyAxMi4wMzgyTDEwIDhMMTMuNzg4IDExLjY5OTRMMTcuMDQzMyAxNS4zMTQ5TDE4LjY2NzMgMTcuMTI3QzE4LjgxNjUgMTcuMjk1OCAxOC45NjU3IDE3LjQ2MzEgMTkuMTE0OCAxNy42MzAzQzE5LjUwNDQgMTguMDY3MSAxOS44OTQgMTguNTAzOSAyMC4yODM2IDE4Ljk2NzNMMjAuMzcyIDE5LjA3NTVMMjAuMzkxNCAxOS4yNDMzQzIwLjQxNzYgMTkuNDcwOCAyMC40MDQ1IDE5LjcwMTIgMjAuMzUyNiAxOS45MjQyWk0zNS45MjQ3IDIyLjQ2OTdMMzUuOTMxMSAyMi40Nzk1QzM1LjkzIDIxLjY3MTkgMzUuNDMyMiAyMC4zMzk0IDM0LjQyNDcgMTkuMDU3N0wzNC40MDEgMTkuMDI2M0MzNC4wOTA2IDE4LjY0MSAzMy43NTI0IDE4LjI3OTIgMzMuMzg5MSAxNy45NDM4QzMzLjMyMTIgMTcuODc3OCAzMy4yNDggMTcuODEyOCAzMy4xNzM2IDE3Ljc0NzlDMzIuNzA4MSAxNy4zNDAxIDMyLjE5OTMgMTYuOTg1IDMxLjY1NjQgMTYuNjg5MkwzMS42MTc2IDE2LjY2OTdDMjkuOTExOCAxNS43MzY2IDI3LjY5MiAxNS4yNTYgMjQuOTU0OSAxNS43OTcyQzI0LjU4NzMgMTUuMzQ4OSAyNC4xOTE0IDE0LjkyNDggMjMuNzY5NiAxNC41Mjc1QzIzLjEyMzYgMTMuOTA5MSAyMi4zNjMyIDEzLjQyNDEgMjEuNTMxNSAxMy4wOTk3QzIwLjcwNzIgMTIuNzk2NiAxOS44MjQ0IDEyLjY4ODQgMTguOTUxNyAxMi43ODM2QzE5Ljc5MjkgMTIuODU5NyAyMC42MTIzIDEzLjA5NDcgMjEuMzY2NiAxMy40NzY0QzIyLjA5NTEgMTMuODY4NSAyMi43NTEyIDE0LjM4MzMgMjMuMzA2MiAxNC45OTg0QzIzLjg2ODggMTUuNjI2MyAyNC4zOTc2IDE2LjI4MzkgMjQuODkwMyAxNi45Njg1TDI1LjAxMzkgMTcuMTMwMkMyNS40OTYgMTcuNzYwOSAyNS45ODY4IDE4LjQwMyAyNi41OTgyIDE4Ljk3NDRDMjYuOTM0OCAxOS4yOTI1IDI3LjMxMDMgMTkuNTY2NCAyNy43MTU3IDE5Ljc4OTVDMjcuODIzNCAxOS44NDQ3IDI3LjkzMjMgMTkuODk2NiAyOC4wMzkgMTkuOTQyMUMyOC4xNDU2IDE5Ljk4NzYgMjguMjQ1OCAyMC4wMjk4IDI4LjM1MzYgMjAuMDY4OEMyOC41NjE2IDIwLjE0OTkgMjguNzc3MSAyMC4yMTcxIDI4Ljk5MjYgMjAuMjc4OEMyOS44NTQ3IDIwLjUyNTYgMzAuNzM3MiAyMC42MTQzIDMxLjU5OTMgMjAuNjYyQzMxLjcxOTIgMjAuNjY4MyAzMS44Mzg5IDIwLjY3NDIgMzEuOTU4MSAyMC42ODAxTDMxLjk1ODMgMjAuNjgwMUMzMi4yNjYyIDIwLjY5NTQgMzIuNTcxMyAyMC43MTA1IDMyLjg3MTkgMjAuNzMyM0MzMy4yODM3IDIwLjc1NjkgMzMuNjkyMiAyMC44MjE0IDM0LjA5MTcgMjAuOTI1QzM0LjY5MTggMjEuMDgyMiAzNS4yMjAxIDIxLjQ0MTMgMzUuNTg4NSAyMS45NDI1QzM1LjcxMzcgMjIuMTA5NSAzNS44MjYxIDIyLjI4NTcgMzUuOTI0NyAyMi40Njk3Wk0zMy40MDEzIDE3Ljk0NTFDMzMuMzU4IDE3LjkwNDkgMzMuMzEzOSAxNy44NjUxIDMzLjI3IDE3LjgyNTRMMzMuMjcgMTcuODI1NEMzMy4yNDE4IDE3Ljc5OTkgMzMuMjEzNiAxNy43NzQ1IDMzLjE4NTggMTcuNzQ5MUMzMy4yMDczIDE3Ljc2ODggMzMuMjI4OCAxNy43ODg3IDMzLjI1MDMgMTcuODA4N0MzMy4zMDA5IDE3Ljg1NTYgMzMuMzUxNCAxNy45MDI1IDMzLjQwMTMgMTcuOTQ1MVpNMzIuMzIzOCAyNS45MTcyQzI5LjU1MTYgMjQuNzg3MiAyNi42NTE4IDIzLjYwNTEgMjcuMDgzNSAyMC4yODc1QzI4LjAwOTEgMjEuMjgwMiAyOS40NjIgMjEuNDg4NCAzMS4wNDIyIDIxLjcxNDlDMzIuNDc1NyAyMS45MjAzIDM0LjAxMzkgMjIuMTQwNyAzNS4zNTgzIDIyLjk3NTNDMzguNTMwNiAyNC45NDMzIDM4LjA2NzMgMjguNzY2NiAzNi45ODk3IDMwLjE3MzlDMzcuMDg2OSAyNy44NTg3IDM0Ljc1NDQgMjYuOTA4IDMyLjMyMzggMjUuOTE3MlpNMjEuMTU1MSAyNC4yNTY3QzIxLjg4NjggMjQuMTg2MyAyMy40NDYxIDIzLjgwNDIgMjIuNzQ4OSAyMi41NzEyQzIyLjU5ODkgMjIuMzIwNCAyMi4zODE1IDIyLjExNzIgMjIuMTIxNyAyMS45ODQ4QzIxLjg2MTkgMjEuODUyNSAyMS41NzAyIDIxLjc5NjUgMjEuMjgwMSAyMS44MjMyQzIwLjk4NTggMjEuODU1IDIwLjcwODIgMjEuOTc2OSAyMC40ODUyIDIyLjE3MjVDMjAuMjYyMiAyMi4zNjgxIDIwLjEwNDQgMjIuNjI3OCAyMC4wMzM0IDIyLjkxNjVDMTkuODE2OCAyMy43MjMgMjAuMDQ2MyAyNC4zNjQ5IDIxLjE1NTEgMjQuMjU2N1pNMjAuOTQ0OCAxNC41MDE0QzIwLjQ4NTggMTMuOTY4OCAxOS43NzM1IDEzLjY4OTUgMTkuMDc1MiAxMy41ODc4QzE5LjA0OTEgMTMuNzYyNSAxOS4wMzI2IDEzLjkzODUgMTkuMDI1NyAxNC4xMTVDMTguOTk0NCAxNS41Njg3IDE5LjUwODQgMTcuMTY1NCAyMC41MDMgMTguMjc1QzIwLjgyMTIgMTguNjMzNyAyMS4yMDQ5IDE4LjkyNzYgMjEuNjMzNCAxOS4xNDFDMjEuODgxMiAxOS4yNjIyIDIyLjUzODYgMTkuNTYzMSAyMi43ODIxIDE5LjI5MjVDMjIuODAwNiAxOS4yNjc3IDIyLjgxMjMgMTkuMjM4NCAyMi44MTU5IDE5LjIwNzZDMjIuODE5NSAxOS4xNzY4IDIyLjgxNDkgMTkuMTQ1NiAyMi44MDI2IDE5LjExNzJDMjIuNzYyMiAxOS4wMDEzIDIyLjY4NDMgMTguODk2MSAyMi42MDY5IDE4Ljc5MTdDMjIuNTUyIDE4LjcxNzcgMjIuNDk3NCAxOC42NDQxIDIyLjQ1NjcgMTguNTY3MkMyMi40MTU1IDE4LjQ4OTggMjIuMzcxNCAxOC40MTQyIDIyLjMyNzQgMTguMzM4OEwyMi4zMjc0IDE4LjMzODhDMjIuMjQ0NyAxOC4xOTcgMjIuMTYyMiAxOC4wNTU1IDIyLjA5ODkgMTcuOTAxNUMyMS45MzE5IDE3LjQ5ODQgMjEuODQ1IDE3LjA2OTggMjEuNzU4MyAxNi42NDI1TDIxLjc1ODMgMTYuNjQyNEwyMS43NTgzIDE2LjY0MjRMMjEuNzU4MyAxNi42NDIzTDIxLjc1ODIgMTYuNjQyMkwyMS43NTgyIDE2LjY0MjFMMjEuNzU4MiAxNi42NDJDMjEuNzQwOSAxNi41NTY2IDIxLjcyMzYgMTYuNDcxMiAyMS43MDU2IDE2LjM4NkMyMS41NzMxIDE1LjcyNjggMjEuNDAzOSAxNS4wMzQgMjAuOTQ0OCAxNC41MDE0Wk0zMC43NTI0IDI2LjA5OEMzMC4wNDAzIDI4LjA5NDMgMzEuMTg4OCAyOS43ODA0IDMyLjMzMDYgMzEuNDU2NkMzMy42MDc3IDMzLjMzMTUgMzQuODc2NCAzNS4xOTQgMzMuNTIyOCAzNy40NjQyQzM2LjE1MzIgMzYuMzczMSAzNy40MDIxIDMzLjA3NjkgMzYuMzEwNSAzMC40NjE2QzM1LjYyMjcgMjguODA3NCAzMy45NjQ5IDI3LjkxMDYgMzIuNDI2MSAyNy4wNzgzTDMyLjQyNjEgMjcuMDc4M0wzMi40MjYgMjcuMDc4MkMzMS44MjkgMjYuNzU1MyAzMS4yNDk5IDI2LjQ0MjEgMzAuNzUyNCAyNi4wOThaTTIzLjA1NTIgMzAuODYzM0MyMi41Nzg1IDMxLjA1ODcgMjIuMTI5IDMxLjMxNTIgMjEuNzE3OSAzMS42MjY1QzIyLjY1MjcgMzEuMjg1OSAyMy42MzM5IDMxLjA5MTQgMjQuNjI3NCAzMS4wNDk1QzI0LjgwNzQgMzEuMDM4OCAyNC45ODg3IDMxLjAzMDQgMjUuMTcxNSAzMS4wMjE5TDI1LjE3MTcgMzEuMDIxOUwyNS4xNzIgMzEuMDIxOUMyNS40ODc4IDMxLjAwNzMgMjUuODA4NSAzMC45OTI1IDI2LjEzNiAzMC45NjUxQzI2LjY3MjkgMzAuOTI4NSAyNy4yMDI1IDMwLjgxOTIgMjcuNzEwMyAzMC42NDAzQzI4LjI0MjUgMzAuNDUzMyAyOC43MjY4IDMwLjE1MDEgMjkuMTI4NCAyOS43NTI3QzI5LjUzNDIgMjkuMzQyNCAyOS44MTg4IDI4LjgyNzIgMjkuOTUwNiAyOC4yNjQyQzMwLjA2NjYgMjcuNzMyNCAzMC4wNTAzIDI3LjE4MDEgMjkuOTAzMiAyNi42NTYyQzI5Ljc1NiAyNi4xMzIyIDI5LjQ4MjUgMjUuNjUyOCAyOS4xMDY5IDI1LjI2MDNDMjkuMjg4MSAyNS43MjIxIDI5LjM5OTYgMjYuMjA4NCAyOS40Mzc3IDI2LjcwMzNDMjkuNDcwNSAyNy4xNjQgMjkuNDA4MSAyNy42MjY1IDI5LjI1NDUgMjguMDYxOEMyOS4xMDQ1IDI4LjQ3NDQgMjguODU5MyAyOC44NDU0IDI4LjUzOSAyOS4xNDQzQzI4LjIwODEgMjkuNDQ2MiAyNy44MjUgMjkuNjg0NiAyNy40MDg2IDI5Ljg0NzlDMjYuODI5OSAzMC4wODIxIDI2LjE3NTUgMzAuMTc3OSAyNS40OTM5IDMwLjI3NzdDMjUuMTgzIDMwLjMyMzIgMjQuODY2NCAzMC4zNjk2IDI0LjU0ODcgMzAuNDMwM0MyNC4wMzc4IDMwLjUyNDMgMjMuNTM3NCAzMC42Njk0IDIzLjA1NTIgMzAuODYzM1pNMzEuMzE4NyAzOS4xMDQ2TDMxLjI3MyAzOS4xNDE1TDMxLjI3MyAzOS4xNDE2QzMxLjE1MjUgMzkuMjM4OSAzMS4wMzAxIDM5LjMzNzkgMzAuODk4MiAzOS40MjY4QzMwLjczMDEgMzkuNTM4IDMwLjU1NCAzOS42MzY1IDMwLjM3MTMgMzkuNzIxMkMyOS45OTA4IDM5LjkwNzcgMjkuNTcyNiA0MC4wMDI5IDI5LjE0OTMgMzkuOTk5NEMyOC4wMDI4IDM5Ljk3NzggMjcuMTkyNCAzOS4xMjA1IDI2LjcxODMgMzguMTUxNkMyNi41OTQgMzcuODk3NyAyNi40ODQ1IDM3LjYzNTkgMjYuMzc1IDM3LjM3NDFMMjYuMzc1IDM3LjM3NDFDMjYuMTk5NyAzNi45NTUxIDI2LjAyNDQgMzYuNTM2MSAyNS43ODgzIDM2LjE0OUMyNS4yMzk5IDM1LjI0OTUgMjQuMzAxMyAzNC41MjUzIDIzLjIwMjIgMzQuNjU5NUMyMi43NTM5IDM0LjcxNTggMjIuMzMzNiAzNC45MTgyIDIyLjA4NDcgMzUuMzA5QzIxLjQyOTUgMzYuMzI5OCAyMi4zNzAzIDM3Ljc1OTggMjMuNTY5NiAzNy41NTczQzIzLjY3MTYgMzcuNTQxNyAyMy43NzE0IDM3LjUxNDEgMjMuODY3IDM3LjQ3NTFDMjMuOTYyMyAzNy40MzQzIDI0LjA1MTIgMzcuMzggMjQuMTMxIDM3LjMxMzhDMjQuMjk4NiAzNy4xNzM2IDI0LjQyNDggMzYuOTkwMyAyNC40OTYzIDM2Ljc4MzRDMjQuNTc1MSAzNi41Njc2IDI0LjU5MjYgMzYuMzM0MSAyNC41NDcgMzYuMTA5QzI0LjQ5NzggMzUuODczNiAyNC4zNTk0IDM1LjY2NjggMjQuMTYxMiAzNS41MzJDMjQuMzkxNyAzNS42NDA0IDI0LjU3MTMgMzUuODM0NSAyNC42NjIzIDM2LjA3MzJDMjQuNzU2NiAzNi4zMTkgMjQuNzgwOSAzNi41ODYyIDI0LjczMjMgMzYuODQ1MUMyNC42ODUyIDM3LjExNDcgMjQuNTY2OSAzNy4zNjY3IDI0LjM4OTYgMzcuNTc0N0MyNC4yOTU1IDM3LjY4MTYgMjQuMTg2NiAzNy43NzQ2IDI0LjA2NjQgMzcuODUwN0MyMy45NDcyIDM3LjkyNTkgMjMuODE5NSAzNy45ODY2IDIzLjY4NiAzOC4wMzE1QzIzLjQxNTMgMzguMTI0NCAyMy4xMjcyIDM4LjE1NDQgMjIuODQzMyAzOC4xMTkyQzIyLjQ0NDcgMzguMDYyMSAyMi4wNjg4IDM3Ljg5ODMgMjEuNzU1IDM3LjY0NUMyMS42OTcgMzcuNTk5IDIxLjY0MTQgMzcuNTUwOCAyMS41ODc1IDM3LjUwMDhDMjEuMzc0IDM3LjMxNTggMjEuMTgwMiAzNy4xMDg3IDIxLjAwOTMgMzYuODgyOUMyMC45MzI2IDM2Ljc5ODEgMjAuODU0NyAzNi43MTQ0IDIwLjc3MzMgMzYuNjM0QzIwLjM4OTEgMzYuMjI5IDE5LjkzNTggMzUuODk2NSAxOS40MzQ5IDM1LjY1MjJDMTkuMDg5NSAzNS40OTk4IDE4LjcyOCAzNS4zODcyIDE4LjM1NzQgMzUuMzE2NkMxOC4xNzA5IDM1LjI3NzYgMTcuOTgyNCAzNS4yNDk1IDE3Ljc5MzggMzUuMjI1N0MxNy43NzMzIDM1LjIyMzYgMTcuNzM0IDM1LjIxNjcgMTcuNjg1IDM1LjIwODJMMTcuNjg0NyAzNS4yMDgxTDE3LjY4NDYgMzUuMjA4MUwxNy42ODQ2IDM1LjIwODFMMTcuNjg0NiAzNS4yMDgxTDE3LjY4NDUgMzUuMjA4MUMxNy41MjcxIDM1LjE4MDYgMTcuMjcxMSAzNS4xMzYgMTcuMjI1OSAzNS4xNzhDMTcuODA4OCAzNC42MzkgMTguNDQ0MSAzNC4xNjAzIDE5LjEyMjQgMzMuNzQ5MUMxOS44MTg5IDMzLjMzNCAyMC41NjY3IDMzLjAxMjYgMjEuMzQ2NiAzMi43OTMzQzIyLjE1NTEgMzIuNTY0NyAyMy4wMDA5IDMyLjQ5OTUgMjMuODM0NyAzMi42MDE3QzI0LjI2MzkgMzIuNjUzNSAyNC42ODQzIDMyLjc2MjcgMjUuMDg0NyAzMi45MjY0QzI1LjUwNDIgMzMuMDk0OCAyNS44OTE0IDMzLjMzNTEgMjYuMjI5MSAzMy42MzY2QzI2LjU2MzIgMzMuOTUyOCAyNi44MzMzIDM0LjMzMTEgMjcuMDI0MyAzNC43NTA0QzI3LjE5NjggMzUuMTQzMSAyNy4zMjU0IDM1LjU1MzcgMjcuNDA3OSAzNS45NzQ3QzI3LjQ1MjEgMzYuMjAxMyAyNy40ODU1IDM2LjQ1MDIgMjcuNTE5OSAzNi43MDc5TDI3LjUyIDM2LjcwNzlMMjcuNTIgMzYuNzA4TDI3LjUyIDM2LjcwOEMyNy42NzcxIDM3Ljg4MjMgMjcuODU4NSAzOS4yMzcyIDI5LjIwNDMgMzkuNDczM0MyOS4yODk4IDM5LjQ5IDI5LjM3NjEgMzkuNTAyMyAyOS40NjI5IDM5LjUxMDJMMjkuNzMxMiAzOS41MTY2QzI5LjkxNTcgMzkuNTAzNCAzMC4wOTkgMzkuNDc3IDMwLjI3OTcgMzkuNDM3NkMzMC42NTQxIDM5LjM0OTIgMzEuMDE5IDM5LjIyNDEgMzEuMzY5MSAzOS4wNjQyTDMxLjMxODcgMzkuMTA0NlpNMjEuMDgwMSAzNi45NjE5QzIxLjExMjMgMzYuOTk4OSAyMS4xNDQ5IDM3LjAzNTUgMjEuMTc3OSAzNy4wNzE4QzIxLjE2NDQgMzcuMDU2NyAyMS4xNTEgMzcuMDQxNSAyMS4xMzc1IDM3LjAyNjRMMjEuMTM3NSAzNy4wMjY0TDIxLjEzNzUgMzcuMDI2NEwyMS4xMzc1IDM3LjAyNjRDMjEuMTE4NCAzNy4wMDQ5IDIxLjA5OTMgMzYuOTgzNCAyMS4wODAxIDM2Ljk2MTlaIiBmaWxsPSJjdXJyZW50Q29sb3IiPjwvcGF0aD48L3N2Zz4K',
  slippage: true,
  
  ethereum: {
    router: {
      address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad',
      api: UniswapV3.ROUTER
    },
    factory: {
      address: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      api: UniswapV3.FACTORY
    },
    pool: {
      api: UniswapV3.POOL
    },
    quoter: {
      address: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
      api: UniswapV3.QUOTER
    }
  },

  bsc: {
    router: {
      address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad',
      api: UniswapV3.ROUTER
    },
    factory: {
      address: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7',
      api: UniswapV3.FACTORY
    },
    pool: {
      api: UniswapV3.POOL
    },
    quoter: {
      address: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
      api: UniswapV3.QUOTER
    }
  },

  polygon: {
    router: {
      address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad',
      api: UniswapV3.ROUTER
    },
    factory: {
      address: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      api: UniswapV3.FACTORY
    },
    pool: {
      api: UniswapV3.POOL
    },
    quoter: {
      address: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
      api: UniswapV3.QUOTER
    }
  },

  optimism: {
    router: {
      address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad',
      api: UniswapV3.ROUTER
    },
    factory: {
      address: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      api: UniswapV3.FACTORY
    },
    pool: {
      api: UniswapV3.POOL
    },
    quoter: {
      address: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
      api: UniswapV3.QUOTER
    }
  },

  arbitrum: {
    router: {
      address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad',
      api: UniswapV3.ROUTER
    },
    factory: {
      address: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      api: UniswapV3.FACTORY
    },
    pool: {
      api: UniswapV3.POOL
    },
    quoter: {
      address: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
      api: UniswapV3.QUOTER
    }
  },

};

var uniswap_v3 = new Exchange(

  Object.assign(exchange$8, {
    findPath: ({ blockchain, tokenIn, tokenOut, amountIn, amountOut, amountInMax, amountOutMin })=>
      UniswapV3.findPath({ blockchain, exchange: exchange$8, tokenIn, tokenOut, amountIn, amountOut, amountInMax, amountOutMin }),
    pathExists: (blockchain, path)=>
      UniswapV3.pathExists(blockchain, exchange$8, path),
    getAmounts: ({ blockchain, path, pools, block, tokenIn, tokenOut, amountOut, amountIn, amountInMax, amountOutMin })=>
      UniswapV3.getAmounts(blockchain, exchange$8, { path, pools, block, tokenIn, tokenOut, amountOut, amountIn, amountInMax, amountOutMin }),
    getTransaction: (...args)=> UniswapV3.getTransaction(...args),
  })
);

let fixPath = (path) => path;

let pathExists = async (blockchain, path) => {
  if(fixPath(path).length <= 1) { return false }
  if(fixPath(path).length >= 3) { return false }
  return (
    path.includes(blockchain.currency.address) &&
    path.includes(blockchain.wrapped.address)
  )
};

let findPath = async (blockchain, { tokenIn, tokenOut }) => {
  if(
    ![tokenIn, tokenOut].includes(blockchain.currency.address) ||
    ![tokenIn, tokenOut].includes(blockchain.wrapped.address)
  ) { return { path: undefined, fixedPath: undefined } }

  let path = [tokenIn, tokenOut];

  return { path, fixedPath: path }
};

let getAmounts = async ({
  path,
  block,
  tokenIn,
  tokenOut,
  amountOut,
  amountIn,
  amountInMax,
  amountOutMin
}) => {

  if (amountOut) {
    amountIn = amountInMax = amountOutMin = amountOut;
  } else if (amountIn) {
    amountOut = amountInMax = amountOutMin = amountIn;
  } else if(amountOutMin) {
    amountIn = amountInMax = amountOut = amountOutMin;
  } else if(amountInMax) {
    amountOut = amountOutMin = amountIn = amountInMax;
  }

  return { amountOut, amountIn, amountInMax, amountOutMin }
};

let getTransaction = (blockchain, exchange, {
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
    blockchain: blockchain.name,
    from: fromAddress,
    to: exchange.wrapper.address,
    api: exchange.wrapper.api,
  };

  if (path[0] === blockchain.currency.address && path[1] === blockchain.wrapped.address) {
    transaction.method = 'deposit';
    transaction.value = amountIn.toString();
    return transaction
  } else if (path[0] === blockchain.wrapped.address && path[1] === blockchain.currency.address) {
    transaction.method = 'withdraw';
    transaction.value = 0;
    transaction.params = { wad: amountIn };
    return transaction
  }
};

const WETH = [{"constant":true,"inputs":[],"name":"name","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"guy","type":"address"},{"name":"wad","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"src","type":"address"},{"name":"dst","type":"address"},{"name":"wad","type":"uint256"}],"name":"transferFrom","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"wad","type":"uint256"}],"name":"withdraw","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"dst","type":"address"},{"name":"wad","type":"uint256"}],"name":"transfer","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"deposit","outputs":[],"payable":true,"stateMutability":"payable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"},{"name":"","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"payable":true,"stateMutability":"payable","type":"fallback"},{"anonymous":false,"inputs":[{"indexed":true,"name":"src","type":"address"},{"indexed":true,"name":"guy","type":"address"},{"indexed":false,"name":"wad","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"src","type":"address"},{"indexed":true,"name":"dst","type":"address"},{"indexed":false,"name":"wad","type":"uint256"}],"name":"Transfer","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"dst","type":"address"},{"indexed":false,"name":"wad","type":"uint256"}],"name":"Deposit","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"src","type":"address"},{"indexed":false,"name":"wad","type":"uint256"}],"name":"Withdrawal","type":"event"}];

var WETH$1 = {
  findPath,
  pathExists,
  getAmounts,
  getTransaction,
  WETH,
};

const blockchain$7 = Blockchains.avalanche;

const exchange$7 = {
  blockchain: 'avalanche',
  name: 'wavax',
  alternativeNames: [],
  label: 'Wrapped Avax',
  logo: blockchain$7.wrapped.logo,
  wrapper: {
    address: blockchain$7.wrapped.address,
    api: WETH$1.WETH
  },
  slippage: false,
};

var wavax = new Exchange(

  Object.assign(exchange$7, {
    findPath: ({ tokenIn, tokenOut })=>
      WETH$1.findPath(blockchain$7, { tokenIn, tokenOut }),
    pathExists: (path)=>
      WETH$1.pathExists(blockchain$7, path),
    getAmounts: WETH$1.getAmounts,
    getTransaction: ({ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress })=>
      WETH$1.getTransaction(blockchain$7, exchange$7 ,{ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress }),
  })
);

const blockchain$6 = Blockchains.bsc;

const exchange$6 = {
  blockchain: 'bsc',
  name: 'wbnb',
  alternativeNames: [],
  label: 'Wrapped BNB',
  logo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI2LjAuMSwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxOTIgMTkyIiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCAxOTIgMTkyOyIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+CjxzdHlsZSB0eXBlPSJ0ZXh0L2NzcyI+Cgkuc3Qwe2ZpbGw6I0YwQjkwQjt9Cjwvc3R5bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik01NCw0MS4xbDQyLTI0LjJsNDIsMjQuMmwtMTUuNCw4LjlMOTYsMzQuOUw2OS40LDUwTDU0LDQxLjF6IE0xMzgsNzEuN2wtMTUuNC04LjlMOTYsNzhMNjkuNCw2Mi43bC0xNS40LDl2MTgKCUw4MC42LDEwNXYzMC41bDE1LjQsOWwxNS40LTlWMTA1TDEzOCw4OS43VjcxLjd6IE0xMzgsMTIwLjN2LTE4bC0xNS40LDguOXYxOEMxMjIuNiwxMjkuMSwxMzgsMTIwLjMsMTM4LDEyMC4zeiBNMTQ4LjksMTI2LjQKCWwtMjYuNiwxNS4zdjE4bDQyLTI0LjJWODdsLTE1LjQsOUMxNDguOSw5NiwxNDguOSwxMjYuNCwxNDguOSwxMjYuNHogTTEzMy41LDU2LjRsMTUuNCw5djE4bDE1LjQtOXYtMThsLTE1LjQtOUwxMzMuNSw1Ni40CglMMTMzLjUsNTYuNHogTTgwLjYsMTQ4LjN2MThsMTUuNCw5bDE1LjQtOXYtMThMOTYsMTU3LjFMODAuNiwxNDguM3ogTTU0LDEyMC4zbDE1LjQsOXYtMTguMUw1NCwxMDIuM0w1NCwxMjAuM0w1NCwxMjAuM3oKCSBNODAuNiw1Ni40bDE1LjQsOWwxNS40LTlMOTYsNDcuNUM5Niw0Ny40LDgwLjYsNTYuNCw4MC42LDU2LjRMODAuNiw1Ni40eiBNNDMuMSw2NS40bDE1LjQtOWwtMTUuNC05bC0xNS40LDl2MThsMTUuNCw5TDQzLjEsNjUuNAoJTDQzLjEsNjUuNHogTTQzLjEsOTUuOUwyNy43LDg3djQ4LjVsNDIsMjQuMnYtMThsLTI2LjYtMTUuM1Y5NS45TDQzLjEsOTUuOXoiLz4KPC9zdmc+Cg==',
  wrapper: {
    address: blockchain$6.wrapped.address,
    api: WETH$1.WETH
  },
  slippage: false,
};

var wbnb = new Exchange(

  Object.assign(exchange$6, {
    findPath: ({ tokenIn, tokenOut })=>
      WETH$1.findPath(blockchain$6, { tokenIn, tokenOut }),
    pathExists: (path)=>
      WETH$1.pathExists(blockchain$6, path),
    getAmounts: WETH$1.getAmounts,
    getTransaction: ({ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress })=>
      WETH$1.getTransaction(blockchain$6, exchange$6 ,{ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress }),
  })
);

const blockchain$5 = Blockchains.ethereum;

const exchange$5 = {
  blockchain: 'ethereum',
  name: 'weth',
  alternativeNames: [],
  label: 'Wrapped Ethereum',
  logo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI2LjAuMSwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIKCSBpZD0iTGF5ZXJfMSIgaW1hZ2UtcmVuZGVyaW5nPSJvcHRpbWl6ZVF1YWxpdHkiIHNoYXBlLXJlbmRlcmluZz0iZ2VvbWV0cmljUHJlY2lzaW9uIiB0ZXh0LXJlbmRlcmluZz0iZ2VvbWV0cmljUHJlY2lzaW9uIgoJIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IiB2aWV3Qm94PSIwIDAgMjgzLjUgMjgzLjUiCgkgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMjgzLjUgMjgzLjU7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojMzQzNDM0O30KCS5zdDF7ZmlsbDojOEM4QzhDO30KCS5zdDJ7ZmlsbDojM0MzQzNCO30KCS5zdDN7ZmlsbDojMTQxNDE0O30KCS5zdDR7ZmlsbDojMzkzOTM5O30KPC9zdHlsZT4KPGc+Cgk8Zz4KCQk8cGF0aCBjbGFzcz0ic3QwIiBkPSJNMTQxLjcsMjUuOWwtMS41LDUuMnYxNTMuM2wxLjUsMS41bDcxLjItNDIuMUwxNDEuNywyNS45eiIvPgoJCTxwYXRoIGNsYXNzPSJzdDEiIGQ9Ik0xNDEuNywyNS45TDcwLjYsMTQzLjhsNzEuMSw0Mi4xdi03NC40VjI1Ljl6Ii8+CgkJPHBhdGggY2xhc3M9InN0MiIgZD0iTTE0MS43LDE5OS40bC0wLjgsMS4xdjU0LjZsMC44LDIuNWw3MS4yLTEwMC4zTDE0MS43LDE5OS40eiIvPgoJCTxwYXRoIGNsYXNzPSJzdDEiIGQ9Ik0xNDEuNywyNTcuNnYtNTguMmwtNzEuMS00Mi4xTDE0MS43LDI1Ny42eiIvPgoJCTxwYXRoIGNsYXNzPSJzdDMiIGQ9Ik0xNDEuNywxODUuOWw3MS4yLTQyLjFsLTcxLjItMzIuM1YxODUuOXoiLz4KCQk8cGF0aCBjbGFzcz0ic3Q0IiBkPSJNNzAuNiwxNDMuOGw3MS4xLDQyLjF2LTc0LjRMNzAuNiwxNDMuOHoiLz4KCTwvZz4KPC9nPgo8L3N2Zz4K',
  wrapper: {
    address: blockchain$5.wrapped.address,
    api: WETH$1.WETH
  },
  slippage: false,
};

var weth = new Exchange(

  Object.assign(exchange$5, {
    findPath: ({ tokenIn, tokenOut })=>
      WETH$1.findPath(blockchain$5, { tokenIn, tokenOut }),
    pathExists: (path)=>
      WETH$1.pathExists(blockchain$5, path),
    getAmounts: WETH$1.getAmounts,
    getTransaction: ({ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress })=>
      WETH$1.getTransaction(blockchain$5, exchange$5 ,{ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress }),
  })
);

const blockchain$4 = Blockchains.arbitrum;

const exchange$4 = {
  blockchain: 'arbitrum',
  name: 'weth',
  alternativeNames: [],
  label: 'Wrapped Ethereum',
  logo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI2LjAuMSwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIKCSBpZD0iTGF5ZXJfMSIgaW1hZ2UtcmVuZGVyaW5nPSJvcHRpbWl6ZVF1YWxpdHkiIHNoYXBlLXJlbmRlcmluZz0iZ2VvbWV0cmljUHJlY2lzaW9uIiB0ZXh0LXJlbmRlcmluZz0iZ2VvbWV0cmljUHJlY2lzaW9uIgoJIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IiB2aWV3Qm94PSIwIDAgMjgzLjUgMjgzLjUiCgkgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMjgzLjUgMjgzLjU7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojMzQzNDM0O30KCS5zdDF7ZmlsbDojOEM4QzhDO30KCS5zdDJ7ZmlsbDojM0MzQzNCO30KCS5zdDN7ZmlsbDojMTQxNDE0O30KCS5zdDR7ZmlsbDojMzkzOTM5O30KPC9zdHlsZT4KPGc+Cgk8Zz4KCQk8cGF0aCBjbGFzcz0ic3QwIiBkPSJNMTQxLjcsMjUuOWwtMS41LDUuMnYxNTMuM2wxLjUsMS41bDcxLjItNDIuMUwxNDEuNywyNS45eiIvPgoJCTxwYXRoIGNsYXNzPSJzdDEiIGQ9Ik0xNDEuNywyNS45TDcwLjYsMTQzLjhsNzEuMSw0Mi4xdi03NC40VjI1Ljl6Ii8+CgkJPHBhdGggY2xhc3M9InN0MiIgZD0iTTE0MS43LDE5OS40bC0wLjgsMS4xdjU0LjZsMC44LDIuNWw3MS4yLTEwMC4zTDE0MS43LDE5OS40eiIvPgoJCTxwYXRoIGNsYXNzPSJzdDEiIGQ9Ik0xNDEuNywyNTcuNnYtNTguMmwtNzEuMS00Mi4xTDE0MS43LDI1Ny42eiIvPgoJCTxwYXRoIGNsYXNzPSJzdDMiIGQ9Ik0xNDEuNywxODUuOWw3MS4yLTQyLjFsLTcxLjItMzIuM1YxODUuOXoiLz4KCQk8cGF0aCBjbGFzcz0ic3Q0IiBkPSJNNzAuNiwxNDMuOGw3MS4xLDQyLjF2LTc0LjRMNzAuNiwxNDMuOHoiLz4KCTwvZz4KPC9nPgo8L3N2Zz4K',
  wrapper: {
    address: blockchain$4.wrapped.address,
    api: WETH$1.WETH
  },
  slippage: false,
};

var weth_arbitrum = new Exchange(

  Object.assign(exchange$4, {
    findPath: ({ tokenIn, tokenOut })=>
      WETH$1.findPath(blockchain$4, { tokenIn, tokenOut }),
    pathExists: (path)=>
      WETH$1.pathExists(blockchain$4, path),
    getAmounts: WETH$1.getAmounts,
    getTransaction: ({ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress })=>
      WETH$1.getTransaction(blockchain$4, exchange$4 ,{ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress }),
  })
);

const blockchain$3 = Blockchains.optimism;

const exchange$3 = {
  blockchain: 'optimism',
  name: 'weth',
  alternativeNames: [],
  label: 'Wrapped Ethereum',
  logo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI2LjAuMSwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIKCSBpZD0iTGF5ZXJfMSIgaW1hZ2UtcmVuZGVyaW5nPSJvcHRpbWl6ZVF1YWxpdHkiIHNoYXBlLXJlbmRlcmluZz0iZ2VvbWV0cmljUHJlY2lzaW9uIiB0ZXh0LXJlbmRlcmluZz0iZ2VvbWV0cmljUHJlY2lzaW9uIgoJIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IiB2aWV3Qm94PSIwIDAgMjgzLjUgMjgzLjUiCgkgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMjgzLjUgMjgzLjU7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojMzQzNDM0O30KCS5zdDF7ZmlsbDojOEM4QzhDO30KCS5zdDJ7ZmlsbDojM0MzQzNCO30KCS5zdDN7ZmlsbDojMTQxNDE0O30KCS5zdDR7ZmlsbDojMzkzOTM5O30KPC9zdHlsZT4KPGc+Cgk8Zz4KCQk8cGF0aCBjbGFzcz0ic3QwIiBkPSJNMTQxLjcsMjUuOWwtMS41LDUuMnYxNTMuM2wxLjUsMS41bDcxLjItNDIuMUwxNDEuNywyNS45eiIvPgoJCTxwYXRoIGNsYXNzPSJzdDEiIGQ9Ik0xNDEuNywyNS45TDcwLjYsMTQzLjhsNzEuMSw0Mi4xdi03NC40VjI1Ljl6Ii8+CgkJPHBhdGggY2xhc3M9InN0MiIgZD0iTTE0MS43LDE5OS40bC0wLjgsMS4xdjU0LjZsMC44LDIuNWw3MS4yLTEwMC4zTDE0MS43LDE5OS40eiIvPgoJCTxwYXRoIGNsYXNzPSJzdDEiIGQ9Ik0xNDEuNywyNTcuNnYtNTguMmwtNzEuMS00Mi4xTDE0MS43LDI1Ny42eiIvPgoJCTxwYXRoIGNsYXNzPSJzdDMiIGQ9Ik0xNDEuNywxODUuOWw3MS4yLTQyLjFsLTcxLjItMzIuM1YxODUuOXoiLz4KCQk8cGF0aCBjbGFzcz0ic3Q0IiBkPSJNNzAuNiwxNDMuOGw3MS4xLDQyLjF2LTc0LjRMNzAuNiwxNDMuOHoiLz4KCTwvZz4KPC9nPgo8L3N2Zz4K',
  wrapper: {
    address: blockchain$3.wrapped.address,
    api: WETH$1.WETH
  },
  slippage: false,
};

var weth_optimism = new Exchange(

  Object.assign(exchange$3, {
    findPath: ({ tokenIn, tokenOut })=>
      WETH$1.findPath(blockchain$3, { tokenIn, tokenOut }),
    pathExists: (path)=>
      WETH$1.pathExists(blockchain$3, path),
    getAmounts: WETH$1.getAmounts,
    getTransaction: ({ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress })=>
      WETH$1.getTransaction(blockchain$3, exchange$3 ,{ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress }),
  })
);

const blockchain$2 = Blockchains.fantom;

const exchange$2 = {
  blockchain: 'fantom',
  name: 'wftm',
  alternativeNames: [],
  label: 'Wrapped Fantom',
  logo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPHN2ZyB2ZXJzaW9uPSIxLjEiIGlkPSJMYXllcl8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCIKCSB2aWV3Qm94PSIwIDAgMTkyIDE5MiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTkyIDE5MjsiIHhtbDpzcGFjZT0icHJlc2VydmUiPgo8ZyBpZD0iY2lyY2xlIj4KCTxnIGlkPSJGYW50b20tY2lyY2xlIj4KCQk8Y2lyY2xlIGlkPSJPdmFsIiBmaWxsUnVsZT0iZXZlbm9kZCIgY2xpcFJ1bGU9ImV2ZW5vZGQiIGZpbGw9IiMxOTY5RkYiIGNsYXNzPSJzdDAiIGN4PSI5NiIgY3k9Ijk2IiByPSI4MC40Ii8+CgkJPHBhdGggaWQ9IlNoYXBlIiBmaWxsPSIjRkZGRkZGIiBkPSJNOTEuMSw0MS4yYzIuNy0xLjQsNi44LTEuNCw5LjUsMGwyNy42LDE0LjZjMS42LDAuOSwyLjUsMi4xLDIuNywzLjVoMHY3My4zCgkJCWMwLDEuNC0wLjksMi45LTIuNywzLjhsLTI3LjYsMTQuNmMtMi43LDEuNC02LjgsMS40LTkuNSwwbC0yNy42LTE0LjZjLTEuOC0wLjktMi42LTIuNC0yLjctMy44YzAtMC4xLDAtMC4zLDAtMC40bDAtNzIuNAoJCQljMC0wLjEsMC0wLjIsMC0wLjNsMC0wLjJoMGMwLjEtMS4zLDEtMi42LDIuNi0zLjVMOTEuMSw0MS4yeiBNMTI2LjYsOTkuOWwtMjYsMTMuN2MtMi43LDEuNC02LjgsMS40LTkuNSwwTDY1LjIsMTAwdjMyLjMKCQkJbDI1LjksMTMuNmMxLjUsMC44LDMuMSwxLjYsNC43LDEuN2wwLjEsMGMxLjUsMCwzLTAuOCw0LjYtMS41bDI2LjItMTMuOVY5OS45eiBNNTYuNSwxMzAuOWMwLDIuOCwwLjMsNC43LDEsNgoJCQljMC41LDEuMSwxLjMsMS45LDIuOCwyLjlsMC4xLDAuMWMwLjMsMC4yLDAuNywwLjQsMS4xLDAuN2wwLjUsMC4zbDEuNiwwLjlsLTIuMiwzLjdsLTEuNy0xLjFsLTAuMy0wLjJjLTAuNS0wLjMtMC45LTAuNi0xLjMtMC44CgkJCWMtNC4yLTIuOC01LjctNS45LTUuNy0xMi4zbDAtMC4ySDU2LjV6IE05My44LDgwLjVjLTAuMiwwLjEtMC40LDAuMS0wLjYsMC4yTDY1LjYsOTUuM2MwLDAtMC4xLDAtMC4xLDBsMCwwbDAsMGwwLjEsMGwyNy42LDE0LjYKCQkJYzAuMiwwLjEsMC40LDAuMiwwLjYsMC4yVjgwLjV6IE05OC4yLDgwLjV2MjkuOGMwLjItMC4xLDAuNC0wLjEsMC42LTAuMmwyNy42LTE0LjZjMCwwLDAuMSwwLDAuMSwwbDAsMGwwLDBsLTAuMSwwTDk4LjgsODAuNwoJCQlDOTguNiw4MC42LDk4LjQsODAuNSw5OC4yLDgwLjV6IE0xMjYuNiw2NC40bC0yNC44LDEzbDI0LjgsMTNWNjQuNHogTTY1LjIsNjQuNHYyNi4xbDI0LjgtMTNMNjUuMiw2NC40eiBNOTguNyw0NS4xCgkJCWMtMS40LTAuOC00LTAuOC01LjUsMEw2NS42LDU5LjdjMCwwLTAuMSwwLTAuMSwwbDAsMGwwLDBsMC4xLDBsMjcuNiwxNC42YzEuNCwwLjgsNCwwLjgsNS41LDBsMjcuNi0xNC42YzAsMCwwLjEsMCwwLjEsMGwwLDBsMCwwCgkJCWwtMC4xLDBMOTguNyw0NS4xeiBNMTMwLjcsNDYuNWwxLjcsMS4xbDAuMywwLjJjMC41LDAuMywwLjksMC42LDEuMywwLjhjNC4yLDIuOCw1LjcsNS45LDUuNywxMi4zbDAsMC4yaC00LjNjMC0yLjgtMC4zLTQuNy0xLTYKCQkJYy0wLjUtMS4xLTEuMy0xLjktMi44LTIuOWwtMC4xLTAuMWMtMC4zLTAuMi0wLjctMC40LTEuMS0wLjdsLTAuNS0wLjNsLTEuNi0wLjlMMTMwLjcsNDYuNXoiLz4KCTwvZz4KPC9nPgo8L3N2Zz4K',
  wrapper: {
    address: blockchain$2.wrapped.address,
    api: WETH$1.WETH
  },
  slippage: false,
};

var wftm = new Exchange(

  Object.assign(exchange$2, {
    findPath: ({ tokenIn, tokenOut })=>
      WETH$1.findPath(blockchain$2, { tokenIn, tokenOut }),
    pathExists: (path)=>
      WETH$1.pathExists(blockchain$2, path),
    getAmounts: WETH$1.getAmounts,
    getTransaction: ({ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress })=>
      WETH$1.getTransaction(blockchain$2, exchange$2 ,{ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress }),
  })
);

const blockchain$1 = Blockchains.polygon;

const exchange$1 = {
  blockchain: 'polygon',
  name: 'wmatic',
  alternativeNames: [],
  label: 'Wrapped MATIC',
  logo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI2LjAuMSwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCA0NS40IDQ1LjQiIHN0eWxlPSJlbmFibGUtYmFja2dyb3VuZDpuZXcgMCAwIDQ1LjQgNDUuNDsiIHhtbDpzcGFjZT0icHJlc2VydmUiPgo8c3R5bGUgdHlwZT0idGV4dC9jc3MiPgoJLnN0MHtmaWxsOiM4MjQ3RTU7fQo8L3N0eWxlPgo8cGF0aCBjbGFzcz0ic3QwIiBkPSJNMzEuOSwxNi42Yy0wLjctMC40LTEuNi0wLjQtMi4yLDBsLTUuMywzLjFsLTMuNSwybC01LjEsMy4xYy0wLjcsMC40LTEuNiwwLjQtMi4yLDBsLTQtMi40CgljLTAuNi0wLjQtMS4xLTEuMS0xLjEtMnYtNC42YzAtMC45LDAuNS0xLjYsMS4xLTJsNC0yLjNjMC43LTAuNCwxLjUtMC40LDIuMiwwbDQsMi40YzAuNywwLjQsMS4xLDEuMSwxLjEsMnYzLjFsMy41LTIuMXYtMy4yCgljMC0wLjktMC40LTEuNi0xLjEtMmwtNy41LTQuNGMtMC43LTAuNC0xLjUtMC40LTIuMiwwTDYsMTEuN2MtMC43LDAuNC0xLjEsMS4xLTEuMSwxLjh2OC43YzAsMC45LDAuNCwxLjYsMS4xLDJsNy42LDQuNAoJYzAuNywwLjQsMS41LDAuNCwyLjIsMGw1LjEtMi45bDMuNS0yLjFsNS4xLTIuOWMwLjctMC40LDEuNi0wLjQsMi4yLDBsNCwyLjNjMC43LDAuNCwxLjEsMS4xLDEuMSwydjQuNmMwLDAuOS0wLjQsMS42LTEuMSwyCglsLTMuOSwyLjNjLTAuNywwLjQtMS41LDAuNC0yLjIsMGwtNC0yLjNjLTAuNy0wLjQtMS4xLTEuMS0xLjEtMnYtMi45TDIxLDI4Ljd2My4xYzAsMC45LDAuNCwxLjYsMS4xLDJsNy41LDQuNAoJYzAuNywwLjQsMS41LDAuNCwyLjIsMGw3LjUtNC40YzAuNy0wLjQsMS4xLTEuMSwxLjEtMlYyM2MwLTAuOS0wLjQtMS42LTEuMS0yQzM5LjIsMjEsMzEuOSwxNi42LDMxLjksMTYuNnoiLz4KPC9zdmc+Cg==',
  wrapper: {
    address: blockchain$1.wrapped.address,
    api: WETH$1.WETH
  },
  slippage: false,
};

var wmatic = new Exchange(

  Object.assign(exchange$1, {
    findPath: ({ tokenIn, tokenOut })=>
      WETH$1.findPath(blockchain$1, { tokenIn, tokenOut }),
    pathExists: (path)=>
      WETH$1.pathExists(blockchain$1, path),
    getAmounts: WETH$1.getAmounts,
    getTransaction: ({ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress })=>
      WETH$1.getTransaction(blockchain$1, exchange$1 ,{ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress }),
  })
);

const blockchain = Blockchains.gnosis;

const exchange = {
  blockchain: 'gnosis',
  name: 'wxdai',
  alternativeNames: [],
  label: 'Wrapped XDAI',
  logo: blockchain.wrapped.logo,
  wrapper: {
    address: blockchain.wrapped.address,
    api: WETH$1.WETH
  },
  slippage: false,
};

var wxdai = new Exchange(

  Object.assign(exchange, {
    findPath: ({ tokenIn, tokenOut })=>
      WETH$1.findPath(blockchain, { tokenIn, tokenOut }),
    pathExists: (path)=>
      WETH$1.pathExists(blockchain, path),
    getAmounts: WETH$1.getAmounts,
    getTransaction: ({ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress })=>
      WETH$1.getTransaction(blockchain, exchange ,{ path, amountIn, amountInMax, amountOut, amountOutMin, amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput, fromAddress }),
  })
);

const all = [
  orca,
  uniswap_v3,
  curve,
  uniswap_v2,
  pancakeswap,
  quickswap,
  spookyswap,
  weth,
  weth_optimism,
  weth_arbitrum,
  wbnb,
  wmatic,
  wftm,
  wavax,
  wxdai,
];

all.ethereum = [
  uniswap_v3,
  curve,
  uniswap_v2,
  weth,
];
all.ethereum.forEach((exchange)=>{ all.ethereum[exchange.name] = exchange; });

all.bsc = [
  uniswap_v3,
  pancakeswap,
  wbnb,
];
all.bsc.forEach((exchange)=>{ all.bsc[exchange.name] = exchange; });

all.polygon = [
  uniswap_v3,
  curve,
  quickswap,
  wmatic,
];
all.polygon.forEach((exchange)=>{ all.polygon[exchange.name] = exchange; });

all.solana = [
  orca
];
all.solana.forEach((exchange)=>{ all.solana[exchange.name] = exchange; });

all.optimism = [
  uniswap_v3,
  curve,
  weth_optimism,
];
all.optimism.forEach((exchange)=>{ all.optimism[exchange.name] = exchange; });

all.arbitrum = [
  uniswap_v3,
  curve,
  weth_arbitrum,
];
all.arbitrum.forEach((exchange)=>{ all.arbitrum[exchange.name] = exchange; });

all.fantom = [
  spookyswap,
  curve,
  wftm
];
all.fantom.forEach((exchange)=>{ all.fantom[exchange.name] = exchange; });

all.avalanche = [
  wavax,
];
all.avalanche.forEach((exchange)=>{ all.avalanche[exchange.name] = exchange; });

all.gnosis = [
  curve,
  wxdai,
];
all.gnosis.forEach((exchange)=>{ all.gnosis[exchange.name] = exchange; });

var find = ({ blockchain, name }) => {
  if(blockchain) {
    return all.find((exchange) => {
      return (
        (exchange.blockchain === blockchain) &&
        (exchange.name === name || exchange.alternativeNames.includes(name))
      )
    })
  } else {
    return all.find((exchange) => {
      return exchange.name === name || exchange.alternativeNames.includes(name)
    })
  }
};

let route = ({
  blockchain,
  tokenIn,
  tokenOut,
  amountIn,
  amountOut,
  amountInMax,
  amountOutMin,
  amountOutMax,
  amountInMin,
}) => {
  return Promise.all(
    all[blockchain].map((exchange) => {
      return exchange.route({
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        amountInMax,
        amountOutMin,
        amountOutMax,
        amountInMin,
      })
    }),
  )
  .then((routes)=>routes.filter(Boolean))
};

export { all, find, route };
