import { BigNumber } from "ethers";
import { HardhatEthersHelpers } from "hardhat/types";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const aavegotchiDiamondAddressMatic =
  "0x86935F11C86623deC8a25696E1C19a8659CbF95d";
export const fudAddress = "0x403e967b044d4be25170310157cb1a4bf10bdd0f";
export const fomoAddress = "0x44a6e0be76e1d9620a7f76588e4509fe4fa8e8c8";
export const alphaAddress = "0x6a3e7c3c6ef65ee26975b12293ca1aad7e1daed2";
export const kekAddress = "0x42e5e06ef5b90fe15f853f59299fc96259209c5c";
export const ghstAddress = "0x385eeac5cb85a38a9a07a70c73e0a3271cfb54a7";
export const aavegotchiDAOAddress =
  "0xb208f8BB431f580CC4b216826AFfB128cd1431aB";
export const pixelcraftAddress = "0xD4151c984e6CF33E04FFAAF06c3374B2926Ecc64";
export const playerRewardsAddress =
  "0x27df5c6dcd360f372e23d5e63645ec0072d0c098";
export const snapshotGraphUrl = "https://hub.snapshot.org/graphql";

export const WEARABLE_GAP_OFFSET = 1000000000;

// Forge asset token IDs
export const ALLOY = WEARABLE_GAP_OFFSET;
export const ESSENCE = WEARABLE_GAP_OFFSET + 1;
export const GEODE_COMMON = WEARABLE_GAP_OFFSET + 2;
export const GEODE_UNCOMMON = WEARABLE_GAP_OFFSET + 3;
export const GEODE_RARE = WEARABLE_GAP_OFFSET + 4;
export const GEODE_LEGENDARY = WEARABLE_GAP_OFFSET + 5;
export const GEODE_MYTHICAL = WEARABLE_GAP_OFFSET + 6;
export const GEODE_GODLIKE = WEARABLE_GAP_OFFSET + 7;

export const CORE_BODY_COMMON = WEARABLE_GAP_OFFSET + 8;
export const CORE_BODY_UNCOMMON = WEARABLE_GAP_OFFSET + 9;
export const CORE_BODY_RARE = WEARABLE_GAP_OFFSET + 10;
export const CORE_BODY_LEGENDARY = WEARABLE_GAP_OFFSET + 11;
export const CORE_BODY_MYTHICAL = WEARABLE_GAP_OFFSET + 12;
export const CORE_BODY_GODLIKE = WEARABLE_GAP_OFFSET + 13;

export const CORE_FACE_COMMON = WEARABLE_GAP_OFFSET + 14;
export const CORE_FACE_UNCOMMON = WEARABLE_GAP_OFFSET + 15;
export const CORE_FACE_RARE = WEARABLE_GAP_OFFSET + 16;
export const CORE_FACE_LEGENDARY = WEARABLE_GAP_OFFSET + 17;
export const CORE_FACE_MYTHICAL = WEARABLE_GAP_OFFSET + 18;
export const CORE_FACE_GODLIKE = WEARABLE_GAP_OFFSET + 19;

export const CORE_EYES_COMMON = WEARABLE_GAP_OFFSET + 20;
export const CORE_EYES_UNCOMMON = WEARABLE_GAP_OFFSET + 21;
export const CORE_EYES_RARE = WEARABLE_GAP_OFFSET + 22;
export const CORE_EYES_LEGENDARY = WEARABLE_GAP_OFFSET + 23;
export const CORE_EYES_MYTHICAL = WEARABLE_GAP_OFFSET + 24;
export const CORE_EYES_GODLIKE = WEARABLE_GAP_OFFSET + 25;

export const CORE_HEAD_COMMON = WEARABLE_GAP_OFFSET + 26;
export const CORE_HEAD_UNCOMMON = WEARABLE_GAP_OFFSET + 27;
export const CORE_HEAD_RARE = WEARABLE_GAP_OFFSET + 28;
export const CORE_HEAD_LEGENDARY = WEARABLE_GAP_OFFSET + 29;
export const CORE_HEAD_MYTHICAL = WEARABLE_GAP_OFFSET + 30;
export const CORE_HEAD_GODLIKE = WEARABLE_GAP_OFFSET + 31;

export const CORE_HANDS_COMMON = WEARABLE_GAP_OFFSET + 32;
export const CORE_HANDS_UNCOMMON = WEARABLE_GAP_OFFSET + 33;
export const CORE_HANDS_RARE = WEARABLE_GAP_OFFSET + 34;
export const CORE_HANDS_LEGENDARY = WEARABLE_GAP_OFFSET + 35;
export const CORE_HANDS_MYTHICAL = WEARABLE_GAP_OFFSET + 36;
export const CORE_HANDS_GODLIKE = WEARABLE_GAP_OFFSET + 37;

export const CORE_PET_COMMON = WEARABLE_GAP_OFFSET + 38;
export const CORE_PET_UNCOMMON = WEARABLE_GAP_OFFSET + 39;
export const CORE_PET_RARE = WEARABLE_GAP_OFFSET + 40;
export const CORE_PET_LEGENDARY = WEARABLE_GAP_OFFSET + 41;
export const CORE_PET_MYTHICAL = WEARABLE_GAP_OFFSET + 42;
export const CORE_PET_GODLIKE = WEARABLE_GAP_OFFSET + 43;

export const AMOY_DIAMOND = "0xC80DB01aeDAD5F6E3088c75F60E52f579Cf1D3Cb";
export const AMOY_DIAMOND_OWNER = "0xB9D736c48351Bad464710ee73BA80A0A659c1795";
export const AMOY_GHST = "0xF679b8D109b2d23931237Ce948a7D784727c0897";
export const AMOY_WEARABLE_DIAMOND =
  "0xAA201d960404140296Ea85570940830be08DAc70";
export const AMOY_FORGE_DIAMOND = "0xF7c2AC46723Ad844620F798ECe67f5C673120FB6";

interface NetworkAddresses {
  ghst: string;
  aavegotchiDiamond?: string;
  wearableDiamond?: string;
  forgeDiamond?: string;
  vrfSystem?: string;
  relayerPetter?: string;
  // vrfVars?: string;
  safeProxyFactory?: string;
  realmDiamond?: string;
  installationDiamond?: string;
  tileDiamond?: string;
  fakeGotchiCardDiamond?: string;
  fakeGotchiArtDiamond?: string;
  ghstStakingDiamond?: string;
  ggSkinsDiamond?: string;
  ggProfilesDiamond?: string;
  //REALM
  fud?: string;
  fomo?: string;
  alpha?: string;
  kek?: string;
  gltrAddress?: string;
  aavegotchiDaoAddress?: string;
}

// export const vrfVars: Record<number, VRFVars> = {
//   //base Sepolia
//   84532: {
//     linkAddress: "0xE4aB69C077896252FAFBD49EFD26B5D171A32410",
//     keyHash:
//       "0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71",
//     subId: BigNumber.from(
//       "72591281827055554057534631089554678415620592034035525148607866650220315375510"
//     ),
//     requestConfirmations: 32,
//     callbackGasLimit: 2_500_000,
//     numWords: 4,
//     //use LINK for payment
//     nativePayment: false,
//   },
//   //same place-holder values for local
//   31337: {
//     linkAddress: "0xE4aB69C077896252FAFBD49EFD26B5D171A32410",
//     keyHash:
//       "0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71",
//     subId: BigNumber.from(
//       "72591281827055554057534631089554678415620592034035525148607866650220315375510"
//     ),
//     requestConfirmations: 32,
//     callbackGasLimit: 2_500_00,
//     numWords: 4,
//     //use LINK for payment
//     nativePayment: false,
//   },
// };

export const networkAddresses: Record<number, NetworkAddresses> = {
  137: {
    ghst: "0x443650Be09A02Be6fa79Ba19169A853A33581660",
    safeProxyFactory: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
    aavegotchiDiamond: "0x86935F11C86623deC8a25696E1C19a8659CbF95d",
    forgeDiamond: "0x4fDfc1B53Fd1D80d969C984ba7a8CE4c7bAaD442",
    wearableDiamond: "0x58de9AaBCaeEC0f69883C94318810ad79Cc6a44f",
  },
  31337: {
    ghst: "0x443650Be09A02Be6fa79Ba19169A853A33581660",
    vrfSystem: "0x8aFDcAA4573A36061aC087F9Ba872A7C7F482CFC",
    // vrfVars: vrfVars[84532],
    safeProxyFactory: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
    aavegotchiDiamond: "0x03A74B3e2DD81F5E8FFA1Fb96bb81B35cF3ed5d2",
    forgeDiamond: "0xf0b0aFA15c61E939dD7Ae2e82Fbe98FFd5598C65",
    wearableDiamond: "0x83FAaC162062524e041dFB43681B0d958eD49Acb",
  },

  631571: {
    ghst: "0x443650Be09A02Be6fa79Ba19169A853A33581660",
  },

  63157: {
    ghst: "0x74e2051A9Cd994F83f2d789448dCa4a3e879964c",
    aavegotchiDiamond: "0x6Acc828BbbC6874de40Ca20bfeA7Cd2a2DA8DA8c",
  },

  84532: {
    ghst: "0xe97f36a00058aa7dfc4e85d23532c3f70453a7ae",
    vrfSystem: "0x8aFDcAA4573A36061aC087F9Ba872A7C7F482CFC",
    // vrfVars: vrfVars[84532],
    safeProxyFactory: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
    aavegotchiDiamond: "0x03A74B3e2DD81F5E8FFA1Fb96bb81B35cF3ed5d2",
    forgeDiamond: "0x40742c1D9dd604889aD45D2f85bE9C9A7609C4cB",
    wearableDiamond: "0x7e1Df5ad57C011E3bFA029041935aece51f35ccC",
    realmDiamond: "0x37D140074B2f771bEa7ef23288EB87064e45bF8D",
    installationDiamond: "0x5Aefdc5283B24EEa7b50FFBBf7FB8A2bD4537609",
    tileDiamond: "0x96B19Fa954d961fAD4b665e3259C72466ca4C1dA",
    fakeGotchiCardDiamond: "0xE4E508dab5D7d98f4c06aB6D24bB225588036C9D",
    fakeGotchiArtDiamond: "0xD0dCC1d1E22D490e5270631787E1866E773b16C7",
    ghstStakingDiamond: "0xD0dCC1d1E22D490e5270631787E1866E773b16C7",
    ggSkinsDiamond: "0xab1e7e320f02107bf2748179ed0c0bcfd5532e4a",
    ggProfilesDiamond: "0x15517138573ce459943da529c9530ef76a22b713",
    fud: "0x98810DD548cd39213A609ef373c7eBD5524b32F8",
    fomo: "0xe67A189A9efF5B72B236ECf7B1Ac249d3496e31E",
    alpha: "0x48bAC15D5561a92E232523ed3660A884C21E93c3",
    kek: "0x03f2D8689177d2ebc9686C01065818c02C053f6a",
    gltrAddress: "0x0dBFBABa88b32a96ee2c9b60007ddc03D0F1F379",
    aavegotchiDaoAddress: "0x01F010a5e001fe9d6940758EA5e8c777885E351e",
  },

  8453: {
    ghst: "0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb",
    vrfSystem: "0x9eC728Fce50c77e0BeF7d34F1ab28a46409b7aF1",
    safeProxyFactory: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
    //@to-do: update aavegotchiDaoAddress for bsae mainnet
    aavegotchiDaoAddress: "0x01F010a5e001fe9d6940758EA5e8c777885E351e",
    relayerPetter: "0xf52398257A254D541F392667600901f710a006eD",
  },
};

export interface VRFVars {
  linkAddress: string;
  keyHash: string;
  subId: BigNumber;
  requestConfirmations: number;
  callbackGasLimit: number;
  numWords: number;
  nativePayment: boolean;
}

export async function varsForNetwork(ethers: HardhatEthersHelpers) {
  return varsByChainId((await ethers.provider.getNetwork()).chainId);
}

export function varsByChainId(chainId: number) {
  return networkAddresses[chainId];
}

export enum ERC1155_BAAZAAR_CATEGORY_TO_ID {
  WEARABLE = 0,
  BADGE = 1,
  CONSUMABLE = 2,
  TICKET = 3,
  INSTALLATION = 4,
  TILE = 5,
  FAKECARDS = 6,
}

export enum ERC721_BAAZAAR_CATEGORY_TO_ID {
  PORTAL_CLOSED = 0,
  PORTAL_SUMMONING = 1,
  PORTAL_OPEN = 2,
  AAVEGOTCHI = 3,
  REALM = 4,
  FAKEGOTCHIS = 5,
}
export enum WEARABLE_BASE_QUANTITIES {
  COMMON = 1000,
  UNCOMMON = 500,
  RARE = 250,
  LEGENDARY = 100,
  MYTHICAL = 50,
  GODLIKE = 10,
}

export function baseSepoliaProvider() {
  const url = process.env.BASE_SEPOLIA_RPC_URL;
  if (!url) {
    throw new Error("BASE_SEPOLIA_RPC_URL not found in environment variables");
  }
  return new ethers.providers.JsonRpcProvider(url);
}

export function baseProvider() {
  const url = process.env.BASE_RPC_URL;
  if (!url) {
    throw new Error("BASE_RPC_URL not found in environment variables");
  }
  console.log("Using Base URL:", url);
  return new ethers.providers.JsonRpcProvider(url);
}
