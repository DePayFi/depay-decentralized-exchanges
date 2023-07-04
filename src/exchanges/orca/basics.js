import { WHIRLPOOL_LAYOUT } from './apis'

export default {
  blockchain: 'solana',
  name: 'orca',
  label: 'Orca',
  logo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI3LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9ImthdG1hbl8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCIKCSB2aWV3Qm94PSIwIDAgNjAwIDQ1MCIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgNjAwIDQ1MDsiIHhtbDpzcGFjZT0icHJlc2VydmUiPgo8cGF0aCBmaWxsPSIjRkZEMTVDIiBkPSJNNDg4LjQsMjIyLjljMCwxMDMuOC04NC4xLDE4Ny45LTE4Ny45LDE4Ny45Yy0xMDMuOCwwLTE4Ny45LTg0LjEtMTg3LjktMTg3LjlDMTEyLjYsMTE5LjEsMTk2LjcsMzUsMzAwLjUsMzUKCUM0MDQuMiwzNSw0ODguNCwxMTkuMSw0ODguNCwyMjIuOXoiLz4KPHBhdGggZmlsbD0iI0ZGRkZGRiIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjE3LjY3NTUiIGQ9Ik0yMDkuNSwyOTkuOGMxLjYtMS4xLDMuMS0yLjgsMy45LTUuMWMwLjgtMi42LDAuMy00LjksMC02LjJjMCwwLDAtMC4xLDAtMC4xbDAuMy0xLjhjMC45LDAuNSwxLjksMS4xLDMsMS45CgljMC4zLDAuMiwwLjcsMC41LDEuMSwwLjdjMC41LDAuNCwxLjEsMC44LDEuNCwxYzAuNiwwLjQsMS41LDEsMi41LDEuNWMyNS4xLDE1LjYsNDUuOCwyMiw2Mi4yLDIxLjJjMTctMC44LDI4LjktOS40LDM1LjEtMjEuOQoJYzUuOS0xMi4xLDYuMi0yNywyLTQwLjljLTQuMi0xMy45LTEzLTI3LjUtMjYuMi0zNi45Yy0yMi4yLTE1LjgtNDIuNS0zOS44LTUyLjctNjAuM2MtNS4yLTEwLjQtNy4zLTE4LjctNi43LTI0LjIKCWMwLjMtMi41LDEtNC4xLDItNS4xYzAuOS0xLDIuNi0yLjEsNS45LTIuNmM2LjktMS4xLDE1LTMuNiwyMy4xLTYuMmMzLjItMSw2LjMtMiw5LjUtMi45YzExLjctMy40LDI0LjItNi4zLDM3LjItNi4zCgljMjUuMywwLDU1LDExLDg2LjMsNTYuOGM0MC4yLDU4LjgsMTguMSwxMjQuNC0yOC4yLDE1OC45Yy0yMy4xLDE3LjItNTEuOSwyNi4zLTgxLjUsMjIuOUMyNjIuOSwzNDEuMywyMzQuOSwzMjcuOSwyMDkuNSwyOTkuOHoKCSBNMjE0LjIsMjg0LjZDMjE0LjIsMjg0LjYsMjE0LjIsMjg0LjcsMjE0LjIsMjg0LjZDMjE0LjEsMjg0LjcsMjE0LjIsMjg0LjYsMjE0LjIsMjg0LjZ6IE0yMTEuNiwyODUuOAoJQzIxMS42LDI4NS44LDIxMS43LDI4NS44LDIxMS42LDI4NS44QzIxMS43LDI4NS44LDIxMS42LDI4NS44LDIxMS42LDI4NS44eiIvPgo8cGF0aCBkPSJNMjMyLjUsMTI0LjNjMCwwLDcxLjgtMTkuMSw4Ny41LTE5LjFjMTUuNywwLDc4LjYsMzAuNSw5Ni45LDg2LjNjMjYsNzktNDQuNywxMzAuOS01Mi43LDEyNS44CgljNzYuMS02Mi45LTQ4LjQtMTc5LjEtMTA5LjYtMTcwLjRjLTcuNiwxLjEtMy40LDcuNi0zLjQsNy42bC0xLjcsMTdsLTEyLjctMjEuMkwyMzIuNSwxMjQuM3oiLz4KPHBhdGggZD0iTTQwNi41LDE2Ny42YzIyLjcsMzkuOSwxOCwxNy4xLDEyLjksNjIuN2M5LjMtMTUuMSwyMy45LTMuOCwyOS45LDJjMS4xLDEsMi45LDAuNCwyLjgtMS4xYy0wLjItNi44LTIuMi0yMS40LTEzLjQtMzcuMQoJQzQyMy40LDE3Mi42LDQwNi41LDE2Ny42LDQwNi41LDE2Ny42eiIvPgo8cGF0aCBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAwMDAiIHN0cm9rZS13aWR0aD0iMC45OTMiIGQ9Ik00MTkuNCwyMzAuM2M1LTQ1LjYsOS43LTIyLjgtMTIuOS02Mi43YzAsMCwxNi45LDUsMzIuMywyNi41YzExLjIsMTUuNywxMy4xLDMwLjMsMTMuNCwzNy4xCgljMC4xLDEuNS0xLjcsMi4xLTIuOCwxLjFDNDQzLjMsMjI2LjUsNDI4LjcsMjE1LjMsNDE5LjQsMjMwLjN6IE00MTkuNCwyMzAuM2MwLjktMi4xLDIuMi01LjUsMi4yLTUuNSIvPgo8cGF0aCBkPSJNMjI0LDIyNC4yYy05LjYsMTYuMi0yOS4yLDE1LTI4LjgsMzQuM2MxNy41LDM5LDE3LjYsMzYuMiwxNy42LDM2LjJjMzIuNS0xOC4yLDE5LjEtNTguNSwxNC4zLTcwLjQKCUMyMjYuNiwyMjMsMjI0LjcsMjIzLDIyNCwyMjQuMnoiLz4KPHBhdGggZD0iTTE1MC40LDI2MC4xYzE4LjcsMi40LDI5LjgtMTMuOCw0NC44LTEuNmMxOS45LDM3LjgsMTcuNiwzNi4yLDE3LjYsMzYuMmMtMzQuNCwxNC40LTU3LjktMjEtNjQuMy0zMi4xCglDMTQ3LjgsMjYxLjMsMTQ5LDI1OS45LDE1MC40LDI2MC4xeiIvPgo8cGF0aCBkPSJNMzA2LjksMjM2YzAsMCwxOC43LDE5LjEsOC45LDIyLjFjLTEyLjItNy41LTM0LTEuNy00NC43LDEuOWMtMi42LDAuOS01LjItMS40LTQuMy00LjFjMy42LTEwLDEyLjYtMjguNiwyOS45LTMxCglDMzA2LjksMjIyLjQsMzA2LjksMjM2LDMwNi45LDIzNnoiLz4KPHBhdGggZmlsbD0iI0ZGRkZGRiIgZD0iTTMxOC4zLDE0Mi41Yy0yLjEtMy02LjQtMTEsNi44LTExYzEzLjIsMCwzMy4zLDE0LjksMzcuNCwyMC40Yy0xLjMsMy40LTkuOCw0LjEtMTQsMy44Yy00LjItMC4zLTExLjUtMS0xNy0zLjgKCUMzMjYsMTQ5LjIsMzIwLjUsMTQ1LjUsMzE4LjMsMTQyLjV6Ii8+Cjwvc3ZnPgo=',
  router: {
    v1: {
      address: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
      api: WHIRLPOOL_LAYOUT,
    },
  },
  slippage: true,
}
