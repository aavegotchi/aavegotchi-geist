# Multi-Currency Conversion System for Aavegotchi Marketplace

## Overview
This document outlines the changes required to support buyers paying in their preferred currency while sellers receive their desired currency.

## Architecture Options

### Option 1: Integrated DEX/AMM Approach
Use on-chain liquidity pools for automatic conversion during purchase.

### Option 2: Oracle-Based Conversion
Use price oracles to calculate conversion rates and perform swaps.

### Option 3: Hybrid Approach (Recommended)
Combine DEX integration with fallback oracle pricing for maximum flexibility.

## Required Changes

### 1. Updated Listing Structure

```solidity
struct ERC721Listing {
    // ... existing fields ...
    address acceptedPaymentToken;  // What seller wants to receive
    uint256 priceInAcceptedToken;  // Price in seller's currency
    address[] alternativePaymentTokens;  // Optional: specific tokens buyer can use
    bool acceptAnyWhitelistedToken;  // Allow any whitelisted token
}
```

### 2. New Conversion Infrastructure

#### A. Conversion Router Contract
```solidity
interface IConversionRouter {
    function convertTokens(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external returns (uint256 amountOut);
    
    function getConversionRate(
        address fromToken,
        address toToken,
        uint256 amount
    ) external view returns (uint256 expectedOut, uint256 slippage);
}
```

#### B. DEX Aggregator Integration
```solidity
contract ConversionRouter {
    // Integrate with multiple DEXs for best rates
    address[] public dexRouters; // Uniswap, SushiSwap, etc.
    
    function findBestRoute(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal view returns (address bestRouter, uint256 bestAmountOut);
}
```

### 3. Modified Purchase Flow

#### Current Flow:
1. Buyer has GHST
2. GHST transferred to seller/fees
3. NFT transferred to buyer

#### New Flow:
1. Buyer specifies payment token
2. System calculates conversion rate
3. Buyer approves payment amount + slippage
4. Contract executes swap if needed
5. Seller receives desired token
6. NFT transferred to buyer

### 4. Smart Contract Modifications

#### A. ERC721MarketplaceFacet Updates
```solidity
function executeERC721ListingWithConversion(
    uint256 _listingId,
    address _paymentToken,
    uint256 _maxPaymentAmount,
    uint256 _deadline
) external {
    ERC721Listing storage listing = s.erc721Listings[_listingId];
    
    // Validate payment token is accepted
    require(
        _paymentToken == listing.acceptedPaymentToken || 
        listing.acceptAnyWhitelistedToken ||
        isInAlternativeTokens(_paymentToken, listing),
        "Payment token not accepted"
    );
    
    uint256 paymentAmount;
    if (_paymentToken == listing.acceptedPaymentToken) {
        // Direct payment, no conversion needed
        paymentAmount = listing.priceInAcceptedToken;
    } else {
        // Calculate required payment amount with conversion
        paymentAmount = calculatePaymentAmount(
            _paymentToken,
            listing.acceptedPaymentToken,
            listing.priceInAcceptedToken
        );
        require(paymentAmount <= _maxPaymentAmount, "Exceeds max payment");
    }
    
    // Execute conversion and payment
    _executeConversionAndPayment(
        _paymentToken,
        listing.acceptedPaymentToken,
        paymentAmount,
        listing
    );
}
```

#### B. LibSharedMarketplace Updates
```solidity
function transferSalesWithConversion(
    SplitAddresses memory addresses,
    BaazaarSplit memory split,
    address paymentToken,
    address receiveToken
) internal {
    if (paymentToken == receiveToken) {
        // Direct transfer (existing logic)
        transferSales(addresses, split);
    } else {
        // Transfer from buyer and convert
        uint256 totalAmount = calculateTotalPayment(split);
        
        // Get payment from buyer
        LibERC20.transferFrom(paymentToken, addresses.buyer, address(this), totalAmount);
        
        // Convert to seller's desired token
        uint256 convertedAmount = IConversionRouter(s.conversionRouter).convertTokens(
            paymentToken,
            receiveToken,
            totalAmount,
            split.sellerShare, // minimum output
            address(this)
        );
        
        // Distribute converted amounts
        _distributConvertedPayments(receiveToken, addresses, split, convertedAmount);
    }
}
```

### 5. Slippage Protection

```solidity
struct ConversionParams {
    uint256 maxSlippage; // basis points (e.g., 100 = 1%)
    uint256 deadline;    // transaction deadline
    uint256 minOutputAmount; // minimum tokens seller should receive
}
```

### 6. Fee Handling with Multiple Currencies

#### Option A: Convert All to GHST
- Convert buyer's payment to GHST first
- Distribute fees in GHST as currently done
- Convert remainder to seller's currency

#### Option B: Multi-Currency Fee Collection
- Collect fees in whatever currency is used
- DAO treasury accepts multiple currencies
- Periodic consolidation if needed

#### Option C: Fee Token Specification
- Allow fee recipients to specify preferred tokens
- Convert fees to each recipient's preferred token

### 7. UI/UX Considerations

1. **Price Display**: Show prices in multiple currencies
2. **Conversion Preview**: Show expected conversion rate and fees
3. **Slippage Settings**: Allow buyers to set slippage tolerance
4. **Currency Selection**: Easy token picker for buyers
5. **Rate Refresh**: Real-time rate updates before confirmation

### 8. Security Considerations

1. **Sandwich Attack Protection**
   - Use commit-reveal pattern
   - Implement maximum slippage checks
   - Consider private mempool submission

2. **Oracle Manipulation**
   - Use multiple price sources
   - Implement price deviation checks
   - Time-weighted average prices (TWAP)

3. **Reentrancy Protection**
   - Add reentrancy guards on all conversion functions
   - Follow checks-effects-interactions pattern

4. **Token Validation**
   - Maintain strict whitelist of accepted tokens
   - Validate token contracts before interaction
   - Check for fee-on-transfer tokens

### 9. Implementation Phases

#### Phase 1: Basic Infrastructure
- Deploy ConversionRouter contract
- Integrate with 1-2 major DEXs
- Update listing structures

#### Phase 2: Direct Conversion
- Allow buyers to pay in any whitelisted token
- Sellers still receive only their specified token
- Basic slippage protection

#### Phase 3: Advanced Features
- Multi-hop conversions for better rates
- DEX aggregation for optimal routing
- Advanced slippage algorithms

#### Phase 4: Fee Optimization
- Multi-currency fee collection
- Automatic fee consolidation
- Yield generation on collected fees

### 10. Gas Optimization Strategies

1. **Batch Conversions**: Group multiple small trades
2. **Direct Routes**: Prioritize direct trading pairs
3. **Gas Token Integration**: Use CHI/GST2 for cheaper swaps
4. **Off-chain Calculation**: Calculate routes off-chain

## Example Implementation Flow

```
1. Seller lists NFT for 100 USDC
2. Buyer wants to pay with ETH
3. System checks ETH->USDC rate (e.g., 1 ETH = 2000 USDC)
4. Buyer needs 0.05 ETH + slippage buffer
5. Buyer approves 0.055 ETH (10% slippage buffer)
6. Contract:
   a. Pulls 0.05 ETH from buyer (or up to 0.055 if needed)
   b. Swaps ETH->USDC via DEX
   c. Ensures at least 100 USDC output
   d. Distributes USDC to seller/fees
   e. Transfers NFT to buyer
   f. Refunds excess ETH if any
```

## Migration Strategy

1. **Soft Launch**: Enable for new listings only
2. **Opt-in Period**: Allow existing listings to enable
3. **Full Migration**: All listings support conversion
4. **Legacy Support**: Maintain GHST-only option

## Estimated Gas Costs

- Direct payment (no conversion): ~150k gas
- Single-hop conversion: ~250k gas  
- Multi-hop conversion: ~350k gas
- With DEX aggregation: ~400k gas

Consider implementing gas subsidies or meta-transactions for better UX.