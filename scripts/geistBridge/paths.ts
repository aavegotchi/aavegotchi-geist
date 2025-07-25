export const PROCESSED_PATH = `${__dirname}/processed`;
export const DATA_PATH = `${__dirname}/cloneData`;
export const GNOSIS_PATH = `${PROCESSED_PATH}/gnosis`;
export const MISC_PROGRESS_PATH = `${PROCESSED_PATH}/miscProgress.json`;

export const blockNumberPath = `${DATA_PATH}/blockNumber.json`;

export const PC_WALLET = "0x01F010a5e001fe9d6940758EA5e8c777885E351e";

interface BlockNumber {
  aavegotchis: number;
  forgeItems: number;
  wearables: number;
}

import fs from "fs";

export function getAavegotchiBlockNumber() {
  const blockNumber: BlockNumber = JSON.parse(
    fs.readFileSync(blockNumberPath, "utf8")
  );
  console.log(
    "using block number",
    blockNumber["aavegotchis"],
    "for aavegotchis"
  );
  return blockNumber["aavegotchis"];
}

interface MiscFlags {
  mintAavegotchisToAavegotchiDiamond: boolean;
  mintWearablesToAavegotchiDiamond: boolean;
  mintWearablesToForgeDiamond: boolean;
  mintForgeItemsToForgeDiamond: boolean;
  setForgeProperties: boolean;
}

export type miscType = keyof MiscFlags;

export function writeMiscProgress(type: miscType, value: boolean) {
  //create file if it doesn't exist
  if (!fs.existsSync(MISC_PROGRESS_PATH)) {
    fs.writeFileSync(MISC_PROGRESS_PATH, JSON.stringify({}));
  }
  const progress: MiscFlags = JSON.parse(
    fs.readFileSync(MISC_PROGRESS_PATH, "utf8")
  );
  progress[type] = value;
  fs.writeFileSync(MISC_PROGRESS_PATH, JSON.stringify(progress, null, 2));
}

export function ensureMiscProgress(type: miscType) {
  //ensure it has not been minted
  //read file
  //create file if it doesn't exist
  if (!fs.existsSync(MISC_PROGRESS_PATH)) {
    fs.writeFileSync(MISC_PROGRESS_PATH, JSON.stringify({}));
  }
  const progress: MiscFlags = JSON.parse(
    fs.readFileSync(MISC_PROGRESS_PATH, "utf8")
  );
  if (progress[type]) {
    throw new Error(`${type} has already been minted`);
  }
}
