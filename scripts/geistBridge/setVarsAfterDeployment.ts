import { ethers } from "hardhat";

import {
  // addERC1155Categories,
  // addERC721Categories,
  setRealmAddress,
  strDisplay,
} from "../deployFullDiamond";
import { varsForNetwork } from "../../helpers/constants";
import { getRelayerSigner } from "../helperFunctions";
import { BigNumber } from "ethers";

//MAKE SURE TO SET THESE ADDRESSES IN THE CONSTANTS FILE

async function setVarsAfterDeployment() {
  const c = await varsForNetwork(ethers);
  //@ts-ignore
  const signer = await getRelayerSigner(hre);

  let gasused = BigNumber.from(0);

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

  //set revenue token for lendings
  const lendingGetterAndSetterFacet = await ethers.getContractAt(
    "LendingGetterAndSetterFacet",
    c.aavegotchiDiamond!,
    signer
  );
  const revenueTokens = [c.fud!, c.fomo!, c.alpha!, c.kek!];
  await lendingGetterAndSetterFacet.allowRevenueTokens(revenueTokens);

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
