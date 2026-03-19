// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title DeFAIBridgeGateway
 * @notice Demo-friendly custodial bridge gateway for testnets.
 *         Source chain: users lock assets here; relayers observe events.
 *         Destination chain: relayers submit finalized releases.
 * @dev This is not a trustless bridge. It is intended for hackathon demo flows.
 */
contract DeFAIBridgeGateway is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");

    uint256 public flatNativeBridgeFee;
    address payable public treasury;
    uint256 public minBridgeDeadline;

    mapping(address => bool) public supportedTokens;
    mapping(bytes32 => BridgeRequest) public bridgeRequests;

    struct BridgeRequest {
        address sender;
        address recipient;
        address token;
        uint256 amount;
        uint256 destinationChainId;
        uint256 deadline;
        bytes32 secretHash;
        bool completed;
    }

    event BridgeRequested(
        bytes32 indexed messageId,
        address indexed sender,
        address indexed token,
        uint256 amount,
        uint256 destinationChainId,
        address recipient,
        uint256 flatFee,
        uint256 userNonce,
        uint256 deadline,
        bytes32 secretHash
    );
    event BridgeFinalized(bytes32 indexed messageId, address indexed token, address indexed recipient, uint256 amount, bytes32 secret);
    event BridgeRefunded(bytes32 indexed messageId, address indexed sender, address indexed token, uint256 amount);
    event BridgeMirrored(
        bytes32 indexed messageId,
        address indexed sender,
        address indexed token,
        uint256 amount,
        uint256 sourceChainId,
        address recipient,
        uint256 deadline,
        bytes32 secretHash
    );
    event BridgeConfirmed(bytes32 indexed messageId, uint256 sourceChainId, uint256 destinationChainId);
    event TokenSupportUpdated(address indexed token, bool supported);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event FlatNativeBridgeFeeUpdated(uint256 previousFee, uint256 newFee);
    event MinBridgeDeadlineUpdated(uint256 previousSeconds, uint256 newSeconds);

    error ZeroAddress();
    error InvalidAmount();
    error UnsupportedToken(address token);
    error BridgeRequestNotFound(bytes32 messageId);
    error BridgeAlreadyCompleted(bytes32 messageId);
    error InvalidSecret(bytes32 messageId);
    error InvalidDeadline(uint256 deadline);
    error RefundNotReady(uint256 currentTimestamp, uint256 deadline);
    error UnauthorizedRefund(address caller, address expectedSender);
    error InvalidSourceChain(uint256 sourceChainId);
    error RequestAlreadyExists(bytes32 messageId);
    error NativeTransferFailed();

    constructor(address admin, address initialTreasury, uint256 initialFlatNativeBridgeFee) {
        if (admin == address(0) || initialTreasury == address(0)) revert ZeroAddress();
        treasury = payable(initialTreasury);
        flatNativeBridgeFee = initialFlatNativeBridgeFee;
        minBridgeDeadline = 5 minutes;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(RELAYER_ROLE, admin);
        _grantRole(TREASURER_ROLE, admin);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setTreasury(address payable newTreasury) external onlyRole(OPERATOR_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previous, newTreasury);
    }

    function setFlatNativeBridgeFee(uint256 newFee) external onlyRole(OPERATOR_ROLE) {
        uint256 previous = flatNativeBridgeFee;
        flatNativeBridgeFee = newFee;
        emit FlatNativeBridgeFeeUpdated(previous, newFee);
    }

    function setMinBridgeDeadline(uint256 newDeadlineSeconds) external onlyRole(OPERATOR_ROLE) {
        uint256 previous = minBridgeDeadline;
        minBridgeDeadline = newDeadlineSeconds;
        emit MinBridgeDeadlineUpdated(previous, newDeadlineSeconds);
    }

    function setTokenSupported(address token, bool supported) external onlyRole(OPERATOR_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        supportedTokens[token] = supported;
        emit TokenSupportUpdated(token, supported);
    }

    /**
     * @notice Mirror a source-chain bridge request on destination chain.
     * @dev Called by relayer before finalize on destination chain.
     */
    function mirrorBridgeRequest(
        bytes32 messageId,
        address sender,
        address recipient,
        address token,
        uint256 amount,
        uint256 sourceChainId,
        uint256 deadline,
        bytes32 secretHash
    ) external whenNotPaused onlyRole(RELAYER_ROLE) {
        if (sender == address(0) || recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        if (sourceChainId == block.chainid) revert InvalidSourceChain(sourceChainId);
        if (secretHash == bytes32(0)) revert InvalidSecret(messageId);
        if (bridgeRequests[messageId].sender != address(0)) revert RequestAlreadyExists(messageId);
        if (token != address(0) && !supportedTokens[token]) revert UnsupportedToken(token);

        bridgeRequests[messageId] = BridgeRequest({
            sender: sender,
            recipient: recipient,
            token: token,
            amount: amount,
            destinationChainId: sourceChainId,
            deadline: deadline,
            secretHash: secretHash,
            completed: false
        });

        emit BridgeMirrored(messageId, sender, token, amount, sourceChainId, recipient, deadline, secretHash);
    }

    /**
     * @notice Confirm destination finalization back on source chain to prevent refunds.
     * @dev Called by relayer after successful destination payout.
     */
    function confirmProcessed(bytes32 messageId, uint256 destinationChainId)
        external
        whenNotPaused
        onlyRole(RELAYER_ROLE)
    {
        BridgeRequest storage req = bridgeRequests[messageId];
        if (req.sender == address(0)) revert BridgeRequestNotFound(messageId);
        if (req.completed) revert BridgeAlreadyCompleted(messageId);
        if (req.destinationChainId != destinationChainId) revert InvalidSourceChain(destinationChainId);

        req.completed = true;
        emit BridgeConfirmed(messageId, block.chainid, destinationChainId);
    }

    /**
     * @notice Lock native asset on source chain and emit bridge request event.
     * @param destinationChainId Destination chain id (e.g. 84532 for Base Sepolia).
     * @param recipient Recipient on destination chain.
     * @param userNonce User-supplied nonce for unique message tracking.
     */
    function bridgeNative(uint256 destinationChainId, address recipient, uint256 userNonce, uint256 deadline, bytes32 secretHash)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (bytes32 messageId)
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (msg.value <= flatNativeBridgeFee) revert InvalidAmount();
        if (secretHash == bytes32(0)) revert InvalidSecret(bytes32(0));
        if (deadline <= block.timestamp || deadline < block.timestamp + minBridgeDeadline) revert InvalidDeadline(deadline);

        uint256 amount = msg.value - flatNativeBridgeFee;
        messageId = keccak256(
            abi.encodePacked(block.chainid, destinationChainId, msg.sender, recipient, address(0), amount, userNonce, deadline, secretHash)
        );
        bridgeRequests[messageId] = BridgeRequest({
            sender: msg.sender,
            recipient: recipient,
            token: address(0),
            amount: amount,
            destinationChainId: destinationChainId,
            deadline: deadline,
            secretHash: secretHash,
            completed: false
        });

        if (flatNativeBridgeFee > 0) {
            (bool feeSent,) = treasury.call{ value: flatNativeBridgeFee }("");
            if (!feeSent) revert NativeTransferFailed();
        }

        emit BridgeRequested(
            messageId, msg.sender, address(0), amount, destinationChainId, recipient, flatNativeBridgeFee, userNonce, deadline, secretHash
        );
    }

    /**
     * @notice Lock ERC20 token on source chain and emit bridge request event.
     * @param token Supported source token to bridge.
     * @param amount Amount of token to lock.
     * @param destinationChainId Destination chain id.
     * @param recipient Recipient on destination chain.
     * @param userNonce User-supplied nonce for unique message tracking.
     */
    function bridgeERC20(
        address token,
        uint256 amount,
        uint256 destinationChainId,
        address recipient,
        uint256 userNonce,
        uint256 deadline,
        bytes32 secretHash
    )
        external
        whenNotPaused
        nonReentrant
        returns (bytes32 messageId)
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        if (!supportedTokens[token]) revert UnsupportedToken(token);
        if (secretHash == bytes32(0)) revert InvalidSecret(bytes32(0));
        if (deadline <= block.timestamp || deadline < block.timestamp + minBridgeDeadline) revert InvalidDeadline(deadline);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        messageId = keccak256(
            abi.encodePacked(block.chainid, destinationChainId, msg.sender, recipient, token, amount, userNonce, deadline, secretHash)
        );
        bridgeRequests[messageId] = BridgeRequest({
            sender: msg.sender,
            recipient: recipient,
            token: token,
            amount: amount,
            destinationChainId: destinationChainId,
            deadline: deadline,
            secretHash: secretHash,
            completed: false
        });

        emit BridgeRequested(messageId, msg.sender, token, amount, destinationChainId, recipient, 0, userNonce, deadline, secretHash);
    }

    /**
     * @notice Finalize bridge on destination chain, releasing native asset.
     * @dev Callable by relayer after source-chain bridge event is confirmed.
     */
    function finalizeNative(bytes32 messageId, bytes32 secret)
        external
        whenNotPaused
        nonReentrant
        onlyRole(RELAYER_ROLE)
    {
        BridgeRequest storage req = bridgeRequests[messageId];
        if (req.sender == address(0)) revert BridgeRequestNotFound(messageId);
        if (req.completed) revert BridgeAlreadyCompleted(messageId);
        if (req.token != address(0)) revert UnsupportedToken(req.token);
        if (keccak256(abi.encodePacked(secret)) != req.secretHash) revert InvalidSecret(messageId);
        req.completed = true;

        (bool ok,) = payable(req.recipient).call{ value: req.amount }("");
        if (!ok) revert NativeTransferFailed();
        emit BridgeFinalized(messageId, address(0), req.recipient, req.amount, secret);
    }

    /**
     * @notice Finalize bridge on destination chain, releasing ERC20 token.
     * @dev Callable by relayer after source-chain bridge event is confirmed.
     */
    function finalizeERC20(bytes32 messageId, bytes32 secret)
        external
        whenNotPaused
        nonReentrant
        onlyRole(RELAYER_ROLE)
    {
        BridgeRequest storage req = bridgeRequests[messageId];
        if (req.sender == address(0)) revert BridgeRequestNotFound(messageId);
        if (req.completed) revert BridgeAlreadyCompleted(messageId);
        if (req.token == address(0)) revert UnsupportedToken(address(0));
        if (!supportedTokens[req.token]) revert UnsupportedToken(req.token);
        if (keccak256(abi.encodePacked(secret)) != req.secretHash) revert InvalidSecret(messageId);
        req.completed = true;

        IERC20(req.token).safeTransfer(req.recipient, req.amount);
        emit BridgeFinalized(messageId, req.token, req.recipient, req.amount, secret);
    }

    function refund(bytes32 messageId) external whenNotPaused nonReentrant {
        BridgeRequest storage req = bridgeRequests[messageId];
        if (req.sender == address(0)) revert BridgeRequestNotFound(messageId);
        if (req.completed) revert BridgeAlreadyCompleted(messageId);
        if (msg.sender != req.sender) revert UnauthorizedRefund(msg.sender, req.sender);
        if (block.timestamp < req.deadline) revert RefundNotReady(block.timestamp, req.deadline);

        req.completed = true;

        if (req.token == address(0)) {
            (bool ok,) = payable(req.sender).call{ value: req.amount }("");
            if (!ok) revert NativeTransferFailed();
        } else {
            IERC20(req.token).safeTransfer(req.sender, req.amount);
        }
        emit BridgeRefunded(messageId, req.sender, req.token, req.amount);
    }

    function withdrawNative(address payable to, uint256 amount) external nonReentrant onlyRole(TREASURER_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = to.call{ value: amount }("");
        if (!ok) revert NativeTransferFailed();
    }

    function withdrawERC20(address token, address to, uint256 amount) external nonReentrant onlyRole(TREASURER_ROLE) {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }

    receive() external payable {}
}
