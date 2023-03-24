import { ethers } from 'ethers'
import { mock, resetMocks } from '@depay/web3-mock'
import { mockDecimals } from 'tests/mocks/token'
import { mockPair, mockAmounts } from 'tests/mocks/evm/exchange'
import { resetCache, getProvider } from '@depay/web3-client'
import { route, all } from 'src'
import { supported } from 'src/blockchains'

describe('route', ()=> {

  supported.evm.forEach((blockchain)=>{

    describe(blockchain, ()=>{
      
      const exchange = all[blockchain][0]
      const accounts = ['0xd8da6bf26964af9d7eed9e03e53415d37aa96045']

      describe(exchange.name, ()=>{

        let provider
        beforeEach(async ()=>{
          resetMocks()
          resetCache()
          provider = await getProvider(blockchain)
          mock({ blockchain, accounts: { return: accounts } })
        })
        
        it('returns routes for all exchanges on the ethereum blockchain', async ()=>{

          let tokenIn = '0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb' // DEPAY
          let decimalsIn = 18
          let tokenOut = '0xdAC17F958D2ee523a2206206994597C13D831ec7' // USDT
          let decimalsOut = 6
          let path = [tokenIn, tokenOut]
          let amountIn = 1
          let amountInBN = ethers.utils.parseUnits(amountIn.toString(), decimalsIn)
          let amountOutMin = 2
          let amountOutMinBN = ethers.utils.parseUnits(amountOutMin.toString(), decimalsOut)
          let pair = '0xEF8cD6Cb5c841A4f02986e8A8ab3cC545d1B8B6d'
          let wallet = accounts[0]

          mockDecimals({ provider, blockchain, address: tokenIn, value: decimalsIn })
          mockDecimals({ provider, blockchain, address: tokenOut, value: decimalsOut })
          mockPair({ blockchain, exchange, provider, tokenIn, tokenOut, pair })
          mockAmounts({ blockchain, exchange, provider, method: 'getAmountsOut', params: [amountInBN,path], amounts: [amountInBN, amountOutMinBN] })

          let routes = await route({
            blockchain,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            fromAddress: wallet,
            toAddress: wallet
          });

          expect(routes.length).toEqual(1)
          expect(routes[0].exchange).toEqual(exchange)
          expect(routes[0].path).toEqual(path.map((address)=>ethers.utils.getAddress(address)))

          const transaction = await routes[0].getTransaction({ from: accounts[0] })
          expect(transaction.blockchain).toEqual(blockchain)
          expect(transaction.from).toEqual(accounts[0])
          expect(transaction.to).toEqual(exchange.router.address)
          expect(transaction.api).toEqual(exchange.router.api)
          expect(transaction.method).toEqual('swapExactTokensForTokens')
          expect(transaction.params.amountIn).toEqual(amountInBN.toString())
          expect(transaction.params.amountOutMin).toEqual(amountOutMinBN.toString())
          expect(transaction.params.path).toEqual(path.map((address)=>ethers.utils.getAddress(address)))
          expect(transaction.params.to).toEqual(wallet)
          expect(transaction.params.deadline).toBeDefined()

          // TODO: sorts the routes by most cost-effective routes first (once support for multiple exchanges)
        })
      })      
    })
  })
})
