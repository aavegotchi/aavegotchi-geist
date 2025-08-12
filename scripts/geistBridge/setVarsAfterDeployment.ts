import { ethers, network } from "hardhat";

import { setRealmAddress, strDisplay } from "../deployFullDiamond";
import { varsForNetwork } from "../../helpers/constants";
import {
  diamondOwner,
  getLedgerSigner,
  getRelayerSigner,
  impersonate,
} from "../helperFunctions";
import { BigNumber } from "ethers";
import { ForgeDAOFacet } from "../../typechain/ForgeDAOFacet";

//MAKE SURE TO SET THESE ADDRESSES IN THE CONSTANTS FILE

async function setVarsAfterDeployment() {
  const c = await varsForNetwork(ethers);

  const signer = await getLedgerSigner(ethers);
  let tx;
  let gasused = BigNumber.from(0);

  //set realm address
  let aavegotchiGameFacet = await ethers.getContractAt(
    "AavegotchiGameFacet",
    c.aavegotchiDiamond!,
    signer
  );
  let forgeDaoFacet = await ethers.getContractAt(
    "ForgeDAOFacet",
    c.forgeDiamond!,
    signer
  );
  let daoFacet = await ethers.getContractAt(
    "DAOFacet",
    c.aavegotchiDiamond!,
    signer
  );

  let lendingGetterAndSetterFacet = await ethers.getContractAt(
    "LendingGetterAndSetterFacet",
    c.aavegotchiDiamond!,
    signer
  );

  const testing = ["hardhat", "localhost"].includes(network.name);

  if (testing) {
    const aavegotchiDiamondOwner = await diamondOwner(
      c.aavegotchiDiamond!,
      ethers
    );
    const forgeDiamondOwner = await diamondOwner(c.forgeDiamond!, ethers);

    aavegotchiGameFacet = await impersonate(
      aavegotchiDiamondOwner,
      aavegotchiGameFacet,
      ethers,
      network
    );
    forgeDaoFacet = await impersonate(
      forgeDiamondOwner,
      forgeDaoFacet,
      ethers,
      network
    );
    daoFacet = await impersonate(
      aavegotchiDiamondOwner,
      daoFacet,
      ethers,
      network
    );
    lendingGetterAndSetterFacet = await impersonate(
      aavegotchiDiamondOwner,
      lendingGetterAndSetterFacet,
      ethers,
      network
    );
  }

  gasused = await setRealmAddress(
    aavegotchiGameFacet,
    gasused,
    c.realmDiamond!
  );

  //whitelist addresses for baazaar trading
  const addressesToWhitelist = [
    // c.aavegotchiDiamond!,
    // c.forgeDiamond!,
    c.realmDiamond!,
    c.installationDiamond!,
    c.tileDiamond!,
    // c.fakeGotchiArtDiamond!,
    // c.fakeGotchiCardDiamond!,
    c.ggSkinsDiamond!,
    // c.ggProfilesDiamond!,
  ];
  const bools = [true, true, true, true];

  const whitelistTx = await daoFacet.setBaazaarTradingAllowlists(
    addressesToWhitelist,
    bools
  );
  tx = await whitelistTx.wait();
  console.log("Whitelisted addresses for baazaar trading");
  gasused = gasused.add(tx.gasUsed);

  //set revenue token for lendings

  const revenueTokens = [c.fud!, c.fomo!, c.alpha!, c.kek!];
  const revenueTx = await lendingGetterAndSetterFacet.allowRevenueTokens(
    revenueTokens
  );
  tx = await revenueTx.wait();
  console.log("Set revenue tokens for lendings");
  gasused = gasused.add(tx.gasUsed);

  //set forge setter addresses

  //set gltr address
  console.log("Setting gltr address");
  const gltrAddressTx = await forgeDaoFacet.setGltrAddress(c.gltrAddress!);
  tx = await gltrAddressTx.wait();
  console.log("Set gltr address");
  gasused = gasused.add(tx.gasUsed);

  // //set aavegotchi dao address
  // console.log("Setting aavegotchi dao address");
  // const aavegotchiDaoAddressTx = await forgeDaoFacet.setAavegotchiDaoAddress(
  //   c.aavegotchiDaoAddress!
  // );
  // tx = await aavegotchiDaoAddressTx.wait();
  // gasused = gasused.add(tx.gasUsed);

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
