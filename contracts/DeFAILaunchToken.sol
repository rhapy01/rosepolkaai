// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title DeFAI configurable launch token
/// @notice ERC20 with optional holder burn and transfer-tax mechanics.
contract DeFAILaunchToken is ERC20, ERC20Burnable, Ownable {
    uint16 public constant MAX_BPS = 10_000;
    uint16 public constant MAX_TAX_BPS = 1_000; // 10%

    bool public burnEnabled;
    uint16 public transferTaxBps;
    uint16 public taxBurnBps;
    address public taxRecipient;

    event TaxConfigUpdated(uint16 transferTaxBps, address indexed taxRecipient, uint16 taxBurnBps);
    event BurnEnabledUpdated(bool enabled);

    error InvalidTaxConfig();
    error BurnDisabled();

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply,
        address owner_,
        address initialRecipient,
        bool burnEnabled_,
        uint16 transferTaxBps_,
        address taxRecipient_,
        uint16 taxBurnBps_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        burnEnabled = burnEnabled_;
        _setTaxConfig(transferTaxBps_, taxRecipient_, taxBurnBps_);
        _mint(initialRecipient, initialSupply);
    }

    function setBurnEnabled(bool enabled) external onlyOwner {
        burnEnabled = enabled;
        emit BurnEnabledUpdated(enabled);
    }

    function setTaxConfig(uint16 transferTaxBps_, address taxRecipient_, uint16 taxBurnBps_) external onlyOwner {
        _setTaxConfig(transferTaxBps_, taxRecipient_, taxBurnBps_);
    }

    function burn(uint256 value) public override {
        if (!burnEnabled) revert BurnDisabled();
        super.burn(value);
    }

    function burnFrom(address account, uint256 value) public override {
        if (!burnEnabled) revert BurnDisabled();
        super.burnFrom(account, value);
    }

    function _setTaxConfig(uint16 transferTaxBps_, address taxRecipient_, uint16 taxBurnBps_) internal {
        if (transferTaxBps_ > MAX_TAX_BPS || taxBurnBps_ > MAX_BPS) revert InvalidTaxConfig();
        if (transferTaxBps_ > 0 && taxRecipient_ == address(0)) revert InvalidTaxConfig();

        transferTaxBps = transferTaxBps_;
        taxRecipient = taxRecipient_;
        taxBurnBps = taxBurnBps_;
        emit TaxConfigUpdated(transferTaxBps_, taxRecipient_, taxBurnBps_);
    }

    function _update(address from, address to, uint256 value) internal override {
        // No tax on mint/burn, or when tax is disabled.
        if (from == address(0) || to == address(0) || transferTaxBps == 0 || value == 0) {
            super._update(from, to, value);
            return;
        }

        uint256 tax = (value * transferTaxBps) / MAX_BPS;
        if (tax == 0) {
            super._update(from, to, value);
            return;
        }

        uint256 netAmount = value - tax;
        uint256 burnTax = (tax * taxBurnBps) / MAX_BPS;
        uint256 recipientTax = tax - burnTax;

        super._update(from, to, netAmount);
        if (burnTax > 0) {
            super._update(from, address(0), burnTax);
        }
        if (recipientTax > 0) {
            super._update(from, taxRecipient, recipientTax);
        }
    }
}

