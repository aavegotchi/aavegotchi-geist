import { ethers, run } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../../tasks/deployUpgrade";
import { bridgeConfig } from "../../geistBridge/bridgeConfig";
import { DAOFacet__factory } from "../../../typechain";
import { DAOFacetInterface } from "../../../typechain/DAOFacet";

export async function upgrade() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "DAOFacet",
      addSelectors: [
        "function setBaazaarTradingAllowlists(address[] calldata _contracts, bool[] calldata _allows)",
        "function getBaazaarTradingAllowlist(address _contract) external view returns (bool)",
      ],
      removeSelectors: [],
    },
    {
      facetName: "ERC1155MarketplaceFacet",
      addSelectors: [],
      removeSelectors: [],
    },
    {
      facetName: "ERC1155BuyOrderFacet",
      addSelectors: [],
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  const iface = new ethers.utils.Interface(
    DAOFacet__factory.abi
  ) as DAOFacetInterface;
  const payload = iface.encodeFunctionData("setBaazaarTradingAllowlists", [
    [
      "0x7b1d9b594c875c0a807f65e8a92e8a8ccd740060",
      "0x7b1d9b594c875c0a807f65e8a92e8a8ccd740061",
    ],
    [true, false],
  ]);

  const args: DeployUpgradeTaskArgs = {
    diamondOwner: "0x3a2E7D1E98A4a051B0766f866237c73643fDF360", // polter-testnet
    diamondAddress: bridgeConfig[63157].GOTCHI.MintableToken,
    facetsAndAddSelectors: joined,
    useLedger: false,
    useMultisig: false,
    initAddress: bridgeConfig[63157].GOTCHI.MintableToken,
    initCalldata: payload,
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
