// SPDX-License-Identifier: MIT
pragma solidity 0.8.1;

import {Modifiers, ItemType, Haunt} from "../libraries/LibAppStorage.sol";
import {LibAavegotchi} from "../libraries/LibAavegotchi.sol";
import {LibERC721} from "../../shared/libraries/LibERC721.sol";
import {LibERC1155} from "../../shared/libraries/LibERC1155.sol";
import {LibItems} from "../libraries/LibItems.sol";
import {LibMeta} from "../../shared/libraries/LibMeta.sol";

import "../WearableDiamond/interfaces/IEventHandlerFacet.sol";

contract ShopFacet is Modifiers {
    event MintPortals(
        address indexed _from,
        address indexed _to,
        // uint256 indexed _batchId,
        uint256 _tokenId,
        uint256 _numAavegotchisToPurchase,
        uint256 _hauntId
    );

    event BuyPortals(
        address indexed _from,
        address indexed _to,
        // uint256 indexed _batchId,
        uint256 _tokenId,
        uint256 _numAavegotchisToPurchase,
        uint256 _totalPrice
    );

    event PurchaseItemsWithGhst(address indexed _buyer, address indexed _to, uint256[] _itemIds, uint256[] _quantities, uint256 _totalPrice);
    event PurchaseTransferItemsWithGhst(address indexed _buyer, address indexed _to, uint256[] _itemIds, uint256[] _quantities, uint256 _totalPrice);

    event PurchaseItemsWithVouchers(address indexed _buyer, address indexed _to, uint256[] _itemIds, uint256[] _quantities);

    ///@notice Allow an item manager to mint neew portals
    ///@dev Will throw if the max number of portals for the current haunt has been reached
    ///@param _to The destination of the minted portals
    ///@param _amount the amunt of portals to mint
    function mintPortals(address _to, uint256 _amount) external onlyItemManager onlyPolygonOrTesting {
        uint256 currentHauntId = s.currentHauntId;
        Haunt storage haunt = s.haunts[currentHauntId];
        address sender = LibMeta.msgSender();
        uint256 hauntCount = haunt.totalCount + _amount;
        require(hauntCount <= haunt.hauntMaxSize, "ShopFacet: Exceeded max number of aavegotchis for this haunt");
        s.haunts[currentHauntId].totalCount = uint24(hauntCount);
        uint32 tokenId = s.tokenIdCounter;
        emit MintPortals(sender, _to, tokenId, _amount, currentHauntId);
        for (uint256 i; i < _amount; i++) {
            s.aavegotchis[tokenId].owner = _to;
            s.aavegotchis[tokenId].hauntId = uint16(currentHauntId);
            s.tokenIdIndexes[tokenId] = s.tokenIds.length;
            s.tokenIds.push(tokenId);
            s.ownerTokenIdIndexes[_to][tokenId] = s.ownerTokenIds[_to].length;
            s.ownerTokenIds[_to].push(tokenId);
            emit LibERC721.Transfer(address(0), _to, tokenId);
            tokenId++;
        }
        s.tokenIdCounter = tokenId;
    }

    // /@notice Allow an address to purchase multiple items
    // /@dev Buying an item typically mints it, it will throw if an item has reached its maximum quantity
    // /@param _to Address to send the items once purchased
    // /@param _itemIds The identifiers of the items to be purchased
    // /@param _quantities The quantities of each item to be bought
    function purchaseItemsWithGhst(address _to, uint256[] calldata _itemIds, uint256[] calldata _quantities) external payable onlyPolygonOrTesting {
        address sender = LibMeta.msgSender();
        require(_itemIds.length == _quantities.length, "ShopFacet: _itemIds not same length as _quantities");
        uint256 totalPrice;
        for (uint256 i; i < _itemIds.length; i++) {
            uint256 itemId = _itemIds[i];
            uint256 quantity = _quantities[i];
            ItemType storage itemType = s.itemTypes[itemId];
            require(itemType.canPurchaseWithGhst, "ShopFacet: Can't purchase item type with GHST");
            uint256 totalQuantity = itemType.totalQuantity + quantity;
            require(totalQuantity <= itemType.maxQuantity, "ShopFacet: Total item type quantity exceeds max quantity");
            itemType.totalQuantity = totalQuantity;
            totalPrice += quantity * itemType.ghstPrice;
            LibItems.addToOwner(_to, itemId, quantity);
        }

        require(msg.value == totalPrice, "ShopFacet: GHST value mismatch");

        emit PurchaseItemsWithGhst(sender, _to, _itemIds, _quantities, totalPrice);
        IEventHandlerFacet(s.wearableDiamond).emitTransferBatchEvent(sender, address(0), _to, _itemIds, _quantities);
        LibAavegotchi.purchase(sender, totalPrice);
        LibERC1155.onERC1155BatchReceived(sender, address(0), _to, _itemIds, _quantities, "");
    }
}
