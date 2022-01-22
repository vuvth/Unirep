"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const hardhat_1 = require("hardhat");
const chai_1 = require("chai");
const crypto_1 = require("@unirep/crypto");
const circuits_1 = require("@unirep/circuits");
const contracts_1 = require("@unirep/contracts");
const core_1 = require("../../core");
const utils_1 = require("../utils");
describe('Reputation proof events in Unirep User State', function () {
    this.timeout(500000);
    let userIds = [];
    let userCommitments = [];
    let userStateTreeRoots = [];
    let signUpAirdrops = [];
    let unirepContract;
    let unirepContractCalledByAttester;
    let _treeDepths = (0, utils_1.getTreeDepthsForTesting)("circuit");
    let accounts;
    const attester = new Object();
    let attesterId;
    const maxUsers = (2 ** core_1.circuitGlobalStateTreeDepth) - 1;
    const userNum = 5;
    const airdropPosRep = 10;
    before(async () => {
        accounts = await hardhat_1.ethers.getSigners();
        const _settings = {
            maxUsers: maxUsers,
            maxAttesters: core_1.maxAttesters,
            numEpochKeyNoncePerEpoch: core_1.numEpochKeyNoncePerEpoch,
            maxReputationBudget: core_1.maxReputationBudget,
            epochLength: core_1.epochLength,
            attestingFee: core_1.attestingFee
        };
        unirepContract = await (0, contracts_1.deployUnirep)(accounts[0], _treeDepths, _settings);
    });
    describe('Attester sign up and set airdrop', async () => {
        it('attester sign up', async () => {
            attester['acct'] = accounts[2];
            attester['addr'] = await attester['acct'].getAddress();
            unirepContractCalledByAttester = unirepContract.connect(attester['acct']);
            let tx = await unirepContractCalledByAttester.attesterSignUp();
            let receipt = await tx.wait();
            (0, chai_1.expect)(receipt.status, 'Attester signs up failed').to.equal(1);
            attesterId = await unirepContract.attesters(attester['addr']);
        });
        it('attester set airdrop amount', async () => {
            const tx = await unirepContractCalledByAttester.setAirdropAmount(airdropPosRep);
            const receipt = await tx.wait();
            (0, chai_1.expect)(receipt.status).equal(1);
            const airdroppedAmount = await unirepContract.airdropAmount(attester['addr']);
            (0, chai_1.expect)(airdroppedAmount.toNumber()).equal(airdropPosRep);
        });
    });
    describe('Init User State', async () => {
        it('check User state matches the contract', async () => {
            const id = (0, crypto_1.genIdentity)();
            const initUnirepState = await (0, core_1.genUserStateFromContract)(hardhat_1.ethers.provider, unirepContract.address, id);
            const contractEpoch = await unirepContract.currentEpoch();
            const unirepEpoch = initUnirepState.getUnirepStateCurrentEpoch();
            (0, chai_1.expect)(unirepEpoch).equal(Number(contractEpoch));
            const unirepGSTree = initUnirepState.getUnirepStateGSTree(unirepEpoch);
            const defaultGSTree = (0, utils_1.genNewGST)(_treeDepths.globalStateTreeDepth, _treeDepths.userStateTreeDepth);
            (0, chai_1.expect)(unirepGSTree.root).equal(defaultGSTree.root);
        });
    });
    describe('User Sign Up event', async () => {
        const GSTree = (0, utils_1.genNewGST)(_treeDepths.globalStateTreeDepth, _treeDepths.userStateTreeDepth);
        const rootHistories = [];
        it('sign up users through attester who sets airdrop', async () => {
            for (let i = 0; i < userNum; i++) {
                const id = (0, crypto_1.genIdentity)();
                const commitment = (0, crypto_1.genIdentityCommitment)(id);
                userIds.push(id);
                userCommitments.push(commitment);
                const tx = await unirepContractCalledByAttester.userSignUp(commitment);
                const receipt = await tx.wait();
                (0, chai_1.expect)(receipt.status, 'User sign up failed').to.equal(1);
                await (0, chai_1.expect)(unirepContractCalledByAttester.userSignUp(commitment))
                    .to.be.revertedWith('Unirep: the user has already signed up');
                const userState = await (0, core_1.genUserStateFromContract)(hardhat_1.ethers.provider, unirepContract.address, id);
                const contractEpoch = await unirepContract.currentEpoch();
                const unirepEpoch = userState.getUnirepStateCurrentEpoch();
                (0, chai_1.expect)(unirepEpoch).equal(Number(contractEpoch));
                const attesterId = await unirepContract.attesters(attester['addr']);
                const airdroppedAmount = await unirepContract.airdropAmount(attester['addr']);
                const newUSTRoot = await (0, core_1.computeInitUserStateRoot)(_treeDepths.userStateTreeDepth, Number(attesterId), Number(airdroppedAmount));
                const newGSTLeaf = (0, crypto_1.hashLeftRight)(commitment, newUSTRoot);
                userStateTreeRoots.push(newUSTRoot);
                signUpAirdrops.push(new core_1.Reputation(BigInt(airdroppedAmount), BigInt(0), BigInt(0), BigInt(1)));
                GSTree.insert(newGSTLeaf);
                rootHistories.push(GSTree.root);
            }
        });
        it('sign up users with no airdrop', async () => {
            for (let i = 0; i < maxUsers - userNum; i++) {
                const id = (0, crypto_1.genIdentity)();
                const commitment = (0, crypto_1.genIdentityCommitment)(id);
                userIds.push(id);
                userCommitments.push(commitment);
                const tx = await unirepContract.userSignUp(commitment);
                const receipt = await tx.wait();
                (0, chai_1.expect)(receipt.status, 'User sign up failed').to.equal(1);
                const userState = await (0, core_1.genUserStateFromContract)(hardhat_1.ethers.provider, unirepContract.address, id);
                const contractEpoch = await unirepContract.currentEpoch();
                const unirepEpoch = userState.getUnirepStateCurrentEpoch();
                (0, chai_1.expect)(unirepEpoch).equal(Number(contractEpoch));
                const newUSTRoot = await (0, core_1.computeInitUserStateRoot)(_treeDepths.userStateTreeDepth);
                const newGSTLeaf = (0, crypto_1.hashLeftRight)(commitment, newUSTRoot);
                userStateTreeRoots.push(newUSTRoot);
                signUpAirdrops.push(core_1.Reputation.default());
                GSTree.insert(newGSTLeaf);
                rootHistories.push(GSTree.root);
            }
        });
        it('Sign up users more than contract capacity will not affect Unirep state', async () => {
            const id = (0, crypto_1.genIdentity)();
            const commitment = (0, crypto_1.genIdentityCommitment)(id);
            const userStateBefore = await (0, core_1.genUserStateFromContract)(hardhat_1.ethers.provider, unirepContract.address, id);
            const GSTRootBefore = userStateBefore.getUnirepStateGSTree(1).root;
            await (0, chai_1.expect)(unirepContract.userSignUp(commitment))
                .to.be.revertedWith('Unirep: maximum number of user signups reached');
            const userState = await (0, core_1.genUserStateFromContract)(hardhat_1.ethers.provider, unirepContract.address, id);
            const GSTRoot = userState.getUnirepStateGSTree(1).root;
            (0, chai_1.expect)(GSTRoot).equal(GSTRootBefore);
        });
        it('Check GST roots match Unirep state', async () => {
            const unirepState = await (0, core_1.genUnirepStateFromContract)(hardhat_1.ethers.provider, unirepContract.address);
            for (let root of rootHistories) {
                const exist = unirepState.GSTRootExists(root, unirepState.currentEpoch);
                (0, chai_1.expect)(exist).to.be.true;
            }
        });
    });
    describe('Reputation proof event', async () => {
        let epochKey;
        let proofIndex;
        let epoch;
        const userIdx = 2;
        let repNullifier;
        it('submit valid reputation proof event', async () => {
            const epkNonce = 0;
            const spendReputation = 4;
            epoch = Number(await unirepContract.currentEpoch());
            const reputationRecords = {};
            reputationRecords[attesterId.toString()] = signUpAirdrops[userIdx];
            const nonceList = [];
            for (let i = 0; i < spendReputation; i++) {
                nonceList.push(BigInt(i));
            }
            for (let i = spendReputation; i < core_1.maxReputationBudget; i++) {
                nonceList.push(BigInt(-1));
            }
            repNullifier = (0, core_1.genReputationNullifier)(userIds[userIdx].identityNullifier, epoch, 0, attesterId);
            const userState = await (0, core_1.genUserStateFromContract)(hardhat_1.ethers.provider, unirepContract.address, userIds[userIdx]);
            const { proof, publicSignals } = await userState.genProveReputationProof(BigInt(attesterId), epkNonce, undefined, undefined, undefined, nonceList);
            const repProofInput = new contracts_1.ReputationProof(publicSignals, proof);
            const isValid = await repProofInput.verify();
            (0, chai_1.expect)(isValid).to.be.true;
            const tx = await unirepContractCalledByAttester.spendReputation(repProofInput);
            const receipt = await tx.wait();
            (0, chai_1.expect)(receipt.status).to.equal(1);
            epochKey = repProofInput.epochKey;
            const hashedProof = await unirepContract.hashReputationProof(repProofInput);
            proofIndex = Number(await unirepContract.getProofIndex(hashedProof));
            await (0, chai_1.expect)(unirepContractCalledByAttester.spendReputation(repProofInput))
                .to.be.revertedWith('Unirep: the proof has been submitted before');
        });
        it('spendReputation event should update User state', async () => {
            const userState = await (0, core_1.genUserStateFromContract)(hardhat_1.ethers.provider, unirepContract.address, userIds[0]);
            const attestations = userState.getAttestations(epochKey);
            (0, chai_1.expect)(attestations.length).equal(1);
            // nullifiers should be added to unirepState
            (0, chai_1.expect)(userState.nullifierExist(repNullifier)).to.be.true;
        });
        it('submit attestations to the epoch key should update User state', async () => {
            const attestation = (0, utils_1.genRandomAttestation)();
            attestation.attesterId = BigInt(attesterId);
            const tx = await unirepContractCalledByAttester.submitAttestation(attestation, epochKey, proofIndex);
            const receipt = await tx.wait();
            (0, chai_1.expect)(receipt.status).to.equal(1);
            const userState = await (0, core_1.genUserStateFromContract)(hardhat_1.ethers.provider, unirepContract.address, userIds[0]);
            const attestations = userState.getAttestations(epochKey);
            (0, chai_1.expect)(attestations.length).equal(2);
            (0, chai_1.expect)(attestations[1].toJSON()).equal(attestation.toJSON());
        });
        it('submit valid reputation proof event with same nullifiers', async () => {
            const epkNonce = 1;
            const spendReputation = 4;
            epoch = Number(await unirepContract.currentEpoch());
            const reputationRecords = {};
            reputationRecords[attesterId.toString()] = signUpAirdrops[userIdx];
            const nonceList = [];
            for (let i = 0; i < spendReputation; i++) {
                nonceList.push(BigInt(i));
            }
            for (let i = spendReputation; i < core_1.maxReputationBudget; i++) {
                nonceList.push(BigInt(-1));
            }
            repNullifier = (0, core_1.genReputationNullifier)(userIds[userIdx].identityNullifier, epoch, 0, attesterId);
            const userState = await (0, core_1.genUserStateFromContract)(hardhat_1.ethers.provider, unirepContract.address, userIds[userIdx]);
            const { proof, publicSignals } = await userState.genProveReputationProof(BigInt(attesterId), epkNonce, undefined, undefined, undefined, nonceList);
            const repProofInput = new contracts_1.ReputationProof(publicSignals, proof);
            const isValid = await repProofInput.verify();
            (0, chai_1.expect)(isValid).to.be.true;
            const tx = await unirepContractCalledByAttester.spendReputation(repProofInput);
            const receipt = await tx.wait();
            (0, chai_1.expect)(receipt.status).to.equal(1);
            epochKey = repProofInput.epochKey;
            const hashedProof = await unirepContract.hashReputationProof(repProofInput);
            proofIndex = Number(await unirepContract.getProofIndex(hashedProof));
        });
        it('duplicated nullifier should not update User state', async () => {
            const userState = await (0, core_1.genUserStateFromContract)(hardhat_1.ethers.provider, unirepContract.address, userIds[0]);
            const attestations = userState.getAttestations(epochKey);
            (0, chai_1.expect)(attestations.length).equal(0);
        });
        it('submit attestations to the epoch key should not update User state', async () => {
            const attestation = (0, utils_1.genRandomAttestation)();
            attestation.attesterId = BigInt(attesterId);
            const tx = await unirepContractCalledByAttester.submitAttestation(attestation, epochKey, proofIndex);
            const receipt = await tx.wait();
            (0, chai_1.expect)(receipt.status).to.equal(1);
            const userState = await (0, core_1.genUserStateFromContract)(hardhat_1.ethers.provider, unirepContract.address, userIds[0]);
            const attestations = userState.getAttestations(epochKey);
            (0, chai_1.expect)(attestations.length).equal(0);
        });
        it('submit invalid reputation proof event', async () => {
            const epkNonce = 1;
            const spendReputation = Math.ceil(Math.random() * core_1.maxReputationBudget);
            epoch = Number(await unirepContract.currentEpoch());
            const reputationRecords = {};
            reputationRecords[attesterId.toString()] = signUpAirdrops[userIdx];
            const unirepState = await (0, core_1.genUnirepStateFromContract)(hardhat_1.ethers.provider, unirepContract.address);
            const GSTree = unirepState.genGSTree(unirepState.currentEpoch);
            const circuitInputs = await (0, utils_1.genReputationCircuitInput)(userIds[userIdx], epoch, epkNonce, GSTree, userIdx, reputationRecords, Number(attesterId), spendReputation);
            circuitInputs.GST_root = (0, crypto_1.genRandomSalt)().toString();
            const { proof, publicSignals } = await (0, circuits_1.genProofAndPublicSignals)(circuits_1.Circuit.proveReputation, circuitInputs);
            const repProofInput = new contracts_1.ReputationProof(publicSignals, proof);
            const isValid = await repProofInput.verify();
            (0, chai_1.expect)(isValid).to.be.false;
            const tx = await unirepContractCalledByAttester.spendReputation(repProofInput);
            const receipt = await tx.wait();
            (0, chai_1.expect)(receipt.status).to.equal(1);
            epochKey = repProofInput.epochKey;
            const hashedProof = await unirepContract.hashReputationProof(repProofInput);
            proofIndex = Number(await unirepContract.getProofIndex(hashedProof));
        });
        it('spendReputation event should not update User state', async () => {
            const userState = await (0, core_1.genUserStateFromContract)(hardhat_1.ethers.provider, unirepContract.address, userIds[0]);
            const attestations = userState.getAttestations(epochKey);
            (0, chai_1.expect)(attestations.length).equal(0);
        });
        it('submit attestations to the epoch key should not update Unirep state', async () => {
            const attestation = (0, utils_1.genRandomAttestation)();
            attestation.attesterId = BigInt(attesterId);
            const tx = await unirepContractCalledByAttester.submitAttestation(attestation, epochKey, proofIndex);
            const receipt = await tx.wait();
            (0, chai_1.expect)(receipt.status).to.equal(1);
            const userState = await (0, core_1.genUserStateFromContract)(hardhat_1.ethers.provider, unirepContract.address, userIds[0]);
            const attestations = userState.getAttestations(epochKey);
            (0, chai_1.expect)(attestations.length).equal(0);
        });
        it('submit valid reputation proof with wrong GST root event', async () => {
            const epkNonce = 1;
            const ZERO_VALUE = 0;
            const reputationRecords = {};
            reputationRecords[attesterId.toString()] = signUpAirdrops[userIdx];
            const userStateTree = await (0, utils_1.genNewUserStateTree)();
            for (const attester of Object.keys(reputationRecords)) {
                await userStateTree.update(BigInt(attester), reputationRecords[attester].hash());
            }
            const GSTree = new crypto_1.IncrementalQuinTree(core_1.circuitGlobalStateTreeDepth, ZERO_VALUE, 2);
            const id = (0, crypto_1.genIdentity)();
            const commitment = (0, crypto_1.genIdentityCommitment)(id);
            const stateRoot = userStateTree.getRootHash();
            const leafIndex = 0;
            const hashedStateLeaf = (0, crypto_1.hashLeftRight)(commitment, stateRoot);
            GSTree.insert(BigInt(hashedStateLeaf.toString()));
            const circuitInputs = await (0, utils_1.genReputationCircuitInput)(id, epoch, epkNonce, GSTree, leafIndex, reputationRecords, BigInt(attesterId));
            const { proof, publicSignals } = await (0, circuits_1.genProofAndPublicSignals)(circuits_1.Circuit.proveReputation, circuitInputs);
            const repProofInput = new contracts_1.ReputationProof(publicSignals, proof);
            const isValid = await repProofInput.verify();
            (0, chai_1.expect)(isValid).to.be.true;
            const tx = await unirepContractCalledByAttester.spendReputation(repProofInput);
            const receipt = await tx.wait();
            (0, chai_1.expect)(receipt.status).to.equal(1);
            epochKey = repProofInput.epochKey;
            const hashedProof = await unirepContract.hashReputationProof(repProofInput);
            proofIndex = Number(await unirepContract.getProofIndex(hashedProof));
        });
        it('spendReputation event should not update Unirep state', async () => {
            const userState = await (0, core_1.genUserStateFromContract)(hardhat_1.ethers.provider, unirepContract.address, userIds[0]);
            const attestations = userState.getAttestations(epochKey);
            (0, chai_1.expect)(attestations.length).equal(0);
        });
        it('submit attestations to the epoch key should not update Unirep state', async () => {
            const attestation = (0, utils_1.genRandomAttestation)();
            attestation.attesterId = BigInt(attesterId);
            const tx = await unirepContractCalledByAttester.submitAttestation(attestation, epochKey, proofIndex);
            const receipt = await tx.wait();
            (0, chai_1.expect)(receipt.status).to.equal(1);
            const userState = await (0, core_1.genUserStateFromContract)(hardhat_1.ethers.provider, unirepContract.address, userIds[0]);
            const attestations = userState.getAttestations(epochKey);
            (0, chai_1.expect)(attestations.length).equal(0);
        });
        it('submit valid reputation proof event in wrong epoch should fail', async () => {
            const epkNonce = 1;
            const spendReputation = Math.floor(Math.random() * core_1.maxReputationBudget);
            const wrongEpoch = epoch + 1;
            const reputationRecords = {};
            reputationRecords[attesterId.toString()] = signUpAirdrops[userIdx];
            const unirepState = await (0, core_1.genUnirepStateFromContract)(hardhat_1.ethers.provider, unirepContract.address);
            const GSTree = unirepState.genGSTree(unirepState.currentEpoch);
            const circuitInputs = await (0, utils_1.genReputationCircuitInput)(userIds[userIdx], wrongEpoch, epkNonce, GSTree, userIdx, reputationRecords, Number(attesterId), spendReputation);
            const { proof, publicSignals } = await (0, circuits_1.genProofAndPublicSignals)(circuits_1.Circuit.proveReputation, circuitInputs);
            const repProofInput = new contracts_1.ReputationProof(publicSignals, proof);
            const isValid = await repProofInput.verify();
            (0, chai_1.expect)(isValid).to.be.true;
            await (0, chai_1.expect)(unirepContractCalledByAttester.spendReputation(repProofInput))
                .to.be.revertedWith('Unirep: submit a reputation proof with incorrect epoch');
        });
    });
});