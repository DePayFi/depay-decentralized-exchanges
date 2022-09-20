import { ethers } from 'ethers'
import { LIQUIDITY_STATE_LAYOUT_V4, MARKET_LAYOUT_V3 } from './apis'

export default {
  blockchain: 'solana',
  name: 'raydium',
  alternativeNames: [],
  label: 'Raydium',
  logo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4NCjwhLS0gR2VuZXJhdG9yOiBBZG9iZSBJbGx1c3RyYXRvciAyNi4wLjMsIFNWRyBFeHBvcnQgUGx1Zy1JbiAuIFNWRyBWZXJzaW9uOiA2LjAwIEJ1aWxkIDApICAtLT4NCjxzdmcgdmVyc2lvbj0iMS4wIiBpZD0ia2F0bWFuXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4Ig0KCSB2aWV3Qm94PSIwIDAgNjAwIDQ1MCIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgNjAwIDQ1MDsiIHhtbDpzcGFjZT0icHJlc2VydmUiPg0KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4NCgkuc3Qwe2ZpbGw6dXJsKCNTVkdJRF8xXyk7fQ0KCS5zdDF7ZmlsbDp1cmwoI1NWR0lEXzAwMDAwMDk5NjIxNDI3ODc5NDI1NDQzODkwMDAwMDAxMjk5Nzc3ODIyNzkwMjc5MzE0Xyk7fQ0KCS5zdDJ7ZmlsbDp1cmwoI1NWR0lEXzAwMDAwMTgxODA0MDUxMjYwNjA1NDkxOTMwMDAwMDA5OTg4NDEyODAyMTYwMDU2MjI1Xyk7fQ0KCS5zdDN7ZmlsbDp1cmwoI1NWR0lEXzAwMDAwMDQ3MDMzMjgxMTM1MTk4MDAwMjYwMDAwMDAzMTIyNDk0Njg5NTA2Njk1MzU3Xyk7fQ0KPC9zdHlsZT4NCjxnPg0KCQ0KCQk8bGluZWFyR3JhZGllbnQgaWQ9IlNWR0lEXzFfIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjU5MS40NDQxIiB5MT0iMjIyLjU0NDYiIHgyPSIyNTAuMTU1NCIgeTI9Ijg2LjA2NDEiIGdyYWRpZW50VHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgLTEgLTEyMC45NDQ5IDM3OS4zNjIyKSI+DQoJCTxzdG9wICBvZmZzZXQ9IjAiIHN0eWxlPSJzdG9wLWNvbG9yOiM3RDQ2OTUiLz4NCgkJPHN0b3AgIG9mZnNldD0iMC40ODk3IiBzdHlsZT0ic3RvcC1jb2xvcjojNDI2N0IwIi8+DQoJCTxzdG9wICBvZmZzZXQ9IjAuNDg5OCIgc3R5bGU9InN0b3AtY29sb3I6IzQzNjhCMCIvPg0KCQk8c3RvcCAgb2Zmc2V0PSIxIiBzdHlsZT0ic3RvcC1jb2xvcjojNjBCRkJCIi8+DQoJPC9saW5lYXJHcmFkaWVudD4NCgk8cGF0aCBjbGFzcz0ic3QwIiBkPSJNNDQ0LjEsMTc4Ljd2MTI5LjZMMzAwLDM5MS41bC0xNDQuMi04My4yVjE0MS44TDMwMCw1OC41bDExMC44LDY0bDE2LjctOS42TDMwMCwzOS4ybC0xNjAuOSw5Mi45djE4NS44DQoJCUwzMDAsNDEwLjhsMTYwLjktOTIuOVYxNjlMNDQ0LjEsMTc4Ljd6Ii8+DQoJDQoJCTxsaW5lYXJHcmFkaWVudCBpZD0iU1ZHSURfMDAwMDAwNTM1MzcwOTk5NTg1NjYzNDExNDAwMDAwMDkyNTE3MTczNzEyMzk2ODA0MTZfIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjU4NC44NTUyIiB5MT0iMjM5LjAyMSIgeDI9IjI0My41NjY1IiB5Mj0iMTAyLjU0MDUiIGdyYWRpZW50VHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgLTEgLTEyMC45NDQ5IDM3OS4zNjIyKSI+DQoJCTxzdG9wICBvZmZzZXQ9IjAiIHN0eWxlPSJzdG9wLWNvbG9yOiM3RDQ2OTUiLz4NCgkJPHN0b3AgIG9mZnNldD0iMC40ODk3IiBzdHlsZT0ic3RvcC1jb2xvcjojNDI2N0IwIi8+DQoJCTxzdG9wICBvZmZzZXQ9IjAuNDg5OCIgc3R5bGU9InN0b3AtY29sb3I6IzQzNjhCMCIvPg0KCQk8c3RvcCAgb2Zmc2V0PSIxIiBzdHlsZT0ic3RvcC1jb2xvcjojNjBCRkJCIi8+DQoJPC9saW5lYXJHcmFkaWVudD4NCgk8cGF0aCBzdHlsZT0iZmlsbDp1cmwoI1NWR0lEXzAwMDAwMDUzNTM3MDk5OTU4NTY2MzQxMTQwMDAwMDA5MjUxNzE3MzcxMjM5NjgwNDE2Xyk7IiBkPSJNMjU5LjYsMzA4LjNoLTI0LjF2LTgwLjloODAuNA0KCQljNy42LTAuMSwxNC45LTMuMiwyMC4yLTguNmM1LjQtNS40LDguNC0xMi43LDguNC0yMC4zYzAtMy44LTAuNy03LjUtMi4xLTExYy0xLjUtMy41LTMuNi02LjYtNi4zLTkuMmMtMi42LTIuNy01LjgtNC44LTkuMi02LjMNCgkJYy0zLjUtMS41LTcuMi0yLjItMTEtMi4yaC04MC40di0yNC42SDMxNmMxNC4xLDAuMSwyNy42LDUuNywzNy41LDE1LjdjMTAsMTAsMTUuNiwyMy41LDE1LjcsMzcuNWMwLjEsMTAuOC0zLjIsMjEuMy05LjQsMzAuMQ0KCQljLTUuNyw4LjQtMTMuOCwxNS0yMy4yLDE5Yy05LjMsMy0xOSw0LjQtMjguOCw0LjNoLTQ4LjJMMjU5LjYsMzA4LjN6Ii8+DQoJDQoJCTxsaW5lYXJHcmFkaWVudCBpZD0iU1ZHSURfMDAwMDAwMDIzNDk4NDMwMDY3NzM4Mzg1NzAwMDAwMDE0NDYzNTY2MzI0NDUyMDM2MTlfIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjYxOC45ODE0IiB5MT0iMTUzLjY4MzgiIHgyPSIyNzcuNjkyNiIgeTI9IjE3LjIwMzMiIGdyYWRpZW50VHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgLTEgLTEyMC45NDQ5IDM3OS4zNjIyKSI+DQoJCTxzdG9wICBvZmZzZXQ9IjAiIHN0eWxlPSJzdG9wLWNvbG9yOiM3RDQ2OTUiLz4NCgkJPHN0b3AgIG9mZnNldD0iMC40ODk3IiBzdHlsZT0ic3RvcC1jb2xvcjojNDI2N0IwIi8+DQoJCTxzdG9wICBvZmZzZXQ9IjAuNDg5OCIgc3R5bGU9InN0b3AtY29sb3I6IzQzNjhCMCIvPg0KCQk8c3RvcCAgb2Zmc2V0PSIxIiBzdHlsZT0ic3RvcC1jb2xvcjojNjBCRkJCIi8+DQoJPC9saW5lYXJHcmFkaWVudD4NCgk8cGF0aCBzdHlsZT0iZmlsbDp1cmwoI1NWR0lEXzAwMDAwMDAyMzQ5ODQzMDA2NzczODM4NTcwMDAwMDAxNDQ2MzU2NjMyNDQ1MjAzNjE5Xyk7IiBkPSJNMzY4LjcsMzA2LjNoLTI4LjFsLTIxLjctMzcuOQ0KCQljOC42LTAuNSwxNy4xLTIuMywyNS4yLTUuMUwzNjguNywzMDYuM3oiLz4NCgkNCgkJPGxpbmVhckdyYWRpZW50IGlkPSJTVkdJRF8wMDAwMDE2OTUyMDEzODIyNDYzMjgxOTAzMDAwMDAxNTI5MzcyNzQyNjI3MTgxMjI1Ml8iIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIiB4MT0iNTgyLjU3MTEiIHkxPSIyNDQuNjYzNyIgeDI9IjI0MS4yODI0IiB5Mj0iMTA4LjE4MzMiIGdyYWRpZW50VHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgLTEgLTEyMC45NDQ5IDM3OS4zNjIyKSI+DQoJCTxzdG9wICBvZmZzZXQ9IjAiIHN0eWxlPSJzdG9wLWNvbG9yOiM3RDQ2OTUiLz4NCgkJPHN0b3AgIG9mZnNldD0iMC40ODk3IiBzdHlsZT0ic3RvcC1jb2xvcjojNDI2N0IwIi8+DQoJCTxzdG9wICBvZmZzZXQ9IjAuNDg5OCIgc3R5bGU9InN0b3AtY29sb3I6IzQzNjhCMCIvPg0KCQk8c3RvcCAgb2Zmc2V0PSIxIiBzdHlsZT0ic3RvcC1jb2xvcjojNjBCRkJCIi8+DQoJPC9saW5lYXJHcmFkaWVudD4NCgk8cGF0aCBzdHlsZT0iZmlsbDp1cmwoI1NWR0lEXzAwMDAwMTY5NTIwMTM4MjI0NjMyODE5MDMwMDAwMDE1MjkzNzI3NDI2MjcxODEyMjUyXyk7IiBkPSJNNDI3LjMsMTUxLjdMNDQ0LDE2MWwxNi42LTkuMnYtMTkuNQ0KCQlsLTE2LjYtOS42bC0xNi42LDkuNlYxNTEuN3oiLz4NCjwvZz4NCjwvc3ZnPg0K',
  pair: {
    v4: {
      address: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
      authority: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
      api: LIQUIDITY_STATE_LAYOUT_V4,
      LIQUIDITY_FEES_NUMERATOR: ethers.BigNumber.from(25),
      LIQUIDITY_FEES_DENOMINATOR: ethers.BigNumber.from(10000),
    }
  },
  router: {
    v1: {
      address: 'routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS'
    }
  },
  market: {
    v3: {
      address: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
      api: MARKET_LAYOUT_V3
    }
  }
}
