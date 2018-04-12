const utils = require('./utils')
const { wait } = require('@digix/tempo')(web3);

const CreateAndAddExtension = artifacts.require("./libraries/CreateAndAddExtension.sol");
const ProxyFactory = artifacts.require("./ProxyFactory.sol");
const GnosisSafe = artifacts.require("./GnosisSafe.sol");
const SingleAccountRecoveryExtension = artifacts.require("./SingleAccountRecoveryExtension.sol");


contract('SingleAccountRecoveryExtension', function(accounts) {

    let gnosisSafe
    let proxyFactory
    let recoveryExtension
    let lw

    const CALL = 0
    const DELEGATECALL = 1

    beforeEach(async function () {
        // Create lightwallet
        lw = await utils.createLightwallet()
        // Create Master Copies
        proxyFactory = await ProxyFactory.new()
        let gnosisSafeMasterCopy = await GnosisSafe.new([accounts[0], accounts[1]], 2, 0, 0)
        let gnosisSafeData = await gnosisSafeMasterCopy.contract.setup.getData([accounts[0]], 1, 0, "")
        gnosisSafe = utils.getParamFromTxEvent(
            await proxyFactory.createProxy(gnosisSafeMasterCopy.address, gnosisSafeData),
            'ProxyCreation', 'proxy', proxyFactory.address, GnosisSafe, 'create Gnosis Safe',
        )

        let createAndAddExtension = await CreateAndAddExtension.new()
        let recoveryExtensionMasterCopy = await SingleAccountRecoveryExtension.new(accounts[0], 0)
        let extensionData = await recoveryExtensionMasterCopy.contract.setup.getData(lw.accounts[2], 1000)

        let proxyFactoryData = await proxyFactory.contract.createProxy.getData(recoveryExtensionMasterCopy.address, extensionData)
        let data = createAndAddExtension.contract.createAndAddExtension.getData(proxyFactory.address, proxyFactoryData)

        let nonce = await gnosisSafe.nonce.call()
        let transactionHash = await gnosisSafe.getTransactionHash.call(createAndAddExtension.address, 0, data, DELEGATECALL, nonce)
        utils.logGasUsage(
            'executeTransaction create and add extension',
            await gnosisSafe.executeTransaction(
                createAndAddExtension.address, 0, data, DELEGATECALL, [], [], [], [accounts[0]], [0]
            )
        )

        let extensions = await gnosisSafe.getExtensions()
        recoveryExtension = SingleAccountRecoveryExtension.at(extensions[0])
        assert.equal(await recoveryExtension.gnosisSafe(), gnosisSafe.address)
    })

    it('should replace owner after challenge period', async () => {
        let triggerRecoveryNonce = await recoveryExtension.nonce()
        let triggerRecoveryHash = await recoveryExtension.getDataHash(1, triggerRecoveryNonce, 0, accounts[0], accounts[1])
        let triggerRecoverySigs = utils.signTransaction(lw, [lw.accounts[2]], triggerRecoveryHash)
        let triggerRecoveryData = await gnosisSafe.contract.replaceOwner.getData(0, accounts[0], accounts[1])
        utils.logGasUsage(
            'executeTransaction to trigger recovery',
            await recoveryExtension.triggerRecovery(0, accounts[0], accounts[1], triggerRecoverySigs.sigV[0], triggerRecoverySigs.sigR[0], triggerRecoverySigs.sigS[0])
        )
        assert.notEqual(await recoveryExtension.triggerTime(), 0)

        assert.deepEqual(await gnosisSafe.getOwners(), [accounts[0]])
        // Execution fails, because challenge period is not yet over
        await utils.assertRejects(
            recoveryExtension.completeRecovery(triggerRecoveryData),
            "Challenge period is not over yet"
        )
        await wait(1000, 1)
        utils.logGasUsage(
            'executeTransaction to complete recovery (and replace owner)',
            await recoveryExtension.completeRecovery(triggerRecoveryData)
        )
        assert.deepEqual(await gnosisSafe.getOwners(), [accounts[1]])

        await utils.assertRejects(
            recoveryExtension.triggerRecovery(0, accounts[0], accounts[1], triggerRecoverySigs.sigV[0], triggerRecoverySigs.sigR[0], triggerRecoverySigs.sigS[0]),
            "Should not be able to reuse same signature again"
        )
    })

    it('should start recovery flow and abort', async () => {
        let cancelRecoveryNonce = await recoveryExtension.nonce()
        let cancelRecoveryHash = await recoveryExtension.getDataHash(8, cancelRecoveryNonce, 0, accounts[0], accounts[1])
        let cancelRecoverySigs = utils.signTransaction(lw, [lw.accounts[2]], cancelRecoveryHash)
        await utils.assertRejects(
            recoveryExtension.cancelRecovery(cancelRecoverySigs.sigV[0], cancelRecoverySigs.sigR[0], cancelRecoverySigs.sigS[0]),
            "Cannot cancel if no recovery was started"
        )

        let triggerRecoveryNonce = await recoveryExtension.nonce()
        let triggerRecoveryHash = await recoveryExtension.getDataHash(1, triggerRecoveryNonce, 0, accounts[0], accounts[1])
        let triggerRecoverySigs = utils.signTransaction(lw, [lw.accounts[2]], triggerRecoveryHash)
        let triggerRecoveryData = await gnosisSafe.contract.replaceOwner.getData(0, accounts[0], accounts[1])
        utils.logGasUsage(
            'executeTransaction to trigger recovery',
            await recoveryExtension.triggerRecovery(0, accounts[0], accounts[1], triggerRecoverySigs.sigV[0], triggerRecoverySigs.sigR[0], triggerRecoverySigs.sigS[0])
        )
        assert.notEqual(await recoveryExtension.triggerTime(), 0)

        // Nonce changed we need to generate a new signature to cancel
        cancelRecoveryNonce = await recoveryExtension.nonce()
        cancelRecoveryHash = await recoveryExtension.getDataHash(8, cancelRecoveryNonce, 0, accounts[0], accounts[1])
        cancelRecoverySigs = utils.signTransaction(lw, [lw.accounts[2]], cancelRecoveryHash)
        utils.logGasUsage(
            'executeTransaction to cancel recovery',
            await recoveryExtension.cancelRecovery(cancelRecoverySigs.sigV[0], cancelRecoverySigs.sigR[0], cancelRecoverySigs.sigS[0])
        )
        assert.equal(await recoveryExtension.triggerTime(), 0)
    })

    it('should not be able to trigger extension via executeExtension', async () => {
        let triggerRecoveryData = await gnosisSafe.contract.replaceOwner.getData(0, accounts[0], accounts[1])
        await utils.assertRejects(
            gnosisSafe.executeExtension(gnosisSafe.address, 0, triggerRecoveryData, CALL, recoveryExtension.address),
            'Execution via executeExtension should fail'
        )
        assert.equal(await recoveryExtension.triggerTime(), 0)
    })
});
