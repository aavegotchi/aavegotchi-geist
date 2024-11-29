import { ethers, run } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import { bridgeConfig } from "../geistBridge/bridgeConfig";

export async function upgrade() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "WearablesFacet",
      addSelectors: [
        "function itemGeistBridge() public view returns (address)",
      ],
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  const args: DeployUpgradeTaskArgs = {
    diamondOwner: "0x3a2E7D1E98A4a051B0766f866237c73643fDF360", // polter-testnet
    diamondAddress: bridgeConfig[63157].GOTCHI_ITEM.MintableToken,
    facetsAndAddSelectors: joined,
    useLedger: false,
    useMultisig: false,
    initAddress: ethers.constants.AddressZero,
    initCalldata: "0x",
  };

  await run("deployUpgrade", args);
}

if (require.main === module) {
  upgrade()
    .then(() => process.exit(0))
    // .then(() => console.log('upgrade completed') /* process.exit(0) */)
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
