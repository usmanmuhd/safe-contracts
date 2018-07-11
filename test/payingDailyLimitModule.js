const utils = require('./utils')
const safeUtils = require('./utilsPersonalSafe')
const solc = require('solc')

const GnosisSafe = artifacts.require("./GnosisSafePersonalEdition.sol");
const CreateAndAddModules = artifacts.require("./libraries/CreateAndAddModules.sol");
const ProxyFactory = artifacts.require("./ProxyFactory.sol");
const DailyLimitModule = artifacts.require("./modules/PayingDailyLimitModule.sol");


contract('PayingDailyLimitModule', function(accounts) {

    let gnosisSafe
    let dailyLimitModule
    let lw

    let executor = accounts[8]
    const CALL = 0

    beforeEach(async function () {
        // Create lightwallet
        lw = await utils.createLightwallet()
        // Create Master Copies
        let proxyFactory = await ProxyFactory.new()
        let createAndAddModules = await CreateAndAddModules.new()
        let gnosisSafeMasterCopy = await GnosisSafe.new()
        // Initialize safe master copy
        gnosisSafeMasterCopy.setup([accounts[0]], 1, 0, "0x")
        let dailyLimitModuleMasterCopy = await DailyLimitModule.new()
        // Initialize module master copy
        dailyLimitModuleMasterCopy.setup([], [])
        // Create Gnosis Safe and Daily Limit Module in one transactions
        let moduleData = await dailyLimitModuleMasterCopy.contract.setup.getData([0], [web3.toWei(0.5, 'ether')])
        let proxyFactoryData = await proxyFactory.contract.createProxy.getData(dailyLimitModuleMasterCopy.address, moduleData)
        let modulesCreationData = utils.createAndAddModulesData([proxyFactoryData])
        let createAndAddModulesData = createAndAddModules.contract.createAndAddModules.getData(proxyFactory.address, modulesCreationData)
        let gnosisSafeData = await gnosisSafeMasterCopy.contract.setup.getData([lw.accounts[0], lw.accounts[1], accounts[0]], 2, createAndAddModules.address, createAndAddModulesData)
        gnosisSafe = utils.getParamFromTxEvent(
            await proxyFactory.createProxy(gnosisSafeMasterCopy.address, gnosisSafeData),
            'ProxyCreation', 'proxy', proxyFactory.address, GnosisSafe, 'create Gnosis Safe and Daily Limit Module',
        )
        let modules = await gnosisSafe.getModules()
        dailyLimitModule = DailyLimitModule.at(modules[0])
        assert.equal(await dailyLimitModule.manager.call(), gnosisSafe.address)
    })

    it('should withdraw daily limit', async () => {
        let execData = dailyLimitModule.contract.executeDailyLimit.getData(0, accounts[0], 50)

        // Deposit 1 eth
        await web3.eth.sendTransaction({from: accounts[0], to: gnosisSafe.address, value: web3.toWei(1, 'ether')})
        assert.equal(await web3.eth.getBalance(gnosisSafe.address).toNumber(), web3.toWei(1, 'ether'));
        // Withdraw daily limit
        await safeUtils.executeTransaction(
            lw, gnosisSafe, 'execTransactionFromModule withdraw daily limit 1st time', [lw.accounts[0]], dailyLimitModule.address, 0, execData, CALL, executor, 
            0, false, gnosisSafe.execTransactionAndPaySubmitterViaModule
        )
        await safeUtils.executeTransaction(
            lw, gnosisSafe, 'execTransactionFromModule withdraw daily limit 2nd time', [lw.accounts[0]], dailyLimitModule.address, 0, execData, CALL, executor, 
            0, false, gnosisSafe.execTransactionAndPaySubmitterViaModule
        )
    })
});
