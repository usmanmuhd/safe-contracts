var SingleAccountRecoveryExtension = artifacts.require("./SingleAccountRecoveryExtension.sol");


const notOwnedAddress = "0x0000000000000000000000000000000000000001"

module.exports = function(deployer) {
    deployer.deploy(SingleAccountRecoveryExtension, notOwnedAddress, 0);
}
