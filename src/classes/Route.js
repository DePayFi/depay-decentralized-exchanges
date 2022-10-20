class Route {
  constructor({
    tokenIn,
    tokenOut,
    path,
    amountIn,
    amountInMax,
    amountOut,
    amountOutMin,
    fromAddress,
    transaction,
    exchange,
  }) {
    this.tokenIn = tokenIn
    this.tokenOut = tokenOut
    this.path = path
    this.amountIn = amountIn?.toString()
    this.amountOutMin = amountOutMin?.toString()
    this.amountOut = amountOut?.toString()
    this.amountInMax = amountInMax?.toString()
    this.fromAddress = fromAddress
    this.transaction = transaction
    this.exchange = exchange
  }
}

export default Route
