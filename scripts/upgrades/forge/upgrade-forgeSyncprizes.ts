import { ethers, run } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../../tasks/deployUpgrade";

import { diamondOwner, getLedgerSigner } from "../../helperFunctions";
import { ForgeWriteFacet__factory } from "../../../typechain";
import { ForgeWriteFacetInterface } from "../../../typechain/ForgeWriteFacet";
import { varsForNetwork } from "../../../helpers/constants";

export async function upgradeForgeWriteFacet() {
  const c = await varsForNetwork(ethers);

  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "ForgeWriteFacet",
      addSelectors: [
        `function syncWearablePrizes(uint256[] calldata _tokenIds) external`,
      ],
      removeSelectors: [],
    },
  ];
  const joined = convertFacetAndSelectorsToString(facets);

  const tokenIdsFromMatic = [
    404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 358,
    359, 385, 387, 370, 371, 372, 375, 373, 377, 374, 376, 378, 379, 380, 381,
    382, 383,
  ];

  let iface: ForgeWriteFacetInterface = new ethers.utils.Interface(
    ForgeWriteFacet__factory.abi
  ) as ForgeWriteFacetInterface;
  const calldata = iface.encodeFunctionData("syncWearablePrizes", [
    tokenIdsFromMatic,
  ]);

  const owner = await diamondOwner(c.forgeDiamond!, ethers);
  const args: DeployUpgradeTaskArgs = {
    diamondOwner: owner,
    diamondAddress: c.forgeDiamond!,
    facetsAndAddSelectors: joined,
    useLedger: true,
    useMultisig: false,
    useRelayer: false,
    initAddress: c.forgeDiamond!,
    initCalldata: calldata,
  };

  await run("deployUpgrade", args);

  //also set the vrf system that was not set in the constructor
  const signer = await getLedgerSigner(ethers);
  const forgeVrfFacet = await ethers.getContractAt(
    "ForgeVRFFacet",
    c.forgeDiamond!,
    signer
  );
  const tx = await forgeVrfFacet.setVRFSystem(c.vrfSystem!);
  console.log("tx", tx.hash);
  await tx.wait();
  console.log("finished");
}

if (require.main === module) {
  upgradeForgeWriteFacet()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
