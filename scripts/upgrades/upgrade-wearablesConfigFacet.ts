import { ethers, run } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import { loadDeploymentConfig } from "../deployFullDiamond";

export async function upgrade() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "WearablesConfigFacet",
      addSelectors: [
        'function createWearablesConfig(uint256 _tokenId, string _name, uint16[16] _wearablesToStore) external payable',
        'function updateWearablesConfig(uint256 _tokenId, uint16 _wearablesConfigId, string _name, uint16[16] _wearablesToStore) external',
        'function getWearablesConfig(address _owner, uint256 _tokenId, uint16 _wearablesConfigId) external view',
        'function getWearablesConfigName(address _owner, uint256 _tokenId, uint16 _wearablesConfigId) external view',
        'function getWearablesConfigWearables(address _owner, uint256 _tokenId, uint16 _wearablesConfigId) external view',
        'function getAavegotchiWearablesConfigCount(address _owner, uint256 _tokenId) external view',
        'function wearablesConfigExists(address _owner, uint256 _tokenId, uint16 _wearablesConfigId) external view',
      ],
      removeSelectors: [],
    },
  ];

  const deploymentConfig = loadDeploymentConfig(63157);
  const diamondAddress = deploymentConfig.aavegotchiDiamond as string;
  const diamondOwnerAddress = deploymentConfig.itemManagers[0] as string;

  const joined = convertFacetAndSelectorsToString(facets);

  const args: DeployUpgradeTaskArgs = {
    diamondAddress: diamondAddress,
    diamondOwner: diamondOwnerAddress,
    facetsAndAddSelectors: joined,
    useLedger: false,
    useMultisig: false,
    freshDeployment: true,
    // initAddress
    // initCalldata
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
