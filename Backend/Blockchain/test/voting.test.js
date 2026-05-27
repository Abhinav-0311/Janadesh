const hardhat = require("hardhat");
const { expect } = require("chai");

const { ethers } = hardhat;

describe("CollegeVoting", function () {
  let CollegeVoting, collegeVoting;
  let admin, voter1, voter2;

  beforeEach(async function () {
    [admin, voter1, voter2] = await ethers.getSigners();
    CollegeVoting = await ethers.getContractFactory("CollegeVoting");
    collegeVoting = await CollegeVoting.deploy();
    await collegeVoting.deployed();
  });

  it("Should set the correct admin", async function () {
    expect(await collegeVoting.admin()).to.equal(admin.address);
  });

  it("Should allow admin to create an election", async function () {
    const currentTime = await ethers.provider.getBlock("latest").then(b => b.timestamp);
    const startTime = currentTime + 3600; // 1 hour from now
    const endTime = startTime + 7200; // 2 hours after start
    
    const tx = await collegeVoting.createElection(
      "Presidential", 
      "Presidential Election", 
      startTime, 
      endTime, 
      0, // SINGLE_CHOICE
      true, // isPublic
      1 // maxChoices
    );
    await tx.wait();

    // electionCount should be 1 now
    expect(await collegeVoting.electionCount()).to.equal(1);
  });

  it("Should allow admin to register a voter", async function () {
    const currentTime = await ethers.provider.getBlock("latest").then(b => b.timestamp);
    const startTime = currentTime + 3600;
    const endTime = startTime + 7200;
    
    await collegeVoting.createElection(
      "Presidential", 
      "Presidential Election", 
      startTime, 
      endTime, 
      0, // SINGLE_CHOICE
      true, 
      1
    );

    // Add candidates first
    await collegeVoting.addCandidate(1, "Candidate 1", "Description 1", "");
    await collegeVoting.addCandidate(1, "Candidate 2", "Description 2", "");

    const tx = await collegeVoting.registerVoter(1, voter1.address);
    await tx.wait();

    // Fast forward to start time and start election
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine", []);
    await collegeVoting.startElection(1);

    // voter1 should now be registered → try to cast vote
    await collegeVoting.connect(voter1).castVote(1, [1]);

    const candidateInfo = await collegeVoting.getCandidateInfo(1, 1);
    expect(candidateInfo.voteCount).to.equal(1);
  });

  it("Should prevent double voting", async function () {
    const currentTime = await ethers.provider.getBlock("latest").then(b => b.timestamp);
    const startTime = currentTime + 3600;
    const endTime = startTime + 7200;
    
    await collegeVoting.createElection(
      "Presidential", 
      "Presidential Election", 
      startTime, 
      endTime, 
      0, // SINGLE_CHOICE
      true, 
      1
    );

    // Add candidates
    await collegeVoting.addCandidate(1, "Candidate 1", "Description 1", "");
    await collegeVoting.addCandidate(1, "Candidate 2", "Description 2", "");

    await collegeVoting.registerVoter(1, voter1.address);

    // Start election
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine", []);
    await collegeVoting.startElection(1);

    await collegeVoting.connect(voter1).castVote(1, [1]);

    await expect(
      collegeVoting.connect(voter1).castVote(1, [1])
    ).to.be.revertedWith("You have already voted in this election");
  });
});
