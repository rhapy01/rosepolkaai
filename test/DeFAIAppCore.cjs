const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DeFAI app core contracts", function () {
  describe("DeFAISimpleSwap", function () {
    it("swaps at configured fixed rate", async function () {
      const [admin, user, recipient] = await ethers.getSigners();

      const tokenFactory = await ethers.getContractFactory("MockERC20Permit");
      const swapFactory = await ethers.getContractFactory("DeFAISimpleSwap");

      const tokenA = await tokenFactory.deploy("Token A", "TKNA");
      const tokenB = await tokenFactory.deploy("Token B", "TKNB");
      const swap = await swapFactory.deploy(admin.address);

      const amountIn = ethers.parseEther("10");
      const rate = ethers.parseEther("2"); // 1 A -> 2 B
      const expectedOut = ethers.parseEther("20");

      await tokenA.mint(user.address, ethers.parseEther("100"));
      await tokenB.mint(admin.address, ethers.parseEther("1000"));

      await swap.setPairRate(await tokenA.getAddress(), await tokenB.getAddress(), rate);
      await tokenB.approve(await swap.getAddress(), ethers.parseEther("1000"));
      await swap.addLiquidity(await tokenB.getAddress(), ethers.parseEther("200"));

      await tokenA.connect(user).approve(await swap.getAddress(), amountIn);
      await swap
        .connect(user)
        .swapExactInput(await tokenA.getAddress(), await tokenB.getAddress(), amountIn, expectedOut, recipient.address);

      expect(await tokenB.balanceOf(recipient.address)).to.equal(expectedOut);
    });
  });

  describe("DeFAIStakingVault", function () {
    it("accrues and pays rewards", async function () {
      const [admin, user] = await ethers.getSigners();

      const tokenFactory = await ethers.getContractFactory("MockERC20Permit");
      const vaultFactory = await ethers.getContractFactory("DeFAIStakingVault");

      const stakingToken = await tokenFactory.deploy("Stake Token", "STK");
      const rewardToken = await tokenFactory.deploy("Reward Token", "RWD");
      const vault = await vaultFactory.deploy(admin.address, await stakingToken.getAddress(), await rewardToken.getAddress());

      await stakingToken.mint(user.address, ethers.parseEther("100"));
      await rewardToken.mint(admin.address, ethers.parseEther("1000"));

      await rewardToken.approve(await vault.getAddress(), ethers.parseEther("1000"));
      await vault.fundRewards(ethers.parseEther("500"));
      await vault.setRewardRatePerSecond(ethers.parseEther("1"));

      await stakingToken.connect(user).approve(await vault.getAddress(), ethers.parseEther("10"));
      await vault.connect(user).stake(ethers.parseEther("10"));

      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine", []);

      const before = await rewardToken.balanceOf(user.address);
      await vault.connect(user).claim();
      const after = await rewardToken.balanceOf(user.address);
      const claimed = after - before;
      expect(claimed).to.be.gte(ethers.parseEther("10"));
      expect(claimed).to.be.lte(ethers.parseEther("11"));
    });
  });

  describe("DeFAIAccessPassNFT", function () {
    it("mints an NFT pass with URI", async function () {
      const [admin, user] = await ethers.getSigners();

      const nftFactory = await ethers.getContractFactory("DeFAIAccessPassNFT");
      const nft = await nftFactory.deploy(admin.address);

      await nft.mintTo(user.address, "ipfs://defai/access-pass-1.json");

      expect(await nft.ownerOf(1)).to.equal(user.address);
      expect(await nft.tokenURI(1)).to.equal("ipfs://defai/access-pass-1.json");
    });
  });
});
