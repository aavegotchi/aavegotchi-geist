import { ethers, run } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../../tasks/deployUpgrade";

export async function upgrade() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "PolygonXGeistGetterFacet",
      addSelectors: [],
      removeSelectors: ["function getGotchiGeistBridge() external view"],
    },
    {
      facetName: "DAOFacet",
      addSelectors: ["function getGotchiGeistBridge() external view"],
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  const diamond = "0x87C969d083189927049f8fF3747703FB9f7a8AEd";

  const args: DeployUpgradeTaskArgs = {
    diamondOwner: "0xd38Df837a1EAd12ee16f8b8b7E5F58703f841668", // base sepolia
    diamondAddress: diamond, // base sepolia
    facetsAndAddSelectors: joined,
    useLedger: false,
    useMultisig: false,
  };

  // await run("deployUpgrade", args);

  const daoFacet = await ethers.getContractAt("DAOFacet", diamond);

  //the vault of base sepolia
  const tx = await daoFacet.updateGotchiGeistBridge(
    "0xEccF8B72c6A354532F27053e54A5b4b912D1e6D6"
  );

  // //previous it was 0x0000000000000000000000000000000000000000
  // console.log("Transaction: ", tx.hash);
  // await tx.wait();

  // const bridgeFacet = await ethers.getContractAt(
  //   "PolygonXGeistGetterFacet",
  //   diamond
  // );
  // const bridge = await bridgeFacet.getGotchiGeistBridge();
  // console.log("Current Bridge: ", bridge);
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
