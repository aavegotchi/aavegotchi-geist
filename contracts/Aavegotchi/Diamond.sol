// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {LibDiamond} from "../shared/libraries/LibDiamond.sol";
import {DiamondCutFacet} from "../shared/facets/DiamondCutFacet.sol";
import {DiamondLoupeFacet} from "../shared/facets/DiamondLoupeFacet.sol";
import {OwnershipFacet} from "../shared/facets/OwnershipFacet.sol";

contract Diamond {
    constructor(address _contractOwner) {
        LibDiamond.setContractOwner(_contractOwner);
        LibDiamond.addDiamondFunctions(address(new DiamondCutFacet()), address(new DiamondLoupeFacet()), address(new OwnershipFacet()));
    }

    receive() external payable {}

    // Find facet for function that is called and execute the
    // function if a facet is found and return any value.
    fallback() external payable {
        LibDiamond.DiamondStorage storage ds;
        bytes32 position = LibDiamond.DIAMOND_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
        address facet = ds.selectorToFacetAndPosition[msg.sig].facetAddress;
        require(facet != address(0), "Diamond: Function does not exist");
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    //an immutable function that returns the diamondCut, diamondLoupe, and ownership facet addresses for testing

    function getDefaultFacetAddresses() public view returns (address diamondCut, address diamondLoupe, address ownership) {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        diamondCut = ds.facetAddresses[0];
        diamondLoupe = ds.facetAddresses[1];
        ownership = ds.facetAddresses[2];
    }
}
