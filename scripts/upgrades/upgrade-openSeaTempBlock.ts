import { ethers, run } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";

import { varsForNetwork } from "../../helpers/constants";

export async function upgradeForgeDiamondForPet() {
  console.log("Deploying forge pet fix");
  const c = await varsForNetwork(ethers);
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "AavegotchiFacet",
      addSelectors: [],
      removeSelectors: [],
    },
    {
      facetName: "ERC721BuyOrderFacet",
      addSelectors: [],
      removeSelectors: [],
    },
    {
      facetName: "ERC721MarketplaceFacet",
      addSelectors: [],
      removeSelectors: [],
    },
    {
      facetName: "GotchiLendingFacet",
      addSelectors: [],
      removeSelectors: [],
    },
  ];

  const joined1 = convertFacetAndSelectorsToString(facets);

  const args1: DeployUpgradeTaskArgs = {
    diamondOwner: "0xf52398257a254d541f392667600901f710a006ed",
    diamondAddress: c.aavegotchiDiamond!,
    facetsAndAddSelectors: joined1,
    useLedger: false,
    useRelayer: true,
    useMultisig: false,
    initAddress: ethers.constants.AddressZero,
    initCalldata: "0x",
  };

  await run("deployUpgrade", args1);
}

if (require.main === module) {
  upgradeForgeDiamondForPet()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
