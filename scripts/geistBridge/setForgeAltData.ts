import { ethers } from "hardhat";
import { FORGE_ITEMS_DIR } from "./mintForgeItems";
import { maticForgeDiamondAddress, getRelayerSigner } from "../helperFunctions";
import { BigNumber } from "ethers";
import { varsForNetwork } from "../../helpers/constants";
import fs from "fs";
import { writeMiscProgress } from "./paths";

async function main() {
  const itemAltDataPath = `${FORGE_ITEMS_DIR}/forgeAltData.json`;
  // @ts-ignore
  const signer = await getRelayerSigner(hre);
  const c = await varsForNetwork(ethers);
  const forgeWriteFacet = await ethers.getContractAt(
    "ForgeWriteFacet",
    c.forgeDiamond!,
    signer
  );

  const forgeDAOFacet = await ethers.getContractAt(
    "ForgeDAOFacet",
    c.forgeDiamond!,
    signer
  );

  interface ForgeAltData {
    alloyCosts: { rarityScoreModifier: BigNumber[]; alloyCosts: BigNumber[] };
    essenceCosts: {
      rarityScoreModifier: BigNumber[];
      essenceCosts: BigNumber[];
    };
    timeCosts: { rarityScoreModifier: BigNumber[]; timeCosts: BigNumber[] };
    skillPoints: { rarityScoreModifier: BigNumber[]; skillPoints: BigNumber[] };
    smeltingSkillPointReductionFactorBips: BigNumber;
    gotchiSmithingSkillPoints: {
      gotchiId: BigNumber[];
      skillPoints: BigNumber[];
    };
    geodeWinChanceMultiTierBips: {
      geodeRarity: BigNumber[];
      prizeRarity: BigNumber[];
      winChances: BigNumber[];
    };
    geodeRarities: BigNumber[];
    geodePrizes: {
      tokenIds: BigNumber[];
      quantities: BigNumber[];
    };
  }

  const data = JSON.parse(
    fs.readFileSync(itemAltDataPath, "utf8")
  ) as ForgeAltData;

  console.log(`setting alloyCosts`);
  let tx;
  tx = await forgeWriteFacet.setForgeAlloyCosts(data.alloyCosts.alloyCosts);
  console.log(`tx: ${tx.hash}`);
  await ethers.provider.waitForTransaction(tx.hash, 1);
  console.log(`tx: ${tx.hash} confirmed`);

  console.log(`setting essenceCosts`);
  tx = await forgeWriteFacet.setForgeEssenceCosts(
    data.essenceCosts.essenceCosts
  );
  console.log(`tx: ${tx.hash}`);
  await ethers.provider.waitForTransaction(tx.hash, 1);
  console.log(`tx: ${tx.hash} confirmed`);

  console.log(`setting timeCosts`);
  tx = await forgeWriteFacet.setForgeTimeCostsInBlocks(
    data.timeCosts.timeCosts
  );
  console.log(`tx: ${tx.hash}`);
  await ethers.provider.waitForTransaction(tx.hash, 1);
  console.log(`tx: ${tx.hash} confirmed`);

  console.log(`setting skillPoints`);
  tx = await forgeWriteFacet.setForgeSkillPointsEarned(
    data.skillPoints.skillPoints
  );
  console.log(`tx: ${tx.hash}`);
  await ethers.provider.waitForTransaction(tx.hash, 1);
  console.log(`tx: ${tx.hash} confirmed`);

  console.log(`setting smeltingSkillPointReductionFactorBips`);
  tx = await forgeWriteFacet.setSmeltingSkillPointReductionFactorBipsBridged(
    data.smeltingSkillPointReductionFactorBips
  );
  console.log(`tx: ${tx.hash}`);
  await ethers.provider.waitForTransaction(tx.hash, 1);
  console.log(`tx: ${tx.hash} confirmed`);

  console.log(`setting geodeWinChanceMultiTierBips`);
  tx = await forgeWriteFacet.setGeodeWinChanceMultiTierBips(
    data.geodeWinChanceMultiTierBips.geodeRarity,
    data.geodeWinChanceMultiTierBips.prizeRarity,
    data.geodeWinChanceMultiTierBips.winChances
  );
  console.log(`tx: ${tx.hash}`);
  await ethers.provider.waitForTransaction(tx.hash, 1);
  console.log(`tx: ${tx.hash} confirmed`);

  console.log(`setting geodeRarities`);
  tx = await forgeWriteFacet.setGeodePrizes(
    data.geodePrizes.tokenIds,
    data.geodePrizes.quantities,
    data.geodeRarities
  );
  console.log(`tx: ${tx.hash}`);
  await ethers.provider.waitForTransaction(tx.hash, 1);
  console.log(`tx: ${tx.hash} confirmed`);

  //set gotchi smithing skill points in batches of 200
  console.log(
    `setting a total of ${data.gotchiSmithingSkillPoints.gotchiId.length} gotchi smithing skill points`
  );
  for (
    let i = 0;
    i < data.gotchiSmithingSkillPoints.gotchiId.length;
    i += 200
  ) {
    tx = await forgeWriteFacet.batchSetGotchiSmithingSkillPoints(
      data.gotchiSmithingSkillPoints.gotchiId.slice(i, i + 200),
      data.gotchiSmithingSkillPoints.skillPoints.slice(i, i + 200)
    );
    console.log(`tx: ${tx.hash}`);
    await ethers.provider.waitForTransaction(tx.hash, 1);
    console.log(`tx: ${tx.hash} confirmed`);
  }

  writeMiscProgress("setForgeProperties", true);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
