// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@account-abstraction/contracts/interfaces/IAccount.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

/**
 * @title xPayVault
 * @notice An ERC-4337 Smart Account for AI Agent micro-payments.
 * @dev Implements:
 * 1. Account Abstraction (ERC-4337): Programmable sovereignty and gas abstraction.
 * 2. Agent Spend Mandates: Session keys for AI agents with strict guardrails.
 * 3. Pre-paid Escrow: Holds USDC/$0G for automated settlement.
 * 4. Machine-to-Machine (M2M) Pull Payments: Providers pull funds via cryptographic agent proof.
 */
contract xPayVault is IAccount, Ownable, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // --- State Variables ---

    IEntryPoint public immutable entryPoint;
    address public agentRegistry; // ERC-7857 iNFT Registry
    IERC20 public settlementToken; // The currency used for payments (e.g., USDC)

    struct Session {
        address agentSignerKey; // The temporary key used by the AI agent
        uint256 expiresAt; // Time-bound session expiry
        uint256 maxSpendLimit; // Total budget for this session
        uint256 currentSpend; // Amount already spent
        bool isRevoked; // Immediate kill-switch
    }

    // Mapping from Agent ID to their active Session
    mapping(uint256 => Session) public agentSessions;

    // Mapping for verified vendors (0G Compute/Storage nodes)
    mapping(address => bool) public verifiedVendors;

    // --- Events ---

    event SessionAuthorized(
        uint256 indexed agentId,
        address agentKey,
        uint256 limit,
        uint256 expiry
    );
    event SessionRevoked(uint256 indexed agentId);
    event AgentPaymentExecuted(
        uint256 indexed agentId,
        address indexed vendor,
        uint256 amount,
        bytes32 storageRoot
    );
    event VendorWhitelisted(address indexed vendor, bool status);

    // --- Modifiers ---

    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint), "Caller is not EntryPoint");
        _;
    }

    constructor(
        IEntryPoint _entryPoint,
        address _agentRegistry,
        IERC20 _settlementToken
    ) Ownable(msg.sender) {
        entryPoint = _entryPoint;
        agentRegistry = _agentRegistry;
        settlementToken = _settlementToken;
    }

    // --- ERC-4337: Account Abstraction Functions ---

    /**
     * @dev Validates the signature for a UserOperation.
     * This allows the EntryPoint to execute transactions on behalf of this wallet.
     * It enables gas abstraction (paying for gas in tokens via a paymaster).
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override onlyEntryPoint returns (uint256 validationData) {
        // Validate signature
        // For simplicity, we only allow the owner to sign UserOperations directly.
        // Agents use the 'claimM2MPayment' flow or specialized session execution.
        if (
            owner() !=
            userOpHash.toEthSignedMessageHash().recover(userOp.signature)
        ) {
            return 1; // SIG_VALIDATION_FAILED
        }

        // Prefund the EntryPoint if required
        if (missingAccountFunds > 0) {
            (bool success, ) = payable(msg.sender).call{
                value: missingAccountFunds,
                gas: type(uint256).max
            }("");
            (success);
        }

        return 0; // SUCCESS
    }

    /**
     * @dev Generic execution function for the EntryPoint.
     */
    function execute(
        address dest,
        uint256 value,
        bytes calldata func
    ) external onlyEntryPoint {
        (bool success, bytes memory result) = dest.call{value: value}(func);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    // --- Agent Spend Mandates (The Guardrail) ---

    /**
     * @notice Authorizes a temporary Session Key for an AI Agent.
     * @param agentId The unique ID of the agent (ERC-7857).
     * @param agentKey The temporary public key provided by the AI agent.
     * @param limit Maximum amount of settlementToken the agent can authorize.
     * @param duration How many seconds the session is valid (e.g., 86400 for 24h).
     */
    function authorizeSession(
        uint256 agentId,
        address agentKey,
        uint256 limit,
        uint256 duration
    ) external onlyOwner {
        agentSessions[agentId] = Session({
            agentSignerKey: agentKey,
            expiresAt: block.timestamp + duration,
            maxSpendLimit: limit,
            currentSpend: 0,
            isRevoked: false
        });
        emit SessionAuthorized(
            agentId,
            agentKey,
            limit,
            block.timestamp + duration
        );
    }

    /**
     * @notice Instantly revokes an agent's access to the wallet.
     */
    function revokeSession(uint256 agentId) external onlyOwner {
        agentSessions[agentId].isRevoked = true;
        emit SessionRevoked(agentId);
    }

    // --- Machine-to-Machine (x402) Pull Payments ---

    /**
     * @notice Allows a service provider (vendor) to pull payment from the vault.
     * @dev Requires a cryptographic proof (signature) from the authorized AI Agent.
     * @param agentId The ID of the agent that authorized the spend.
     * @param amount The amount of tokens to pull.
     * @param storageRoot The Merkle Root of the work/logs on 0G Storage.
     * @param signature The signature from the Agent's Session Key.
     */
    function claimM2MPayment(
        uint256 agentId,
        uint256 amount,
        bytes32 storageRoot,
        bytes calldata signature
    ) external nonReentrant {
        Session storage session = agentSessions[agentId];

        // 1. Guardrail Checks
        require(!session.isRevoked, "Session revoked");
        require(block.timestamp <= session.expiresAt, "Session expired");
        require(
            session.currentSpend + amount <= session.maxSpendLimit,
            "Budget exceeded"
        );

        // 2. Cryptographic Proof Verification (Machine-to-Machine)
        // The hash includes the contract address to prevent replay attacks across different wallets.
        bytes32 messageHash = keccak256(
            abi.encodePacked(address(this), agentId, amount, storageRoot)
        );
        address signer = messageHash.toEthSignedMessageHash().recover(
            signature
        );

        require(signer == session.agentSignerKey, "Invalid agent signature");

        // 3. Update Session State
        session.currentSpend += amount;

        // 4. Token Settlement (Pull Payment)
        require(
            settlementToken.transfer(msg.sender, amount),
            "Token transfer failed"
        );

        // 5. 0G Storage Commitment
        // We log the storageRoot as a permanent proof of the task the payment was for.
        emit AgentPaymentExecuted(agentId, msg.sender, amount, storageRoot);
    }

    // --- Management Functions ---

    function setVendorWhitelist(
        address vendor,
        bool status
    ) external onlyOwner {
        verifiedVendors[vendor] = status;
        emit VendorWhitelisted(vendor, status);
    }

    function setSettlementToken(IERC20 _token) external onlyOwner {
        settlementToken = _token;
    }

    /**
     * @dev Allows the owner to deposit native funds (if needed for gas) or ERC20 tokens.
     */
    function deposit() external payable {}

    receive() external payable {}

    /**
     * @dev Emergency withdrawal for the vault owner.
     */
    function withdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(msg.sender).transfer(amount);
        } else {
            IERC20(token).transfer(msg.sender, amount);
        }
    }
}
