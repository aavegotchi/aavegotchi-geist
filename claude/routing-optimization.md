# Routing Optimization for Multi-Currency Marketplace

## The Problem
Without proper routing, users could lose significant value due to:
- High slippage on single DEX pools
- Suboptimal routing paths
- MEV attacks
- Stale quotes

## Solution Architecture

### 1. DEX Aggregator Integration

```solidity
interface IDEXAggregator {
    struct SwapRoute {
        address[] routers;      // [Uniswap, Sushiswap, Curve]
        uint256[] percentages;  // [60, 30, 10] - split across DEXs
        bytes[] routerCalldata; // Encoded swap data for each
        uint256 expectedOutput;
        uint256 worstCaseOutput;
    }
    
    function findBestRoute(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (SwapRoute memory);
}
```

### 2. Multi-Path Routing System

```solidity
contract SmartRouter {
    struct Route {
        address[] path;        // Token path: [ETH, USDC, GHST]
        address[] routers;     // DEX for each hop
        uint256[] fees;        // Fee tiers for each pool
        uint256 expectedOut;
        uint256 gasEstimate;
    }
    
    function compareRoutes(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) public view returns (Route[] memory routes) {
        // Check direct routes
        routes[0] = checkDirectRoute(tokenIn, tokenOut, amountIn);
        
        // Check multi-hop routes through common bases
        address[] memory bases = getCommonBases(); // [WETH, USDC, USDT, DAI]
        for (uint i = 0; i < bases.length; i++) {
            routes[i+1] = checkRouteThrough(tokenIn, bases[i], tokenOut, amountIn);
        }
        
        // Sort by output amount - gas cost
        return sortRoutesByNetValue(routes);
    }
}
```

### 3. Price Oracle Validation

```solidity
contract PriceValidator {
    uint256 constant MAX_PRICE_DEVIATION = 300; // 3%
    
    function validateSwapPrice(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    ) external view returns (bool isValid, uint256 deviation) {
        uint256 oraclePrice = getOraclePrice(tokenIn, tokenOut);
        uint256 actualPrice = (amountOut * 1e18) / amountIn;
        
        deviation = actualPrice > oraclePrice 
            ? ((actualPrice - oraclePrice) * 10000) / oraclePrice
            : ((oraclePrice - actualPrice) * 10000) / oraclePrice;
            
        isValid = deviation <= MAX_PRICE_DEVIATION;
    }
}
```

### 4. Implementation Options

#### Option A: Off-Chain Routing (Gas Efficient)
```solidity
function executeListingWithRoute(
    uint256 listingId,
    address paymentToken,
    uint256 paymentAmount,
    bytes calldata routingData, // Pre-calculated route
    uint256 minOutput,
    uint256 deadline
) external {
    require(block.timestamp <= deadline, "Expired");
    
    // Decode and validate routing data
    (address[] memory routers, bytes[] memory swapCalls) = 
        abi.decode(routingData, (address[], bytes[]));
    
    // Verify routers are whitelisted
    for (uint i = 0; i < routers.length; i++) {
        require(isWhitelistedRouter[routers[i]], "Invalid router");
    }
    
    // Execute swaps
    uint256 output = _executeRouting(
        paymentToken,
        paymentAmount,
        routers,
        swapCalls
    );
    
    require(output >= minOutput, "Slippage exceeded");
    
    // Complete purchase
    _completePurchase(listingId, output);
}
```

#### Option B: On-Chain Routing (More Expensive, More Secure)
```solidity
function executeListingWithSmartRouting(
    uint256 listingId,
    address paymentToken,
    uint256 maxPaymentAmount,
    uint256 maxSlippageBps // e.g., 100 = 1%
) external {
    Listing memory listing = getListing(listingId);
    
    // Find best route on-chain
    Route memory bestRoute = findOptimalRoute(
        paymentToken,
        listing.acceptedToken,
        listing.price
    );
    
    // Validate against slippage
    uint256 requiredInput = bestRoute.amountIn;
    uint256 maxAcceptable = listing.price * (10000 + maxSlippageBps) / 10000;
    require(requiredInput <= maxAcceptable, "Route too expensive");
    require(requiredInput <= maxPaymentAmount, "Exceeds max payment");
    
    // Execute route
    uint256 received = _executeRoute(bestRoute);
    require(received >= listing.price, "Insufficient output");
    
    _completePurchase(listingId, received);
}
```

### 5. Hybrid Approach (Recommended)

```solidity
contract HybridRouter {
    uint256 constant ROUTING_GAS_THRESHOLD = 500000;
    
    function purchaseWithBestRoute(
        uint256 listingId,
        address paymentToken,
        uint256 maxPayment,
        bytes calldata offChainRoute, // Optional pre-calculated route
        uint256 maxSlippage
    ) external {
        // If off-chain route provided, validate it
        if (offChainRoute.length > 0) {
            uint256 quoteOutput = validateOffChainRoute(
                offChainRoute,
                paymentToken,
                maxPayment
            );
            
            // If quote is good, use it
            if (quoteOutput >= getMinAcceptableOutput(listingId)) {
                return executeWithRoute(listingId, offChainRoute);
            }
        }
        
        // Otherwise, find route on-chain
        // Use simple routing for common pairs, complex for others
        if (isCommonPair(paymentToken, getListingToken(listingId))) {
            executeSimpleRoute(listingId, paymentToken, maxPayment);
        } else {
            executeComplexRoute(listingId, paymentToken, maxPayment);
        }
    }
}
```

### 6. Protection Mechanisms

#### A. Sandwich Attack Protection
```solidity
modifier sandwichProtection() {
    bytes32 hash = keccak256(abi.encode(msg.sender, block.number));
    require(!recentTxHashes[hash], "Duplicate tx in same block");
    recentTxHashes[hash] = true;
    _;
    // Cleanup old hashes periodically
}
```

#### B. Dynamic Slippage Adjustment
```solidity
function calculateDynamicSlippage(
    address tokenA,
    address tokenB,
    uint256 amount
) public view returns (uint256 slippageBps) {
    uint256 volatility = getTokenPairVolatility(tokenA, tokenB);
    uint256 liquidityDepth = getLiquidityDepth(tokenA, tokenB);
    uint256 tradeSize = getRelativeTradeSize(amount, liquidityDepth);
    
    // Higher volatility = more slippage needed
    // Larger trade relative to liquidity = more slippage
    slippageBps = 50 + (volatility * 10) + (tradeSize * 20);
    
    // Cap at reasonable maximum
    if (slippageBps > 1000) slippageBps = 1000; // 10% max
}
```

### 7. User Experience Optimizations

#### A. Quote Preview System
```solidity
function getQuote(
    uint256 listingId,
    address paymentToken
) external view returns (
    uint256 estimatedCost,
    uint256 worstCaseCost,
    address[] memory route,
    uint256 priceImpact,
    uint256 estimatedGas
) {
    // Return comprehensive quote info for UI
}
```

#### B. Fallback Options
```solidity
struct PurchaseOptions {
    bool allowPartialFill;     // Buy less if perfect swap impossible
    bool allowAlternativeRoute; // Use backup routes
    uint256 maxPriceImpact;    // Maximum acceptable impact
    address[] excludedRouters; // Routers to avoid
}
```

### 8. Real-World Integration Example

```solidity
// User wants to buy NFT listed for 1000 USDC using ETH

function buyNFTWithETH(uint256 listingId) external {
    // 1. Get current ETH/USDC price from multiple sources
    uint256 chainlinkPrice = getChainlinkPrice(ETH, USDC);
    uint256 uniswapQuote = getUniswapQuote(ETH, USDC, 1000e6);
    uint256 sushiQuote = getSushiswapQuote(ETH, USDC, 1000e6);
    uint256 curveQuote = getCurveQuote(ETH, USDC, 1000e6);
    
    // 2. Find best route
    Route memory best;
    if (uniswapQuote < sushiQuote && uniswapQuote < curveQuote) {
        best = Route({router: UNISWAP, quote: uniswapQuote});
    } else if (sushiQuote < curveQuote) {
        best = Route({router: SUSHISWAP, quote: sushiQuote});
    } else {
        best = Route({router: CURVE, quote: curveQuote});
    }
    
    // 3. Validate price is reasonable
    uint256 maxAcceptable = (chainlinkPrice * 1030) / 1000; // 3% slippage
    require(best.quote <= maxAcceptable, "Price too high");
    
    // 4. Execute trade
    executeSwapAndPurchase(listingId, ETH, best);
}
```

### 9. Gas Cost Considerations

```solidity
function shouldUseComplexRouting(
    uint256 tradeValue,
    uint256 simpleRouteQuote,
    uint256 complexRouteQuote
) internal pure returns (bool) {
    uint256 gasPrice = tx.gasprice;
    uint256 additionalGasCost = 200000 * gasPrice; // Complex routing overhead
    uint256 savings = simpleRouteQuote - complexRouteQuote;
    
    // Only use complex routing if savings exceed gas cost
    return savings > additionalGasCost;
}
```

### 10. Monitoring and Analytics

```solidity
event RouteExecuted(
    address indexed buyer,
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 amountOut,
    address[] routers,
    uint256 slippage
);

// Track routing performance for optimization
mapping(bytes32 => RoutingStats) public routePerformance;

struct RoutingStats {
    uint256 totalVolume;
    uint256 avgSlippage;
    uint256 successRate;
    uint256 avgGasUsed;
}
```

## Summary

To protect users from poor execution:

1. **Multi-Source Quotes**: Check multiple DEXs and aggregators
2. **Price Validation**: Compare against oracles
3. **Dynamic Routing**: Adjust based on trade size and market conditions
4. **Slippage Protection**: Set reasonable limits based on volatility
5. **Fallback Options**: Have backup routes if primary fails
6. **Transparency**: Show users expected vs actual execution
7. **Gas Optimization**: Balance routing complexity with gas costs

The key is giving users control while protecting them from common pitfalls.