const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DeFAIBridgeGateway", function () {
  async function deployFixture() {
    const [admin, user, relayer, treasury, recipient] = await ethers.getSigners();

    const bridgeFactory = await ethers.getContractFactory("DeFAIBridgeGateway");
    const tokenFactory = await ethers.getContractFactory("MockERC20Permit");

    const bridge = await bridgeFactory.deploy(admin.address, treasury.address, ethers.parseEther("0.001"));
    const token = await tokenFactory.deploy("Bridge Token", "BRG");

    await token.mint(user.address, ethers.parseEther("100"));
    await bridge.connect(admin).grantRole(await bridge.RELAYER_ROLE(), relayer.address);
    await bridge.connect(admin).setTokenSupported(await token.getAddress(), true);

    return { admin, user, relayer, treasury, recipient, bridge, token };
  }

  it("locks native funds and routes flat fee to treasury", async function () {
    const { user, treasury, recipient, bridge } = await deployFixture();
    const bridgeAddr = await bridge.getAddress();
    const fee = await bridge.flatNativeBridgeFee();
    const totalSent = ethers.parseEther("1");
    const lockedAmount = totalSent - fee;
    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    const latest = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latest.timestamp + 1200);
    const secret = ethers.encodeBytes32String("native-bridge-secret");
    const secretHash = ethers.keccak256(ethers.solidityPacked(["bytes32"], [secret]));

    await expect(
      bridge.connect(user).bridgeNative(84532, recipient.address, 1, deadline, secretHash, { value: totalSent })
    ).to.emit(bridge, "BridgeRequested");

    expect(await ethers.provider.getBalance(bridgeAddr)).to.equal(lockedAmount);
    const treasuryAfter = await ethers.provider.getBalance(treasury.address);
    expect(treasuryAfter - treasuryBefore).to.equal(fee);
  });

  it("locks and finalizes ERC20 with secret hash and replay protection", async function () {
    const { user, relayer, recipient, bridge, token } = await deployFixture();
    const tokenAddr = await token.getAddress();
    const amount = ethers.parseEther("10");
    const latest = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latest.timestamp + 1200);
    const secret = ethers.encodeBytes32String("erc20-bridge-secret");
    const secretHash = ethers.keccak256(ethers.solidityPacked(["bytes32"], [secret]));

    await token.connect(user).approve(await bridge.getAddress(), amount);

    const srcTx = await bridge.connect(user).bridgeERC20(tokenAddr, amount, 84532, recipient.address, 77, deadline, secretHash);
    await srcTx.wait();
    expect(await token.balanceOf(await bridge.getAddress())).to.equal(amount);

    const messageId = ethers.keccak256(
      ethers.solidityPacked(
        ["uint256", "uint256", "address", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
        [31337n, 84532n, user.address, recipient.address, tokenAddr, amount, 77n, deadline, secretHash]
      )
    );

    await bridge.connect(relayer).finalizeERC20(messageId, secret);
    expect(await token.balanceOf(recipient.address)).to.equal(amount);

    await expect(
      bridge.connect(relayer).finalizeERC20(messageId, secret)
    ).to.be.revertedWithCustomError(bridge, "BridgeAlreadyCompleted");
  });

  it("allows sender refund after expiry if not finalized", async function () {
    const { user, recipient, bridge, token } = await deployFixture();
    const tokenAddr = await token.getAddress();
    const amount = ethers.parseEther("3");
    const latest = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latest.timestamp + 360);
    const secret = ethers.encodeBytes32String("refund-secret");
    const secretHash = ethers.keccak256(ethers.solidityPacked(["bytes32"], [secret]));

    await token.connect(user).approve(await bridge.getAddress(), amount);
    await bridge.connect(user).bridgeERC20(tokenAddr, amount, 84532, recipient.address, 99, deadline, secretHash);

    const messageId = ethers.keccak256(
      ethers.solidityPacked(
        ["uint256", "uint256", "address", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
        [31337n, 84532n, user.address, recipient.address, tokenAddr, amount, 99n, deadline, secretHash]
      )
    );

    await ethers.provider.send("evm_increaseTime", [400]);
    await ethers.provider.send("evm_mine", []);

    const before = await token.balanceOf(user.address);
    await bridge.connect(user).refund(messageId);
    const after = await token.balanceOf(user.address);
    expect(after - before).to.equal(amount);
  });

  it("requires RELAYER_ROLE for finalization", async function () {
    const { user, recipient, bridge } = await deployFixture();
    const latest = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latest.timestamp + 1200);
    const secret = ethers.encodeBytes32String("native-finalize-secret");
    const secretHash = ethers.keccak256(ethers.solidityPacked(["bytes32"], [secret]));
    const totalSent = ethers.parseEther("1");
    const fee = await bridge.flatNativeBridgeFee();
    const amount = totalSent - fee;

    await bridge.connect(user).bridgeNative(84532, recipient.address, 2, deadline, secretHash, { value: totalSent });

    const fakeMessageId = ethers.keccak256(ethers.toUtf8Bytes("message"));

    await expect(bridge.connect(user).finalizeNative(fakeMessageId, secret)).to.be.reverted;

    const messageId = ethers.keccak256(
      ethers.solidityPacked(
        ["uint256", "uint256", "address", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
        [31337n, 84532n, user.address, recipient.address, ethers.ZeroAddress, amount, 2n, deadline, secretHash]
      )
    );
    await expect(bridge.connect(user).finalizeNative(messageId, secret)).to.be.reverted;
  });

  it("mirrors and confirms processed requests via relayer", async function () {
    const { user, relayer, recipient, bridge, token } = await deployFixture();
    const tokenAddr = await token.getAddress();
    const amount = ethers.parseEther("5");
    const latest = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latest.timestamp + 1200);
    const secret = ethers.encodeBytes32String("mirror-secret");
    const secretHash = ethers.keccak256(ethers.solidityPacked(["bytes32"], [secret]));

    const messageId = ethers.keccak256(
      ethers.solidityPacked(
        ["uint256", "uint256", "address", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
        [31337n, 84532n, user.address, recipient.address, tokenAddr, amount, 111n, deadline, secretHash]
      )
    );

    await expect(
      bridge
        .connect(relayer)
        .mirrorBridgeRequest(messageId, user.address, recipient.address, tokenAddr, amount, 84532n, deadline, secretHash)
    ).to.emit(bridge, "BridgeMirrored");

    await expect(bridge.connect(relayer).confirmProcessed(messageId, 84532n)).to.emit(bridge, "BridgeConfirmed");

    const req = await bridge.bridgeRequests(messageId);
    expect(req.completed).to.equal(true);

    // non-relayer cannot mirror
    const anotherMessageId = ethers.keccak256(ethers.toUtf8Bytes("another"));
    await expect(
      bridge
        .connect(user)
        .mirrorBridgeRequest(anotherMessageId, user.address, recipient.address, tokenAddr, amount, 84532n, deadline, secretHash)
    ).to.be.reverted;
  });
});
