import { expect } from "chai";
import { ethers } from "hardhat";
import { CollegeVoting, ElectionFactory } from "../types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Load Testing Scenarios", function () {
  let collegeVoting: CollegeVoting;
  let electionFactory: ElectionFactory;
  let admin: SignerWithAddress;
  let creator: SignerWithAddress;
  let voters: SignerWithAddress[];

  const ElectionType = {
    SINGLE_CHOICE: 0,
    MULTIPLE_CHOICE: 1,
    RANKED_VOTING: 2
  };

  // Increase timeout for load tests
  this.timeout(300000); // 5 minutes

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    [admin, creator, ...voters] = signers;
    
    const CollegeVotingFactory = await ethers.getContractFactory("CollegeVoting");
    collegeVoting = await CollegeVotingFactory.deploy();
    await collegeVoting.deployed();

    const ElectionFactoryContract = await ethers.getContractFactory("ElectionFactory");
    electionFactory = await ElectionFactoryContract.deploy();
    await electionFactory.deployed();

    await collegeVoting.connect(admin).authorizeElectionCreator(creator.address);
  });

  describe("High Volume Election Creation", function () {
    it("Should handle creating multiple elections efficiently", async function () {
      const electionCount = 20;
      const startTime = Date.now();
      const electionIds: number[] = [];

      console.log(`Creating ${electionCount} elections...`);

      for (let i = 1; i <= electionCount; i++) {
        const currentTime = await time.latest();
        const electionStartTime = currentTime + 3600;
        const electionEndTime = electionStartTime + 7200;

        const tx = await collegeVoting.connect(creator).createElection(
          `Load Test Election ${i}`,
          `Description for election ${i}`,
          electionStartTime,
          electionEndTime,
          ElectionType.SINGLE_CHOICE,
          true,
          1
        );
        const receipt = await tx.wait();
        const electionId = receipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();
        electionIds.push(electionId);

        if (i % 5 === 0) {
          console.log(`Created ${i}/${electionCount} elections`);
        }
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTimePerElection = totalTime / electionCount;

      console.log(`Total time: ${totalTime}ms`);
      console.log(`Average time per election: ${avgTimePerElection}ms`);

      expect(electionIds.length).to.equal(electionCount);
      expect(await collegeVoting.getElectionCount()).to.equal(electionCount);
      expect(avgTimePerElection).to.be.lt(5000); // Should be under 5 seconds per election
    });

    it("Should handle adding many candidates to an election", async function () {
      const candidateCount = 50;
      
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      const createTx = await collegeVoting.connect(creator).createElection(
        "Many Candidates Election",
        "Testing with many candidates",
        startTime,
        endTime,
        ElectionType.SINGLE_CHOICE,
        true,
        1
      );
      const createReceipt = await createTx.wait();
      const electionId = createReceipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();

      console.log(`Adding ${candidateCount} candidates...`);
      const startAddTime = Date.now();

      for (let i = 1; i <= candidateCount; i++) {
        await collegeVoting.connect(creator).addCandidate(
          electionId,
          `Candidate ${i}`,
          `Description for candidate ${i}`,
          `https://example.com/candidate${i}.jpg`
        );

        if (i % 10 === 0) {
          console.log(`Added ${i}/${candidateCount} candidates`);
        }
      }

      const endAddTime = Date.now();
      const totalAddTime = endAddTime - startAddTime;
      const avgTimePerCandidate = totalAddTime / candidateCount;

      console.log(`Total time to add candidates: ${totalAddTime}ms`);
      console.log(`Average time per candidate: ${avgTimePerCandidate}ms`);

      // Verify all candidates were added
      const [names] = await collegeVoting.getAllCandidates(electionId);
      expect(names.length).to.equal(candidateCount);
      expect(avgTimePerCandidate).to.be.lt(1000); // Should be under 1 second per candidate
    });
  });

  describe("High Volume Voter Registration", function () {
    let electionId: number;

    beforeEach(async function () {
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      const createTx = await collegeVoting.connect(creator).createElection(
        "Load Test Election",
        "Testing voter registration load",
        startTime,
        endTime,
        ElectionType.SINGLE_CHOICE,
        true,
        1
      );
      const createReceipt = await createTx.wait();
      electionId = createReceipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();

      await collegeVoting.connect(creator).addCandidate(electionId, "Test Candidate", "Description", "");
    });

    it("Should handle registering many voters individually", async function () {
      const voterCount = Math.min(100, voters.length);
      console.log(`Registering ${voterCount} voters individually...`);

      const startRegTime = Date.now();

      for (let i = 0; i < voterCount; i++) {
        await collegeVoting.connect(creator).registerVoter(electionId, voters[i].address);

        if ((i + 1) % 20 === 0) {
          console.log(`Registered ${i + 1}/${voterCount} voters`);
        }
      }

      const endRegTime = Date.now();
      const totalRegTime = endRegTime - startRegTime;
      const avgTimePerVoter = totalRegTime / voterCount;

      console.log(`Total registration time: ${totalRegTime}ms`);
      console.log(`Average time per voter: ${avgTimePerVoter}ms`);

      expect(avgTimePerVoter).to.be.lt(500); // Should be under 500ms per voter
    });

    it("Should handle batch voter registration efficiently", async function () {
      const batchSizes = [10, 25, 50, 100];
      
      for (const batchSize of batchSizes) {
        const actualBatchSize = Math.min(batchSize, voters.length);
        const voterBatch = voters.slice(0, actualBatchSize).map(v => v.address);

        console.log(`Testing batch registration with ${actualBatchSize} voters...`);
        
        const startBatchTime = Date.now();
        const tx = await collegeVoting.connect(creator).registerMultipleVoters(electionId, voterBatch);
        const receipt = await tx.wait();
        const endBatchTime = Date.now();

        const batchTime = endBatchTime - startBatchTime;
        const timePerVoter = batchTime / actualBatchSize;

        console.log(`Batch size ${actualBatchSize}: ${batchTime}ms total, ${timePerVoter}ms per voter, ${receipt.gasUsed.toString()} gas`);

        expect(timePerVoter).to.be.lt(100); // Batch should be much faster per voter
        expect(receipt.gasUsed.lt(ethers.utils.parseUnits("5000000", "wei"))).to.be.true;

        // Reset for next batch test
        const newCurrentTime = await time.latest();
        const newStartTime = newCurrentTime + 3600;
        const newEndTime = newStartTime + 7200;

        const newCreateTx = await collegeVoting.connect(creator).createElection(
          `Batch Test ${batchSize}`,
          "Testing batch registration",
          newStartTime,
          newEndTime,
          ElectionType.SINGLE_CHOICE,
          true,
          1
        );
        const newCreateReceipt = await newCreateTx.wait();
        electionId = newCreateReceipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();
        await collegeVoting.connect(creator).addCandidate(electionId, "Test Candidate", "Description", "");
      }
    });
  });

  describe("High Volume Voting", function () {
    let electionId: number;
    const voterCount = 100;

    beforeEach(async function () {
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      const createTx = await collegeVoting.connect(creator).createElection(
        "Voting Load Test",
        "Testing high volume voting",
        startTime,
        endTime,
        ElectionType.SINGLE_CHOICE,
        true,
        1
      );
      const createReceipt = await createTx.wait();
      electionId = createReceipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();

      // Add candidates
      for (let i = 1; i <= 5; i++) {
        await collegeVoting.connect(creator).addCandidate(electionId, `Candidate ${i}`, `Description ${i}`, "");
      }

      // Register voters in batches
      const actualVoterCount = Math.min(voterCount, voters.length);
      const voterAddresses = voters.slice(0, actualVoterCount).map(v => v.address);
      await collegeVoting.connect(creator).registerMultipleVoters(electionId, voterAddresses);

      // Start election
      await time.increase(3600);
      await collegeVoting.connect(creator).startElection(electionId);
    });

    it("Should handle many concurrent votes", async function () {
      const actualVoterCount = Math.min(voterCount, voters.length);
      console.log(`Processing ${actualVoterCount} votes...`);

      const startVoteTime = Date.now();
      const votePromises: Promise<any>[] = [];

      // Submit all votes concurrently (simulating real-world concurrent voting)
      for (let i = 0; i < actualVoterCount; i++) {
        const candidateChoice = (i % 5) + 1; // Distribute votes among 5 candidates
        const votePromise = collegeVoting.connect(voters[i]).castVote(electionId, [candidateChoice]);
        votePromises.push(votePromise);
      }

      // Wait for all votes to complete
      const results = await Promise.allSettled(votePromises);
      const endVoteTime = Date.now();

      const successfulVotes = results.filter(r => r.status === 'fulfilled').length;
      const failedVotes = results.filter(r => r.status === 'rejected').length;

      const totalVoteTime = endVoteTime - startVoteTime;
      const avgTimePerVote = totalVoteTime / actualVoterCount;

      console.log(`Total voting time: ${totalVoteTime}ms`);
      console.log(`Average time per vote: ${avgTimePerVote}ms`);
      console.log(`Successful votes: ${successfulVotes}`);
      console.log(`Failed votes: ${failedVotes}`);

      expect(successfulVotes).to.equal(actualVoterCount);
      expect(failedVotes).to.equal(0);
      expect(avgTimePerVote).to.be.lt(2000); // Should be under 2 seconds per vote on average

      // End election before reading final results.
      await time.increase(7200);
      await collegeVoting.connect(creator).endElection(electionId);

      // Verify vote counts
      const [candidateVotes, totalVotes] = await collegeVoting.getElectionResults(electionId);
      expect(totalVotes).to.equal(actualVoterCount);
      
      const sumVotes = candidateVotes.reduce((sum, votes) => sum + votes.toNumber(), 0);
      expect(sumVotes).to.equal(actualVoterCount);
    });

    it("Should handle sequential voting efficiently", async function () {
      const actualVoterCount = Math.min(50, voters.length); // Smaller count for sequential test
      console.log(`Processing ${actualVoterCount} sequential votes...`);

      const startSeqTime = Date.now();
      const voteTimes: number[] = [];

      for (let i = 0; i < actualVoterCount; i++) {
        const voteStartTime = Date.now();
        const candidateChoice = (i % 5) + 1;
        
        await collegeVoting.connect(voters[i]).castVote(electionId, [candidateChoice]);
        
        const voteEndTime = Date.now();
        const voteTime = voteEndTime - voteStartTime;
        voteTimes.push(voteTime);

        if ((i + 1) % 10 === 0) {
          console.log(`Processed ${i + 1}/${actualVoterCount} votes`);
        }
      }

      const endSeqTime = Date.now();
      const totalSeqTime = endSeqTime - startSeqTime;
      const avgVoteTime = voteTimes.reduce((sum, time) => sum + time, 0) / voteTimes.length;
      const maxVoteTime = Math.max(...voteTimes);
      const minVoteTime = Math.min(...voteTimes);

      console.log(`Total sequential voting time: ${totalSeqTime}ms`);
      console.log(`Average vote time: ${avgVoteTime}ms`);
      console.log(`Max vote time: ${maxVoteTime}ms`);
      console.log(`Min vote time: ${minVoteTime}ms`);

      expect(avgVoteTime).to.be.lt(1000); // Should be under 1 second per vote
      expect(maxVoteTime).to.be.lt(3000); // No single vote should take more than 3 seconds
    });
  });

  describe("Factory Load Testing", function () {
    beforeEach(async function () {
      await electionFactory.connect(admin).authorizeCreator(creator.address);
    });

    it("Should handle deploying many elections through factory", async function () {
      const deploymentCount = 15;
      console.log(`Deploying ${deploymentCount} elections through factory...`);

      const startDeployTime = Date.now();
      const deployedAddresses: string[] = [];

      for (let i = 1; i <= deploymentCount; i++) {
        const tx = await electionFactory.connect(creator).deployElection(
          `Factory Election ${i}`,
          i % 3 === 0 ? "College" : i % 3 === 1 ? "Corporate" : "Community"
        );
        const receipt = await tx.wait();
        const event = receipt.events?.find(e => e.event === "ElectionDeployed");
        deployedAddresses.push(event?.args?.electionContract);

        if (i % 5 === 0) {
          console.log(`Deployed ${i}/${deploymentCount} elections`);
        }
      }

      const endDeployTime = Date.now();
      const totalDeployTime = endDeployTime - startDeployTime;
      const avgDeployTime = totalDeployTime / deploymentCount;

      console.log(`Total deployment time: ${totalDeployTime}ms`);
      console.log(`Average deployment time: ${avgDeployTime}ms`);

      expect(deployedAddresses.length).to.equal(deploymentCount);
      expect(await electionFactory.deployedElectionsCount()).to.equal(deploymentCount);
      expect(avgDeployTime).to.be.lt(10000); // Should be under 10 seconds per deployment

      // Test discovery functions with many elections
      const collegeElections = await electionFactory.getElectionsByCategory("College");
      const corporateElections = await electionFactory.getElectionsByCategory("Corporate");
      const communityElections = await electionFactory.getElectionsByCategory("Community");

      console.log(`College elections: ${collegeElections.length}`);
      console.log(`Corporate elections: ${corporateElections.length}`);
      console.log(`Community elections: ${communityElections.length}`);

      expect(collegeElections.length + corporateElections.length + communityElections.length)
        .to.equal(deploymentCount);
    });

    it("Should handle pagination with many elections", async function () {
      // Deploy some elections first
      const deploymentCount = 25;
      for (let i = 1; i <= deploymentCount; i++) {
        await electionFactory.connect(creator).deployElection(`Pagination Test ${i}`, "Test");
      }

      // Test pagination performance
      const pageSize = 10;
      const totalPages = Math.ceil(deploymentCount / pageSize);
      
      console.log(`Testing pagination with ${deploymentCount} elections, ${pageSize} per page`);

      const startPagTime = Date.now();
      let totalRetrieved = 0;

      for (let page = 0; page < totalPages; page++) {
        const offset = page * pageSize;
        const [elections, total] = await electionFactory.getDeployedElections(offset, pageSize);
        
        totalRetrieved += elections.length;
        console.log(`Page ${page + 1}: Retrieved ${elections.length} elections (total: ${total})`);
        
        expect(total).to.equal(deploymentCount);
        expect(elections.length).to.be.lte(pageSize);
      }

      const endPagTime = Date.now();
      const totalPagTime = endPagTime - startPagTime;

      console.log(`Total pagination time: ${totalPagTime}ms`);
      console.log(`Total elections retrieved: ${totalRetrieved}`);

      expect(totalRetrieved).to.equal(deploymentCount);
      expect(totalPagTime).to.be.lt(5000); // Should be under 5 seconds for all pages
    });
  });

  describe("Memory and State Management", function () {
    it("Should handle large election data efficiently", async function () {
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      // Create election with many candidates and voters
      const createTx = await collegeVoting.connect(creator).createElection(
        "Large Data Election",
        "Testing large data handling",
        startTime,
        endTime,
        ElectionType.MULTIPLE_CHOICE,
        true,
        10
      );
      const createReceipt = await createTx.wait();
      const electionId = createReceipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();

      // Add many candidates
      const candidateCount = 30;
      for (let i = 1; i <= candidateCount; i++) {
        await collegeVoting.connect(creator).addCandidate(
          electionId,
          `Candidate ${i}`,
          `Long description for candidate ${i} with lots of details about their background and qualifications`,
          `https://example.com/very/long/url/path/to/candidate/${i}/image.jpg`
        );
      }

      // Register many voters
      const voterCount = Math.min(200, voters.length);
      const voterBatches = [];
      const batchSize = 50;
      
      for (let i = 0; i < voterCount; i += batchSize) {
        const batch = voters.slice(i, Math.min(i + batchSize, voterCount)).map(v => v.address);
        voterBatches.push(batch);
      }

      for (const batch of voterBatches) {
        await collegeVoting.connect(creator).registerMultipleVoters(electionId, batch);
      }

      // Test data retrieval performance
      const startRetrievalTime = Date.now();
      
      const electionInfo = await collegeVoting.getElectionInfo(electionId);
      const allCandidates = await collegeVoting.getAllCandidates(electionId);
      
      const endRetrievalTime = Date.now();
      const retrievalTime = endRetrievalTime - startRetrievalTime;

      console.log(`Data retrieval time: ${retrievalTime}ms`);
      console.log(`Election has ${candidateCount} candidates and ${voterCount} registered voters`);

      expect(allCandidates[0].length).to.equal(candidateCount); // names array
      expect(retrievalTime).to.be.lt(2000); // Should be under 2 seconds
    });

    it("Should maintain performance with multiple active elections", async function () {
      const electionCount = 10;
      const electionIds: number[] = [];

      console.log(`Creating ${electionCount} elections with candidates and voters...`);

      // Create multiple elections
      for (let i = 1; i <= electionCount; i++) {
        const currentTime = await time.latest();
        const startTime = currentTime + 3600;
        const endTime = startTime + 7200;

        const createTx = await collegeVoting.connect(creator).createElection(
          `Multi Election ${i}`,
          `Description ${i}`,
          startTime,
          endTime,
          ElectionType.SINGLE_CHOICE,
          true,
          1
        );
        const createReceipt = await createTx.wait();
        const electionId = createReceipt.events?.find(e => e.event === "ElectionCreated")?.args?.electionId.toNumber();
        electionIds.push(electionId);

        // Add candidates to each election
        for (let j = 1; j <= 5; j++) {
          await collegeVoting.connect(creator).addCandidate(electionId, `Candidate ${j}`, `Description ${j}`, "");
        }

        // Register voters for each election
        const votersForElection = voters.slice(0, 20).map(v => v.address);
        await collegeVoting.connect(creator).registerMultipleVoters(electionId, votersForElection);
      }

      // Test performance of operations across multiple elections
      const startMultiOpTime = Date.now();

      // Start all elections
      await time.increase(3600);
      for (const electionId of electionIds) {
        await collegeVoting.connect(creator).startElection(electionId);
      }

      // Cast votes in all elections
      for (let i = 0; i < electionIds.length; i++) {
        const electionId = electionIds[i];
        for (let j = 0; j < 10; j++) { // 10 votes per election
          const candidateChoice = (j % 5) + 1;
          await collegeVoting.connect(voters[j]).castVote(electionId, [candidateChoice]);
        }
      }

      const endMultiOpTime = Date.now();
      const multiOpTime = endMultiOpTime - startMultiOpTime;

      console.log(`Multi-election operations time: ${multiOpTime}ms`);
      console.log(`Average time per election: ${multiOpTime / electionCount}ms`);

      expect(multiOpTime).to.be.lt(60000); // Should be under 1 minute for all operations
      expect(await collegeVoting.getElectionCount()).to.equal(electionCount);
    });
  });

  describe("Performance Benchmarks", function () {
    it("Should document performance benchmarks", async function () {
      console.log("\n=== PERFORMANCE BENCHMARKS ===");
      console.log("Expected performance targets:");
      console.log("- Election creation: < 5 seconds");
      console.log("- Candidate addition: < 1 second");
      console.log("- Voter registration (individual): < 500ms");
      console.log("- Voter registration (batch): < 100ms per voter");
      console.log("- Vote casting: < 2 seconds");
      console.log("- Election deployment: < 10 seconds");
      console.log("- Data retrieval: < 2 seconds");
      console.log("- Multi-election operations: < 1 minute");
      console.log("================================\n");

      // This test always passes but serves as documentation
      expect(true).to.be.true;
    });
  });
});
