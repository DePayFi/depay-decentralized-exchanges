import { CONSTANTS } from '@depay/web3-constants'
import { find } from 'src'

describe('wvlx', () => {
  
  const blockchain = 'velas'
  const accounts = ['0xd8da6bf26964af9d7eed9e03e53415d37aa96045']
  const exchange = find('velas', 'wvlx')
  const fromAddress = '0x5Af489c8786A018EC4814194dC8048be1007e390'
  const toAddress = '0x5Af489c8786A018EC4814194dC8048be1007e390'
  
  describe('getAmounts', ()=>{

    it('provides the same amounts (amountIn==amountOut) for ETH<>WETH', async ()=> {

      const path = [CONSTANTS[blockchain].NATIVE, CONSTANTS[blockchain].WRAPPED]
      const amount = '100000000000'
      
      let { amountIn, amountOut, amountInMax, amountOutMin } = await exchange.getAmounts({
        path,
        amountOut: amount
      })

      expect(amountIn.toString()).toEqual(amount)
      expect(amountOut.toString()).toEqual(amount)
      expect(amountInMax.toString()).toEqual(amount)
      expect(amountOutMin.toString()).toEqual(amount)
    })

    it('provides the same amounts (amountIn==amountOut) for WETH<>ETH', async ()=> {

      const path = [CONSTANTS[blockchain].WRAPPED, CONSTANTS[blockchain].NATIVE]
      const amount = '100000000000'
      
      let { amountIn } = await exchange.getAmounts({
        path,
        amountOut: amount
      })

      expect(amountIn.toString()).toEqual(amount)
    })
  })
})
