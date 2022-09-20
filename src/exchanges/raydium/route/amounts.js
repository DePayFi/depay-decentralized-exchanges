import Raydium from '../basics'
import { ethers } from 'ethers'
import { getBestPair } from './pairs'
import { getInfo } from './pool'
import { request } from '@depay/web3-client'

let getAmountsOut = ({ path, amountIn, tokenIn, tokenOut }) => {

}

let getAmountIn = async({ path, amountOut }) => {
  let amounts = await Promise.all(path.slice(0,-1).reverse().map(async (step, i)=>{
    let previousStep = path[path.length-1-i]
    let pair = await getBestPair(step, previousStep)
    let info = await getInfo(pair)
    const baseReserve = ethers.BigNumber.from(info.pool_coin_amount)
    const quoteReserve = ethers.BigNumber.from(info.pool_pc_amount)
    const denominator = quoteReserve.sub(amountOut)
    const amountInWithoutFee = baseReserve.mul(amountOut).div(denominator)
    const amountInRaw = amountInWithoutFee
      .mul(Raydium.pair.v4.LIQUIDITY_FEES_DENOMINATOR)
      .div(Raydium.pair.v4.LIQUIDITY_FEES_DENOMINATOR.sub(Raydium.pair.v4.LIQUIDITY_FEES_NUMERATOR))
    return amountInRaw
  }))

  return amounts[0]
}

let getAmounts = async ({
  path,
  tokenIn,
  tokenOut,
  amountOut,
  amountIn,
  amountInMax,
  amountOutMin
}) => {
  if (amountOut) {
    amountIn = await getAmountIn({ path, amountOut, tokenIn, tokenOut })
    if (amountIn == undefined || amountInMax && amountIn.gt(amountInMax)) {
      return {}
    } else if (amountInMax === undefined) {
      amountInMax = amountIn
    }
  } else if (amountIn) {
    amountOut = await getAmountsOut({ path, amountIn, tokenIn, tokenOut })
    if (amountOut == undefined || amountOutMin && amountOut.lt(amountOutMin)) {
      return {}
    } else if (amountOutMin === undefined) {
      amountOutMin = amountOut
    }
  } else if(amountOutMin) {
    amountIn = await getAmountIn({ path, amountOut: amountOutMin, tokenIn, tokenOut })
    if (amountIn == undefined || amountInMax && amountIn.gt(amountInMax)) {
      return {}
    } else if (amountInMax === undefined) {
      amountInMax = amountIn
    }
  } else if(amountInMax) {
    amountOut = await getAmountsOut({ path, amountIn: amountInMax, tokenIn, tokenOut })
    if (amountOut == undefined ||amountOutMin && amountOut.lt(amountOutMin)) {
      return {}
    } else if (amountOutMin === undefined) {
      amountOutMin = amountOut
    }
  }
  return { amountOut, amountIn, amountInMax, amountOutMin }
}

export {
  getAmounts,
  getAmountIn
}
