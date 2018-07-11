pragma solidity 0.4.24;
import "./DailyLimitModule.sol";
import "../Enum.sol";
import "../PayingModule.sol";
import "../OwnerManager.sol";
import "../SignatureValidator.sol";


/// @title Paying Daily Limit Module - Allows to transfer limited amounts of ERC20 tokens and Ether without confirmations.
/// @author Richard Meissner - <richard@gnosis.pm>
contract PayingDailyLimitModule is PayingModule, DailyLimitModule, SignatureValidator {

    string public constant NAME = "Daily Limit Module";
    string public constant VERSION = "0.0.1";


    function verify(bytes32 txHash, bytes signatures) 
        external 
        returns ( bool )
    {
        // We only check the first signaturer
        return OwnerManager(manager).isOwner(recoverKey(txHash, signatures, 0));
    }
    
    function pay(address gasToken, uint256 amount) 
        external 
        returns ( bool )
    {
        // solium-disable-next-line security/no-tx-origin
        executeDailyLimit(gasToken, tx.origin, amount);
        return true;
    }
}
