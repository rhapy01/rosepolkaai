// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DeFAIAMMPool
 * @notice Minimal constant-product AMM pool (x*y=k) with LP shares for demos.
 * @dev Single pair pool: token0/token1 are immutable. LP shares are this ERC20.
 */
contract DeFAIAMMPool is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable token0;
    address public immutable token1;

    uint112 public reserve0;
    uint112 public reserve1;

    // 0.30% fee like UniswapV2 (997/1000)
    uint256 public constant FEE_NUMERATOR = 997;
    uint256 public constant FEE_DENOMINATOR = 1000;

    error ZeroAddress();
    error SameToken();
    error InvalidAmount();
    error InsufficientLiquidity(uint256 available, uint256 requested);
    error InsufficientOutput(uint256 actual, uint256 minExpected);
    error SlippageExceeded(uint256 amount0, uint256 amount1, uint256 min0, uint256 min1);
    error InvalidToken(address token);

    event LiquidityAdded(address indexed provider, uint256 amount0, uint256 amount1, uint256 liquidityMinted);
    event LiquidityRemoved(address indexed provider, uint256 amount0, uint256 amount1, uint256 liquidityBurned, address to);
    event Swap(address indexed sender, address indexed tokenIn, uint256 amountIn, address indexed tokenOut, uint256 amountOut, address to);

    constructor(address _token0, address _token1) ERC20("DeFAI AMM LP", "dLP") {
        if (_token0 == address(0) || _token1 == address(0)) revert ZeroAddress();
        if (_token0 == _token1) revert SameToken();
        token0 = _token0;
        token1 = _token1;
    }

    function getReserves() external view returns (uint112 _reserve0, uint112 _reserve1) {
        return (reserve0, reserve1);
    }

    function quote(address tokenIn, uint256 amountIn) public view returns (uint256 amountOut) {
        if (amountIn == 0) revert InvalidAmount();
        (uint256 r0, uint256 r1) = (reserve0, reserve1);
        if (tokenIn == token0) {
            amountOut = _getAmountOut(amountIn, r0, r1);
        } else if (tokenIn == token1) {
            amountOut = _getAmountOut(amountIn, r1, r0);
        } else {
            revert InvalidToken(tokenIn);
        }
    }

    function addLiquidity(
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min,
        address to
    ) external nonReentrant returns (uint256 liquidity, uint256 amount0, uint256 amount1) {
        if (to == address(0)) revert ZeroAddress();
        if (amount0Desired == 0 || amount1Desired == 0) revert InvalidAmount();

        (uint256 r0, uint256 r1) = (reserve0, reserve1);
        if (r0 == 0 && r1 == 0) {
            amount0 = amount0Desired;
            amount1 = amount1Desired;
        } else {
            // maintain current price ratio
            uint256 amount1Optimal = (amount0Desired * r1) / r0;
            if (amount1Optimal <= amount1Desired) {
                amount0 = amount0Desired;
                amount1 = amount1Optimal;
            } else {
                uint256 amount0Optimal = (amount1Desired * r0) / r1;
                amount0 = amount0Optimal;
                amount1 = amount1Desired;
            }
        }

        if (amount0 < amount0Min || amount1 < amount1Min) revert SlippageExceeded(amount0, amount1, amount0Min, amount1Min);

        IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0);
        IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1);

        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            liquidity = _sqrt(amount0 * amount1);
        } else {
            uint256 liq0 = (amount0 * _totalSupply) / r0;
            uint256 liq1 = (amount1 * _totalSupply) / r1;
            liquidity = liq0 < liq1 ? liq0 : liq1;
        }
        if (liquidity == 0) revert InvalidAmount();

        _mint(to, liquidity);
        _updateReserves();
        emit LiquidityAdded(to, amount0, amount1, liquidity);
    }

    function removeLiquidity(
        uint256 liquidity,
        uint256 amount0Min,
        uint256 amount1Min,
        address to
    ) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        if (to == address(0)) revert ZeroAddress();
        if (liquidity == 0) revert InvalidAmount();

        uint256 _totalSupply = totalSupply();
        if (balanceOf(msg.sender) < liquidity) revert InsufficientLiquidity(balanceOf(msg.sender), liquidity);

        uint256 bal0 = IERC20(token0).balanceOf(address(this));
        uint256 bal1 = IERC20(token1).balanceOf(address(this));

        amount0 = (liquidity * bal0) / _totalSupply;
        amount1 = (liquidity * bal1) / _totalSupply;

        if (amount0 < amount0Min || amount1 < amount1Min) revert SlippageExceeded(amount0, amount1, amount0Min, amount1Min);

        _burn(msg.sender, liquidity);
        IERC20(token0).safeTransfer(to, amount0);
        IERC20(token1).safeTransfer(to, amount1);

        _updateReserves();
        emit LiquidityRemoved(msg.sender, amount0, amount1, liquidity, to);
    }

    function swapExactInput(
        address tokenIn,
        uint256 amountIn,
        uint256 minAmountOut,
        address to
    ) external nonReentrant returns (uint256 amountOut) {
        if (to == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert InvalidAmount();

        bool zeroForOne;
        if (tokenIn == token0) {
            zeroForOne = true;
        } else if (tokenIn == token1) {
            zeroForOne = false;
        } else {
            revert InvalidToken(tokenIn);
        }

        (uint256 r0, uint256 r1) = (reserve0, reserve1);
        if (r0 == 0 || r1 == 0) revert InsufficientLiquidity(0, 0);

        address tokenOut = zeroForOne ? token1 : token0;
        uint256 reserveIn = zeroForOne ? r0 : r1;
        uint256 reserveOut = zeroForOne ? r1 : r0;

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        amountOut = _getAmountOut(amountIn, reserveIn, reserveOut);
        if (amountOut < minAmountOut) revert InsufficientOutput(amountOut, minAmountOut);

        IERC20(tokenOut).safeTransfer(to, amountOut);
        _updateReserves();
        emit Swap(msg.sender, tokenIn, amountIn, tokenOut, amountOut, to);
    }

    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256) {
        uint256 amountInWithFee = amountIn * FEE_NUMERATOR;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * FEE_DENOMINATOR + amountInWithFee;
        return numerator / denominator;
    }

    function _updateReserves() internal {
        uint256 bal0 = IERC20(token0).balanceOf(address(this));
        uint256 bal1 = IERC20(token1).balanceOf(address(this));
        reserve0 = uint112(bal0);
        reserve1 = uint112(bal1);
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}

