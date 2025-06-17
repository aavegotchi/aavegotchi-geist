// SPDX-License-Identifier: MIT
pragma solidity 0.8.1;

import {LibAavegotchi, AavegotchiInfo} from "../libraries/LibAavegotchi.sol";
import {IERC721} from "../../shared/interfaces/IERC721.sol";
import {ERC721Listing} from "../libraries/LibERC721Marketplace.sol";
import {Modifiers, ListingListItem} from "../libraries/LibAppStorage.sol";

import {LibERC1155Marketplace, ERC1155Listing} from "../libraries/LibERC1155Marketplace.sol";
import {IERC1155} from "../../shared/interfaces/IERC1155.sol";
import {LibERC1155} from "../../shared/libraries/LibERC1155.sol";

contract MarketplaceGetterFacet is Modifiers {
    ///@notice Get an aavegotchi listing details through an identifier
    ///@dev Will throw if the listing does not exist
    ///@param _listingId The identifier of the listing to query
    ///@return listing_ A struct containing certain details about the listing like timeCreated etc
    ///@return aavegotchiInfo_ A struct containing details about the aavegotchi
    function getAavegotchiListing(uint256 _listingId) external view returns (ERC721Listing memory listing_, AavegotchiInfo memory aavegotchiInfo_) {
        listing_ = s.erc721Listings[_listingId];
        require(listing_.timeCreated != 0, "ERC721Marketplace: ERC721 listing does not exist");
        aavegotchiInfo_ = LibAavegotchi.getAavegotchi(listing_.erc721TokenId);
    }

    ///@notice Get an ERC721 listing details through an identifier
    ///@dev Will throw if the listing does not exist
    ///@param _listingId The identifier of the ERC721 listing to query
    ///@return listing_ A struct containing certain details about the ERC721 listing like timeCreated etc

    function getERC721Listing(uint256 _listingId) external view returns (ERC721Listing memory listing_) {
        listing_ = s.erc721Listings[_listingId];
        require(listing_.timeCreated != 0, "ERC721Marketplace: ERC721 listing does not exist");
    }

    ///@notice Get an ERC721 listing details through an NFT
    ///@dev Will throw if the listing does not exist
    ///@param _erc721TokenAddress The address of the NFT associated with the listing
    ///@param _erc721TokenId The identifier of the NFT associated with the listing
    ///@param _owner The owner of the NFT associated with the listing
    ///@return listing_ A struct containing certain details about the ERC721 listing associated with an NFT of contract address `_erc721TokenAddress` and identifier `_erc721TokenId`
    function getERC721ListingFromToken(
        address _erc721TokenAddress,
        uint256 _erc721TokenId,
        address _owner
    ) external view returns (ERC721Listing memory listing_) {
        uint256 listingId = s.erc721TokenToListingId[_erc721TokenAddress][_erc721TokenId][_owner];
        require(listingId != 0, "ERC721Marketplace: listing doesn't exist");
        listing_ = s.erc721Listings[listingId];
    }

    ///@notice Get the standard listing fee in wei
    ///@return The listing fee(Fee for listing NFTs on the baazaar)
    function getListingFeeInWei() external view returns (uint256) {
        return s.listingFeeInWei;
    }

    ///@notice Query the details of an ERC1155 listing
    ///@param _listingId The identifier of the listing to be queried
    ///@return listing_ A struct containing details of the ERC1155 listing being queried

    function getERC1155Listing(uint256 _listingId) external view returns (ERC1155Listing memory listing_) {
        listing_ = s.erc1155Listings[_listingId];
    }

    ///@notice Get an ERC721 listing details through an NFT
    ///@dev Will throw if the listing does not exist
    ///@param _erc1155TokenAddress The address of the NFT associated with the listing
    ///@param _erc1155TypeId The identifier of the NFT associated with the listing
    ///@param _owner The owner of the NFT associated with the listing
    ///@return listing_ A struct containing certain details about the ERC1155 listing associated with an NFT of contract address `_erc721TokenAddress` and identifier `_erc721TokenId`
    function getERC1155ListingFromToken(
        address _erc1155TokenAddress,
        uint256 _erc1155TypeId,
        address _owner
    ) external view returns (ERC1155Listing memory listing_) {
        uint256 listingId = s.erc1155TokenToListingId[_erc1155TokenAddress][_erc1155TypeId][_owner];
        listing_ = s.erc1155Listings[listingId];
    }
}
