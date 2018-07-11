pragma solidity 0.4.24;
import "./Module.sol";


/// @title PayingModule - Module that can be used to pay for transactions
/// @author Richard Meissner - <richard@gnosis.pm>
contract PayingModule is Module {
    function verify(bytes32 txHash, bytes signatures) external returns ( bool );
    function pay(address gasToken, uint256 amount) external returns ( bool );
}
