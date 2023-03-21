import { CONSTANTS } from '@depay/web3-constants'
import { find } from 'dist/esm/index.solana'

describe('Exchange', () => {

  let tokenIn = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
  let tokenOut = '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'
  
  let exchange = find('solana', 'raydium')
  
  it('asks you to set either amountIn or amountOut but not both', async ()=> {
    await expect(
      exchange.route({ amountIn: 1, amountOut: 2, tokenIn, tokenOut })
    ).rejects.toEqual(
      "You cannot set amountIn and amountOut at the same time, use amountInMax or amountOutMin to describe the non exact part of the swap!"
    )
  });

  it('does not allow you to set amountOutMax', async ()=> {
    await expect(
      exchange.route({ amountOutMax: 2, tokenIn, tokenOut })
    ).rejects.toEqual(
      "You cannot not set amountOutMax! Only amountInMax or amountOutMin!"
    )
  })

  it('does not allow you to set amountInMin', async ()=> {
    await expect(
      exchange.route({ amountInMin: 2, tokenIn, tokenOut })
    ).rejects.toEqual(
      "You cannot not set amountInMin! Only amountInMax or amountOutMin!"
    )
  })

  it('asks you to set either amountInMax or amountOutMin but not both', async ()=> {
    await expect(
      exchange.route({ amountInMax: 1, amountOutMin: 2, tokenIn, tokenOut })
    ).rejects.toEqual(
      "You cannot set amountInMax and amountOutMin at the same time, use amountIn or amountOut to describe the part of the swap that needs to be exact!"
    )
  });

  it('does not allow you to set amountIn and amountInMax', async ()=> {
    await expect(
      exchange.route({ amountIn: 1, amountInMax: 2, tokenIn, tokenOut })
    ).rejects.toEqual(
      "Setting amountIn and amountInMax at the same time makes no sense. Decide if amountIn needs to be exact or not!"
    )
  });

  it('does not allow you to set amountOut and amountOutMin', async ()=> {
    await expect(
      exchange.route({ amountOut: 1, amountOutMin: 2, tokenIn, tokenOut })
    ).rejects.toEqual(
      "Setting amountOut and amountOutMin at the same time makes no sense. Decide if amountOut needs to be exact or not!"
    )
  });
});
