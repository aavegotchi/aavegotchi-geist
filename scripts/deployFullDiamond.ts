/* global ethers hre */

import { ethers, network, run } from "hardhat";
import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";

import {
  getItemTypes,
  ItemTypeInputNew,
  SleeveObject,
  toItemTypeInputNew,
} from "./itemTypeHelpers";
import { itemTypes as allItemTypes } from "../data/itemTypes/itemTypes";
import { wearableSetArrays } from "./wearableSets";

import {
  AavegotchiGameFacet,
  SvgFacet,
  DAOFacet,
  ERC721MarketplaceFacet,
  ERC1155MarketplaceFacet,
} from "../typechain";
import { uploadSvgs } from "./svgHelperFunctions";
import { getWearables } from "../svgs/allWearables";
import { closedPortals, openedPortals } from "../svgs/portals";

import { setForgeProperties } from "./upgrades/forge/upgrade-forgeSetters";
import { aavegotchiSvgs as aavegotchiSideSvgs } from "../svgs/aavegotchi-side-typeScript";

import {
  eyeShapesLeftSvgs,
  eyeShapesRightSvgs,
} from "../svgs/eyeShapes-sidesOpt";

import {
  eyeShapesLeftSvgs as eyeShapesH2LeftSvgs,
  eyeShapesRightSvgs as eyeShapesH2RightSvgs,
} from "../svgs/eyeShapesH2-sidesOpt";

import {
  wearablesLeftSvgs,
  wearablesRightSvgs,
  wearablesBackSvgs,
  wearablesLeftSleeveSvgs,
  wearablesRightSleeveSvgs,
  wearablesBackSleeveSvgs,
} from "../svgs/wearables-sides";

import { aavegotchiSvgs } from "../svgs/aavegotchi-typescript";
import { allSideViewDimensions } from "../svgs/sideViewDimensions";
import { convertSideDimensionsToTaskFormat } from "../tasks/updateItemSideDimensions";
import { allExceptions } from "../svgs/allExceptions";
import { convertExceptionsToTaskFormat } from "../tasks/updateWearableExceptions";

// import {
//   deploy,
//   deployWithoutInit,
//   executeTransactionWithRetry,
// } from "../js/diamond-util/src";

import {
  getCollaterals,
  h1Collaterals,
} from "../data/airdrops/collaterals/collateralTypes";
import { collaterals as h2Collaterals } from "../data/airdrops/collaterals/collateralTypesHaunt2";
import { networkAddresses } from "../helpers/constants";

// Import fs and path for file operations
import * as os from "os";
import { BigNumber, BigNumberish, Contract, Signer } from "ethers";
import {
  collateralsLeftSvgs,
  collateralsRightSvgs,
} from "../svgs/collaterals-sides";
import { getRelayerSigner } from "./helperFunctions";
import { deployWithoutInit, deploy } from "../js/diamond-util/src";

// Define the interface for the deployment configuration
export interface DeploymentConfig {
  chainId: number;
  aavegotchiDiamond: string | undefined;
  wearableDiamond: string | undefined;
  forgeDiamond: string | undefined;
  haunts: Record<number, boolean>;
  itemTypes: Record<number, boolean>;
  wearableSetsAdded: boolean;
  sideViewDimensionsAdded: boolean;
  sideViewExceptionsAdded: boolean;
  forgePropertiesSet: boolean;
  forgeDiamondSet: boolean;
  svgsUploaded: {
    [key: string]: {
      [id: string]: boolean;
    };
  };
  // realmAddressSet: boolean;
  wearableSets: Record<string, boolean>;
  sideViewDimensions: Record<string, string>;
  sideViewExceptions: Record<string, boolean>;
  [key: string]: any; //other addresses
  itemManagers: string[] | undefined;
}

// Define the path to the deployment configuration file
const CONFIG_PATH = path.join(__dirname, "../deployment-config.json");

// Load the deployment configuration specific to the current chainId
export function loadDeploymentConfig(
  chainId: number,
  useFreshDeploy: boolean = true
): DeploymentConfig {
  if (useFreshDeploy) {
    return {
      chainId: chainId,
      aavegotchiDiamond: undefined,
      wearableDiamond: undefined,
      forgeDiamond: undefined,
      haunts: {},
      itemTypes: {},
      wearableSets: {},
      sideViewDimensions: {},
      sideViewExceptions: {},
      forgePropertiesSet: false,
      forgeDiamondSet: false,
      wearableSetsAdded: false,
      sideViewDimensionsAdded: false,
      sideViewExceptionsAdded: false,
      svgsUploaded: {},

      // realmAddressSet: false,
      itemManagers: undefined,
    };
  }

  try {
    const data = fs.readFileSync(CONFIG_PATH, "utf8");
    const allConfigs = JSON.parse(data);
    console.log("Loading deployment config for chainId", chainId);
    return allConfigs[chainId] || { chainId };
  } catch (error) {
    console.log("No existing deployment config found for chainId", chainId);
    return {
      chainId: chainId,
      aavegotchiDiamond: undefined,
      wearableDiamond: undefined,
      forgeDiamond: undefined,
      haunts: {},
      itemTypes: {},
      wearableSets: {},
      sideViewDimensions: {},
      sideViewExceptions: {},
      itemManagers: undefined,
      realmAddressSet: false,
      svgsUploaded: {},
      sideViewDimensionsAdded: false,
      sideViewExceptionsAdded: false,
      forgePropertiesSet: false,
      forgeDiamondSet: false,
      wearableSetsAdded: false,
    };
  }
}

// Save the deployment configuration specific to the current chainId
export function saveDeploymentConfig(config: DeploymentConfig) {
  let allConfigs: Record<number, DeploymentConfig> = {};
  try {
    const data = fs.readFileSync(CONFIG_PATH, "utf8");
    allConfigs = JSON.parse(data);
  } catch (error) {
    // No existing configs; start fresh
  }
  allConfigs[config.chainId] = config;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(allConfigs, null, 2) + os.EOL);
}

function addCommas(nStr: any) {
  nStr += "";
  const x = nStr.split(".");
  let x1 = x[0];
  const x2 = x.length > 1 ? "." + x[1] : "";
  const rgx = /(\d+)(\d{3})/;
  while (rgx.test(x1)) {
    x1 = x1.replace(rgx, "$1" + "," + "$2");
  }
  return x1 + x2;
}

export function strDisplay(str: any) {
  return addCommas(str.toString());
}

async function deployForgeDiamond(
  ownerAddress: string,
  aavegotchiDiamondAddress: string,
  wearableDiamondAddress: string,
  vrfSystemAddress: string,
  deploymentConfig: DeploymentConfig,
  signer: Signer
) {
  // Deploy forge facets

  const forgeDiamond = await deployWithoutInit({
    diamondName: "ForgeDiamond",
    facetNames: [
      "ForgeFacet",
      "ForgeTokenFacet",
      "ForgeVRFFacet",
      "ForgeDAOFacet",
    ],
    signer,
    args: [
      ownerAddress,
      aavegotchiDiamondAddress,
      wearableDiamondAddress,
      vrfSystemAddress,
    ],
    deploymentConfig,
  });

  return forgeDiamond;
}

async function createHauntWithCollaterals(
  hauntId: number,
  daoFacet: DAOFacet,
  initialHauntSize: string,
  portalPrice: BigNumberish,
  collaterals: any[],
  currentTotalGasUsed: BigNumber,
  hauntSigner: Signer
) {
  console.log(`Creating Haunt ${hauntId}`);
  const txHaunt = await daoFacet
    .connect(hauntSigner)
    .createHaunt(initialHauntSize, portalPrice, "0x000000");
  const receiptHaunt = await ethers.provider.waitForTransaction(
    txHaunt.hash,
    1
  );
  if (receiptHaunt.status !== 1) {
    throw new Error(`Creating Haunt ${hauntId} failed. Tx: ${txHaunt.hash}`);
  }
  console.log(
    "Haunt created:" +
      strDisplay(receiptHaunt.gasUsed) +
      ` (tx: ${txHaunt.hash})`
  );
  currentTotalGasUsed = currentTotalGasUsed.add(receiptHaunt.gasUsed);

  console.log("Adding Collateral Types for Haunt", hauntId);
  const txCollaterals = await daoFacet
    .connect(hauntSigner)
    .addCollateralTypes(hauntId, collaterals);
  const receiptCollaterals = await ethers.provider.waitForTransaction(
    txCollaterals.hash,
    1
  );
  if (receiptCollaterals.status !== 1) {
    throw new Error(
      `Adding Collateral Types for Haunt ${hauntId} failed. Tx: ${txCollaterals.hash}`
    );
  }
  console.log(
    "Add Collateral Types gas used::" +
      strDisplay(receiptCollaterals.gasUsed) +
      ` (tx: ${txCollaterals.hash})`
  );
  currentTotalGasUsed = currentTotalGasUsed.add(receiptCollaterals.gasUsed);
  return currentTotalGasUsed;
}

async function addItemTypes(
  daoFacet: DAOFacet,
  totalGasUsed: BigNumber,
  deploymentConfig: DeploymentConfig,
  signer: Signer
) {
  deploymentConfig.itemTypes = deploymentConfig.itemTypes || {};
  console.log("Adding item types");

  const itemTypes2: ItemTypeInputNew[] = [];
  for (let i = 0; i < allItemTypes.length; i++) {
    if (deploymentConfig.itemTypes[Number(allItemTypes[i].svgId)]) {
      continue;
    }
    itemTypes2.push(toItemTypeInputNew(allItemTypes[i]));
  }

  if (itemTypes2.length === 0) {
    console.log("All item types already added.");
    return totalGasUsed;
  }

  const itemTypes = getItemTypes(itemTypes2, ethers);
  console.log("Adding", itemTypes2.length, "Item Types");
  const batchSize = 20;
  const totalItems = itemTypes.length;
  const totalBatches = Math.ceil(totalItems / batchSize);

  for (let i = 0; i < totalBatches; i++) {
    const start = batchSize * i;
    const end = start + batchSize;
    const batch = itemTypes.slice(start, end);

    console.log(`Adding Item Types Batch ${i + 1} of ${totalBatches}`);
    const tx = await daoFacet.connect(signer).addItemTypes(batch);
    const receipt = await ethers.provider.waitForTransaction(tx.hash, 1);
    if (receipt.status !== 1) {
      throw new Error(
        `Adding Item Types Batch ${i + 1} failed. Tx: ${tx.hash}`
      );
    }

    batch.forEach((item, index) => {
      const originalItem = itemTypes2[start + index];
      deploymentConfig.itemTypes![Number(originalItem.svgId)] = true;
    });
    saveDeploymentConfig(deploymentConfig);

    console.log(
      `Adding Item Types Batch ${
        i + 1
      } of ${totalBatches}, gas used:: ${strDisplay(receipt.gasUsed)} (tx: ${
        tx.hash
      })`
    );
    totalGasUsed = totalGasUsed.add(receipt.gasUsed);
  }
  console.log("Finished adding itemTypes");
  return totalGasUsed;
}

async function addWearableSets(
  daoFacet: DAOFacet,
  totalGasUsed: BigNumber,
  deploymentConfig: DeploymentConfig,
  signer: Signer
) {
  deploymentConfig.wearableSets = deploymentConfig.wearableSets || {};
  const setsToAdd = wearableSetArrays.filter(
    (set) => !deploymentConfig.wearableSets![set.name]
  );

  if (setsToAdd.length === 0) {
    console.log("All wearable sets already added.");
    return totalGasUsed;
  }

  console.log("Adding", setsToAdd.length, "Wearable Sets");
  const batchSize = 50;
  const totalBatches = Math.ceil(setsToAdd.length / batchSize);

  for (let i = 0; i < totalBatches; i++) {
    const start = batchSize * i;
    const end = start + batchSize;
    const batch = setsToAdd.slice(start, end);

    console.log(`Adding Wearable Sets Batch ${i + 1} of ${totalBatches}`);
    const tx = await daoFacet.connect(signer).addWearableSets(batch as any);
    const receipt = await ethers.provider.waitForTransaction(tx.hash, 1);
    if (receipt.status !== 1) {
      throw new Error(
        `Adding Wearable Sets Batch ${i + 1} failed. Tx: ${tx.hash}`
      );
    }

    batch.forEach((set) => {
      deploymentConfig.wearableSets![set.name] = true;
    });
    saveDeploymentConfig(deploymentConfig);

    console.log(
      `Adding Wearable Sets Batch ${
        i + 1
      } of ${totalBatches}, gas used:: ${strDisplay(receipt.gasUsed)} (tx: ${
        tx.hash
      })`
    );
    totalGasUsed = totalGasUsed.add(receipt.gasUsed);
  }
  return totalGasUsed;
}

async function addSideViewDimensions(
  aavegotchiDiamondAddress: string,
  deploymentConfig: DeploymentConfig
) {
  // Initialize sideViewDimensions in config if not exists
  deploymentConfig.sideViewDimensions =
    deploymentConfig.sideViewDimensions || {};

  // Filter only unprocessed dimensions
  const dimensionsToAdd = allSideViewDimensions.filter(
    (dim) => !deploymentConfig.sideViewDimensions![Number(dim.itemId)]
  );

  if (dimensionsToAdd.length === 0) {
    console.log("All side view dimensions already added.");
    return;
  }

  // Add side view dimensions in batches
  const batchSize = 200;
  console.log("adding", dimensionsToAdd.length, "sideviews");
  const totalBatches = Math.ceil(dimensionsToAdd.length / batchSize);

  for (let i = 0; i < totalBatches; i++) {
    const start = batchSize * i;
    const end = Math.min(start + batchSize, dimensionsToAdd.length);
    const batch = dimensionsToAdd.slice(start, end);

    console.log(`Adding Sideview Dimensions (${i + 1} / ${totalBatches})`);
    await run(
      "updateItemSideDimensions",
      convertSideDimensionsToTaskFormat(batch, aavegotchiDiamondAddress)
    );

    // Mark these dimensions as added in the config
    batch.forEach((dim) => {
      deploymentConfig.sideViewDimensions![
        Number(dim.itemId)
      ] = `${dim.dimensions.x}_${dim.dimensions.y}`;
    });

    // Save after each batch
    saveDeploymentConfig(deploymentConfig);
  }
}

async function addSideviewExceptions(
  aavegotchiDiamondAddress: string,
  deploymentConfig: DeploymentConfig
) {
  // Initialize sideViewExceptions in config if not exists
  deploymentConfig.sideViewExceptions =
    deploymentConfig.sideViewExceptions || {};

  // Filter only unprocessed exceptions
  const exceptionsToAdd = allExceptions.filter(
    (exception) =>
      !deploymentConfig.sideViewExceptions![
        `${exception.slotPosition}_${exception.itemId}`
      ]
  );

  if (exceptionsToAdd.length === 0) {
    console.log("All side view exceptions already added.");
    return;
  }

  // Add side view exceptions in batches
  const batchSize = 100;
  console.log("adding", exceptionsToAdd.length, "exceptions");
  const totalBatches = Math.ceil(exceptionsToAdd.length / batchSize);

  for (let i = 0; i < totalBatches; i++) {
    const start = batchSize * i;
    const end = Math.min(start + batchSize, exceptionsToAdd.length);
    const batch = exceptionsToAdd.slice(start, end);

    console.log(`Adding Sideview Exceptions (${i + 1} / ${totalBatches})`);
    await run(
      "updateWearableExceptions",
      convertExceptionsToTaskFormat(batch, aavegotchiDiamondAddress)
    );

    // Mark these exceptions as added in the config
    batch.forEach((exception) => {
      deploymentConfig.sideViewExceptions![
        `${exception.slotPosition}_${exception.itemId}`
      ] = true;
    });

    // Save after each batch
    saveDeploymentConfig(deploymentConfig);
  }
}

async function uploadAllSvgs(
  svgFacet: SvgFacet,
  totalGasUsed: BigNumber,
  deploymentConfig: DeploymentConfig
) {
  console.log("Upload SVGs");

  const { eyeShapeSvgs } = require("../svgs/eyeShapes.js");
  const { eyeShapeSvgs: eyeShapeH2Svgs } = require("../svgs/eyeShapesH2.js");

  const {
    collateralsSvgs: h1CollateralsSvgs,
  } = require("../svgs/collaterals.js");
  const {
    collateralsSvgs: h2CollateralsSvgs,
  } = require("../svgs/collateralsH2.js");

  const collateralsSvgs = h1CollateralsSvgs.concat(h2CollateralsSvgs);

  deploymentConfig.svgsUploaded = deploymentConfig.svgsUploaded || {};

  const { sleeves, wearables } = getWearables();
  const sleeveSvgsArray: SleeveObject[] = sleeves;

  const svgGroups = {
    "portal-open": openedPortals,
    "portal-closed": closedPortals,
    aavegotchi: aavegotchiSvgs,
    collaterals: collateralsSvgs,
    eyeShapes: eyeShapeSvgs,
    "aavegotchi-left": aavegotchiSideSvgs.left,
    "aavegotchi-right": aavegotchiSideSvgs.right,
    "aavegotchi-back": aavegotchiSideSvgs.back,
    "collaterals-left": collateralsLeftSvgs,
    "collaterals-right": collateralsRightSvgs,
    "collaterals-back": collateralsLeftSvgs.map(() => ``),
    "eyeShapes-left": eyeShapesLeftSvgs,
    "eyeShapes-right": eyeShapesRightSvgs,
    "eyeShapes-back": eyeShapesLeftSvgs.map(() => ``),
    eyeShapesH2: eyeShapeH2Svgs,
    "eyeShapesH2-left": eyeShapesH2LeftSvgs,
    "eyeShapesH2-right": eyeShapesH2RightSvgs,
    "eyeShapesH2-back": eyeShapesH2RightSvgs.map(() => ``),
    wearables: wearables,
    sleeves: sleeveSvgsArray.map((value) => value.svg),
    "wearables-left": wearablesLeftSvgs,
    "wearables-right": wearablesRightSvgs,
    "wearables-back": wearablesBackSvgs,
    "sleeves-left": wearablesLeftSleeveSvgs,
    "sleeves-right": wearablesRightSleeveSvgs,
    "sleeves-back": wearablesBackSleeveSvgs,
  };

  for (const svgGroup of Object.entries(svgGroups)) {
    const svgData = svgGroup[1];
    const svgType = svgGroup[0];
    await uploadSvgs(svgFacet, svgData, svgType, ethers, deploymentConfig);
  }
  console.log("Upload Done");

  interface SleeveInput {
    sleeveId: BigNumberish;
    wearableId: BigNumberish;
  }
  let sleevesSvgId = 0;
  const sleevesInput: SleeveInput[] = [];
  for (const sleeve of sleeveSvgsArray) {
    sleevesInput.push({
      sleeveId: sleevesSvgId,
      wearableId: sleeve.id,
    });
    sleevesSvgId++;
  }

  console.log("Associating sleeves svgs with body wearable svgs.");

  const tx = await svgFacet.setSleeves(sleevesInput);
  const receipt = await ethers.provider.waitForTransaction(tx.hash, 1);
  if (receipt.status !== 1) {
    throw new Error(
      `Associating sleeves with body wearable SVGs failed. Tx: ${tx.hash}`
    );
  }

  console.log(
    "Sleeves associating gas used::" +
      strDisplay(receipt.gasUsed) +
      ` (tx: ${tx.hash})`
  );
  totalGasUsed = totalGasUsed.add(receipt.gasUsed);
  return totalGasUsed;
}

interface ERC1155Category {
  erc1155TokenAddress: string;
  erc1155TypeId: BigNumberish;
  category: number;
}

export async function addERC1155Categories(
  erc1155MarketplaceFacet: ERC1155MarketplaceFacet,
  totalGasUsed: BigNumber,
  ghstStakingDiamondAddress: string,
  installationDiamondAddress: string,
  tileDiamondAddress: string,
  forgeDiamondAddress: string,
  fakeGotchiCardDiamondAddress: string,
  ggSkinsDiamondAddress: string,
  ggProfilesDiamondAddress: string
) {
  console.log("Adding ERC1155 categories");
  const erc1155Categories: ERC1155Category[] = [];
  for (let i = 0; i < 6; i++) {
    erc1155Categories.push({
      erc1155TokenAddress: ghstStakingDiamondAddress,
      erc1155TypeId: i,
      category: 3,
    });
  }
  [
    1, 141, 142, 143, 144, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155,
    156,
  ].forEach((id) => {
    erc1155Categories.push({
      erc1155TokenAddress: installationDiamondAddress,
      erc1155TypeId: id,
      category: 4,
    });
  });
  Array.from({ length: 31 }, (_, index) => index + 1).forEach((id) => {
    erc1155Categories.push({
      erc1155TokenAddress: tileDiamondAddress,
      erc1155TypeId: id,
      category: 5,
    });
  });
  erc1155Categories.push({
    erc1155TokenAddress: fakeGotchiCardDiamondAddress,
    erc1155TypeId: 0,
    category: 6,
  });

  const offset = 1_000_000_000;
  const alloyCategory = 7;
  const geodesCategory = 9;
  const essenceCategory = 10;
  const coresCategory = 11;
  const alloyIds = [offset];
  const essenceIds = [offset + 1];
  const geodeIds = [];
  for (let i = offset + 2; i < offset + 8; i++) {
    geodeIds.push(i);
  }
  const coreIds = [];
  for (let i = offset + 8; i < offset + 44; i++) {
    coreIds.push(i);
  }
  const forgeFinalArray = [
    [alloyCategory, alloyIds],
    [geodesCategory, geodeIds],
    [essenceCategory, essenceIds],
    [coresCategory, coreIds],
  ];
  forgeFinalArray.forEach((el) => {
    const category = el[0] as number;
    const toAdd = el[1] as number[];

    for (let index = 0; index < toAdd.length; index++) {
      erc1155Categories.push({
        erc1155TokenAddress: forgeDiamondAddress,
        erc1155TypeId: toAdd[index],
        category: category,
      });
    }
  });

  //ggSkins
  for (let i = 0; i < 8; i++) {
    erc1155Categories.push({
      erc1155TokenAddress: ggSkinsDiamondAddress,
      erc1155TypeId: i,
      category: 12,
    });
  }

  //ggProfiles
  for (let i = 0; i < 11; i++) {
    erc1155Categories.push({
      erc1155TokenAddress: ggProfilesDiamondAddress,
      erc1155TypeId: i,
      category: 13,
    });
  }

  // const txAddCategories = await erc1155MarketplaceFacet.setERC1155Categories(
  //   erc1155Categories
  // );
  // const receipt = await ethers.provider.waitForTransaction(
  //   txAddCategories.hash,
  //   1
  // );
  // if (receipt.status !== 1) {
  //   throw new Error(
  //     `Adding ERC1155 categories failed. Tx: ${txAddCategories.hash}`
  //   );
  // }

  // console.log(
  //   "Adding ERC1155 categories gas used::" +
  //     strDisplay(receipt.gasUsed) +
  //     ` (tx: ${txAddCategories.hash})`
  // );
  // totalGasUsed = totalGasUsed.add(receipt.gasUsed);
  return totalGasUsed;
}

export async function setRealmAddress(
  aavegotchiGameFacet: AavegotchiGameFacet,
  totalGasUsed: BigNumber,
  realmDiamondAddress: string
) {
  console.log("Setting Realm address");
  const tx = await aavegotchiGameFacet.setRealmAddress(realmDiamondAddress);
  const receipt = await ethers.provider.waitForTransaction(tx.hash, 1);
  if (receipt.status !== 1) {
    throw new Error(`Setting Realm address failed. Tx: ${tx.hash}`);
  }
  console.log(
    "Realm diamond set:" + strDisplay(receipt.gasUsed) + ` (tx: ${tx.hash})`
  );
  totalGasUsed = totalGasUsed.add(receipt.gasUsed);
  return totalGasUsed;
}

export async function deployFullDiamond(useFreshDeploy: boolean = false) {
  if (
    ![
      "hardhat",
      "localhost",
      "amoy",
      "polter",
      "baseSepolia",
      "geist",
    ].includes(network.name)
  ) {
    throw Error("No network settings for " + network.name);
  }

  let chainId = network.config.chainId as number;

  if (network.name === "polter") {
    chainId = 631571;
  }
  if (network.name === "amoy") {
    chainId = 80002;
  }
  if (network.name === "baseSepolia") {
    chainId = 84532;
  }
  if (network.name === "geist") {
    chainId = 63157;
  }
  if (network.name === "localhost") {
    chainId = 31337;
  }

  const deploymentConfig = loadDeploymentConfig(chainId, true);

  if (deploymentConfig.chainId === undefined) {
    deploymentConfig.chainId = chainId;
  }

  // const ghstStakingDiamondAddress =
  //   deploymentConfig.ghstStakingDiamondAddress ||
  //   "0xae83d5fc564Ef58224e934ba4Df72a100d5082a0";
  // const realmDiamondAddress =
  //   deploymentConfig.realmDiamondAddress ||
  //   "0x5a4faEb79951bAAa0866B72fD6517E693c8E4620";
  // const installationDiamondAddress =
  //   deploymentConfig.installationDiamondAddress ||
  //   "0x514b7c55FB3DFf3533B58D85CD25Ba04bb30612D";
  // const tileDiamondAddress =
  //   deploymentConfig.tileDiamondAddress ||
  //   "0xCa6F4Ef19a1Beb9BeF12f64b395087E5680bcB22";
  // const fakeGotchiArtDiamondAddress =
  //   deploymentConfig.fakeGotchiArtDiamondAddress ||
  //   "0x330088c3372f4F78cF023DF16E1e1564109191dc";
  // const fakeGotchiCardDiamondAddress =
  //   deploymentConfig.fakeGotchiCardDiamondAddress ||
  //   "0x9E282FE4a0be6A0C4B9f7d9fEF10547da35c52EA";

  // const name = "Test";
  // const symbol = "TEST";

  const signer = await getRelayerSigner(hre);
  const ownerAddress = await signer.getAddress();

  console.log("Owner: " + ownerAddress);

  const dao = ownerAddress;
  const daoTreasury = ownerAddress;
  const rarityFarming = ownerAddress;
  const pixelCraft = ownerAddress;
  const itemManagers = [ownerAddress];
  let ghstContractAddress = "";

  const addresses = networkAddresses[chainId];

  if (chainId === 31337) {
    const ERC20Factory = await ethers.getContractFactory("ERC20Token", signer);
    const erc20 = await ERC20Factory.deploy();
    await erc20.deployed();
    ghstContractAddress = erc20.address;
  } else {
    if (!addresses || !addresses.ghst) {
      throw new Error(
        `No GHST address configured for network ${network.name} (chainId: ${chainId})`
      );
    }
    ghstContractAddress = addresses.ghst;
  }

  const initArgs = [
    [
      dao,
      daoTreasury,
      pixelCraft,
      rarityFarming,
      ghstContractAddress,
      addresses.vrfSystem,
    ],
  ];

  console.log("args:", initArgs);

  let totalGasUsed = ethers.BigNumber.from("0");

  async function deployAavegotchiDiamond(): Promise<Contract> {
    let aavegotchiDiamond: Contract;
    if (!deploymentConfig.aavegotchiDiamond) {
      const deployResult = await deploy({
        diamondName: "AavegotchiDiamond",
        initDiamond: "contracts/Aavegotchi/InitDiamond.sol:InitDiamond",
        facetNames: [
          "contracts/Aavegotchi/facets/AavegotchiFacet.sol:AavegotchiFacet",
          "AavegotchiGameFacet",
          "SvgFacet",
          "contracts/Aavegotchi/facets/ItemsFacet.sol:ItemsFacet",
          "ItemsTransferFacet",
          "CollateralFacet",
          "DAOFacet",
          "VrfFacet",
          "ShopFacet",
          "MetaTransactionsFacet",
          "ERC1155MarketplaceFacet",
          "ERC721MarketplaceFacet",
          "EscrowFacet",
          "GotchiLendingFacet",
          "LendingGetterAndSetterFacet",
          "MarketplaceGetterFacet",
          "SvgViewsFacet",
          "WearableSetsFacet",
          "WhitelistFacet",
          "PeripheryFacet",
          "MerkleDropFacet",
          "ERC721BuyOrderFacet",
          "ItemsRolesRegistryFacet",
          "ERC1155BuyOrderFacet",
          "AavegotchiBridgeFacet",
        ],
        signer: signer,
        args: initArgs,
        deploymentConfig,
      });
      aavegotchiDiamond = deployResult.deployedDiamond;
      console.log("Aavegotchi diamond address:" + aavegotchiDiamond.address);
      console.log(
        "Aavegotchi diamond deploy gas used:" +
          strDisplay(deployResult.diamondReceipt.gasUsed)
      );
      totalGasUsed = totalGasUsed.add(deployResult.diamondReceipt.gasUsed);
      if (deployResult.initDiamondReceipt) {
        totalGasUsed = totalGasUsed.add(
          deployResult.initDiamondReceipt.gasUsed
        );
      }
      totalGasUsed = totalGasUsed.add(deployResult.diamondCutReceipt.gasUsed);

      deploymentConfig.aavegotchiDiamond = aavegotchiDiamond.address;
      saveDeploymentConfig(deploymentConfig);
      return aavegotchiDiamond;
    } else {
      console.log(
        "Using existing Aavegotchi Diamond at " +
          deploymentConfig.aavegotchiDiamond
      );
      aavegotchiDiamond = await ethers.getContractAt(
        "Diamond",
        deploymentConfig.aavegotchiDiamond,
        signer
      );
      return aavegotchiDiamond;
    }
  }

  async function deployWearableDiamond(
    aavegotchiDiamondAddress: string
  ): Promise<Contract> {
    let wearableDiamond: Contract;
    if (!deploymentConfig.wearableDiamond) {
      const deployResult = await deployWithoutInit({
        diamondName: "WearableDiamond",
        signer: signer,
        args: [ownerAddress, aavegotchiDiamondAddress],
        facetNames: ["EventHandlerFacet", "WearablesFacet"],
        deploymentConfig,
      });
      wearableDiamond = deployResult.deployedDiamond;
      console.log("Wearable diamond address:" + wearableDiamond.address);
      console.log(
        "Wearable diamond deploy gas used:" +
          strDisplay(deployResult.diamondReceipt.gasUsed)
      );
      totalGasUsed = totalGasUsed.add(deployResult.diamondReceipt.gasUsed);
      totalGasUsed = totalGasUsed.add(deployResult.diamondCutReceipt.gasUsed);

      const peripheryFacet = (
        await ethers.getContractAt("PeripheryFacet", aavegotchiDiamondAddress)
      ).connect(signer);

      console.log("Setting wearable diamond in periphery");
      const peripheryTx = await peripheryFacet.setPeriphery(
        wearableDiamond.address
      );
      const peripheryReceipt = await ethers.provider.waitForTransaction(
        peripheryTx.hash,
        1
      );
      if (peripheryReceipt.status !== 1) {
        throw new Error(
          `Setting wearable diamond in periphery failed. Tx: ${peripheryTx.hash}`
        );
      }
      console.log(
        "Setting wearable diamond gas used::" +
          strDisplay(peripheryReceipt.gasUsed) +
          ` (tx: ${peripheryTx.hash})`
      );
      totalGasUsed = totalGasUsed.add(peripheryReceipt.gasUsed);

      deploymentConfig.wearableDiamond = wearableDiamond.address;
      saveDeploymentConfig(deploymentConfig);
      return wearableDiamond;
    } else {
      console.log(
        "Using existing Wearable Diamond at " + deploymentConfig.wearableDiamond
      );
      wearableDiamond = await ethers.getContractAt(
        "WearableDiamond",
        deploymentConfig.wearableDiamond,
        signer
      );
      return wearableDiamond;
    }
  }

  async function deployNewForgeDiamond(
    aavegotchiDiamondAddress: string,
    wearableDiamondAddress: string
  ): Promise<Contract> {
    let forgeDiamond: Contract;
    if (!deploymentConfig.forgeDiamond) {
      const deployResult = await deployWithoutInit({
        diamondName: "ForgeDiamond",
        facetNames: [
          "ForgeFacet",
          "ForgeTokenFacet",
          "ForgeVRFFacet",
          "ForgeDAOFacet",
        ],
        signer: signer,
        args: [
          ownerAddress,
          aavegotchiDiamondAddress,
          wearableDiamondAddress,
          addresses.vrfSystem!,
        ],
        deploymentConfig,
      });

      forgeDiamond = deployResult.deployedDiamond;
      console.log("Forge diamond address:" + forgeDiamond.address);
      console.log(
        "Forge diamond deploy gas used:" +
          strDisplay(deployResult.diamondReceipt.gasUsed)
      );
      totalGasUsed = totalGasUsed.add(deployResult.diamondReceipt.gasUsed);
      totalGasUsed = totalGasUsed.add(deployResult.diamondCutReceipt.gasUsed);

      deploymentConfig.forgeDiamond = forgeDiamond.address;
      saveDeploymentConfig(deploymentConfig);
      return forgeDiamond;
    } else {
      console.log(
        "Using existing Forge Diamond at " + deploymentConfig.forgeDiamond
      );
      forgeDiamond = await ethers.getContractAt(
        "ForgeDiamond",
        deploymentConfig.forgeDiamond,
        signer
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return forgeDiamond;
    }
  }

  const aavegotchiDiamond = await deployAavegotchiDiamond();
  const wearableDiamond = await deployWearableDiamond(
    aavegotchiDiamond.address
  );
  const forgeDiamond = await deployNewForgeDiamond(
    aavegotchiDiamond.address,
    wearableDiamond.address
  );

  const daoFacet = (
    await ethers.getContractAt("DAOFacet", aavegotchiDiamond.address)
  ).connect(signer);

  console.log("Item Managers:", itemManagers);
  if (
    !deploymentConfig.itemManagers ||
    deploymentConfig.itemManagers.length < itemManagers.length
  ) {
    console.log("Adding Item Managers");
    const itemManagerTx = await daoFacet.addItemManagers(itemManagers);
    const itemManagerReceipt = await ethers.provider.waitForTransaction(
      itemManagerTx.hash,
      1
    );
    if (itemManagerReceipt.status !== 1) {
      throw new Error(`Adding item managers failed. Tx: ${itemManagerTx.hash}`);
    }
    totalGasUsed = totalGasUsed.add(itemManagerReceipt.gasUsed);
    console.log(
      "Item Managers added, gas: " +
        strDisplay(itemManagerReceipt.gasUsed) +
        ` (tx: ${itemManagerTx.hash})`
    );
    deploymentConfig.itemManagers = itemManagers;
    saveDeploymentConfig(deploymentConfig);
  } else {
    console.log("Item Managers already configured or up to date.");
  }

  await createHauntWithCollaterals(
    1,
    daoFacet,
    "10000",
    ethers.utils.parseEther("0.1"),
    getCollaterals(network.name, ghstContractAddress, h1Collaterals),
    totalGasUsed,
    signer
  );
  deploymentConfig.haunts = deploymentConfig.haunts || {};
  deploymentConfig.haunts[1] = true;
  saveDeploymentConfig(deploymentConfig);

  if (
    !deploymentConfig.itemTypes ||
    Object.keys(deploymentConfig.itemTypes).length < allItemTypes.length
  ) {
    totalGasUsed = await addItemTypes(
      daoFacet,
      totalGasUsed,
      deploymentConfig,
      signer
    );
  } else {
    console.log("All Item Types already added.");
  }

  await createHauntWithCollaterals(
    2,
    daoFacet,
    "15000",
    ethers.utils.parseEther("0.1"),
    getCollaterals(network.name, ghstContractAddress, h2Collaterals),
    totalGasUsed,
    signer
  );
  deploymentConfig.haunts = deploymentConfig.haunts || {};
  deploymentConfig.haunts[1] = true;
  saveDeploymentConfig(deploymentConfig);

  if (
    !deploymentConfig.itemTypes ||
    Object.keys(deploymentConfig.itemTypes).length < allItemTypes.length
  ) {
    totalGasUsed = await addItemTypes(
      daoFacet,
      totalGasUsed,
      deploymentConfig,
      signer
    );
  } else {
    console.log("All Item Types already added.");
  }

  if (
    !deploymentConfig.wearableSets ||
    Object.keys(deploymentConfig.wearableSets).length < wearableSetArrays.length
  ) {
    totalGasUsed = await addWearableSets(
      daoFacet,
      totalGasUsed,
      deploymentConfig,
      signer
    );
  } else {
    console.log("All Wearable Sets already added.");
  }

  await addSideViewDimensions(aavegotchiDiamond.address, deploymentConfig);
  await addSideviewExceptions(aavegotchiDiamond.address, deploymentConfig);

  let svgFacet = (
    await ethers.getContractAt("SvgFacet", aavegotchiDiamond.address)
  ).connect(signer);
  totalGasUsed = await uploadAllSvgs(svgFacet, totalGasUsed, deploymentConfig);
  saveDeploymentConfig(deploymentConfig);

  if (!deploymentConfig.setForgeDiamond) {
    console.log("Setting Forge Diamond in DAOFacet");
    const setForgeTx = await daoFacet.setForge(forgeDiamond.address);
    const setForgeReceipt = await ethers.provider.waitForTransaction(
      setForgeTx.hash,
      1
    );
    if (setForgeReceipt.status !== 1) {
      throw new Error(
        `Setting Forge Diamond in DAOFacet failed. Tx: ${setForgeTx.hash}`
      );
    }
    totalGasUsed = totalGasUsed.add(setForgeReceipt.gasUsed);
    console.log(
      "Forge diamond set in DAOFacet, gas: " +
        strDisplay(setForgeReceipt.gasUsed) +
        ` (tx: ${setForgeTx.hash})`
    );
    deploymentConfig.setForgeDiamond = true;
    saveDeploymentConfig(deploymentConfig);
  } else {
    console.log("Forge diamond already set.");
  }

  if (!deploymentConfig.forgePropertiesSet) {
    console.log("Setting Forge Properties");
    await setForgeProperties(forgeDiamond.address, signer);
    deploymentConfig.forgePropertiesSet = true;
    saveDeploymentConfig(deploymentConfig);
    console.log("Forge properties set.");
  } else {
    console.log("Forge properties already set.");
  }

  //no need to set erc721 categories yet since some assets are not deployed yet
  // const erc721MarketplaceFacet = (
  //   await ethers.getContractAt(
  //     "ERC721MarketplaceFacet",
  //     aavegotchiDiamond.address
  //   )
  // ).connect(signer);
  // if (!deploymentConfig.erc721CategoriesAdded) {
  //   totalGasUsed = await addERC721Categories(
  //     erc721MarketplaceFacet,
  //     totalGasUsed,
  //     realmDiamondAddress,
  //     fakeGotchiArtDiamondAddress
  //   );
  //   deploymentConfig.erc721CategoriesAdded = true;
  //   saveDeploymentConfig(deploymentConfig);
  // } else {
  //   console.log("ERC721 Categories already added.");
  // }

  // const erc1155MarketplaceFacet = (
  //   await ethers.getContractAt(
  //     "ERC1155MarketplaceFacet",
  //     aavegotchiDiamond.address
  //   )
  // ).connect(signer);
  // if (!deploymentConfig.erc1155CategoriesAdded) {
  //   totalGasUsed = await addERC1155Categories(
  //     erc1155MarketplaceFacet,
  //     totalGasUsed,
  //     ghstStakingDiamondAddress,
  //     installationDiamondAddress,
  //     tileDiamondAddress,
  //     forgeDiamond.address,
  //     fakeGotchiCardDiamondAddress
  //   );
  //   deploymentConfig.erc1155CategoriesAdded = true;
  //   saveDeploymentConfig(deploymentConfig);
  // } else {
  //   console.log("ERC1155 Categories already added.");
  // }

  // const aavegotchiGameFacet = (
  //   await ethers.getContractAt("AavegotchiGameFacet", aavegotchiDiamond.address)
  // ).connect(signer);
  // if (!deploymentConfig.realmAddressSet) {
  //   totalGasUsed = await setRealmAddress(
  //     aavegotchiGameFacet,
  //     totalGasUsed,
  //     realmDiamondAddress
  //   );
  //   deploymentConfig.realmAddressSet = true;
  //   saveDeploymentConfig(deploymentConfig);
  // } else {
  //   console.log("Realm address already set.");
  // }

  // const addressesToWhitelist = [
  //   forgeDiamond.address,
  //   aavegotchiDiamond.address,
  // ];
  // const bools = [true, true];
  // console.log("Setting Baazaar Trading Allowlist");

  // const whitelistTx = await daoFacet.setBaazaarTradingAllowlists(
  //   addressesToWhitelist,
  //   bools
  // );
  // const whitelistReceipt = await ethers.provider.waitForTransaction(
  //   whitelistTx.hash,
  //   1
  // );
  // if (whitelistReceipt.status !== 1) {
  //   throw new Error(
  //     `Setting Baazaar Trading Allowlist failed. Tx: ${whitelistTx.hash}`
  //   );
  // }
  // totalGasUsed = totalGasUsed.add(whitelistReceipt.gasUsed);
  // console.log(
  //   "Bazaar whitelist set, gas: " +
  //     strDisplay(whitelistReceipt.gasUsed) +
  //     ` (tx: ${whitelistTx.hash})`
  // );

  console.log("Total gas used: " + strDisplay(totalGasUsed));
  return {
    aavegotchiDiamond: aavegotchiDiamond,
    forgeDiamond: forgeDiamond,
    wearableDiamond: wearableDiamond,
    testGhstContractAddress: ghstContractAddress,
  };
}

if (require.main === module) {
  deployFullDiamond(true)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
