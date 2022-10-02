import UniswapV2 from '../basics'
import { fixPath } from './path'
import { request } from '@depay/web3-client'

let getAmountsOut = ({ path, amountIn, tokenIn, tokenOut }) => {
  return new Promise((resolve) => {
    request({
      blockchain: 'ethereum',
      address: UniswapV2.router.address,
      method: 'getAmountsOut',
      api: UniswapV2.router.api,
      params: {
        amountIn: amountIn,
        path: fixPath(path),
      },
    })
    .then((amountsOut)=>{
      resolve(amountsOut[amountsOut.length - 1])
    })
    .catch(()=>resolve())
  })
}

let getAmountsIn = ({ path, amountOut, block }) => {
  return new Promise((resolve) => {
    request({
      blockchain: 'ethereum',
      address: UniswapV2.router.address,
      method: 'getAmountsIn',
      api: UniswapV2.router.api,
      params: {
        amountOut: amountOut,
        path: fixPath(path),
      },
      block
    })
    .then((amountsIn)=>resolve(amountsIn[0]))
    .catch(()=>resolve())
  })
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
    amountIn = await getAmountsIn({ path, amountOut, tokenIn, tokenOut })
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
    amountIn = await getAmountsIn({ path, amountOut: amountOutMin, tokenIn, tokenOut })
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
  getAmountsIn
}
