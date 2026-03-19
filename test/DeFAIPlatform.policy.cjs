const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DeFAIPlatform policy execution", function () {
  async function deployFixture() {
    const [owner, user, recipient, treasury] = await ethers.getSigners();

    const tokenInFactory = await ethers.getContractFactory("MockERC20Permit");
    const tokenOutFactory = await ethers.getContractFactory("MockERC20Permit");
    const targetFactory = await ethers.getContractFactory("MockSwapTarget");
    const platformFactory = await ethers.getContractFactory("DeFAIPlatform");

    const tokenIn = await tokenInFactory.deploy("Input Token", "IN");
    const tokenOut = await tokenOutFactory.deploy("Output Token", "OUT");
    const target = await targetFactory.deploy();
    const platform = await platformFactory.deploy(owner.address, treasury.address, 100n); // 1%

    await tokenIn.mint(user.address, ethers.parseEther("1000"));
    await tokenOut.mint(await target.getAddress(), ethers.parseEther("1000"));

    return { owner, user, recipient, treasury, tokenIn, tokenOut, target, platform };
  }

  it("routes fees, enforces allowlists, and transfers output", async function () {
    const { owner, user, recipient, treasury, tokenIn, tokenOut, target, platform } = await deployFixture();

    const targetAddr = await target.getAddress();
    const platformAddr = await platform.getAddress();
    const inputAddr = await tokenIn.getAddress();
    const outputAddr = await tokenOut.getAddress();

    const swapSelector = target.interface.getFunction("executeSwap").selector;
    await platform.connect(owner).setTargetAllowed(targetAddr, true);
    await platform.connect(owner).setTargetSelectorAllowed(targetAddr, swapSelector, true);

    const amountIn = ethers.parseEther("100");
    const expectedFee = ethers.parseEther("1");
    const amountForTarget = amountIn - expectedFee;
    const amountOut = ethers.parseEther("90");

    await tokenIn.connect(user).approve(platformAddr, amountIn);

    const callData = target.interface.encodeFunctionData("executeSwap", [
      inputAddr,
      outputAddr,
      platformAddr,
      amountForTarget,
      amountOut,
    ]);

    await expect(
      platform.connect(user).executeWithPolicy(
        inputAddr,
        outputAddr,
        targetAddr,
        amountIn,
        amountOut,
        recipient.address,
        false,
        0,
        0,
        0,
        ethers.ZeroHash,
        ethers.ZeroHash,
        callData
      )
    ).to.emit(platform, "PolicyExecuted");

    expect(await tokenIn.balanceOf(treasury.address)).to.equal(expectedFee);
    expect(await tokenOut.balanceOf(recipient.address)).to.equal(amountOut);
    expect(await platform.feesCollectedByToken(inputAddr)).to.equal(expectedFee);
  });

  it("reverts for non-allowlisted selector", async function () {
    const { owner, user, recipient, tokenIn, tokenOut, target, platform } = await deployFixture();

    const targetAddr = await target.getAddress();
    const platformAddr = await platform.getAddress();
    const inputAddr = await tokenIn.getAddress();
    const outputAddr = await tokenOut.getAddress();

    await platform.connect(owner).setTargetAllowed(targetAddr, true);

    const amountIn = ethers.parseEther("10");
    await tokenIn.connect(user).approve(platformAddr, amountIn);

    const swapSelector = target.interface.getFunction("executeSwap").selector;
    const callData = target.interface.encodeFunctionData("executeSwap", [
      inputAddr,
      outputAddr,
      platformAddr,
      amountIn,
      ethers.parseEther("5"),
    ]);

    await expect(
      platform.connect(user).executeWithPolicy(
        inputAddr,
        outputAddr,
        targetAddr,
        amountIn,
        1,
        recipient.address,
        false,
        0,
        0,
        0,
        ethers.ZeroHash,
        ethers.ZeroHash,
        callData
      )
    )
      .to.be.revertedWithCustomError(platform, "SelectorNotAllowed")
      .withArgs(targetAddr, swapSelector);
  });

  it("supports permit-based execution without prior approve", async function () {
    const { owner, user, recipient, treasury, tokenIn, tokenOut, target, platform } = await deployFixture();

    const targetAddr = await target.getAddress();
    const platformAddr = await platform.getAddress();
    const inputAddr = await tokenIn.getAddress();
    const outputAddr = await tokenOut.getAddress();

    const swapSelector = target.interface.getFunction("executeSwap").selector;
    await platform.connect(owner).setTargetAllowed(targetAddr, true);
    await platform.connect(owner).setTargetSelectorAllowed(targetAddr, swapSelector, true);

    const amountIn = ethers.parseEther("50");
    const expectedFee = ethers.parseEther("0.5");
    const amountForTarget = amountIn - expectedFee;
    const expectedOut = ethers.parseEther("40");

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const nonce = await tokenIn.nonces(user.address);
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latestBlock.timestamp + 3600);

    const domain = {
      name: "Input Token",
      version: "1",
      chainId,
      verifyingContract: inputAddr,
    };

    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const values = {
      owner: user.address,
      spender: platformAddr,
      value: amountIn,
      nonce,
      deadline,
    };

    const sig = await user.signTypedData(domain, types, values);
    const { v, r, s } = ethers.Signature.from(sig);

    const callData = target.interface.encodeFunctionData("executeSwap", [
      inputAddr,
      outputAddr,
      platformAddr,
      amountForTarget,
      expectedOut,
    ]);

    await platform.connect(user).executeWithPolicy(
      inputAddr,
      outputAddr,
      targetAddr,
      amountIn,
      expectedOut,
      recipient.address,
      true,
      amountIn,
      deadline,
      v,
      r,
      s,
      callData
    );

    expect(await tokenIn.balanceOf(treasury.address)).to.equal(expectedFee);
    expect(await tokenOut.balanceOf(recipient.address)).to.equal(expectedOut);
  });
});
