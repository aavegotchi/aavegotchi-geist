import { ethers, network, run } from "hardhat";
import { Signer } from "@ethersproject/abstract-signer";
import {
  updateSvgTaskForSvgType,
  uploadOrUpdateSvg,
  uploadSvgs,
} from "../../scripts/svgHelperFunctions";
import { gasPrice, getRelayerSigner } from "../helperFunctions";
import { varsForNetwork } from "../../helpers/constants";
import { itemTypes } from "../../data/itemTypes/itemTypes";
import { getItemTypes, toItemTypeInputNew } from "../itemTypeHelpers";
import { getWearables } from "../../svgs/allWearables";
import { sideViewDimensions } from "../../data/itemTypes/baseWearableSideWearables";
import { convertSideDimensionsToTaskFormat } from "../../tasks/updateItemSideDimensions";
import { BigNumberish } from "ethers";
import {
  wearablesBackSvgs,
  wearablesLeftSvgs,
  wearablesRightSvgs,
  wearablesBackSleeveSvgs,
  wearablesLeftSleeveSvgs,
  wearablesRightSleeveSvgs,
} from "../../svgs/wearables-sides";

async function main() {
  const c = await varsForNetwork(ethers);
  //@ts-ignore
  const signer = await getRelayerSigner(hre);

  //first assert that wearables and sleeves are valid
  const { sleeves, wearables } = getWearables();

  //add itemTypes

  const daoFacet = await ethers.getContractAt(
    "DAOFacet",
    c.aavegotchiDiamond!,
    signer
  );

  const itemsFacet = await ethers.getContractAt(
    "ItemsFacet",
    c.aavegotchiDiamond!,
    signer
  );

  const itemTypesToAdd = [itemTypes[418], itemTypes[419], itemTypes[420]];
  const itemTypesToAdd2 = itemTypesToAdd.map((item) =>
    toItemTypeInputNew(item)
  );
  const finalItemTypes = getItemTypes(itemTypesToAdd2, ethers);
  const sleeveToUpload = [sleeves[sleeves.length - 1]];
  //console.log(finalItemTypes);
  let tx;
  tx = await daoFacet.addItemTypes(finalItemTypes);
  await tx.wait();
  console.log("Item types added");

  // upload dimensions
  await run(
    "updateItemSideDimensions",
    convertSideDimensionsToTaskFormat(sideViewDimensions, c.aavegotchiDiamond!)
  );

  //upload svgs
  const sleeveSvgs: string[] = sleeveToUpload.map((s) => s.svg);

  //wearables
  const svgGroups = {
    //last 3 wearables
    wearables: [wearables[418], wearables[419], wearables[420]],
    "wearables-left": [
      wearablesLeftSvgs[418],
      wearablesLeftSvgs[419],
      wearablesLeftSvgs[420],
    ],
    "wearables-right": [
      wearablesRightSvgs[418],
      wearablesRightSvgs[419],
      wearablesRightSvgs[420],
    ],
    "wearables-back": [
      wearablesBackSvgs[418],
      wearablesBackSvgs[419],
      wearablesBackSvgs[420],
    ],
  };

  const svgGroups2 = {
    sleeves: sleeveSvgs,
    "sleeves-left": [
      wearablesLeftSleeveSvgs[wearablesLeftSleeveSvgs.length - 1],
    ],
    "sleeves-right": [
      wearablesRightSleeveSvgs[wearablesRightSleeveSvgs.length - 1],
    ],
    "sleeves-back": [
      wearablesBackSleeveSvgs[wearablesBackSleeveSvgs.length - 1],
    ],
  };

  const svgFacet = await ethers.getContractAt(
    "SvgFacet",
    c.aavegotchiDiamond!,
    signer
  );

  const itemsIds = [418, 419, 420];
  const sleeveid = [sleeves.length - 1];

  for (const svgGroup of Object.entries(svgGroups)) {
    const svgData = svgGroup[1];
    const svgType = svgGroup[0];
    await uploadOrUpdateSvg(svgData, svgType, itemsIds, svgFacet, ethers);
  }

  for (const svgGroup of Object.entries(svgGroups2)) {
    const svgData = svgGroup[1];
    const svgType = svgGroup[0];
    await uploadOrUpdateSvg(svgData, svgType, sleeveid, svgFacet, ethers);
  }

  interface SleeveInput {
    sleeveId: BigNumberish;
    wearableId: BigNumberish;
  }

  const sleevesInput: SleeveInput[] = [];
  for (const sleeve of sleeveToUpload) {
    sleevesInput.push({
      sleeveId: [sleeves.length - 1],
      wearableId: sleeve.id,
    });
  }

  // console.log(sleevesInput);
  // //associate sleeves with body wearable svgs
  tx = await svgFacet.setSleeves(sleevesInput);
  await tx.wait();
  console.log("Sleeves associated with body wearable svgs");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
