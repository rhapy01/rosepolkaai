// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title DeFAISimpleSwap
 * @notice Simple fixed-rate swap engine for hackathon demos.
 */
contract DeFAISimpleSwap is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // Pair rate in 1e18 precision: amountOut = amountIn * rate / 1e18
    mapping(address => mapping(address => uint256)) public pairRate;
    // Per-provider liquidity accounting (single-asset vault style, for demos)
    mapping(address => mapping(address => uint256)) public liquidityOf; // token => provider => amount

    event PairRateUpdated(address indexed tokenIn, address indexed tokenOut, uint256 previousRate, uint256 newRate);
    event LiquidityAdded(address indexed token, address indexed from, uint256 amount);
    event LiquidityRemoved(address indexed token, address indexed to, uint256 amount);
    event Swapped(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address recipient
    );

    error ZeroAddress();
    error InvalidAmount();
    error PairNotConfigured(address tokenIn, address tokenOut);
    error InsufficientOutput(uint256 actual, uint256 minExpected);
    error InsufficientLiquidity(uint256 available, uint256 requested);

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setPairRate(address tokenIn, address tokenOut, uint256 newRate) external onlyRole(OPERATOR_ROLE) {
        if (tokenIn == address(0) || tokenOut == address(0)) revert ZeroAddress();
        if (newRate == 0) revert InvalidAmount();

        uint256 previous = pairRate[tokenIn][tokenOut];
        pairRate[tokenIn][tokenOut] = newRate;
        emit PairRateUpdated(tokenIn, tokenOut, previous, newRate);
    }

    function addLiquidity(address token, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit LiquidityAdded(token, msg.sender, amount);
    }

    /**
     * @notice Provide liquidity to the swap contract (for demo purposes).
     * @dev Tracks per-provider deposits to allow later withdrawals.
     */
    function provideLiquidity(address token, uint256 amount) external whenNotPaused nonReentrant {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        liquidityOf[token][msg.sender] += amount;
        emit LiquidityAdded(token, msg.sender, amount);
    }

    /**
     * @notice Remove previously provided liquidity.
     */
    function removeLiquidity(address token, uint256 amount, address to) external whenNotPaused nonReentrant {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        uint256 available = liquidityOf[token][msg.sender];
        if (available < amount) revert InsufficientLiquidity(available, amount);
        liquidityOf[token][msg.sender] = available - amount;
        IERC20(token).safeTransfer(to, amount);
        emit LiquidityRemoved(token, to, amount);
    }

    function quote(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256 amountOut) {
        uint256 rate = pairRate[tokenIn][tokenOut];
        if (rate == 0) revert PairNotConfigured(tokenIn, tokenOut);
        amountOut = (amountIn * rate) / 1e18;
    }

    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external whenNotPaused nonReentrant returns (uint256 amountOut) {
        if (tokenIn == address(0) || tokenOut == address(0) || recipient == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert InvalidAmount();

        amountOut = quote(tokenIn, tokenOut, amountIn);
        if (amountOut < minAmountOut) revert InsufficientOutput(amountOut, minAmountOut);

        uint256 available = IERC20(tokenOut).balanceOf(address(this));
        if (available < amountOut) revert InsufficientLiquidity(available, amountOut);

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(recipient, amountOut);

        emit Swapped(msg.sender, tokenIn, tokenOut, amountIn, amountOut, recipient);
    }
}
