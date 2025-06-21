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
import { ForgeDAOFacet } from "../../typechain/ForgeDAOFacet";

//MAKE SURE TO SET THESE ADDRESSES IN THE CONSTANTS FILE

async function setVarsAfterDeployment() {
  const c = await varsForNetwork(ethers);
  //@ts-ignore
  const signer = await getRelayerSigner(hre);
  let tx;
  let gasused = BigNumber.from(0);

  //set realm address
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
  tx = await whitelistTx.wait();
  gasused = gasused.add(tx.gasUsed);

  //set revenue token for lendings
  const lendingGetterAndSetterFacet = await ethers.getContractAt(
    "LendingGetterAndSetterFacet",
    c.aavegotchiDiamond!,
    signer
  );
  const revenueTokens = [c.fud!, c.fomo!, c.alpha!, c.kek!];
  const revenueTx = await lendingGetterAndSetterFacet.allowRevenueTokens(
    revenueTokens
  );
  tx = await revenueTx.wait();
  gasused = gasused.add(tx.gasUsed);

  //set forge setter addresses

  const forgeDaoFacet = await ethers.getContractAt(
    "ForgeDAOFacet",
    c.forgeDiamond!,
    signer
  );
  //set gltr address
  console.log("Setting gltr address");
  const gltrAddressTx = await forgeDaoFacet.setGltrAddress(c.gltrAddress!);
  tx = await gltrAddressTx.wait();
  gasused = gasused.add(tx.gasUsed);

  //set aavegotchi dao address
  console.log("Setting aavegotchi dao address");
  const aavegotchiDaoAddressTx = await forgeDaoFacet.setAavegotchiDaoAddress(
    c.aavegotchiDaoAddress!
  );
  tx = await aavegotchiDaoAddressTx.wait();
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
