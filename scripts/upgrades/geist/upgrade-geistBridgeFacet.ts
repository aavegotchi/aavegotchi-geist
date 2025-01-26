import { ethers, run } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../../tasks/deployUpgrade";

export async function upgrade() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "PolygonXGeistBridgeFacet",
      addSelectors: [
        "function bridgeGotchi(address _receiver, uint256 _tokenId, uint256 _msgGasLimit, address _connector) external payable",
        "function setMetadata(uint _tokenId, bytes memory _metadata) external",
        "function mint(address _to, uint _tokenId) external",
        "function burn(address _from, uint _tokenId) external",
        "function bridgeItem(address _receiver, uint256 _tokenId, uint256 _amount, uint256 _msgGasLimit, address _connector) external payable",
        "function mint(address _to, uint _tokenId, uint _quantity) external",
        "function burn(address _from, uint _tokenId, uint _quantity) external",
        "function bridgeGotchis(tuple(address receiver, uint256 tokenId, uint256 msgGasLimit)[] calldata bridgingParams, address _connector) external payable",
        "function bridgeItems(tuple(address receiver, uint256 tokenId, uint256 amount, uint256 msgGasLimit)[] calldata bridgingParams, address _connector) external payable",
      ],
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  const args: DeployUpgradeTaskArgs = {
    diamondOwner: "0xd38Df837a1EAd12ee16f8b8b7E5F58703f841668", // polter-testnet
    diamondAddress: "0x1F0eb9099b9c398323dcf2F133dFdAD9dE7cF994", // polter-testnet
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
