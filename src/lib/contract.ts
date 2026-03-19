import { type Address } from "viem";

export const HUB_CHAIN_ID = 420420417;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const CONTRACTS = {
  polkadotTestnet: {
    chainId: HUB_CHAIN_ID,
    demoUSDC: "0xB5A046866F4e4FBDEc4a718A7575f6965CD68a2B" as Address,
    demoUSDT: "0x61130d37f3E2a8FA4865a499Ad2c2C21db52b9BB" as Address,
    demoDOMAIN: "0xf6e551781bd19e1ED8dF95b830fB6dd1B60D79eC" as Address,
    demoTCC: "0x3DfD59592B0D34b1B223a8Ef65F8B5ccbD8b580e" as Address,
    demoTCX: "0xb4FE961AB3E78C2feB02aa96d90714b9409f89d4" as Address,
    demoTCH: "0x8ABd2F9A893d8617a6D069ab85cD88E4bcD57D87" as Address,
    demoPAI: "0x8e0b51533668D7F3006837ddD26Bcb9addcae72D" as Address,
    demoHLT: "0x729CC2858C6C51098711810D9D0420b0Cffc9159" as Address,
    demoRWA: "0xf075Bc673908B46059d6EFFd47b209966B38Be0B" as Address,
    demoYIELD: "0x9e9A3972F0649c9e0c945D40cf44678db974Ad6B" as Address,
    demoINFRA: "0x1641692A5c3207Fa5eDF4D595e80DceE1B88B119" as Address,
    demoCARB: "0x1fC9e691b8D56b7E05C416796Cee818e007fEb39" as Address,
    defaiPlatform: "0x67f679C30eD7eE3A11b82311301A20cD1448Be8C" as Address,
    defaiBridgeGateway: "0xf0a5F7B7692A8F7824125CAd45f1c843110e0457" as Address,
    defaiStakingVaultUSDC: "0xe8871052897509359978e0B4e737Cf2D6aB3a901" as Address,
    defaiStakingVaultUSDT: "0x854594344E87ad525611696dfc4042Fa0731A932" as Address,
    defaiStakingVaultDOMAIN: "0x4Ba7493721dF9FB3D2fB45Bfb20EB457Eca04A81" as Address,
    defaiStakingVaultTCC: "0x15Ca6247711089a4b355388bDeD359Eb9E1e7B6f" as Address,
    defaiStakingVaultTCX: "0xEf76218C69B8B6737E42f8f50273A52b1D1486aF" as Address,
    defaiStakingVaultTCH: "0x970Bbd15e5795900D71a93e5aD6e882Db9f0117c" as Address,
    defaiStakingVaultPAI: "0xDaaf4D7E3a367401B3d5A678004C3554869FF6Be" as Address,
    defaiStakingVaultHLT: "0x56e08Dbb83a0d5d14328faE587E997119A0751e8" as Address,
    defaiStakingVaultRWA: "0x775C46204a9D03646FD596452f0966FDC00883A8" as Address,
    defaiStakingVaultYIELD: "0xee11aaAF9266A4BBf181199EEc933eA7b5518A54" as Address,
    defaiStakingVaultINFRA: "0x05EFf9eCf8ae76fB55Cf1B9649ae2d4231579aE0" as Address,
    defaiStakingVaultCARB: "0x5eD4Fb6EbED9E717b5EbaD7B7bfD6B1C6E0132C5" as Address,
    defaiAccessPassNFT: "0x3819Fd76D571caab36Ce1CC6252EcC79d4226E94" as Address,
    defaiSimpleSwap: "0x744fb452a94CE96Da6B2d0bb56E1d62f0Ef7261b" as Address,
    defaiAmmPool: "0x747847629a52Ce36Bb6181305369727229bF4e83" as Address,
    defaiTokenFactory: "0x1eFDb1bA558a2EDb09d04eF0aCb070Bd80aE3bcD" as Address,
  },
  baseSepolia: {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    demoUSDC: "0x20C11721A3Df8ACAE892dD9CF247bb37470FD450" as Address,
    demoUSDT: "0x8f6f67F7C773565F12EA5473BFca80a87F560708" as Address,
    defaiBridgeGateway: "0x6B547BE75203e0C4c54071e9E9c235F36D642A06" as Address,
  },
} as const;

