import { ethers } from "hardhat";

import {
  addERC1155Categories,
  addERC721Categories,
  setRealmAddress,
  strDisplay,
} from "../deployFullDiamond";
import { varsForNetwork } from "../../helpers/constants";
import { getRelayerSigner } from "../helperFunctions";
import { BigNumber } from "ethers";

//MAKE SURE TO SET THESE ADDRESSES IN THE CONSTANTS FILE

async function setVarsAfterDeployment() {
  //setErc1155Categories for realm,tiles and installations

  const c = await varsForNetwork(ethers);
  //@ts-ignore
  const signer = await getRelayerSigner(hre);

  let gasused = BigNumber.from(0);
  const erc1155MarketplaceFacet = await ethers.getContractAt(
    "ERC1155MarketplaceFacet",
    c.aavegotchiDiamond!,
    signer
  );
  gasused = await addERC1155Categories(
    erc1155MarketplaceFacet,
    BigNumber.from(0),
    c.ghstStakingDiamond!, //just a placeholder
    c.installationDiamond!,
    c.tileDiamond!,
    c.forgeDiamond!,
    c.fakeGotchiCardDiamond!,
    c.ggSkinsDiamond!,
    c.ggProfilesDiamond!
  );

  ///set realm address
  const aavegotchiGameFacet = await ethers.getContractAt(
    "AavegotchiGameFacet",
    c.aavegotchiDiamond!,
    signer
  );
  gasused = await setRealmAddress(
    aavegotchiGameFacet,
    gasused,
    c.realmDiamond!
  );

  //set erc721 categories for fake gotchi art
  const erc721MarketplaceFacet = await ethers.getContractAt(
    "ERC721MarketplaceFacet",
    c.aavegotchiDiamond!,
    signer
  );

  gasused = await addERC721Categories(
    erc721MarketplaceFacet,
    gasused,
    c.realmDiamond!,
    c.fakeGotchiArtDiamond!
  );

  //whitelist addresses for baazaar trading
  const addressesToWhitelist = [
    c.aavegotchiDiamond!,
    c.forgeDiamond!,
    c.realmDiamond!,
    c.installationDiamond!,
    c.tileDiamond!,
    c.fakeGotchiArtDiamond!,
    c.fakeGotchiCardDiamond!,
    c.ggSkinsDiamond!,
    c.ggProfilesDiamond!,
  ];
  const bools = [true, true, true, true, true, true, true, true, true];
  const daoFacet = await ethers.getContractAt(
    "DAOFacet",
    c.aavegotchiDiamond!,
    signer
  );
  const whitelistTx = await daoFacet.setBaazaarTradingAllowlists(
    addressesToWhitelist,
    bools
  );
  const tx = await whitelistTx.wait();
  gasused = gasused.add(tx.gasUsed);

  console.log("Total gas used: " + strDisplay(gasused));

  console.log("Done");
}

if (require.main === module) {
  setVarsAfterDeployment()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
