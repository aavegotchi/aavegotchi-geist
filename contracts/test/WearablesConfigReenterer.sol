// SPDX-License-Identifier: MIT
pragma solidity 0.8.1;

interface IWearablesConfigFacet {
    function createWearablesConfig(
        uint256 _tokenId,
        string calldata _name,
        uint16[16] calldata _wearablesToStore
    ) external payable returns (uint16 wearablesConfigId);
}

/// @dev Test helper that reenters WearablesConfigFacet.createWearablesConfig when it receives ETH.
contract WearablesConfigReenterer {
    address public immutable diamond;
    uint256 public tokenId;
    string public innerName;
    bool public didReenter;

    constructor(address _diamond) {
        diamond = _diamond;
    }

    function configure(uint256 _tokenId, string calldata _innerName) external {
        tokenId = _tokenId;
        innerName = _innerName;
    }

    receive() external payable {
        if (didReenter) return;
        didReenter = true;

        uint16[16] memory wearables;
        IWearablesConfigFacet(diamond).createWearablesConfig(tokenId, innerName, wearables);
    }
}

