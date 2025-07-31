// SPDX-License-Identifier: MIT
pragma solidity 0.8.1;

import {LibAppStorage, AppStorage, ListingListItem, ERC1155Listing} from "./LibAppStorage.sol";
import {IERC1155} from "../../shared/interfaces/IERC1155.sol";

library LibERC1155Marketplace {
    event ERC1155ListingCancelled(uint256 indexed listingId, uint256 category, uint256 time);
    event ERC1155ListingRemoved(uint256 indexed listingId, uint256 category, uint256 time);
    event UpdateERC1155Listing(uint256 indexed listingId, uint256 quantity, uint256 priceInWei, uint256 time);

    function cancelERC1155Listing(uint256 _listingId, address _owner) internal {
        AppStorage storage s = LibAppStorage.diamondStorage();
        ERC1155Listing storage listing = s.erc1155Listings[_listingId];
        if (listing.timeCreated == 0) {
            return;
        }
        if (listing.cancelled == true || listing.sold == true) {
            return;
        }
        require(listing.seller == _owner, "Marketplace: owner not seller");
        listing.cancelled = true;
        emit ERC1155ListingCancelled(_listingId, listing.category, block.number);
        removeERC1155ListingItem(_listingId, _owner);
    }

    function addERC1155ListingItem(
        address _erc1155TokenAddress,
        address _owner,
        uint256 _category,
        string memory _sort,
        uint256 _listingId
    ) internal {
        // Deprecated: On-chain views are replaced by subgraphs
    }

    function removeERC1155ListingItem(uint256 _listingId, address _owner) internal {
        AppStorage storage s = LibAppStorage.diamondStorage();
        ERC1155Listing storage listing = s.erc1155Listings[_listingId];
        if (listing.timeCreated != 0) {
            s.erc1155TokenToListingId[listing.erc1155TokenAddress][listing.erc1155TypeId][_owner] = 0;
            emit ERC1155ListingRemoved(_listingId, listing.category, block.timestamp);
        }
    }

    function updateERC1155Listing(address _erc1155TokenAddress, uint256 _erc1155TypeId, address _owner) internal {
        AppStorage storage s = LibAppStorage.diamondStorage();
        uint256 listingId = s.erc1155TokenToListingId[_erc1155TokenAddress][_erc1155TypeId][_owner];
        if (listingId == 0) {
            return;
        }
        ERC1155Listing storage listing = s.erc1155Listings[listingId];
        if (listing.timeCreated == 0 || listing.cancelled == true || listing.sold == true) {
            return;
        }
        uint256 quantity = listing.quantity;
        if (quantity > 0) {
            quantity = IERC1155(listing.erc1155TokenAddress).balanceOf(listing.seller, listing.erc1155TypeId);
            if (quantity < listing.quantity) {
                listing.quantity = quantity;
                emit UpdateERC1155Listing(listingId, quantity, listing.priceInWei, block.timestamp);
            }
        }
        if (quantity == 0) {
            cancelERC1155Listing(listingId, listing.seller);
        }
    }

    function updateERC1155ListingPriceAndQuantity(uint256 _listingId, uint256 _quantity, uint256 _priceInWei) internal {
        AppStorage storage s = LibAppStorage.diamondStorage();
        ERC1155Listing storage listing = s.erc1155Listings[_listingId];
        require(listing.timeCreated != 0, "ERC1155Marketplace: listing not found");
        require(listing.sold == false, "ERC1155Marketplace: listing is sold out");
        require(listing.cancelled == false, "ERC1155Marketplace: listing already cancelled");
        require(_quantity * _priceInWei >= 1e15, "ERC1155Marketplace: cost should be 0.001 GHST or larger");
        require(listing.seller == msg.sender, "ERC1155Marketplace: Not seller of ERC1155 listing");
        require(
            IERC1155(listing.erc1155TokenAddress).balanceOf(listing.seller, listing.erc1155TypeId) >= _quantity,
            "ERC1155Marketplace: Not enough ERC1155 token"
        );

        listing.priceInWei = _priceInWei;
        listing.quantity = _quantity;

        emit UpdateERC1155Listing(_listingId, _quantity, _priceInWei, block.timestamp);
    }
}
