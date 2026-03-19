// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title DeFAIPlatform
 * @notice OpenZeppelin-based platform contract for DeFAI on Polkadot Hub (EVM).
 *         Uses OZ primitives for secure ownership, role-based access, pausability,
 *         reentrancy protection, and safe token operations.
 */
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract DeFAIPlatform is Ownable2Step, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant FEE_RECORDER_ROLE = keccak256("FEE_RECORDER_ROLE");
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");

    uint256 public platformFeeBps; // basis points, e.g. 10 = 0.1%
    address public treasury;
    uint256 public totalFeesCollected;
    mapping(address => uint256) public feesCollectedByToken;
    mapping(address => bool) public allowedTargets;
    mapping(address => mapping(bytes4 => bool)) public allowedTargetSelectors;

    event PlatformFeeCollected(address indexed fromToken, address indexed user, uint256 amountWei, uint256 feeWei);
    event PlatformFeeUpdated(uint256 previousBps, uint256 newBps);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event TargetAllowlistUpdated(address indexed target, bool allowed);
    event TargetSelectorAllowlistUpdated(address indexed target, bytes4 indexed selector, bool allowed);
    event PolicyExecuted(
        address indexed user,
        address indexed target,
        address indexed inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 feeAmount,
        uint256 outputAmount,
        address recipient
    );

    error InvalidFee();
    error ZeroAddress();
    error InvalidAmount();
    error InvalidCallData();
    error TargetNotAllowed(address target);
    error SelectorNotAllowed(address target, bytes4 selector);
    error TargetExecutionFailed(bytes reason);
    error InsufficientOutput(uint256 actual, uint256 minExpected);
    error PermitValueTooLow(uint256 permitValue, uint256 requiredAmount);

    constructor(address initialOwner, address initialTreasury, uint256 _platformFeeBps) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        if (initialTreasury == address(0)) revert ZeroAddress();
        if (_platformFeeBps > 10000) revert InvalidFee();
        platformFeeBps = _platformFeeBps;
        treasury = initialTreasury;

        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(TREASURER_ROLE, initialOwner);
        // By default, allow owner to record fees (you can grant this to a router/agent later)
        _grantRole(FEE_RECORDER_ROLE, initialOwner);
    }

    /**
     * @notice Compute platform fee for a given amount.
     * @param amount Raw amount (e.g. wei or token units).
     * @return fee Amount of fee in the same units.
     */
    function computeFee(uint256 amount) external view returns (uint256 fee) {
        return (amount * platformFeeBps) / 10000;
    }

    /**
     * @notice Update platform fee (basis points). Only owner.
     */
    function setPlatformFeeBps(uint256 _platformFeeBps) external onlyOwner {
        if (_platformFeeBps > 10000) revert InvalidFee();
        uint256 previous = platformFeeBps;
        platformFeeBps = _platformFeeBps;
        emit PlatformFeeUpdated(previous, _platformFeeBps);
    }

    /**
     * @notice Update treasury recipient for platform fees.
     */
    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previous, newTreasury);
    }

    /**
     * @notice Update allowlist status for callable target contracts.
     */
    function setTargetAllowed(address target, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (target == address(0)) revert ZeroAddress();
        allowedTargets[target] = allowed;
        emit TargetAllowlistUpdated(target, allowed);
    }

    /**
     * @notice Allow or block specific target function selectors.
     */
    function setTargetSelectorAllowed(address target, bytes4 selector, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (target == address(0)) revert ZeroAddress();
        allowedTargetSelectors[target][selector] = allowed;
        emit TargetSelectorAllowlistUpdated(target, selector, allowed);
    }

    /**
     * @notice Pause sensitive operations (withdrawals + fee recording). Admin only.
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause. Admin only.
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Record that a fee was collected (e.g. called by a DEX router or after a swap).
     *         This is for accounting/analytics; fee collection can happen in a router or off-chain.
     */
    function recordFee(address fromToken, address user, uint256 amountWei, uint256 feeWei)
        external
        whenNotPaused
        onlyRole(FEE_RECORDER_ROLE)
    {
        totalFeesCollected += feeWei;
        feesCollectedByToken[fromToken] += feeWei;
        emit PlatformFeeCollected(fromToken, user, amountWei, feeWei);
    }

    /**
     * @notice Execute an allowlisted target call using pulled ERC20 input.
     *         Platform fee is routed to treasury, the remainder is approved to `target`.
     * @dev If `usePermit` is true, the contract calls IERC20Permit.permit before transferFrom.
     *      Expected output tokens must be returned to this contract by `target` and are forwarded to `recipient`.
     */
    function executeWithPolicy(
        address inputToken,
        address outputToken,
        address target,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bool usePermit,
        uint256 permitValue,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes calldata targetCallData
    ) external whenNotPaused nonReentrant returns (uint256 amountOut) {
        if (inputToken == address(0) || outputToken == address(0) || target == address(0) || recipient == address(0)) {
            revert ZeroAddress();
        }
        if (targetCallData.length < 4) revert InvalidCallData();
        if (!allowedTargets[target]) revert TargetNotAllowed(target);
        if (amountIn == 0) revert InvalidAmount();

        bytes4 selector = bytes4(targetCallData[:4]);
        if (!allowedTargetSelectors[target][selector]) revert SelectorNotAllowed(target, selector);

        if (usePermit) {
            if (permitValue < amountIn) revert PermitValueTooLow(permitValue, amountIn);
            IERC20Permit(inputToken).permit(msg.sender, address(this), permitValue, permitDeadline, v, r, s);
        }

        IERC20 input = IERC20(inputToken);
        IERC20 output = IERC20(outputToken);

        input.safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 feeAmount = (amountIn * platformFeeBps) / 10000;
        uint256 amountForTarget = amountIn - feeAmount;

        if (feeAmount > 0) {
            input.safeTransfer(treasury, feeAmount);
            totalFeesCollected += feeAmount;
            feesCollectedByToken[inputToken] += feeAmount;
            emit PlatformFeeCollected(inputToken, msg.sender, amountIn, feeAmount);
        }

        input.forceApprove(target, 0);
        input.forceApprove(target, amountForTarget);

        uint256 beforeBalance = output.balanceOf(address(this));
        (bool success, bytes memory reason) = target.call(targetCallData);
        if (!success) revert TargetExecutionFailed(reason);
        uint256 afterBalance = output.balanceOf(address(this));
        amountOut = afterBalance - beforeBalance;

        if (amountOut < minAmountOut) revert InsufficientOutput(amountOut, minAmountOut);
        output.safeTransfer(recipient, amountOut);
        input.forceApprove(target, 0);

        emit PolicyExecuted(msg.sender, target, inputToken, outputToken, amountIn, feeAmount, amountOut, recipient);
    }

    /**
     * @notice Withdraw native DOT sent to the contract. Treasurer only.
     */
    function withdrawNative(address payable to, uint256 amount)
        external
        whenNotPaused
        nonReentrant
        onlyRole(TREASURER_ROLE)
    {
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = to.call{ value: amount }("");
        require(ok, "DeFAIPlatform: withdraw failed");
        emit Withdrawn(address(0), to, amount);
    }

    /**
     * @notice Withdraw ERC20 tokens that were sent to this contract. Treasurer only.
     */
    function withdrawERC20(address token, address to, uint256 amount)
        external
        whenNotPaused
        nonReentrant
        onlyRole(TREASURER_ROLE)
    {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    receive() external payable {}
}
