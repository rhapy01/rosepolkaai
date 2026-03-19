// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title DeFAIStakingVault
 * @notice Simple reward vault for staking ERC20 and claiming ERC20 rewards.
 */
contract DeFAIStakingVault is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardToken;

    uint256 public totalStaked;
    uint256 public accRewardPerShare;
    uint256 public lastRewardTime;
    uint256 public rewardRatePerSecond;

    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
        uint256 pendingRewards;
    }

    mapping(address => UserInfo) public userInfo;

    event RewardRateUpdated(uint256 previousRate, uint256 newRate);
    event RewardFunded(address indexed from, uint256 amount);
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);

    error ZeroAddress();
    error InvalidAmount();
    error InsufficientStake();
    error InsufficientRewards(uint256 available, uint256 requested);

    constructor(address admin, address _stakingToken, address _rewardToken) {
        if (admin == address(0) || _stakingToken == address(0) || _rewardToken == address(0)) revert ZeroAddress();

        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);
        lastRewardTime = block.timestamp;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setRewardRatePerSecond(uint256 newRate) external onlyRole(OPERATOR_ROLE) {
        _updatePool();
        uint256 previous = rewardRatePerSecond;
        rewardRatePerSecond = newRate;
        emit RewardRateUpdated(previous, newRate);
    }

    function fundRewards(uint256 amount) external nonReentrant onlyRole(OPERATOR_ROLE) {
        if (amount == 0) revert InvalidAmount();
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        emit RewardFunded(msg.sender, amount);
    }

    function stake(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert InvalidAmount();
        _updatePool();

        UserInfo storage user = userInfo[msg.sender];
        if (user.amount > 0) {
            uint256 pending = ((user.amount * accRewardPerShare) / 1e12) - user.rewardDebt;
            user.pendingRewards += pending;
        }

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        user.amount += amount;
        totalStaked += amount;
        user.rewardDebt = (user.amount * accRewardPerShare) / 1e12;

        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert InvalidAmount();
        _updatePool();

        UserInfo storage user = userInfo[msg.sender];
        if (user.amount < amount) revert InsufficientStake();

        uint256 pending = ((user.amount * accRewardPerShare) / 1e12) - user.rewardDebt;
        user.pendingRewards += pending;

        user.amount -= amount;
        totalStaked -= amount;
        user.rewardDebt = (user.amount * accRewardPerShare) / 1e12;

        stakingToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claim() external whenNotPaused nonReentrant returns (uint256 claimAmount) {
        _updatePool();

        UserInfo storage user = userInfo[msg.sender];
        uint256 pending = ((user.amount * accRewardPerShare) / 1e12) - user.rewardDebt;
        claimAmount = user.pendingRewards + pending;
        if (claimAmount == 0) revert InvalidAmount();

        uint256 available = rewardToken.balanceOf(address(this));
        if (available < claimAmount) revert InsufficientRewards(available, claimAmount);

        user.pendingRewards = 0;
        user.rewardDebt = (user.amount * accRewardPerShare) / 1e12;

        rewardToken.safeTransfer(msg.sender, claimAmount);
        emit Claimed(msg.sender, claimAmount);
    }

    function pendingRewards(address account) external view returns (uint256 pending) {
        UserInfo memory user = userInfo[account];
        uint256 currentAcc = accRewardPerShare;

        if (block.timestamp > lastRewardTime && totalStaked > 0) {
            uint256 elapsed = block.timestamp - lastRewardTime;
            uint256 reward = elapsed * rewardRatePerSecond;
            currentAcc += (reward * 1e12) / totalStaked;
        }

        pending = user.pendingRewards + (((user.amount * currentAcc) / 1e12) - user.rewardDebt);
    }

    function _updatePool() internal {
        if (block.timestamp <= lastRewardTime) return;

        if (totalStaked == 0) {
            lastRewardTime = block.timestamp;
            return;
        }

        uint256 elapsed = block.timestamp - lastRewardTime;
        uint256 reward = elapsed * rewardRatePerSecond;
        accRewardPerShare += (reward * 1e12) / totalStaked;
        lastRewardTime = block.timestamp;
    }
}
