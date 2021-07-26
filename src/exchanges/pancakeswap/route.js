import CONSTANTS from 'depay-blockchain-constants'
import Route from '../../classes/Route'
import { request } from 'depay-blockchain-client'
import { Transaction } from 'depay-blockchain-transaction'
import { UniswapV2Router02, UniswapV2Factory } from './apis'

let getAmountsOut = ({ path, amountIn, tokenIn, tokenOut }) => {
  return new Promise((resolve) => {
    request('ethereum://0x7a250d5630b4cf539739df2c5dacb4c659f2488d/getAmountsOut', {
      api: UniswapV2Router02,
      params: {
        amountIn: amountIn,
        path: fixUniswapPath(path),
      },
    })
    .then((amountsOut)=>resolve(amountsOut[amountsOut.length - 1]))
    .catch(()=>resolve())
  })
}

let getAmountsIn = ({ path, amountOut, tokenIn, tokenOut }) => {
  return new Promise((resolve) => {
    request('ethereum://0x7a250d5630b4cf539739df2c5dacb4c659f2488d/getAmountsIn', {
      api: UniswapV2Router02,
      params: {
        amountOut: amountOut,
        path: fixUniswapPath(path),
      },
    })
    .then((amountsIn)=>resolve(amountsIn[0]))
    .catch(()=>resolve())
  })
}

// Uniswap replaces 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE with
// the wrapped token 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
// we keep 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE internally
// to be able to differentiate between ETH<>Token and WETH<>Token swaps
// as they are not the same!
let fixUniswapPath = (path) => {
  return path.map((token) => {
    if (token === CONSTANTS.ethereum.NATIVE) {
      return CONSTANTS.ethereum.WRAPPED
    } else {
      return token
    }
  })
}

let pathExists = async (path) => {
  let pair = await request('ethereum://0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f/getPair', {
    api: UniswapV2Factory,
    cache: 3600000,
    params: fixUniswapPath(path),
  })
  return pair != CONSTANTS.ethereum.ZERO
}

let findPath = async ({ tokenIn, tokenOut }) => {
  if(tokenIn === tokenOut){ return [] }
  if (await pathExists([tokenIn, tokenOut])) {
    // direct path
    return [tokenIn, tokenOut]
  } else if (
    (await pathExists([tokenIn, CONSTANTS.ethereum.WRAPPED])) &&
    (await pathExists([tokenOut, CONSTANTS.ethereum.WRAPPED]))
  ) {
    // path via WRAPPED
    return [tokenIn, CONSTANTS.ethereum.WRAPPED, tokenOut]
  }
}

let getTransaction = ({
    path,
    amountIn,
    amountInMax,
    amountOut,
    amountOutMin,
    amountInInput,
    amountOutInput,
    amountInMaxInput,
    amountOutMinInput,
    toAddress
  }) => {
  
  let transaction = {
    blockchain: 'ethereum',
    address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    api: UniswapV2Router02,
  }

  if (path[0] === CONSTANTS.ethereum.NATIVE) {
    if (amountInInput || amountOutMinInput) {
      transaction.method = 'swapExactETHForTokens'
      transaction.value = amountIn
      transaction.params = { amountOutMin: amountOutMin }
    } else if (amountOutInput || amountInMaxInput) {
      transaction.method = 'swapETHForExactTokens'
      transaction.value = amountInMax
      transaction.params = { amountOut: amountOut }
    }
  } else if (path[path.length - 1] === CONSTANTS.ethereum.NATIVE) {
    if (amountInInput || amountOutMinInput) {
      transaction.method = 'swapExactTokensForETH'
      transaction.params = { amountIn: amountIn, amountOutMin: amountOutMin }
    } else if (amountOutInput || amountInMaxInput) {
      transaction.method = 'swapTokensForExactETH'
      transaction.params = { amountInMax: amountInMax, amountOut: amountOut }
    }
  } else {
    if (amountInInput || amountOutMinInput) {
      transaction.method = 'swapExactTokensForTokens'
      transaction.params = { amountIn: amountIn, amountOutMin: amountOutMin }
    } else if (amountOutInput || amountInMaxInput) {
      transaction.method = 'swapTokensForExactTokens'
      transaction.params = { amountInMax: amountInMax, amountOut: amountOut }
    }
  }

  transaction.params = Object.assign({}, transaction.params, {
    path: fixUniswapPath(path),
    to: toAddress,
    deadline: Math.round(Date.now() / 1000) + 30 * 60, // 30 minutes
  })

  return new Transaction(transaction)
}

let route = ({
  exchange,
  tokenIn,
  tokenOut,
  fromAddress,
  toAddress,
  amountIn = undefined,
  amountOut = undefined,
  amountInMax = undefined,
  amountOutMin = undefined,
}) => {
  return new Promise(async (resolve)=> {
    let path = await findPath({ tokenIn, tokenOut })
    if (path === undefined || path.length == 0) { return resolve() }
    let [amountInInput, amountOutInput, amountInMaxInput, amountOutMinInput] = [amountIn, amountOut, amountInMax, amountOutMin]
    
    if (amountOut) {
      amountIn = await getAmountsIn({ path, amountOut, tokenIn, tokenOut })
      if (amountIn == undefined || amountInMax && amountIn.gt(amountInMax)) {
        return resolve()
      } else if (amountInMax === undefined) {
        amountInMax = amountIn
      }
    } else if (amountIn) {
      amountOut = await getAmountsOut({ path, amountIn, tokenIn, tokenOut })
      if (amountOut == undefined || amountOutMin && amountOut.lt(amountOutMin)) {
        return resolve()
      } else if (amountOutMin === undefined) {
        amountOutMin = amountOut
      }
    } else if(amountOutMin) {
      amountIn = await getAmountsIn({ path, amountOut: amountOutMin, tokenIn, tokenOut })
      if (amountIn == undefined || amountInMax && amountIn.gt(amountInMax)) {
        return resolve()
      } else if (amountInMax === undefined) {
        amountInMax = amountIn
      }
    } else if(amountInMax) {
      amountOut = await getAmountsOut({ path, amountIn: amountInMax, tokenIn, tokenOut })
      if (amountOut == undefined ||amountOutMin && amountOut.lt(amountOutMin)) {
        return resolve()
      } else if (amountOutMin === undefined) {
        amountOutMin = amountOut
      }
    }

    let transaction = getTransaction({
      path,
      amountIn,
      amountInMax,
      amountOut,
      amountOutMin,
      amountInInput,
      amountOutInput,
      amountInMaxInput,
      amountOutMinInput,
      toAddress
    })

    resolve(
      new Route({
        tokenIn,
        tokenOut,
        path,
        amountIn,
        amountInMax,
        amountOut,
        amountOutMin,
        fromAddress,
        toAddress,
        exchange,
        transaction,
      })
    )
  })
}

export default route
