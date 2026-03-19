// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {DeFAILaunchToken} from "./DeFAILaunchToken.sol";

/// @title DeFAI token factory
/// @notice Creates configurable ERC20 launch tokens for demo launchpad flows.
contract DeFAITokenFactory is Ownable2Step, AccessControl, Pausable {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    struct LaunchParams {
        string name;
        string symbol;
        uint256 initialSupply;
        address owner;
        address initialRecipient;
        bool burnEnabled;
        uint16 transferTaxBps;
        address taxRecipient;
        uint16 taxBurnBps;
    }

    event TokenCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        uint256 initialSupply,
        bool burnEnabled,
        uint16 transferTaxBps,
        address taxRecipient,
        uint16 taxBurnBps
    );

    error InvalidAddress();

    constructor(address initialOwner) Ownable(initialOwner) {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(OPERATOR_ROLE, initialOwner);
    }

    function pause() external onlyRole(OPERATOR_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(OPERATOR_ROLE) {
        _unpause();
    }

    function createToken(LaunchParams calldata p) external whenNotPaused returns (address token) {
        if (bytes(p.name).length == 0 || bytes(p.symbol).length == 0) revert InvalidAddress();
        if (p.owner == address(0) || p.initialRecipient == address(0)) revert InvalidAddress();
        if (p.transferTaxBps > 0 && p.taxRecipient == address(0)) revert InvalidAddress();

        token = address(
            new DeFAILaunchToken(
                p.name,
                p.symbol,
                p.initialSupply,
                p.owner,
                p.initialRecipient,
                p.burnEnabled,
                p.transferTaxBps,
                p.taxRecipient,
                p.taxBurnBps
            )
        );

        emit TokenCreated(
            token,
            msg.sender,
            p.name,
            p.symbol,
            p.initialSupply,
            p.burnEnabled,
            p.transferTaxBps,
            p.taxRecipient,
            p.taxBurnBps
        );
    }
}

