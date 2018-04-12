pragma solidity 0.4.19;
import "../Extension.sol";
import "../GnosisSafe.sol";


/// @title Single Account Recovery Extension - Allows to replace an owner without Safe confirmations if a triggered by a dedicated account. This action will have some delay.
/// @author Richard Meissner - <richard@gnosis.pm>
contract SingleAccountRecoveryExtension is Extension {

    string public constant NAME = "Single Account Recovery Extension";
    string public constant VERSION = "0.0.1";
    bytes4 public constant REPLACE_OWNER_FUNCTION_IDENTIFIER = hex"54e99c6e";
    uint8 public constant ACTION_COMPLETE_RECOVERY = 0;
    uint8 public constant ACTION_TRIGGER_RECOVERY = 1;
    uint8 public constant ACTION_CANCEL_RECOVERY = 8;

    SingleAccountRecoveryExtension public masterCopy;
    GnosisSafe public gnosisSafe;
    uint64 public timeout;
    address public recoverer;

    uint public nonce;
    uint public triggerTime;
    uint public ownerToReplaceIndex;
    address public ownerToReplaceAddress;
    address public newOwnerAddress;

    modifier onlyGnosisSafe() {
        require(msg.sender == address(gnosisSafe));
        _;
    }

    /// @dev Constructor function triggers setup function.
    function SingleAccountRecoveryExtension(address _recoverer, uint64 _timeout)
        public
    {
        setup(_recoverer, _timeout);
    }

    /// @dev Setup function sets initial storage of contract.
    function setup(address _recoverer, uint64 _timeout)
        public
    {
        // gnosisSafe can only be 0 at initalization of contract.
        // Check ensures that setup function can only be called once.
        require(address(gnosisSafe) == 0);
        require(_recoverer != 0);
        gnosisSafe = GnosisSafe(msg.sender);
        recoverer = _recoverer;
        timeout = _timeout;
    }

    /// @dev Allows to upgrade the contract. This can only be done via a Safe transaction.
    /// @param _masterCopy New contract address.
    function changeMasterCopy(SingleAccountRecoveryExtension _masterCopy)
        public
        onlyGnosisSafe
    {
        require(address(_masterCopy) != 0);
        masterCopy = _masterCopy;
    }

    /// @dev Starts the recovery process
    /// @param _oldOwnerIndex index of the owner that should be replaced
    /// @param _oldOwner address of the owner that should be replaced
    /// @param _newOwner address of the new owner
    /// @param v part of the signature (calculated on the hash of the replace data prefixed with the action integer ACTION_TRIGGER_RECOVERY)
    /// @param r part of the signature (calculated on the hash of the replace data prefixed with the action integer ACTION_TRIGGER_RECOVERY)
    /// @param s part of the signature (calculated on the hash of the replace data prefixed with the action integer ACTION_TRIGGER_RECOVERY)
    function triggerRecovery(uint256 _oldOwnerIndex, address _oldOwner, address _newOwner, uint8 v, bytes32 r, bytes32 s)
        public
    {
        require(triggerTime == 0);
        require(recoverer == ecrecover(getDataHash(ACTION_TRIGGER_RECOVERY, nonce, _oldOwnerIndex, _oldOwner, _newOwner), v, r, s));
        nonce += 1;
        triggerTime = now;
        ownerToReplaceIndex = _oldOwnerIndex;
        ownerToReplaceAddress = _oldOwner;
        newOwnerAddress = _newOwner;
    }

    /// @dev Cancels the recovery process
    /// @param v part of the signature (calculated on the hash of the replace data prefixed with the action integer ACTION_CANCEL_RECOVERY)
    /// @param r part of the signature (calculated on the hash of the replace data prefixed with the action integer ACTION_CANCEL_RECOVERY)
    /// @param s part of the signature (calculated on the hash of the replace data prefixed with the action integer ACTION_CANCEL_RECOVERY)
    function cancelRecovery(uint8 v, bytes32 r, bytes32 s)
        public
    {
        require(triggerTime > 0);
        require(recoverer == ecrecover(getDataHash(ACTION_CANCEL_RECOVERY, nonce, ownerToReplaceIndex, ownerToReplaceAddress, newOwnerAddress), v, r, s));
        nonce += 1;
        triggerTime = 0;
        ownerToReplaceIndex = 0;
        ownerToReplaceAddress = address(0);
        newOwnerAddress = address(0);
    }

    /// @dev Completes the recovery process and replaces the owner. This can be triggered by anyone.
    /// @param data data of the replace transaction executed on the safe
    function completeRecovery(bytes data)
        public
    {
        require(triggerTime > 0 && (triggerTime + timeout * 1 seconds) <= now);
        require(keccak256(uint8(ACTION_COMPLETE_RECOVERY), nonce, data) == getDataHash(ACTION_COMPLETE_RECOVERY, nonce, ownerToReplaceIndex, ownerToReplaceAddress, newOwnerAddress));
        triggerTime = 0;
        ownerToReplaceIndex = 0;
        ownerToReplaceAddress = address(0);
        newOwnerAddress = address(0);
        gnosisSafe.executeExtension(address(gnosisSafe), 0, data, GnosisSafe.Operation.Call, this);
    }

    /// @dev Returns if Safe transaction is a valid owner replacement transaction.
    /// @param sender Friend's address.
    /// @param to Gnosis Safe address.
    /// @param value No Ether should be send.
    /// @param data Encoded owner replacement transaction.
    /// @param operation Only Call operations are allowed.
    /// @return Returns if transaction can be executed.
    function isExecutable(address sender, address to, uint256 value, bytes data, GnosisSafe.Operation operation)
        public
        onlyGnosisSafe
        returns (bool)
    {
        return this == sender;
    }

    /// @dev Returns hash of data encoding owner replacement.
    /// @param action integer indicating the action. This is used to avoid possible reuse of the hash for different actions
    /// @param oldOwnerIndex index of the owner that should be replaced
    /// @param oldOwner address of the owner that should be replaced
    /// @param newOwner address of the new owner
    /// @return Data hash.
    function getDataHash(uint8 action, uint nonce, uint256 oldOwnerIndex, address oldOwner, address newOwner)
        public
        view
        returns (bytes32)
    {
        return keccak256(action, nonce, REPLACE_OWNER_FUNCTION_IDENTIFIER, bytes32(oldOwnerIndex), bytes32(oldOwner), bytes32(newOwner));
    }
}
