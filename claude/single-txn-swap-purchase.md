# Single Transaction Swap + Purchase Implementation

## Overview
Executing both the currency swap and NFT purchase in a single atomic transaction provides better UX, gas efficiency, and security.

## Implementation Approach

### 1. Direct Integration Method (Recommended)

```solidity
function executeERC721ListingWithSwap(
    uint256 _listingId,
    address _paymentToken,
    uint256 _maxPaymentAmount,
    bytes calldata _swapData  // Encoded swap parameters
) external nonReentrant {
    ERC721Listing storage listing = s.erc721Listings[_listingId];
    address buyer = msg.sender;
    
    // 1. Pull payment token from buyer
    IERC20(_paymentToken).transferFrom(
        buyer, 
        address(this), 
        _maxPaymentAmount
    );
    
    // 2. Execute swap if needed
    uint256 receivedAmount;
    if (_paymentToken != listing.acceptedPaymentToken) {
        // Perform swap inline
        receivedAmount = _executeSwap(
            _paymentToken,
            listing.acceptedPaymentToken,
            _maxPaymentAmount,
            listing.priceInAcceptedToken,
            _swapData
        );
    } else {
        receivedAmount = _maxPaymentAmount;
    }
    
    // 3. Verify we got enough tokens
    require(
        receivedAmount >= listing.priceInAcceptedToken,
        "Insufficient output from swap"
    );
    
    // 4. Distribute payments (all in seller's desired token)
    _distributePayments(listing, receivedAmount);
    
    // 5. Transfer NFT to buyer
    _transferNFT(listing, buyer);
    
    // 6. Refund excess payment token if any
    uint256 remaining = IERC20(_paymentToken).balanceOf(address(this));
    if (remaining > 0) {
        IERC20(_paymentToken).transfer(buyer, remaining);
    }
}
```

### 2. Swap Execution Options

#### Option A: Integrated DEX Router
```solidity
function _executeSwap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minAmountOut,
    bytes calldata swapData
) internal returns (uint256 amountOut) {
    // Decode swap parameters
    (address router, bytes memory routerCalldata) = abi.decode(
        swapData, 
        (address, bytes)
    );
    
    // Approve router
    IERC20(tokenIn).approve(router, amountIn);
    
    // Execute swap
    (bool success, bytes memory returnData) = router.call(routerCalldata);
    require(success, "Swap failed");
    
    // Calculate output
    amountOut = IERC20(tokenOut).balanceOf(address(this));
    require(amountOut >= minAmountOut, "Slippage exceeded");
}
```

#### Option B: Built-in AMM Integration
```solidity
function _executeSwapViaUniswapV3(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minAmountOut
) internal returns (uint256 amountOut) {
    ISwapRouter.ExactInputSingleParams memory params =
        ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: 3000, // 0.3% pool
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amountIn,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0
        });
    
    amountOut = ISwapRouter(UNISWAP_V3_ROUTER).exactInputSingle(params);
}
```

### 3. Gas-Optimized Architecture

```solidity
contract MarketplaceWithSwap {
    using SafeERC20 for IERC20;
    
    // Pre-approved routers for gas savings
    mapping(address => bool) public approvedRouters;
    
    modifier onlyApprovedRouter(address router) {
        require(approvedRouters[router], "Unapproved router");
        _;
    }
    
    function executeListingAtomic(
        uint256 listingId,
        SwapParams calldata swap
    ) external {
        // 1. Load listing data
        Listing memory listing = _getListing(listingId);
        
        // 2. Single transferFrom for payment token
        IERC20(swap.tokenIn).safeTransferFrom(
            msg.sender,
            address(this),
            swap.amountIn
        );
        
        // 3. Execute swap and purchase in same context
        uint256 output = _swap(swap);
        _completePurchase(listing, output);
        
        // 4. Single transfer for NFT
        _transferNFT(listing.tokenId, msg.sender);
    }
}
```

### 4. Advanced Single-Transaction Patterns

#### A. Multicall Pattern
```solidity
function multicall(bytes[] calldata data) 
    external 
    returns (bytes[] memory results) 
{
    results = new bytes[](data.length);
    for (uint256 i; i < data.length; i++) {
        (bool success, bytes memory result) = 
            address(this).delegatecall(data[i]);
        require(success, "Multicall failed");
        results[i] = result;
    }
}

// Usage: Combine approve + swap + purchase in one tx
```

#### B. Permit + Swap + Purchase
```solidity
function purchaseWithPermitAndSwap(
    uint256 listingId,
    address paymentToken,
    uint256 paymentAmount,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s,
    bytes calldata swapData
) external {
    // 1. Use permit for gasless approval
    IERC20Permit(paymentToken).permit(
        msg.sender,
        address(this),
        paymentAmount,
        deadline,
        v, r, s
    );
    
    // 2. Execute swap and purchase
    executeERC721ListingWithSwap(
        listingId,
        paymentToken,
        paymentAmount,
        swapData
    );
}
```

### 5. Callback Pattern for Complex Swaps

```solidity
interface ISwapCallback {
    function swapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external;
}

contract MarketplaceWithCallback is ISwapCallback {
    function executeWithFlashSwap(
        uint256 listingId,
        address paymentToken
    ) external {
        // Initiate flash swap
        IUniswapV3Pool(pool).swap(
            address(this),
            zeroForOne,
            amountSpecified,
            sqrtPriceLimitX96,
            abi.encode(msg.sender, listingId, paymentToken)
        );
    }
    
    function swapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external override {
        // Decode parameters
        (address buyer, uint256 listingId, address paymentToken) = 
            abi.decode(data, (address, uint256, address));
        
        // Complete purchase with received tokens
        _completePurchase(listingId);
        
        // Pay back the swap
        IERC20(paymentToken).transferFrom(
            buyer,
            msg.sender,
            uint256(amount0Delta)
        );
    }
}
```

### 6. Benefits of Single Transaction

1. **Atomicity**: Either everything succeeds or nothing happens
2. **No Race Conditions**: Price can't change between swap and purchase
3. **Better UX**: One transaction, one gas fee
4. **MEV Protection**: Harder to sandwich attack
5. **Capital Efficiency**: No need to hold intermediate tokens

### 7. Gas Optimization Techniques

```solidity
// 1. Pack struct data efficiently
struct OptimizedListing {
    uint128 price;
    uint128 tokenId;
    address seller;
    address paymentToken;
}

// 2. Use assembly for efficient swaps
function efficientSwap(
    address target,
    bytes calldata data
) internal returns (uint256 output) {
    assembly {
        let success := call(
            gas(),
            target,
            0,
            add(data.offset, 0x20),
            data.length,
            0,
            0
        )
        
        if iszero(success) {
            revert(0, 0)
        }
        
        // Read return value
        returndatacopy(0, 0, 0x20)
        output := mload(0)
    }
}

// 3. Batch operations
function batchPurchaseWithSwaps(
    PurchaseData[] calldata purchases
) external {
    for (uint256 i; i < purchases.length;) {
        _executeSinglePurchase(purchases[i]);
        unchecked { ++i; }
    }
}
```

### 8. Example Transaction Flow

```
1. User calls: purchaseNFTWithETH(listingId=123, maxETH=1.5)
2. Contract executes in single tx:
   a. transferFrom(user, contract, 1.5 ETH)
   b. swap(ETH → USDC) via Uniswap
   c. receive 3000 USDC
   d. transfer(2910 USDC → seller)  // 97%
   e. transfer(30 USDC → dao)       // 1%
   f. transfer(60 USDC → pixelcraft) // 2%
   g. transfer(NFT → user)
   h. refund(0.1 ETH → user)  // unused ETH
3. Transaction completes atomically
```

### 9. Security Considerations

```solidity
contract SecureMarketplace {
    // Reentrancy guard
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;
    
    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
    
    // Slippage protection
    modifier validateSlippage(uint256 maxSlippage) {
        require(maxSlippage <= 1000, "Slippage too high"); // Max 10%
        _;
    }
    
    // Router validation
    modifier onlyWhitelistedRouter(address router) {
        require(s.whitelistedRouters[router], "Invalid router");
        _;
    }
}
```

## Conclusion

Single transaction swap + purchase is not only possible but recommended. It provides better security, UX, and gas efficiency compared to multi-step processes. The key is proper architecture and careful handling of edge cases like slippage and failed swaps.