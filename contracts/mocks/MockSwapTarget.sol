// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockSwapTarget {
    using SafeERC20 for IERC20;

    /**
     * @notice Pulls `amountIn` of input from caller and sends `amountOut` of output to recipient.
     *         Intended to emulate a swap adapter for policy execution tests.
     */
    function executeSwap(
        address inputToken,
        address outputToken,
        address recipient,
        uint256 amountIn,
        uint256 amountOut
    ) external returns (uint256) {
        IERC20(inputToken).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(outputToken).safeTransfer(recipient, amountOut);
        return amountOut;
    }
}
