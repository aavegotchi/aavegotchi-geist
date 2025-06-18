// SPDX-License-Identifier: MIT
pragma solidity 0.8.1;

import {LibAavegotchi, AavegotchiInfo} from "../libraries/LibAavegotchi.sol";
import {LibGotchiLending} from "../libraries/LibGotchiLending.sol";
import {Modifiers, GotchiLending} from "../libraries/LibAppStorage.sol";
import {LibMeta} from "../../shared/libraries/LibMeta.sol";
import {IERC20} from "../../shared/interfaces/IERC20.sol";

import {LibBitmapHelpers} from "../libraries/LibBitmapHelpers.sol";

contract LendingGetterAndSetterFacet is Modifiers {
    event LendingOperatorSet(address indexed lender, address indexed lendingOperator, uint32 indexed tokenId, bool isLendingOperator);

    function allowRevenueTokens(address[] calldata tokens) external onlyOwner {
        for (uint256 i = 0; i < tokens.length; ) {
            s.revenueTokenAllowed[tokens[i]] = true;
            unchecked {
                ++i;
            }
        }
    }

    function disallowRevenueTokens(address[] calldata tokens) external onlyOwner {
        for (uint256 i = 0; i < tokens.length; ) {
            s.revenueTokenAllowed[tokens[i]] = false;
            unchecked {
                ++i;
            }
        }
    }

    ///@notice Set the lending operator for a given token
    ///@dev Only the aavegotchi owner can set a lending operator
    ///@dev Can only be called when the token is unlocked to prevent borrowers from setting operators
    function setLendingOperator(
        address _lendingOperator,
        uint32 _tokenId,
        bool _isLendingOperator
    ) public onlyAavegotchiOwner(_tokenId) onlyUnlocked(_tokenId) {
        address sender = LibMeta.msgSender();
        s.lendingOperators[sender][_lendingOperator][_tokenId] = _isLendingOperator;
        emit LendingOperatorSet(sender, _lendingOperator, _tokenId, _isLendingOperator);
    }

    struct LendingOperatorInputs {
        uint32 _tokenId;
        bool _isLendingOperator;
    }

    function batchSetLendingOperator(address _lendingOperator, LendingOperatorInputs[] calldata _inputs) external {
        for (uint256 i = 0; i < _inputs.length; ) {
            setLendingOperator(_lendingOperator, _inputs[i]._tokenId, _inputs[i]._isLendingOperator);
            unchecked {
                ++i;
            }
        }
    }

    /*/////////////////////////////////////////////////////////////////////////////////
    ///                                    GETTERS                                  ///
    /////////////////////////////////////////////////////////////////////////////////*/

    function revenueTokenAllowed(address token) external view returns (bool) {
        return s.revenueTokenAllowed[token];
    }

    function getTokenBalancesInEscrow(uint32 _tokenId, address[] calldata _revenueTokens) external view returns (uint256[] memory revenueBalances) {
        revenueBalances = new uint256[](_revenueTokens.length);
        address escrow = LibAavegotchi.getAavegotchi(_tokenId).escrow;
        for (uint256 i = 0; i < _revenueTokens.length; ) {
            revenueBalances[i] = IERC20(_revenueTokens[i]).balanceOf(escrow);
            unchecked {
                ++i;
            }
        }
    }

    function isLendingOperator(address _lender, address _lendingOperator, uint32 _tokenId) external view returns (bool) {
        return s.lendingOperators[_lender][_lendingOperator][_tokenId];
    }

    ///@notice Get an aavegotchi lending details through an identifier
    ///@dev Will throw if the lending does not exist
    ///@param _listingId The identifier of the lending to query
    ///@return listing_ A struct containing certain details about the lending like timeCreated etc
    ///@return aavegotchiInfo_ A struct containing details about the aavegotchi
    function getGotchiLendingListingInfo(
        uint32 _listingId
    ) external view returns (GotchiLending memory listing_, AavegotchiInfo memory aavegotchiInfo_) {
        listing_ = LibGotchiLending.getListing(_listingId);
        aavegotchiInfo_ = LibAavegotchi.getAavegotchi(listing_.erc721TokenId);
    }

    ///@notice Get an ERC721 lending details through an identifier
    ///@dev Will throw if the lending does not exist
    ///@param _listingId The identifier of the lending to query
    ///@return listing_ A struct containing certain details about the ERC721 lending like timeCreated etc
    function getLendingListingInfo(uint32 _listingId) external view returns (GotchiLending memory listing_) {
        listing_ = LibGotchiLending.getListing(_listingId);
    }

    ///@notice Get an aavegotchi lending details through an NFT
    ///@dev Will throw if the lending does not exist
    ///@param _erc721TokenId The identifier of the NFT associated with the lending
    ///@return listing_ A struct containing certain details about the lending associated with an NFT of contract identifier `_erc721TokenId`
    function getGotchiLendingFromToken(uint32 _erc721TokenId) external view returns (GotchiLending memory listing_) {
        listing_ = LibGotchiLending.getListing(s.aavegotchiToListingId[_erc721TokenId]);
    }

    function getGotchiLendingIdByToken(uint32 _erc721TokenId) external view returns (uint32) {
        return s.aavegotchiToListingId[_erc721TokenId];
    }

    function getGotchiLendingsLength() external view returns (uint256) {
        return s.nextGotchiListingId;
    }

    function isAavegotchiLent(uint32 _erc721TokenId) external view returns (bool) {
        return LibGotchiLending.isAavegotchiLent(_erc721TokenId);
    }

    function isAavegotchiListed(uint32 _erc721TokenId) external view returns (bool) {
        return LibGotchiLending.isAavegotchiListed(_erc721TokenId);
    }

    function getLendingPermissionBitmap(uint32 _listingId) external view returns (uint256) {
        return s.gotchiLendings[_listingId].permissions;
    }

    function getAllLendingPermissions(uint32 _listingId) external view returns (uint8[32] memory permissions_) {
        permissions_ = LibBitmapHelpers.getAllNumbers(s.gotchiLendings[_listingId].permissions);
    }

    function getLendingPermissionModifier(uint32 _listingId, uint8 _permissionIndex) public view returns (uint8) {
        return LibBitmapHelpers.getValueInByte(_permissionIndex, s.gotchiLendings[_listingId].permissions);
    }

    //simple check to see if a lending listing permission is set to none
    function lendingPermissionSetToNone(uint32 _listingId) public view returns (bool) {
        return getLendingPermissionModifier(_listingId, 0) == 0;
    }
}
