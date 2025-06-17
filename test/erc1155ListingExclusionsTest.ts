import { ethers } from "hardhat";
import { expect } from "chai";
import { DAOFacet, ERC1155MarketplaceFacet } from "../typechain";
import { deployFullDiamond } from "../scripts/deployFullDiamond";

describe("ERC1155 Listing Exclusions", function () {
  this.timeout(200000);
  let daoFacet: DAOFacet;
  let erc1155Facet: ERC1155MarketplaceFacet;
  let diamondAddress: string;
  const itemId = 138;

  before(async () => {
    const { aavegotchiDiamond, testGhstContractAddress } = await deployFullDiamond();
    diamondAddress = aavegotchiDiamond.address;
    daoFacet = (await ethers.getContractAt("DAOFacet", diamondAddress)) as DAOFacet;
    erc1155Facet = (await ethers.getContractAt(
      "ERC1155MarketplaceFacet",
      diamondAddress
    )) as ERC1155MarketplaceFacet;

    const ghst = await ethers.getContractAt(
      "contracts/test/ERC20Token.sol:ERC20Token",
      testGhstContractAddress
    );
    await ghst.mint();
    await daoFacet.mintItems(await ethers.provider.getSigner(0).getAddress(), [itemId], [1]);
  });

  it("reverts when listing excluded item", async () => {
    await daoFacet.setERC1155ListingExclusions(diamondAddress, [itemId], [true]);
    await expect(
      erc1155Facet.setERC1155Listing(diamondAddress, itemId, 1, ethers.utils.parseEther("1"))
    ).to.be.revertedWith("ERC1155Marketplace: token excluded");
  });

  it("allows listing when exclusion removed", async () => {
    await daoFacet.setERC1155ListingExclusions(diamondAddress, [itemId], [false]);
    await expect(
      erc1155Facet.setERC1155Listing(diamondAddress, itemId, 1, ethers.utils.parseEther("1"))
    ).to.emit(erc1155Facet, "ERC1155ListingAdd");
  });
});
