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
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { impersonateSigner } from "../../helpers/helpers";

//MAKE SURE TO SET THESE ADDRESSES IN THE CONSTANTS FILE

async function setVarsAfterDeployment() {
  const c = await varsForNetwork(ethers);

  let tx;
  let gasused = BigNumber.from(0);

  let aavegotchiGameFacet;
  let forgeDaoFacet;
  let daoFacet;
  let lendingGetterAndSetterFacet;

  const testing = ["hardhat", "localhost"].includes(network.name);

  if (testing) {
    await mine();

    const aavegotchiDiamondOwner = await diamondOwner(
      c.aavegotchiDiamond!,
      ethers
    );

    const aavegotchiSigner = await impersonateSigner(
      network,
      aavegotchiDiamondOwner
    );

    const forgeDiamondOwner = await diamondOwner(c.forgeDiamond!, ethers);

    const forgeSigner = await impersonateSigner(network, forgeDiamondOwner);

    aavegotchiGameFacet = await ethers.getContractAt(
      "AavegotchiGameFacet",
      c.aavegotchiDiamond!,
      aavegotchiSigner
    );

    forgeDaoFacet = await ethers.getContractAt(
      "ForgeDAOFacet",
      c.forgeDiamond!,
      forgeSigner
    );

    daoFacet = await ethers.getContractAt(
      "DAOFacet",
      c.aavegotchiDiamond!,
      aavegotchiSigner
    );

    lendingGetterAndSetterFacet = await ethers.getContractAt(
      "LendingGetterAndSetterFacet",
      c.aavegotchiDiamond!,
      aavegotchiSigner
    );
  } else {
    const signer = await getLedgerSigner(ethers);

    //set realm address
    aavegotchiGameFacet = await ethers.getContractAt(
      "AavegotchiGameFacet",
      c.aavegotchiDiamond!,
      signer
    );
    forgeDaoFacet = await ethers.getContractAt(
      "ForgeDAOFacet",
      c.forgeDiamond!,
      signer
    );
    daoFacet = await ethers.getContractAt(
      "DAOFacet",
      c.aavegotchiDiamond!,
      signer
    );

    lendingGetterAndSetterFacet = await ethers.getContractAt(
      "LendingGetterAndSetterFacet",
      c.aavegotchiDiamond!,
      signer
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
    // c.ggSkinsDiamond!,
    // c.ggProfilesDiamond!,
  ];
  const bools = [true, true, true];

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
