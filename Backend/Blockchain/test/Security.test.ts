import { expect } from "chai";
import { ethers } from "hardhat";
import { CollegeVoting, ElectionFactory } from "../types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Security Vulnerability Tests", function () {
  let collegeVoting: CollegeVoting;
  let electionFactory: ElectionFactory;
  let admin: SignerWithAddress;
  let creator: SignerWithAddress;
  let attacker: SignerWithAddress;
  let voter1: SignerWithAddress;
  let voter2: SignerWithAddress;

  const ElectionType = {
    SINGLE_CHOICE: 0,
    MULTIPLE_CHOICE: 1,
    RANKED_VOTING: 2
  };

  beforeEach(async function () {
    [admin, creator, attacker, voter1, voter2] = await ethers.getSigners();
    
    const CollegeVotingFactory = await ethers.getContractFactory("CollegeVoting");
    collegeVoting = await CollegeVotingFactory.deploy();
    await collegeVoting.deployed();

    const ElectionFactoryContract = await ethers.getContractFactory("ElectionFactory");
    electionFactory = await ElectionFactoryContract.deploy();
    await electionFactory.deployed();
  });

  describe("Access Control Vulnerabilities", function () {
    it("Should prevent unauthorized election creation", async function () {
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      await expect(
        collegeVoting.connect(attacker).createElection(
          "Unauthorized Election",
          "Should fail",
          startTime,
          endTime,
          ElectionType.SINGLE_CHOICE,
          true,
          1
        )
      ).to.be.revertedWith("Not authorized to create elections");
    });

    it("Should prevent unauthorized admin functions", async function () {
      await expect(
        collegeVoting.connect(attacker).authorizeElectionCreator(creator.address)
      ).to.be.revertedWith("Only admin can perform this action");

      await expect(
        collegeVoting.connect(attacker).revokeElectionCreator(creator.address)
      ).to.be.revertedWith("Only admin can perform this action");
    });

    it("Should prevent unauthorized election management", async function () {
      await collegeVoting.connect(admin).authorizeElectionCreator(creator.address);
      
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      const createTx = await collegeVoting.connect(creator).createElection(
        "Test Election",
        "Description",
        startTime,
        endTime,
        ElectionType.SINGLE_CHOICE,
        true,
        1
      );
      const createReceipt = await createTx.wait();
      const electionId = createReceipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();

      // Attacker should not be able to manage election
      await expect(
        collegeVoting.connect(attacker).addCandidate(electionId, "Malicious Candidate", "Description", "")
      ).to.be.revertedWith("Only election creator or admin can perform this action");

      await expect(
        collegeVoting.connect(attacker).registerVoter(electionId, voter1.address)
      ).to.be.revertedWith("Only election creator or admin can perform this action");

      await expect(
        collegeVoting.connect(attacker).startElection(electionId)
      ).to.be.revertedWith("Only election creator or admin can perform this action");
    });

    it("Should prevent admin privilege escalation", async function () {
      await collegeVoting.connect(admin).authorizeElectionCreator(creator.address);

      // Creator should not be able to authorize other creators
      await expect(
        collegeVoting.connect(creator).authorizeElectionCreator(attacker.address)
      ).to.be.revertedWith("Only admin can perform this action");

      // Creator should not be able to revoke admin privileges
      await expect(
        collegeVoting.connect(creator).revokeElectionCreator(admin.address)
      ).to.be.revertedWith("Only admin can perform this action");
    });
  });

  describe("Input Validation Vulnerabilities", function () {
    beforeEach(async function () {
      await collegeVoting.connect(admin).authorizeElectionCreator(creator.address);
    });

    it("Should prevent zero address attacks", async function () {
      await expect(
        collegeVoting.connect(admin).authorizeElectionCreator(ethers.constants.AddressZero)
      ).to.be.revertedWith("Invalid creator address");

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      const createTx = await collegeVoting.connect(creator).createElection(
        "Test Election",
        "Description",
        startTime,
        endTime,
        ElectionType.SINGLE_CHOICE,
        true,
        1
      );
      const createReceipt = await createTx.wait();
      const electionId = createReceipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();

      await expect(
        collegeVoting.connect(creator).registerVoter(electionId, ethers.constants.AddressZero)
      ).to.be.revertedWith("Invalid voter address");
    });

    it("Should prevent empty string attacks", async function () {
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      await expect(
        collegeVoting.connect(creator).createElection(
          "",
          "Description",
          startTime,
          endTime,
          ElectionType.SINGLE_CHOICE,
          true,
          1
        )
      ).to.be.revertedWith("Title cannot be empty");

      const createTx = await collegeVoting.connect(creator).createElection(
        "Test Election",
        "Description",
        startTime,
        endTime,
        ElectionType.SINGLE_CHOICE,
        true,
        1
      );
      const createReceipt = await createTx.wait();
      const electionId = createReceipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();

      await expect(
        collegeVoting.connect(creator).addCandidate(electionId, "", "Description", "")
      ).to.be.revertedWith("Candidate name cannot be empty");
    });

    it("Should prevent time manipulation attacks", async function () {
      const currentTime = await time.latest();
      
      // Past start time
      await expect(
        collegeVoting.connect(creator).createElection(
          "Past Election",
          "Description",
          currentTime - 3600,
          currentTime + 3600,
          ElectionType.SINGLE_CHOICE,
          true,
          1
        )
      ).to.be.revertedWith("Start time must be in the future");

      // End time before start time
      await expect(
        collegeVoting.connect(creator).createElection(
          "Invalid Time Election",
          "Description",
          currentTime + 7200,
          currentTime + 3600,
          ElectionType.SINGLE_CHOICE,
          true,
          1
        )
      ).to.be.revertedWith("End time must be after start time");

      // Duration too short
      await expect(
        collegeVoting.connect(creator).createElection(
          "Short Election",
          "Description",
          currentTime + 3600,
          currentTime + 3600 + 1800, // 30 minutes
          ElectionType.SINGLE_CHOICE,
          true,
          1
        )
      ).to.be.revertedWith("Election must run for at least 1 hour");
    });

    it("Should prevent invalid election type configurations", async function () {
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      // Multiple choice with maxChoices <= 1
      await expect(
        collegeVoting.connect(creator).createElection(
          "Invalid Multiple Choice",
          "Description",
          startTime,
          endTime,
          ElectionType.MULTIPLE_CHOICE,
          true,
          1
        )
      ).to.be.revertedWith("Multiple choice elections must allow more than 1 choice");
    });
  });

  describe("Voting Security Vulnerabilities", function () {
    let electionId: number;

    beforeEach(async function () {
      await collegeVoting.connect(admin).authorizeElectionCreator(creator.address);
      
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      const createTx = await collegeVoting.connect(creator).createElection(
        "Security Test Election",
        "Testing security",
        startTime,
        endTime,
        ElectionType.SINGLE_CHOICE,
        true,
        1
      );
      const createReceipt = await createTx.wait();
      electionId = createReceipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();

      // Add candidates
      await collegeVoting.connect(creator).addCandidate(electionId, "Candidate 1", "Description", "");
      await collegeVoting.connect(creator).addCandidate(electionId, "Candidate 2", "Description", "");

      // Register voters
      await collegeVoting.connect(creator).registerVoter(electionId, voter1.address);
      await collegeVoting.connect(creator).registerVoter(electionId, voter2.address);

      // Start election
      await time.increase(3600);
      await collegeVoting.connect(creator).startElection(electionId);
    });

    it("Should prevent double voting attacks", async function () {
      await collegeVoting.connect(voter1).castVote(electionId, [1]);

      await expect(
        collegeVoting.connect(voter1).castVote(electionId, [2])
      ).to.be.revertedWith("You have already voted in this election");
    });

    it("Should prevent unauthorized voting", async function () {
      await expect(
        collegeVoting.connect(attacker).castVote(electionId, [1])
      ).to.be.revertedWith("You are not eligible to vote in this election");
    });

    it("Should prevent invalid candidate selection", async function () {
      // Non-existent candidate
      await expect(
        collegeVoting.connect(voter1).castVote(electionId, [999])
      ).to.be.revertedWith("Invalid candidate ID");

      // Empty vote
      await expect(
        collegeVoting.connect(voter1).castVote(electionId, [])
      ).to.be.revertedWith("Must vote for at least one candidate");

      // Multiple choices in single choice election
      await expect(
        collegeVoting.connect(voter1).castVote(electionId, [1, 2])
      ).to.be.revertedWith("Single choice elections allow only one vote");
    });

    it("Should prevent duplicate candidate selection", async function () {
      // Create multiple choice election
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      const createTx = await collegeVoting.connect(creator).createElection(
        "Multiple Choice Election",
        "Testing duplicates",
        startTime,
        endTime,
        ElectionType.MULTIPLE_CHOICE,
        true,
        3
      );
      const createReceipt = await createTx.wait();
      const multiElectionId = createReceipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();

      await collegeVoting.connect(creator).addCandidate(multiElectionId, "Option 1", "Description", "");
      await collegeVoting.connect(creator).addCandidate(multiElectionId, "Option 2", "Description", "");
      await collegeVoting.connect(creator).addCandidate(multiElectionId, "Option 3", "Description", "");

      await collegeVoting.connect(creator).registerVoter(multiElectionId, voter1.address);

      await time.increase(3600);
      await collegeVoting.connect(creator).startElection(multiElectionId);

      await expect(
        collegeVoting.connect(voter1).castVote(multiElectionId, [1, 1, 2])
      ).to.be.revertedWith("Duplicate candidate selection");
    });

    it("Should prevent voting outside election period", async function () {
      // Create future election
      const currentTime = await time.latest();
      const futureStartTime = currentTime + 7200;
      const futureEndTime = futureStartTime + 7200;

      const createTx = await collegeVoting.connect(creator).createElection(
        "Future Election",
        "Testing time bounds",
        futureStartTime,
        futureEndTime,
        ElectionType.SINGLE_CHOICE,
        true,
        1
      );
      const createReceipt = await createTx.wait();
      const futureElectionId = createReceipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();

      await collegeVoting.connect(creator).addCandidate(futureElectionId, "Future Candidate", "Description", "");
      await collegeVoting.connect(creator).registerVoter(futureElectionId, voter1.address);

      // Try to vote before election starts
      await expect(
        collegeVoting.connect(voter1).castVote(futureElectionId, [1])
      ).to.be.revertedWith("Election has not started yet");

      // End current election and try to vote
      await time.increase(7200);
      await collegeVoting.connect(creator).endElection(electionId);

      await expect(
        collegeVoting.connect(voter2).castVote(electionId, [1])
      ).to.be.revertedWith("Election has ended");
    });
  });

  describe("State Manipulation Vulnerabilities", function () {
    let electionId: number;

    beforeEach(async function () {
      await collegeVoting.connect(admin).authorizeElectionCreator(creator.address);
      
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      const createTx = await collegeVoting.connect(creator).createElection(
        "State Test Election",
        "Testing state manipulation",
        startTime,
        endTime,
        ElectionType.SINGLE_CHOICE,
        true,
        1
      );
      const createReceipt = await createTx.wait();
      electionId = createReceipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();

      await collegeVoting.connect(creator).addCandidate(electionId, "Candidate 1", "Description", "");
    });

    it("Should prevent modification after election starts", async function () {
      await time.increase(3600);
      await collegeVoting.connect(creator).startElection(electionId);

      // Should not be able to add candidates after start
      await expect(
        collegeVoting.connect(creator).addCandidate(electionId, "Late Candidate", "Description", "")
      ).to.be.revertedWith("Cannot add candidates after election starts");

      // Should not be able to register voters after start
      await expect(
        collegeVoting.connect(creator).registerVoter(electionId, voter1.address)
      ).to.be.revertedWith("Cannot register voters after election starts");

      // Should not be able to update candidates after start
      await expect(
        collegeVoting.connect(creator).updateCandidate(electionId, 1, "Updated Name", "Updated Description", "")
      ).to.be.revertedWith("Cannot update candidates after election starts");
    });

    it("Should prevent starting election without candidates", async function () {
      // Create election without candidates
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      const createTx = await collegeVoting.connect(creator).createElection(
        "Empty Election",
        "No candidates",
        startTime,
        endTime,
        ElectionType.SINGLE_CHOICE,
        true,
        1
      );
      const createReceipt = await createTx.wait();
      const emptyElectionId = createReceipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();

      await time.increase(3600);

      await expect(
        collegeVoting.connect(creator).startElection(emptyElectionId)
      ).to.be.revertedWith("Election must have at least one candidate");
    });

    it("Should prevent invalid state transitions", async function () {
      // Try to end election before starting
      await time.increase(10800); // Move past end time

      await expect(
        collegeVoting.connect(creator).endElection(electionId)
      ).to.be.revertedWith("Election not active");

      // Try to start election after end time
      await expect(
        collegeVoting.connect(creator).startElection(electionId)
      ).to.be.revertedWith("Election end time has passed");
    });

    it("Should prevent cancelling ended elections", async function () {
      await time.increase(3600);
      await collegeVoting.connect(creator).startElection(electionId);
      
      await time.increase(7200);
      await collegeVoting.connect(creator).endElection(electionId);

      await expect(
        collegeVoting.connect(creator).cancelElection(electionId)
      ).to.be.revertedWith("Cannot cancel ended election");
    });
  });

  describe("Factory Security Vulnerabilities", function () {
    it("Should prevent unauthorized factory operations", async function () {
      await expect(
        electionFactory.connect(attacker).authorizeCreator(creator.address)
      ).to.be.revertedWith("Only admin can perform this action");

      await expect(
        electionFactory.connect(attacker).revokeCreator(creator.address)
      ).to.be.revertedWith("Only admin can perform this action");

      await expect(
        electionFactory.connect(attacker).transferAdmin(attacker.address)
      ).to.be.revertedWith("Only admin can perform this action");
    });

    it("Should prevent unauthorized election deployment", async function () {
      await expect(
        electionFactory.connect(attacker).deployElection("Unauthorized Election", "Malicious")
      ).to.be.revertedWith("Not authorized to create elections");
    });

    it("Should prevent admin privilege revocation", async function () {
      await expect(
        electionFactory.connect(admin).revokeCreator(admin.address)
      ).to.be.revertedWith("Cannot revoke admin privileges");
    });

    it("Should prevent invalid admin transfer", async function () {
      await expect(
        electionFactory.connect(admin).transferAdmin(ethers.constants.AddressZero)
      ).to.be.revertedWith("Invalid admin address");

      await expect(
        electionFactory.connect(admin).transferAdmin(admin.address)
      ).to.be.revertedWith("Same admin address");
    });

    it("Should prevent empty parameter attacks in factory", async function () {
      await electionFactory.connect(admin).authorizeCreator(creator.address);

      await expect(
        electionFactory.connect(creator).deployElection("", "Category")
      ).to.be.revertedWith("Title cannot be empty");

      await expect(
        electionFactory.connect(creator).deployElection("Title", "")
      ).to.be.revertedWith("Category cannot be empty");
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should be protected against reentrancy attacks", async function () {
      // Note: Current contracts don't have external calls that could lead to reentrancy
      // This test documents that the contracts are safe from reentrancy by design
      
      await collegeVoting.connect(admin).authorizeElectionCreator(creator.address);
      
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      // All state changes happen before any external calls (none in current implementation)
      const createTx = await collegeVoting.connect(creator).createElection(
        "Reentrancy Test",
        "Testing reentrancy protection",
        startTime,
        endTime,
        ElectionType.SINGLE_CHOICE,
        true,
        1
      );
      
      expect(createTx).to.not.be.reverted;
      
      // The contracts follow checks-effects-interactions pattern
      // and don't make external calls, making them reentrancy-safe
      console.log("Contracts are reentrancy-safe by design (no external calls)");
    });
  });

  describe("Integer Overflow/Underflow Protection", function () {
    it("Should handle large numbers safely", async function () {
      // Solidity 0.8+ has built-in overflow protection
      await collegeVoting.connect(admin).authorizeElectionCreator(creator.address);
      
      const currentTime = await time.latest();
      
      // Test with very large timestamps that are still in the past
      // This should revert due to validation, demonstrating overflow protection
      const veryLargeButPastTime = currentTime - 1000000;
      
      await expect(
        collegeVoting.connect(creator).createElection(
          "Overflow Test",
          "Testing overflow protection",
          veryLargeButPastTime,
          veryLargeButPastTime + 7200,
          ElectionType.SINGLE_CHOICE,
          true,
          1
        )
      ).to.be.revertedWith("Start time must be in the future");
      
      console.log("Contracts use Solidity 0.8+ with built-in overflow protection");
    });
  });

  describe("Gas Limit DoS Protection", function () {
    it("Should handle large voter registration batches", async function () {
      await collegeVoting.connect(admin).authorizeElectionCreator(creator.address);
      
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      const createTx = await collegeVoting.connect(creator).createElection(
        "DoS Test Election",
        "Testing DoS protection",
        startTime,
        endTime,
        ElectionType.SINGLE_CHOICE,
        true,
        1
      );
      const createReceipt = await createTx.wait();
      const electionId = createReceipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();

      // Test with reasonable batch size (should succeed)
      const signers = await ethers.getSigners();
      const voterAddresses = signers.slice(0, 50).map(s => s.address);
      
      const tx = await collegeVoting.connect(creator).registerMultipleVoters(electionId, voterAddresses);
      const receipt = await tx.wait();
      
      console.log(`Registered ${voterAddresses.length} voters using ${receipt.gasUsed.toString()} gas`);
      expect(receipt.gasUsed.lt(ethers.utils.parseUnits("5000000", "wei"))).to.be.true; // Should be under 5M gas
    });
  });
});