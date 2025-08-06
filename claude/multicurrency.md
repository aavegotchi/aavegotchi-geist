# Multi-Currency Feature Analysis for Aavegotchi Marketplace

## Executive Summary
This document analyzes the current implementation of the Aavegotchi marketplace contracts and identifies areas requiring modification to support multiple currencies in the Baazaar and Auction House.

## Current State Analysis

### 1. Marketplace Components
The Aavegotchi marketplace consists of several key components:

#### ERC721 Marketplace (NFT trading)
- **Contract**: `ERC721MarketplaceFacet.sol`
- **Features**: Listing, buying, and canceling NFT sales
- **Buy Orders**: `ERC721BuyOrderFacet.sol`

#### ERC1155 Marketplace (Item/Wearable trading)
- **Contract**: `ERC1155MarketplaceFacet.sol`
- **Features**: Listing, buying, and canceling item sales in bulk
- **Buy Orders**: `ERC1155BuyOrderFacet.sol`

#### Shop System
- **Contract**: `ShopFacet.sol`
- **Features**: Direct item purchases from the protocol

#### Auction House
- **Status**: No dedicated auction house contracts found in the current codebase
- **Note**: This may be deployed separately or planned for future implementation

### 2. Current Currency Implementation

#### Hardcoded GHST Token
All marketplace transactions are currently hardcoded to use GHST token:
- **Storage**: `s.ghstContract` in `AppStorage` (contracts/Aavegotchi/libraries/LibAppStorage.sol:229)
- **Usage**: All payment functions directly reference this single token address

#### Payment Flow
1. Buyer must have sufficient GHST balance
2. GHST is transferred from buyer to multiple recipients based on fee splits
3. No support for alternative payment tokens

### 3. Key Areas Requiring Modification

#### A. Storage Structure Changes
**Current**: Single `address ghstContract` in AppStorage
**Required**: 
```solidity
// Option 1: Whitelist approach
mapping(address => bool) acceptedCurrencies;
mapping(address => uint256) currencyListingFees;

// Option 2: Per-listing currency
struct ERC721Listing {
    // ... existing fields ...
    address paymentToken; // New field
}
```

#### B. Contract Modifications Required

1. **ERC721MarketplaceFacet.sol**
   - Modify `createERC721Listing()` to accept payment token parameter
   - Update `handleExecuteERC721Listing()` to handle multiple currencies
   - Price validation per currency (minimum amounts may differ)

2. **ERC1155MarketplaceFacet.sol**
   - Similar modifications as ERC721 marketplace
   - Batch operations must validate same currency for all items

3. **ERC721BuyOrderFacet.sol & ERC1155BuyOrderFacet.sol**
   - Add currency specification to buy orders
   - Ensure buyer has sufficient balance in specified currency

4. **LibSharedMarketplace.sol**
   - Major refactoring of `transferSales()` function
   - Currently hardcoded to transfer GHST
   - Must support any ERC20 token

5. **ShopFacet.sol**
   - Add currency options for direct purchases
   - Update pricing structure to support multiple currencies

#### C. Fee Structure Considerations

Current fee splits (hardcoded percentages):
- DAO: 1%
- PixelCraft: 2%
- Player Rewards: 0.5%
- Seller: 96.5% minus royalties and affiliate fees

**Considerations for multi-currency**:
- Fee recipients must be able to receive all accepted currencies
- Consider automatic conversion mechanism or separate fee collection per currency
- Listing fees currently burned - need strategy for non-GHST tokens

#### D. Price Discovery and Display

**Current State**: All prices in GHST with specific minimums:
- ERC721: Minimum 1 GHST
- ERC1155: Minimum 0.001 GHST

**Multi-currency Challenges**:
- Different minimum amounts per currency
- Price comparison across currencies
- Frontend display and filtering complexity
- Oracle requirements for conversion rates (optional)

### 4. Implementation Recommendations

#### Phase 1: Core Infrastructure
1. Create currency whitelist management functions
2. Modify listing structures to include payment token
3. Update payment transfer logic to be token-agnostic
4. Implement currency-specific minimum prices

#### Phase 2: Marketplace Updates
1. Update all marketplace facets to support currency parameter
2. Modify buy order system for multi-currency support
3. Update events to include currency information
4. Ensure backwards compatibility with existing GHST listings

#### Phase 3: Advanced Features
1. Implement price oracle integration (optional)
2. Add currency conversion features (optional)
3. Multi-currency auction house implementation
4. Cross-currency offer matching

### 5. Security Considerations

1. **Token Validation**: Ensure only whitelisted tokens are accepted
2. **Reentrancy**: Review all payment flows for reentrancy risks with new tokens
3. **Price Manipulation**: Consider risks of accepting volatile tokens
4. **Fee Collection**: Ensure fee recipients can handle all currencies
5. **Decimal Handling**: Different tokens have different decimal places

### 6. Backward Compatibility

To maintain compatibility:
1. Default to GHST if no currency specified
2. Existing listings continue to use GHST
3. Migration path for existing buy orders
4. Gradual rollout with feature flags

### 7. Testing Requirements

1. Unit tests for each currency type
2. Integration tests for cross-currency scenarios
3. Gas optimization testing
4. Frontend integration testing
5. Load testing with multiple concurrent currencies

## Conclusion

Supporting multiple currencies in the Aavegotchi marketplace requires significant modifications to the core payment infrastructure. The primary challenges are:

1. Refactoring hardcoded GHST references throughout the codebase
2. Updating storage structures to support per-listing currencies
3. Modifying fee distribution logic to handle multiple tokens
4. Ensuring security and preventing manipulation

The implementation should be phased to minimize risk and maintain backward compatibility with existing GHST-based listings.