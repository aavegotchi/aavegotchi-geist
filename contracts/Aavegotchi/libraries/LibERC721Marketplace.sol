// SPDX-License-Identifier: MIT
pragma solidity 0.8.1;

import {LibAppStorage, AppStorage, ListingListItem, ERC721Listing} from "./LibAppStorage.sol";
import {LibMeta} from "../../shared/libraries/LibMeta.sol";

import "../../shared/interfaces/IERC721.sol";

library LibERC721Marketplace {
    event ERC721ListingCancelled(uint256 indexed listingId, uint256 category, uint256 time);
    event ERC721ListingRemoved(uint256 indexed listingId, uint256 category, uint256 time);
    event ERC721ListingPriceUpdate(uint256 indexed listingId, uint256 priceInWei, uint256 time);

    function cancelERC721Listing(uint256 _listingId, address _owner) internal {
        AppStorage storage s = LibAppStorage.diamondStorage();
        // ListingListItem storage listingItem = s.erc721ListingListItem[_listingId];
        // if (listingItem.listingId == 0) {
        // return;
        // }
        ERC721Listing storage listing = s.erc721Listings[_listingId];
        if (listing.cancelled == true || listing.timePurchased != 0 || listing.timeCreated == 0) {
            return;
        }
        require(listing.seller == _owner, "Marketplace: owner not seller");
        listing.cancelled = true;

        //Unlock Aavegotchis when listing is created
        if (listing.erc721TokenAddress == address(this)) {
            s.aavegotchis[listing.erc721TokenId].locked = false;
        }

        emit ERC721ListingCancelled(_listingId, listing.category, block.number);
        removeERC721ListingItem(_listingId, _owner);
    }

    function cancelERC721Listing(address _erc721TokenAddress, uint256 _erc721TokenId, address _owner) internal {
        AppStorage storage s = LibAppStorage.diamondStorage();
        uint256 listingId = s.erc721TokenToListingId[_erc721TokenAddress][_erc721TokenId][_owner];
        if (listingId == 0) {
            return;
        }
        cancelERC721Listing(listingId, _owner);
    }

    function removeERC721ListingItem(uint256 _listingId, address _owner) internal {
        AppStorage storage s = LibAppStorage.diamondStorage();
        ERC721Listing storage listing = s.erc721Listings[_listingId];
        if (listing.timeCreated != 0) {
            emit ERC721ListingRemoved(_listingId, listing.category, block.timestamp);
        }
    }

    function updateERC721Listing(address _erc721TokenAddress, uint256 _erc721TokenId, address _owner) internal {
        AppStorage storage s = LibAppStorage.diamondStorage();
        uint256 listingId = s.erc721TokenToListingId[_erc721TokenAddress][_erc721TokenId][_owner];
        if (listingId == 0) {
            return;
        }
        ERC721Listing storage listing = s.erc721Listings[listingId];
        if (listing.timePurchased != 0 || listing.cancelled == true) {
            return;
        }
        address owner = IERC721(listing.erc721TokenAddress).ownerOf(listing.erc721TokenId);
        if (owner != listing.seller) {
            LibERC721Marketplace.cancelERC721Listing(listingId, listing.seller);
        }
    }

    function updateERC721ListingPrice(uint256 _listingId, uint256 _priceInWei) internal {
        AppStorage storage s = LibAppStorage.diamondStorage();
        ERC721Listing storage listing = s.erc721Listings[_listingId];
        require(listing.timeCreated != 0, "ERC721Marketplace: listing not found");
        require(listing.timePurchased == 0, "ERC721Marketplace: listing already sold");
        require(listing.cancelled == false, "ERC721Marketplace: listing already cancelled");
        require(listing.seller == LibMeta.msgSender(), "ERC721Marketplace: Not seller of ERC721 listing");

        //comment out until graph event is added
        // s.erc721Listings[_listingId].priceInWei = _priceInWei;

        emit ERC721ListingPriceUpdate(_listingId, _priceInWei, block.timestamp);
    }
}
