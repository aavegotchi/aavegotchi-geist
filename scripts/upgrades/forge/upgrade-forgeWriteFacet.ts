import { run } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../../tasks/deployUpgrade";

import { maticDiamondUpgrader, maticForgeDiamond } from "../../helperFunctions";

export async function upgradeForgeWriteFacet() {
  console.log("Adding ForgeWriteFacet to ForgeDiamond");

  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "ForgeWriteFacet",
      addSelectors: [
        `function setForgeAlloyCosts(uint256[] calldata _alloyCosts) external`,
        `function setForgeEssenceCosts(uint256[] calldata _essenceCosts) external`,
        `function setForgeTimeCostsInBlocks(uint256[] calldata _timeCosts) external`,
        `function setForgeSkillPointsEarned(uint256[] calldata _skillPoints) external`,
        `function setGeodeWinChanceMultiTierBips(uint8[] calldata _geodeRarities, uint8[] calldata _prizeRarities, uint256[] calldata _winChances) external`,
        `function setGeodePrizes(uint256[] calldata _tokenIds, uint256[] calldata _quantities, uint8[] calldata _rarities) external`,
        `function batchSetGotchiSmithingSkillPoints(uint256[] calldata _tokenIds, uint256[] calldata _skillPoints) external`,
      ],
      removeSelectors: [],
    },
  ];
  const joined = convertFacetAndSelectorsToString(facets);

  const args: DeployUpgradeTaskArgs = {
    diamondOwner: maticDiamondUpgrader,
    diamondAddress: maticForgeDiamond,
    facetsAndAddSelectors: joined,
    useLedger: true,
    useMultisig: false,
  };

  await run("deployUpgrade", args);
}

if (require.main === module) {
  upgradeForgeWriteFacet()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
