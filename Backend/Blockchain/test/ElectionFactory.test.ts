import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("ElectionFactory", function () {
    let electionFactory: Contract;
    let admin: any;
    let creator1: any;
    let creator2: any;
    let user1: any;

    beforeEach(async function () {
        [admin, creator1, creator2, user1] = await ethers.getSigners();

        const ElectionFactory = await ethers.getContractFactory("ElectionFactory");
        electionFactory = await ElectionFactory.deploy();
    });

    describe("Deployment", function () {
        it("Should set the correct admin", async function () {
            expect(await electionFactory.admin()).to.equal(admin.address);
        });

        it("Should authorize admin as creator by default", async function () {
            expect(await electionFactory.authorizedCreators(admin.address)).to.be.true;
        });

        it("Should initialize with zero deployed elections", async function () {
            expect(await electionFactory.deployedElectionsCount()).to.equal(0);
        });
    });

    describe("Creator Authorization", function () {
        it("Should allow admin to authorize creators", async function () {
            await electionFactory.authorizeCreator(creator1.address);
            expect(await electionFactory.authorizedCreators(creator1.address)).to.be.true;
        });

        it("Should emit CreatorAuthorized event", async function () {
            await expect(electionFactory.authorizeCreator(creator1.address))
                .to.emit(electionFactory, "CreatorAuthorized")
                .withArgs(creator1.address, admin.address, anyValue);
        });

        it("Should not allow non-admin to authorize creators", async function () {
            await expect(
                electionFactory.connect(creator1).authorizeCreator(creator2.address)
            ).to.be.revertedWith("Only admin can perform this action");
        });

        it("Should not allow authorizing zero address", async function () {
            await expect(
                electionFactory.authorizeCreator(ethers.constants.AddressZero)
            ).to.be.revertedWith("Invalid creator address");
        });

        it("Should not allow authorizing already authorized creator", async function () {
            await electionFactory.authorizeCreator(creator1.address);
            await expect(
                electionFactory.authorizeCreator(creator1.address)
            ).to.be.revertedWith("Creator already authorized");
        });

        it("Should allow admin to revoke creators", async function () {
            await electionFactory.authorizeCreator(creator1.address);
            await electionFactory.revokeCreator(creator1.address);
            expect(await electionFactory.authorizedCreators(creator1.address)).to.be.false;
        });

        it("Should emit CreatorRevoked event", async function () {
            await electionFactory.authorizeCreator(creator1.address);
            await expect(electionFactory.revokeCreator(creator1.address))
                .to.emit(electionFactory, "CreatorRevoked")
                .withArgs(creator1.address, admin.address, anyValue);
        });

        it("Should not allow revoking admin privileges", async function () {
            await expect(
                electionFactory.revokeCreator(admin.address)
            ).to.be.revertedWith("Cannot revoke admin privileges");
        });

        it("Should not allow revoking non-authorized creator", async function () {
            await expect(
                electionFactory.revokeCreator(creator1.address)
            ).to.be.revertedWith("Creator not authorized");
        });
    });

    describe("Election Deployment", function () {
        beforeEach(async function () {
            await electionFactory.authorizeCreator(creator1.address);
        });

        it("Should deploy election successfully", async function () {
            const title = "Test Election";
            const category = "College";

            const tx = await electionFactory.connect(creator1).deployElection(
                title, category
            );
            
            expect(await electionFactory.deployedElectionsCount()).to.equal(1);
            
            const electionAddress = await electionFactory.deployedElections(1);
            expect(electionAddress).to.not.equal(ethers.constants.AddressZero);
            expect(await electionFactory.isDeployedElection(electionAddress)).to.be.true;
        });

        it("Should emit ElectionDeployed event", async function () {
            const title = "Test Election";
            const category = "College";

            await expect(
                electionFactory.connect(creator1).deployElection(
                    title, category
                )
            ).to.emit(electionFactory, "ElectionDeployed");
        });

        it("Should not allow unauthorized creators to deploy", async function () {
            await expect(
                electionFactory.connect(user1).deployElection(
                    "Test", "Category"
                )
            ).to.be.revertedWith("Not authorized to create elections");
        });

        it("Should not allow empty title", async function () {
            await expect(
                electionFactory.connect(creator1).deployElection(
                    "", "Category"
                )
            ).to.be.revertedWith("Title cannot be empty");
        });

        it("Should not allow empty category", async function () {
            await expect(
                electionFactory.connect(creator1).deployElection(
                    "Title", ""
                )
            ).to.be.revertedWith("Category cannot be empty");
        });

        it("Should track creator elections", async function () {
            await electionFactory.connect(creator1).deployElection(
                "Election 1", "Category"
            );
            await electionFactory.connect(creator1).deployElection(
                "Election 2", "Category"
            );

            const creatorElections = await electionFactory.getElectionsByCreator(creator1.address);
            expect(creatorElections.length).to.equal(2);
            
            const [electionCount, isAuthorized] = await electionFactory.getCreatorStats(creator1.address);
            expect(electionCount).to.equal(2);
            expect(isAuthorized).to.be.true;
        });
    });

    describe("Election Discovery", function () {
        let election1Address: string;
        let election2Address: string;
        let election3Address: string;

        beforeEach(async function () {
            await electionFactory.authorizeCreator(creator1.address);
            await electionFactory.authorizeCreator(creator2.address);

            // Deploy test elections
            await electionFactory.connect(creator1).deployElection(
                "Election 1", "College"
            );
            election1Address = await electionFactory.deployedElections(1);

            await electionFactory.connect(creator1).deployElection(
                "Election 2", "Corporate"
            );
            election2Address = await electionFactory.deployedElections(2);

            await electionFactory.connect(creator2).deployElection(
                "Election 3", "College"
            );
            election3Address = await electionFactory.deployedElections(3);
        });

        it("Should get elections by category", async function () {
            const collegeElections = await electionFactory.getElectionsByCategory("College");
            expect(collegeElections.length).to.equal(2);
            expect(collegeElections).to.include(election1Address);
            expect(collegeElections).to.include(election3Address);

            const corporateElections = await electionFactory.getElectionsByCategory("Corporate");
            expect(corporateElections.length).to.equal(1);
            expect(corporateElections[0]).to.equal(election2Address);
        });

        it("Should get elections by creator", async function () {
            const creator1Elections = await electionFactory.getElectionsByCreator(creator1.address);
            expect(creator1Elections.length).to.equal(2);
            expect(creator1Elections).to.include(election1Address);
            expect(creator1Elections).to.include(election2Address);

            const creator2Elections = await electionFactory.getElectionsByCreator(creator2.address);
            expect(creator2Elections.length).to.equal(1);
            expect(creator2Elections[0]).to.equal(election3Address);
        });

        it("Should get paginated deployed elections", async function () {
            const [elections, total] = await electionFactory.getDeployedElections(0, 2);
            expect(total).to.equal(3);
            expect(elections.length).to.equal(2);
            expect(elections[0]).to.equal(election1Address);
            expect(elections[1]).to.equal(election2Address);

            const [elections2] = await electionFactory.getDeployedElections(2, 2);
            expect(elections2.length).to.equal(1);
            expect(elections2[0]).to.equal(election3Address);
        });
    });

    describe("Admin Transfer", function () {
        it("Should allow admin to transfer admin rights", async function () {
            await electionFactory.transferAdmin(creator1.address);
            
            expect(await electionFactory.admin()).to.equal(creator1.address);
            expect(await electionFactory.authorizedCreators(creator1.address)).to.be.true;
        });

        it("Should not allow non-admin to transfer admin rights", async function () {
            await expect(
                electionFactory.connect(creator1).transferAdmin(creator2.address)
            ).to.be.revertedWith("Only admin can perform this action");
        });

        it("Should not allow transferring to zero address", async function () {
            await expect(
                electionFactory.transferAdmin(ethers.constants.AddressZero)
            ).to.be.revertedWith("Invalid admin address");
        });

        it("Should not allow transferring to same admin", async function () {
            await expect(
                electionFactory.transferAdmin(admin.address)
            ).to.be.revertedWith("Same admin address");
        });
    });

    describe("Edge Cases", function () {
        it("Should handle empty category elections", async function () {
            const emptyCategory = await electionFactory.getElectionsByCategory("NonExistent");
            expect(emptyCategory.length).to.equal(0);
        });

        it("Should handle pagination beyond available elections", async function () {
            const [elections, total] = await electionFactory.getDeployedElections(100, 10);
            expect(elections.length).to.equal(0);
            expect(total).to.equal(0);
        });
    });
});
